import { SessionStore } from './store.js';
import { GitOps } from './git.js';
import { AmpAdapter, type AmpAdapterConfig } from './amp.js';
import type { Session, SessionCreateOptions, IterationRecord, PreflightResult, SquashOptions, RebaseResult, MergeOptions } from '@ampsm/types';
import { mkdir, writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { spawn } from 'child_process';
import { homedir } from 'os';

export class WorktreeManager {
  private ampAdapter: AmpAdapter;

  constructor(
    private store: SessionStore,
    private dbPath?: string
  ) {
    this.ampAdapter = new AmpAdapter(this.loadAmpConfig());
  }

  async createSession(options: SessionCreateOptions): Promise<Session> {
    const git = new GitOps(options.repoRoot);
    
    // Validate repo
    const isRepo = await git.isRepo();
    if (!isRepo) {
      throw new Error(`${options.repoRoot} is not a git repository`);
    }

    // Create session in store
    const session = this.store.createSession(options);

    try {
      // Create worktree directory
      await mkdir(session.worktreePath, { recursive: true });
      
      // Create branch and worktree
      await git.createWorktree(session.branchName, session.worktreePath, session.baseBranch);

      // Initialize AGENT_CONTEXT directory
      const contextDir = join(session.worktreePath, 'AGENT_CONTEXT');
      await mkdir(contextDir, { recursive: true });

      // Create context files
      await writeFile(
        join(contextDir, 'SESSION.md'), 
        this.generateSessionContext(session)
      );
      
      await writeFile(
        join(contextDir, 'DIFF_SUMMARY.md'),
        'No changes since last iteration.\n'
      );

      await writeFile(
        join(contextDir, 'ITERATION_LOG.md'),
        `# Iteration Log for ${session.name}\n\nSession created at ${session.createdAt}\n\n`
      );

      await writeFile(
        join(contextDir, 'LAST_STATUS.json'),
        JSON.stringify({ status: 'idle', lastUpdate: session.createdAt }, null, 2)
      );

      // Initial commit
      const commitSha = await git.commitChanges('amp: initialize agent context for session', session.worktreePath);
      
      if (commitSha) {
        console.log(`✓ Session created with initial commit: ${commitSha.slice(0, 8)}`);
      }

      return session;
    } catch (error) {
      // Cleanup on failure
      try {
        await git.removeWorktree(session.worktreePath, session.branchName);
      } catch (cleanupError) {
        console.warn('Failed to cleanup worktree:', cleanupError);
      }
      throw error;
    }
  }

  async iterate(sessionId: string, notes?: string): Promise<void> {
    const session = this.store.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Create iteration record
    const iteration = this.store.createIteration(sessionId);
    
    this.store.updateSessionStatus(sessionId, 'running');

    try {
      const git = new GitOps(session.repoRoot);
      
      // Update diff summary
      const diff = await git.getDiff(session.worktreePath);
      const contextDir = join(session.worktreePath, 'AGENT_CONTEXT');
      
      await writeFile(
        join(contextDir, 'DIFF_SUMMARY.md'),
        diff || 'No changes since last iteration.\n'
      );

      // Update session context
      await writeFile(
        join(contextDir, 'SESSION.md'),
        this.generateSessionContext(session)
      );

      // Run Amp iteration
      console.log('Running Amp iteration...');
      const iterationPrompt = notes || session.ampPrompt;
      const result = await this.ampAdapter.runIteration(
        iterationPrompt, 
        session.worktreePath, 
        session.modelOverride,
        sessionId
      );

      // Handle oracle consultation if needed
      if (result.output.toLowerCase().includes('consult the oracle')) {
        console.log('Oracle consultation requested...');
        const oracleResult = await this.ampAdapter.consultOracle(
          'Analyze the current implementation and provide guidance',
          session.worktreePath,
          result.output
        );
        
        // Log oracle consultation
        const iterationLogPath = join(contextDir, 'ITERATION_LOG.md');
        const oracleEntry = `\n### Oracle Consultation\nTimestamp: ${new Date().toISOString()}\nQuery: Analyze implementation and provide guidance\nResponse:\n${oracleResult.output}\n\n`;
        const existingLog = await readFile(iterationLogPath, 'utf-8').catch(() => '');
        await writeFile(iterationLogPath, existingLog + oracleEntry);
      }

      // Update status based on Amp result
      let finalStatus: Session['status'];
      if (result.awaitingInput) {
        finalStatus = 'awaiting-input';
      } else if (!result.success) {
        finalStatus = 'error';
      } else {
        finalStatus = 'idle';
      }

      // Check for changes and commit if necessary
      const hasChanges = await git.hasChanges(session.worktreePath);
      let commitSha: string | undefined;
      let changedFiles = 0;

      if (hasChanges) {
        const changedFilesList = await git.getChangedFiles(session.worktreePath);
        changedFiles = changedFilesList.length;
        
        // Auto-commit if amp made changes
        const commitResult = await git.commitChanges('amp: iteration changes', session.worktreePath);
        commitSha = commitResult || undefined;
        
        console.log(`✓ Committed ${changedFiles} changed files: ${commitSha?.slice(0, 8)}`);
      } else {
        console.log('No changes to commit');
      }

      // Run script if configured
      let testResult: 'pass' | 'fail' | undefined;
      let testExitCode: number | undefined;
      
      if (session.scriptCommand && commitSha) {
        console.log(`Running test script: ${session.scriptCommand}`);
        const scriptResult = await this.runScript(session.scriptCommand, session.worktreePath);
        testResult = scriptResult.exitCode === 0 ? 'pass' : 'fail';
        testExitCode = scriptResult.exitCode;
        
        console.log(`Script result: ${testResult} (exit code: ${testExitCode})`);
        
        if (testResult === 'fail') {
          finalStatus = 'awaiting-input';
        }
      }

      // Update iteration with telemetry and save tool calls
      this.store.finishIteration(iteration.id, result.telemetry, commitSha || undefined, changedFiles);
      
      // Save tool calls with correct sessionId
      result.telemetry.toolCalls.forEach(toolCall => {
        this.store.saveToolCall({
          id: randomUUID(),
          sessionId: sessionId,
          iterationId: iteration.id,
          timestamp: toolCall.timestamp,
          toolName: toolCall.toolName,
          argsJson: JSON.stringify(toolCall.args),
          success: toolCall.success,
          durationMs: toolCall.durationMs
        });
      });
      
      // Update session status
      this.store.updateSessionStatus(sessionId, finalStatus);

      // Print summary
      console.log(`\n✓ Iteration completed:`);
      console.log(`  - Status: ${finalStatus}`);
      console.log(`  - Changed files: ${changedFiles}`);
      if (result.telemetry.totalTokens) {
        console.log(`  - Tokens used: ${result.telemetry.totalTokens}`);
      }
      if (result.telemetry.model) {
        console.log(`  - Model: ${result.telemetry.model}`);
      }
      console.log(`  - Tools used: ${result.telemetry.toolCalls.length}`);
      
      if (result.telemetry.toolCalls.length > 0) {
        const toolSummary = result.telemetry.toolCalls
          .reduce((acc, tool) => {
            acc[tool.toolName] = (acc[tool.toolName] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);
        
        console.log('    Tool breakdown:', Object.entries(toolSummary).map(([tool, count]) => `${tool}(${count})`).join(', '));
      }

    } catch (error) {
      this.store.updateSessionStatus(sessionId, 'error');
      throw error;
    }
  }

  async squash(sessionId: string, message: string): Promise<void> {
    const session = this.store.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const git = new GitOps(session.repoRoot);
    
    // Use soft reset approach to squash commits
    await git.exec(['reset', '--soft', session.baseBranch], session.worktreePath);
    
    const commitSha = await git.commitChanges(message, session.worktreePath);
    
    if (commitSha) {
      console.log(`✓ Squashed session commits into: ${commitSha.slice(0, 8)}`);
    }
  }

  async rebase(sessionId: string, onto: string): Promise<void> {
    const session = this.store.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const git = new GitOps(session.repoRoot);
    
    // Fetch and rebase
    await git.exec(['fetch', '--all', '--prune'], session.worktreePath);
    const result = await git.exec(['rebase', onto], session.worktreePath);
    
    if (result.exitCode !== 0) {
      // Write conflict help
      const contextDir = join(session.worktreePath, 'AGENT_CONTEXT');
      await writeFile(
        join(contextDir, 'REBASE_HELP.md'),
        `# Rebase Conflicts\n\nRebase onto ${onto} failed with conflicts.\n\nConflicted files:\n${result.stderr}\n\nResolve conflicts manually and run:\n\`\`\`\ngit rebase --continue\n\`\`\`\n`
      );
      
      throw new Error(`Rebase conflicts detected. See AGENT_CONTEXT/REBASE_HELP.md for guidance.`);
    }

    console.log(`✓ Successfully rebased onto ${onto}`);
  }

  private generateSessionContext(session: Session): string {
    return `# Session: ${session.name}

## Goal
${session.ampPrompt}

## Configuration
- Repository: ${session.repoRoot}
- Base Branch: ${session.baseBranch}
- Branch: ${session.branchName}
- Worktree: ${session.worktreePath}
- Status: ${session.status}
${session.scriptCommand ? `- Test Script: ${session.scriptCommand}` : ''}
${session.modelOverride ? `- Model Override: ${session.modelOverride}` : ''}

## Notes
${session.notes || 'No notes'}

## Created
${session.createdAt}
${session.lastRun ? `\nLast Run: ${session.lastRun}` : ''}
`;
  }

  private async runScript(command: string, cwd: string): Promise<{ exitCode: number; output: string }> {
    return new Promise((resolve) => {
      const child = spawn('sh', ['-c', command], { 
        cwd,
        stdio: ['inherit', 'pipe', 'pipe']
      });
      
      let output = '';
      
      child.stdout?.on('data', (data) => output += data.toString());
      child.stderr?.on('data', (data) => output += data.toString());
      
      child.on('close', (exitCode) => {
        resolve({ exitCode: exitCode || 0, output });
      });
    });
  }

  async preflight(sessionId: string): Promise<PreflightResult> {
    const session = this.store.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const git = new GitOps(session.repoRoot);
    const issues: string[] = [];

    // Check if repo is clean
    const repoClean = await git.isRepoClean(session.worktreePath);
    if (!repoClean) {
      issues.push('Repository has uncommitted changes');
    }

    // Check if base is up to date
    let baseUpToDate = false;
    try {
      baseUpToDate = await git.isBaseUpToDate(session.baseBranch);
      if (!baseUpToDate) {
        issues.push(`Base branch ${session.baseBranch} is behind origin`);
      }
    } catch (error) {
      issues.push(`Failed to check base branch status: ${error}`);
    }

    // Get branch info
    const branchInfo = await git.getBranchInfo(session.worktreePath, session.baseBranch);
    
    // Count amp commits
    const ampCommitsCount = await git.getAmpCommitsCount(session.worktreePath, branchInfo.branchpointSha);

    // Run tests if configured
    let testsPass: boolean | undefined;
    if (session.scriptCommand) {
      try {
        const testResult = await this.runScript(session.scriptCommand, session.worktreePath);
        testsPass = testResult.exitCode === 0;
        if (!testsPass) {
          issues.push(`Tests failed with exit code ${testResult.exitCode}`);
        }
      } catch (error) {
        testsPass = false;
        issues.push(`Failed to run tests: ${error}`);
      }
    }

    // Check typecheck (if monorepo detected)
    let typecheckPasses: boolean | undefined;
    try {
      const packageJsonPath = join(session.repoRoot, 'package.json');
      const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8'));
      
      if (packageJson.workspaces) {
        const typecheckResult = await this.runScript('pnpm -w typecheck', session.repoRoot);
        typecheckPasses = typecheckResult.exitCode === 0;
        if (!typecheckPasses) {
          issues.push('TypeScript compilation failed');
        }
      }
    } catch {
      // No package.json or not a monorepo
    }

    return {
      repoClean,
      baseUpToDate,
      testsPass,
      typecheckPasses,
      aheadBy: branchInfo.aheadBy,
      behindBy: branchInfo.behindBy,
      branchpointSha: branchInfo.branchpointSha,
      ampCommitsCount,
      issues
    };
  }

  async squashSession(sessionId: string, options: SquashOptions): Promise<void> {
    const session = this.store.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const git = new GitOps(session.repoRoot);
    await git.squashCommits(session.baseBranch, options.message, session.worktreePath, options.includeManual);
    
    console.log(`✓ Squashed session commits: ${options.message}`);
  }

  async rebaseOntoBase(sessionId: string): Promise<RebaseResult> {
    const session = this.store.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const git = new GitOps(session.repoRoot);
    const result = await git.rebaseOntoBase(session.baseBranch, session.worktreePath);
    
    if (result.status === 'conflict') {
      // Write conflict help
      const contextDir = join(session.worktreePath, 'AGENT_CONTEXT');
      await writeFile(
        join(contextDir, 'REBASE_HELP.md'),
        `# Rebase Conflicts\n\nRebase onto ${session.baseBranch} failed with conflicts.\n\nConflicted files:\n${result.files?.map(f => `- ${f}`).join('\n')}\n\nResolve conflicts manually and run:\n\`\`\`\namp-sessions continue-merge ${sessionId}\n\`\`\`\n`
      );
      
      console.log(`✗ Rebase conflicts detected in ${result.files?.length} files`);
      console.log('See AGENT_CONTEXT/REBASE_HELP.md for guidance');
    } else {
      console.log(`✓ Successfully rebased onto ${session.baseBranch}`);
    }
    
    return result;
  }

  async continueMerge(sessionId: string): Promise<RebaseResult> {
    const session = this.store.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const git = new GitOps(session.repoRoot);
    const result = await git.continueRebase(session.worktreePath);
    
    if (result.status === 'ok') {
      console.log('✓ Rebase completed successfully');
    } else {
      console.log(`✗ Additional conflicts detected in ${result.files?.length} files`);
    }
    
    return result;
  }

  async abortMerge(sessionId: string): Promise<void> {
    const session = this.store.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const git = new GitOps(session.repoRoot);
    await git.abortRebase(session.worktreePath);
    
    console.log('✓ Rebase aborted, session returned to previous state');
  }

  async fastForwardMerge(sessionId: string, options: MergeOptions = {}): Promise<void> {
    const session = this.store.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const git = new GitOps(session.repoRoot);
    await git.fastForwardMerge(session.branchName, session.baseBranch, options.noFF);
    
    console.log(`✓ Merged ${session.branchName} into ${session.baseBranch}`);
  }

  async exportPatch(sessionId: string, outPath: string): Promise<void> {
    const session = this.store.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const git = new GitOps(session.repoRoot);
    await git.exportPatch(outPath, session.worktreePath);
    
    console.log(`✓ Exported patch to ${outPath}`);
  }

  async getDiff(sessionId: string): Promise<string> {
    const session = this.store.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const git = new GitOps(session.repoRoot);
    // Get diff against base branch to show all session changes
    const result = await git.exec(['diff', session.baseBranch], session.worktreePath);
    return result.stdout;
  }

  async cleanup(sessionId: string, force: boolean = false): Promise<void> {
    const session = this.store.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const git = new GitOps(session.repoRoot);
    
    if (force) {
      // Force cleanup - bypass safety checks
      await git.forceRemoveWorktreeAndBranch(session.worktreePath, session.branchName);
    } else {
      await git.safeRemoveWorktreeAndBranch(session.worktreePath, session.branchName, session.baseBranch);
    }
    
    // Remove session from database after successful git cleanup
    this.store.deleteSession(sessionId);
    
    console.log(`✓ Cleaned up session worktree, branch, and database record`);
  }

  private loadAmpConfig(): AmpAdapterConfig {
    try {
      const configPath = join(homedir(), '.amp-session-manager', 'config.json');
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      
      // Merge process env with config, giving priority to process env
      const env = config.ampEnv ? { ...config.ampEnv } : {};
      
      // Always inherit AMP_API_KEY from process environment if available
      if (process.env.AMP_API_KEY) {
        env.AMP_API_KEY = process.env.AMP_API_KEY;
      }
      
      return {
        ampPath: config.ampPath,
        ampArgs: config.ampArgs ? config.ampArgs.split(' ') : undefined,
        enableJSONLogs: config.enableJSONLogs !== false,
        env: Object.keys(env).length > 0 ? env : undefined,
        extraArgs: config.ampEnv?.AMP_ARGS ? config.ampEnv.AMP_ARGS.split(/\s+/).filter(Boolean) : undefined
      };
    } catch {
      // If no config file, still pass through AMP_API_KEY
      const env: Record<string, string> = {};
      if (process.env.AMP_API_KEY) {
        env.AMP_API_KEY = process.env.AMP_API_KEY;
      }
      return {
        env: Object.keys(env).length > 0 ? env : undefined
      };
    }
  }
}

// Helper to read file synchronously
function readFileSync(path: string, encoding: BufferEncoding): string {
  const fs = require('fs');
  return fs.readFileSync(path, encoding);
}

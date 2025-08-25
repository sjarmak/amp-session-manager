import { SessionStore } from './store.js';
import { GitOps } from './git.js';
import { AmpAdapter, type AmpAdapterConfig } from './amp.js';
import { getCurrentAmpThreadId } from './amp-utils.js';
import type { Session, SessionCreateOptions, IterationRecord, PreflightResult, SquashOptions, RebaseResult, MergeOptions } from '@ampsm/types';
import { mkdir, writeFile, readFile } from 'fs/promises';
import * as fs from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { spawn } from 'child_process';
import { homedir } from 'os';
import { isLocked, acquireLock, releaseLock } from './lock.js';
import { withRepoLock } from './repo-lock.js';
import { MetricsEventBus, SQLiteMetricsSink, NDJSONMetricsSink, GitInstrumentation, costCalculator, FileDiffTracker } from './metrics/index.js';
import { JSONLSink } from './metrics/sinks/jsonl-sink.js';
import { Logger } from './utils/logger.js';
import { AmpLogParser } from './amp-log-parser.js';

export class WorktreeManager {
  private ampAdapter: AmpAdapter;
  private metricsEventBus: MetricsEventBus;
  private logger: Logger;

  constructor(
    private store: SessionStore,
    private dbPath?: string,
    metricsEventBus?: MetricsEventBus,
    private metricsJsonlPath?: string
  ) {
    this.logger = new Logger('WorktreeManager');
    
    if (metricsEventBus) {
      // Use shared metrics event bus from main process
      this.metricsEventBus = metricsEventBus;
    } else {
      // Fallback: create own metrics event bus (for CLI usage)
      this.metricsEventBus = new MetricsEventBus(this.logger);
      
      // Initialize metrics sinks
      if (dbPath) {
        const sqliteSink = new SQLiteMetricsSink(dbPath, this.logger);
        this.metricsEventBus.addSink(sqliteSink);
        
        const ndjsonSink = new NDJSONMetricsSink(
          join(process.cwd(), 'metrics-events.ndjson'), 
          this.logger,
          {
            enableRealtimeBuffering: true,
            bufferFlushIntervalMs: 1000,
            enableStreaming: true
          }
        );
        this.metricsEventBus.addSink(ndjsonSink);
      }

      // Add JSONL sink if path specified
      if (this.metricsJsonlPath) {
        const jsonlSink = new JSONLSink(this.logger, { 
          filePath: this.metricsJsonlPath,
          autoFlush: true,
          truncateArgs: true,
          maxDiffLines: 200
        });
        this.metricsEventBus.addSink(jsonlSink);
      }
    }
    
    this.ampAdapter = new AmpAdapter(this.loadAmpConfig(), this.store);
  }

  async createSession(options: SessionCreateOptions): Promise<Session> {
    const git = new GitOps(options.repoRoot);
    
    // Validate repo
    const isRepo = await git.isRepo();
    if (!isRepo) {
      throw new Error(`${options.repoRoot} is not a git repository`);
    }

    // Create session in store first (before any git operations)
    const session = this.store.createSession(options);

    try {
      // Use repository-level locking to prevent concurrent git operations
      const gitStartTime = Date.now();
      await withRepoLock(options.repoRoot, async () => {
        // Provide helpful error context for common issues
        try {
          // Check if the specified base branch exists
          const branchExistsResult = await git.exec(['rev-parse', '--verify', options.baseBranch || 'main']);
          if (branchExistsResult.exitCode !== 0) {
            const defaultBranch = await git.getDefaultBranch();
            if (defaultBranch !== (options.baseBranch || 'main')) {
              console.warn(`Warning: Base branch '${options.baseBranch || 'main'}' not found. Detected default branch: '${defaultBranch}'`);
            }
          }
        } catch (error) {
          // Non-fatal - the createWorktree method will provide detailed error messages
        }

        // Create worktree directory
        await mkdir(session.worktreePath, { recursive: true });
        
        // Create branch and worktree
        await git.createWorktree(session.branchName, session.worktreePath, session.baseBranch);
      });
      
      const gitDuration = Date.now() - gitStartTime;
      console.log(`Git worktree creation completed in ${gitDuration}ms`);

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

      // Handle initial execution based on mode
      if (options.mode === 'interactive') {
        console.log('Interactive mode selected - session ready for interactive chat');
        // For interactive mode, just set session to idle - user will start chat manually
        this.store.updateSessionStatus(session.id, 'idle');
      } else {
        // Immediately run the initial iteration with the provided prompt (async mode)
        console.log('Running initial iteration with the provided prompt...');
        console.log('Session details:', { id: session.id, prompt: session.ampPrompt });
        
        // Validate Amp authentication before attempting iteration
        try {
          console.log('Validating Amp authentication...');
          const authStatus = await this.ampAdapter.validateAuth();
          console.log('Amp auth status:', authStatus);
          
          if (!authStatus.isAuthenticated) {
            throw new Error(`Amp authentication failed: ${authStatus.error || 'Not authenticated'}. ${authStatus.suggestion || ''}`);
          }
          
          console.log('Authentication validated, running iteration...');
          await this.iterate(session.id, undefined, options.includeContext);
          console.log('✓ Initial iteration completed');
        } catch (error) {
          console.error('Initial iteration failed, but session was created successfully:', error);
          // Update session status to indicate there was an issue
          this.store.updateSessionStatus(session.id, 'error');
          // Don't fail session creation if iteration fails - user can retry manually
        }
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

  async iterate(sessionId: string, notes?: string, includeContext?: boolean): Promise<void> {
    const session = this.store.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Check if session is already locked by another process
    if (isLocked(sessionId)) {
      throw new Error(`Session ${sessionId} is already locked by another process`);
    }

    // Acquire lock for this session
    acquireLock(sessionId);

    // Create iteration record
    const iteration = this.store.createIteration(sessionId);
    const iterationId = iteration.id;
    
    this.store.updateSessionStatus(sessionId, 'running');

    // Initialize metrics tracking
    const git = new GitOps(session.repoRoot);
    const gitInstrumentation = new GitInstrumentation(this.logger, this.metricsEventBus, session.worktreePath);
    const startTime = Date.now();
    const startSha = gitInstrumentation.getCurrentSha();

    // Capture CLI log state before Amp iteration for metrics
    const beforeIterationTime = new Date().toISOString();

    // Publish iteration start event
    await this.metricsEventBus.publishIterationStart(
      sessionId, 
      iterationId, 
      await this.getIterationNumber(sessionId), 
      startSha
    );

    try {
      
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

      // Track user message if provided
      if (notes) {
        await this.metricsEventBus.publishUserMessage(
          sessionId,
          iterationId,
          notes
        );
      } else if (session.ampPrompt && await this.getIterationNumber(sessionId) === 1) {
        // Track initial prompt for first iteration
        await this.metricsEventBus.publishUserMessage(
          sessionId,
          iterationId,
          session.ampPrompt
        );
      }

      // Run Amp iteration with streaming metrics
      console.log('Running Amp iteration...');
      const iterationPrompt = notes || session.ampPrompt;
      
      // For interactive sessions without a prompt, we should not run a normal iteration
      if (!iterationPrompt && session.mode === 'interactive') {
        throw new Error('Interactive sessions should not run iterations without prompts. Use startInteractiveSession instead.');
      }
      
      console.log('Iteration prompt:', iterationPrompt?.slice(0, 100) + '...');
      
      // Connect streaming events from AmpAdapter to metrics
      const cleanupStreamingMetrics = this.metricsEventBus.connectToAmpAdapter(
        this.ampAdapter, 
        sessionId, 
        iterationId
      );
      
      let result;
      try {
        result = await this.ampAdapter.runIteration(
          iterationPrompt!, 
          session.worktreePath, 
          session.modelOverride,
          sessionId,
          includeContext
        );
      } finally {
        // Always cleanup streaming metrics connection
        cleanupStreamingMetrics();
      }

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

      console.log(`[DEBUG] Reached commit section for session ${sessionId}`);
      // Check for changes and commit if necessary
      const hasChanges = await git.hasChanges(session.worktreePath);
      console.log(`[MAIN] hasChanges = ${hasChanges} for ${session.worktreePath}`);
      this.logger.debug(`[MAIN] hasChanges = ${hasChanges} for ${session.worktreePath}`);
      let commitSha: string | undefined;
      let changedFiles = 0;

      if (hasChanges) {
        // Stage files first so diff tracker can see them
        await git.stageAllChanges(session.worktreePath);
        console.log(`[MAIN] Staged all changes`);
        
        // Track file changes BEFORE committing them
        console.log(`[MAIN] About to track file changes for ${session.worktreePath}`);
        this.logger.debug(`[MAIN] About to track file changes for ${session.worktreePath}`);
        await this.trackFileChangesAfterAmp(sessionId, iterationId, session.worktreePath);
        console.log(`[MAIN] Finished tracking file changes`);
        this.logger.debug(`[MAIN] Finished tracking file changes`);
        const changedFilesList = await git.getChangedFiles(session.worktreePath);
        changedFiles = changedFilesList.length;
        
        // Use instrumented git operations for metrics tracking (skip addAll since already staged)
        const commitResult = await gitInstrumentation.commit(
          'amp: iteration changes',
          sessionId,
          iterationId,
          false  // Don't add all since we already staged
        );
        commitSha = commitResult.shaAfter;
        
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

      // Publish comprehensive metrics
      const endTime = Date.now();
      const durationMs = endTime - startTime;

      // Publish LLM usage metrics if available
      if (result.telemetry.totalTokens && result.telemetry.model) {
        const cost = costCalculator.calculateCost({
          promptTokens: result.telemetry.promptTokens || 0,
          completionTokens: result.telemetry.completionTokens || 0,
          totalTokens: result.telemetry.totalTokens,
          model: result.telemetry.model
        });

        await this.metricsEventBus.publishLLMUsage(
          sessionId,
          iterationId,
          result.telemetry.model,
          {
            promptTokens: result.telemetry.promptTokens || 0,
            completionTokens: result.telemetry.completionTokens || 0,
            totalTokens: result.telemetry.totalTokens,
            costUsd: cost.totalCost,
            latencyMs: durationMs
          }
        );
      }

      // Publish tool call metrics
      for (const toolCall of result.telemetry.toolCalls) {
        await this.metricsEventBus.publishToolCall(
          sessionId,
          iterationId,
          toolCall.toolName,
          toolCall.args,
          {
            startTime: toolCall.timestamp,
            endTime: new Date(new Date(toolCall.timestamp).getTime() + (toolCall.durationMs || 0)).toISOString(),
            durationMs: toolCall.durationMs || 0,
            success: toolCall.success
          }
        );
      }

      // Publish test results if available
      if (session.scriptCommand && testExitCode !== undefined) {
        await this.metricsEventBus.publishTestResult(
          sessionId,
          iterationId,
          'script',
          session.scriptCommand,
          {
            total: 1,
            passed: testResult === 'pass' ? 1 : 0,
            failed: testResult === 'fail' ? 1 : 0,
            skipped: 0,
            durationMs: 0, // We don't track script duration separately yet
            exitCode: testExitCode
          }
        );
      }

      // Calculate CLI metrics from Amp CLI logs (session-isolated)
      let cliMetrics: { toolUsageCount: number; errorCount: number; durationMs: number } | undefined;
      try {
        // Use shared CLI log with timestamp filtering since session logs don't contain tool execution details
        console.log('DEBUG: Using shared CLI logs with timestamp filtering');
        const logMetrics = AmpLogParser.extractIterationMetrics(iteration.startTime);
        
        const iterationDurationMs = Date.now() - new Date(iteration.startTime).getTime();
        
        // Debug: Log the parsed metrics
        console.log('DEBUG: CLI log metrics:', {
          toolUsages: logMetrics.toolUsages.length,
          tools: logMetrics.toolUsages.map(t => t.toolName),
          errors: logMetrics.errors.length,
          duration: logMetrics.duration,
          source: 'shared CLI log'
        });
        console.log('DEBUG: Fallback telemetry tools:', result.telemetry.toolCalls?.length || 0);
        
        // Prefer CLI log metrics, fallback to telemetry parsing
        const toolCallCount = logMetrics.toolUsages.length > 0 
          ? logMetrics.toolUsages.length 
          : (result.telemetry.toolCalls?.length || 0);
        const errorCount = logMetrics.errors.length > 0 
          ? logMetrics.errors.length 
          : (result.telemetry.exitCode !== 0 ? 1 : 0);
        
        cliMetrics = {
          toolUsageCount: toolCallCount,
          errorCount: errorCount,
          durationMs: iterationDurationMs
        };
        
        // Log the CLI metrics for debugging
        console.log(`CLI Telemetry Metrics - Tools: ${cliMetrics.toolUsageCount}, Errors: ${cliMetrics.errorCount}, Duration: ${cliMetrics.durationMs}ms`);
        
        // Update iteration log with CLI metrics
        const contextDir = join(session.worktreePath, 'AGENT_CONTEXT');
        const iterationLogPath = join(contextDir, 'ITERATION_LOG.md');
        
        const toolList = logMetrics.toolUsages.length > 0
          ? logMetrics.toolUsages.map(tu => `- ${tu.toolName} (${tu.permitted ? 'permitted' : 'denied'})`).join('\n')
          : (result.telemetry.toolCalls?.map(tc => `- ${tc.toolName} (${tc.success ? 'success' : 'failed'})`).join('\n') || 'No tool calls captured');
        
        const metricsEntry = `\n### CLI Metrics (DEBUG)
Timestamp: ${new Date().toISOString()}
Tool Usages: ${toolCallCount}
${toolList}
Errors: ${errorCount}
${errorCount > 0 ? `- Exit code: ${result.telemetry.exitCode}` : '- No errors'}
Duration: ${iterationDurationMs}ms
Raw Telemetry: ${JSON.stringify(result.telemetry, null, 2)}

`;
        
        const existingLog = await readFile(iterationLogPath, 'utf-8').catch(() => '');
        await writeFile(iterationLogPath, existingLog + metricsEntry);
        
        // Commit the metrics update if there are changes
        const hasChanges = await git.hasChanges(session.worktreePath);
        if (hasChanges) {
          await git.commitChanges('amp: update iteration metrics', session.worktreePath);
        }
        
      } catch (error) {
        console.warn('Failed to extract CLI metrics:', error);
      }

      // Publish iteration end event
      await this.metricsEventBus.publishIterationEnd(
        sessionId,
        iterationId,
        await this.getIterationNumber(sessionId),
        finalStatus === 'idle' ? 'success' : finalStatus === 'error' ? 'failed' : 'awaiting-input',
        durationMs,
        result.telemetry.exitCode
      );

      // Update iteration with telemetry and save tool calls
      this.store.finishIteration(
        iteration.id, 
        result.telemetry, 
        commitSha || undefined, 
        changedFiles,
        this.ampAdapter.lastUsedArgs?.join(' '),
        result.output,
        cliMetrics
      );
      
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

      // Track follow-up prompt when notes are provided (after successful iteration)
      if (notes && result.success) {
        this.store.addFollowUpPrompt(sessionId, notes, includeContext);
      }

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

      // Update thread ID if it changed during iteration
      const { getCurrentAmpThreadId } = await import('./amp-utils.js');
      const currentThreadId = await getCurrentAmpThreadId();
      if (currentThreadId && currentThreadId !== session.threadId) {
        this.store.updateSessionThreadId(sessionId, currentThreadId);
        console.log(`  Updated thread ID: ${currentThreadId}`);
      }

    } catch (error) {
      this.store.updateSessionStatus(sessionId, 'error');
      throw error;
    } finally {
      // Always release the lock
      releaseLock(sessionId);
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

  private async getIterationNumber(sessionId: string): Promise<number> {
    const iterations = this.store.getIterations(sessionId);
    return iterations.length;
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

  async getThreadConversation(sessionId: string): Promise<string> {
    const session = this.store.getSession(sessionId);
    if (!session) {
      return 'Session not found.';
    }
    
    // If session doesn't have threadId, try to get current one and update
    if (!session.threadId) {
      const currentThreadId = await getCurrentAmpThreadId();
      if (currentThreadId) {
        console.log(`Updating session ${sessionId} with threadId: ${currentThreadId}`);
        this.store.updateSessionThreadId(sessionId, currentThreadId);
        session.threadId = currentThreadId;
      } else {
        return 'No thread ID available for this session. Thread conversations are created when sessions are linked to active Amp threads.';
      }
    }

    try {
      const { readdir, readFile } = await import('fs/promises');
      const { join } = await import('path');
      const { homedir } = await import('os');
      
      const threadDir = join(homedir(), '.amp', 'file-changes', session.threadId);
      const files = await readdir(threadDir).catch(() => []);
      
      if (files.length === 0) {
        return 'Thread conversation files not available yet. Files will be created after running iterations with Amp.';
      }

      // Parse and format file changes
      const changes: string[] = [];
      
      for (const file of files.sort()) {
        try {
          const content = await readFile(join(threadDir, file), 'utf-8');
          const data = JSON.parse(content);
          
          if (data.uri && data.diff) {
            // Extract filename from URI
            const filename = data.uri.replace(/^file:\/\/.*\//, '');
            const timestamp = data.timestamp ? new Date(data.timestamp).toLocaleString() : 'Unknown time';
            
            changes.push(`## ${filename} ${data.isNewFile ? '(new file)' : '(modified)'}`);
            changes.push(`*${timestamp}*\n`);
            
            if (data.diff) {
              changes.push('```diff');
              changes.push(data.diff);
              changes.push('```\n');
            }
          }
        } catch {
          // Skip invalid JSON files
        }
      }

      if (changes.length === 0) {
        return 'No file changes found in thread conversation.';
      }

      return `# Amp Thread Changes\n\n${changes.join('\n')}`;
    } catch (error) {
      return `Error reading thread conversation: ${error}`;
    }
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

  /**
   * Scan for mismatches between DB, git worktree list and filesystem.
   * Removes:
   *  – worktree folders with no DB session
   *  – DB sessions whose folder is gone
   */
  async pruneOrphans(repoRoot: string): Promise<{ removedDirs: number; removedSessions: number }> {
    console.log(`🔍 Scanning for orphaned worktrees in ${repoRoot}...`);
    
    let removedDirs = 0;
    let removedSessions = 0;
    
    try {
      const git = new GitOps(repoRoot);
      
      // Get all git worktrees
      const result = await git.exec(['worktree', 'list', '--porcelain']);
      const activePaths = new Set<string>();
      
      if (result.stdout) {
        const lines = result.stdout.split('\n').filter(Boolean);
        for (const line of lines) {
          if (line.startsWith('worktree ')) {
            const path = line.replace('worktree ', '').trim();
            activePaths.add(path);
          }
        }
      }
      
      // Get all sessions from DB
      const dbSessions = this.store.getAllSessions().filter(s => s.repoRoot === repoRoot);
      
      // 1. Remove git worktrees that have no corresponding DB session
      for (const path of activePaths) {
        if (!dbSessions.find(s => s.worktreePath === path)) {
          console.log(`🧹 Removing orphaned worktree: ${path}`);
          try {
            await git.exec(['worktree', 'remove', '--force', path]);
            const { rm } = await import('fs/promises');
            await rm(path, { recursive: true, force: true });
            removedDirs++;
          } catch (error) {
            console.warn(`Failed to remove orphaned worktree ${path}:`, error);
          }
        }
      }
      
      // 2. Remove DB sessions whose directory is gone
      const { stat } = await import('fs/promises');
      for (const session of dbSessions) {
        try {
          await stat(session.worktreePath);
        } catch {
          // Directory doesn't exist, remove session from DB
          console.log(`🧹 Removing orphaned session: ${session.id} (${session.name})`);
          this.store.deleteSession(session.id);
          removedSessions++;
        }
      }
      
      console.log(`✓ Cleanup complete: removed ${removedDirs} directories, ${removedSessions} sessions`);
      return { removedDirs, removedSessions };
      
    } catch (error) {
      console.error('Failed to prune orphans:', error);
      throw error;
    }
  }

  private async trackFileChangesAfterAmp(
    sessionId: string, 
    iterationId: string, 
    worktreePath: string
  ): Promise<void> {
    try {
      console.log(`[TRACK] Starting file change tracking for ${worktreePath}`);
      this.logger.debug(`[TRACK] Starting file change tracking for ${worktreePath}`);
      const fileDiffTracker = new FileDiffTracker(this.logger);
      const fileChanges = await fileDiffTracker.getFileChanges(worktreePath);
      
      console.log(`[TRACK] Found ${fileChanges.length} file changes:`, fileChanges.map(c => `${c.path}: +${c.linesAdded}/-${c.linesDeleted}`));
      this.logger.debug(`[TRACK] Found ${fileChanges.length} file changes:`, fileChanges.map(c => `${c.path}: +${c.linesAdded}/-${c.linesDeleted}`));
      
      // Publish file edit events
      for (const change of fileChanges) {
        this.logger.debug(`[TRACK] Publishing file_edit event for ${change.path}: +${change.linesAdded}/-${change.linesDeleted}`);
        await this.metricsEventBus.publishFileEdit(
          sessionId,
          iterationId,
          change.path,
          {
            linesAdded: change.linesAdded,
            linesDeleted: change.linesDeleted,
            diff: change.diff,
            operation: change.operation
          }
        );
      }
      
      this.logger.debug(`[TRACK] Tracked ${fileChanges.length} file changes after Amp execution`);
    } catch (error) {
      this.logger.error('Failed to track file changes after Amp execution:', error);
    }
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

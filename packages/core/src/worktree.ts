import { SessionStore } from './store.js';
import { GitOps } from './git.js';
import { AmpAdapter, type AmpAdapterConfig } from './amp.js';
// import { getCurrentAmpThreadId } from './amp-utils.js'; // Removed - we now capture thread IDs directly from Amp output
import type { Session, SessionCreateOptions, IterationRecord, PreflightResult, SquashOptions, RebaseResult, MergeOptions, AmpRuntimeConfig, AmpSettings } from '@ampsm/types';
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
    private metricsJsonlPath?: string,
    private runtimeConfig?: AmpRuntimeConfig,
    private ampSettings?: AmpSettings
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
    
    this.ampAdapter = new AmpAdapter({...this.loadAmpConfig(), runtimeConfig: this.runtimeConfig}, this.store, this.metricsEventBus);
  }

  public getRuntimeConfig(): AmpRuntimeConfig | undefined {
    return this.runtimeConfig;
  }

  private sessionAmpModeToRuntimeConfig(session: Session): AmpRuntimeConfig {
    console.log(`🔧 Session ${session.id} ampMode: ${session.ampMode}, ampSettings: ${JSON.stringify(this.ampSettings)}`);
    if (session.ampMode === 'local-cli') {
      const config = {
        ampCliPath: this.ampSettings?.localCliPath || '/Users/sjarmak/amp/cli/dist/main.js'
      };
      console.log(`🔧 Using local CLI config for session: ${JSON.stringify(config)}`);
      return config;
    }
    console.log(`🔧 Using production mode for session ${session.id}`);
    return {}; // Production mode uses default amp CLI
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

      // Stage context files so they're ready for the first iteration,
      // but do NOT commit — we want the branch to start at the base tip.
      await git.stageAllChanges(session.worktreePath);
      console.log('✓ AGENT_CONTEXT staged (no commit yet)');

      // Handle initial execution based on mode
      if (options.mode === 'interactive') {
        console.log('Interactive mode selected - session ready for interactive chat');
        console.log(`Current session autoCommit before update: ${session.autoCommit}`);
        
        // For interactive mode, disable autoCommit so changes get staged instead of committed
        this.store.updateSessionAutoCommit(session.id, false);
        
        // Verify the change was applied
        const updatedSession = this.store.getSession(session.id);
        console.log(`Session autoCommit after update: ${updatedSession?.autoCommit}`);
        console.log('✓ AutoCommit disabled for interactive session - changes will be staged');
        
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
          await this.iterate(session.id, undefined);
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
      
      // Remove the session from the database since it failed to create properly
      try {
        this.store.deleteSession(session.id);
        console.log(`Cleaned up failed session ${session.id} from database`);
      } catch (cleanupError) {
        console.warn('Failed to cleanup session from database:', cleanupError);
      }
      
      throw error;
    }
  }

  async iterate(sessionId: string, notes?: string, stageOnly?: boolean): Promise<void> {
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
        // Create session-specific amp adapter if needed
        let sessionAmpAdapter = this.ampAdapter;
        if (session.ampMode && session.ampMode !== 'production') {
          const sessionRuntimeConfig = this.sessionAmpModeToRuntimeConfig(session);
          const ampConfig = {
            ...this.loadAmpConfig(), 
            runtimeConfig: sessionRuntimeConfig,
            // Add agent configuration from session
            agentId: session.agentId,
            autoRoute: session.autoRoute,
            alloyMode: session.alloyMode,
            multiProvider: session.multiProvider
          };
          sessionAmpAdapter = new AmpAdapter(ampConfig, this.store, this.metricsEventBus);
        } else {
          // For production mode, check if we need to create an agent-aware adapter
          if (session.agentId || session.autoRoute || session.alloyMode || session.multiProvider) {
            const ampConfig = {
              ...this.loadAmpConfig(),
              runtimeConfig: this.runtimeConfig,
              // Add agent configuration from session
              agentId: session.agentId,
              autoRoute: session.autoRoute,
              alloyMode: session.alloyMode,
              multiProvider: session.multiProvider
            };
            sessionAmpAdapter = new AmpAdapter(ampConfig, this.store, this.metricsEventBus);
          }
        }
        
        result = await sessionAmpAdapter.runIteration(
          iterationPrompt!, 
          session.worktreePath, 
          session.modelOverride,
          sessionId
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
      
      // Detailed debugging before checking changes
      console.log(`[DEBUG] Worktree path: ${session.worktreePath}`);
      
      // Show raw git status output
      try {
        const statusResult = await git.exec(['status', '--porcelain'], session.worktreePath);
        console.log(`[DEBUG] Raw git status output: "${statusResult.stdout.trim()}"`);
        
        // Also check what files exist
        const lsResult = await git.exec(['ls-files', '--others', '--exclude-standard'], session.worktreePath);
        console.log(`[DEBUG] Untracked files: "${lsResult.stdout.trim()}"`);
        
        // Check staged files
        const stagedResult = await git.exec(['diff', '--cached', '--name-only'], session.worktreePath);
        console.log(`[DEBUG] Already staged files: "${stagedResult.stdout.trim()}"`);
        
        // Check unstaged files  
        const unstagedResult = await git.exec(['diff', '--name-only'], session.worktreePath);
        console.log(`[DEBUG] Unstaged files: "${unstagedResult.stdout.trim()}"`);
        
      } catch (debugError) {
        console.log(`[DEBUG] Error getting git status:`, debugError);
      }
      
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
        
        // File changes have already been tracked above before metrics calculation
        const changedFilesList = await git.getChangedFiles(session.worktreePath);
        changedFiles = changedFilesList.length;
        
        // Only commit if not in stage-only mode and session has autoCommit enabled
        const shouldCommit = !stageOnly && (session.autoCommit !== false);
        console.log(`[DEBUG] shouldCommit=${shouldCommit}, stageOnly=${stageOnly}, autoCommit=${session.autoCommit}`);
        
        if (shouldCommit) {
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
          console.log(`✓ Staged ${changedFiles} changed files for manual commit (stageOnly=${stageOnly}, autoCommit=${session.autoCommit})`);
          
          // Verify changes are still staged after not committing
          const stagedFiles = await git.exec(['diff', '--cached', '--name-only'], session.worktreePath);
          console.log(`[DEBUG] Files still staged after skip commit: "${stagedFiles.stdout.trim()}"`);
          
          // Double-check that we really didn't commit by checking if working tree is clean
          const finalStatus = await git.exec(['status', '--porcelain'], session.worktreePath);
          if (finalStatus.stdout.trim() === '') {
            console.warn(`[WARNING] Working tree is unexpectedly clean - changes may have been committed despite shouldCommit=false`);
          }
        }
      } else {
        console.log('No changes to stage or commit');
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

      // Track file changes BEFORE publishing metrics so file edit events are available
      if (hasChanges) {
        console.log(`[MAIN] About to track file changes for ${session.worktreePath}`);
        this.logger.debug(`[MAIN] About to track file changes for ${session.worktreePath}`);
        await this.trackFileChangesAfterAmp(sessionId, iterationId, session.worktreePath);
        console.log(`[MAIN] Finished tracking file changes`);
        this.logger.debug(`[MAIN] Finished tracking file changes`);
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
        
        // Commit the metrics update if there are changes and autoCommit is enabled
        const hasChanges = await git.hasChanges(session.worktreePath);
        if (hasChanges && session.autoCommit !== false) {
          await git.commitChanges('amp: update iteration metrics', session.worktreePath);
          console.log('✓ Committed metrics update');
        } else if (hasChanges) {
          console.log('✓ Metrics updated but not committed (autoCommit disabled)');
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
        this.store.addFollowUpPrompt(sessionId, notes);
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

      // Update thread ID if it was captured from Amp output during iteration
      console.log(`[DEBUG] Thread ID update check - result.threadId: ${result.threadId}, session.threadId: ${session.threadId}, sessionId: ${sessionId}`);
      if (result.threadId && result.threadId !== session.threadId) {
        console.log(`[DEBUG] Updating thread ID from ${session.threadId} to ${result.threadId} for session ${sessionId}`);
        this.store.updateSessionThreadId(sessionId, result.threadId);
        
        // Create or update thread record in threads table
        console.log(`[DEBUG] Ensuring thread record exists: sessionId=${sessionId}, threadId=${result.threadId}`);
        try {
          // Check if thread exists globally first
          const globalThread = this.store.getThread(result.threadId);
          
          if (!globalThread) {
            // Thread doesn't exist globally, safe to create
            const threadName = `Amp Thread ${result.threadId}`;
            console.log(`[DEBUG] Creating new thread record: sessionId=${sessionId}, threadId=${result.threadId}, threadName=${threadName}`);
            this.store.createThread(sessionId, threadName, result.threadId);
            
            // Add the initial user prompt as the first message in the thread
            if (session.ampPrompt) {
              this.store.addThreadMessage(result.threadId, 'user', session.ampPrompt);
              console.log(`  Added user message to thread: ${session.ampPrompt.substring(0, 50)}...`);
            }
            
            console.log(`  Created thread record: ${threadName}`);
          } else if (globalThread.sessionId !== sessionId) {
            // Thread exists but belongs to different session - this shouldn't happen in batch mode
            console.warn(`Thread ${result.threadId} exists but belongs to session ${globalThread.sessionId}, not ${sessionId}. This may indicate concurrent session issues.`);
          } else {
            console.log(`[DEBUG] Thread ${result.threadId} already exists for this session, skipping creation`);
          }
        } catch (error: any) {
          // If creation fails due to constraint violation, just log and continue
          if (error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
            console.log(`[DEBUG] Thread ${result.threadId} already exists (constraint violation), continuing...`);
          } else {
            throw error;
          }
        }
        
        console.log(`  Updated thread ID: ${result.threadId}`);
      } else {
        console.log(`[DEBUG] No thread ID update needed - either no threadId captured (${!!result.threadId}) or same as existing (${result.threadId === session.threadId})`);
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

    // Check if repo has uncommitted changes (staged changes are OK for merge wizard)
    const [hasStagedChanges, hasUnstagedChanges] = await Promise.all([
      git.hasStagedChanges(session.worktreePath),
      git.hasUnstagedChanges(session.worktreePath)
    ]);
    
    // For merge wizard, we only care about unstaged changes - staged changes are fine
    const repoClean = !hasUnstagedChanges;
    if (!repoClean) {
      issues.push('Repository has uncommitted changes (only staged changes are allowed)');
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
    
    // Check if we have any commits to squash
    const branchInfo = await git.getBranchInfo(session.worktreePath, session.baseBranch);
    if (branchInfo.aheadBy === 0) {
      throw new Error('No commits to squash - session has no changes to merge');
    }
    
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
    
    // If session doesn't have threadId, there's no safe way to infer it for this session
    if (!session.threadId) {
      return 'No thread ID available for this session. Thread conversations are created when sessions are linked to active Amp threads.';
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
    
    console.log(`🚀 Starting cleanup for session ${sessionId} at ${session.worktreePath}`);
    try {
      if (force) {
        console.log(`💪 Using force cleanup`);
        // Force cleanup - bypass safety checks
        await git.forceRemoveWorktreeAndBranch(session.worktreePath, session.branchName);
      } else {
        console.log(`🔒 Using safe cleanup`);
        await git.safeRemoveWorktreeAndBranch(session.worktreePath, session.branchName, session.baseBranch);
      }
      
      console.log(`📀 Git cleanup completed, now removing from database...`);
      // Remove session from database only after successful git cleanup
      this.store.deleteSession(sessionId);
      
      console.log(`✓ Cleaned up session worktree, branch, and database record`);
    } catch (error) {
      console.error(`❌ Failed to cleanup session ${sessionId}:`, error);
      // Re-throw the error so the caller knows cleanup failed
      throw error;
    }
  }

  /**
   * Scan for mismatches between DB, git worktree list and filesystem.
   * Removes:
   *  – worktree folders with no DB session
   *  – DB sessions whose folder is gone
   */
  async pruneOrphans(repoRoot: string, dryRun = true): Promise<{ removedDirs: number; removedSessions: number }> {
    console.log(`🔍 Scanning for orphaned worktrees in ${repoRoot}...`);
    
    // SAFETY: Validate that repoRoot exists and is a valid git repository
    const { stat } = await import('fs/promises');
    try {
      await stat(repoRoot);
      await stat(`${repoRoot}/.git`);
    } catch {
      console.error(`🚨 SAFETY: Repository root ${repoRoot} is invalid or missing, skipping cleanup`);
      return { removedDirs: 0, removedSessions: 0 };
    }
    
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
          // SAFETY CHECK: Only remove paths that are clearly worktree subdirectories
          if (!path.includes('/.worktrees/') || path === repoRoot || !path.startsWith(repoRoot)) {
            console.error(`🚨 SAFETY: Refusing to remove path that doesn't look like a worktree subdirectory: ${path}`);
            console.error(`🚨 SAFETY: Expected pattern: ${repoRoot}/.worktrees/<session-id>`);
            continue;
          }
          
          // Additional safety: Check that it's a UUID-like directory name
          const dirName = path.split('/').pop();
          if (!dirName || !dirName.match(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/)) {
            console.error(`🚨 SAFETY: Directory name doesn't look like a session UUID: ${dirName}`);
            continue;
          }
          
          if (dryRun) {
            console.log(`🔍 DRY RUN: Would remove orphaned worktree: ${path}`);
            removedDirs++; // Count for dry run
          } else {
            console.log(`🧹 Removing orphaned worktree: ${path}`);
            try {
              await git.exec(['worktree', 'remove', '--force', path]);
              // Only remove the directory if git worktree remove succeeded
              const { rm } = await import('fs/promises');
              await rm(path, { recursive: true, force: true });
              removedDirs++;
            } catch (error) {
              console.warn(`Failed to remove orphaned worktree ${path}:`, error);
            }
          }
        }
      }
      
      // 2. Remove DB sessions whose directory is gone (but be more conservative)
      const { stat } = await import('fs/promises');
      for (const session of dbSessions) {
        try {
          await stat(session.worktreePath);
          // Directory exists, check if it's a valid git worktree
          if (!activePaths.has(session.worktreePath)) {
            console.log(`⚠️  Session ${session.id} (${session.name}) directory exists but worktree is not registered with git - preserving session`);
          }
        } catch {
          // Directory doesn't exist - check if session was recently active before removing
          const sessionAge = new Date().getTime() - new Date(session.createdAt).getTime();
          const dayInMs = 24 * 60 * 60 * 1000;
          
          if (sessionAge < dayInMs) {
            console.log(`⚠️  Preserving recent session ${session.id} (${session.name}) - created ${Math.round(sessionAge / (60 * 60 * 1000))} hours ago, directory may be temporarily missing`);
          } else {
            if (dryRun) {
              console.log(`🔍 DRY RUN: Would remove orphaned session: ${session.id} (${session.name}) - directory missing and session is ${Math.round(sessionAge / dayInMs)} days old`);
              removedSessions++; // Count for dry run
            } else {
              console.log(`🧹 Removing orphaned session: ${session.id} (${session.name}) - directory missing and session is ${Math.round(sessionAge / dayInMs)} days old`);
              this.store.deleteSession(session.id);
              removedSessions++;
            }
          }
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
      
      // Stage all changes before diff tracking so FileDiffTracker can see them
      const git = new GitOps(worktreePath);
      await git.stageAllChanges(worktreePath);
      console.log(`[TRACK] Staged all changes before diff tracking`);
      
      const fileDiffTracker = new FileDiffTracker(this.logger);
      const fileChanges = await fileDiffTracker.getFileChanges(worktreePath);
      
      console.log(`[TRACK] Found ${fileChanges.length} file changes:`, fileChanges.map(c => `${c.path}: +${c.linesAdded}/-${c.linesDeleted}`));
      this.logger.debug(`[TRACK] Found ${fileChanges.length} file changes:`, fileChanges.map(c => `${c.path}: +${c.linesAdded}/-${c.linesDeleted}`));
      
      // Publish file edit events
      for (const change of fileChanges) {
        this.logger.debug(`[TRACK] Publishing file_edit event for ${change.path}: +${change.linesAdded}/-${change.linesDeleted}`);
        
        // Publish to metrics event bus
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
        
        // Also store as stream event for UI consumption
        if (this.store) {
          try {
            this.store.addStreamEvent(sessionId, 'file_edit', new Date().toISOString(), {
              path: change.path,
              linesAdded: change.linesAdded,
              linesDeleted: change.linesDeleted,
              operation: change.operation
            });
          } catch (error) {
            this.logger.error('Failed to store file_edit as stream event:', error);
          }
        }
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

  /**
   * Continue a thread directly using the same logic as interactive mode
   * This bypasses the complex iteration logic and uses direct thread continuation
   */
  async continueThreadDirectly(
    sessionId: string,
    threadId: string, 
    prompt: string,
    modelOverride?: string
  ): Promise<void> {
    const session = this.store.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    console.log(`🔗 Continuing thread ${threadId} with prompt: ${prompt.slice(0, 100)}...`);

    // Use direct thread continuation like interactive mode
    const result = await this.ampAdapter.runThreadContinue(
      threadId,
      prompt,
      session.worktreePath,
      modelOverride || session.modelOverride,
      sessionId
    );

    if (!result.success) {
      console.error(`❌ Thread continuation failed: ${result.output}`);
      throw new Error(`Thread continuation failed: ${result.output}`);
    }

    console.log(`✅ Thread continuation completed successfully`);
  }
}

// Helper to read file synchronously
function readFileSync(path: string, encoding: BufferEncoding): string {
  return fs.readFileSync(path, encoding);
}

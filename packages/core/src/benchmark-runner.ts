import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'yaml';
import type { Session, SweBenchCase, AmpRuntimeConfig } from '@ampsm/types';
import { SessionStore } from './store.js';
import { WorktreeManager } from './worktree.js';
import { SweBenchRunner } from './swebench-runner.js';

export interface BenchmarkConfig {
  version: number;
  name: string;
  description: string;
  defaults: {
    base_branch: string;
    parallel: number;
    max_iterations: number;
    timeout_sec: number;
    json_logs: boolean;
    merge_on_pass: boolean;
    amp_cli_path?: string;
    amp_server_url?: string;
  };
  models: Record<string, {
    name: string;
    amp_args?: string[];
    env?: Record<string, string>;
  }>;
  metrics: string[];
  suites: Array<{
    id: string;
    description: string;
    cases?: Array<{
      id: string;
      repo: string;
      prompt: string;
      follow_up_prompts?: string[];
      script_command?: string;
      setup_script?: string;
      amp_cli_path?: string;
      amp_server_url?: string;
    }>;
    swebench_cases_dir?: string;
    max_iterations?: number;
    timeout_sec?: number;
    amp_cli_path?: string;
    amp_server_url?: string;
  }>;
}

export interface BenchmarkResult {
  id: string;
  configPath: string;
  startTime: Date;
  endTime?: Date;
  models: Record<string, ModelResult>;
  status: 'running' | 'completed' | 'failed';
}

export interface ModelResult {
  model: string;
  suites: Record<string, SuiteResult>;
  metrics: Record<string, number>;
}

export interface SuiteResult {
  suite: string;
  cases: Array<{
    caseId: string;
    sessionId?: string;
    status: 'pass' | 'fail' | 'timeout' | 'error';
    iterations: number;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    costUsd?: number;
    wallTimeSec: number;
  }>;
  summary: {
    total: number;
    passed: number;
    failed: number;
    successRate: number;
  };
}

export class BenchmarkRunner extends EventEmitter {
  private store: SessionStore;
  private worktreeManager: WorktreeManager;
  private sweBenchRunner: SweBenchRunner;
  private runningBenchmarks: Map<string, boolean> = new Map();

  constructor(store: SessionStore, dbPath: string, private runtimeConfig?: AmpRuntimeConfig) {
    super();
    this.store = store;
    this.worktreeManager = new WorktreeManager(store, dbPath, undefined, undefined, runtimeConfig);
    this.sweBenchRunner = new SweBenchRunner(store, dbPath);
  }

  async runBenchmark(configPath: string): Promise<BenchmarkResult> {
    const benchmarkId = randomUUID();
    const config = await this.loadConfig(configPath);
    
    console.log(`🚀 Starting benchmark: ${config.name}`);
    
    // Create a SweBenchRun entry that the UI can track
    const sweBenchRun = this.store.createSweBenchRun({
      id: benchmarkId,
      name: config.name,
      casesDir: configPath,
      total: this.calculateTotalCases(config),
      completed: 0,
      passed: 0,
      failed: 0,
      status: 'running'
    });
    
    const result: BenchmarkResult = {
      id: benchmarkId,
      configPath,
      startTime: new Date(),
      models: {},
      status: 'running'
    };

    this.runningBenchmarks.set(benchmarkId, true);
    this.emit('run-started', sweBenchRun);

    try {
      // Run evaluation for each model IN PARALLEL
      const modelPromises = Object.entries(config.models).map(async ([modelKey, modelConfig]) => {
        const sweBenchRun = this.store.getSweBenchRun(benchmarkId);
        if (!this.runningBenchmarks.get(benchmarkId) || sweBenchRun?.status === 'aborted') return;
        
        console.log(`🤖 Testing model: ${modelKey} (${modelConfig.name})`);
        
        const modelResult: ModelResult = {
          model: modelKey,
          suites: {},
          metrics: {}
        };

        // Run each suite for this model
        for (const suite of config.suites) {
          const currentSweBenchRun = this.store.getSweBenchRun(benchmarkId);
          if (!this.runningBenchmarks.get(benchmarkId) || currentSweBenchRun?.status === 'aborted') break;
          
          console.log(`📊 Running suite: ${suite.id} for model: ${modelKey}`);
          try {
            const suiteResult = await this.runSuite(suite, modelConfig, config.defaults, benchmarkId);
            modelResult.suites[suite.id] = suiteResult;
            
            // Update progress after each suite completion
            const currentResult: BenchmarkResult = {
              id: benchmarkId,
              configPath,
              startTime: result.startTime,
              models: { ...result.models, [modelKey]: modelResult },
              status: 'running'
            };
            
            this.store.updateSweBenchRun(benchmarkId, {
              completed: this.calculateCompletedCases(currentResult),
              passed: this.calculatePassedCases(currentResult),
              failed: this.calculateFailedCases(currentResult)
            });
            
          } catch (error) {
            console.error(`❌ Suite ${suite.id} failed for model ${modelKey}:`, error);
            // Create empty suite result to continue execution
            modelResult.suites[suite.id] = {
              suite: suite.id,
              cases: [],
              summary: { total: 0, passed: 0, failed: 0, successRate: 0 }
            };
          }
        }

        // Calculate aggregate metrics for this model
        modelResult.metrics = this.calculateModelMetrics(modelResult.suites, config.metrics);
        result.models[modelKey] = modelResult;
        
        return { modelKey, modelResult };
      });

      // Wait for all models to complete
      const completedModels = await Promise.allSettled(modelPromises);
      
      // Process results
      completedModels.forEach((settledResult, index) => {
        if (settledResult.status === 'fulfilled' && settledResult.value) {
          const { modelKey, modelResult } = settledResult.value;
          result.models[modelKey] = modelResult;
        } else if (settledResult.status === 'rejected') {
          const modelKey = Object.keys(config.models)[index];
          console.error(`❌ Model ${modelKey} failed:`, settledResult.reason);
        }
      });
      
      // Update progress in the UI
      this.store.updateSweBenchRun(benchmarkId, {
        completed: this.calculateCompletedCases(result),
        passed: this.calculatePassedCases(result),
        failed: this.calculateFailedCases(result)
      });
      
      const updatedRun = this.store.getSweBenchRun(benchmarkId);
      this.emit('run-updated', { runId: benchmarkId, run: updatedRun });

      result.endTime = new Date();
      result.status = 'completed';
      
      // Update final status
      this.store.updateSweBenchRun(benchmarkId, {
        status: 'done',
        completed: this.calculateCompletedCases(result),
        passed: this.calculatePassedCases(result),
        failed: this.calculateFailedCases(result)
      });
      
    } catch (error) {
      result.status = 'failed';
      console.error(`❌ Benchmark failed:`, error);
      
      this.store.updateSweBenchRun(benchmarkId, {
        status: 'aborted'
      });
    } finally {
      this.runningBenchmarks.delete(benchmarkId);
    }

    const finalRun = this.store.getSweBenchRun(benchmarkId);
    this.emit('run-finished', finalRun);
    return result;
  }

  private async loadConfig(configPath: string): Promise<BenchmarkConfig> {
    const content = fs.readFileSync(configPath, 'utf-8');
    return parse(content);
  }

  private async runSuite(
    suite: any, 
    modelConfig: any, 
    defaults: any,
    runId: string
  ): Promise<SuiteResult> {
    // Create suite-specific WorktreeManager if amp configuration is set
    const suiteAmpPath = suite.amp_cli_path ?? defaults.amp_cli_path;
    const suiteAmpServer = suite.amp_server_url ?? defaults.amp_server_url;
    let suiteWorktreeManager = this.worktreeManager;
    
    if ((suiteAmpPath && suiteAmpPath !== 'production') || suiteAmpServer) {
      const runtimeConfig: AmpRuntimeConfig = { 
        ampCliPath: suiteAmpPath === 'production' ? undefined : suiteAmpPath,
        ampServerUrl: suiteAmpServer
      };
      suiteWorktreeManager = new WorktreeManager(this.store, '', undefined, undefined, runtimeConfig);
    }
    const result: SuiteResult = {
      suite: suite.id,
      cases: [],
      summary: { total: 0, passed: 0, failed: 0, successRate: 0 }
    };

    // Handle SWE-bench suite
    if (suite.swebench_cases_dir) {
      const sweBenchResult = await this.runSweBenchSuite(suite, modelConfig, defaults);
      return sweBenchResult;
    }

    // Handle regular cases
    if (suite.cases) {
      for (const caseConfig of suite.cases) {
        // Handle case-level amp configuration override
        let caseWorktreeManager = suiteWorktreeManager;
        const caseAmpPath = caseConfig.amp_cli_path ?? suite.amp_cli_path ?? defaults.amp_cli_path;
        const caseAmpServer = caseConfig.amp_server_url ?? suite.amp_server_url ?? defaults.amp_server_url;
        
        const currentSuiteAmpPath = suite.amp_cli_path ?? defaults.amp_cli_path;
        const currentSuiteAmpServer = suite.amp_server_url ?? defaults.amp_server_url;
        
        if (caseAmpPath !== currentSuiteAmpPath || caseAmpServer !== currentSuiteAmpServer) {
          const runtimeConfig: AmpRuntimeConfig = { 
            ampCliPath: caseAmpPath === 'production' ? undefined : caseAmpPath,
            ampServerUrl: caseAmpServer
          };
          caseWorktreeManager = new WorktreeManager(this.store, '', undefined, undefined, runtimeConfig);
        }
        
        const caseResult = await this.runCase(caseConfig, modelConfig, defaults, suite, runId, caseWorktreeManager);
        result.cases.push(caseResult);
      }
    }

    // Calculate summary
    result.summary.total = result.cases.length;
    result.summary.passed = result.cases.filter(c => c.status === 'pass').length;
    result.summary.failed = result.summary.total - result.summary.passed;
    result.summary.successRate = result.summary.total > 0 ? result.summary.passed / result.summary.total : 0;

    return result;
  }

  private async runSweBenchSuite(
    suite: any,
    modelConfig: any,
    defaults: any
  ): Promise<SuiteResult> {
    // Create a temporary SWE-bench run
    const casesDir = path.isAbsolute(suite.swebench_cases_dir) 
      ? suite.swebench_cases_dir 
      : path.resolve(process.cwd(), suite.swebench_cases_dir);
    const runOptions = {
      casesDir,
      name: `Benchmark-${suite.id}-${modelConfig.name}`,
      parallel: defaults.parallel,
      maxIterations: suite.max_iterations || defaults.max_iterations,
      timeoutSec: suite.timeout_sec || defaults.timeout_sec
    };

    // Set environment for this model
    const originalEnv = { ...process.env };
    if (modelConfig.env) {
      Object.assign(process.env, modelConfig.env);
    }

    try {
      console.log(`🔍 Loading cases from: ${casesDir}`);
      const sweBenchRun = await this.sweBenchRunner.run(runOptions);
      if (!sweBenchRun) {
        throw new Error('SweBenchRunner.run() returned undefined');
      }
      
      const caseResults = await this.sweBenchRunner.getResults(sweBenchRun.id);
      
      const cases = caseResults.map(cr => ({
        caseId: cr.caseId,
        sessionId: cr.sessionId,
        status: cr.status,
        iterations: cr.iterations,
        wallTimeSec: cr.wallTimeSec
      }));

      return {
        suite: suite.id,
        cases,
        summary: {
          total: sweBenchRun.total,
          passed: sweBenchRun.passed,
          failed: sweBenchRun.failed,
          successRate: sweBenchRun.total > 0 ? sweBenchRun.passed / sweBenchRun.total : 0
        }
      };
    } catch (error) {
      console.error(`❌ SWE-bench suite ${suite.id} failed:`, error);
      throw error;
    } finally {
      // Restore original environment
      process.env = originalEnv;
    }
  }

  private async runCase(
    caseConfig: any,
    modelConfig: any,
    defaults: any,
    suite: any,
    runId: string,
    worktreeManager?: WorktreeManager
  ): Promise<any> {
    const startTime = Date.now();
    
    // Set environment for this model
    const originalEnv = { ...process.env };
    if (modelConfig.env) {
      Object.assign(process.env, modelConfig.env);
    }

    try {
      console.log(`🔧 Creating benchmark session for ${caseConfig.id} with script: ${caseConfig.script_command}`);
      // Create session
      const manager = worktreeManager || this.worktreeManager;
      const session = await manager.createSession({
        name: `Benchmark-${suite.id}-${caseConfig.id}`,
        ampPrompt: caseConfig.prompt,
        repoRoot: await this.ensureTestRepo(caseConfig.repo),
        baseBranch: defaults.base_branch,
        scriptCommand: caseConfig.script_command,
        modelOverride: modelConfig.name === 'default' ? undefined : modelConfig.name
      });
      console.log(`✅ Session created: ${session.id}, scriptCommand: ${session.scriptCommand}`);

      // Run setup script if provided
      if (caseConfig.setup_script) {
        await this.execCommand(caseConfig.setup_script, session.worktreePath);
      }

      // Run follow-up prompts if provided (ensures multi-turn for alloy)
      if (caseConfig.follow_up_prompts) {
        console.log(`🔄 Running ${caseConfig.follow_up_prompts.length} follow-up prompts for ${caseConfig.id}`);
        
        // Debug: check session threads before follow-ups
        const sessionBefore = this.store.getSession(session.id);
        const threadsBefore = this.store.getSessionThreads(session.id);
        console.log(`🔍 DEBUG - Before follow-ups:`);
        console.log(`   Session threadId: ${sessionBefore?.threadId || 'NOT SET'}`);
        console.log(`   Threads in DB: ${threadsBefore.length}`);
        threadsBefore.forEach(t => console.log(`     - Thread: ${t.id.slice(0, 8)}..., Messages: ${t.messageCount}`));
        
        for (let i = 0; i < caseConfig.follow_up_prompts.length; i++) {
          const followUpPrompt = caseConfig.follow_up_prompts[i];
          console.log(`🔄 Follow-up ${i + 1}/${caseConfig.follow_up_prompts.length}: ${followUpPrompt.slice(0, 100)}...`);
          
          // Get the current session state to check for thread ID
          const currentSession = this.store.getSession(session.id);
          if (!currentSession?.threadId) {
            console.error(`❌ No thread ID found for session ${session.id} - cannot continue thread`);
            throw new Error(`Session ${session.id} has no thread ID for follow-up prompt`);
          }
          
          console.log(`🔗 Using thread continuation with threadId: ${currentSession.threadId}`);
          
          // Use direct thread continuation like interactive mode (bypass worktreeManager.iterate)
          // This ensures we use the same logic that works in interactive mode
          await manager.continueThreadDirectly(
            session.id,
            currentSession.threadId,
            followUpPrompt,
            session.modelOverride
          );
          
          console.log(`✅ Follow-up ${i + 1} completed successfully`);
          
          // Debug: check session threads after each follow-up
          const sessionAfter = this.store.getSession(session.id);
          const threadsAfter = this.store.getSessionThreads(session.id);
          console.log(`🔍 DEBUG - After follow-up ${i + 1}:`);
          console.log(`   Session threadId: ${sessionAfter?.threadId || 'NOT SET'}`);
          console.log(`   Threads in DB: ${threadsAfter.length}`);
          threadsAfter.forEach(t => console.log(`     - Thread: ${t.id.slice(0, 8)}..., Messages: ${t.messageCount}`));
        }
      }

      // Check if test passes
      console.log(`🧪 Testing case ${caseConfig.id} with command: ${session.scriptCommand}`);
      const success = await this.checkTestSuccess(session);
      console.log(`📊 Test result for ${caseConfig.id}: ${success ? 'PASS' : 'FAIL'}`);
      const wallTimeSec = (Date.now() - startTime) / 1000;
      const iterations = this.store.getIterations(session.id).length;

      const caseResult = {
        runId,
        caseId: caseConfig.id,
        sessionId: session.id,
        status: success ? 'pass' as const : 'fail' as const,
        iterations,
        wallTimeSec
      };

      // Save the case result to the database
      this.store.saveSweBenchCaseResult(caseResult);

      // Emit an event to notify the UI of the case completion
      console.log('🔄 BenchmarkRunner: Emitting case-finished event');
      this.emit('case-finished', { runId, caseId: caseConfig.id, result: caseResult });

      return caseResult;

    } catch (error) {
      console.error(`❌ Benchmark case ${caseConfig.id} failed:`, error);
      const wallTimeSec = (Date.now() - startTime) / 1000;
      
      const caseResult = {
        runId,
        caseId: caseConfig.id,
        sessionId: '',
        status: 'fail' as const,
        iterations: 0,
        wallTimeSec
      };

      // Save the error case result to the database
      this.store.saveSweBenchCaseResult(caseResult);

      return caseResult;
    } finally {
      // Restore original environment
      process.env = originalEnv;
    }
  }

  private async ensureTestRepo(repo: string): Promise<string> {
    // Handle absolute paths directly
    if (path.isAbsolute(repo)) {
      if (!fs.existsSync(repo)) {
        throw new Error(`Repository path does not exist: ${repo}`);
      }
      return repo;
    }
    
    // Handle GitHub repos (org/repo format)
    const repoName = repo.replace('/', '_');
    const repoPath = path.join(process.env.HOME || '~', '.amp-repos', repoName);
    
    if (!fs.existsSync(repoPath)) {
      const cacheDir = path.dirname(repoPath);
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }
      await this.execCommand(`git clone https://github.com/${repo}.git "${repoPath}"`);
    }
    
    return repoPath;
  }

  private async checkTestSuccess(session: Session): Promise<boolean> {
    if (!session.scriptCommand) return true;
    
    try {
      await this.execCommand(session.scriptCommand, session.worktreePath);
      return true;
    } catch {
      return false;
    }
  }

  private calculateModelMetrics(suites: Record<string, SuiteResult>, metricNames: string[]): Record<string, number> {
    const metrics: Record<string, number> = {};
    
    const allCases = Object.values(suites).flatMap(suite => suite.cases);
    const totalCases = allCases.length;
    const passedCases = allCases.filter(c => c.status === 'pass').length;
    
    if (metricNames.includes('success_rate')) {
      metrics.success_rate = totalCases > 0 ? passedCases / totalCases : 0;
    }
    
    if (metricNames.includes('avg_iterations')) {
      const totalIterations = allCases.reduce((sum, c) => sum + c.iterations, 0);
      metrics.avg_iterations = totalCases > 0 ? totalIterations / totalCases : 0;
    }
    
    if (metricNames.includes('total_runtime_sec')) {
      metrics.total_runtime_sec = allCases.reduce((sum, c) => sum + c.wallTimeSec, 0);
    }

    return metrics;
  }

  private calculateTotalCases(config: BenchmarkConfig): number {
    let total = 0;
    for (const suite of config.suites) {
      if (suite.cases) {
        total += suite.cases.length;
      }
      if (suite.swebench_cases_dir) {
        // Estimate based on directory - could be more accurate by reading files
        try {
          const resolvedPath = path.isAbsolute(suite.swebench_cases_dir)
            ? suite.swebench_cases_dir
            : path.resolve(process.cwd(), suite.swebench_cases_dir);
          const files = require('fs').readdirSync(resolvedPath).filter((f: string) => f.endsWith('.json'));
          total += files.length;
        } catch {
          total += 10; // Default estimate
        }
      }
    }
    return total;
  }

  private calculateCompletedCases(result: BenchmarkResult): number {
    return Object.values(result.models)
      .flatMap(model => Object.values(model.suites))
      .reduce((sum, suite) => sum + suite.cases.length, 0);
  }

  private calculatePassedCases(result: BenchmarkResult): number {
    return Object.values(result.models)
      .flatMap(model => Object.values(model.suites))
      .flatMap(suite => suite.cases)
      .filter(c => c.status === 'pass')
      .length;
  }

  private calculateFailedCases(result: BenchmarkResult): number {
    return Object.values(result.models)
      .flatMap(model => Object.values(model.suites))
      .flatMap(suite => suite.cases)
      .filter(c => c.status === 'fail')
      .length;
  }

  private execCommand(command: string, cwd?: string): Promise<string> {
    return new Promise(async (resolve, reject) => {
      const proc = spawn('sh', ['-c', command], { 
        cwd, 
        stdio: ['ignore', 'pipe', 'pipe'] 
      });
      
      let stdout = '';
      let stderr = '';
      
      proc.stdout.on('data', (data: any) => stdout += data.toString());
      proc.stderr.on('data', (data: any) => stderr += data.toString());
      
      proc.on('close', (code: number) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Command failed (${code}): ${stderr}`));
        }
      });
    });
  }
}

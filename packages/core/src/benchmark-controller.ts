import { EventEmitter } from 'events';
import { SessionStore } from './store.js';
import { MetricsEventBus } from './metrics/index.js';
import type { AmpSettings } from '@ampsm/types';
import { randomUUID } from 'crypto';
import { BenchmarkRunner } from '@ampsm/bench-core';

export interface BenchmarkRunSummary {
  runId: string;
  name: string;
  type: 'yaml' | 'swebench' | 'custom';
  createdAt: string;
  status: 'running' | 'completed' | 'aborted' | 'error';
  totalCases: number;
  completedCases: number;
  passedCases: number;
  failedCases: number;
  totalTokens?: number;
  totalCost?: number;
  duration?: number;
}

export interface BenchmarkStartOptions {
  type: 'yaml' | 'swebench' | 'custom';
  yamlConfigPath?: string;
  casesDir?: string;
  name?: string;
  parallel?: number;
  maxIterations?: number;
  timeoutSec?: number;
  filter?: string;
  models?: string[];
}

export class BenchmarkController extends EventEmitter {
  private activeRuns = new Map<string, { runner: BenchmarkRunner | any; abortController: AbortController }>();

  constructor(
    private store: SessionStore, 
    private dbPath?: string, 
    private metricsEventBus?: MetricsEventBus,
    private ampSettings?: AmpSettings
  ) {
    super();
  }

  async start(options: BenchmarkStartOptions): Promise<string> {
    const runId = randomUUID();
    const abortController = new AbortController();
    
    this.emit('run-started', { runId, type: options.type });
    
    // Execute the benchmark in the background without blocking
    // Use setImmediate to push execution to the next event loop iteration
    setImmediate(() => {
      this.executeBenchmarkAsync(runId, options, abortController).catch(error => {
        console.error('Background benchmark execution failed:', error);
        this.activeRuns.delete(runId);
        this.emit('run-finished', { 
          runId, 
          type: 'error', 
          error: error instanceof Error ? error.message : String(error) 
        });
      });
    });
    
    return runId;
  }

  private async executeBenchmarkAsync(
    runId: string, 
    options: BenchmarkStartOptions, 
    abortController: AbortController
  ) {
    try {
      if (options.type === 'yaml') {
        if (!options.yamlConfigPath) {
          throw new Error('YAML config path is required');
        }

        const benchmarkRunner = new BenchmarkRunner({
          workingDir: this.findProjectRoot(),
          outputDir: this.dbPath ? require('path').join(this.dbPath, '..', 'benchmark-results') : './benchmark-results',
          parallel: options.parallel || 1,
          models: options.models,
          reportFormats: ['json', 'markdown', 'html'],
          ampSettings: this.ampSettings,
          sessionStore: this.store,
          metricsBus: this.metricsEventBus
        });

        // Store the runner for potential abort
        this.activeRuns.set(runId, { runner: benchmarkRunner, abortController });

        // Forward events from runner
        benchmarkRunner.on('benchmark_started', (data: any) => {
          this.emit('run-updated', { runId, type: 'benchmark_started', data });
        });

        benchmarkRunner.on('case_completed', (data: any) => {
          this.emit('run-updated', { runId, type: 'case_completed', data });
        });

        benchmarkRunner.on('benchmark_completed', (data: any) => {
          this.activeRuns.delete(runId);
          this.emit('run-finished', { runId, type: 'benchmark_completed', data });
        });

        benchmarkRunner.on('benchmark_failed', (error: any) => {
          this.activeRuns.delete(runId);
          this.emit('run-finished', { runId, type: 'benchmark_failed', error });
        });

        // Run the benchmark
        await benchmarkRunner.runBenchmark(options.yamlConfigPath);
        
      } else if (options.type === 'swebench') {
        const { SweBenchRunner } = require('./swebench-runner.js');
        const sweBenchRunner = new SweBenchRunner(this.store, this.dbPath);
        
        const runnerOptions = {
          casesDir: options.casesDir!,
          name: options.name || `SWE-bench Run ${new Date().toISOString().slice(0, 19)}`,
          parallel: options.parallel || 1,
          maxIterations: options.maxIterations || 10,
          timeoutSec: options.timeoutSec || 300,
          filter: options.filter
        };

        // Store the runner for potential abort
        this.activeRuns.set(runId, { runner: sweBenchRunner, abortController });

        // Forward events
        sweBenchRunner.on('run-started', (data: any) => {
          this.emit('run-updated', { runId, ...data });
        });

        sweBenchRunner.on('run-updated', (data: any) => {
          this.emit('run-updated', { runId, ...data });
        });

        sweBenchRunner.on('run-finished', (data: any) => {
          this.activeRuns.delete(runId);
          this.emit('run-finished', { runId, ...data });
        });

        sweBenchRunner.on('run-aborted', (data: any) => {
          this.activeRuns.delete(runId);
          this.emit('run-finished', { runId, ...data });
        });

        // Run the benchmark
        await sweBenchRunner.run(runnerOptions);
        
      } else {
        throw new Error(`Unsupported benchmark type: ${options.type}`);
      }
    } catch (error) {
      this.activeRuns.delete(runId);
      this.emit('run-finished', { 
        runId, 
        type: 'error', 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  }

  async abort(runId: string): Promise<void> {
    const run = this.activeRuns.get(runId);
    if (!run) {
      return; // Already finished or not found
    }

    try {
      // Signal abort to the runner
      run.abortController.abort();
      
      // Call runner-specific abort method if available
      if (run.runner.abortRun) {
        await run.runner.abortRun(runId);
      } else if (run.runner.abort) {
        await run.runner.abort();
      }
      
      this.activeRuns.delete(runId);
      this.emit('run-aborted', { runId });
    } catch (error) {
      console.error('Failed to abort benchmark:', error);
      throw error;
    }
  }

  async listRuns(): Promise<BenchmarkRunSummary[]> {
    const runs: BenchmarkRunSummary[] = [];
    
    try {
      // Get SWE-bench runs from database
      const { SweBenchRunner } = require('./swebench-runner.js');
      const sweBenchRunner = new SweBenchRunner(this.store, this.dbPath);
      const sweBenchRuns = await sweBenchRunner.listRuns();
      
      runs.push(...sweBenchRuns.map((run: any) => ({
        runId: run.id,
        name: run.name || 'SWE-bench Run',
        type: 'swebench' as const,
        createdAt: run.createdAt,
        status: run.status,
        totalCases: run.total,
        completedCases: run.completed,
        passedCases: run.passed,
        failedCases: run.failed
      })));
    } catch (error) {
      console.error('Failed to get SWE-bench runs:', error);
    }

    try {
      // Get YAML benchmark runs from files
      const benchmarkRunner = new BenchmarkRunner({
        outputDir: this.dbPath ? require('path').join(this.dbPath, '..', 'benchmark-results') : './benchmark-results'
      });
      
      const yamlRuns = await benchmarkRunner.listRuns();
      
      runs.push(...yamlRuns.map((run: any) => ({
        runId: run.benchmark_name,
        name: run.benchmark_name,
        type: 'yaml' as const,
        createdAt: run.started,
        status: run.ended ? 'completed' as const : 'running' as const,
        totalCases: run.summary?.total_cases || 0,
        completedCases: run.summary?.total_cases || 0,
        passedCases: run.summary?.passed_cases || 0,
        failedCases: (run.summary?.total_cases || 0) - (run.summary?.passed_cases || 0),
        totalTokens: (run.summary?.total_prompt_tokens || 0) + (run.summary?.total_completion_tokens || 0),
        totalCost: run.summary?.total_cost_usd,
        duration: run.total_duration_sec
      })));
    } catch (error) {
      console.error('Failed to get YAML benchmark runs:', error);
    }

    return runs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getRun(runId: string): Promise<BenchmarkRunSummary | null> {
    const runs = await this.listRuns();
    return runs.find(run => run.runId === runId) || null;
  }

  async delete(runId: string): Promise<void> {
    // Abort if running
    await this.abort(runId);
    
    try {
      // Try YAML benchmark deletion first
      const benchmarkRunner = new BenchmarkRunner({
        outputDir: this.dbPath ? require('path').join(this.dbPath, '..', 'benchmark-results') : './benchmark-results'
      });
      
      const deleted = await benchmarkRunner.deleteBenchmarkRun(runId);
      if (deleted) {
        this.emit('run-deleted', { runId });
        return;
      }
    } catch (error) {
      console.log('No YAML benchmark found, trying SWE-bench');
    }

    try {
      // Try SWE-bench deletion
      const { SweBenchRunner } = require('./swebench-runner.js');
      const sweBenchRunner = new SweBenchRunner(this.store, this.dbPath);
      await sweBenchRunner.deleteRun(runId);
      this.emit('run-deleted', { runId });
    } catch (error) {
      console.error('Failed to delete benchmark run:', error);
      throw error;
    }
  }

  async getBenchmarkResult(runId: string): Promise<any> {
    try {
      // Try YAML benchmark first
      const benchmarkRunner = new BenchmarkRunner({
        outputDir: this.dbPath ? require('path').join(this.dbPath, '..', 'benchmark-results') : './benchmark-results'
      });
      
      return await benchmarkRunner.getBenchmarkResult(runId);
    } catch (error) {
      // Try SWE-bench results
      const { SweBenchRunner } = require('./swebench-runner.js');
      const sweBenchRunner = new SweBenchRunner(this.store, this.dbPath);
      return await sweBenchRunner.getResults(runId);
    }
  }

  updateAmpSettings(ampSettings: AmpSettings) {
    this.ampSettings = ampSettings;
  }

  private findProjectRoot(): string {
    const { existsSync } = require('fs');
    const path = require('path');
    
    // Try to find project root by looking for package.json
    let dir = process.cwd();
    while (dir !== path.dirname(dir)) {
      if (existsSync(path.join(dir, 'package.json')) && 
          existsSync(path.join(dir, 'configs'))) {
        return dir;
      }
      dir = path.dirname(dir);
    }
    
    return process.cwd();
  }

  private async monitorRun(runId: string) {
    // Simple polling-based monitoring similar to BatchController
    const pollInterval = 1000; // 1 second
    
    const poll = async () => {
      const run = await this.getRun(runId);
      if (!run) return;

      if (run.status === 'running') {
        this.emit('run-updated', { runId, run });
        setTimeout(poll, pollInterval);
      } else {
        this.emit('run-finished', { runId, run });
      }
    };

    setTimeout(poll, pollInterval);
  }
}

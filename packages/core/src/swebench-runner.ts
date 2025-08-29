import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { cpus } from 'os';
import type { SweBenchCase, SweBenchRun, SweBenchCaseResult, Session } from '@ampsm/types';
import { SessionStore } from './store.js';
import { WorktreeManager } from './worktree.js';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export interface SweBenchRunnerOptions {
  casesDir: string;
  name: string;
  parallel?: number;
  maxIterations?: number;
  timeoutSec?: number;
  filter?: string;
}

export class SweBenchRunner extends EventEmitter {
  private store: SessionStore;
  private worktreeManager: WorktreeManager;
  private repoCache: Map<string, string> = new Map();
  private runningProcesses: Map<string, boolean> = new Map();

  constructor(store: SessionStore, dbPath: string) {
    super();
    this.store = store;
    this.worktreeManager = new WorktreeManager(store, dbPath);
  }

  async run(options: SweBenchRunnerOptions): Promise<SweBenchRun> {
    const runId = randomUUID();
    
    try {
      console.log(`🔍 Loading cases from: ${options.casesDir}`);
      const cases = await this.loadCases(options.casesDir, options.filter);
      console.log(`🔍 Loaded ${cases.length} cases:`, cases.map(c => c.id));
      
      const run = this.store.createSweBenchRun({
        id: runId,
        name: options.name,
        casesDir: options.casesDir,
        total: cases.length,
        completed: 0,
        passed: 0,
        failed: 0,
        status: 'running'
      });

      console.log(`🚀 Starting SWE-bench run with ${cases.length} cases`);
      this.emit('run-started', run);
      
      // Mark as running
      this.runningProcesses.set(runId, true);

      const parallel = options.parallel || Math.max(1, cpus().length - 1);
      const maxIterations = options.maxIterations || 10;
      const timeoutSec = options.timeoutSec || 300;

      console.log(`⚙️ Processing ${cases.length} cases with parallelism=${parallel}, maxIterations=${maxIterations}`);

      // Process cases in parallel batches
      const batches = this.chunkArray(cases, parallel);
      
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        // Check if run was aborted
        if (!this.runningProcesses.get(runId)) {
          console.log(`🛑 Run ${runId} was aborted`);
          break;
        }
        
        const batch = batches[batchIndex];
        console.log(`📊 Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} cases)`);
        
        const promises = batch.map(caseItem => 
          this.processCase(runId, caseItem, maxIterations, timeoutSec)
        );
        
        await Promise.allSettled(promises);
      }

      // Update final status
      const results = this.store.getSweBenchCaseResults(runId);
      const passed = results.filter(r => r.status === 'pass').length;
      const failed = results.filter(r => r.status === 'fail').length;

      this.store.updateSweBenchRun(runId, {
        status: 'done',
        completed: results.length,
        passed,
        failed
      });

      // Clean up running process tracking
      this.runningProcesses.delete(runId);
      
      const finalRun = this.store.getSweBenchRun(runId)!;
      console.log(`✅ SWE-bench run completed: ${runId} (${passed}/${results.length} passed)`);
      this.emit('run-finished', finalRun);
      
      return finalRun;
      
    } catch (error) {
      console.error(`❌ SWE-bench run ${runId} failed with error:`, error);
      
      // Clean up and mark as failed
      this.runningProcesses.delete(runId);
      this.store.updateSweBenchRun(runId, {
        status: 'aborted'
      });
      
      const failedRun = this.store.getSweBenchRun(runId)!;
      this.emit('run-error', { runId, error: error instanceof Error ? error.message : String(error) });
      
      return failedRun;
    }
  }

  private async loadCases(casesDir: string, filter?: string): Promise<SweBenchCase[]> {
    // Look for JSON files in the cases directory
    console.log(`🔍 Reading directory: ${casesDir}`);
    const files = fs.readdirSync(casesDir).filter(f => f.endsWith('.json'));
    console.log(`🔍 Found JSON files:`, files);
    
    if (files.length === 0) {
      throw new Error(`No JSON files found in ${casesDir}`);
    }

    const allCases: SweBenchCase[] = [];
    
    for (const file of files) {
      const content = fs.readFileSync(path.join(casesDir, file), 'utf-8');
      const data = JSON.parse(content);
      
      // Support both single case files and arrays of cases
      const cases = Array.isArray(data) ? data : [data];
      allCases.push(...cases);
    }

    // Apply filter if provided
    if (filter) {
      return allCases.filter(c => c.id.includes(filter) || c.repo.includes(filter));
    }

    return allCases;
  }

  private async processCase(
    runId: string, 
    caseItem: SweBenchCase, 
    maxIterations: number, 
    timeoutSec: number
  ): Promise<void> {
    const startTime = Date.now();
    console.log(`🔧 Starting case: ${caseItem.id} (${caseItem.repo})`);
    this.emit('case-started', { runId, caseId: caseItem.id });

    try {
      // Check if run was aborted before starting
      if (!this.runningProcesses.get(runId)) {
        console.log(`🛑 Case ${caseItem.id} skipped - run was aborted`);
        return;
      }
      // Ensure repo exists locally
      console.log(`📦 Ensuring repo: ${caseItem.repo} at commit ${caseItem.bugCommit}`);
      const repoPath = await this.ensureRepo(caseItem.repo, caseItem.bugCommit);
      console.log(`📦 Repository ensured at: ${repoPath}`);
      
      // Create session with worktree
      const testCommand = (caseItem as any).testCommand || `pytest -xvs ${caseItem.testPath}`;
      console.log(`💼 Creating session with testCommand: ${testCommand}`);
      const session = await this.worktreeManager.createSession({
        name: `SWE-bench: ${caseItem.id}`,
        ampPrompt: caseItem.prompt || this.generateDefaultPrompt(caseItem),
        repoRoot: repoPath,
        baseBranch: caseItem.bugCommit,
        scriptCommand: testCommand
      });
      console.log(`💼 Session created with worktree: ${session.id} at ${session.worktreePath}`);

      // Update session notes with SWE-bench metadata  
      const notes = JSON.stringify({ sweBenchCaseId: caseItem.id, sweBenchRunId: runId });
      const updateStmt = this.store['db'].prepare('UPDATE sessions SET notes = ? WHERE id = ?');
      updateStmt.run(notes, session.id);

      // Run session with timeout
      console.log(`🏃 Starting session execution for ${session.id}`);
      const result = await this.runSessionWithTimeout(session, maxIterations, timeoutSec);
      console.log(`🏁 Session execution completed for ${session.id}:`, result);
      
      const wallTimeSec = (Date.now() - startTime) / 1000;
      const iterations = this.store.getIterations(session.id).length;

      const caseResult: SweBenchCaseResult = {
        runId,
        caseId: caseItem.id,
        sessionId: session.id,
        status: result.success ? 'pass' : 'fail',
        iterations,
        wallTimeSec
      };

      this.store.saveSweBenchCaseResult(caseResult);
      
      // Update run counters
      this.updateRunCounters(runId, result.success);
      
      this.emit('case-finished', { runId, caseId: caseItem.id, result: caseResult });

    } catch (error) {
      const wallTimeSec = (Date.now() - startTime) / 1000;
      
      const caseResult: SweBenchCaseResult = {
        runId,
        caseId: caseItem.id,
        sessionId: '',
        status: 'fail',
        iterations: 0,
        wallTimeSec
      };

      this.store.saveSweBenchCaseResult(caseResult);
      this.updateRunCounters(runId, false);
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.emit('case-error', { runId, caseId: caseItem.id, error: errorMessage });
    }
  }

  private generateDefaultPrompt(caseItem: SweBenchCase): string {
    return `The following pytest test currently fails. Produce a minimal fix to make it pass.

Test: ${caseItem.testPath}

Repository: ${caseItem.repo}
Bug commit: ${caseItem.bugCommit}

Fix the code to make the test pass while maintaining compatibility with existing functionality.`;
  }

  private async ensureRepo(repo: string, commit: string): Promise<string> {
    const cacheKey = `${repo}#${commit}`;
    
    if (this.repoCache.has(cacheKey)) {
      console.log(`📦 Using cached repo: ${this.repoCache.get(cacheKey)}`);
      return this.repoCache.get(cacheKey)!;
    }

    const repoName = repo.replace('/', '_');
    const repoPath = path.join(process.env.HOME || '~', '.amp-repos', repoName);
    console.log(`📦 Repo path will be: ${repoPath}`);
    
    // Create repo cache directory
    const cacheDir = path.dirname(repoPath);
    if (!fs.existsSync(cacheDir)) {
      console.log(`📦 Creating cache directory: ${cacheDir}`);
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    // Clone if doesn't exist
    if (!fs.existsSync(repoPath)) {
      console.log(`📦 Cloning repo: https://github.com/${repo}.git`);
      await this.execCommand(`git clone https://github.com/${repo}.git "${repoPath}"`);
      console.log(`📦 Clone completed`);
    } else {
      console.log(`📦 Repo already exists at ${repoPath}`);
    }

    // Checkout the specific commit
    console.log(`📦 Checking out commit: ${commit}`);
    await this.execCommand(`git checkout ${commit}`, repoPath);
    console.log(`📦 Checkout completed`);
    
    this.repoCache.set(cacheKey, repoPath);
    return repoPath;
  }

  private async runSessionWithTimeout(
    session: Session, 
    maxIterations: number, 
    timeoutSec: number
  ): Promise<{ success: boolean; reason: string }> {
    try {
      // Check if test already passes after initial iteration from createSession
      if (session.scriptCommand) {
        try {
          console.log(`🧪 Running initial test check: ${session.scriptCommand} in ${session.worktreePath}`);
          const testResult = await this.execCommand(session.scriptCommand, session.worktreePath);
          console.log(`🧪 Initial test result for ${session.id}:`, testResult);
          if (testResult.includes('PASSED') || testResult.includes('passed') || testResult.includes('test passed')) {
            return { success: true, reason: `Test passed after initial iteration` };
          }
        } catch (error) {
          console.log(`🧪 Initial test failed for ${session.id}:`, error);
          // Test failed, continue with additional iterations
        }
      }

      // Run additional iterations until test passes or max iterations reached
      for (let i = 0; i < maxIterations - 1; i++) {  // -1 because initial iteration already happened
        console.log(`🔄 Starting iteration ${i + 2}/${maxIterations} for session ${session.id}`);
        try {
          await this.worktreeManager.iterate(session.id);
          console.log(`✅ Iteration ${i + 2} completed for session ${session.id}`);
        } catch (error) {
          console.log(`❌ Iteration ${i + 2} failed for session ${session.id}:`, error);
          return { success: false, reason: `Iteration failed: ${error instanceof Error ? error.message : String(error)}` };
        }
        
        // Check if test passes
        if (session.scriptCommand) {
          try {
            console.log(`🧪 Running test command: ${session.scriptCommand} in ${session.worktreePath}`);
            const testResult = await this.execCommand(session.scriptCommand, session.worktreePath);
            console.log(`🧪 Test result for ${session.id}:`, testResult);
            if (testResult.includes('PASSED') || testResult.includes('passed') || testResult.includes('test passed')) {
              return { success: true, reason: `Test passed after ${i + 2} iterations` };
            }
          } catch (error) {
            console.log(`🧪 Test failed for ${session.id}:`, error);
            // Test failed, continue iterating
          }
        }
      }
      
      return { success: false, reason: `Max iterations (${maxIterations}) reached` };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, reason: `Error during iteration: ${errorMessage}` };
    }
  }

  private updateRunCounters(runId: string, success: boolean) {
    const run = this.store.getSweBenchRun(runId);
    if (!run) return;

    this.store.updateSweBenchRun(runId, {
      completed: run.completed + 1,
      passed: success ? run.passed + 1 : run.passed,
      failed: success ? run.failed : run.failed + 1
    });
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private execCommand(command: string, cwd?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn('sh', ['-c', command], { 
        cwd, 
        stdio: ['ignore', 'pipe', 'pipe'] 
      });
      
      let stdout = '';
      let stderr = '';
      
      proc.stdout.on('data', (data) => stdout += data.toString());
      proc.stderr.on('data', (data) => stderr += data.toString());
      
      proc.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Command failed (${code}): ${stderr}`));
        }
      });
    });
  }

  async listRuns(): Promise<SweBenchRun[]> {
    return this.store.getAllSweBenchRuns();
  }

  async getRun(runId: string): Promise<SweBenchRun | null> {
    return this.store.getSweBenchRun(runId);
  }

  async getResults(runId: string): Promise<SweBenchCaseResult[]> {
    return this.store.getSweBenchCaseResults(runId);
  }

  async deleteRun(runId: string): Promise<void> {
    // Get all case results to find associated sessions
    const caseResults = this.store.getSweBenchCaseResults(runId);
    
    // Clean up associated sessions
    for (const result of caseResults) {
      if (result.sessionId) {
        try {
          console.log(`🗑️ Cleaning up session ${result.sessionId} for deleted benchmark run`);
          await this.worktreeManager.cleanup(result.sessionId);
        } catch (error) {
          console.warn(`⚠️ Failed to cleanup session ${result.sessionId}:`, error);
        }
      }
    }
    
    // Delete the benchmark run and its results
    this.store.deleteSweBenchRun(runId);
  }

  async abortRun(runId: string): Promise<void> {
    console.log(`🛑 Aborting SWE-bench run: ${runId}`);
    
    // Stop the running process
    this.runningProcesses.set(runId, false);
    
    // Update status in database
    this.store.updateSweBenchRun(runId, {
      status: 'aborted'
    });
    
    // Clean up
    this.runningProcesses.delete(runId);
    
    this.emit('run-aborted', { runId });
  }
}

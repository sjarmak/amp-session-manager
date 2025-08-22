import { SessionStore } from './store.js';
import { WorktreeManager } from './worktree.js';
import { MetricsEventBus } from './metrics/index.js';
import type { Plan, PlanItem, BatchRecord, BatchItem } from '@ampsm/types';
import { randomUUID } from 'crypto';
import { readFile } from 'fs/promises';
import { parse as parseYAML } from 'yaml';
import { z } from 'zod';

const PlanSchema = z.object({
  runId: z.string().optional(),
  concurrency: z.number().positive(),
  defaults: z.object({
    baseBranch: z.string(),
    scriptCommand: z.string().optional(),
    model: z.string().optional(),
    jsonLogs: z.boolean().optional(),
    timeoutSec: z.number().positive().optional(),
    retries: z.number().nonnegative().optional(),
    mergeOnPass: z.boolean().optional(),
  }),
  matrix: z.array(z.object({
    repo: z.string(),
    prompt: z.string().min(1),
    baseBranch: z.string().optional(),
    scriptCommand: z.string().optional(),
    model: z.string().optional(),
    timeoutSec: z.number().positive().optional(),
    mergeOnPass: z.boolean().optional(),
  })).min(1),
});

export class BatchRunner {
  private abortController?: AbortController;
  private runningItems = new Set<string>();

  constructor(
    private store: SessionStore,
    private dbPath?: string,
    private metricsEventBus?: MetricsEventBus
  ) {}

  async parsePlan(planPath: string): Promise<Plan> {
    try {
      const content = await readFile(planPath, 'utf8');
      const raw = parseYAML(content);
      return PlanSchema.parse(raw);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const messages = error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
        throw new Error(`Plan validation failed:\n${messages.join('\n')}`);
      }
      throw new Error(`Failed to parse plan: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async runBatch(plan: Plan, dryRun = false, skipAuthCheck = false): Promise<string> {
    const runId = plan.runId || randomUUID();
    
    if (dryRun) {
      console.log(`Batch plan "${runId}"`);
      console.log(`Concurrency: ${plan.concurrency}`);
      console.log(`Items: ${plan.matrix.length}`);
      console.log(`Models: ${[...new Set(plan.matrix.map(item => item.model || plan.defaults.model || 'default'))].join(', ')}`);
      console.log(`Repos: ${[...new Set(plan.matrix.map(item => item.repo))].join(', ')}`);
      return runId;
    }

    // Pre-flight auth check to prevent failed batches
    if (!skipAuthCheck) {
      const { AmpAdapter } = await import('./amp.js');
      const ampAdapter = new AmpAdapter({}, this.store);
      const authStatus = await ampAdapter.validateAuth();
      
      if (!authStatus.isAuthenticated) {
        throw new Error(`Authentication required: ${authStatus.error}. ${authStatus.suggestion}`);
      }
      
      if (authStatus.hasCredits === false) {
        throw new Error(`Insufficient credits: ${authStatus.error}. ${authStatus.suggestion}`);
      }
      
      console.log('✓ Auth validation passed');
    }

    // Create batch record
    this.store.createBatch(runId, { ...plan.defaults, concurrency: plan.concurrency });

    // Create batch items
    const items: BatchItem[] = [];
    for (let i = 0; i < plan.matrix.length; i++) {
      const planItem = plan.matrix[i];
      const item = this.store.createBatchItem({
        runId,
        repo: planItem.repo,
        prompt: planItem.prompt,
        status: 'queued',
        model: planItem.model || plan.defaults.model,
      });
      items.push(item);
    }

    // Setup abort controller
    this.abortController = new AbortController();

    // Run items with concurrency control
    await this.executeWithConcurrency(plan, items);

    return runId;
  }

  private async executeWithConcurrency(plan: Plan, items: BatchItem[]) {
    const queue = [...items];
    const running: Promise<void>[] = [];

    while (queue.length > 0 || running.length > 0) {
      // Start new items up to concurrency limit
      while (running.length < plan.concurrency && queue.length > 0) {
        const item = queue.shift()!;
        const promise = this.executeItem(plan, item);
        running.push(promise);
      }

      // Wait for at least one to complete
      if (running.length > 0) {
        await Promise.race(running);
        
        // Remove completed promises
        for (let i = running.length - 1; i >= 0; i--) {
          const promise = running[i];
          try {
            // Check if promise is already settled by racing with a 0ms timeout
            const isSettled = await Promise.race([
              promise.then(() => true, () => true),
              new Promise<boolean>(resolve => setTimeout(() => resolve(false), 0))
            ]);
            
            if (isSettled) {
              running.splice(i, 1);
            }
          } catch {
            // Promise rejected, remove it
            running.splice(i, 1);
          }
        }
      }

      // Check for abort
      if (this.abortController?.signal.aborted) {
        break;
      }
    }
  }

  private async executeItem(plan: Plan, item: BatchItem) {
    if (this.abortController?.signal.aborted) return;

    this.runningItems.add(item.id);
    
    try {
      // Update status to running
      this.store.updateBatchItem(item.id, {
        status: 'running',
        startedAt: new Date().toISOString()
      });

      // Get plan item configuration
      const planItem = plan.matrix.find(p => p.repo === item.repo && p.prompt === item.prompt)!;
      
      // Create session
      const worktreeManager = new WorktreeManager(this.store, this.dbPath, this.metricsEventBus);
      const session = await worktreeManager.createSession({
        name: this.generateSessionName(item.prompt, item.id),
        ampPrompt: item.prompt,
        repoRoot: item.repo,
        baseBranch: planItem.baseBranch || plan.defaults.baseBranch,
        scriptCommand: planItem.scriptCommand || plan.defaults.scriptCommand,
        modelOverride: planItem.model || plan.defaults.model,
      });

      // Update batch item with session ID
      this.store.updateBatchItem(item.id, { sessionId: session.id });

      // Note: createSession() already runs the initial iteration, so we don't need to call iterate() again
      // This fixes the double iteration bug where batch items were running 2 iterations instead of 1
      
      // Get telemetry from the iteration
      const iterations = this.store.getIterations(session.id, 1);
      const lastIteration = iterations[0];
      
      if (lastIteration) {
        const toolCalls = this.store.getToolCalls(session.id, lastIteration.id);
        
        // Check both test result and session status for accurate reporting
        const sessionRecord = this.store.getSession(session.id);
        const iterFailed = lastIteration.exitCode !== 0 || sessionRecord?.status === 'error';
        
        this.store.updateBatchItem(item.id, {
          status: iterFailed 
            ? (lastIteration.exitCode === -1 ? 'error' : 'fail')
            : (lastIteration.testResult === 'fail' ? 'fail' : 'success'),
          finishedAt: new Date().toISOString(),
          iterSha: lastIteration.commitSha,
          tokensTotal: lastIteration.totalTokens,
          toolCalls: toolCalls.length,
          error: undefined, // Clear any previous errors on successful completion
        });

        // Handle mergeOnPass
        if (planItem.mergeOnPass || plan.defaults.mergeOnPass) {
          if (lastIteration.testResult !== 'fail') {
            try {
              await worktreeManager.preflight(session.id);
              await worktreeManager.squashSession(session.id, { 
                message: `batch: ${item.prompt}`,
                includeManual: 'include'
              });
              await worktreeManager.rebaseOntoBase(session.id);
            } catch (mergeError) {
              console.warn(`Merge failed for batch item ${item.id}: ${mergeError}`);
            }
          }
        }
      } else {
        this.store.updateBatchItem(item.id, {
          status: 'error',
          finishedAt: new Date().toISOString(),
          error: 'No iteration record found'
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const status = errorMessage.includes('timeout') ? 'timeout' : 'error';
      
      this.store.updateBatchItem(item.id, {
        status,
        finishedAt: new Date().toISOString(),
        error: errorMessage
      });
    } finally {
      this.runningItems.delete(item.id);
    }
  }

  private async runWithTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Operation timeout'));
      }, timeoutMs);

      fn()
        .then(resolve)
        .catch(reject)
        .finally(() => clearTimeout(timer));
    });
  }

  private generateSessionName(prompt: string, itemId: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const slug = prompt.toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .slice(0, 30);
    return `batch/${slug}/${timestamp}/${itemId.slice(0, 8)}`;
  }

  async abortRun(runId: string) {
    if (this.abortController) {
      this.abortController.abort();
    }
    
    // Mark queued items as error
    const items = this.store.getBatchItems(runId);
    for (const item of items) {
      if (item.status === 'queued' || (item.status === 'running' && !this.runningItems.has(item.id))) {
        this.store.updateBatchItem(item.id, {
          status: 'error',
          error: 'Batch aborted',
          finishedAt: new Date().toISOString()
        });
      }
    }
  }
}

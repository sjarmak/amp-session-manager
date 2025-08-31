import { EventEmitter } from 'events';
import { SessionStore } from './store.js';
import { BatchRunner } from './batch.js';
import { Exporter } from './exporter.js';
import { WorktreeManager } from './worktree.js';
import { GitOps } from './git.js';
import { MetricsEventBus } from './metrics/index.js';
import type { Plan, BatchRecord, BatchItem, ExportOptions, ReportOptions, AmpSettings } from '@ampsm/types';
import { randomUUID } from 'crypto';
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

export interface BatchRunSummary {
  runId: string;
  createdAt: string;
  defaultModel?: string;
  concurrency: number;
  totalItems: number;
  queuedCount: number;
  runningCount: number;
  successCount: number;
  failCount: number;
  errorCount: number;
  timeoutCount: number;
  totalTokens: number;
  status: 'running' | 'completed' | 'aborted' | 'error';
}

export interface BatchItemDetails extends BatchItem {
  duration?: number;
  ampMode?: 'production' | 'local-cli';
}

export interface BatchListItemsOptions {
  runId: string;
  limit?: number;
  offset?: number;
  status?: string;
}

export interface BatchStartOptions {
  planYaml: string;
  overrides?: {
    concurrency?: number;
    model?: string;
    jsonLogs?: boolean;
    timeoutSec?: number;
    mergeOnPass?: boolean;
  };
}

export interface BatchExportOptions {
  runId: string;
  outDir: string;
  tables: string[];
  format: 'json' | 'csv';
}

export interface BatchReportOptions {
  runId: string;
  out: string;
  format: 'md' | 'html';
}

export class BatchController extends EventEmitter {
  private batchRunner: BatchRunner;
  private exporter: Exporter;
  private activeRuns = new Map<string, BatchRunner>();

  constructor(
    private store: SessionStore, 
    private dbPath?: string, 
    private metricsEventBus?: MetricsEventBus,
    private ampSettings?: AmpSettings
  ) {
    super();
    this.batchRunner = new BatchRunner(store, dbPath, metricsEventBus, ampSettings);
    this.exporter = new Exporter(store, dbPath);
  }

  async listRuns(): Promise<BatchRunSummary[]> {
    const batches = this.store.getAllBatches();
    
    return batches.map(batch => {
      const items = this.store.getBatchItems(batch.runId);
      const defaults = JSON.parse(batch.defaultsJson);
      
      const queuedCount = items.filter(i => i.status === 'queued').length;
      const runningCount = items.filter(i => i.status === 'running').length;
      const successCount = items.filter(i => i.status === 'success').length;
      const failCount = items.filter(i => i.status === 'fail').length;
      const errorCount = items.filter(i => i.status === 'error').length;
      const timeoutCount = items.filter(i => i.status === 'timeout').length;
      const totalTokens = items.reduce((sum, item) => sum + (item.tokensTotal || 0), 0);
      
      let status: BatchRunSummary['status'] = 'completed';
      if (runningCount > 0 || queuedCount > 0) {
        status = 'running';
      } else if (errorCount > 0 && (successCount + failCount + timeoutCount) === 0) {
        status = 'error';
      }

      const modelDisplay = defaults.model || 'claude sonnet 4';

      return {
        runId: batch.runId,
        createdAt: batch.createdAt,
        defaultModel: modelDisplay,
        concurrency: defaults.concurrency || 1,
        totalItems: items.length,
        queuedCount,
        runningCount,
        successCount,
        failCount,
        errorCount,
        timeoutCount,
        totalTokens,
        status
      };
    });
  }

  async getRun(runId: string): Promise<BatchRunSummary | null> {
    const batch = this.store.getBatch(runId);
    if (!batch) return null;

    const runs = await this.listRuns();
    return runs.find(run => run.runId === runId) || null;
  }

  async listItems(options: BatchListItemsOptions): Promise<{ items: BatchItemDetails[]; total: number }> {
    let items = this.store.getBatchItems(options.runId);
    
    // Filter by status if specified
    if (options.status && options.status !== 'all') {
      items = items.filter(item => item.status === options.status);
    }

    const total = items.length;

    // Apply pagination
    if (options.offset) {
      items = items.slice(options.offset);
    }
    if (options.limit) {
      items = items.slice(0, options.limit);
    }

    // Calculate duration and get ampMode for each item
    const itemsWithDetails: BatchItemDetails[] = items.map(item => {
      let duration: number | undefined;
      if (item.startedAt && item.finishedAt) {
        duration = new Date(item.finishedAt).getTime() - new Date(item.startedAt).getTime();
      }
      
      let ampMode: 'production' | 'local-cli' | undefined;
      if (item.sessionId) {
        const session = this.store.getSession(item.sessionId);
        ampMode = session?.ampMode;
      }
      
      return { ...item, duration, ampMode };
    });

    return { items: itemsWithDetails, total };
  }

  async start(options: BatchStartOptions): Promise<string> {
    // Parse and validate the YAML plan
    const { parse: parseYAML } = await import('yaml');
    let plan: Plan;
    
    try {
      const raw = parseYAML(options.planYaml);
      plan = PlanSchema.parse(raw);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const messages = error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
        throw new Error(`Plan validation failed:\n${messages.join('\n')}`);
      }
      throw new Error(`Failed to parse plan YAML: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    // Apply overrides to plan
    if (options.overrides) {
      if (options.overrides.concurrency !== undefined) {
        plan.concurrency = options.overrides.concurrency;
      }
      if (options.overrides.model !== undefined) {
        plan.defaults.model = options.overrides.model;
      }
      if (options.overrides.jsonLogs !== undefined) {
        plan.defaults.jsonLogs = options.overrides.jsonLogs;
      }
      if (options.overrides.timeoutSec !== undefined) {
        plan.defaults.timeoutSec = options.overrides.timeoutSec;
      }
      if (options.overrides.mergeOnPass !== undefined) {
        plan.defaults.mergeOnPass = options.overrides.mergeOnPass;
      }
    }

    const runId = await this.batchRunner.runBatch(plan);
    
    this.emit('run-started', { runId });
    
    // Start monitoring this run
    this.monitorRun(runId);
    
    return runId;
  }

  async abort(runId: string): Promise<void> {
    await this.batchRunner.abortRun(runId);
    this.emit('run-aborted', { runId });
  }

  async delete(runId: string): Promise<void> {
    // Abort if still running
    try {
      await this.batchRunner.abortRun(runId);
    } catch {
      // Already stopped, continue with deletion
    }
    
    // Get all session IDs before deleting batch from database
    const batchItems = this.store.getBatchItems(runId);
    const sessionIdsFromItems = batchItems
      .filter(item => item.sessionId)
      .map(item => item.sessionId!);
      
    // Also find sessions that might not be properly linked to batch items
    // Look for orphaned batch sessions by checking all sessions for batch-related patterns
    const allSessions = this.store.getAllSessions();
    
    const sessionIdsFromDb = allSessions
      .filter(session => {
        // Check if session notes match the runId
        if (session.notes === runId) return true;
        
        // Check if runId prefix is in branch name 
        if (session.branchName.includes(runId.slice(0, 8))) return true;
        
        // Check if this is a batch session by checking for "batch" in name/branch
        // This is more reliable since we may not have timing info
        if ((session.name && session.name.includes('batch')) || 
            session.branchName.includes('batch')) {
          return true;
        }
        
        return false;
      })
      .map(session => session.id);
    
    // Combine both sets to ensure complete cleanup
    const allSessionIds = new Set([...sessionIdsFromItems, ...sessionIdsFromDb]);
    const sessionIds = Array.from(allSessionIds);
    
    console.log(`Found ${sessionIds.length} sessions to clean up for batch ${runId}`);
    
    // Clean up worktrees for each session  
    const worktreeManager = new WorktreeManager(this.store, this.dbPath);
    const cleanupErrors: Array<{ sessionId: string; error: any }> = [];
    
    // Process cleanups sequentially to avoid conflicts
    for (const sessionId of sessionIds) {
      try {
        await worktreeManager.cleanup(sessionId, true); // force cleanup
      } catch (error) {
        cleanupErrors.push({ sessionId, error });
        console.warn(`Failed to cleanup worktree for session ${sessionId}:`, error);
      }
    }
    
    // Delete batch from database (this will also clean up any remaining sessions)
    this.store.deleteBatch(runId);
    
    // Log summary of cleanup
    if (cleanupErrors.length > 0) {
      console.warn(`Batch deletion completed with ${cleanupErrors.length} cleanup errors out of ${sessionIds.length} sessions`);
    } else {
      console.log(`✓ Successfully cleaned up all ${sessionIds.length} sessions and worktrees`);
    }
    
    this.emit('run-deleted', { runId });
  }

  /**
   * Clean up orphaned batch sessions that don't have corresponding batches
   */
  async cleanupOrphanedBatchSessions(): Promise<{ cleanedSessions: number }> {
    // Find all sessions that look like batch sessions but don't have corresponding batches
    const allSessions = this.store.getAllSessions();
    const allBatches = this.store.getAllBatches().map(b => b.runId);
    
    const orphanedSessions = allSessions.filter(session => {
      // Check if this looks like a batch session
      const isBatchSession = (session.name && session.name.includes('batch')) || 
                             session.branchName.includes('batch');
      
      if (!isBatchSession) return false;
      
      // Check if there's a corresponding batch
      const hasCorrespondingBatch = allBatches.some(runId => 
        session.notes === runId || 
        session.branchName.includes(runId.slice(0, 8))
      );
      
      return !hasCorrespondingBatch;
    });
    
    console.log(`Found ${orphanedSessions.length} orphaned batch sessions`);
    
    // Clean up each orphaned session
    const worktreeManager = new WorktreeManager(this.store, this.dbPath);
    let cleanedCount = 0;
    
    for (const session of orphanedSessions) {
      try {
        await worktreeManager.cleanup(session.id, true); // force cleanup
        cleanedCount++;
        console.log(`✓ Cleaned up orphaned batch session: ${session.name}`);
      } catch (error) {
        console.warn(`Failed to cleanup orphaned session ${session.id}:`, error);
      }
    }
    
    return { cleanedSessions: cleanedCount };
  }

  /**
   * Clean up orphaned worktrees and sessions across all repos
   */
  async cleanWorktreeEnvironment(): Promise<{ [repoRoot: string]: { removedDirs: number; removedSessions: number } }> {
    console.log('🧹 Starting worktree environment cleanup...');
    
    // Get all unique repo roots from sessions
    const allSessions = this.store.getAllSessions();
    const repoRoots = [...new Set(allSessions.map(s => s.repoRoot))];
    
    const results: { [repoRoot: string]: { removedDirs: number; removedSessions: number } } = {};
    
    for (const repoRoot of repoRoots) {
      try {
        const worktreeManager = new WorktreeManager(this.store, this.dbPath);
        results[repoRoot] = await worktreeManager.pruneOrphans(repoRoot, false); // Explicit cleanup in batch operations
      } catch (error) {
        console.error(`Failed to clean up repo ${repoRoot}:`, error);
        results[repoRoot] = { removedDirs: 0, removedSessions: 0 };
      }
    }
    
    const totalDirs = Object.values(results).reduce((sum, r) => sum + r.removedDirs, 0);
    const totalSessions = Object.values(results).reduce((sum, r) => sum + r.removedSessions, 0);
    
    console.log(`✅ Environment cleanup complete: ${totalDirs} directories, ${totalSessions} sessions removed`);
    return results;
  }

  async export(options: BatchExportOptions): Promise<string[]> {
    const exportOptions: ExportOptions = {
      runId: options.runId,
      tables: options.tables,
      outDir: options.outDir,
      format: options.format
    };

    await this.exporter.exportRun(exportOptions);
    
    // Return the expected file paths
    const files: string[] = [];
    for (const table of options.tables) {
      const filename = `${table}-${options.runId}.${options.format}`;
      files.push(`${options.outDir}/${filename}`);
    }
    return files;
  }

  updateAmpSettings(ampSettings: AmpSettings) {
    this.ampSettings = ampSettings;
    this.batchRunner = new BatchRunner(this.store, this.dbPath, this.metricsEventBus, ampSettings);
  }

  async report(options: BatchReportOptions): Promise<string> {
    const reportOptions: ReportOptions = {
      runId: options.runId,
      format: options.format
    };

    const reportContent = await this.exporter.generateReport(reportOptions);
    
    // Write the report to the specified output path
    const { writeFile } = await import('fs/promises');
    await writeFile(options.out, reportContent);
    
    return options.out;
  }

  private async monitorRun(runId: string) {
    // Simple polling-based monitoring - in a real implementation,
    // you might want to hook into the BatchRunner's execution loop
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

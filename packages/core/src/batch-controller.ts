import { EventEmitter } from 'events';
import { SessionStore } from './store.js';
import { BatchRunner } from './batch.js';
import { Exporter } from './exporter.js';
import type { Plan, BatchRecord, BatchItem, ExportOptions, ReportOptions } from '@ampsm/types';
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

  constructor(private store: SessionStore, private dbPath?: string) {
    super();
    this.batchRunner = new BatchRunner(store, dbPath);
    this.exporter = new Exporter(store);
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

      return {
        runId: batch.runId,
        createdAt: batch.createdAt,
        defaultModel: defaults.model,
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

    // Calculate duration for each item
    const itemsWithDetails: BatchItemDetails[] = items.map(item => {
      let duration: number | undefined;
      if (item.startedAt && item.finishedAt) {
        duration = new Date(item.finishedAt).getTime() - new Date(item.startedAt).getTime();
      }
      return { ...item, duration };
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

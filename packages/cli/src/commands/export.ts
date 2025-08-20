import { SessionStore, Exporter } from '@ampsm/core';
import type { ExportOptions } from '@ampsm/types';
import { resolve } from 'path';

interface ExportCommandOptions {
  run?: string;
  sessions?: string;
  startDate?: string;
  endDate?: string;
  out: string;
  tables?: string;
  format?: 'json' | 'ndjson' | 'csv';
}

export async function exportCommand(options: ExportCommandOptions) {
  const store = new SessionStore();
  const exporter = new Exporter(store);

  try {
    const tables = options.tables ? options.tables.split(',') : 
      ['sessions', 'iterations', 'tool_calls', 'merge_history', 'batches', 'batch_items'];
    
    const exportOptions: ExportOptions = {
      runId: options.run,
      sessionIds: options.sessions ? options.sessions.split(',') : undefined,
      startDate: options.startDate,
      endDate: options.endDate,
      tables,
      format: options.format || 'json',
      outDir: resolve(options.out)
    };

    await exporter.exportRun(exportOptions);
  } catch (error) {
    console.error(`Export failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  } finally {
    store.close();
  }
}

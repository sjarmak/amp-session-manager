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

interface SessionExportOptions {
  session: string;
  out: string;
  format?: 'json' | 'markdown';
  noConversation?: boolean;
}

export async function exportCommand(options: ExportCommandOptions) {
  const store = new SessionStore();
  const exporter = new Exporter(store, store.dbPath);

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

export async function exportSessionCommand(sessionId: string, options: Omit<SessionExportOptions, 'session'>) {
  const store = new SessionStore();
  const exporter = new Exporter(store, store.dbPath);

  try {
    const format = options.format || 'markdown';
    const includeConversation = !options.noConversation;
    const outDir = resolve(options.out);
    
    const filePath = await exporter.exportSession(
      sessionId, 
      format, 
      outDir, 
      includeConversation
    );
    
    console.log(`✓ Session exported to ${filePath}`);
    
    // Show summary
    const session = store.getSession(sessionId);
    if (session) {
      const iterations = store.getIterations(sessionId);
      const toolCalls = store.getToolCalls(sessionId);
      console.log(`  Session: ${session.name}`);
      console.log(`  Iterations: ${iterations.length}`);
      console.log(`  Tool calls: ${toolCalls.length}`);
      console.log(`  Format: ${format}`);
      console.log(`  Conversation included: ${includeConversation ? 'Yes' : 'No'}`);
    }
    
  } catch (error) {
    console.error(`Session export failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  } finally {
    store.close();
  }
}

import { SessionStore, Exporter } from '@ampsm/core';
import type { ReportOptions } from '@ampsm/types';
import { writeFile } from 'fs/promises';
import { resolve } from 'path';

interface ReportCommandOptions {
  run?: string;
  sessions?: string;
  startDate?: string;
  endDate?: string;
  out?: string;
  format?: 'md' | 'html';
}

export async function reportCommand(options: ReportCommandOptions) {
  const store = new SessionStore();
  const exporter = new Exporter(store);

  try {
    const reportOptions: ReportOptions = {
      runId: options.run,
      sessionIds: options.sessions ? options.sessions.split(',') : undefined,
      startDate: options.startDate,
      endDate: options.endDate,
      format: options.format || 'md'
    };

    const report = await exporter.generateReport(reportOptions);
    
    if (options.out) {
      const outPath = resolve(options.out);
      await writeFile(outPath, report);
      console.log(`Report written to ${outPath}`);
    } else {
      console.log(report);
    }
  } catch (error) {
    console.error(`Report generation failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  } finally {
    store.close();
  }
}

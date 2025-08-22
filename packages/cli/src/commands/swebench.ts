import { Command } from 'commander';
import { SessionStore, SweBenchRunner } from '@ampsm/core';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

export const sweBenchCommand = new Command('swebench')
  .description('Run SWE-bench evaluations using the session manager')
  .addCommand(
    new Command('run')
      .description('Run SWE-bench cases from a directory')
      .argument('<cases-dir>', 'Directory containing SWE-bench case JSON files')
      .option('-n, --name <name>', 'Name for this benchmark run')
      .option('-p, --parallel <number>', 'Number of parallel executions', '4')
      .option('-f, --filter <pattern>', 'Filter cases by ID or repo pattern')
      .option('--max-iterations <number>', 'Max iterations per case', '10')
      .option('--timeout <seconds>', 'Timeout per case in seconds', '300')
      .action(async (casesDir: string, options: any) => {
        try {
          // Validate cases directory
          if (!fs.existsSync(casesDir)) {
            console.error(`❌ Cases directory does not exist: ${casesDir}`);
            process.exit(1);
          }

          const { getDbPath } = require('@ampsm/core');
          const dbPath = getDbPath();
          const store = new SessionStore(dbPath);
          const runner = new SweBenchRunner(store, dbPath);

          // Set up progress tracking
          let completedCount = 0;
          let totalCases = 0;

          runner.on('run-started', (run) => {
            totalCases = run.total;
            console.log(`🚀 Starting SWE-bench run: ${run.name}`);
            console.log(`📁 Cases directory: ${run.casesDir}`);
            console.log(`📊 Total cases: ${run.total}`);
            console.log(`⚡ Parallel workers: ${options.parallel}`);
            console.log('');
          });

          runner.on('case-started', ({ caseId }) => {
            console.log(`▶️  Started: ${caseId}`);
          });

          runner.on('case-finished', ({ caseId, result }) => {
            completedCount++;
            const status = result.status === 'pass' ? '✅' : '❌';
            const progress = `[${completedCount}/${totalCases}]`;
            console.log(`${status} ${progress} ${caseId} (${result.iterations} iterations, ${result.wallTimeSec.toFixed(1)}s)`);
          });

          runner.on('case-error', ({ caseId, error }) => {
            completedCount++;
            const progress = `[${completedCount}/${totalCases}]`;
            console.log(`💥 ${progress} ${caseId} - ERROR: ${error}`);
          });

          // Start the run
          const finalRun = await runner.run({
            casesDir,
            name: options.name || `SWE-bench ${new Date().toISOString().slice(0, 10)}`,
            parallel: parseInt(options.parallel),
            maxIterations: parseInt(options.maxIterations),
            timeoutSec: parseInt(options.timeout),
            filter: options.filter
          });

          // Print summary
          console.log('');
          console.log('📈 Final Results:');
          console.log(`✅ Passed: ${finalRun.passed}/${finalRun.total} (${(finalRun.passed/finalRun.total*100).toFixed(1)}%)`);
          console.log(`❌ Failed: ${finalRun.failed}/${finalRun.total} (${(finalRun.failed/finalRun.total*100).toFixed(1)}%)`);
          console.log(`🔗 Run ID: ${finalRun.id}`);

          store.close();

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error('❌ SWE-bench run failed:', errorMessage);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('results')
      .description('Show results for a SWE-bench run')
      .argument('<run-id>', 'SWE-bench run ID')
      .option('--format <format>', 'Output format (table|json|csv)', 'table')
      .action(async (runId: string, options: any) => {
        const { getDbPath } = require('@ampsm/core');
        const dbPath = getDbPath();
        const store = new SessionStore(dbPath);
        
        const run = store.getSweBenchRun(runId);
        if (!run) {
          console.error(`❌ Run not found: ${runId}`);
          process.exit(1);
        }

        const results = store.getSweBenchCaseResults(runId);

        if (options.format === 'json') {
          console.log(JSON.stringify({ run, results }, null, 2));
        } else if (options.format === 'csv') {
          console.log('caseId,status,iterations,wallTimeSec,sessionId');
          results.forEach(r => {
            console.log(`${r.caseId},${r.status},${r.iterations},${r.wallTimeSec},${r.sessionId}`);
          });
        } else {
          // Table format
          console.log(`\n📊 SWE-bench Run: ${run.name}`);
          console.log(`🗓️  Created: ${run.createdAt}`);
          console.log(`📈 Summary: ${run.passed}/${run.total} passed (${(run.passed/run.total*100).toFixed(1)}%)\n`);
          
          console.log('Case Results:');
          console.log('─'.repeat(80));
          console.log('ID'.padEnd(20) + 'Status'.padEnd(10) + 'Iterations'.padEnd(12) + 'Time (s)');
          console.log('─'.repeat(80));
          
          results.forEach(r => {
            const status = r.status === 'pass' ? '✅ PASS' : '❌ FAIL';
            console.log(
              r.caseId.padEnd(20) + 
              status.padEnd(10) + 
              r.iterations.toString().padEnd(12) + 
              r.wallTimeSec.toFixed(1)
            );
          });
        }

        store.close();
      })
  );

import { SessionStore, BatchRunner } from '@ampsm/core';
import { resolve } from 'path';

interface BatchOptions {
  dryRun?: boolean;
  json?: boolean;
}

export async function batchCommand(planFile: string, options: BatchOptions) {
  const store = new SessionStore();
  const batchRunner = new BatchRunner(store);

  try {
    const planPath = resolve(planFile);
    const plan = await batchRunner.parsePlan(planPath);

    if (options.dryRun) {
      const runId = await batchRunner.runBatch(plan, true);
      if (options.json) {
        console.log(JSON.stringify({ runId, dryRun: true, itemCount: plan.matrix.length }));
      }
      return;
    }

    const runId = await batchRunner.runBatch(plan, false);
    
    if (options.json) {
      const batch = store.getBatch(runId);
      const items = store.getBatchItems(runId);
      console.log(JSON.stringify({
        runId,
        status: 'completed',
        itemCount: items.length,
        successCount: items.filter(i => i.status === 'success').length,
        failCount: items.filter(i => i.status === 'fail').length,
        errorCount: items.filter(i => i.status === 'error').length,
      }));
    } else {
      console.log(`Batch completed: ${runId}`);
      const items = store.getBatchItems(runId);
      const successCount = items.filter(i => i.status === 'success').length;
      const failCount = items.filter(i => i.status === 'fail').length;
      const errorCount = items.filter(i => i.status === 'error').length;
      
      console.log(`Results: ${successCount} success, ${failCount} failed, ${errorCount} errors`);
    }
  } catch (error) {
    if (options.json) {
      console.log(JSON.stringify({ 
        error: error instanceof Error ? error.message : String(error) 
      }));
      process.exit(1);
    } else {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  } finally {
    store.close();
  }
}

export async function abortRunCommand(runId: string, options: { json?: boolean }) {
  const store = new SessionStore();
  const batchRunner = new BatchRunner(store);

  try {
    await batchRunner.abortRun(runId);
    
    if (options.json) {
      console.log(JSON.stringify({ runId, status: 'aborted' }));
    } else {
      console.log(`Aborted batch run: ${runId}`);
    }
  } catch (error) {
    if (options.json) {
      console.log(JSON.stringify({ 
        error: error instanceof Error ? error.message : String(error) 
      }));
      process.exit(1);
    } else {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  } finally {
    store.close();
  }
}

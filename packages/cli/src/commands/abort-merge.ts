import { SessionStore, WorktreeManager, getDbPath } from '@ampsm/core';

export async function abortMergeCommand(sessionId: string, options: { json?: boolean }) {
  const dbPath = process.env.AMPSM_DB_PATH || getDbPath();
  const store = new SessionStore(dbPath);
  const manager = new WorktreeManager(store);

  try {
    await manager.abortMerge(sessionId);
    
    if (options.json) {
      console.log(JSON.stringify({
        status: 'success',
        message: 'Merge aborted successfully'
      }));
    } else {
      console.log('✅ Merge aborted successfully!');
      console.log('Session has been returned to its previous state.');
    }
  } catch (error) {
    if (options.json) {
      console.log(JSON.stringify({
        status: 'error',
        message: error instanceof Error ? error.message : String(error)
      }));
    } else {
      console.error('❌ Error aborting merge:', error instanceof Error ? error.message : String(error));
    }
    process.exit(1);
  } finally {
    store.close();
  }
}

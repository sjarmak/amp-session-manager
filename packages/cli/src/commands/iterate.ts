import { SessionStore, WorktreeManager, getDbPath } from '@ampsm/core';

export async function iterateCommand(sessionId: string, options: { notes?: string; metricsFile?: string }, program?: any) {
  try {
    const dbPath = process.env.AMPSM_DB_PATH || getDbPath();
    const store = new SessionStore(dbPath);
    const opts = program?.opts() || {};
    const runtimeConfig = opts.ampPath || opts.ampServer ? {
      ampCliPath: opts.ampPath,
      ampServerUrl: opts.ampServer
    } : undefined;
    const manager = new WorktreeManager(store, dbPath, undefined, options.metricsFile, runtimeConfig);

    const session = store.getSession(sessionId);
    if (!session) {
      console.error(`Session ${sessionId} not found`);
      process.exit(1);
    }

    console.log(`Running iteration for session: ${session.name}`);
    
    await manager.iterate(sessionId, options.notes);
    
    console.log('✓ Iteration completed');
    
    store.close();
  } catch (error) {
    console.error('Error running iteration:', error);
    process.exit(1);
  }
}

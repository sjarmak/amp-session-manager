import { SessionStore, WorktreeManager } from '@ampsm/core';

export async function iterateCommand(sessionId: string, options: { notes?: string }) {
  try {
    const dbPath = process.env.SESSIONS_DB_PATH || './sessions.sqlite';
    const store = new SessionStore(dbPath);
    const manager = new WorktreeManager(store);

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

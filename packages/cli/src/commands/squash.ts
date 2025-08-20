import { SessionStore, WorktreeManager, getDbPath } from '@ampsm/core';

export async function squashCommand(sessionId: string, options: { message?: string }) {
  try {
    const dbPath = process.env.AMPSM_DB_PATH || getDbPath();
    const store = new SessionStore(dbPath);
    const manager = new WorktreeManager(store);

    const session = store.getSession(sessionId);
    if (!session) {
      console.error(`Session ${sessionId} not found`);
      process.exit(1);
    }

    const message = options.message || `feat: ${session.name}`;
    
    console.log(`Squashing commits for session: ${session.name}`);
    console.log(`Commit message: ${message}`);
    
    await manager.squash(sessionId, message);
    
    console.log('✓ Session commits squashed successfully');
    
    store.close();
  } catch (error) {
    console.error('Error squashing session:', error);
    process.exit(1);
  }
}

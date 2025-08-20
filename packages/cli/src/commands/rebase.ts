import { SessionStore, WorktreeManager, getDbPath } from '@ampsm/core';

export async function rebaseCommand(sessionId: string, options: { onto?: string }) {
  try {
    const dbPath = process.env.AMPSM_DB_PATH || getDbPath();
    const store = new SessionStore(dbPath);
    const manager = new WorktreeManager(store);

    const session = store.getSession(sessionId);
    if (!session) {
      console.error(`Session ${sessionId} not found`);
      process.exit(1);
    }

    const onto = options.onto || session.baseBranch;
    
    console.log(`Rebasing session onto: ${onto}`);
    
    await manager.rebase(sessionId, onto);
    
    console.log('✓ Session rebased successfully');
    
    store.close();
  } catch (error) {
    console.error('Error rebasing session:', error);
    process.exit(1);
  }
}

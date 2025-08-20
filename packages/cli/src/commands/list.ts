import { SessionStore, getDbPath } from '@ampsm/core';

export async function listCommand() {
  try {
    const dbPath = process.env.AMPSM_DB_PATH || getDbPath();
    const store = new SessionStore(dbPath);
    const sessions = store.getAllSessions();
    
    if (sessions.length === 0) {
      console.log('No sessions found.');
      return;
    }

    console.log(`\nFound ${sessions.length} session(s):\n`);
    
    for (const session of sessions) {
      console.log(`${session.id.slice(0, 8)} ${session.name}`);
      console.log(`  Status: ${session.status}`);
      console.log(`  Branch: ${session.branchName}`);
      console.log(`  Created: ${new Date(session.createdAt).toLocaleString()}`);
      if (session.lastRun) {
        console.log(`  Last Run: ${new Date(session.lastRun).toLocaleString()}`);
      }
      console.log();
    }
    
    store.close();
  } catch (error) {
    console.error('Error listing sessions:', error);
    process.exit(1);
  }
}

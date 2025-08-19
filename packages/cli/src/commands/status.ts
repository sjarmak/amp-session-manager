import { SessionStore } from '@ampsm/core';

export async function statusCommand(sessionId: string) {
  try {
    const dbPath = process.env.SESSIONS_DB_PATH || './sessions.sqlite';
    const store = new SessionStore(dbPath);
    const session = store.getSession(sessionId);
    
    if (!session) {
      console.error(`Session ${sessionId} not found`);
      process.exit(1);
    }

    console.log(`\nSession: ${session.name} (${session.id})`);
    console.log(`Status: ${session.status}`);
    console.log(`Repository: ${session.repoRoot}`);
    console.log(`Base Branch: ${session.baseBranch}`);
    console.log(`Session Branch: ${session.branchName}`);
    console.log(`Worktree: ${session.worktreePath}`);
    console.log(`Created: ${new Date(session.createdAt).toLocaleString()}`);
    
    if (session.lastRun) {
      console.log(`Last Run: ${new Date(session.lastRun).toLocaleString()}`);
    }
    
    if (session.scriptCommand) {
      console.log(`Test Command: ${session.scriptCommand}`);
    }
    
    if (session.modelOverride) {
      console.log(`Model Override: ${session.modelOverride}`);
    }
    
    if (session.notes) {
      console.log(`Notes: ${session.notes}`);
    }
    
    console.log(`\nPrompt:`);
    console.log(session.ampPrompt);
    
    store.close();
  } catch (error) {
    console.error('Error getting session status:', error);
    process.exit(1);
  }
}

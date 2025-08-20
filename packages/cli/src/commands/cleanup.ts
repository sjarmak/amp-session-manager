import { SessionStore, WorktreeManager } from '@ampsm/core';
import { readLine } from '../utils/readline.js';

export async function cleanupCommand(sessionId: string, options: { yes?: boolean; json?: boolean }) {
  const dbPath = process.env.SESSIONS_DB_PATH || './sessions.sqlite';
  const store = new SessionStore(dbPath);
  const manager = new WorktreeManager(store);

  try {
    const session = store.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (!options.yes && !options.json) {
      console.log(`\n⚠️  This will permanently remove:`);
      console.log(`   - Worktree: ${session.worktreePath}`);
      console.log(`   - Branch: ${session.branchName}`);
      console.log(`\nThis action cannot be undone.`);
      
      const confirm = await readLine('Are you sure you want to continue? (y/N): ');
      if (!confirm.toLowerCase().startsWith('y')) {
        console.log('Cleanup cancelled.');
        return;
      }
    }

    await manager.cleanup(sessionId);
    
    if (options.json) {
      console.log(JSON.stringify({
        status: 'success',
        sessionId,
        message: 'Session cleaned up successfully'
      }));
    } else {
      console.log('✅ Session cleaned up successfully!');
      console.log('Worktree and branch have been safely removed.');
    }
  } catch (error) {
    if (options.json) {
      console.log(JSON.stringify({
        status: 'error',
        message: error instanceof Error ? error.message : String(error)
      }));
    } else {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ Error cleaning up session:', errorMessage);
      
      if (errorMessage.includes('not reachable from base branch')) {
        console.log('\n💡 This usually means the session was not properly merged.');
        console.log('If you\'re sure you want to force cleanup, you can:');
        console.log('1. Manually remove the worktree and branch');
        console.log('2. Or complete the merge process first');
      }
    }
    process.exit(1);
  } finally {
    store.close();
  }
}

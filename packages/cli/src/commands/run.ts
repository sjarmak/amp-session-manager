import { SessionStore } from '@ampsm/core';
import { spawn } from 'child_process';

export async function runCommand(sessionId: string) {
  try {
    const dbPath = process.env.SESSIONS_DB_PATH || './sessions.sqlite';
    const store = new SessionStore(dbPath);
    const session = store.getSession(sessionId);
    
    if (!session) {
      console.error(`Session ${sessionId} not found`);
      process.exit(1);
    }

    if (!session.scriptCommand) {
      console.error(`Session ${sessionId} has no script command configured`);
      process.exit(1);
    }

    console.log(`Running: ${session.scriptCommand}`);
    console.log(`Working directory: ${session.worktreePath}`);
    
    const child = spawn('sh', ['-c', session.scriptCommand], {
      cwd: session.worktreePath,
      stdio: 'inherit'
    });

    child.on('close', (exitCode) => {
      if (exitCode === 0) {
        console.log('\n✓ Script completed successfully');
      } else {
        console.log(`\n✗ Script failed with exit code ${exitCode}`);
        process.exit(exitCode || 1);
      }
      store.close();
    });

    child.on('error', (error) => {
      console.error('Error running script:', error);
      store.close();
      process.exit(1);
    });

  } catch (error) {
    console.error('Error running script:', error);
    process.exit(1);
  }
}

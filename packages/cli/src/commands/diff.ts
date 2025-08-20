import { SessionStore, GitOps, getDbPath } from '@ampsm/core';

export async function diffCommand(sessionId: string, options: { staged?: boolean; nameOnly?: boolean }) {
  try {
    const dbPath = process.env.AMPSM_DB_PATH || getDbPath();
    const store = new SessionStore(dbPath);
    const session = store.getSession(sessionId);
    
    if (!session) {
      console.error(`Session ${sessionId} not found`);
      process.exit(1);
    }

    const git = new GitOps(session.repoRoot);
    
    const args = ['diff'];
    if (options.staged) {
      args.push('--cached');
    }
    if (options.nameOnly) {
      args.push('--name-only');
    }
    args.push('--no-color');

    const result = await git.exec(args, session.worktreePath);
    
    if (result.exitCode !== 0) {
      console.error('Error getting diff:', result.stderr);
      process.exit(1);
    }
    
    if (!result.stdout.trim()) {
      console.log('No changes.');
    } else {
      console.log(result.stdout);
    }
    
    store.close();
  } catch (error) {
    console.error('Error getting diff:', error);
    process.exit(1);
  }
}

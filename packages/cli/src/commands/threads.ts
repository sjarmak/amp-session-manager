import { Command } from 'commander';
import { SessionStore, getDbPath, getSessionThreadInfo } from '@ampsm/core';
import { Logger } from '@ampsm/core';

const threads = new Command('threads');

// List threads for sessions
threads
  .command('list')
  .option('--limit <number>', 'Limit number of results', '50')
  .option('--session <sessionId>', 'Show threads for specific session')
  .description('List session threads')
  .action(async (options) => {
    const sessionStore = new SessionStore(getDbPath());
    
    let sessions;
    if (options.session) {
      const session = sessionStore.getSession(options.session);
      sessions = session ? [session] : [];
    } else {
      sessions = sessionStore.getAllSessions()
        .filter((session: any) => session.threadId)
        .slice(0, parseInt(options.limit));
    }

    if (sessions.length === 0) {
      console.log(options.session ? 
        `Session ${options.session} not found or has no thread` : 
        'No sessions with threads found');
      return;
    }

    console.log(`\nFound ${sessions.length} sessions with threads:\n`);
    
    for (const session of sessions) {
      const threadInfo = getSessionThreadInfo(session);
      if (!threadInfo) continue;
      
      console.log(`📄 ${session.name}`);
      console.log(`   Session ID: ${session.id}`);
      console.log(`   Thread ID: ${threadInfo.id}`);
      console.log(`   Status: ${session.status}`);
      console.log(`   Created: ${session.createdAt}`);
      console.log(`   Last Run: ${session.lastRun || 'Never'}`);
      console.log(`   Thread URL: ${threadInfo.url}`);
      console.log();
    }
  });

// Show thread for a specific session
threads
  .command('show <sessionId>')
  .description('Show thread information for a session')
  .action(async (sessionId) => {
    const sessionStore = new SessionStore(getDbPath());
    
    const session = sessionStore.getSession(sessionId);
    if (!session) {
      console.error(`Session ${sessionId} not found`);
      process.exit(1);
    }

    const threadInfo = getSessionThreadInfo(session);
    if (!threadInfo) {
      console.error(`Session ${sessionId} has no thread associated`);
      process.exit(1);
    }

    console.log(`\n📄 Session: ${session.name}`);
    console.log(`Session ID: ${session.id}`);
    console.log(`Thread ID: ${threadInfo.id}`);
    console.log(`Thread URL: ${threadInfo.url}`);
    console.log(`Status: ${session.status}`);
    console.log(`Created: ${session.createdAt}`);
    console.log(`Last Run: ${session.lastRun || 'Never'}`);
    console.log(`Branch: ${session.branchName}`);
    console.log(`Worktree: ${session.worktreePath}`);
    
    if (session.ampPrompt) {
      console.log(`\nPrompt: ${session.ampPrompt.slice(0, 200)}${session.ampPrompt.length > 200 ? '...' : ''}`);
    }
  });

export { threads };

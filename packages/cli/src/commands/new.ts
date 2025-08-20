import { SessionStore, WorktreeManager, getCurrentAmpThreadId, getDbPath } from '@ampsm/core';
import type { SessionCreateOptions } from '@ampsm/types';

export async function newCommand(options: {
  repo: string;
  base?: string;
  name: string;
  prompt: string;
  script?: string;
  model?: string;
}): Promise<void> {
  try {
    const dbPath = process.env.AMPSM_DB_PATH || getDbPath();
    const store = new SessionStore(dbPath);
    const manager = new WorktreeManager(store);

    const threadId = await getCurrentAmpThreadId();
    
    const createOptions: SessionCreateOptions = {
      name: options.name,
      ampPrompt: options.prompt,
      repoRoot: options.repo,
      baseBranch: options.base || 'main',
      scriptCommand: options.script,
      modelOverride: options.model,
      threadId: threadId || undefined
    };

    console.log(`Creating session "${options.name}"...`);
    
    const session = await manager.createSession(createOptions);
    
    console.log(`✓ Session created: ${session.id}`);
    console.log(`  Branch: ${session.branchName}`);
    console.log(`  Worktree: ${session.worktreePath}`);
    
    store.close();
  } catch (error) {
    console.error('Error creating session:', error);
    process.exit(1);
  }
}

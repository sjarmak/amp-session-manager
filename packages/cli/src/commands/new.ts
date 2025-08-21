import { SessionStore, WorktreeManager, getCurrentAmpThreadId, getDbPath } from '@ampsm/core';
import type { SessionCreateOptions } from '@ampsm/types';

export async function newCommand(options: {
  repo: string;
  base?: string;
  name: string;
  prompt: string;
  script?: string;
  model?: string;
  gpt5?: boolean;
  alloy?: boolean;
  run?: boolean;  // New flag to optionally run first iteration
}): Promise<void> {
  try {
    const dbPath = process.env.AMPSM_DB_PATH || getDbPath();
    const store = new SessionStore(dbPath);
    const manager = new WorktreeManager(store);

    const threadId = await getCurrentAmpThreadId();
    
    // Handle model override priority: explicit flags > --model option
    let modelOverride = options.model;
    if (options.gpt5 && options.alloy) {
      console.error('Error: Cannot specify both --gpt5 and --alloy flags');
      process.exit(1);
    }
    if (options.gpt5) {
      modelOverride = 'gpt-5';
    } else if (options.alloy) {
      modelOverride = 'alloy';
    }
    
    const createOptions: SessionCreateOptions = {
      name: options.name,
      ampPrompt: options.prompt,
      repoRoot: options.repo,
      baseBranch: options.base || 'main',
      scriptCommand: options.script,
      modelOverride,
      threadId: threadId || undefined
    };

    console.log(`Creating session "${options.name}"...`);
    
    const session = await manager.createSession(createOptions);
    
    console.log(`✓ Session created: ${session.id}`);
    console.log(`  Branch: ${session.branchName}`);
    console.log(`  Worktree: ${session.worktreePath}`);
    
    // Optionally run first iteration if --run flag is provided
    if (options.run) {
      console.log(`\nRunning first iteration with prompt: "${options.prompt}"`);
      await manager.iterate(session.id);
      
      const updatedSession = store.getSession(session.id);
      console.log(`✓ First iteration completed. Status: ${updatedSession?.status}`);
    } else {
      console.log(`\n💡 Use 'amp-sessions iterate ${session.id}' to run the first iteration`);
    }
    
    store.close();
  } catch (error) {
    console.error('Error creating session:', error);
    process.exit(1);
  }
}

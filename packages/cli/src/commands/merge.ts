import { SessionStore, WorktreeManager } from '@ampsm/core';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';

interface MergeOptions {
  message: string;
  includeManual?: 'include' | 'exclude';
  onto?: string;
  noFf?: boolean;
  push?: boolean;
  remote?: string;
  exportPatch?: string;
  pr?: boolean;
  json?: boolean;
}

export async function mergeCommand(sessionId: string, options: MergeOptions) {
  const dbPath = process.env.SESSIONS_DB_PATH || './sessions.sqlite';
  const store = new SessionStore(dbPath);
  const manager = new WorktreeManager(store);
  
  const mergeId = randomUUID();
  const startTime = new Date().toISOString();

  try {
    const session = store.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    
    const baseBranch = options.onto || session.baseBranch;
    
    // Record merge start
    store.saveMergeHistory({
      id: mergeId,
      sessionId,
      startedAt: startTime,
      baseBranch,
      mode: 'squash-rebase-merge',
      result: 'in-progress',
      squashMessage: options.message
    });

    if (!options.json) {
      console.log(`\n🚀 Starting merge process for session: ${session.name}`);
      console.log('=' .repeat(60));
    }

    // Step 1: Preflight
    if (!options.json) console.log('1️⃣  Running preflight checks...');
    const preflight = await manager.preflight(sessionId);
    
    if (preflight.issues.length > 0 && !options.json) {
      console.log('⚠️  Preflight issues detected:');
      preflight.issues.forEach(issue => console.log(`  - ${issue}`));
      console.log('Continuing anyway...\n');
    }

    // Step 2: Squash
    if (!options.json) console.log('2️⃣  Squashing commits...');
    await manager.squashSession(sessionId, {
      message: options.message,
      includeManual: options.includeManual || 'include'
    });

    // Step 3: Rebase
    if (!options.json) console.log('3️⃣  Rebasing onto base branch...');
    const rebaseResult = await manager.rebaseOntoBase(sessionId);
    
    if (rebaseResult.status === 'conflict') {
      store.updateMergeHistory(mergeId, {
        finishedAt: new Date().toISOString(),
        result: 'conflict',
        conflictFiles: rebaseResult.files
      });
      
      if (options.json) {
        console.log(JSON.stringify({
          status: 'conflict',
          files: rebaseResult.files,
          message: 'Rebase conflicts detected. Resolve manually and continue.'
        }));
      } else {
        console.log(`\n❌ Merge failed - conflicts detected in ${rebaseResult.files?.length} files:`);
        rebaseResult.files?.forEach(file => console.log(`  - ${file}`));
        console.log(`\nResolve conflicts and run: amp-sessions continue-merge ${sessionId}`);
      }
      process.exit(1);
    }

    // Step 4: Export patch (optional)
    if (options.exportPatch) {
      if (!options.json) console.log('4️⃣  Exporting patch...');
      await manager.exportPatch(sessionId, options.exportPatch);
    }

    // Step 5: Merge
    if (!options.json) console.log('5️⃣  Merging into base branch...');
    await manager.fastForwardMerge(sessionId, { noFF: options.noFf });

    // Step 6: Push (optional)
    if (options.push) {
      if (!options.json) console.log('6️⃣  Pushing to remote...');
      const remote = options.remote || 'origin';
      await runCommand(['git', 'push', remote, baseBranch], session.repoRoot);
    }

    // Step 7: Create PR (optional)
    if (options.pr) {
      if (!options.json) console.log('7️⃣  Creating pull request...');
      try {
        await runCommand(['gh', 'pr', 'create', '--fill'], session.repoRoot);
      } catch (error) {
        if (!options.json) {
          console.log('⚠️  Failed to create PR - gh CLI not available or not authenticated');
        }
      }
    }

    // Record successful merge
    store.updateMergeHistory(mergeId, {
      finishedAt: new Date().toISOString(),
      result: 'success'
    });

    if (options.json) {
      console.log(JSON.stringify({
        status: 'success',
        sessionId,
        mergeId,
        baseBranch,
        message: 'Session merged successfully'
      }));
    } else {
      console.log(`\n✅ Session merged successfully!`);
      console.log(`   Session: ${session.name}`);
      console.log(`   Branch: ${session.branchName} → ${baseBranch}`);
      console.log(`   Message: ${options.message}`);
      
      if (options.exportPatch) {
        console.log(`   Patch: ${options.exportPatch}`);
      }
      
      console.log(`\nTo clean up the session worktree:`);
      console.log(`   amp-sessions cleanup ${sessionId}`);
    }

  } catch (error) {
    // Record failed merge
    store.updateMergeHistory(mergeId, {
      finishedAt: new Date().toISOString(),
      result: 'error'
    });
    
    if (options.json) {
      console.log(JSON.stringify({
        status: 'error',
        message: error instanceof Error ? error.message : String(error)
      }));
    } else {
      console.error('❌ Merge failed:', error instanceof Error ? error.message : String(error));
    }
    process.exit(1);
  } finally {
    store.close();
  }
}

async function runCommand(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const [command, ...cmdArgs] = args;
    const child = spawn(command, cmdArgs, { 
      cwd,
      stdio: ['inherit', 'pipe', 'pipe']
    });
    
    let output = '';
    let error = '';
    
    child.stdout?.on('data', (data) => output += data.toString());
    child.stderr?.on('data', (data) => error += data.toString());
    
    child.on('close', (exitCode) => {
      if (exitCode === 0) {
        resolve(output);
      } else {
        reject(new Error(error || `Command failed with exit code ${exitCode}`));
      }
    });
  });
}

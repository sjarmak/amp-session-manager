import { SessionStore, GitOps, getDbPath } from '@ampsm/core';
import { readLine } from '../utils/readline.js';
import * as fs from 'fs/promises';
import * as path from 'path';

interface DanglingWorktree {
  path: string;
  branch?: string;
  sessionId?: string;
  sessionExists: boolean;
}

export async function cleanupDanglingCommand(options: { yes?: boolean; json?: boolean }) {
  const dbPath = process.env.AMPSM_DB_PATH || getDbPath();
  const store = new SessionStore(dbPath);
  
  try {
    const allSessions = store.getAllSessions();
    const danglingWorktrees: DanglingWorktree[] = [];
    
    // Group sessions by repository
    const sessionsByRepo = new Map<string, typeof allSessions>();
    for (const session of allSessions) {
      if (!sessionsByRepo.has(session.repoRoot)) {
        sessionsByRepo.set(session.repoRoot, []);
      }
      sessionsByRepo.get(session.repoRoot)!.push(session);
    }
    
    // Check each repository for dangling worktrees
    for (const [repoRoot, sessions] of sessionsByRepo) {
      try {
        const worktreesPath = path.join(repoRoot, '.worktrees');
        
        // Check if .worktrees directory exists
        try {
          await fs.access(worktreesPath);
        } catch {
          continue; // No .worktrees directory, skip this repo
        }
        
        // List all directories in .worktrees
        const worktreeDirs = await fs.readdir(worktreesPath);
        
        for (const dirName of worktreeDirs) {
          const worktreePath = path.join(worktreesPath, dirName);
          
          // Check if this is actually a directory
          try {
            const stat = await fs.stat(worktreePath);
            if (!stat.isDirectory()) continue;
          } catch {
            continue;
          }
          
          // Check if there's a corresponding session
          const correspondingSession = sessions.find(s => 
            s.worktreePath === worktreePath || s.id === dirName
          );
          
          if (!correspondingSession) {
            // This is a dangling worktree
            let branchName: string | undefined;
            
            // Try to determine the branch name
            try {
              const git = new GitOps(repoRoot);
              const result = await git.exec(['symbolic-ref', '--short', 'HEAD'], worktreePath);
              if (result.exitCode === 0) {
                branchName = result.stdout.trim();
              }
            } catch {
              // Ignore errors when trying to get branch info
            }
            
            danglingWorktrees.push({
              path: worktreePath,
              branch: branchName,
              sessionId: dirName,
              sessionExists: false
            });
          }
        }
        
        // Also check for sessions that reference non-existent worktrees
        for (const session of sessions) {
          try {
            await fs.access(session.worktreePath);
          } catch {
            // Worktree doesn't exist, but session does
            danglingWorktrees.push({
              path: session.worktreePath,
              branch: session.branchName,
              sessionId: session.id,
              sessionExists: true
            });
          }
        }
      } catch (error) {
        if (!options.json) {
          console.warn(`⚠️  Failed to check repository ${repoRoot}:`, error instanceof Error ? error.message : String(error));
        }
      }
    }
    
    if (danglingWorktrees.length === 0) {
      if (options.json) {
        console.log(JSON.stringify({
          status: 'success',
          message: 'No dangling worktrees found',
          cleaned: 0
        }));
      } else {
        console.log('✅ No dangling worktrees found. All worktrees are properly tracked.');
      }
      return;
    }
    
    if (!options.json) {
      console.log(`\n🧹 Found ${danglingWorktrees.length} dangling worktree(s):`);
      for (const dangling of danglingWorktrees) {
        console.log(`   - ${dangling.path}`);
        if (dangling.branch) {
          console.log(`     Branch: ${dangling.branch}`);
        }
        if (dangling.sessionExists) {
          console.log(`     Session exists but worktree is missing`);
        } else {
          console.log(`     Worktree exists but no corresponding session`);
        }
      }
      console.log('\nThese will be cleaned up (worktrees removed, branches deleted if safe).');
    }
    
    if (!options.yes && !options.json) {
      const confirm = await readLine('Do you want to clean up these dangling worktrees? (y/N): ');
      if (!confirm.toLowerCase().startsWith('y')) {
        console.log('Cleanup cancelled.');
        return;
      }
    }
    
    let cleanedCount = 0;
    const errors: string[] = [];
    
    for (const dangling of danglingWorktrees) {
      try {
        // Get the repository root from the worktree path
        const repoRoot = dangling.path.substring(0, dangling.path.indexOf('/.worktrees/'));
        const git = new GitOps(repoRoot);
        
        // Try to remove worktree if it exists
        try {
          await fs.access(dangling.path);
          await git.exec(['worktree', 'remove', '--force', dangling.path]);
        } catch {
          // Worktree might not exist or already be removed
        }
        
        // Try to remove branch if it exists and is safe
        if (dangling.branch) {
          try {
            const branchExists = await git.exec(['show-ref', '--verify', `refs/heads/${dangling.branch}`]);
            if (branchExists.exitCode === 0) {
              // Check if branch is merged or has unique commits
              const mergeBase = await git.exec(['merge-base', 'main', dangling.branch]);
              const branchCommit = await git.exec(['rev-parse', dangling.branch]);
              
              if (mergeBase.stdout.trim() === branchCommit.stdout.trim()) {
                // Branch is at merge-base, safe to delete
                await git.exec(['branch', '-D', dangling.branch]);
              } else {
                errors.push(`Branch ${dangling.branch} has unique commits, skipped deletion for safety`);
              }
            }
          } catch {
            // Branch might not exist or other error, ignore
          }
        }
        
        // Remove session if it exists but worktree is missing
        if (dangling.sessionExists && dangling.sessionId) {
          store.deleteSession(dangling.sessionId);
        }
        
        cleanedCount++;
      } catch (error) {
        const errorMsg = `Failed to clean ${dangling.path}: ${error instanceof Error ? error.message : String(error)}`;
        errors.push(errorMsg);
      }
    }
    
    if (options.json) {
      console.log(JSON.stringify({
        status: cleanedCount === danglingWorktrees.length ? 'success' : 'partial',
        message: `Cleaned ${cleanedCount} out of ${danglingWorktrees.length} dangling worktree(s)`,
        cleaned: cleanedCount,
        total: danglingWorktrees.length,
        errors: errors
      }));
    } else {
      console.log(`✅ Successfully cleaned ${cleanedCount} out of ${danglingWorktrees.length} dangling worktree(s).`);
      if (errors.length > 0) {
        console.log('\n⚠️  Some issues occurred:');
        for (const error of errors) {
          console.log(`   - ${error}`);
        }
      }
    }
    
  } catch (error) {
    if (options.json) {
      console.log(JSON.stringify({
        status: 'error',
        message: error instanceof Error ? error.message : String(error)
      }));
    } else {
      console.error('❌ Error during dangling cleanup:', error instanceof Error ? error.message : String(error));
    }
    process.exit(1);
  } finally {
    store.close();
  }
}

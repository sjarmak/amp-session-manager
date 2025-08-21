import { BatchController, SessionStore, getDbPath } from '@ampsm/core';
import { readLine } from '../utils/readline.js';

export async function cleanEnvironmentCommand(options: { yes?: boolean; json?: boolean }) {
  const dbPath = process.env.AMPSM_DB_PATH || getDbPath();
  const store = new SessionStore(dbPath);
  
  try {
    const batchController = new BatchController(store, dbPath);
    
    if (!options.json) {
      console.log('🔍 Scanning for orphaned worktrees and sessions across all repositories...');
    }
    
    // Get a preview of what will be cleaned
    const results = await batchController.cleanWorktreeEnvironment();
    
    const totalDirs = Object.values(results).reduce((sum: number, r: any) => sum + r.removedDirs, 0);
    const totalSessions = Object.values(results).reduce((sum: number, r: any) => sum + r.removedSessions, 0);
    const repoCount = Object.keys(results).length;
    
    if (totalDirs === 0 && totalSessions === 0) {
      if (options.json) {
        console.log(JSON.stringify({
          status: 'success',
          message: 'Environment is clean',
          repositories: repoCount,
          removedDirectories: 0,
          removedSessions: 0,
          details: results
        }));
      } else {
        console.log('✅ Environment is already clean. No orphaned worktrees or sessions found.');
      }
      return;
    }
    
    if (options.json) {
      console.log(JSON.stringify({
        status: 'success',
        message: `Cleaned environment: ${totalDirs} directories, ${totalSessions} sessions removed`,
        repositories: repoCount,
        removedDirectories: totalDirs,
        removedSessions: totalSessions,
        details: results
      }));
    } else {
      console.log(`✅ Environment cleanup complete!`);
      console.log(`   📂 Repositories scanned: ${repoCount}`);
      console.log(`   🗑️  Directories removed: ${totalDirs}`);
      console.log(`   🗂️  Sessions removed: ${totalSessions}`);
      
      if (repoCount > 0) {
        console.log('\n📋 Details by repository:');
        for (const [repoRoot, result] of Object.entries(results)) {
          const r = result as any;
          if (r.removedDirs > 0 || r.removedSessions > 0) {
            console.log(`   ${repoRoot}:`);
            console.log(`     - Directories: ${r.removedDirs}`);
            console.log(`     - Sessions: ${r.removedSessions}`);
          }
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
      console.error('❌ Error during environment cleanup:', error instanceof Error ? error.message : String(error));
    }
    process.exit(1);
  } finally {
    store.close();
  }
}

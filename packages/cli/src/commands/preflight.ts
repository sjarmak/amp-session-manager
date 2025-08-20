import { SessionStore, WorktreeManager } from '@ampsm/core';

export async function preflightCommand(sessionId: string, options: { json?: boolean }) {
  const dbPath = process.env.SESSIONS_DB_PATH || './sessions.sqlite';
  const store = new SessionStore(dbPath);
  const manager = new WorktreeManager(store);

  try {
    const result = await manager.preflight(sessionId);
    
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`\nPreflight Checks for Session: ${sessionId}`);
      console.log('='.repeat(50));
      
      console.log(`✓ Repository clean: ${result.repoClean ? 'Yes' : 'No'}`);
      console.log(`✓ Base up to date: ${result.baseUpToDate ? 'Yes' : 'No'}`);
      
      if (result.testsPass !== undefined) {
        console.log(`✓ Tests pass: ${result.testsPass ? 'Yes' : 'No'}`);
      }
      
      if (result.typecheckPasses !== undefined) {
        console.log(`✓ Typecheck passes: ${result.typecheckPasses ? 'Yes' : 'No'}`);
      }
      
      console.log(`\nBranch Status:`);
      console.log(`  Ahead by: ${result.aheadBy} commits`);
      console.log(`  Behind by: ${result.behindBy} commits`);
      console.log(`  Branchpoint: ${result.branchpointSha.slice(0, 8)}`);
      console.log(`  Amp commits: ${result.ampCommitsCount}`);
      
      if (result.issues.length > 0) {
        console.log(`\n⚠️  Issues:`);
        result.issues.forEach(issue => console.log(`  - ${issue}`));
      } else {
        console.log(`\n✅ All checks passed - ready to merge!`);
      }
    }
  } catch (error) {
    console.error('Error running preflight checks:', error);
    process.exit(1);
  } finally {
    store.close();
  }
}

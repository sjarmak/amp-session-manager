import { SessionStore, WorktreeManager, getDbPath } from '@ampsm/core';

export async function continueMergeCommand(sessionId: string, options: { json?: boolean }) {
  const dbPath = process.env.AMPSM_DB_PATH || getDbPath();
  const store = new SessionStore(dbPath);
  const manager = new WorktreeManager(store);

  try {
    const result = await manager.continueMerge(sessionId);
    
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      if (result.status === 'ok') {
        console.log('✅ Rebase completed successfully!');
        console.log('\nYou can now continue with the merge process:');
        
        const session = store.getSession(sessionId);
        console.log(`   amp-sessions merge ${sessionId} --message "your commit message"`);
      } else {
        console.log(`❌ Additional conflicts detected in ${result.files?.length} files:`);
        result.files?.forEach(file => console.log(`  - ${file}`));
        console.log('\nResolve these conflicts and run:');
        console.log(`   amp-sessions continue-merge ${sessionId}`);
      }
    }
  } catch (error) {
    if (options.json) {
      console.log(JSON.stringify({
        status: 'error',
        message: error instanceof Error ? error.message : String(error)
      }));
    } else {
      console.error('❌ Error continuing merge:', error instanceof Error ? error.message : String(error));
    }
    process.exit(1);
  } finally {
    store.close();
  }
}

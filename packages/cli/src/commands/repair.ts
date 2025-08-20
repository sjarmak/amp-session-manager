import { SessionStore, getDbPath } from '@ampsm/core';
import { readLine } from '../utils/readline.js';

export async function repairCommand(options: { all?: boolean; yes?: boolean; json?: boolean }) {
  const dbPath = process.env.AMPSM_DB_PATH || getDbPath();
  const store = new SessionStore(dbPath);
  
  try {
    const allSessions = store.getAllSessions();
    const hangingSessions = allSessions.filter(session => session.status === 'running');
    
    if (hangingSessions.length === 0) {
      if (options.json) {
        console.log(JSON.stringify({
          status: 'success',
          message: 'No hanging sessions found',
          repaired: 0
        }));
      } else {
        console.log('✅ No hanging sessions found. All sessions are in a valid state.');
      }
      return;
    }
    
    if (!options.json) {
      console.log(`\n🔧 Found ${hangingSessions.length} hanging session(s) with status 'running':`);
      for (const session of hangingSessions) {
        console.log(`   - ${session.id}: ${session.name} (last run: ${session.lastRun || 'never'})`);
      }
      console.log('\nThese sessions will be reset to "idle" status.');
    }
    
    if (!options.yes && !options.json) {
      const confirm = await readLine('Do you want to repair these sessions? (y/N): ');
      if (!confirm.toLowerCase().startsWith('y')) {
        console.log('Repair cancelled.');
        return;
      }
    }
    
    let repairedCount = 0;
    for (const session of hangingSessions) {
      try {
        store.updateSessionStatus(session.id, 'idle');
        repairedCount++;
      } catch (error) {
        if (!options.json) {
          console.error(`❌ Failed to repair session ${session.id}:`, error instanceof Error ? error.message : String(error));
        }
      }
    }
    
    if (options.json) {
      console.log(JSON.stringify({
        status: 'success',
        message: `Repaired ${repairedCount} session(s)`,
        repaired: repairedCount,
        total: hangingSessions.length
      }));
    } else {
      console.log(`✅ Successfully repaired ${repairedCount} out of ${hangingSessions.length} session(s).`);
      console.log('Sessions have been reset to "idle" status and can be used again.');
    }
    
  } catch (error) {
    if (options.json) {
      console.log(JSON.stringify({
        status: 'error',
        message: error instanceof Error ? error.message : String(error)
      }));
    } else {
      console.error('❌ Error during repair:', error instanceof Error ? error.message : String(error));
    }
    process.exit(1);
  } finally {
    store.close();
  }
}

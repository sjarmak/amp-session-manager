const { WorktreeManager } = require('./packages/core/dist/index.js');

async function testCleanup() {
  try {
    console.log('Testing worktree cleanup...');
    
    const manager = new WorktreeManager('/Users/sjarmak/test-project');
    
    // Check what sessions exist
    const sessions = await manager.store.listSessions();
    console.log('Sessions in DB:', sessions.length);
    
    // Run prune orphans to clean up
    const result = await manager.pruneOrphans('/Users/sjarmak/test-project');
    console.log('Prune result:', result);
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testCleanup();

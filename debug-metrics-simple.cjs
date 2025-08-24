#!/usr/bin/env node

// Simple test to verify metrics are working after our fixes
const { WorktreeManager } = require('./packages/core/dist/index.cjs');

async function testMetrics() {
  console.log('Creating session manager...');
  const manager = new WorktreeManager({
    databasePath: '/Users/sjarmak/test-project/.ampsm.db',
    enableJSONLogs: true
  });

  console.log('Creating session...');
  const session = await manager.createSession({
    name: 'metrics-debug-test',
    ampPrompt: 'create a text file called test.txt that contains the text "testing metrics"',
    repoRoot: '/Users/sjarmak/test-project',
    baseBranch: 'main'
  });

  console.log(`Session created: ${session.id}`);
  console.log('Running iteration...');
  
  const result = await manager.runIteration(session.id);
  console.log('Iteration result:', {
    success: result.success,
    changedFiles: result.changedFiles,
    cliMetrics: result.cliMetrics
  });

  // Get stream events to verify they're being captured
  const streamEvents = manager.store.getStreamEvents(session.id);
  console.log(`Stream events captured: ${streamEvents.length}`);
  streamEvents.forEach((event, i) => {
    console.log(`  Event ${i}: ${event.event_type} at ${event.timestamp}`);
  });

  process.exit(0);
}

testMetrics().catch(console.error);

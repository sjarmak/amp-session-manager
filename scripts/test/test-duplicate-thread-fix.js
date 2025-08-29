#!/usr/bin/env node

// Test script to verify the duplicate thread fix
// This tests that we don't create unnecessary threads in the store

const { AmpAdapter } = require('./packages/core/src/amp.js');
const { SessionStore } = require('./packages/core/src/store.js');
const { join } = require('path');

async function testDuplicateThreadFix() {
  console.log('Testing duplicate thread creation fix...\n');

  // Create a test store in memory
  const store = new SessionStore(':memory:');
  
  try {
    // Create a test session
    const sessionId = store.createSession({
      name: 'Test Session',
      ampPrompt: 'Test prompt',
      repoRoot: '/tmp',
      baseBranch: 'main'
    }).id;

    console.log(`Created test session: ${sessionId}`);

    // Create an AmpAdapter instance
    const adapter = new AmpAdapter({
      ampPath: 'echo', // Mock amp command for testing  
      ampArgs: [],
      enableJSONLogs: false
    }, store);

    // Check initial thread count
    const initialThreads = store.getSessionThreads(sessionId);
    console.log(`Initial thread count: ${initialThreads.length}`);

    // Call getOrCreateThread like a batch session would
    const threadId = await adapter.getOrCreateThread(sessionId, 'Test prompt');
    console.log(`getOrCreateThread returned: ${threadId}`);

    // Check thread count after getOrCreateThread
    const threadsAfterGetOrCreate = store.getSessionThreads(sessionId);
    console.log(`Thread count after getOrCreateThread: ${threadsAfterGetOrCreate.length}`);

    // Simulate what happens when AMP returns a thread ID
    const ampThreadId = 'T-amp-12345';
    
    // This simulates what would happen in worktree.ts when AMP returns a thread ID
    const existingThreads = store.getSessionThreads(sessionId);
    const threadExists = existingThreads.some(t => t.id === ampThreadId);
    
    if (!threadExists) {
      console.log(`Creating thread record for AMP thread: ${ampThreadId}`);
      store.createThread(sessionId, `Amp Thread ${ampThreadId}`, ampThreadId);
    }

    // Final thread count
    const finalThreads = store.getSessionThreads(sessionId);
    console.log(`Final thread count: ${finalThreads.length}`);
    console.log('Final threads:', finalThreads.map(t => ({ id: t.id, name: t.name })));

    // Expected result: only 1 thread should exist (the one from AMP)
    if (finalThreads.length === 1 && finalThreads[0].id === ampThreadId) {
      console.log('\n✅ TEST PASSED: Only one thread exists, and it\'s the AMP thread');
    } else {
      console.log('\n❌ TEST FAILED: Unexpected number of threads or incorrect thread ID');
    }

  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    store.close();
  }
}

// Make getOrCreateThread accessible for testing
const { AmpAdapter: OriginalAmpAdapter } = require('./packages/core/src/amp.js');
OriginalAmpAdapter.prototype.getOrCreateThread = function(sessionId, prompt) {
  return this.getOrCreateThread(sessionId, prompt);
};

testDuplicateThreadFix().catch(console.error);

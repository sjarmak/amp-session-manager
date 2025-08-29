#!/usr/bin/env node

import path from 'path';
import { fileURLToPath } from 'url';
import { SessionStore } from './packages/core/dist/index.js';
import { WorktreeManager } from './packages/core/dist/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function debugThreadIDs() {
  console.log('🔍 Debugging thread ID behavior during follow-ups...\n');
  
  const dbPath = path.join(__dirname, 'debug-thread-ids.sqlite');
  const store = new SessionStore(dbPath);
  const worktree = new WorktreeManager(store, dbPath);
  
  try {
    // Create a simple session in a temporary directory
    console.log('1️⃣ Creating initial session...');
    const session = await worktree.createFromPrompt({
      repoRoot: '/tmp/thread-debug-repo',
      name: 'Thread Debug Test',
      ampPrompt: 'Create a simple README.md file',
      baseBranch: 'main'
    });
    
    console.log(`✅ Session created: ${session.id}`);
    console.log(`   Initial threadId: ${session.threadId || 'NOT SET'}`);
    
    // Check what threads exist after creation
    const threadsAfterCreate = store.getSessionThreads(session.id);
    console.log(`   Threads in DB after create: ${threadsAfterCreate.length}`);
    threadsAfterCreate.forEach(t => console.log(`     - Thread: ${t.id}, Messages: ${t.messageCount}`));
    
    console.log('\n2️⃣ Running first iteration (should create thread)...');
    await worktree.iterate(session.id);
    
    // Check session and threads after first iteration
    const sessionAfterFirst = store.getSession(session.id);
    console.log(`✅ First iteration complete`);
    console.log(`   Session threadId after first: ${sessionAfterFirst.threadId || 'NOT SET'}`);
    
    const threadsAfterFirst = store.getSessionThreads(session.id);
    console.log(`   Threads in DB after first: ${threadsAfterFirst.length}`);
    threadsAfterFirst.forEach(t => console.log(`     - Thread: ${t.id}, Messages: ${t.messageCount}`));
    
    console.log('\n3️⃣ Running follow-up iteration (should continue same thread)...');
    await worktree.iterate(session.id, 'Add a description to the README');
    
    // Check session and threads after follow-up
    const sessionAfterFollowUp = store.getSession(session.id);
    console.log(`✅ Follow-up iteration complete`);
    console.log(`   Session threadId after follow-up: ${sessionAfterFollowUp.threadId || 'NOT SET'}`);
    
    const threadsAfterFollowUp = store.getSessionThreads(session.id);
    console.log(`   Threads in DB after follow-up: ${threadsAfterFollowUp.length}`);
    threadsAfterFollowUp.forEach(t => console.log(`     - Thread: ${t.id}, Messages: ${t.messageCount}`));
    
    // Analysis
    console.log('\n📊 Analysis:');
    if (threadsAfterFollowUp.length === 1) {
      console.log('✅ GOOD: Only one thread exists - follow-up continued same thread');
    } else {
      console.log(`❌ BAD: ${threadsAfterFollowUp.length} threads exist - follow-up created new thread!`);
    }
    
    // Check iterations
    const iterations = store.getIterations(session.id);
    console.log(`   Total iterations: ${iterations.length}`);
    console.log(`   Expected: 2 iterations in same thread`);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

debugThreadIDs().catch(console.error);

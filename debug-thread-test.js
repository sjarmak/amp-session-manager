#!/usr/bin/env node

import path from 'path';
import { fileURLToPath } from 'url';
import { SessionStore } from './packages/core/dist/index.js';
import { WorktreeManager } from './packages/core/dist/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function testThreadContinuation() {
  console.log('🧪 Testing thread continuation behavior...');
  
  const dbPath = path.join(__dirname, 'test-thread-db.sqlite');
  const store = new SessionStore(dbPath);
  const worktree = new WorktreeManager(store, dbPath);
  
  try {
    // Create a simple session
    const session = await worktree.createFromPrompt({
      repoRoot: '/tmp/test-repo',
      name: 'Thread Test',
      ampPrompt: 'Create a file called initial.txt with content "step 1"',
      baseBranch: 'main'
    });
    
    console.log(`✅ Created session: ${session.id}`);
    console.log(`   Thread ID in session: ${session.threadId || 'NOT SET'}`);
    
    // Check iterations before follow-up
    const iterationsBefore = store.getIterations(session.id);
    console.log(`📊 Iterations before follow-up: ${iterationsBefore.length}`);
    
    // Run a follow-up iteration  
    console.log('🔄 Running follow-up iteration...');
    await worktree.iterate(session.id, 'Add "step 2" to the file');
    
    // Check iterations after follow-up
    const iterationsAfter = store.getIterations(session.id);
    console.log(`📊 Iterations after follow-up: ${iterationsAfter.length}`);
    
    // Check if same thread ID is used
    const updatedSession = store.getSession(session.id);
    console.log(`   Thread ID after follow-up: ${updatedSession.threadId || 'NOT SET'}`);
    
    if (iterationsAfter.length > iterationsBefore.length) {
      console.log('✅ Follow-up created new iteration in same session');
    } else {
      console.log('❌ Follow-up did NOT create new iteration');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testThreadContinuation().catch(console.error);

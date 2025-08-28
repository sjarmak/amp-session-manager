#!/usr/bin/env node

// Simple test to verify autoCommit behavior
const { SessionStore } = require('./packages/core/dist/index.cjs');
const path = require('path');

function testAutoCommit() {
  console.log('Testing autoCommit behavior...');
  
  // Create a test store
  const dbPath = path.join(__dirname, 'test-autocommit.db');
  const store = new SessionStore(dbPath);
  
  try {
    // Test creating a session with autoCommit: false
    const session = store.createSession({
      name: 'test-session',
      ampPrompt: 'test prompt',
      repoRoot: '/tmp',
      baseBranch: 'main',
      autoCommit: false
    });
    
    console.log('Created session with autoCommit: false');
    console.log('Session ID:', session.id);
    
    // Read it back
    const retrieved = store.getSession(session.id);
    console.log('Retrieved session autoCommit:', retrieved?.autoCommit);
    
    // Test creating a session with autoCommit: true
    const session2 = store.createSession({
      name: 'test-session-2', 
      ampPrompt: 'test prompt 2',
      repoRoot: '/tmp',
      baseBranch: 'main',
      autoCommit: true
    });
    
    console.log('Created session with autoCommit: true');
    const retrieved2 = store.getSession(session2.id);
    console.log('Retrieved session2 autoCommit:', retrieved2?.autoCommit);
    
    // Test creating a session with no autoCommit specified
    const session3 = store.createSession({
      name: 'test-session-3',
      ampPrompt: 'test prompt 3', 
      repoRoot: '/tmp',
      baseBranch: 'main'
    });
    
    console.log('Created session with no autoCommit specified');
    const retrieved3 = store.getSession(session3.id);
    console.log('Retrieved session3 autoCommit (should default to true):', retrieved3?.autoCommit);
    
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    store.close();
    
    // Clean up test db
    const fs = require('fs');
    try {
      fs.unlinkSync(dbPath);
      console.log('Cleaned up test database');
    } catch (e) {
      console.warn('Failed to clean up test database:', e.message);
    }
  }
}

testAutoCommit();

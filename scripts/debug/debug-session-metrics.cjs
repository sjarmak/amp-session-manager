#!/usr/bin/env node

const { SessionStore } = require('./packages/core/dist/store.js');
const { WorktreeManager } = require('./packages/core/dist/worktree.js');
const { AmpAdapter } = require('./packages/core/dist/amp.js');
const path = require('path');
const fs = require('fs');

async function debugSessionMetrics() {
  console.log('🔍 Debug: Testing session metrics isolation...');
  
  try {
    // Create a test repository
    const testRepo = '/tmp/test-amp-session-metrics';
    if (fs.existsSync(testRepo)) {
      fs.rmSync(testRepo, { recursive: true });
    }
    fs.mkdirSync(testRepo, { recursive: true });
    
    // Initialize git repo
    const { execSync } = require('child_process');
    execSync('git init && git config user.email "test@example.com" && git config user.name "Test User"', { cwd: testRepo });
    execSync('echo "# Test repo" > README.md && git add . && git commit -m "Initial commit"', { cwd: testRepo });
    
    // Create session store and worktree manager
    const store = new SessionStore(':memory:');
    const ampAdapter = new AmpAdapter({
      ampPath: 'echo', // Use echo instead of real amp for testing
    });
    const manager = new WorktreeManager(store, ampAdapter);
    
    // Create a session
    const sessionOptions = {
      name: 'debug-metrics-test',
      ampPrompt: 'Test session for debugging CLI metrics',
      repoRoot: testRepo,
      baseBranch: 'main'
    };
    
    console.log('📝 Creating session...');
    const session = await manager.createSession(sessionOptions);
    console.log('✅ Session created:', session.id);
    
    // Run an iteration (this will call echo instead of amp)
    console.log('🏃 Running iteration...');
    const result = await manager.runIteration(session.id, 'Test prompt to debug metrics');
    
    console.log('📊 Iteration result:');
    console.log('  Success:', result.success);
    console.log('  Status:', result.status);
    console.log('  CLI metrics available:', !!result.cliMetrics);
    
    if (result.cliMetrics) {
      console.log('  Tool usage count:', result.cliMetrics.toolUsageCount);
      console.log('  Error count:', result.cliMetrics.errorCount);
      console.log('  Duration:', result.cliMetrics.durationMs);
    }
    
    // Check if session log file was created
    const sessionLogPath = path.join(session.worktreePath, '.amp-session.log');
    console.log('🔍 Checking session log file:', sessionLogPath);
    console.log('  Exists:', fs.existsSync(sessionLogPath));
    
    if (fs.existsSync(sessionLogPath)) {
      const logContent = fs.readFileSync(sessionLogPath, 'utf8');
      console.log('  Content length:', logContent.length);
      console.log('  Content preview:', logContent.slice(0, 200));
    }
    
    // Cleanup
    store.close();
    fs.rmSync(testRepo, { recursive: true });
    console.log('✅ Test completed');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

debugSessionMetrics();

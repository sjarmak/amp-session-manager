#!/usr/bin/env node

const { SessionStore, WorktreeManager, getDbPath } = require('./packages/core/dist/index.js');
const { mkdir, writeFile, readdir } = require('fs/promises');
const { resolve, join } = require('path');
const { execSync } = require('child_process');

async function testGitStaging() {
  console.log('=== Git Staging Debug Test ===');
  
  const dbPath = getDbPath();
  const store = new SessionStore(dbPath);
  const manager = new WorktreeManager(store);
  
  // Create a test repo
  const testRepoPath = resolve('./test-staging-repo');
  
  try {
    // Clean up any existing test repo
    try {
      execSync(`rm -rf "${testRepoPath}"`, { stdio: 'inherit' });
    } catch (e) {
      // ignore
    }
    
    // Create test repo
    await mkdir(testRepoPath, { recursive: true });
    process.chdir(testRepoPath);
    
    execSync('git init', { stdio: 'inherit' });
    execSync('git config user.email "test@example.com"', { stdio: 'inherit' });
    execSync('git config user.name "Test User"', { stdio: 'inherit' });
    
    // Create initial commit
    await writeFile('README.md', '# Test Repo\n');
    execSync('git add README.md', { stdio: 'inherit' });
    execSync('git commit -m "Initial commit"', { stdio: 'inherit' });
    
    console.log('✓ Test repo created');
    
    // Create a session with a simple prompt
    const session = await manager.createSession({
      name: 'debug-staging-test',
      ampPrompt: 'Create a new file called test.txt with content "Hello World"',
      repoRoot: testRepoPath,
      baseBranch: 'main'
    });
    
    console.log(`✓ Session created: ${session.id}`);
    console.log(`Worktree path: ${session.worktreePath}`);
    
    // Check git status in the worktree
    try {
      process.chdir(session.worktreePath);
      console.log('\n=== Git Status in Worktree ===');
      execSync('git status --porcelain', { stdio: 'inherit' });
      
      console.log('\n=== Staged Files ===');
      execSync('git diff --cached --name-only', { stdio: 'inherit' });
      
      console.log('\n=== All Files in Worktree ===');
      const files = await readdir(session.worktreePath);
      console.log('Files:', files);
      
    } catch (error) {
      console.error('Error checking git status:', error.message);
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    store.close();
    
    // Cleanup
    try {
      process.chdir(__dirname);
      execSync(`rm -rf "${testRepoPath}"`, { stdio: 'inherit' });
      console.log('✓ Cleaned up test repo');
    } catch (e) {
      console.warn('Failed to cleanup:', e.message);
    }
  }
}

testGitStaging().catch(console.error);

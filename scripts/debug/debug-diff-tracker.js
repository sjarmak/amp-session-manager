/**
 * Debug script to test FileDiffTracker directly
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// Test git diff functionality
console.log('=== TESTING GIT DIFF FUNCTIONALITY ===\n');

// Create a test directory
const testDir = '/tmp/git-diff-test';
if (fs.existsSync(testDir)) {
  execSync(`rm -rf ${testDir}`);
}

console.log('Creating test repository...');
execSync(`mkdir -p ${testDir}`);
process.chdir(testDir);
execSync('git init');
execSync('git config user.email "test@example.com"');
execSync('git config user.name "Test User"');

// Create initial commit
fs.writeFileSync('initial.txt', 'Hello World\n');
execSync('git add initial.txt');
execSync('git commit -m "Initial commit"');

console.log('✓ Test repository created\n');

// Test 1: Create a new file
console.log('Test 1: Creating new file...');
fs.writeFileSync('new-file.txt', 'This is a new file\nWith multiple lines\n');
execSync('git add new-file.txt');

// Check git status
const status = execSync('git status --porcelain', { encoding: 'utf8' });
console.log('Git status output:', status);

// Check git diff --numstat
const diffStat = execSync('git diff --cached --numstat', { encoding: 'utf8' });
console.log('Git diff --numstat output:', diffStat);

// Parse the numstat output manually
if (diffStat.trim()) {
  const lines = diffStat.trim().split('\n');
  lines.forEach(line => {
    const parts = line.split('\t');
    if (parts.length >= 3) {
      const added = parts[0];
      const deleted = parts[1];
      const filename = parts[2];
      console.log(`File: ${filename}, Added: ${added}, Deleted: ${deleted}`);
    }
  });
}

// Test 2: Modify existing file
console.log('\nTest 2: Modifying existing file...');
fs.writeFileSync('initial.txt', 'Hello World\nAdded line\nAnother line\n');
execSync('git add initial.txt');

const diffStat2 = execSync('git diff --cached --numstat', { encoding: 'utf8' });
console.log('Git diff --numstat output for modified file:', diffStat2);

// Cleanup
process.chdir('/');
execSync(`rm -rf ${testDir}`);
console.log('\n✓ Test completed and cleaned up');

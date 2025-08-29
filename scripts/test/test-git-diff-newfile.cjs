#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Create a temporary git repo to test git diff behavior with new files
const testDir = path.join(os.tmpdir(), 'git-diff-test-' + Date.now());

console.log('Creating test directory:', testDir);
fs.mkdirSync(testDir);

try {
  process.chdir(testDir);
  
  // Initialize git repo
  execSync('git init', { stdio: 'inherit' });
  execSync('git config user.name "Test User"', { stdio: 'inherit' });
  execSync('git config user.email "test@example.com"', { stdio: 'inherit' });
  
  console.log('\n=== Test 1: Create initial commit ===');
  fs.writeFileSync('initial.txt', 'Initial file content\n');
  execSync('git add initial.txt', { stdio: 'inherit' });
  execSync('git commit -m "Initial commit"', { stdio: 'inherit' });
  const initialSha = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
  console.log('Initial SHA:', initialSha);
  
  console.log('\n=== Test 2: Create new file ===');
  fs.writeFileSync('goodbye.py', 'print("Hello, World!")\nprint("Goodbye!")\n');
  
  console.log('\nGit status after creating new file:');
  console.log(execSync('git status --porcelain', { encoding: 'utf-8' }));
  
  console.log('\nGit diff --numstat (unstaged):');
  try {
    console.log(execSync('git diff --numstat', { encoding: 'utf-8' }));
  } catch (e) {
    console.log('(no output or error)');
  }
  
  console.log('\nAdding new file to staging...');
  execSync('git add goodbye.py', { stdio: 'inherit' });
  
  console.log('\nGit status after staging:');
  console.log(execSync('git status --porcelain', { encoding: 'utf-8' }));
  
  console.log('\nGit diff --numstat --staged:');
  try {
    console.log(execSync('git diff --numstat --staged', { encoding: 'utf-8' }));
  } catch (e) {
    console.log('(no output or error)');
  }
  
  console.log('\nCommitting new file...');
  execSync('git commit -m "Add goodbye.py"', { stdio: 'inherit' });
  const newSha = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
  console.log('New SHA:', newSha);
  
  console.log('\n=== Test 3: Check diff between commits ===');
  console.log(`\nGit diff --numstat ${initialSha}..${newSha}:`);
  try {
    const diffOutput = execSync(`git diff --numstat ${initialSha}..${newSha}`, { encoding: 'utf-8' });
    console.log(diffOutput);
    
    // Parse the output like the code does
    const lines = diffOutput.trim().split('\n').filter(line => line.length > 0);
    console.log('\nParsed lines:', lines.length);
    
    let filesChanged = 0;
    let insertions = 0;
    let deletions = 0;
    
    for (const line of lines) {
      const parts = line.split('\t');
      console.log('Line parts:', parts);
      if (parts.length >= 2) {
        const addedStr = parts[0].trim();
        const deletedStr = parts[1].trim();
        
        const added = (addedStr === '-') ? 0 : parseInt(addedStr, 10) || 0;
        const deleted = (deletedStr === '-') ? 0 : parseInt(deletedStr, 10) || 0;
        
        console.log(`File ${parts[2]}: +${added}/-${deleted} (raw: ${addedStr}/${deletedStr})`);
        
        filesChanged++;
        insertions += added;
        deletions += deleted;
      }
    }
    
    console.log(`\nFinal stats: files=${filesChanged}, +${insertions}/-${deletions}`);
    
  } catch (e) {
    console.log('Error running diff:', e.message);
  }
  
  console.log('\n=== Test 4: Check what happens with no previous commit ===');
  const tempDir2 = path.join(os.tmpdir(), 'git-diff-test-2-' + Date.now());
  fs.mkdirSync(tempDir2);
  process.chdir(tempDir2);
  
  execSync('git init', { stdio: 'inherit' });
  execSync('git config user.name "Test User"', { stdio: 'inherit' });
  execSync('git config user.email "test@example.com"', { stdio: 'inherit' });
  
  fs.writeFileSync('first.py', 'print("First file")\n');
  execSync('git add first.py', { stdio: 'inherit' });
  
  console.log('\nTrying git diff --numstat on first commit (no previous commit):');
  try {
    const noPrevDiff = execSync('git diff --numstat HEAD', { encoding: 'utf-8' });
    console.log('Output:', noPrevDiff);
  } catch (e) {
    console.log('Error (expected):', e.message);
  }
  
  // Commit and then try to diff against the commit
  execSync('git commit -m "First commit"', { stdio: 'inherit' });
  const firstSha = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
  
  // Try diffing the commit against itself (should be empty)
  console.log('\nTrying git diff --numstat against same commit:');
  try {
    const sameDiff = execSync(`git diff --numstat ${firstSha}..${firstSha}`, { encoding: 'utf-8' });
    console.log('Output:', JSON.stringify(sameDiff));
  } catch (e) {
    console.log('Error:', e.message);
  }

} catch (error) {
  console.error('Test failed:', error.message);
} finally {
  // Cleanup
  process.chdir('/');
  try {
    execSync(`rm -rf "${testDir}"`, { stdio: 'inherit' });
    if (fs.existsSync(testDir + '2')) {
      execSync(`rm -rf "${testDir}2"`, { stdio: 'inherit' });
    }
  } catch (e) {
    console.log('Cleanup failed:', e.message);
  }
}

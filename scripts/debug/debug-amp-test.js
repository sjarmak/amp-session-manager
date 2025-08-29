#!/usr/bin/env node

import { execSync } from 'child_process';
import { mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Create temp dir and test file
const testDir = mkdtempSync(join(tmpdir(), 'amp-debug-test-'));
const logFile = join(testDir, 'debug.log');

console.log('Test directory:', testDir);
console.log('Log file:', logFile);

// Create a simple test file
execSync(`echo 'console.log("hello")' > ${testDir}/test.js`);

// Run a simple Amp command with debug logging
try {
  const result = execSync(`cd "${testDir}" && echo "list the files in this directory" | amp -x --log-level debug --log-file "${logFile}"`, { 
    encoding: 'utf8',
    timeout: 30000 
  });
  
  console.log('Amp output:', result);
  
  // Print first 100 lines of debug log
  try {
    const debugContent = execSync(`head -100 "${logFile}"`, { encoding: 'utf8' });
    console.log('\n=== DEBUG LOG SAMPLE ===');
    console.log(debugContent);
  } catch (e) {
    console.error('Failed to read debug log:', e.message);
  }
  
} catch (error) {
  console.error('Amp command failed:', error.message);
  console.log('Command was:', `cd "${testDir}" && amp --log-level debug --log-file "${logFile}" "list the files in this directory"`);
}

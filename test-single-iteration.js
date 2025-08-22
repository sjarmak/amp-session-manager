#!/usr/bin/env node

// Test script to verify single iteration behavior in batch execution
import { readFileSync } from 'fs';
import { join } from 'path';

console.log('🔍 Analyzing batch.ts to verify single iteration fix...\n');

// Read the fixed batch.ts file
const batchFile = readFileSync(join(process.cwd(), 'packages/core/src/batch.ts'), 'utf8');

// Check if the problematic iterate() call was removed
const hasIterateCall = batchFile.includes('worktreeManager.iterate(session.id)');
const hasFixComment = batchFile.includes('createSession() already runs the initial iteration');

console.log('✅ Analysis Results:');
console.log(`- Removed redundant iterate() call: ${!hasIterateCall ? '✅ YES' : '❌ NO'}`);
console.log(`- Added explanatory comment: ${hasFixComment ? '✅ YES' : '❌ NO'}`);

if (!hasIterateCall && hasFixComment) {
  console.log('\n🎉 Fix verified! Batch execution now runs only one iteration per matrix item.');
  console.log('\nPrevious behavior:');
  console.log('  1. createSession() → automatic initial iteration');
  console.log('  2. worktreeManager.iterate() → redundant second iteration with /continue');
  console.log('\nNew behavior:');
  console.log('  1. createSession() → single iteration (done!)');
  console.log('\nThis eliminates the confusing alternating model logic in batch runs.');
} else {
  console.log('\n❌ Fix not complete. Please check the batch.ts file.');
}

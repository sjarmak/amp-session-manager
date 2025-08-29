#!/usr/bin/env node

import { BatchRunner, SessionStore } from '@ampsm/core';
import { readFile } from 'fs/promises';

async function testBatchParsing() {
  try {
    const store = new SessionStore();
    const batchRunner = new BatchRunner(store);
    
    console.log('Testing YAML parsing...');
    const plan = await batchRunner.parsePlan('./test-batch-plan.yaml');
    
    console.log('Parsed plan:');
    console.log(`Concurrency: ${plan.concurrency}`);
    console.log(`Models used: ${[...new Set(plan.matrix.map(item => item.model || plan.defaults.model || 'default'))].join(', ')}`);
    
    console.log('\nTesting dry run...');
    await batchRunner.runBatch(plan, true);
    
    store.close();
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testBatchParsing();

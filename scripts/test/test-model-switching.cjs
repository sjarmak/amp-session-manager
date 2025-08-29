#!/usr/bin/env node

/**
 * Test script to verify model switching behavior
 * - First message should use default model (no modelOverride)
 * - Follow-up messages should use gpt-5 (modelOverride: 'gpt-5')
 */

const { AmpAdapter } = require('./packages/core/dist/index.cjs');
const fs = require('fs');

async function testModelSwitching() {
  console.log('🧪 Testing Model Switching Configuration');
  console.log('='.repeat(50));

  const adapter = new AmpAdapter({
    ampPath: 'amp',
    ampArgs: [],
    extraArgs: []
  });

  // Create a temporary test directory
  const testDir = '/tmp/model-test';
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  try {
    console.log('\n📝 Test 1: First message (should use default model)');
    console.log('-'.repeat(40));
    
    // Mock sessionId as undefined to simulate first run
    const result1 = await adapter.continueThread(
      'What model are you? Please be specific about your model name and version.',
      testDir,
      undefined, // no model override
      undefined, // no sessionId (first run)
      false
    );
    
    console.log('✅ First message completed');
    console.log('Output preview:', result1.output.substring(0, 100) + '...');

    console.log('\n📝 Test 2: Follow-up message (should use gpt-5)');
    console.log('-'.repeat(40));
    
    // Mock sessionId to simulate follow-up
    const result2 = await adapter.continueThread(
      'Can you confirm what model you are again? Are you GPT-5 or Claude?',
      testDir,
      undefined, // no explicit model override
      'mock-session-id', // has sessionId (follow-up)
      false
    );
    
    console.log('✅ Follow-up message completed');
    console.log('Output preview:', result2.output.substring(0, 100) + '...');

    console.log('\n📝 Test 3: Explicit model override');
    console.log('-'.repeat(40));
    
    const result3 = await adapter.continueThread(
      'What model are you when I explicitly request claude-3-5-sonnet?',
      testDir,
      'claude-3-5-sonnet', // explicit model override
      undefined, // first run
      false
    );
    
    console.log('✅ Explicit model override completed');
    console.log('Output preview:', result3.output.substring(0, 100) + '...');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    // Cleanup
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  }

  console.log('\n🎉 Model switching tests completed!');
  console.log('Check the logs above for "modelOverride" values to verify behavior.');
}

// Mock hasExistingThread to control test scenarios
const originalHasExistingThread = AmpAdapter.prototype.hasExistingThread;
AmpAdapter.prototype.hasExistingThread = async function(sessionId) {
  console.log(`🔍 hasExistingThread called with sessionId: ${sessionId}`);
  // Return false for undefined sessionId (first run)
  // Return true for any actual sessionId (follow-up)
  return sessionId !== undefined;
};

testModelSwitching().catch(console.error);

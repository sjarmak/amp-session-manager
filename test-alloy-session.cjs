#!/usr/bin/env node

/**
 * Test alloy model switching within a session manager session
 */

const { AmpAdapter } = require('./packages/core/dist/index.cjs');

async function testSessionAlloy() {
  console.log('🎯 Testing Alloy in Session Manager');
  console.log('='.repeat(40));

  const adapter = new AmpAdapter({
    ampPath: 'amp',
    ampArgs: [],
    extraArgs: []
  });

  const testDir = '/tmp/alloy-session-test';
  const fs = require('fs');
  
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true });
  }
  fs.mkdirSync(testDir, { recursive: true });

  const detectionPrompts = [
    'What is your training cutoff date? Just month/year.',
    'Solve 17 × 23 and show your method.',
    'Rate your confidence 1-10 and explain why.',
    'Can you browse the web? Yes or no.',
    'What is 2024 - 1987?'
  ];

  try {
    console.log('\n🔬 Testing with modelOverride: "alloy"');
    console.log('-'.repeat(30));
    
    for (let i = 0; i < detectionPrompts.length; i++) {
      console.log(`\nTest ${i + 1}: "${detectionPrompts[i]}"`);
      
      const result = await adapter.continueThread(
        detectionPrompts[i],
        testDir,
        'alloy', // Use alloy model override
        i === 0 ? undefined : 'test-session', // First is new, rest are follow-ups
        false
      );
      
      console.log(`Response: "${result.output.substring(0, 120)}${result.output.length > 120 ? '...' : ''}"`);
      
      // Small delay between calls
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log('\n✅ Alloy session test completed');
    console.log('\n📝 Analysis:');
    console.log('- Look for varying response styles, confidence levels, or capabilities');
    console.log('- Different training cutoffs suggest different models');
    console.log('- Inconsistent math approaches indicate model switching');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  }
}

// Mock the hasExistingThread method for testing
const originalHasExistingThread = AmpAdapter.prototype.hasExistingThread;
AmpAdapter.prototype.hasExistingThread = async function(sessionId) {
  return sessionId === 'test-session';
};

testSessionAlloy().catch(console.error);

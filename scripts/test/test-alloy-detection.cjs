#!/usr/bin/env node

/**
 * Systematic test to detect model switching in Alloy mode
 * Uses multiple fingerprinting techniques to identify which model is responding
 */

const { execSync } = require('child_process');
const fs = require('fs');

// Model fingerprinting prompts - each designed to get distinct responses
const FINGERPRINT_TESTS = [
  {
    name: 'training_cutoff',
    prompt: 'What is your exact training data cutoff date? Answer with just the month and year.',
    expected: {
      claude: /april|2024/i,
      gpt5: /october|2024/i,
      gpt4: /april|2023/i
    }
  },
  {
    name: 'math_reasoning',
    prompt: 'Solve: 127 × 143. Show your calculation method briefly.',
    expected: {
      // Different models tend to use different calculation approaches
      claude: /break|split|partial/i,
      gpt5: /distributive|mental/i,
      gpt4: /standard|traditional/i
    }
  },
  {
    name: 'creative_style',
    prompt: 'Write a 2-line poem about debugging code.',
    expected: {
      // Stylistic differences - harder to detect but useful for patterns
      claude: /through|until|careful/i,
      gpt5: /each|every|step/i,
      gpt4: /line|error|fix/i
    }
  },
  {
    name: 'response_style',
    prompt: 'How confident are you in your responses? Rate 1-10 and explain briefly.',
    expected: {
      claude: /context|depends|varies/i,
      gpt5: /confident|certain|high/i,
      gpt4: /limitations|uncertain/i
    }
  },
  {
    name: 'capabilities',
    prompt: 'Can you generate images, browse web, or run code? List yes/no for each.',
    expected: {
      claude: /no.*no.*no/i,
      gpt5: /no.*yes.*yes/i,
      gpt4: /no.*no.*limited/i
    }
  }
];

function runAmpCommand(prompt, useAlloy = false) {
  const env = { ...process.env };
  if (useAlloy) {
    env['amp.internal.alloy.enable'] = 'true';
  }
  
  try {
    const result = execSync(`echo "${prompt}" | amp -x`, { 
      env,
      encoding: 'utf8',
      timeout: 30000
    });
    return { success: true, output: result.trim() };
  } catch (error) {
    return { 
      success: false, 
      error: error.message,
      output: error.stdout?.toString()?.trim() || ''
    };
  }
}

function detectModel(output) {
  const detections = {};
  
  for (const test of FINGERPRINT_TESTS) {
    const modelScores = {};
    
    for (const [model, pattern] of Object.entries(test.expected)) {
      if (pattern.test(output)) {
        modelScores[model] = (modelScores[model] || 0) + 1;
      }
    }
    
    const bestMatch = Object.entries(modelScores)
      .sort(([,a], [,b]) => b - a)[0];
    
    if (bestMatch) {
      detections[test.name] = bestMatch[0];
    }
  }
  
  // Aggregate detection results
  const votes = {};
  Object.values(detections).forEach(model => {
    votes[model] = (votes[model] || 0) + 1;
  });
  
  const topVote = Object.entries(votes)
    .sort(([,a], [,b]) => b - a)[0];
  
  return {
    detectedModel: topVote ? topVote[0] : 'unknown',
    confidence: topVote ? topVote[1] / Object.keys(detections).length : 0,
    breakdown: detections,
    votes
  };
}

async function testAlloyConsistency() {
  console.log('🔬 Testing Alloy Model Detection & Consistency');
  console.log('='.repeat(60));
  
  const results = [];
  const iterations = 10; // Test multiple times to detect switching
  
  console.log(`\n📊 Running ${iterations} iterations with alloy enabled...`);
  console.log('-'.repeat(40));
  
  for (let i = 1; i <= iterations; i++) {
    console.log(`\nIteration ${i}/${iterations}:`);
    
    const testResult = {
      iteration: i,
      tests: {},
      overallDetection: null
    };
    
    // Run each fingerprint test
    for (const test of FINGERPRINT_TESTS) {
      const result = runAmpCommand(test.prompt, true); // Use alloy
      
      if (!result.success) {
        console.log(`  ❌ ${test.name}: ${result.error}`);
        testResult.tests[test.name] = { error: result.error };
        continue;
      }
      
      const detection = detectModel(result.output);
      testResult.tests[test.name] = {
        output: result.output,
        detection: detection.detectedModel
      };
      
      console.log(`  🔍 ${test.name}: ${detection.detectedModel} (confidence: ${(detection.confidence * 100).toFixed(1)}%)`);
      console.log(`     Response: "${result.output.substring(0, 80)}..."`);
    }
    
    // Aggregate detection for this iteration
    const allDetections = Object.values(testResult.tests)
      .filter(t => !t.error && t.detection !== 'unknown')
      .map(t => t.detection);
    
    const modelCounts = {};
    allDetections.forEach(model => {
      modelCounts[model] = (modelCounts[model] || 0) + 1;
    });
    
    const topModel = Object.entries(modelCounts)
      .sort(([,a], [,b]) => b - a)[0];
    
    testResult.overallDetection = topModel ? topModel[0] : 'unknown';
    console.log(`  📋 Overall detection: ${testResult.overallDetection}`);
    
    results.push(testResult);
    
    // Small delay between iterations
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Analyze consistency
  console.log('\n📈 Analysis:');
  console.log('='.repeat(40));
  
  const overallDetections = results.map(r => r.overallDetection).filter(d => d !== 'unknown');
  const detectionCounts = {};
  overallDetections.forEach(detection => {
    detectionCounts[detection] = (detectionCounts[detection] || 0) + 1;
  });
  
  console.log('\nModel detection frequency:');
  Object.entries(detectionCounts)
    .sort(([,a], [,b]) => b - a)
    .forEach(([model, count]) => {
      const percentage = (count / overallDetections.length * 100).toFixed(1);
      console.log(`  ${model}: ${count}/${overallDetections.length} (${percentage}%)`);
    });
  
  const uniqueModels = Object.keys(detectionCounts).length;
  console.log(`\n🎯 Conclusion:`);
  if (uniqueModels === 1) {
    console.log(`  ✅ Consistent model detected: ${Object.keys(detectionCounts)[0]}`);
  } else if (uniqueModels > 1) {
    console.log(`  🔄 Model switching detected! ${uniqueModels} different models identified`);
    console.log(`  📊 This suggests Alloy is working as intended`);
  } else {
    console.log(`  ❓ Inconclusive results - consider adjusting fingerprint tests`);
  }
  
  // Save detailed results
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `alloy-test-results-${timestamp}.json`;
  fs.writeFileSync(filename, JSON.stringify(results, null, 2));
  console.log(`\n💾 Detailed results saved to: ${filename}`);
}

testAlloyConsistency().catch(console.error);

#!/usr/bin/env node

/**
 * Test SDLC Agents with Local Amp Development Setup
 */

import { AmpAdapter } from './packages/core/dist/index.js';

console.log('🧪 TESTING SDLC AGENTS WITH LOCAL AMP');
console.log('=====================================\n');

// Configuration to use local Amp CLI with local server
const runtimeConfig = {
  ampCliPath: '/Users/sjarmak/.local/share/mise/installs/node/20.19.4/bin/amp', // Point to your built CLI
  ampServerUrl: 'https://localhost:7002' // Your local development server
};

console.log('Configuration:');
console.log(`  CLI Path: ${runtimeConfig.ampCliPath}`);
console.log(`  Server URL: ${runtimeConfig.ampServerUrl}`);
console.log('');

// Test cases for each agent
const testCases = [
  {
    name: 'Planning Agent (Explicit)',
    prompt: 'Design a microservices architecture for an e-commerce platform',
    agentId: 'planning',
    agentMode: 'explicit'
  },
  {
    name: 'Testing Agent (Auto-route)',
    prompt: 'Add comprehensive unit tests for the authentication module',
    autoRoute: true,
    expectedAgent: 'testing'
  },
  {
    name: 'DevOps Agent (Explicit + Alloy Mode)',
    prompt: 'Set up CI/CD pipeline for production deployment with monitoring',
    agentId: 'devops',
    agentMode: 'explicit',
    alloyMode: true
  },
  {
    name: 'Compliance Agent (Auto-route)',
    prompt: 'Review security vulnerabilities and perform GDPR compliance audit',
    autoRoute: true,
    expectedAgent: 'compliance'
  },
  {
    name: 'Documentation Agent (Multi-provider)',
    prompt: 'Generate comprehensive API documentation with examples and guides',
    agentId: 'docs',
    agentMode: 'explicit',
    multiProvider: true
  },
  {
    name: 'Autonomy Agent (Task Breakdown)',
    prompt: 'Break down this complex feature into manageable subtasks',
    agentId: 'autonomy',
    agentMode: 'explicit'
  }
];

async function runTests() {
  console.log('🚀 Starting SDLC Agents Tests\n');
  
  for (const testCase of testCases) {
    console.log(`\n📋 Test: ${testCase.name}`);
    console.log(`   Prompt: "${testCase.prompt}"`);
    console.log(`   Agent: ${testCase.agentId || 'auto-route'}`);
    console.log(`   Mode: ${testCase.agentMode || (testCase.autoRoute ? 'auto-route' : 'default')}`);
    console.log(`   Features: ${[
      testCase.alloyMode && 'alloy', 
      testCase.multiProvider && 'multi-provider',
      testCase.autoRoute && 'auto-route'
    ].filter(Boolean).join(', ') || 'none'}`);
    console.log('   ⏳ Running...');
    
    try {
      const adapter = new AmpAdapter({
        runtimeConfig,
        agentId: testCase.agentId,
        autoRoute: testCase.autoRoute,
        alloyMode: testCase.alloyMode,
        multiProvider: testCase.multiProvider,
        extraArgs: ['-x'], // Add execute mode
        env: {
          NODE_TLS_REJECT_UNAUTHORIZED: '0' // For local HTTPS
        }
      });
      
      // Use current directory as working dir
      const result = await adapter.continueThread(
        testCase.prompt,
        process.cwd()
      );
      
      if (result.success) {
        console.log(`   ✅ SUCCESS`);
        console.log(`   📊 Tools used: ${result.telemetry.toolCalls.length}`);
        
        // Check agent metrics if available
        if (result.telemetry.agentMetrics) {
          const metrics = result.telemetry.agentMetrics;
          console.log(`   🤖 Agent used: ${metrics.agentId || 'none'}`);
          console.log(`   🔄 Auto-routed: ${metrics.autoRouted ? 'yes' : 'no'}`);
          if (metrics.alloyMode) {
            console.log(`   🔗 Alloy mode: ${metrics.primaryModel} + ${metrics.validatorModel}`);
          }
        }
        
        console.log(`   📝 Output (first 200 chars): ${result.output.substring(0, 200)}...`);
        if (result.threadId) {
          console.log(`   🧵 Thread ID: ${result.threadId}`);
        }
        
        // Validate expected agent if specified
        if (testCase.expectedAgent && result.telemetry.agentMetrics?.agentId !== testCase.expectedAgent) {
          console.log(`   ⚠️  Expected agent '${testCase.expectedAgent}' but got '${result.telemetry.agentMetrics?.agentId || 'none'}'`);
        }
      } else {
        console.log(`   ❌ FAILED`);
        console.log(`   🔍 Error: ${result.output.substring(0, 300)}`);
      }
      
    } catch (error) {
      console.log(`   ❌ ERROR: ${error.message}`);
    }
  }
  
  console.log('\n🎯 Tests completed!');
}

// Check if the development server is running first
console.log('🔍 Checking if development server is running...');
try {
  const response = await fetch('https://localhost:7002/', {
    method: 'GET',
    headers: { 'Accept': 'text/html' }
  });
  console.log(`✅ Server is running (status: ${response.status})`);
  
  // Run the tests
  await runTests();
  
} catch (error) {
  console.log('❌ Development server not accessible');
  console.log('Please make sure to run: pnpm dev');
  console.log('And wait for "ampcode.com server available at http://localhost:7002"');
  process.exit(1);
}

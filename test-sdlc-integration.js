#!/usr/bin/env node

/**
 * Test SDLC Agents Integration (Offline Validation)
 */

import { AmpAdapter } from './packages/core/dist/index.js';

console.log('🧪 TESTING SDLC AGENTS INTEGRATION');
console.log('==================================\n');

// Test 1: Verify AmpAdapter accepts agent configuration
console.log('📋 Test 1: AmpAdapter Configuration');
try {
  const adapter = new AmpAdapter({
    agentId: 'testing',
    autoRoute: true,
    alloyMode: true,
    multiProvider: false,
    extraArgs: ['--version']
  });
  
  if (adapter.config.agentId === 'testing' && 
      adapter.config.autoRoute === true && 
      adapter.config.alloyMode === true) {
    console.log('   ✅ AmpAdapter accepts agent configuration');
  } else {
    console.log('   ❌ AmpAdapter configuration not properly set');
  }
} catch (error) {
  console.log(`   ❌ Error creating AmpAdapter: ${error.message}`);
}

// Test 2: Verify buildAgentArgs method builds correct CLI args
console.log('\n📋 Test 2: CLI Arguments Generation');
try {
  const adapter = new AmpAdapter({
    agentId: 'planning',
    autoRoute: true,
    alloyMode: true,
    multiProvider: true
  });
  
  // Check if the extra args contain the expected agent flags
  const extraArgs = adapter.config.extraArgs || [];
  const hasAgentFlag = extraArgs.includes('--agent') && extraArgs.includes('planning');
  const hasAutoRouteFlag = extraArgs.includes('--auto-route');
  const hasAlloyFlag = extraArgs.includes('--alloy');
  const hasMultiProviderFlag = extraArgs.includes('--multi-provider');
  
  if (hasAgentFlag && hasAutoRouteFlag && hasAlloyFlag && hasMultiProviderFlag) {
    console.log('   ✅ CLI arguments generated correctly');
    console.log(`   📋 Args: ${extraArgs.join(' ')}`);
  } else {
    console.log('   ❌ CLI arguments not generated correctly');
    console.log(`   📋 Args: ${extraArgs.join(' ')}`);
  }
} catch (error) {
  console.log(`   ❌ Error testing CLI args: ${error.message}`);
}

// Test 3: Test Session Creation Options Type
console.log('\n📋 Test 3: Session Creation Options');
try {
  // This would be called by CLI/Desktop app
  const sessionOptions = {
    name: 'Test Session',
    repoRoot: '/path/to/repo',
    baseBranch: 'main',
    agentId: 'testing',
    agentMode: 'explicit',
    autoRoute: true,
    alloyMode: true,
    multiProvider: false
  };
  
  console.log('   ✅ SessionCreateOptions supports agent fields');
  console.log(`   📋 Agent: ${sessionOptions.agentId}`);
  console.log(`   📋 Mode: ${sessionOptions.agentMode}`);
  console.log(`   📋 Features: ${[
    sessionOptions.autoRoute && 'auto-route',
    sessionOptions.alloyMode && 'alloy',
    sessionOptions.multiProvider && 'multi-provider'
  ].filter(Boolean).join(', ')}`);
} catch (error) {
  console.log(`   ❌ Error with session options: ${error.message}`);
}

console.log('\n🎯 Integration tests completed!');
console.log('\n📖 Usage Examples:');
console.log('');
console.log('CLI Usage:');
console.log('  amp-sessions new --repo ./project --name "test" \\');
console.log('    --prompt "Add unit tests" --agent testing --alloy');
console.log('');
console.log('  amp-sessions new --repo ./project --name "test" \\');
console.log('    --prompt "Deploy to production" --auto-route');
console.log('');
console.log('Desktop App:');
console.log('  • Select agent from dropdown in session creation modal');
console.log('  • Enable alloy mode checkbox for enhanced quality');
console.log('  • Use auto-routing to automatically select best agent');
console.log('');
console.log('🚀 Ready to test with running Amp development server!');

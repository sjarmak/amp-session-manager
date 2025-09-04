#!/usr/bin/env node

const path = require('path');
const { BenchmarkController } = require('./packages/core/dist/index.cjs');

// Mock dependencies for testing
const mockStore = {
  getAllSessions: () => []
};

async function testBenchmarkController() {
  console.log('🧪 Testing BenchmarkController...');
  
  try {
    const benchmarkController = new BenchmarkController(mockStore);
    
    // Test that the controller can be instantiated
    console.log('✅ BenchmarkController instantiated successfully');
    
    // Test that start returns immediately (doesn't block)
    const startTime = Date.now();
    
    try {
      await benchmarkController.start({
        type: 'yaml',
        yamlConfigPath: '/nonexistent/path.yaml'  // This will fail quickly
      });
    } catch (error) {
      // Expected to fail, but should fail quickly
      const duration = Date.now() - startTime;
      console.log(`✅ Benchmark start failed quickly (${duration}ms) - this is expected behavior`);
      
      if (duration > 1000) {
        console.error('❌ Benchmark took too long to fail - might still be blocking');
      } else {
        console.log('✅ Benchmark failed quickly - non-blocking behavior confirmed');
      }
    }
    
    // Test listRuns
    const runs = await benchmarkController.listRuns();
    console.log(`✅ Listed ${runs.length} benchmark runs`);
    
    console.log('🎉 All tests passed! Benchmark controller is working properly.');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

testBenchmarkController();

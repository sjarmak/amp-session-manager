// Simple test to verify enhanced metrics functionality

import { FileDiffTracker, JSONLSink, Logger } from './packages/core/dist/index.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function testMetricsFeatures() {
  console.log('Testing enhanced metrics features...\n');
  
  // 1. Test FileDiffTracker
  try {
    const logger = new Logger('test');
    const tracker = new FileDiffTracker(logger);
    
    console.log('✓ FileDiffTracker created successfully');
    
    // Test in this repo (should have recent changes)
    const changes = await tracker.getFileChanges(__dirname);
    console.log(`✓ Found ${changes.length} file changes in current directory`);
    
    if (changes.length > 0) {
      console.log('  Sample file change:');
      const sample = changes[0];
      console.log(`  - File: ${sample.path}`);
      console.log(`  - Operation: ${sample.operation}`);  
      console.log(`  - Lines added: ${sample.linesAdded}`);
      console.log(`  - Lines deleted: ${sample.linesDeleted}`);
    }
    
  } catch (error) {
    console.log('✗ FileDiffTracker test failed:', error.message);
  }
  
  // 2. Test JSONLSink
  try {
    const logger = new Logger('test');
    const testFile = path.join(__dirname, 'test-output.jsonl');
    
    const jsonlSink = new JSONLSink(logger, {
      filePath: testFile,
      autoFlush: true,
      truncateArgs: true,
      maxDiffLines: 100
    });
    
    console.log('\n✓ JSONLSink created successfully');
    
    // Test event handling
    const testEvent = {
      type: 'tool_call',
      sessionId: 'test-session',
      iterationId: 'test-iter',
      timestamp: new Date().toISOString(),
      data: {
        toolName: 'test_tool',
        args: { test: 'data' },
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        durationMs: 100,
        success: true
      }
    };
    
    await jsonlSink.handle(testEvent);
    await jsonlSink.flush();
    await jsonlSink.close();
    
    if (fs.existsSync(testFile)) {
      const content = fs.readFileSync(testFile, 'utf-8');
      console.log('✓ JSONL file created with content:');
      console.log('  ' + content.trim());
      
      // Cleanup
      fs.unlinkSync(testFile);
      console.log('✓ Test file cleaned up');
    } else {
      console.log('✗ JSONL file was not created');
    }
    
  } catch (error) {
    console.log('✗ JSONLSink test failed:', error.message);
  }
  
  console.log('\nMetrics features test completed!');
}

testMetricsFeatures().catch(console.error);

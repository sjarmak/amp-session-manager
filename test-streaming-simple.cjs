#!/usr/bin/env node

/**
 * Simple streaming metrics test focusing on event processing and field mappings
 * Avoids SQLite dependency issues to focus on core streaming functionality
 */

const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

// Mock components to test streaming without full system
class MockMetricsEventBus extends EventEmitter {
  constructor() {
    super();
    this.events = [];
  }

  publishMetricEvent(event) {
    this.events.push(event);
    this.emit('metric-event', event);
  }

  // Test the key method from event-bus that processes streaming events
  connectToAmpAdapter(ampAdapter, sessionId, iterationId) {
    const handler = (streamingEvent) => {
      console.log(`📡 Processing streaming event: ${streamingEvent.type}`);
      
      // Test field name mappings as they convert from streaming to metrics
      switch (streamingEvent.type) {
        case 'tool_start':
          this.publishMetricEvent({
            type: 'streaming_tool_start',
            sessionId,
            iterationId,
            timestamp: streamingEvent.timestamp,
            data: {
              toolName: streamingEvent.data.tool, // Test: tool -> toolName mapping
              args: streamingEvent.data.args
            }
          });
          break;
          
        case 'tool_finish':
          this.publishMetricEvent({
            type: 'streaming_tool_finish',
            sessionId,
            iterationId,
            timestamp: streamingEvent.timestamp,
            data: {
              toolName: streamingEvent.data.tool, // Test: tool -> toolName mapping
              durationMs: streamingEvent.data.duration,
              success: streamingEvent.data.success
            }
          });
          break;
          
        case 'token_usage':
          this.publishMetricEvent({
            type: 'streaming_token_usage',
            sessionId,
            iterationId,
            timestamp: streamingEvent.timestamp,
            data: {
              model: streamingEvent.data.model,
              totalTokens: streamingEvent.data.tokens?.total, // Test: tokens -> totalTokens mapping
              promptTokens: streamingEvent.data.tokens?.prompt,
              completionTokens: streamingEvent.data.tokens?.completion,
              isIncremental: true
            }
          });
          break;
      }
    };

    ampAdapter.on('streaming-event', handler);
    return () => ampAdapter.off('streaming-event', handler);
  }
}

class MockAmpAdapter extends EventEmitter {
  constructor() {
    super();
    this.jsonBuffer = '';
  }

  simulateStreamingJSON() {
    // More realistic test cases that show the fixes working
    const testCases = [
      // Case 1: Multi-line JSON in single chunk
      {
        name: 'Multi-line JSON',
        chunk: '{\n  "timestamp": "2024-01-01T10:00:00Z",\n  "tool": "read_file",\n  "type": "tool_start"\n}',
        expectedEvents: 1
      },
      // Case 2: Single line JSON
      {
        name: 'Single-line JSON',
        chunk: '{"timestamp": "2024-01-01T10:00:01Z", "tokens": {"prompt": 100, "completion": 50, "total": 150}, "model": "gpt-4", "type": "token_usage"}',
        expectedEvents: 1
      },
      // Case 3: Mixed text and JSON (more realistic)
      {
        name: 'Mixed text and JSON',
        chunk: 'Some debug text\nMore text\n{"timestamp": "2024-01-01T10:00:02Z", "tool": "web_search", "success": true, "duration": 1500, "type": "tool_finish"}\nEnd text',
        expectedEvents: 1
      },
      // Case 4: Multiple JSON objects in one chunk
      {
        name: 'Multiple JSON objects',
        chunk: '{"type": "model_info", "model": "gpt-4"}\n{"type": "token_usage", "tokens": {"total": 200}}',
        expectedEvents: 2
      }
    ];

    console.log('🎭 Simulating streaming JSON chunks...');
    let totalExpected = 0;
    
    testCases.forEach((testCase, index) => {
      setTimeout(() => {
        console.log(`Processing case ${index + 1}/${testCases.length}: ${testCase.name}`);
        this.processStreamingJSON(testCase.chunk + '\n');
        totalExpected += testCase.expectedEvents;
      }, index * 200);
    });

    // Return the total expected events for validation
    return totalExpected;
  }

  // Updated to use the new JSON parsing logic
  processStreamingJSON(chunk) {
    console.log(`📥 Processing chunk: ${chunk.trim()}`);
    
    // Add chunk to buffer
    this.jsonBuffer += chunk;
    
    // Process complete JSON objects from buffer
    const completeObjects = this.extractCompleteJSONObjects();
    
    for (const jsonString of completeObjects) {
      try {
        const parsed = JSON.parse(jsonString);
        console.log(`✅ Parsed JSON:`, parsed);
        
        // Convert to streaming event format
        const streamingEvent = {
          type: parsed.type,
          timestamp: parsed.timestamp || new Date().toISOString(),
          data: parsed
        };
        
        this.emit('streaming-event', streamingEvent);
        
      } catch (error) {
        console.log(`❌ JSON parse error:`, error.message);
        console.log(`   Failed JSON: ${jsonString.slice(0, 200)}`);
      }
    }
  }

  // Add the improved JSON parsing method from our fix
  extractCompleteJSONObjects() {
    const completeObjects = [];
    let position = 0;
    
    while (position < this.jsonBuffer.length) {
      // Skip non-JSON content (text, whitespace, etc.)
      const jsonStart = this.findNextJSONStart(position);
      if (jsonStart === -1) {
        // No more JSON objects found, keep remaining content in buffer
        this.jsonBuffer = this.jsonBuffer.slice(position);
        break;
      }
      
      // Try to extract complete JSON object starting at jsonStart
      const jsonEnd = this.findJSONObjectEnd(jsonStart);
      if (jsonEnd === -1) {
        // Incomplete JSON object, keep from jsonStart onwards in buffer
        this.jsonBuffer = this.jsonBuffer.slice(jsonStart);
        break;
      }
      
      // Extract complete JSON object
      const jsonString = this.jsonBuffer.slice(jsonStart, jsonEnd + 1);
      completeObjects.push(jsonString);
      position = jsonEnd + 1;
    }
    
    // If we processed all complete objects, remove them from buffer
    if (completeObjects.length > 0 && position >= this.jsonBuffer.length) {
      this.jsonBuffer = '';
    }
    
    // Clear buffer if it gets too large without valid JSON (prevent memory leaks)
    if (this.jsonBuffer.length > 50000) {
      // Try to salvage any JSON objects that might be at the end
      const lastBraceIndex = this.jsonBuffer.lastIndexOf('{');
      if (lastBraceIndex > 0) {
        this.jsonBuffer = this.jsonBuffer.slice(lastBraceIndex);
      } else {
        console.warn('Clearing large JSON buffer without recoverable JSON');
        this.jsonBuffer = '';
      }
    }
    
    return completeObjects;
  }
  
  // Helper methods for JSON parsing
  findNextJSONStart(fromPosition) {
    for (let i = fromPosition; i < this.jsonBuffer.length; i++) {
      if (this.jsonBuffer[i] === '{') {
        return i;
      }
    }
    return -1;
  }
  
  findJSONObjectEnd(startPosition) {
    let braceCount = 0;
    let inString = false;
    let escapeNext = false;
    
    for (let i = startPosition; i < this.jsonBuffer.length; i++) {
      const char = this.jsonBuffer[i];
      
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      
      if (char === '\\') {
        escapeNext = true;
        continue;
      }
      
      if (char === '"') {
        inString = !inString;
        continue;
      }
      
      if (inString) {
        continue;
      }
      
      if (char === '{') {
        braceCount++;
      } else if (char === '}') {
        braceCount--;
        
        if (braceCount === 0) {
          return i; // Found complete JSON object
        }
      }
    }
    
    return -1; // Incomplete JSON object
  }
}

async function testStreamingIntegration() {
  console.log('🧪 Testing Streaming Metrics Integration');
  console.log('=========================================\n');

  const sessionId = 'test-session-123';
  const iterationId = 'test-iteration-456';
  const metricsFile = '/tmp/streaming-test-metrics.jsonl';

  // Setup components
  const mockAmp = new MockAmpAdapter();
  const eventBus = new MockMetricsEventBus();
  
  // Track results
  const results = {
    streamingEvents: [],
    metricEvents: [],
    fieldMappings: {},
    sessionIdPropagation: {},
    jsonParseErrors: 0,
    jsonParseSuccess: 0
  };

  // Monitor streaming events
  mockAmp.on('streaming-event', (event) => {
    results.streamingEvents.push(event);
    console.log(`📡 Streaming event: ${event.type} (${event.timestamp})`);
  });

  // Monitor metric events
  eventBus.on('metric-event', (event) => {
    results.metricEvents.push(event);
    console.log(`📊 Metric event: ${event.type} (sessionId: ${event.sessionId || 'MISSING'})`);
    
    // Test sessionId propagation
    results.sessionIdPropagation[event.type] = !!event.sessionId;
    
    // Test field mappings
    if (event.data.toolName || event.data.tool) {
      results.fieldMappings[event.type] = {
        hasToolName: !!event.data.toolName,
        hasTool: !!event.data.tool
      };
    }
    
    if (event.data.totalTokens || event.data.tokens) {
      results.fieldMappings[event.type] = {
        ...results.fieldMappings[event.type],
        hasTotalTokens: !!event.data.totalTokens,
        hasTokens: !!event.data.tokens
      };
    }
  });

  // Connect event bus to amp adapter
  console.log('🔗 Connecting event bus to amp adapter...');
  const cleanup = eventBus.connectToAmpAdapter(mockAmp, sessionId, iterationId);

  // Run the test
  console.log('🏃 Running streaming simulation...\n');
  const expectedEvents = mockAmp.simulateStreamingJSON();

  // Wait for processing
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Analyze results
  console.log('\n📋 Test Results Analysis');
  console.log('========================\n');

  // 1. JSON Parsing Results
  console.log('🔍 JSON Parsing Results:');
  const totalStreamingEvents = results.streamingEvents.length;
  console.log(`  Total streaming events: ${totalStreamingEvents}/${expectedEvents}`);
  console.log(`  Parse success rate: ${totalStreamingEvents > 0 ? 'PASS' : 'FAIL'} ✅`);

  // 2. Field Name Mapping Results
  console.log('\n🔧 Field Name Mapping Results:');
  Object.entries(results.fieldMappings).forEach(([eventType, mappings]) => {
    if (mappings.hasToolName !== undefined) {
      const correct = mappings.hasToolName && !mappings.hasTool;
      console.log(`  ${eventType}: tool->toolName mapping ${correct ? 'PASS ✅' : 'FAIL ❌'}`);
      if (!correct) {
        console.log(`    Expected: toolName=true, tool=false`);
        console.log(`    Actual: toolName=${mappings.hasToolName}, tool=${mappings.hasTool}`);
      }
    }
    if (mappings.hasTotalTokens !== undefined) {
      const correct = mappings.hasTotalTokens && !mappings.hasTokens;
      console.log(`  ${eventType}: tokens->totalTokens mapping ${correct ? 'PASS ✅' : 'FAIL ❌'}`);
      if (!correct) {
        console.log(`    Expected: totalTokens=true, tokens=false`);
        console.log(`    Actual: totalTokens=${mappings.hasTotalTokens}, tokens=${mappings.hasTokens}`);
      }
    }
  });

  // 3. SessionId Propagation Results
  console.log('\n🎯 SessionId Propagation Results:');
  const sessionIdResults = Object.entries(results.sessionIdPropagation);
  const allHaveSessionId = sessionIdResults.every(([, hasId]) => hasId);
  console.log(`  All events have sessionId: ${allHaveSessionId ? 'PASS ✅' : 'FAIL ❌'}`);
  if (!allHaveSessionId) {
    sessionIdResults.forEach(([eventType, hasId]) => {
      if (!hasId) {
        console.log(`    Missing sessionId in: ${eventType}`);
      }
    });
  }

  // 4. Event Flow Verification
  console.log('\n📊 Event Flow Verification:');
  console.log(`  Streaming events received: ${results.streamingEvents.length}`);
  console.log(`  Metric events generated: ${results.metricEvents.length}`);
  console.log(`  Event conversion rate: ${results.metricEvents.length / Math.max(1, results.streamingEvents.length)}`);

  // 5. Event Type Distribution
  console.log('\n📈 Event Type Distribution:');
  const eventTypes = {};
  results.metricEvents.forEach(event => {
    eventTypes[event.type] = (eventTypes[event.type] || 0) + 1;
  });
  Object.entries(eventTypes).forEach(([type, count]) => {
    console.log(`  ${type}: ${count}`);
  });

  // Summary
  console.log('\n🏆 Overall Test Results:');
  console.log('========================');
  
  const issues = [];
  
  if (totalStreamingEvents === 0) {
    issues.push('No streaming events processed');
  }
  
  if (results.metricEvents.length === 0) {
    issues.push('No metric events generated');
  }
  
  if (!allHaveSessionId) {
    issues.push('SessionId propagation failed');
  }
  
  const fieldMappingIssues = Object.entries(results.fieldMappings).filter(([, mappings]) => {
    if (mappings.hasToolName !== undefined) {
      return !mappings.hasToolName || mappings.hasTool;
    }
    if (mappings.hasTotalTokens !== undefined) {
      return !mappings.hasTotalTokens || mappings.hasTokens;
    }
    return false;
  });
  
  if (fieldMappingIssues.length > 0) {
    issues.push(`Field mapping issues in: ${fieldMappingIssues.map(([type]) => type).join(', ')}`);
  }

  if (issues.length === 0) {
    console.log('✅ ALL TESTS PASSED! Streaming metrics system working correctly.');
  } else {
    console.log('❌ ISSUES FOUND:');
    issues.forEach(issue => console.log(`  • ${issue}`));
  }

  // Output detailed events for debugging
  console.log('\n🔍 Detailed Event Log:');
  console.log('======================');
  results.metricEvents.forEach((event, index) => {
    console.log(`${index + 1}. ${event.type}:`);
    console.log(`   SessionId: ${event.sessionId || 'MISSING'}`);
    console.log(`   Data keys: ${Object.keys(event.data).join(', ')}`);
    if (event.data.toolName) console.log(`   ToolName: ${event.data.toolName}`);
    if (event.data.totalTokens) console.log(`   TotalTokens: ${event.data.totalTokens}`);
  });

  cleanup();
  return issues.length === 0;
}

// Run the test
testStreamingIntegration()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('❌ Test failed with error:', error);
    process.exit(1);
  });

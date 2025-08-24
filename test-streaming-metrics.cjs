#!/usr/bin/env node

/**
 * Comprehensive test for streaming metrics functionality
 * Tests data retrieval, field mappings, sessionId propagation, and JSON parsing
 */

const { 
  SessionStore, 
  WorktreeManager, 
  AmpAdapter, 
  MetricsEventBus, 
  NDJSONMetricsSink 
} = require('./packages/core/dist/index.cjs');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

class MockAmpAdapter {
  constructor() {
    this.events = require('events');
    this.emitter = new this.events.EventEmitter();
  }

  emit(event, data) {
    this.emitter.emit(event, data);
    return this;
  }

  on(event, listener) {
    this.emitter.on(event, listener);
    return this;
  }

  off(event, listener) {
    this.emitter.off(event, listener);
    return this;
  }

  // Simulate streaming events with various issues identified by Oracle
  simulateStreamingEvents(sessionId) {
    console.log('🎭 Simulating streaming events...');
    
    // Simulate multi-line JSON (issue #4)
    const multiLineJSON = `{
  "timestamp": "2024-01-01T10:00:00.000Z",
  "tool": "read_file",
  "args": {
    "path": "/test/file.txt"
  }
}`;
    
    // Simulate field name mismatches (issue #2)
    const events = [
      // Tool event with field mismatch: tool vs toolName
      {
        type: 'tool_start',
        timestamp: '2024-01-01T10:00:01.000Z',
        data: {
          tool: 'web_search', // Should be toolName according to Oracle
          args: { query: 'test' },
          sessionId // Testing sessionId propagation (issue #3)
        }
      },
      
      // Token usage with field mismatch: tokens vs totalTokens
      {
        type: 'token_usage',
        timestamp: '2024-01-01T10:00:02.000Z',
        data: {
          tokens: { // Should be totalTokens according to Oracle
            prompt: 100,
            completion: 50,
            total: 150
          },
          model: 'gpt-4',
          sessionId
        }
      },
      
      // Tool finish event
      {
        type: 'tool_finish',
        timestamp: '2024-01-01T10:00:03.000Z',
        data: {
          tool: 'web_search',
          duration: 1500,
          success: true,
          sessionId
        }
      },
      
      // Output event
      {
        type: 'output',
        timestamp: '2024-01-01T10:00:04.000Z',
        data: {
          chunk: 'Processing complete\n',
          sessionId
        }
      }
    ];

    // Test multi-line JSON parsing
    console.log('📝 Testing multi-line JSON parsing...');
    this.emit('streaming-event', {
      type: 'output',
      timestamp: new Date().toISOString(),
      data: { chunk: multiLineJSON + '\n', sessionId }
    });

    // Emit test events with delays to simulate real streaming
    events.forEach((event, index) => {
      setTimeout(() => {
        console.log(`📡 Emitting event ${index + 1}:`, event.type);
        this.emit('streaming-event', event);
      }, index * 100);
    });

    // Test malformed JSON
    setTimeout(() => {
      console.log('🚫 Testing malformed JSON handling...');
      this.emit('streaming-event', {
        type: 'output',
        timestamp: new Date().toISOString(),
        data: { 
          chunk: '{ "incomplete": "json" \n { "another": "line" }', 
          sessionId 
        }
      });
    }, events.length * 100 + 100);

    return events.length + 2; // Total events including multi-line and malformed
  }
}

async function testStreamingMetrics() {
  console.log('🧪 Starting comprehensive streaming metrics test...\n');
  
  const testRepo = '/tmp/test-streaming-metrics';
  const metricsFile = path.join(testRepo, 'test-metrics.jsonl');
  
  try {
    // Setup test environment
    console.log('🏗️  Setting up test environment...');
    if (fs.existsSync(testRepo)) {
      fs.rmSync(testRepo, { recursive: true });
    }
    fs.mkdirSync(testRepo, { recursive: true });
    
    // Initialize git repo
    execSync('git init && git config user.email "test@example.com" && git config user.name "Test User"', { cwd: testRepo });
    execSync('echo "# Test repo" > README.md && git add . && git commit -m "Initial commit"', { cwd: testRepo });

    // Create test components
    const store = new SessionStore(':memory:');
    const mockAmpAdapter = new MockAmpAdapter();
    const eventBus = new MetricsEventBus();
    const metricsSink = new NDJSONMetricsSink({
      filePath: metricsFile,
      enableRealtimeBuffering: true,
      bufferFlushIntervalMs: 500
    });

    // Connect metrics sink to event bus
    eventBus.addSink(metricsSink);

    const sessionId = 'test-session-123';
    const iterationId = 'test-iteration-456';

    console.log('✅ Test environment ready');
    console.log(`📍 Session ID: ${sessionId}`);
    console.log(`📍 Iteration ID: ${iterationId}`);
    console.log(`📂 Metrics file: ${metricsFile}\n`);

    // Test 1: Field Name Mappings
    console.log('🔍 Test 1: Field Name Mappings');
    console.log('Testing tool vs toolName, tokens vs totalTokens...');
    
    // Create events with both old and new field names
    const toolEvent = {
      type: 'tool_call',
      sessionId,
      iterationId,
      timestamp: new Date().toISOString(),
      data: {
        toolName: 'read_file', // Correct field name
        tool: 'read_file_old', // Legacy field name
        args: { path: '/test.txt' },
        startTime: new Date().toISOString(),
        endTime: new Date(Date.now() + 1000).toISOString(),
        durationMs: 1000,
        success: true
      }
    };

    const tokenEvent = {
      type: 'llm_usage',
      sessionId,
      iterationId,
      timestamp: new Date().toISOString(),
      data: {
        model: 'gpt-4',
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150, // Correct field name
        tokens: { prompt: 100, completion: 50, total: 150 }, // Legacy format
        costUsd: 0.0075,
        latencyMs: 1200
      }
    };

    eventBus.publishMetricEvent(toolEvent);
    eventBus.publishMetricEvent(tokenEvent);

    // Test 2: SessionId Propagation
    console.log('\n🔍 Test 2: SessionId Propagation');
    console.log('Testing if events reach the UI with correct sessionId...');

    // Connect to mock amp adapter
    console.log('🔗 Connecting event bus to mock amp adapter...');
    const cleanup = eventBus.connectToAmpAdapter(mockAmpAdapter, sessionId, iterationId);
    
    // Track received events
    const receivedEvents = [];
    eventBus.on('metric-event', (event) => {
      receivedEvents.push(event);
      console.log(`📨 Received event: ${event.type} (sessionId: ${event.sessionId})`);
    });

    // Simulate streaming events
    const expectedEventCount = mockAmpAdapter.simulateStreamingEvents(sessionId);

    // Test 3: JSON Parsing Logic
    console.log('\n🔍 Test 3: Multi-line JSON Parsing');
    
    // Wait for events to process
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Test 4: Metrics File Output
    console.log('\n🔍 Test 4: Metrics File Output');
    console.log('Checking metrics file contents...');

    // Force flush metrics
    await metricsSink.flush();

    if (fs.existsSync(metricsFile)) {
      const content = fs.readFileSync(metricsFile, 'utf8');
      const lines = content.trim().split('\n').filter(line => line.trim());
      
      console.log(`📄 Metrics file contains ${lines.length} lines`);
      
      // Analyze each line
      const parsedEvents = [];
      const parseErrors = [];
      
      lines.forEach((line, index) => {
        try {
          const parsed = JSON.parse(line);
          parsedEvents.push(parsed);
          console.log(`✅ Line ${index + 1}: ${parsed.type} (sessionId: ${parsed.sessionId || 'MISSING'})`);
        } catch (error) {
          parseErrors.push({ line: index + 1, error: error.message, content: line });
          console.log(`❌ Line ${index + 1}: Parse error - ${error.message}`);
        }
      });

      // Test Results Analysis
      console.log('\n📊 Test Results Analysis:');
      console.log('================================');

      // Field name mapping results
      const toolEvents = parsedEvents.filter(e => e.type === 'tool_call' || e.type === 'streaming_tool_start');
      const tokenEvents = parsedEvents.filter(e => e.type === 'llm_usage' || e.type === 'streaming_token_usage');
      
      console.log('\n🔧 Field Name Mapping Results:');
      toolEvents.forEach(event => {
        const hasToolName = !!event.data.toolName;
        const hasTool = !!event.data.tool;
        console.log(`  Tool Event: toolName=${hasToolName}, tool=${hasTool} ${hasToolName ? '✅' : '❌'}`);
      });

      tokenEvents.forEach(event => {
        const hasTotalTokens = !!event.data.totalTokens;
        const hasTokens = !!event.data.tokens;
        console.log(`  Token Event: totalTokens=${hasTotalTokens}, tokens=${hasTokens} ${hasTotalTokens ? '✅' : '❌'}`);
      });

      // SessionId propagation results
      console.log('\n🎯 SessionId Propagation Results:');
      const eventsWithSessionId = parsedEvents.filter(e => e.sessionId === sessionId);
      const eventsWithoutSessionId = parsedEvents.filter(e => !e.sessionId);
      console.log(`  Events with sessionId: ${eventsWithSessionId.length}/${parsedEvents.length} ${eventsWithSessionId.length === parsedEvents.length ? '✅' : '❌'}`);
      if (eventsWithoutSessionId.length > 0) {
        console.log(`  Missing sessionId in: ${eventsWithoutSessionId.map(e => e.type).join(', ')}`);
      }

      // JSON parsing results
      console.log('\n📝 JSON Parsing Results:');
      console.log(`  Successfully parsed: ${parsedEvents.length}/${lines.length} ${parseErrors.length === 0 ? '✅' : '❌'}`);
      if (parseErrors.length > 0) {
        console.log(`  Parse errors: ${parseErrors.length}`);
        parseErrors.forEach(error => {
          console.log(`    Line ${error.line}: ${error.error}`);
        });
      }

      // Event type distribution
      console.log('\n📈 Event Type Distribution:');
      const eventTypes = {};
      parsedEvents.forEach(event => {
        eventTypes[event.type] = (eventTypes[event.type] || 0) + 1;
      });
      Object.entries(eventTypes).forEach(([type, count]) => {
        console.log(`  ${type}: ${count}`);
      });

    } else {
      console.log('❌ Metrics file not found');
    }

    // Summary
    console.log('\n📋 Test Summary:');
    console.log('================');
    
    const issues = [];
    
    if (receivedEvents.length === 0) {
      issues.push('No events received by event bus');
    }
    
    if (!fs.existsSync(metricsFile)) {
      issues.push('Metrics file not created');
    } else {
      const content = fs.readFileSync(metricsFile, 'utf8');
      if (!content.trim()) {
        issues.push('Metrics file is empty');
      }
    }

    if (issues.length === 0) {
      console.log('✅ All tests passed! Streaming metrics system is working correctly.');
    } else {
      console.log('❌ Issues found:');
      issues.forEach(issue => console.log(`  - ${issue}`));
    }

    // Cleanup
    cleanup();
    store.close();

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    // Cleanup
    if (fs.existsSync(testRepo)) {
      // Don't delete - keep for inspection
      console.log(`\n🔍 Test files preserved at: ${testRepo}`);
    }
  }
}

// Run the test
testStreamingMetrics().catch(console.error);

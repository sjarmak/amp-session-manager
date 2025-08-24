#!/usr/bin/env node

/**
 * Debug script to test if metrics events are being published and stored correctly
 */

import { SessionStore, SQLiteMetricsSink, eventBus, Logger } from './packages/core/dist/index.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { tmpdir } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testMetricsFlow() {
  console.log('🔍 Testing metrics flow...');
  
  // Create a temporary database for testing
  const testDbPath = join(tmpdir(), `test-metrics-${Date.now()}.db`);
  console.log(`📁 Using test database: ${testDbPath}`);
  
  // Initialize components
  const logger = new Logger('TEST');
  const sink = new SQLiteMetricsSink(testDbPath, logger);
  const store = new SessionStore(testDbPath);
  
  // Create a test session
  const session = await store.createSession({
    name: 'test-metrics',
    ampPrompt: 'test prompt',
    repoRoot: '/tmp/test',
    baseBranch: 'main'
  });
  console.log(`📝 Created test session: ${session.id}`);
  
  // Test publishUserMessage
  console.log('🚀 Testing publishUserMessage...');
  eventBus.publishUserMessage(session.id, 'Hello, this is a test user message');
  
  // Wait a bit for async processing
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Test publishFileEdit  
  console.log('🚀 Testing publishFileEdit...');
  eventBus.publishFileEdit(session.id, '/tmp/test.txt', 10, 5);
  
  // Wait a bit for async processing
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Check what was stored in the database
  console.log('📊 Checking stored events...');
  
  try {
    // Query the database directly to see what events were stored
    const db = sink.db; // Access the internal database
    const events = db.prepare('SELECT * FROM metrics_events WHERE session_id = ?').all(session.id);
    
    console.log(`Found ${events.length} events:`);
    events.forEach((event, i) => {
      console.log(`  ${i+1}. ${event.type} - ${JSON.stringify(JSON.parse(event.data))}`);
    });
    
    // Check user message events specifically
    const userMessageEvents = events.filter(e => e.type === 'user_message');
    const fileEditEvents = events.filter(e => e.type === 'file_edit');
    
    console.log(`\n✅ User message events: ${userMessageEvents.length}`);
    console.log(`✅ File edit events: ${fileEditEvents.length}`);
    
    if (userMessageEvents.length === 0) {
      console.log('❌ No user message events found! Check publishUserMessage implementation');
    }
    
    if (fileEditEvents.length === 0) {
      console.log('❌ No file edit events found! Check publishFileEdit implementation');
    }
    
    if (fileEditEvents.length > 0) {
      const fileEditData = JSON.parse(fileEditEvents[0].data);
      console.log(`📈 File edit data:`, fileEditData);
    }
    
  } catch (error) {
    console.error('❌ Error querying database:', error);
  }
  
  // Cleanup
  store.close();
  console.log('🧹 Test completed');
}

testMetricsFlow().catch(console.error);

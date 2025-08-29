#!/usr/bin/env node

import Database from 'better-sqlite3';
import { join } from 'path';
import { homedir } from 'os';

const dbPath = join(homedir(), '.amp-session-manager', 'sessions.db');

console.log(`🔍 Checking database schema at: ${dbPath}`);

try {
  const db = new Database(dbPath);
  
  // Check if the database exists and has tables
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
  
  console.log(`📋 Found ${tables.length} tables:`);
  tables.forEach(table => {
    console.log(`  - ${table.name}`);
  });
  
  // Check specifically for the metric_user_messages table
  const hasUserMessagesTable = tables.some(t => t.name === 'metric_user_messages');
  console.log(`\n✅ Has metric_user_messages table: ${hasUserMessagesTable}`);
  
  if (hasUserMessagesTable) {
    // Check the structure of the user messages table
    const columns = db.prepare("PRAGMA table_info(metric_user_messages)").all();
    console.log(`📐 metric_user_messages columns:`, columns.map(c => `${c.name} (${c.type})`));
  }
  
  // Check if there are any sessions
  const sessions = db.prepare("SELECT id, name, status FROM sessions ORDER BY created_at DESC LIMIT 3").all();
  console.log(`\n📝 Recent sessions (${sessions.length}):`);
  sessions.forEach(session => {
    console.log(`  - ${session.name} (${session.id}) - ${session.status}`);
  });
  
  db.close();
} catch (error) {
  console.error('❌ Error:', error.message);
}

#!/usr/bin/env node

// Debug script to check where line change data is actually stored
const fs = require('fs');
const path = require('path');

console.log('=== CHECKING METRICS DATA STORAGE ===\n');

// Check if metrics files exist
const homeDir = require('os').homedir();
const metricsDir = path.join(homeDir, '.amp-session-manager');

console.log('Checking metrics directory:', metricsDir);

if (!fs.existsSync(metricsDir)) {
  console.log('❌ Metrics directory does not exist');
  process.exit(1);
}

const files = fs.readdirSync(metricsDir);
console.log('Files in metrics directory:', files);

// Check for NDJSON files
const ndjsonFile = path.join(metricsDir, 'metrics.ndjson');
if (fs.existsSync(ndjsonFile)) {
  console.log('\n=== NDJSON METRICS FILE ===');
  const content = fs.readFileSync(ndjsonFile, 'utf-8');
  const lines = content.trim().split('\n').filter(line => line.trim());
  
  console.log(`Found ${lines.length} metric events`);
  
  // Look for file_edit events
  const fileEditEvents = lines
    .map(line => {
      try {
        return JSON.parse(line);
      } catch (e) {
        return null;
      }
    })
    .filter(event => event && event.type === 'file_edit');
  
  console.log(`\nFound ${fileEditEvents.length} file_edit events:`);
  fileEditEvents.forEach((event, i) => {
    console.log(`  ${i + 1}. ${event.data.path}: +${event.data.linesAdded}/-${event.data.linesDeleted} (${event.data.operation})`);
  });
  
  // Look for git_operation events
  const gitOpEvents = lines
    .map(line => {
      try {
        return JSON.parse(line);
      } catch (e) {
        return null;
      }
    })
    .filter(event => event && event.type === 'git_operation');
    
  console.log(`\nFound ${gitOpEvents.length} git_operation events:`);
  gitOpEvents.forEach((event, i) => {
    console.log(`  ${i + 1}. ${event.data.operation}: files=${event.data.filesChanged}, +${event.data.insertions}/-${event.data.deletions}`);
  });
  
  // Look for iteration events
  const iterationEvents = lines
    .map(line => {
      try {
        return JSON.parse(line);
      } catch (e) {
        return null;
      }
    })
    .filter(event => event && (event.type === 'iteration_start' || event.type === 'iteration_end'));
    
  console.log(`\nFound ${iterationEvents.length} iteration events:`);
  iterationEvents.forEach((event, i) => {
    if (event.type === 'iteration_end') {
      console.log(`  ${i + 1}. iteration_end: ${event.iterationId}`);
    }
  });
  
} else {
  console.log('❌ No NDJSON metrics file found');
}

// Look for other potential metrics files in the desktop app
const desktopMetricsFile = path.join(process.cwd(), 'apps/desktop/metrics-events.ndjson');
if (fs.existsSync(desktopMetricsFile)) {
  console.log('\n=== DESKTOP METRICS FILE ===');
  const content = fs.readFileSync(desktopMetricsFile, 'utf-8');
  const lines = content.trim().split('\n').filter(line => line.trim());
  console.log(`Found ${lines.length} metric events in desktop app`);
  
  // Count different event types
  const eventTypes = {};
  lines.forEach(line => {
    try {
      const event = JSON.parse(line);
      eventTypes[event.type] = (eventTypes[event.type] || 0) + 1;
    } catch (e) {
      // ignore invalid JSON
    }
  });
  
  console.log('Event type breakdown:', eventTypes);
} else {
  console.log('❌ No desktop metrics file found');
}

// Check for any SQLite databases that might contain metrics
const possibleDbFiles = ['metrics.db', 'sessions.db', 'store.db'];
possibleDbFiles.forEach(dbFile => {
  const dbPath = path.join(metricsDir, dbFile);
  if (fs.existsSync(dbPath)) {
    console.log(`\n=== ${dbFile.toUpperCase()} ===`);
    const stats = fs.statSync(dbPath);
    console.log(`File size: ${stats.size} bytes`);
    
    if (stats.size === 0) {
      console.log('Database is empty');
    } else {
      console.log('Database contains data (cannot inspect without better-sqlite3)');
    }
  }
});

console.log('\n=== SUMMARY ===');
console.log('To properly debug metrics storage, you need to:');
console.log('1. Run a session with some file changes');
console.log('2. Check both NDJSON files and SQLite databases');
console.log('3. Verify that file_edit AND git_operation events are both being created');
console.log('4. Make sure the metrics API is aggregating from the correct tables');

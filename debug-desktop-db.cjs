#!/usr/bin/env node

// Debug script to check the desktop app database
const path = require('path');
const os = require('os');

// Construct the correct desktop app database path
const desktopDbPath = path.join(os.homedir(), 'Library', 'Application Support', 'ampsm', 'sessions.sqlite');

console.log('=== DESKTOP APP DATABASE DEBUG ===\n');
console.log('Database path:', desktopDbPath);

const fs = require('fs');
if (!fs.existsSync(desktopDbPath)) {
  console.log('❌ Desktop app database does not exist');
  process.exit(1);
}

const stats = fs.statSync(desktopDbPath);
console.log(`Database size: ${stats.size} bytes`);

try {
  // Use sqlite3 command to check tables and data
  const { execSync } = require('child_process');
  
  console.log('\n=== TABLES IN DATABASE ===');
  try {
    const tables = execSync(`sqlite3 "${desktopDbPath}" ".tables"`, { encoding: 'utf-8' });
    console.log(tables);
  } catch (e) {
    console.log('Error getting tables:', e.message);
  }
  
  // Check if metrics tables exist
  console.log('\n=== METRICS TABLES ===');
  try {
    const metricTables = execSync(`sqlite3 "${desktopDbPath}" "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'metric_%'"`, { encoding: 'utf-8' });
    console.log('Metrics tables:');
    console.log(metricTables || '(none found)');
  } catch (e) {
    console.log('Error getting metrics tables:', e.message);
  }
  
  // Check recent sessions
  console.log('\n=== RECENT SESSIONS ===');
  try {
    const sessions = execSync(`sqlite3 "${desktopDbPath}" "SELECT id, name, created_at FROM sessions ORDER BY created_at DESC LIMIT 5"`, { encoding: 'utf-8' });
    console.log('Recent sessions:');
    console.log(sessions || '(none found)');
  } catch (e) {
    console.log('Error getting sessions:', e.message);
  }
  
  // Check if metric_iterations exists and has data
  console.log('\n=== METRIC ITERATIONS ===');
  try {
    const iterations = execSync(`sqlite3 "${desktopDbPath}" "SELECT session_id, iteration_number, files_changed, loc_added, loc_deleted FROM metric_iterations ORDER BY started_at DESC LIMIT 5"`, { encoding: 'utf-8' });
    console.log('Recent metric iterations:');
    console.log(iterations || '(none found)');
  } catch (e) {
    console.log('Error getting metric iterations:', e.message);
  }
  
  // Check git operations
  console.log('\n=== GIT OPERATIONS ===');
  try {
    const gitOps = execSync(`sqlite3 "${desktopDbPath}" "SELECT operation, files_changed, insertions, deletions FROM metric_git_operations ORDER BY timestamp DESC LIMIT 5"`, { encoding: 'utf-8' });
    console.log('Recent git operations:');
    console.log(gitOps || '(none found)');
  } catch (e) {
    console.log('Error getting git operations:', e.message);
  }
  
  // Check file edits
  console.log('\n=== FILE EDITS ==='); 
  try {
    const fileEdits = execSync(`sqlite3 "${desktopDbPath}" "SELECT file_path, operation_type, lines_added, lines_deleted FROM metric_file_edits ORDER BY timestamp DESC LIMIT 5"`, { encoding: 'utf-8' });
    console.log('Recent file edits:');
    console.log(fileEdits || '(none found)');
  } catch (e) {
    console.log('Error getting file edits:', e.message);
  }

} catch (error) {
  console.log('Error accessing database:', error.message);
}

console.log('\n=== NEXT STEPS ===');
console.log('If metrics tables exist but have no data:');
console.log('- The sinks might not be configured correctly');
console.log('- Events might not be getting published');
console.log('- There might be a timing issue during iteration end');
console.log('\nIf metrics tables don\'t exist:');
console.log('- The schema initialization might be failing');
console.log('- Check SQLiteMetricsSink.initializeSchema()');

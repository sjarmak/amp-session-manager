#!/usr/bin/env node

// Live debug script to monitor metrics as they're created
// This simulates what happens when a file is created during a session

const fs = require('fs');
const path = require('path');

console.log('=== SIMULATING METRICS FLOW FOR FILE CREATION ===\n');

// Simulate the file_edit event data that would be created when goodbye.py is created
const sessionId = 'test-session-' + Date.now();
const iterationId = 'test-iteration-' + Date.now();

const fileEditEvent = {
  type: 'file_edit',
  sessionId,
  iterationId,
  timestamp: new Date().toISOString(),
  data: {
    path: 'goodbye.py',
    linesAdded: 2,
    linesDeleted: 0,
    operation: 'create',
    diff: '+print("Hello, World!")\n+print("Goodbye!")'
  }
};

const gitOperationEvent = {
  type: 'git_operation',
  sessionId,
  iterationId,
  timestamp: new Date().toISOString(),
  data: {
    operation: 'commit',
    shaBefore: 'abc123',
    shaAfter: 'def456', 
    filesChanged: 1,
    insertions: 2,
    deletions: 0,
    conflicted: false,
    durationMs: 45
  }
};

console.log('Expected file_edit event:');
console.log(JSON.stringify(fileEditEvent, null, 2));

console.log('\nExpected git_operation event:');
console.log(JSON.stringify(gitOperationEvent, null, 2));

// Now let's check the database calculation logic
console.log('\n=== EXPECTED DATABASE FLOW ===');

console.log('1. File edit event stored in metric_file_edits table:');
console.log(`   INSERT INTO metric_file_edits (iteration_id, file_path, operation_type, lines_added, lines_deleted)`);
console.log(`   VALUES ('${iterationId}', 'goodbye.py', 'create', 2, 0)`);

console.log('\n2. Git operation stored in metric_git_operations table:');
console.log(`   INSERT INTO metric_git_operations (iteration_id, operation, files_changed, insertions, deletions)`);
console.log(`   VALUES ('${iterationId}', 'commit', 1, 2, 0)`);

console.log('\n3. When iteration ends, getGitStats() aggregates from metric_git_operations:');
console.log(`   SELECT SUM(files_changed), SUM(insertions), SUM(deletions) FROM metric_git_operations WHERE iteration_id = '${iterationId}'`);
console.log(`   Result: files_changed=1, insertions=2, deletions=0`);

console.log('\n4. These values are stored in metric_iterations table:');
console.log(`   UPDATE metric_iterations SET files_changed=1, loc_added=2, loc_deleted=0 WHERE id='${iterationId}'`);

console.log('\n5. Session summary aggregates from metric_iterations:');
console.log(`   SELECT SUM(loc_added), SUM(loc_deleted) FROM metric_iterations WHERE session_id='${sessionId}'`);
console.log(`   Should result in: total_loc_added=2, total_loc_deleted=0`);

console.log('\n=== POTENTIAL ISSUES TO CHECK ===');
console.log('1. Are git_operation events being created at all?');
console.log('2. Is getGitStats() finding the git operations?');
console.log('3. Is the iteration UPDATE statement running?');
console.log('4. Is the session summary aggregation correct?');
console.log('5. Are there timing issues (git operations not committed before aggregation)?');

console.log('\n=== DEBUGGING STEPS ===');
console.log('1. Add debug logging to GitInstrumentation.commit()');
console.log('2. Add debug logging to SQLiteMetricsSink.getGitStats()');
console.log('3. Add debug logging to SQLiteMetricsSink.updateIterationStmt.run()');
console.log('4. Check timing between git operations and iteration end');
console.log('5. Verify SQLite database actually contains the expected data');

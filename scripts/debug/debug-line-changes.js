/**
 * Debug script to investigate line change calculation issues
 */
import path from 'path';
import Database from 'better-sqlite3';
import { execSync } from 'child_process';
import fs from 'fs';

// Find most recent session
const dbPath = path.join(process.env.HOME, '.amp-session-manager', 'store.db');
const db = new Database(dbPath);

console.log('=== DEBUGGING LINE CHANGES CALCULATION ===\n');

// Get the most recent session
const recentSession = db.prepare(`
  SELECT id, name, repoRoot, worktreePath 
  FROM sessions 
  ORDER BY created_at DESC 
  LIMIT 1
`).get();

if (!recentSession) {
  console.log('No sessions found');
  process.exit(1);
}

console.log('Most recent session:', {
  id: recentSession.id,
  name: recentSession.name,
  worktreePath: recentSession.worktreePath
});

// Check iterations for this session
const iterations = db.prepare(`
  SELECT * FROM iterations 
  WHERE sessionId = ? 
  ORDER BY created_at ASC
`).all(recentSession.id);

console.log(`\nFound ${iterations.length} iterations:`);
iterations.forEach((iter, index) => {
  console.log(`${index + 1}. ${iter.id} - Changed files: ${iter.changedFiles}`);
});

// Check metrics database for this session if it exists
const metricsDbPath = path.join(process.env.HOME, '.amp-session-manager', 'metrics.db');
let metricsDb;
try {
  metricsDb = new Database(metricsDbPath);
  console.log('\n=== METRICS DATABASE ===');
  
  // Check metric_iterations table
  const metricIterations = metricsDb.prepare(`
    SELECT id, iteration_number, files_changed, loc_added, loc_deleted, git_sha_start, git_sha_end
    FROM metric_iterations 
    WHERE session_id = ?
    ORDER BY iteration_number
  `).all(recentSession.id);
  
  console.log(`\nMetric iterations (${metricIterations.length}):`);
  metricIterations.forEach(iter => {
    console.log(`  Iteration ${iter.iteration_number}: files=${iter.files_changed}, +${iter.loc_added}/-${iter.loc_deleted}`);
    console.log(`    SHA: ${iter.git_sha_start} -> ${iter.git_sha_end}`);
  });
  
  // Check git operations
  const gitOps = metricsDb.prepare(`
    SELECT go.*, mi.iteration_number
    FROM metric_git_operations go
    JOIN metric_iterations mi ON go.iteration_id = mi.id
    WHERE mi.session_id = ?
    ORDER BY mi.iteration_number, go.timestamp
  `).all(recentSession.id);
  
  console.log(`\nGit operations (${gitOps.length}):`);
  gitOps.forEach(op => {
    console.log(`  Iter ${op.iteration_number}: ${op.operation} - files=${op.files_changed}, +${op.insertions}/-${op.deletions}`);
  });
  
  // Check file edits
  const fileEdits = metricsDb.prepare(`
    SELECT fe.*, mi.iteration_number
    FROM metric_file_edits fe
    JOIN metric_iterations mi ON fe.iteration_id = mi.id
    WHERE mi.session_id = ?
    ORDER BY mi.iteration_number, fe.timestamp
  `).all(recentSession.id);
  
  console.log(`\nFile edits (${fileEdits.length}):`);
  fileEdits.forEach(edit => {
    console.log(`  Iter ${edit.iteration_number}: ${edit.file_path} (${edit.operation_type}) +${edit.lines_added}/-${edit.lines_deleted}`);
  });

} catch (error) {
  console.log('\nMetrics database not found or error:', error.message);
}

// Test git diff on the worktree if it exists
if (recentSession.worktreePath) {
  
  console.log('\n=== TESTING GIT DIFF IN WORKTREE ===');
  
  if (fs.existsSync(recentSession.worktreePath)) {
    console.log(`Worktree exists at: ${recentSession.worktreePath}`);
    
    try {
      // Check git status
      const status = execSync('git status --porcelain', { 
        cwd: recentSession.worktreePath, 
        encoding: 'utf-8' 
      });
      console.log('\nGit status:');
      console.log(status || '(no changes)');
      
      // Check git diff --numstat
      const numstat = execSync('git diff --numstat', { 
        cwd: recentSession.worktreePath, 
        encoding: 'utf-8' 
      });
      console.log('\nGit diff --numstat:');
      console.log(numstat || '(no diff output)');
      
      // Check git diff --numstat HEAD~1 if we have commits
      try {
        const numstatFromPrev = execSync('git diff --numstat HEAD~1', { 
          cwd: recentSession.worktreePath, 
          encoding: 'utf-8' 
        });
        console.log('\nGit diff --numstat HEAD~1:');
        console.log(numstatFromPrev || '(no diff output)');
      } catch (e) {
        console.log('\nCannot diff from HEAD~1 (probably first commit)');
      }
      
      // Show recent commits
      try {
        const log = execSync('git log --oneline -5', { 
          cwd: recentSession.worktreePath, 
          encoding: 'utf-8' 
        });
        console.log('\nRecent commits:');
        console.log(log);
      } catch (e) {
        console.log('\nNo commits in worktree');
      }
      
    } catch (error) {
      console.log('Error running git commands:', error.message);
    }
  } else {
    console.log(`Worktree does not exist at: ${recentSession.worktreePath}`);
  }
}

db.close();
if (metricsDb) metricsDb.close();

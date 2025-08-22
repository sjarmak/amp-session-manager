import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AmpLogParser } from './amp-log-parser.js';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

describe('Session Isolation with Custom Log Files', () => {
  const tempDir = '/tmp/amp-session-test';
  const session1LogPath = join(tempDir, 'session1.log');
  const session2LogPath = join(tempDir, 'session2.log');

  const session1Logs = `{"level":"info","message":"Starting Amp CLI.","timestamp":"2025-08-21T10:00:00.000Z"}
{"level":"info","message":"Tool web_search - checking permissions","timestamp":"2025-08-21T10:00:01.000Z"}
{"level":"info","message":"Tool web_search permitted - action: allow","timestamp":"2025-08-21T10:00:02.000Z"}
{"level":"info","message":"Tool Read - checking permissions","timestamp":"2025-08-21T10:00:03.000Z"}
{"level":"info","message":"Tool Read permitted - action: allow","timestamp":"2025-08-21T10:00:04.000Z"}`;

  const session2Logs = `{"level":"info","message":"Starting Amp CLI.","timestamp":"2025-08-21T10:00:10.000Z"}
{"level":"info","message":"Tool list_directory - checking permissions","timestamp":"2025-08-21T10:00:11.000Z"}
{"level":"info","message":"Tool list_directory permitted - action: allow","timestamp":"2025-08-21T10:00:12.000Z"}
{"level":"info","message":"Tool todo_write - checking permissions","timestamp":"2025-08-21T10:00:13.000Z"}
{"level":"info","message":"Tool todo_write permitted - action: allow","timestamp":"2025-08-21T10:00:14.000Z"}`;

  beforeEach(() => {
    // Create temp directory and session log files
    mkdirSync(tempDir, { recursive: true });
    writeFileSync(session1LogPath, session1Logs);
    writeFileSync(session2LogPath, session2Logs);
  });

  afterEach(() => {
    // Clean up temp directory
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should isolate tool usage per session using custom log files', () => {
    // Extract metrics from session 1
    const session1StartTime = '2025-08-21T10:00:00.500Z';
    const session1Metrics = AmpLogParser.extractSessionMetrics(session1LogPath, session1StartTime);
    
    console.log('Session 1 metrics (should only see web_search, Read):');
    console.log('Tools found:', session1Metrics.toolUsages.map(t => t.toolName));
    
    expect(session1Metrics.toolUsages).toHaveLength(2);
    expect(session1Metrics.toolUsages.map(t => t.toolName)).toEqual([
      'web_search', 'Read'
    ]);

    // Extract metrics from session 2
    const session2StartTime = '2025-08-21T10:00:10.500Z';
    const session2Metrics = AmpLogParser.extractSessionMetrics(session2LogPath, session2StartTime);
    
    console.log('Session 2 metrics (should only see list_directory, todo_write):');
    console.log('Tools found:', session2Metrics.toolUsages.map(t => t.toolName));
    
    expect(session2Metrics.toolUsages).toHaveLength(2);
    expect(session2Metrics.toolUsages.map(t => t.toolName)).toEqual([
      'list_directory', 'todo_write'
    ]);
  });

  it('should handle non-existent session log files gracefully', () => {
    const nonExistentLogPath = join(tempDir, 'nonexistent.log');
    const metrics = AmpLogParser.extractSessionMetrics(nonExistentLogPath, '2025-08-21T10:00:00.000Z');
    
    expect(metrics.toolUsages).toHaveLength(0);
    expect(metrics.errors).toHaveLength(0);
    expect(metrics.duration).toBe(0);
  });

  it('should filter by timestamp within session logs', () => {
    // Use a timestamp after web_search but before Read in session 1
    const laterStartTime = '2025-08-21T10:00:02.500Z';
    const metrics = AmpLogParser.extractSessionMetrics(session1LogPath, laterStartTime);
    
    console.log('Session 1 with later start time (should only see Read):');
    console.log('Tools found:', metrics.toolUsages.map(t => t.toolName));
    
    expect(metrics.toolUsages).toHaveLength(1);
    expect(metrics.toolUsages[0].toolName).toBe('Read');
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AmpLogParser } from './amp-log-parser.js';
import { readFileSync } from 'fs';

// Mock fs module
vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  statSync: vi.fn(() => ({ mtime: new Date() })),
}));

vi.mock('os', () => ({
  homedir: vi.fn(() => '/mock/home'),
}));

describe('Session Isolation Problem', () => {
  // Simulate CLI logs from two concurrent sessions
  const concurrentSessionsLogs = `{"level":"info","message":"Starting Amp CLI.","timestamp":"2025-08-21T10:00:00.000Z"}
{"level":"info","message":"Tool web_search - checking permissions","timestamp":"2025-08-21T10:00:01.000Z"}
{"level":"info","message":"Tool web_search permitted - action: allow","timestamp":"2025-08-21T10:00:02.000Z"}
{"level":"info","message":"Starting Amp CLI.","timestamp":"2025-08-21T10:00:05.000Z"}
{"level":"info","message":"Tool list_directory - checking permissions","timestamp":"2025-08-21T10:00:06.000Z"}
{"level":"info","message":"Tool list_directory permitted - action: allow","timestamp":"2025-08-21T10:00:07.000Z"}
{"level":"info","message":"Tool Grep - checking permissions","timestamp":"2025-08-21T10:00:08.000Z"}
{"level":"info","message":"Tool Grep permitted - action: allow","timestamp":"2025-08-21T10:00:09.000Z"}
{"level":"info","message":"Tool Read - checking permissions","timestamp":"2025-08-21T10:00:10.000Z"}
{"level":"info","message":"Tool Read permitted - action: allow","timestamp":"2025-08-21T10:00:11.000Z"}`;

  beforeEach(() => {
    vi.clearAllMocks();
    (readFileSync as any).mockReturnValue(concurrentSessionsLogs);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('demonstrates the session isolation problem', () => {
    // Session 1 started at 10:00:00, Session 2 started at 10:00:05
    // Session 1 should only see web_search, but current implementation will see everything
    
    const session1StartTime = '2025-08-21T10:00:00.500Z'; // After session 1 started
    const session1Metrics = AmpLogParser.extractIterationMetrics(session1StartTime);
    
    console.log('Session 1 metrics (should only see web_search):');
    console.log('Tools found:', session1Metrics.toolUsages.map(t => t.toolName));
    
    // PROBLEM: This will show ALL tools from both sessions
    expect(session1Metrics.toolUsages.length).toBe(4); // This is the problem!
    
    // Session 2 should only see list_directory, Grep, Read
    const session2StartTime = '2025-08-21T10:00:05.500Z'; // After session 2 started  
    const session2Metrics = AmpLogParser.extractIterationMetrics(session2StartTime);
    
    console.log('Session 2 metrics (should only see list_directory, Grep, Read):');
    console.log('Tools found:', session2Metrics.toolUsages.map(t => t.toolName));
    
    // This correctly filters by time, but doesn't know which session the tools belong to
    expect(session2Metrics.toolUsages.length).toBe(3);
    expect(session2Metrics.toolUsages.map(t => t.toolName)).toEqual([
      'list_directory', 'Grep', 'Read'
    ]);
  });

  it('shows the limitation of timestamp-only filtering', () => {
    // If two sessions run concurrently and both start iteration at similar times,
    // they will see each other's tool usage
    
    const concurrentStartTime = '2025-08-21T10:00:03.000Z'; // Between the two sessions
    const metrics = AmpLogParser.extractIterationMetrics(concurrentStartTime);
    
    console.log('Concurrent session problem - tools from BOTH sessions:');
    console.log('Tools found:', metrics.toolUsages.map(t => t.toolName));
    
    // This captures tools from BOTH sessions, which is incorrect
    expect(metrics.toolUsages.length).toBe(3); // list_directory, Grep, Read
    
    // The web_search from session 1 is excluded by timestamp,
    // but if sessions overlap more, this would be a bigger problem
  });
});

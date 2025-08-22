import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AmpLogParser } from './amp-log-parser';
import { readFileSync, statSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// Mock fs module
vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  statSync: vi.fn(),
}));

vi.mock('os', () => ({
  homedir: vi.fn(() => '/mock/home'),
}));

describe('AmpLogParser', () => {
  const mockLogData = `1: {"level":"info","message":"Starting Amp CLI.","timestamp":"2025-08-21T10:00:00.000Z"}
2: {"level":"info","message":"Tool Grep - checking permissions","timestamp":"2025-08-21T10:00:01.000Z"}
3: {"level":"info","message":"Tool Grep permitted - action: allow","timestamp":"2025-08-21T10:00:02.000Z"}
4: {"level":"info","message":"Tool Read - checking permissions","timestamp":"2025-08-21T10:00:03.000Z"}
5: {"level":"info","message":"Tool Read permitted - action: allow","timestamp":"2025-08-21T10:00:04.000Z"}
6: {"level":"error","message":"CLI Error Timeout while reading from stdin","timestamp":"2025-08-21T10:00:05.000Z"}
7: {"level":"info","message":"Starting Amp CLI.","timestamp":"2025-08-21T10:01:00.000Z"}
8: {"level":"info","message":"Tool edit_file - checking permissions","timestamp":"2025-08-21T10:01:01.000Z"}
9: {"level":"info","message":"Tool edit_file permitted - action: allow","timestamp":"2025-08-21T10:01:02.000Z"}`;

  const realWorldLogData = `{"level":"info","message":"Tool list_directory - checking permissions","timestamp":"2025-08-15T22:24:01.721Z"}
{"level":"info","message":"Permissions changed to","permissions":[{"action":"allow","tool":"*"}],"timestamp":"2025-08-15T22:24:01.721Z"}
{"level":"info","message":"Tool list_directory permitted - action: allow","timestamp":"2025-08-15T22:24:01.721Z"}
{"level":"info","message":"Tool todo_write - checking permissions","timestamp":"2025-08-15T22:24:01.722Z"}
{"level":"info","message":"Permissions changed to","permissions":[{"action":"allow","tool":"*"}],"timestamp":"2025-08-15T22:24:01.722Z"}
{"level":"info","message":"Tool todo_write permitted - action: allow","timestamp":"2025-08-15T22:24:01.722Z"}
{"level":"info","message":"Tool web_search - checking permissions","timestamp":"2025-08-15T22:24:02.123Z"}
{"level":"info","message":"Permissions changed to","permissions":[{"action":"allow","tool":"*"}],"timestamp":"2025-08-15T22:24:02.123Z"}
{"level":"info","message":"Tool web_search permitted - action: allow","timestamp":"2025-08-15T22:24:02.123Z"}`;

  beforeEach(() => {
    vi.clearAllMocks();
    (readFileSync as any).mockReturnValue(mockLogData);
    (statSync as any).mockReturnValue({ mtime: new Date('2025-08-21T10:01:30.000Z') });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('parseLog', () => {
    it('should parse log entries correctly', () => {
      const entries = AmpLogParser.parseLog();
      
      expect(entries).toHaveLength(9);
      expect(entries[0]).toEqual({
        level: 'info',
        message: 'Starting Amp CLI.',
        timestamp: '2025-08-21T10:00:00.000Z'
      });
      
      expect(readFileSync).toHaveBeenCalledWith(join('/mock/home', '.cache', 'amp', 'logs', 'cli.log'), 'utf8');
    });

    it('should handle malformed log lines', () => {
      (readFileSync as any).mockReturnValue(`1: {"level":"info","message":"Good line","timestamp":"2025-08-21T10:00:00.000Z"}
2: This is not JSON
3: {"level":"info","message":"Another good line","timestamp":"2025-08-21T10:00:01.000Z"}`);

      const entries = AmpLogParser.parseLog();
      
      expect(entries).toHaveLength(2);
      expect(entries[0].message).toBe('Good line');
      expect(entries[1].message).toBe('Another good line');
    });

    it('should handle file read errors', () => {
      (readFileSync as any).mockImplementation(() => {
        throw new Error('File not found');
      });

      const entries = AmpLogParser.parseLog();
      
      expect(entries).toHaveLength(0);
    });
  });

  describe('extractToolUsages', () => {
    it('should extract tool usage information', () => {
      const entries = AmpLogParser.parseLog();
      const toolUsages = AmpLogParser.extractToolUsages(entries);
      
      expect(toolUsages).toHaveLength(3);
      expect(toolUsages[0]).toEqual({
        toolName: 'Grep',
        timestamp: '2025-08-21T10:00:01.000Z',
        permitted: true
      });
      expect(toolUsages[1]).toEqual({
        toolName: 'Read',
        timestamp: '2025-08-21T10:00:03.000Z',
        permitted: true
      });
      expect(toolUsages[2]).toEqual({
        toolName: 'edit_file',
        timestamp: '2025-08-21T10:01:01.000Z',
        permitted: true
      });
    });

    it('should handle tools that were not permitted', () => {
      const entries = [
        {
          level: 'info' as const,
          message: 'Tool Grep - checking permissions',
          timestamp: '2025-08-21T10:00:01.000Z'
        }
        // No permitted message follows
      ];
      
      const toolUsages = AmpLogParser.extractToolUsages(entries);
      
      expect(toolUsages).toHaveLength(0); // Only permitted tools are included
    });

    it('should parse real-world CLI log format without line numbers', () => {
      (readFileSync as any).mockReturnValue(realWorldLogData);
      
      const entries = AmpLogParser.parseLog();
      const toolUsages = AmpLogParser.extractToolUsages(entries);
      
      expect(entries).toHaveLength(9);
      expect(toolUsages).toHaveLength(3);
      
      expect(toolUsages[0]).toEqual({
        toolName: 'list_directory',
        timestamp: '2025-08-15T22:24:01.721Z',
        permitted: true
      });
      expect(toolUsages[1]).toEqual({
        toolName: 'todo_write', 
        timestamp: '2025-08-15T22:24:01.722Z',
        permitted: true
      });
      expect(toolUsages[2]).toEqual({
        toolName: 'web_search',
        timestamp: '2025-08-15T22:24:02.123Z', 
        permitted: true
      });
    });
  });

  describe('extractSessions', () => {
    it('should detect session boundaries', () => {
      const entries = AmpLogParser.parseLog();
      const sessions = AmpLogParser.extractSessions(entries);
      
      expect(sessions).toHaveLength(2);
      
      // First session
      expect(sessions[0].startTime).toBe('2025-08-21T10:00:00.000Z');
      expect(sessions[0].endTime).toBe('2025-08-21T10:01:00.000Z');
      expect(sessions[0].errors).toHaveLength(1);
      expect(sessions[0].errors[0].message).toBe('CLI Error Timeout while reading from stdin');
      
      // Second session (ongoing)
      expect(sessions[1].startTime).toBe('2025-08-21T10:01:00.000Z');
      expect(sessions[1].endTime).toBeUndefined();
    });
  });

  describe('getEntriesSince', () => {
    it('should filter entries by timestamp', () => {
      const entries = AmpLogParser.getEntriesSince('2025-08-21T10:00:30.000Z');
      
      expect(entries).toHaveLength(3);
      expect(entries[0].message).toBe('Starting Amp CLI.');
      expect(entries[0].timestamp).toBe('2025-08-21T10:01:00.000Z');
    });
  });

  describe('extractIterationMetrics', () => {
    it('should extract metrics for an iteration', () => {
      const metrics = AmpLogParser.extractIterationMetrics('2025-08-21T10:00:30.000Z');
      
      expect(metrics.toolUsages).toHaveLength(1);
      expect(metrics.toolUsages[0].toolName).toBe('edit_file');
      expect(metrics.errors).toHaveLength(0);
      expect(metrics.duration).toBeGreaterThan(0);
    });
  });

  describe('getToolUsageStats', () => {
    it('should count tool usage by type', () => {
      const toolUsages = [
        { toolName: 'Grep', timestamp: '2025-08-21T10:00:01.000Z', permitted: true },
        { toolName: 'Read', timestamp: '2025-08-21T10:00:02.000Z', permitted: true },
        { toolName: 'Grep', timestamp: '2025-08-21T10:00:03.000Z', permitted: true },
      ];
      
      const stats = AmpLogParser.getToolUsageStats(toolUsages);
      
      expect(stats).toEqual({
        'Grep': 2,
        'Read': 1
      });
    });
  });

  describe('getActivitySummary', () => {
    it('should provide activity summary', () => {
      const summary = AmpLogParser.getActivitySummary(24);
      
      expect(summary.totalSessions).toBe(2);
      expect(summary.totalToolUsages).toBe(3);
      expect(summary.errorCount).toBe(1);
      expect(summary.toolStats).toEqual({
        'Grep': 1,
        'Read': 1,
        'edit_file': 1
      });
      expect(summary.timeRange.start).toBe('2025-08-21T10:00:00.000Z');
      expect(summary.timeRange.end).toBe('2025-08-21T10:01:02.000Z');
    });

    it('should handle empty results', () => {
      (readFileSync as any).mockReturnValue('');
      
      const summary = AmpLogParser.getActivitySummary(24);
      
      expect(summary.totalSessions).toBe(0);
      expect(summary.totalToolUsages).toBe(0);
      expect(summary.errorCount).toBe(0);
      expect(summary.toolStats).toEqual({});
    });
  });

  describe('getLogFileModTime', () => {
    it('should return log file modification time', () => {
      const modTime = AmpLogParser.getLogFileModTime();
      
      expect(modTime).toEqual(new Date('2025-08-21T10:01:30.000Z'));
      expect(statSync).toHaveBeenCalledWith(join('/mock/home', '.cache', 'amp', 'logs', 'cli.log'));
    });

    it('should handle file stat errors', () => {
      (statSync as any).mockImplementation(() => {
        throw new Error('File not found');
      });

      const modTime = AmpLogParser.getLogFileModTime();
      
      expect(modTime).toBeNull();
    });
  });
});

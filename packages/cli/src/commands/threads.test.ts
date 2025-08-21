import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command } from 'commander';
import { createThreadsCommand } from './threads.js';
import { ThreadService } from '@ampsm/core/amp/threads/index.js';
import { NormalizedThread } from '@ampsm/types';

// Mock the ThreadService
vi.mock('@ampsm/core/amp/threads/index.js');

describe('threads command', () => {
  let program: Command;
  let mockThreadService: any;
  let consoleLogSpy: any;
  let consoleErrorSpy: any;
  let processExitSpy: any;

  beforeEach(() => {
    program = new Command();
    
    // Mock ThreadService
    mockThreadService = {
      importThread: vi.fn(),
      refreshThread: vi.fn(),
      getThread: vi.fn(),
      listThreads: vi.fn(),
      ingestLogs: vi.fn(),
      importFromGit: vi.fn()
    };

    (ThreadService as any).mockImplementation(() => mockThreadService);

    // Mock console methods
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('Process exit called');
    });

    // Add threads command to program
    createThreadsCommand(program);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  describe('threads import', () => {
    it('should import thread successfully', async () => {
      const mockThread: NormalizedThread = {
        id: 'T-test-123',
        title: 'Test Thread',
        createdAt: '2024-01-01T00:00:00Z',
        lastUpdatedAt: '2024-01-01T01:00:00Z',
        messageCount: 5,
        totalTokens: 1000,
        modelUsed: 'gpt-4',
        status: 'active',
        messages: [],
        toolCalls: [],
        diffs: [],
        metrics: []
      };

      mockThreadService.importThread.mockResolvedValue({
        success: true,
        thread: mockThread
      });

      await program.parseAsync(['node', 'cli', 'threads', 'import', 'T-test-123']);

      expect(mockThreadService.importThread).toHaveBeenCalledWith('T-test-123');
      expect(consoleLogSpy).toHaveBeenCalledWith('✅ Successfully imported thread T-test-123');
      expect(consoleLogSpy).toHaveBeenCalledWith('   Title: Test Thread');
      expect(consoleLogSpy).toHaveBeenCalledWith('   Messages: 5');
      expect(consoleLogSpy).toHaveBeenCalledWith('   Tokens: 1000');
    });

    it('should handle import failure', async () => {
      mockThreadService.importThread.mockResolvedValue({
        success: false,
        error: 'Thread not found'
      });

      try {
        await program.parseAsync(['node', 'cli', 'threads', 'import', 'T-nonexistent']);
      } catch (error) {
        // Expected due to process.exit mock
      }

      expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Failed to import thread: Thread not found');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('threads refresh', () => {
    it('should refresh thread with updates', async () => {
      const mockThread: NormalizedThread = {
        id: 'T-test-123',
        title: 'Updated Thread',
        createdAt: '2024-01-01T00:00:00Z',
        lastUpdatedAt: '2024-01-01T02:00:00Z',
        messageCount: 8,
        totalTokens: 1500,
        modelUsed: 'gpt-4',
        status: 'active',
        messages: [],
        toolCalls: [],
        diffs: [],
        metrics: []
      };

      mockThreadService.refreshThread.mockResolvedValue({
        success: true,
        thread: mockThread,
        wasUpdated: true
      });

      await program.parseAsync(['node', 'cli', 'threads', 'refresh', 'T-test-123']);

      expect(mockThreadService.refreshThread).toHaveBeenCalledWith('T-test-123');
      expect(consoleLogSpy).toHaveBeenCalledWith('✅ Thread T-test-123 refreshed with updates');
      expect(consoleLogSpy).toHaveBeenCalledWith('   Title: Updated Thread');
      expect(consoleLogSpy).toHaveBeenCalledWith('   Messages: 8');
    });

    it('should handle refresh with no updates', async () => {
      const mockThread: NormalizedThread = {
        id: 'T-test-123',
        title: 'Test Thread',
        createdAt: '2024-01-01T00:00:00Z',
        lastUpdatedAt: '2024-01-01T01:00:00Z',
        messageCount: 5,
        totalTokens: 1000,
        modelUsed: 'gpt-4',
        status: 'active',
        messages: [],
        toolCalls: [],
        diffs: [],
        metrics: []
      };

      mockThreadService.refreshThread.mockResolvedValue({
        success: true,
        thread: mockThread,
        wasUpdated: false
      });

      await program.parseAsync(['node', 'cli', 'threads', 'refresh', 'T-test-123']);

      expect(consoleLogSpy).toHaveBeenCalledWith('ℹ️ Thread T-test-123 is already up to date');
    });
  });

  describe('threads show', () => {
    it('should display thread details', async () => {
      const mockThread: NormalizedThread = {
        id: 'T-test-123',
        title: 'Detailed Thread',
        createdAt: '2024-01-01T00:00:00Z',
        lastUpdatedAt: '2024-01-01T01:00:00Z',
        messageCount: 3,
        totalTokens: 1200,
        modelUsed: 'gpt-4',
        status: 'active',
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            content: 'Hello world',
            timestamp: '2024-01-01T00:00:00Z'
          },
          {
            id: 'msg-2',
            role: 'assistant',
            content: 'Hello! How can I help?',
            timestamp: '2024-01-01T00:01:00Z'
          }
        ],
        toolCalls: [
          {
            id: 'tool-1',
            messageId: 'msg-2',
            toolName: 'Read',
            parameters: { path: '/test.js' },
            result: 'file content',
            timestamp: '2024-01-01T00:01:30Z',
            durationMs: 150
          }
        ],
        diffs: [],
        metrics: []
      };

      mockThreadService.getThread.mockResolvedValue(mockThread);

      await program.parseAsync(['node', 'cli', 'threads', 'show', 'T-test-123']);

      expect(mockThreadService.getThread).toHaveBeenCalledWith('T-test-123');
      expect(consoleLogSpy).toHaveBeenCalledWith('Thread: T-test-123');
      expect(consoleLogSpy).toHaveBeenCalledWith('Title: Detailed Thread');
      expect(consoleLogSpy).toHaveBeenCalledWith('Messages: 3');
      expect(consoleLogSpy).toHaveBeenCalledWith('Tool Calls: 1');
    });

    it('should handle non-existent thread', async () => {
      mockThreadService.getThread.mockResolvedValue(null);

      try {
        await program.parseAsync(['node', 'cli', 'threads', 'show', 'T-nonexistent']);
      } catch (error) {
        // Expected due to process.exit mock
      }

      expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Thread T-nonexistent not found');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('threads list', () => {
    it('should list threads', async () => {
      const mockThreads: NormalizedThread[] = [
        {
          id: 'T-test-1',
          title: 'First Thread',
          createdAt: '2024-01-01T00:00:00Z',
          lastUpdatedAt: '2024-01-01T01:00:00Z',
          messageCount: 5,
          totalTokens: 1000,
          modelUsed: 'gpt-4',
          status: 'active',
          messages: [],
          toolCalls: [],
          diffs: [],
          metrics: []
        },
        {
          id: 'T-test-2',
          title: 'Second Thread',
          createdAt: '2024-01-01T00:00:00Z',
          lastUpdatedAt: '2024-01-01T02:00:00Z',
          messageCount: 8,
          totalTokens: 1500,
          modelUsed: 'gpt-4',
          status: 'active',
          messages: [],
          toolCalls: [],
          diffs: [],
          metrics: []
        }
      ];

      mockThreadService.listThreads.mockResolvedValue(mockThreads);

      await program.parseAsync(['node', 'cli', 'threads', 'list']);

      expect(mockThreadService.listThreads).toHaveBeenCalledWith(undefined);
      expect(consoleLogSpy).toHaveBeenCalledWith('Found 2 threads:');
      expect(consoleLogSpy).toHaveBeenCalledWith('  T-test-1: First Thread (5 messages, 1000 tokens)');
      expect(consoleLogSpy).toHaveBeenCalledWith('  T-test-2: Second Thread (8 messages, 1500 tokens)');
    });

    it('should list threads with query filter', async () => {
      const mockThreads: NormalizedThread[] = [
        {
          id: 'T-test-1',
          title: 'React Component',
          createdAt: '2024-01-01T00:00:00Z',
          lastUpdatedAt: '2024-01-01T01:00:00Z',
          messageCount: 3,
          totalTokens: 500,
          modelUsed: 'gpt-4',
          status: 'active',
          messages: [],
          toolCalls: [],
          diffs: [],
          metrics: []
        }
      ];

      mockThreadService.listThreads.mockResolvedValue(mockThreads);

      await program.parseAsync(['node', 'cli', 'threads', 'list', '--q', 'React']);

      expect(mockThreadService.listThreads).toHaveBeenCalledWith('React');
      expect(consoleLogSpy).toHaveBeenCalledWith('Found 1 threads matching "React":');
    });

    it('should handle empty thread list', async () => {
      mockThreadService.listThreads.mockResolvedValue([]);

      await program.parseAsync(['node', 'cli', 'threads', 'list']);

      expect(consoleLogSpy).toHaveBeenCalledWith('No threads found');
    });
  });

  describe('threads import-from-git', () => {
    it('should import threads from git history', async () => {
      mockThreadService.importFromGit.mockResolvedValue({
        success: true,
        foundThreadIds: ['T-git-123', 'T-git-456'],
        importedCount: 2,
        failedCount: 0,
        errors: []
      });

      await program.parseAsync(['node', 'cli', 'threads', 'import-from-git']);

      expect(mockThreadService.importFromGit).toHaveBeenCalledWith({ days: 30 });
      expect(consoleLogSpy).toHaveBeenCalledWith('✅ Git scan completed');
      expect(consoleLogSpy).toHaveBeenCalledWith('   Found 2 thread IDs');
      expect(consoleLogSpy).toHaveBeenCalledWith('   Successfully imported: 2');
      expect(consoleLogSpy).toHaveBeenCalledWith('   Failed: 0');
    });

    it('should handle partial import failures', async () => {
      mockThreadService.importFromGit.mockResolvedValue({
        success: true,
        foundThreadIds: ['T-git-123', 'T-git-456'],
        importedCount: 1,
        failedCount: 1,
        errors: ['T-git-456: Thread not found']
      });

      await program.parseAsync(['node', 'cli', 'threads', 'import-from-git', '--days', '7']);

      expect(mockThreadService.importFromGit).toHaveBeenCalledWith({ days: 7 });
      expect(consoleLogSpy).toHaveBeenCalledWith('⚠️ Git scan completed with some failures');
      expect(consoleLogSpy).toHaveBeenCalledWith('   Failed: 1');
      expect(consoleLogSpy).toHaveBeenCalledWith('   Errors:');
      expect(consoleLogSpy).toHaveBeenCalledWith('     T-git-456: Thread not found');
    });
  });

  describe('threads logs ingest', () => {
    it('should ingest logs from stdin', async () => {
      // Mock stdin
      const mockStdin = 'log line 1\nlog line 2\n';
      vi.spyOn(process.stdin, 'read').mockReturnValue(mockStdin);
      
      // Mock the stdin readable event
      const stdinListeners: { [key: string]: Function[] } = {};
      vi.spyOn(process.stdin, 'on').mockImplementation((event: string, callback: Function) => {
        if (!stdinListeners[event]) stdinListeners[event] = [];
        stdinListeners[event].push(callback);
        return process.stdin;
      });

      mockThreadService.ingestLogs.mockResolvedValue({
        success: true,
        threadId: 'T-test-123',
        toolCallsCount: 2,
        metricsCount: 1,
        diffsCount: 1
      });

      // Start the command
      const commandPromise = program.parseAsync(['node', 'cli', 'threads', 'logs', 'ingest', '--thread', 'T-test-123']);

      // Simulate data and end events
      setTimeout(() => {
        if (stdinListeners['data']) {
          stdinListeners['data'].forEach(callback => callback(Buffer.from(mockStdin)));
        }
        if (stdinListeners['end']) {
          stdinListeners['end'].forEach(callback => callback());
        }
      }, 0);

      await commandPromise;

      expect(mockThreadService.ingestLogs).toHaveBeenCalledWith(mockStdin, 'T-test-123');
      expect(consoleLogSpy).toHaveBeenCalledWith('✅ Successfully ingested logs for thread T-test-123');
      expect(consoleLogSpy).toHaveBeenCalledWith('   Tool calls: 2');
      expect(consoleLogSpy).toHaveBeenCalledWith('   Metrics: 1');
      expect(consoleLogSpy).toHaveBeenCalledWith('   Diffs: 1');
    });

    it('should handle ingestion errors', async () => {
      const mockStdin = 'invalid log data\n';
      vi.spyOn(process.stdin, 'read').mockReturnValue(mockStdin);
      
      const stdinListeners: { [key: string]: Function[] } = {};
      vi.spyOn(process.stdin, 'on').mockImplementation((event: string, callback: Function) => {
        if (!stdinListeners[event]) stdinListeners[event] = [];
        stdinListeners[event].push(callback);
        return process.stdin;
      });

      mockThreadService.ingestLogs.mockResolvedValue({
        success: false,
        error: 'Invalid log format'
      });

      const commandPromise = program.parseAsync(['node', 'cli', 'threads', 'logs', 'ingest']);

      setTimeout(() => {
        if (stdinListeners['data']) {
          stdinListeners['data'].forEach(callback => callback(Buffer.from(mockStdin)));
        }
        if (stdinListeners['end']) {
          stdinListeners['end'].forEach(callback => callback());
        }
      }, 0);

      try {
        await commandPromise;
      } catch (error) {
        // Expected due to process.exit mock
      }

      expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Failed to ingest logs: Invalid log format');
    });
  });
});

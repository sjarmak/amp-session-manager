import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ThreadService } from './index.js';
import { ThreadStore } from './store.js';
import { WebFetcher } from './webFetcher.js';
import { LogIngestor } from './logIngestor.js';
import { GitScanner } from './gitScanner.js';
import { NormalizedThread } from '../../../types/index.js';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

// Mock the dependencies
vi.mock('./webFetcher.js');
vi.mock('./logIngestor.js');
vi.mock('./gitScanner.js');

describe('ThreadService', () => {
  let service: ThreadService;
  let store: ThreadStore;
  let tempDbPath: string;
  let mockWebFetcher: any;
  let mockLogIngestor: any;
  let mockGitScanner: any;

  beforeEach(async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'thread-service-test-'));
    tempDbPath = join(tempDir, 'test.db');
    store = new ThreadStore(tempDbPath);
    await store.initialize();

    // Create mocks
    mockWebFetcher = {
      fetchThread: vi.fn()
    };
    mockLogIngestor = {
      ingestLogs: vi.fn()
    };
    mockGitScanner = {
      findThreadIds: vi.fn()
    };

    // Mock the constructors
    (WebFetcher as any).mockImplementation(() => mockWebFetcher);
    (LogIngestor as any).mockImplementation(() => mockLogIngestor);
    (GitScanner as any).mockImplementation(() => mockGitScanner);

    service = new ThreadService({
      dbPath: tempDbPath,
      sessionCookie: 'test-cookie',
      repoRoot: '/test/repo'
    });
  });

  afterEach(async () => {
    await store.close();
    try {
      await rm(tempDbPath, { force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
    vi.clearAllMocks();
  });

  describe('importThread', () => {
    it('should fetch and store thread successfully', async () => {
      const mockThread: NormalizedThread = {
        id: 'T-test-123',
        title: 'Test Thread',
        createdAt: '2024-01-01T00:00:00Z',
        lastUpdatedAt: '2024-01-01T01:00:00Z',
        messageCount: 1,
        totalTokens: 1000,
        modelUsed: 'gpt-4',
        status: 'active',
        messages: [],
        toolCalls: [],
        diffs: [],
        metrics: []
      };

      mockWebFetcher.fetchThread.mockResolvedValue(mockThread);

      const result = await service.importThread('T-test-123');

      expect(result.success).toBe(true);
      expect(result.thread).toEqual(mockThread);
      expect(mockWebFetcher.fetchThread).toHaveBeenCalledWith('T-test-123');

      // Verify thread was stored
      const storedThread = await store.getThread('T-test-123');
      expect(storedThread).toEqual(mockThread);
    });

    it('should handle fetch errors gracefully', async () => {
      mockWebFetcher.fetchThread.mockRejectedValue(new Error('Network error'));

      const result = await service.importThread('T-test-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
      expect(result.thread).toBeUndefined();
    });

    it('should handle invalid thread ID format', async () => {
      const result = await service.importThread('invalid-id');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid thread ID format');
      expect(mockWebFetcher.fetchThread).not.toHaveBeenCalled();
    });
  });

  describe('refreshThread', () => {
    it('should refresh existing thread', async () => {
      // Store initial thread
      const initialThread: NormalizedThread = {
        id: 'T-test-123',
        title: 'Initial Title',
        createdAt: '2024-01-01T00:00:00Z',
        lastUpdatedAt: '2024-01-01T00:00:00Z',
        messageCount: 1,
        totalTokens: 500,
        modelUsed: 'gpt-4',
        status: 'active',
        messages: [],
        toolCalls: [],
        diffs: [],
        metrics: []
      };
      await store.upsertThread(initialThread);

      // Mock updated thread
      const updatedThread: NormalizedThread = {
        ...initialThread,
        title: 'Updated Title',
        lastUpdatedAt: '2024-01-01T01:00:00Z',
        messageCount: 2,
        totalTokens: 1000
      };
      mockWebFetcher.fetchThread.mockResolvedValue(updatedThread);

      const result = await service.refreshThread('T-test-123');

      expect(result.success).toBe(true);
      expect(result.thread?.title).toBe('Updated Title');
      expect(result.wasUpdated).toBe(true);
    });

    it('should return false for wasUpdated when no changes', async () => {
      const thread: NormalizedThread = {
        id: 'T-test-123',
        title: 'Test Thread',
        createdAt: '2024-01-01T00:00:00Z',
        lastUpdatedAt: '2024-01-01T01:00:00Z',
        messageCount: 1,
        totalTokens: 1000,
        modelUsed: 'gpt-4',
        status: 'active',
        messages: [],
        toolCalls: [],
        diffs: [],
        metrics: []
      };
      
      await store.upsertThread(thread);
      mockWebFetcher.fetchThread.mockResolvedValue(thread);

      const result = await service.refreshThread('T-test-123');

      expect(result.success).toBe(true);
      expect(result.wasUpdated).toBe(false);
    });

    it('should handle non-existent thread', async () => {
      mockWebFetcher.fetchThread.mockRejectedValue(new Error('Thread not found'));

      const result = await service.refreshThread('T-nonexistent');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Thread not found');
    });
  });

  describe('getThread', () => {
    it('should return thread from store', async () => {
      const thread: NormalizedThread = {
        id: 'T-test-123',
        title: 'Test Thread',
        createdAt: '2024-01-01T00:00:00Z',
        lastUpdatedAt: '2024-01-01T01:00:00Z',
        messageCount: 1,
        totalTokens: 1000,
        modelUsed: 'gpt-4',
        status: 'active',
        messages: [],
        toolCalls: [],
        diffs: [],
        metrics: []
      };
      
      await store.upsertThread(thread);

      const result = await service.getThread('T-test-123');
      expect(result).toEqual(thread);
    });

    it('should return null for non-existent thread', async () => {
      const result = await service.getThread('T-nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('listThreads', () => {
    it('should return threads from store', async () => {
      const thread1: NormalizedThread = {
        id: 'T-test-1',
        title: 'First Thread',
        createdAt: '2024-01-01T00:00:00Z',
        lastUpdatedAt: '2024-01-01T00:00:00Z',
        messageCount: 1,
        totalTokens: 500,
        modelUsed: 'gpt-4',
        status: 'active',
        messages: [],
        toolCalls: [],
        diffs: [],
        metrics: []
      };

      const thread2: NormalizedThread = {
        id: 'T-test-2',
        title: 'Second Thread',
        createdAt: '2024-01-01T00:00:00Z',
        lastUpdatedAt: '2024-01-01T01:00:00Z',
        messageCount: 1,
        totalTokens: 600,
        modelUsed: 'gpt-4',
        status: 'active',
        messages: [],
        toolCalls: [],
        diffs: [],
        metrics: []
      };

      await store.upsertThread(thread1);
      await store.upsertThread(thread2);

      const result = await service.listThreads();
      expect(result).toHaveLength(2);
    });

    it('should filter threads by query', async () => {
      const thread1: NormalizedThread = {
        id: 'T-test-1',
        title: 'React Component',
        createdAt: '2024-01-01T00:00:00Z',
        lastUpdatedAt: '2024-01-01T00:00:00Z',
        messageCount: 1,
        totalTokens: 500,
        modelUsed: 'gpt-4',
        status: 'active',
        messages: [],
        toolCalls: [],
        diffs: [],
        metrics: []
      };

      const thread2: NormalizedThread = {
        id: 'T-test-2',
        title: 'Node.js API',
        createdAt: '2024-01-01T00:00:00Z',
        lastUpdatedAt: '2024-01-01T01:00:00Z',
        messageCount: 1,
        totalTokens: 600,
        modelUsed: 'gpt-4',
        status: 'active',
        messages: [],
        toolCalls: [],
        diffs: [],
        metrics: []
      };

      await store.upsertThread(thread1);
      await store.upsertThread(thread2);

      const result = await service.listThreads('React');
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('React Component');
    });
  });

  describe('ingestLogs', () => {
    it('should process logs and enrich existing thread', async () => {
      // Store initial thread
      const initialThread: NormalizedThread = {
        id: 'T-test-123',
        title: 'Test Thread',
        createdAt: '2024-01-01T00:00:00Z',
        lastUpdatedAt: '2024-01-01T00:00:00Z',
        messageCount: 1,
        totalTokens: 500,
        modelUsed: 'gpt-4',
        status: 'active',
        messages: [],
        toolCalls: [],
        diffs: [],
        metrics: []
      };
      await store.upsertThread(initialThread);

      // Mock log ingestion result
      const logResult = {
        threadId: 'T-test-123',
        toolCalls: [
          {
            id: 'tool-1',
            messageId: undefined,
            toolName: 'Read',
            parameters: { path: '/test.js' },
            result: 'file content',
            timestamp: '2024-01-01T00:01:00Z',
            durationMs: 150
          }
        ],
        metrics: [
          {
            id: 'metric-1',
            messageId: undefined,
            model: 'gpt-4',
            promptTokens: 300,
            completionTokens: 200,
            totalTokens: 500,
            durationMs: 2000,
            timestamp: '2024-01-01T00:01:01Z'
          }
        ],
        diffs: []
      };
      mockLogIngestor.ingestLogs.mockResolvedValue(logResult);

      const result = await service.ingestLogs('log data', 'T-test-123');

      expect(result.success).toBe(true);
      expect(result.threadId).toBe('T-test-123');
      expect(result.toolCallsCount).toBe(1);
      expect(result.metricsCount).toBe(1);
      expect(mockLogIngestor.ingestLogs).toHaveBeenCalledWith('log data', 'T-test-123');

      // Verify thread was enriched
      const enrichedThread = await store.getThread('T-test-123');
      expect(enrichedThread?.toolCalls).toHaveLength(1);
      expect(enrichedThread?.metrics).toHaveLength(1);
    });

    it('should handle ingestion errors gracefully', async () => {
      mockLogIngestor.ingestLogs.mockRejectedValue(new Error('Parse error'));

      const result = await service.ingestLogs('invalid log data', 'T-test-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Parse error');
    });
  });

  describe('importFromGit', () => {
    it('should scan git history and import found threads', async () => {
      mockGitScanner.findThreadIds.mockResolvedValue(['T-git-123', 'T-git-456']);
      
      const mockThread1: NormalizedThread = {
        id: 'T-git-123',
        title: 'Git Thread 1',
        createdAt: '2024-01-01T00:00:00Z',
        lastUpdatedAt: '2024-01-01T01:00:00Z',
        messageCount: 1,
        totalTokens: 1000,
        modelUsed: 'gpt-4',
        status: 'active',
        messages: [],
        toolCalls: [],
        diffs: [],
        metrics: []
      };

      const mockThread2: NormalizedThread = {
        id: 'T-git-456',
        title: 'Git Thread 2',
        createdAt: '2024-01-01T00:00:00Z',
        lastUpdatedAt: '2024-01-01T01:00:00Z',
        messageCount: 1,
        totalTokens: 800,
        modelUsed: 'gpt-4',
        status: 'active',
        messages: [],
        toolCalls: [],
        diffs: [],
        metrics: []
      };

      mockWebFetcher.fetchThread
        .mockResolvedValueOnce(mockThread1)
        .mockResolvedValueOnce(mockThread2);

      const result = await service.importFromGit({ days: 30 });

      expect(result.success).toBe(true);
      expect(result.foundThreadIds).toEqual(['T-git-123', 'T-git-456']);
      expect(result.importedCount).toBe(2);
      expect(result.failedCount).toBe(0);
    });

    it('should handle partial import failures', async () => {
      mockGitScanner.findThreadIds.mockResolvedValue(['T-git-123', 'T-git-456']);
      
      const mockThread: NormalizedThread = {
        id: 'T-git-123',
        title: 'Git Thread 1',
        createdAt: '2024-01-01T00:00:00Z',
        lastUpdatedAt: '2024-01-01T01:00:00Z',
        messageCount: 1,
        totalTokens: 1000,
        modelUsed: 'gpt-4',
        status: 'active',
        messages: [],
        toolCalls: [],
        diffs: [],
        metrics: []
      };

      mockWebFetcher.fetchThread
        .mockResolvedValueOnce(mockThread)
        .mockRejectedValueOnce(new Error('Thread not found'));

      const result = await service.importFromGit({ days: 30 });

      expect(result.success).toBe(true);
      expect(result.foundThreadIds).toEqual(['T-git-123', 'T-git-456']);
      expect(result.importedCount).toBe(1);
      expect(result.failedCount).toBe(1);
      expect(result.errors).toHaveLength(1);
    });

    it('should handle git scanner errors', async () => {
      mockGitScanner.findThreadIds.mockRejectedValue(new Error('Git error'));

      const result = await service.importFromGit({ days: 30 });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Git error');
    });
  });

  describe('deleteThread', () => {
    it('should delete thread from store', async () => {
      const thread: NormalizedThread = {
        id: 'T-test-123',
        title: 'Test Thread',
        createdAt: '2024-01-01T00:00:00Z',
        lastUpdatedAt: '2024-01-01T01:00:00Z',
        messageCount: 1,
        totalTokens: 1000,
        modelUsed: 'gpt-4',
        status: 'active',
        messages: [],
        toolCalls: [],
        diffs: [],
        metrics: []
      };
      
      await store.upsertThread(thread);
      expect(await store.getThread('T-test-123')).toBeDefined();

      await service.deleteThread('T-test-123');
      expect(await store.getThread('T-test-123')).toBeNull();
    });
  });
});

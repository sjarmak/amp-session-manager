import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ThreadStore } from './store.js';
import { NormalizedThread } from '../../../types/index.js';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

describe('ThreadStore', () => {
  let store: ThreadStore;
  let tempDbPath: string;

  beforeEach(async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'thread-store-test-'));
    tempDbPath = join(tempDir, 'test.db');
    store = new ThreadStore(tempDbPath);
    await store.initialize();
  });

  afterEach(async () => {
    await store.close();
    try {
      await rm(tempDbPath, { force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('upsertThread', () => {
    it('should insert a new thread', async () => {
      const thread: NormalizedThread = {
        id: 'T-test-123',
        title: 'Test Thread',
        createdAt: '2024-01-01T00:00:00Z',
        lastUpdatedAt: '2024-01-01T00:00:00Z',
        messageCount: 2,
        totalTokens: 1000,
        modelUsed: 'gpt-4',
        status: 'active',
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            content: 'Hello',
            timestamp: '2024-01-01T00:00:00Z'
          }
        ],
        toolCalls: [],
        diffs: [],
        metrics: []
      };

      await store.upsertThread(thread);

      const retrieved = await store.getThread('T-test-123');
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe('T-test-123');
      expect(retrieved!.title).toBe('Test Thread');
      expect(retrieved!.messages).toHaveLength(1);
    });

    it('should update existing thread if newer', async () => {
      const thread: NormalizedThread = {
        id: 'T-test-123',
        title: 'Original Title',
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

      await store.upsertThread(thread);

      const updatedThread: NormalizedThread = {
        ...thread,
        title: 'Updated Title',
        lastUpdatedAt: '2024-01-01T01:00:00Z',
        messageCount: 2,
        totalTokens: 1000
      };

      await store.upsertThread(updatedThread);

      const retrieved = await store.getThread('T-test-123');
      expect(retrieved!.title).toBe('Updated Title');
      expect(retrieved!.messageCount).toBe(2);
      expect(retrieved!.totalTokens).toBe(1000);
    });

    it('should not update if older data provided', async () => {
      const newerThread: NormalizedThread = {
        id: 'T-test-123',
        title: 'Newer Title',
        createdAt: '2024-01-01T00:00:00Z',
        lastUpdatedAt: '2024-01-01T02:00:00Z',
        messageCount: 3,
        totalTokens: 1500,
        modelUsed: 'gpt-4',
        status: 'active',
        messages: [],
        toolCalls: [],
        diffs: [],
        metrics: []
      };

      await store.upsertThread(newerThread);

      const olderThread: NormalizedThread = {
        ...newerThread,
        title: 'Older Title',
        lastUpdatedAt: '2024-01-01T01:00:00Z',
        messageCount: 2,
        totalTokens: 1000
      };

      await store.upsertThread(olderThread);

      const retrieved = await store.getThread('T-test-123');
      expect(retrieved!.title).toBe('Newer Title');
      expect(retrieved!.messageCount).toBe(3);
      expect(retrieved!.totalTokens).toBe(1500);
    });
  });

  describe('listThreads', () => {
    it('should return empty array when no threads exist', async () => {
      const threads = await store.listThreads();
      expect(threads).toEqual([]);
    });

    it('should return threads in descending order by lastUpdatedAt', async () => {
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

      const threads = await store.listThreads();
      expect(threads).toHaveLength(2);
      expect(threads[0].id).toBe('T-test-2');
      expect(threads[1].id).toBe('T-test-1');
    });

    it('should filter by query when provided', async () => {
      const thread1: NormalizedThread = {
        id: 'T-test-1',
        title: 'React Component Testing',
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
        title: 'Node.js API Development',
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

      const threads = await store.listThreads('React');
      expect(threads).toHaveLength(1);
      expect(threads[0].title).toBe('React Component Testing');
    });
  });

  describe('getThread', () => {
    it('should return null for non-existent thread', async () => {
      const thread = await store.getThread('non-existent');
      expect(thread).toBeNull();
    });

    it('should return thread with all related data', async () => {
      const thread: NormalizedThread = {
        id: 'T-test-123',
        title: 'Test Thread',
        createdAt: '2024-01-01T00:00:00Z',
        lastUpdatedAt: '2024-01-01T00:00:00Z',
        messageCount: 1,
        totalTokens: 1000,
        modelUsed: 'gpt-4',
        status: 'active',
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            content: 'Test message',
            timestamp: '2024-01-01T00:00:00Z'
          }
        ],
        toolCalls: [
          {
            id: 'tool-1',
            messageId: 'msg-1',
            toolName: 'Read',
            parameters: { path: '/test' },
            result: 'File contents',
            timestamp: '2024-01-01T00:00:01Z',
            durationMs: 100
          }
        ],
        diffs: [
          {
            id: 'diff-1',
            messageId: 'msg-1',
            filePath: '/test.js',
            oldContent: 'old',
            newContent: 'new',
            operation: 'modify',
            timestamp: '2024-01-01T00:00:02Z'
          }
        ],
        metrics: [
          {
            id: 'metric-1',
            messageId: 'msg-1',
            model: 'gpt-4',
            promptTokens: 500,
            completionTokens: 500,
            totalTokens: 1000,
            durationMs: 2000,
            timestamp: '2024-01-01T00:00:03Z'
          }
        ]
      };

      await store.upsertThread(thread);

      const retrieved = await store.getThread('T-test-123');
      expect(retrieved).toBeDefined();
      expect(retrieved!.messages).toHaveLength(1);
      expect(retrieved!.toolCalls).toHaveLength(1);
      expect(retrieved!.diffs).toHaveLength(1);
      expect(retrieved!.metrics).toHaveLength(1);
    });
  });

  describe('deleteThread', () => {
    it('should delete thread and all related data', async () => {
      const thread: NormalizedThread = {
        id: 'T-test-123',
        title: 'Test Thread',
        createdAt: '2024-01-01T00:00:00Z',
        lastUpdatedAt: '2024-01-01T00:00:00Z',
        messageCount: 1,
        totalTokens: 1000,
        modelUsed: 'gpt-4',
        status: 'active',
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            content: 'Test message',
            timestamp: '2024-01-01T00:00:00Z'
          }
        ],
        toolCalls: [],
        diffs: [],
        metrics: []
      };

      await store.upsertThread(thread);
      expect(await store.getThread('T-test-123')).toBeDefined();

      await store.deleteThread('T-test-123');
      expect(await store.getThread('T-test-123')).toBeNull();
    });

    it('should not throw error for non-existent thread', async () => {
      await expect(store.deleteThread('non-existent')).resolves.toBeUndefined();
    });
  });
});

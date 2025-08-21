import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebFetcher } from './webFetcher.js';
import { NormalizedThread } from '../../../types/index.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('WebFetcher', () => {
  let fetcher: WebFetcher;

  beforeEach(() => {
    vi.clearAllMocks();
    fetcher = new WebFetcher('test-cookie');
  });

  describe('fetchThread', () => {
    it('should fetch and normalize thread successfully', async () => {
      const mockThreadData = {
        id: 'T-test-123',
        title: 'Test Thread',
        createdAt: '2024-01-01T00:00:00.000Z',
        lastUpdatedAt: '2024-01-01T01:00:00.000Z',
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            content: 'Hello world',
            timestamp: '2024-01-01T00:00:00.000Z',
            toolCalls: [
              {
                id: 'tool-1',
                toolName: 'Read',
                parameters: { path: '/test.js' },
                result: 'console.log("hello");',
                timestamp: '2024-01-01T00:00:01.000Z',
                durationMs: 150
              }
            ]
          },
          {
            id: 'msg-2',
            role: 'assistant',
            content: 'Here is the modified code',
            timestamp: '2024-01-01T00:01:00.000Z',
            diffs: [
              {
                id: 'diff-1',
                filePath: '/test.js',
                oldContent: 'console.log("hello");',
                newContent: 'console.log("hello world");',
                operation: 'modify',
                timestamp: '2024-01-01T00:01:01.000Z'
              }
            ]
          }
        ],
        metrics: {
          totalTokens: 1000,
          model: 'gpt-4',
          promptTokens: 600,
          completionTokens: 400,
          durationMs: 3000
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockThreadData)
      });

      const result = await fetcher.fetchThread('T-test-123');

      expect(result).toBeDefined();
      expect(result.id).toBe('T-test-123');
      expect(result.title).toBe('Test Thread');
      expect(result.messages).toHaveLength(2);
      expect(result.toolCalls).toHaveLength(1);
      expect(result.diffs).toHaveLength(1);
      expect(result.metrics).toHaveLength(1);

      // Check fetch was called with correct parameters
      expect(mockFetch).toHaveBeenCalledWith(
        'https://ampcode.com/threads/T-test-123',
        {
          method: 'GET',
          headers: {
            'Cookie': 'test-cookie',
            'Accept': 'application/json',
            'User-Agent': 'amp-session-manager/1.0'
          }
        }
      );
    });

    it('should throw error for non-200 response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      await expect(fetcher.fetchThread('T-nonexistent'))
        .rejects
        .toThrow('Failed to fetch thread T-nonexistent: 404 Not Found');
    });

    it('should throw error for network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(fetcher.fetchThread('T-test-123'))
        .rejects
        .toThrow('Network error');
    });

    it('should handle malformed JSON response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.reject(new Error('Invalid JSON'))
      });

      await expect(fetcher.fetchThread('T-test-123'))
        .rejects
        .toThrow('Invalid JSON');
    });

    it('should normalize thread data correctly', async () => {
      const mockThreadData = {
        id: 'T-test-123',
        title: 'Test Thread',
        createdAt: '2024-01-01T00:00:00.000Z',
        lastUpdatedAt: '2024-01-01T01:00:00.000Z',
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            content: 'Test message',
            timestamp: '2024-01-01T00:00:00.000Z'
          }
        ],
        metrics: {
          totalTokens: 1000,
          model: 'gpt-4'
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockThreadData)
      });

      const result = await fetcher.fetchThread('T-test-123');

      expect(result.messageCount).toBe(1);
      expect(result.totalTokens).toBe(1000);
      expect(result.modelUsed).toBe('gpt-4');
      expect(result.status).toBe('active');
      expect(result.toolCalls).toEqual([]);
      expect(result.diffs).toEqual([]);
      expect(result.metrics).toEqual([]);
    });

    it('should handle threads with complex tool calls and diffs', async () => {
      const mockThreadData = {
        id: 'T-test-123',
        title: 'Complex Thread',
        createdAt: '2024-01-01T00:00:00.000Z',
        lastUpdatedAt: '2024-01-01T01:00:00.000Z',
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            content: 'Please modify the file',
            timestamp: '2024-01-01T00:00:00.000Z',
            toolCalls: [
              {
                id: 'tool-1',
                toolName: 'Read',
                parameters: { path: '/src/index.js' },
                result: 'Original content',
                timestamp: '2024-01-01T00:00:01.000Z',
                durationMs: 100
              },
              {
                id: 'tool-2',
                toolName: 'edit_file',
                parameters: { 
                  path: '/src/index.js',
                  old_str: 'old code',
                  new_str: 'new code'
                },
                result: 'File updated successfully',
                timestamp: '2024-01-01T00:00:02.000Z',
                durationMs: 200
              }
            ],
            diffs: [
              {
                id: 'diff-1',
                filePath: '/src/index.js',
                oldContent: 'old code',
                newContent: 'new code',
                operation: 'modify',
                timestamp: '2024-01-01T00:00:02.500Z'
              }
            ]
          }
        ],
        metrics: {
          totalTokens: 2000,
          model: 'gpt-4',
          promptTokens: 1200,
          completionTokens: 800,
          durationMs: 5000
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockThreadData)
      });

      const result = await fetcher.fetchThread('T-test-123');

      expect(result.toolCalls).toHaveLength(2);
      expect(result.toolCalls[0].toolName).toBe('Read');
      expect(result.toolCalls[1].toolName).toBe('edit_file');
      expect(result.diffs).toHaveLength(1);
      expect(result.diffs[0].operation).toBe('modify');
      expect(result.metrics).toHaveLength(1);
      expect(result.metrics[0].totalTokens).toBe(2000);
    });

    it('should handle missing optional fields gracefully', async () => {
      const mockThreadData = {
        id: 'T-test-123',
        title: 'Minimal Thread',
        createdAt: '2024-01-01T00:00:00.000Z',
        lastUpdatedAt: '2024-01-01T01:00:00.000Z',
        messages: []
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockThreadData)
      });

      const result = await fetcher.fetchThread('T-test-123');

      expect(result.messageCount).toBe(0);
      expect(result.totalTokens).toBe(0);
      expect(result.modelUsed).toBe('unknown');
      expect(result.status).toBe('active');
    });
  });
});

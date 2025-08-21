import { describe, it, expect, beforeEach } from 'vitest';
import { LogIngestor } from './logIngestor.js';

describe('LogIngestor', () => {
  let ingestor: LogIngestor;

  beforeEach(() => {
    ingestor = new LogIngestor();
  });

  describe('ingestLogs', () => {
    it('should parse JSONL log entries correctly', async () => {
      const logData = `{"timestamp":"2024-01-01T00:00:00.000Z","level":"debug","message":"Starting Amp iteration","threadId":"T-test-123"}
{"timestamp":"2024-01-01T00:00:01.000Z","level":"debug","message":"Tool call: Read","threadId":"T-test-123","toolName":"Read","parameters":{"path":"/test.js"},"durationMs":150}
{"timestamp":"2024-01-01T00:00:02.000Z","level":"debug","message":"Tool result","threadId":"T-test-123","toolName":"Read","result":"console.log('test');"}
{"timestamp":"2024-01-01T00:00:03.000Z","level":"debug","message":"Model completion","threadId":"T-test-123","model":"gpt-4","promptTokens":500,"completionTokens":300,"totalTokens":800,"durationMs":2000}
{"timestamp":"2024-01-01T00:00:04.000Z","level":"debug","message":"Diff generated","threadId":"T-test-123","filePath":"/test.js","operation":"modify","oldContent":"old","newContent":"new"}
{"timestamp":"2024-01-01T00:00:05.000Z","level":"debug","message":"Iteration completed","threadId":"T-test-123"}`;

      const result = await ingestor.ingestLogs(logData, 'T-test-123');

      expect(result.threadId).toBe('T-test-123');
      expect(result.toolCalls).toHaveLength(1);
      expect(result.metrics).toHaveLength(1);
      expect(result.diffs).toHaveLength(1);

      // Check tool call
      const toolCall = result.toolCalls[0];
      expect(toolCall.toolName).toBe('Read');
      expect(toolCall.parameters).toEqual({ path: '/test.js' });
      expect(toolCall.result).toBe('console.log(\'test\');');
      expect(toolCall.durationMs).toBe(150);

      // Check metric
      const metric = result.metrics[0];
      expect(metric.model).toBe('gpt-4');
      expect(metric.promptTokens).toBe(500);
      expect(metric.completionTokens).toBe(300);
      expect(metric.totalTokens).toBe(800);
      expect(metric.durationMs).toBe(2000);

      // Check diff
      const diff = result.diffs[0];
      expect(diff.filePath).toBe('/test.js');
      expect(diff.operation).toBe('modify');
      expect(diff.oldContent).toBe('old');
      expect(diff.newContent).toBe('new');
    });

    it('should handle multiple tool calls of same type', async () => {
      const logData = `{"timestamp":"2024-01-01T00:00:01.000Z","level":"debug","message":"Tool call: Read","threadId":"T-test-123","toolName":"Read","parameters":{"path":"/file1.js"},"durationMs":100}
{"timestamp":"2024-01-01T00:00:02.000Z","level":"debug","message":"Tool result","threadId":"T-test-123","toolName":"Read","result":"content1"}
{"timestamp":"2024-01-01T00:00:03.000Z","level":"debug","message":"Tool call: Read","threadId":"T-test-123","toolName":"Read","parameters":{"path":"/file2.js"},"durationMs":120}
{"timestamp":"2024-01-01T00:00:04.000Z","level":"debug","message":"Tool result","threadId":"T-test-123","toolName":"Read","result":"content2"}`;

      const result = await ingestor.ingestLogs(logData, 'T-test-123');

      expect(result.toolCalls).toHaveLength(2);
      expect(result.toolCalls[0].parameters).toEqual({ path: '/file1.js' });
      expect(result.toolCalls[0].result).toBe('content1');
      expect(result.toolCalls[0].durationMs).toBe(100);
      expect(result.toolCalls[1].parameters).toEqual({ path: '/file2.js' });
      expect(result.toolCalls[1].result).toBe('content2');
      expect(result.toolCalls[1].durationMs).toBe(120);
    });

    it('should handle logs without threadId when threadId provided', async () => {
      const logData = `{"timestamp":"2024-01-01T00:00:01.000Z","level":"debug","message":"Tool call: Read","toolName":"Read","parameters":{"path":"/test.js"},"durationMs":150}
{"timestamp":"2024-01-01T00:00:02.000Z","level":"debug","message":"Tool result","toolName":"Read","result":"content"}`;

      const result = await ingestor.ingestLogs(logData, 'T-test-123');

      expect(result.threadId).toBe('T-test-123');
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].toolName).toBe('Read');
    });

    it('should skip invalid JSON lines', async () => {
      const logData = `{"timestamp":"2024-01-01T00:00:01.000Z","level":"debug","message":"Tool call: Read","threadId":"T-test-123","toolName":"Read","parameters":{"path":"/test.js"},"durationMs":150}
invalid json line
{"timestamp":"2024-01-01T00:00:02.000Z","level":"debug","message":"Tool result","threadId":"T-test-123","toolName":"Read","result":"content"}`;

      const result = await ingestor.ingestLogs(logData, 'T-test-123');

      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].result).toBe('content');
    });

    it('should skip non-debug level entries', async () => {
      const logData = `{"timestamp":"2024-01-01T00:00:01.000Z","level":"info","message":"Starting iteration","threadId":"T-test-123"}
{"timestamp":"2024-01-01T00:00:02.000Z","level":"debug","message":"Tool call: Read","threadId":"T-test-123","toolName":"Read","parameters":{"path":"/test.js"},"durationMs":150}
{"timestamp":"2024-01-01T00:00:03.000Z","level":"warn","message":"Warning message","threadId":"T-test-123"}`;

      const result = await ingestor.ingestLogs(logData, 'T-test-123');

      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].toolName).toBe('Read');
    });

    it('should handle empty log data', async () => {
      const result = await ingestor.ingestLogs('', 'T-test-123');

      expect(result.threadId).toBe('T-test-123');
      expect(result.toolCalls).toEqual([]);
      expect(result.metrics).toEqual([]);
      expect(result.diffs).toEqual([]);
    });

    it('should handle whitespace-only log data', async () => {
      const result = await ingestor.ingestLogs('\n  \n\t\n', 'T-test-123');

      expect(result.threadId).toBe('T-test-123');
      expect(result.toolCalls).toEqual([]);
      expect(result.metrics).toEqual([]);
      expect(result.diffs).toEqual([]);
    });

    it('should generate proper IDs for tool calls, metrics, and diffs', async () => {
      const logData = `{"timestamp":"2024-01-01T00:00:01.000Z","level":"debug","message":"Tool call: Read","threadId":"T-test-123","toolName":"Read","parameters":{"path":"/test.js"},"durationMs":150}
{"timestamp":"2024-01-01T00:00:02.000Z","level":"debug","message":"Model completion","threadId":"T-test-123","model":"gpt-4","totalTokens":800}
{"timestamp":"2024-01-01T00:00:03.000Z","level":"debug","message":"Diff generated","threadId":"T-test-123","filePath":"/test.js","operation":"create"}`;

      const result = await ingestor.ingestLogs(logData, 'T-test-123');

      // Check that IDs are generated
      expect(result.toolCalls[0].id).toMatch(/^tool-/);
      expect(result.metrics[0].id).toMatch(/^metric-/);
      expect(result.diffs[0].id).toMatch(/^diff-/);

      // Check that IDs are unique
      const allIds = [
        ...result.toolCalls.map(t => t.id),
        ...result.metrics.map(m => m.id),
        ...result.diffs.map(d => d.id)
      ];
      expect(new Set(allIds).size).toBe(allIds.length);
    });

    it('should handle complex tool parameters', async () => {
      const logData = `{"timestamp":"2024-01-01T00:00:01.000Z","level":"debug","message":"Tool call: edit_file","threadId":"T-test-123","toolName":"edit_file","parameters":{"path":"/test.js","old_str":"const x = 1;","new_str":"const x = 2;","replace_all":false},"durationMs":200}
{"timestamp":"2024-01-01T00:00:02.000Z","level":"debug","message":"Tool result","threadId":"T-test-123","toolName":"edit_file","result":"File updated successfully"}`;

      const result = await ingestor.ingestLogs(logData, 'T-test-123');

      expect(result.toolCalls).toHaveLength(1);
      const toolCall = result.toolCalls[0];
      expect(toolCall.toolName).toBe('edit_file');
      expect(toolCall.parameters).toEqual({
        path: '/test.js',
        old_str: 'const x = 1;',
        new_str: 'const x = 2;',
        replace_all: false
      });
    });

    it('should associate tool calls with message IDs when available', async () => {
      const logData = `{"timestamp":"2024-01-01T00:00:01.000Z","level":"debug","message":"Tool call: Read","threadId":"T-test-123","messageId":"msg-123","toolName":"Read","parameters":{"path":"/test.js"},"durationMs":150}`;

      const result = await ingestor.ingestLogs(logData, 'T-test-123');

      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].messageId).toBe('msg-123');
    });

    it('should handle missing optional fields gracefully', async () => {
      const logData = `{"timestamp":"2024-01-01T00:00:01.000Z","level":"debug","message":"Tool call: Read","threadId":"T-test-123","toolName":"Read"}
{"timestamp":"2024-01-01T00:00:02.000Z","level":"debug","message":"Model completion","threadId":"T-test-123","model":"gpt-4"}
{"timestamp":"2024-01-01T00:00:03.000Z","level":"debug","message":"Diff generated","threadId":"T-test-123","filePath":"/test.js"}`;

      const result = await ingestor.ingestLogs(logData, 'T-test-123');

      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].parameters).toEqual({});
      expect(result.toolCalls[0].durationMs).toBeUndefined();

      expect(result.metrics).toHaveLength(1);
      expect(result.metrics[0].totalTokens).toBeUndefined();

      expect(result.diffs).toHaveLength(1);
      expect(result.diffs[0].operation).toBe('unknown');
    });
  });
});

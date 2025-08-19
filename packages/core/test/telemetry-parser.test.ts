import { describe, it, expect } from 'vitest';
import { TelemetryParser } from '../src/telemetry-parser.js';

describe('TelemetryParser', () => {
  const parser = new TelemetryParser();

  describe('parseOutput', () => {
    it('should parse JSONL logs correctly', () => {
      const jsonlOutput = `
{"timestamp":"2025-01-20T12:00:00.000Z","event":"tool_start","tool":"Read","args":{"path":"/test/file.ts"}}
{"timestamp":"2025-01-20T12:00:00.150Z","event":"tool_finish","tool":"Read","success":true,"duration":150}
{"timestamp":"2025-01-20T12:00:01.000Z","prompt":1500,"completion":800,"total":2300,"model":"gpt-4o"}
`.trim();

      const result = parser.parseOutput(jsonlOutput);

      expect(result.exitCode).toBe(0);
      expect(result.promptTokens).toBe(1500);
      expect(result.completionTokens).toBe(800);
      expect(result.totalTokens).toBe(2300);
      expect(result.model).toBe('gpt-4o');
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0]).toMatchObject({
        toolName: 'Read',
        args: { path: '/test/file.ts' },
        success: true,
        durationMs: 150
      });
    });

    it('should parse text logs as fallback', () => {
      const textOutput = `
[2025-01-20T12:00:00.000Z] Using Read tool with args: {"path":"/test/file.ts"}
[2025-01-20T12:00:00.150Z] Read tool completed successfully in 150ms
Token usage - prompt: 1500, completion: 800, total: 2300
Model: gpt-4o
`.trim();

      const result = parser.parseOutput(textOutput);

      expect(result.exitCode).toBe(0);
      expect(result.totalTokens).toBe(2300);
      expect(result.model).toBe('gpt-4o');
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].toolName).toBe('Read');
      expect(result.toolCalls[0].success).toBe(true);
      expect(result.toolCalls[0].durationMs).toBe(150);
    });

    it('should handle mixed output gracefully', () => {
      const mixedOutput = `
Some random output
{"timestamp":"2025-01-20T12:00:00.000Z","event":"tool_start","tool":"edit_file","args":{"path":"/test.ts"}}
More random text
{"timestamp":"2025-01-20T12:00:00.200Z","event":"tool_finish","tool":"edit_file","success":true,"duration":200}
Final tokens: 1000
`.trim();

      const result = parser.parseOutput(mixedOutput);

      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].toolName).toBe('edit_file');
      expect(result.toolCalls[0].success).toBe(true);
      expect(result.toolCalls[0].durationMs).toBe(200);
    });

    it('should handle empty output', () => {
      const result = parser.parseOutput('');

      expect(result.exitCode).toBe(0);
      expect(result.toolCalls).toHaveLength(0);
      expect(result.promptTokens).toBeUndefined();
      expect(result.completionTokens).toBeUndefined();
      expect(result.totalTokens).toBeUndefined();
      expect(result.model).toBeUndefined();
    });

    it('should handle orphaned tool events', () => {
      const orphanedOutput = `
{"timestamp":"2025-01-20T12:00:00.000Z","event":"tool_finish","tool":"orphan_tool","success":false,"duration":100}
`.trim();

      const result = parser.parseOutput(orphanedOutput);

      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].toolName).toBe('orphan_tool');
      expect(result.toolCalls[0].success).toBe(false);
      expect(result.toolCalls[0].args).toEqual({});
    });
  });
});

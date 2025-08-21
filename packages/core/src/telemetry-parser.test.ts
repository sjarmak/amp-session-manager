import { describe, it, expect, beforeEach } from 'vitest';
import { TelemetryParser, LogEvent } from './telemetry-parser';

describe('TelemetryParser', () => {
  let parser: TelemetryParser;

  beforeEach(() => {
    parser = new TelemetryParser();
  });

  describe('JSON Log Parsing', () => {
    it('should parse tool start events from JSON', () => {
      const jsonLog = '{"timestamp": "2024-01-20T10:30:00Z", "tool": "Read", "event": "tool_start", "args": {"path": "/test.js"}}';
      
      const result = parser.parseOutput(jsonLog);
      
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0]).toEqual({
        toolName: 'Read',
        args: { path: '/test.js' },
        success: false, // No finish event
        timestamp: '2024-01-20T10:30:00Z'
      });
    });

    it('should parse tool finish events from JSON', () => {
      const jsonLogs = [
        '{"timestamp": "2024-01-20T10:30:00Z", "tool": "Read", "event": "tool_start", "args": {"path": "/test.js"}}',
        '{"timestamp": "2024-01-20T10:30:05Z", "tool": "Read", "event": "tool_finish", "duration": 5000, "success": true}'
      ].join('\n');
      
      const result = parser.parseOutput(jsonLogs);
      
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0]).toEqual({
        toolName: 'Read',
        args: { path: '/test.js' },
        success: true,
        durationMs: 5000,
        timestamp: '2024-01-20T10:30:00Z'
      });
    });

    it('should parse token usage from JSON', () => {
      const jsonLog = '{"timestamp": "2024-01-20T10:30:00Z", "tokens": {"prompt": 100, "completion": 50, "total": 150}, "model": "gpt-4"}';
      
      const result = parser.parseOutput(jsonLog);
      
      expect(result.promptTokens).toBe(100);
      expect(result.completionTokens).toBe(50);
      expect(result.totalTokens).toBe(150);
      expect(result.model).toBe('gpt-4');
    });

    it('should parse alternative token usage formats from JSON', () => {
      const jsonLog = '{"timestamp": "2024-01-20T10:30:00Z", "token_usage": {"prompt_tokens": 75, "completion_tokens": 25, "total_tokens": 100}}';
      
      const result = parser.parseOutput(jsonLog);
      
      expect(result.promptTokens).toBe(75);
      expect(result.completionTokens).toBe(25);
      expect(result.totalTokens).toBe(100);
    });

    it('should parse inline token format from JSON', () => {
      const jsonLog = '{"timestamp": "2024-01-20T10:30:00Z", "prompt": 60, "completion": 40, "model": "claude-3"}';
      
      const result = parser.parseOutput(jsonLog);
      
      expect(result.promptTokens).toBe(60);
      expect(result.completionTokens).toBe(40);
      expect(result.model).toBe('claude-3');
    });
  });

  describe('Text Log Parsing', () => {
    it('should parse timestamped tool start events', () => {
      const textLog = '[2024-01-20T10:30:00Z] Using Read tool with args: {"path": "/test.js"}';
      
      const result = parser.parseOutput(textLog);
      
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].toolName).toBe('Read');
      expect(result.toolCalls[0].args).toEqual({ path: '/test.js' });
      expect(result.toolCalls[0].timestamp).toBe('2024-01-20T10:30:00Z');
    });

    it('should parse plain tool start events', () => {
      const textLog = 'Tool Bash started';
      
      const result = parser.parseOutput(textLog);
      
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].toolName).toBe('Bash');
      expect(result.toolCalls[0].success).toBe(false); // No finish event
    });

    it('should parse timestamped tool finish events', () => {
      const textLogs = [
        '[2024-01-20T10:30:00Z] Using Read tool with args: {"path": "/test.js"}',
        '[2024-01-20T10:30:03Z] Read tool completed successfully in 3000ms'
      ].join('\n');
      
      const result = parser.parseOutput(textLogs);
      
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0]).toEqual({
        toolName: 'Read',
        args: { path: '/test.js' },
        success: true,
        durationMs: 3000,
        timestamp: '2024-01-20T10:30:00Z'
      });
    });

    it('should parse plain tool finish events', () => {
      const textLogs = [
        'Tool edit_file started',
        'Tool edit_file done in 1500ms'
      ].join('\n');
      
      const result = parser.parseOutput(textLogs);
      
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].toolName).toBe('edit_file');
      expect(result.toolCalls[0].success).toBe(true);
      expect(result.toolCalls[0].durationMs).toBe(1500);
    });

    it('should parse failed tool events', () => {
      const textLogs = [
        '[2024-01-20T10:30:00Z] Using Bash tool with args: {"cmd": "invalid-command"}',
        '[2024-01-20T10:30:02Z] Bash tool failed in 2000ms'
      ].join('\n');
      
      const result = parser.parseOutput(textLogs);
      
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0]).toEqual({
        toolName: 'Bash',
        args: { cmd: 'invalid-command' },
        success: false,
        durationMs: 2000,
        timestamp: '2024-01-20T10:30:00Z'
      });
    });

    describe('Token Usage Parsing', () => {
      it('should parse standard token format', () => {
        const textLog = 'Tokens: prompt: 100, completion: 50, total: 150';
        
        const result = parser.parseOutput(textLog);
        
        expect(result.promptTokens).toBe(100);
        expect(result.completionTokens).toBe(50);
        expect(result.totalTokens).toBe(150);
      });

      it('should parse alternative token format', () => {
        const textLog = 'Prompt tokens: 75, Completion tokens: 25, Total: 100';
        
        const result = parser.parseOutput(textLog);
        
        expect(result.promptTokens).toBe(75);
        expect(result.completionTokens).toBe(25);
        expect(result.totalTokens).toBe(100);
      });

      it('should parse input/output token format (amp-eval style)', () => {
        const textLog = 'Usage: input_tokens: 80, output_tokens: 20';
        
        const result = parser.parseOutput(textLog);
        
        expect(result.promptTokens).toBe(80);
        expect(result.completionTokens).toBe(20);
        expect(result.totalTokens).toBe(100);
      });

      it('should parse short input/output format', () => {
        const textLog = 'input: 60 output: 40';
        
        const result = parser.parseOutput(textLog);
        
        expect(result.promptTokens).toBe(60);
        expect(result.completionTokens).toBe(40);
        expect(result.totalTokens).toBe(100);
      });

      it('should parse partial token information', () => {
        const textLog = 'tokens: total: 200';
        
        const result = parser.parseOutput(textLog);
        
        expect(result.totalTokens).toBe(200);
        expect(result.promptTokens).toBeUndefined();
        expect(result.completionTokens).toBeUndefined();
      });
    });

    it('should parse model information', () => {
      const textLog = 'Using model: gpt-4-turbo';
      
      const result = parser.parseOutput(textLog);
      
      expect(result.model).toBe('gpt-4-turbo');
    });

    it('should parse Amp version from output', () => {
      const textLog = 'Amp version 1.2.3 initialized';
      
      const result = parser.parseOutput(textLog);
      
      expect(result.ampVersion).toBe('1.2.3');
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle multiple tool calls', () => {
      const textLogs = [
        '[2024-01-20T10:30:00Z] Using Read tool with args: {"path": "/test.js"}',
        '[2024-01-20T10:30:02Z] Read tool completed successfully in 2000ms',
        '[2024-01-20T10:30:05Z] Using edit_file tool with args: {"path": "/test.js", "old_str": "old", "new_str": "new"}',
        '[2024-01-20T10:30:10Z] edit_file tool completed successfully in 5000ms'
      ].join('\n');
      
      const result = parser.parseOutput(textLogs);
      
      expect(result.toolCalls).toHaveLength(2);
      expect(result.toolCalls[0].toolName).toBe('Read');
      expect(result.toolCalls[0].durationMs).toBe(2000);
      expect(result.toolCalls[1].toolName).toBe('edit_file');
      expect(result.toolCalls[1].durationMs).toBe(5000);
    });

    it('should handle mixed JSON and text logs', () => {
      const mixedLogs = [
        'Tool Bash started',
        '{"timestamp": "2024-01-20T10:30:05Z", "tokens": {"prompt": 150, "completion": 75, "total": 225}}',
        'Tool Bash done in 3000ms',
        'model: claude-3-opus'
      ].join('\n');
      
      const result = parser.parseOutput(mixedLogs);
      
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].toolName).toBe('Bash');
      expect(result.toolCalls[0].durationMs).toBe(3000);
      expect(result.promptTokens).toBe(150);
      expect(result.completionTokens).toBe(75);
      expect(result.totalTokens).toBe(225);
      expect(result.model).toBe('claude-3-opus');
    });

    it('should handle orphaned tool events', () => {
      const textLogs = [
        'Tool Read started',
        '[2024-01-20T10:30:10Z] edit_file tool completed successfully in 5000ms', // No matching start
        '[2024-01-20T10:30:00Z] Using Bash tool with args: {"cmd": "ls"}' // No finish
      ].join('\n');
      
      const result = parser.parseOutput(textLogs);
      
      expect(result.toolCalls).toHaveLength(3);
      
      // Unmatched start
      expect(result.toolCalls.find(call => call.toolName === 'Read')).toEqual({
        toolName: 'Read',
        args: {},
        success: false,
        timestamp: expect.any(String)
      });
      
      // Orphaned finish
      expect(result.toolCalls.find(call => call.toolName === 'edit_file')).toEqual({
        toolName: 'edit_file',
        args: {},
        success: true,
        durationMs: 5000,
        timestamp: '2024-01-20T10:30:10Z'
      });
      
      // Unmatched start with args
      expect(result.toolCalls.find(call => call.toolName === 'Bash')).toEqual({
        toolName: 'Bash',
        args: { cmd: 'ls' },
        success: false,
        timestamp: '2024-01-20T10:30:00Z'
      });
    });

    it('should handle real-world amp output format', () => {
      const realWorldLog = `
Starting Amp session...
Amp version 1.5.2
Using model: gpt-4-turbo-preview
[2024-01-20T10:30:00Z] Using codebase_search_agent tool with args: {"query": "authentication system"}
[2024-01-20T10:30:15Z] codebase_search_agent tool completed successfully in 15000ms
[2024-01-20T10:30:16Z] Using Read tool with args: {"path": "/src/auth.ts"}
[2024-01-20T10:30:17Z] Read tool completed successfully in 1000ms
Prompt tokens: 2500, Completion tokens: 800, Total: 3300
Session completed
      `.trim();
      
      const result = parser.parseOutput(realWorldLog);
      
      expect(result.ampVersion).toBe('1.5.2');
      expect(result.model).toBe('gpt-4-turbo-preview');
      expect(result.promptTokens).toBe(2500);
      expect(result.completionTokens).toBe(800);
      expect(result.totalTokens).toBe(3300);
      expect(result.toolCalls).toHaveLength(2);
      
      expect(result.toolCalls[0]).toEqual({
        toolName: 'codebase_search_agent',
        args: { query: 'authentication system' },
        success: true,
        durationMs: 15000,
        timestamp: '2024-01-20T10:30:00Z'
      });
      
      expect(result.toolCalls[1]).toEqual({
        toolName: 'Read',
        args: { path: '/src/auth.ts' },
        success: true,
        durationMs: 1000,
        timestamp: '2024-01-20T10:30:16Z'
      });
    });

    it('should handle malformed JSON gracefully', () => {
      const malformedLog = `
{"timestamp": "2024-01-20T10:30:00Z", "tool": "Read", "event": "tool_start"}
{invalid json here}
Tool Bash started
{"valid": "json", "tokens": {"total": 100}}
      `.trim();
      
      const result = parser.parseOutput(malformedLog);
      
      expect(result.toolCalls).toHaveLength(2); // Read from JSON, Bash from text
      expect(result.totalTokens).toBe(100);
    });

    it('should prefer most recent token usage information', () => {
      const logsWithMultipleTokens = [
        'tokens: total: 100',
        'Prompt tokens: 200, Completion tokens: 50, Total: 250',
        'input: 300 output: 75' // This should be the final values
      ].join('\n');
      
      const result = parser.parseOutput(logsWithMultipleTokens);
      
      expect(result.promptTokens).toBe(300);
      expect(result.completionTokens).toBe(75);
      expect(result.totalTokens).toBe(375);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty input', () => {
      const result = parser.parseOutput('');
      
      expect(result.toolCalls).toEqual([]);
      expect(result.exitCode).toBe(0);
    });

    it('should handle input with only whitespace', () => {
      const result = parser.parseOutput('   \n\n\t  \n  ');
      
      expect(result.toolCalls).toEqual([]);
    });

    it('should handle invalid timestamps gracefully', () => {
      const textLog = '[invalid-timestamp] Using Read tool with args: {"path": "/test.js"}';
      
      const result = parser.parseOutput(textLog);
      
      expect(result.toolCalls).toHaveLength(0); // Should not match due to invalid timestamp format
    });

    it('should handle missing tool names', () => {
      const textLog = 'Tool  started'; // Empty tool name
      
      const result = parser.parseOutput(textLog);
      
      expect(result.toolCalls).toHaveLength(0);
    });

    it('should handle non-numeric durations', () => {
      const textLog = 'Tool Read done in abc ms';
      
      const result = parser.parseOutput(textLog);
      
      expect(result.toolCalls).toHaveLength(0); // Should not match due to non-numeric duration
    });
  });
});

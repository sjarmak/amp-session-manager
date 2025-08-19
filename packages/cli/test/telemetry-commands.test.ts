import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { SessionStore } from '@ampsm/core';
import { toolsCommand } from '../src/commands/tools.js';
import { usageCommand } from '../src/commands/usage.js';
import type { AmpTelemetry } from '@ampsm/types';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

describe('Telemetry Commands', () => {
  let tempDir: string;
  let store: SessionStore;
  let sessionId: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'cli-test-'));
    const dbPath = join(tempDir, 'test.sqlite');
    store = new SessionStore(dbPath);

    // Create a test session
    const session = store.createSession({
      name: 'Test Session',
      ampPrompt: 'Test prompt',
      repoRoot: tempDir,
      baseBranch: 'main'
    });
    sessionId = session.id;

    // Create test iteration with telemetry
    const iteration = store.createIteration(sessionId);
    const telemetry: AmpTelemetry = {
      exitCode: 0,
      promptTokens: 1500,
      completionTokens: 800,
      totalTokens: 2300,
      model: 'gpt-4o',
      ampVersion: '2.1.0',
      toolCalls: [
        {
          toolName: 'Read',
          args: { path: '/test/file.ts' },
          success: true,
          durationMs: 150,
          timestamp: new Date().toISOString()
        },
        {
          toolName: 'edit_file',
          args: { path: '/test/file.ts', old_str: 'old', new_str: 'new' },
          success: true,
          durationMs: 300,
          timestamp: new Date().toISOString()
        }
      ]
    };

    store.finishIteration(iteration.id, telemetry, 'abc123', 2);
  });

  afterAll(async () => {
    store.close();
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  describe('toolsCommand', () => {
    it('should display tool calls table', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await toolsCommand(sessionId, {});

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Tool Calls for Session'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Read'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('edit_file'));

      consoleSpy.mockRestore();
    });

    it('should output JSON when requested', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await toolsCommand(sessionId, { json: true });

      const lastCall = consoleSpy.mock.calls[consoleSpy.mock.calls.length - 1][0];
      expect(() => JSON.parse(lastCall)).not.toThrow();
      const parsed = JSON.parse(lastCall);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].toolName).toBe('Read');

      consoleSpy.mockRestore();
    });
  });

  describe('usageCommand', () => {
    it('should display usage statistics', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await usageCommand(sessionId, {});

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Token Usage for Session'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('2300')); // Total tokens

      consoleSpy.mockRestore();
    });

    it('should output JSON when requested', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await usageCommand(sessionId, { json: true });

      const lastCall = consoleSpy.mock.calls[consoleSpy.mock.calls.length - 1][0];
      expect(() => JSON.parse(lastCall)).not.toThrow();
      const parsed = JSON.parse(lastCall);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].totalTokens).toBe(2300);

      consoleSpy.mockRestore();
    });
  });
});

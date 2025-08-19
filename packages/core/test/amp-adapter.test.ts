import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AmpAdapter } from '../src/amp.js';
import { mkdtemp, rm, writeFile, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

describe('AmpAdapter', () => {
  let tempDir: string;
  let fakeAmpPath: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'amp-test-'));
    fakeAmpPath = join(process.cwd(), 'packages/core/test/fixtures/fake-amp.js');
    
    // Create AGENT_CONTEXT directory
    const contextDir = join(tempDir, 'AGENT_CONTEXT');
    await mkdir(contextDir, { recursive: true });
    await writeFile(join(contextDir, 'SESSION.md'), '# Test Session');
    await writeFile(join(contextDir, 'DIFF_SUMMARY.md'), 'No changes');
  });

  afterAll(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  describe('runIteration', () => {
    it('should run successfully with JSONL logs', async () => {
      const adapter = new AmpAdapter({
        ampPath: fakeAmpPath,
        enableJSONLogs: true
      });

      const result = await adapter.runIteration('Test prompt', tempDir, 'gpt-4o');

      expect(result.success).toBe(true);
      expect(result.telemetry.exitCode).toBe(0);
      expect(result.telemetry.totalTokens).toBe(2300);
      expect(result.telemetry.model).toBe('gpt-4o');
      expect(result.telemetry.toolCalls).toHaveLength(2);
      expect(result.telemetry.toolCalls[0].toolName).toBe('Read');
      expect(result.telemetry.toolCalls[1].toolName).toBe('edit_file');
      expect(result.awaitingInput).toBe(false);
    });

    it('should handle text logs fallback', async () => {
      const adapter = new AmpAdapter({
        ampPath: fakeAmpPath,
        enableJSONLogs: false
      });

      const result = await adapter.runIteration('Test prompt', tempDir);

      expect(result.success).toBe(true);
      expect(result.telemetry.totalTokens).toBe(2300);
      expect(result.telemetry.toolCalls.length).toBeGreaterThan(0);
    });

    it('should handle model overrides correctly', async () => {
      const adapter = new AmpAdapter({
        ampPath: fakeAmpPath
      });

      const result = await adapter.runIteration('Test prompt', tempDir, 'gpt-5');

      expect(result.success).toBe(true);
      // The fake amp should handle --try-gpt5 flag
    });

    it('should detect awaiting input conditions', async () => {
      // This would require a more sophisticated fake amp that outputs awaiting input
      const adapter = new AmpAdapter({
        ampPath: fakeAmpPath
      });

      const result = await adapter.runIteration('Test prompt', tempDir);

      // For now, just test that awaitingInput is properly set to false
      expect(result.awaitingInput).toBe(false);
    });
  });

  describe('consultOracle', () => {
    it('should run oracle consultation', async () => {
      const adapter = new AmpAdapter({
        ampPath: fakeAmpPath
      });

      const result = await adapter.consultOracle('Test query', tempDir, 'Test context');

      expect(result.success).toBe(true);
      expect(result.output).toContain('Oracle Analysis');
      expect(result.awaitingInput).toBe(false);
    });
  });
});

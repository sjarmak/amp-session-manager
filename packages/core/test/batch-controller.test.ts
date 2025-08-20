import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BatchController } from '../src/batch-controller.js';
import { SessionStore } from '../src/store.js';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdtemp, rm } from 'fs/promises';

describe('BatchController', () => {
  let controller: BatchController;
  let store: SessionStore;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'batch-controller-test-'));
    const dbPath = join(tempDir, 'test.db');
    store = new SessionStore(dbPath);
    controller = new BatchController(store, dbPath);
  });

  afterEach(async () => {
    store.close();
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('listRuns', () => {
    it('should return empty array when no runs exist', async () => {
      const runs = await controller.listRuns();
      expect(runs).toEqual([]);
    });

    it('should return run summaries with correct statistics', async () => {
      // Create a batch record manually for testing
      const runId = 'test-run-id';
      store.createBatch(runId, {
        baseBranch: 'main',
        concurrency: 2,
        model: 'gpt-4'
      });

      // Create some batch items
      store.createBatchItem({
        runId,
        repo: '/test/repo1',
        prompt: 'Test prompt 1',
        status: 'success',
        tokensTotal: 1000
      });

      store.createBatchItem({
        runId,
        repo: '/test/repo2', 
        prompt: 'Test prompt 2',
        status: 'fail',
        tokensTotal: 500
      });

      const runs = await controller.listRuns();
      
      expect(runs).toHaveLength(1);
      expect(runs[0]).toMatchObject({
        runId,
        defaultModel: 'gpt-4',
        concurrency: 2,
        totalItems: 2,
        successCount: 1,
        failCount: 1,
        totalTokens: 1500,
        status: 'completed'
      });
    });
  });

  describe('listItems', () => {
    it('should return paginated items with details', async () => {
      const runId = 'test-run-id';
      store.createBatch(runId, { baseBranch: 'main' });

      // Create test items
      const item1 = store.createBatchItem({
        runId,
        repo: '/test/repo1',
        prompt: 'Test prompt 1',
        status: 'success',
        startedAt: '2024-01-01T10:00:00Z',
        finishedAt: '2024-01-01T10:01:00Z',
        tokensTotal: 1000
      });

      const item2 = store.createBatchItem({
        runId,
        repo: '/test/repo2',
        prompt: 'Test prompt 2', 
        status: 'fail'
      });

      const result = await controller.listItems({ runId, limit: 10 });
      
      expect(result.total).toBe(2);
      expect(result.items).toHaveLength(2);
      expect(result.items[0]).toMatchObject({
        id: item1.id,
        status: 'success',
        duration: 60000 // 1 minute in milliseconds
      });
    });

    it('should filter items by status', async () => {
      const runId = 'test-run-id';
      store.createBatch(runId, { baseBranch: 'main' });

      store.createBatchItem({
        runId,
        repo: '/test/repo1',
        prompt: 'Test prompt 1',
        status: 'success'
      });

      store.createBatchItem({
        runId,
        repo: '/test/repo2',
        prompt: 'Test prompt 2',
        status: 'fail'
      });

      const result = await controller.listItems({ runId, status: 'success' });
      
      expect(result.total).toBe(1);
      expect(result.items[0].status).toBe('success');
    });
  });

  describe('plan validation', () => {
    it('should validate plan YAML correctly', async () => {
      const validPlan = `
runId: test-batch
concurrency: 2
defaults:
  baseBranch: main
  model: gpt-4
matrix:
  - repo: /test/repo1
    prompt: "Test prompt 1"
  - repo: /test/repo2
    prompt: "Test prompt 2"
`;

      // This should not throw
      try {
        const options = {
          planYaml: validPlan,
          overrides: { concurrency: 3 }
        };
        
        // We can't actually start the batch in tests since it requires Amp,
        // but we can test the validation by catching the error after validation passes
        await controller.start(options);
      } catch (error) {
        // We expect this to fail at the actual execution stage, not validation
        expect(error instanceof Error).toBe(true);
        expect((error as Error).message).not.toContain('Plan validation failed');
      }
    });

    it('should reject invalid plan YAML', async () => {
      const invalidPlan = `
concurrency: 0  # invalid - must be positive
defaults:
  # missing baseBranch
matrix: []  # invalid - must not be empty
`;

      await expect(controller.start({ planYaml: invalidPlan })).rejects.toThrow('Plan validation failed');
    });
  });
});

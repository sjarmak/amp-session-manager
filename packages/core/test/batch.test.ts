import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BatchRunner } from '../src/batch.js';
import { SessionStore } from '../src/store.js';
import { Exporter } from '../src/exporter.js';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('BatchRunner', () => {
  let store: SessionStore;
  let batchRunner: BatchRunner;
  let tmpDir: string;
  let dbPath: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `batch-test-${Date.now()}-${Math.random()}`);
    await mkdir(tmpDir, { recursive: true });
    dbPath = join(tmpDir, 'test.sqlite');
    store = new SessionStore(dbPath);
    batchRunner = new BatchRunner(store, dbPath);
  });

  afterEach(async () => {
    store.close();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('should parse valid YAML plan', async () => {
    const planContent = `
runId: test-run
concurrency: 2
defaults:
  baseBranch: main
  scriptCommand: "echo test"
  timeoutSec: 30
matrix:
  - repo: /tmp/repo1
    prompt: "Implement feature A"
  - repo: /tmp/repo2
    prompt: "Fix bug B"
`;
    
    const planPath = join(tmpDir, 'plan.yaml');
    await writeFile(planPath, planContent);

    const plan = await batchRunner.parsePlan(planPath);
    
    expect(plan.runId).toBe('test-run');
    expect(plan.concurrency).toBe(2);
    expect(plan.defaults.baseBranch).toBe('main');
    expect(plan.matrix).toHaveLength(2);
    expect(plan.matrix[0].repo).toBe('/tmp/repo1');
    expect(plan.matrix[0].prompt).toBe('Implement feature A');
  });

  it('should reject invalid plan schema', async () => {
    const planContent = `
concurrency: -1
defaults:
  baseBranch: main
matrix: []
`;
    
    const planPath = join(tmpDir, 'invalid.yaml');
    await writeFile(planPath, planContent);

    await expect(batchRunner.parsePlan(planPath)).rejects.toThrow('Plan validation failed');
  });

  it('should create batch records in database', async () => {
    const runId = 'test-batch-123';
    const defaults = { baseBranch: 'main', timeoutSec: 30 };
    
    const batch = store.createBatch(runId, defaults);
    
    expect(batch.runId).toBe(runId);
    expect(batch.defaultsJson).toBe(JSON.stringify(defaults));
    
    const retrieved = store.getBatch(runId);
    expect(retrieved).toEqual(batch);
  });

  it('should create and update batch items', async () => {
    const runId = 'test-batch-456';
    store.createBatch(runId, {});
    
    const item = store.createBatchItem({
      runId,
      repo: '/tmp/repo',
      prompt: 'Test prompt',
      status: 'queued'
    });
    
    expect(item.id).toBeDefined();
    expect(item.runId).toBe(runId);
    expect(item.status).toBe('queued');
    
    // Update status
    store.updateBatchItem(item.id, { 
      status: 'running',
      startedAt: new Date().toISOString()
    });
    
    const items = store.getBatchItems(runId);
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe('running');
    expect(items[0].startedAt).toBeDefined();
  });
});

describe('Exporter', () => {
  let store: SessionStore;
  let exporter: Exporter;
  let tmpDir: string;
  let dbPath: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `export-test-${Date.now()}-${Math.random()}`);
    await mkdir(tmpDir, { recursive: true });
    dbPath = join(tmpDir, 'test.sqlite');
    store = new SessionStore(dbPath);
    exporter = new Exporter(store);
  });

  afterEach(async () => {
    store.close();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('should export data by runId', () => {
    const runId = 'test-run-789';
    store.createBatch(runId, { baseBranch: 'main' });
    store.createBatchItem({
      runId,
      repo: '/tmp/repo',
      prompt: 'Test',
      status: 'success'
    });
    
    const exported = store.exportData({
      runId,
      tables: ['batches', 'batch_items'],
      format: 'json',
      outDir: tmpDir
    });
    
    expect(exported.batches).toHaveLength(1);
    expect(exported.batch_items).toHaveLength(1);
    expect(exported.batches[0].runId).toBe(runId);
  });

  it('should generate markdown report', async () => {
    // Create test data
    const runId = 'report-test';
    store.createBatch(runId, { baseBranch: 'main' });
    
    const report = await exporter.generateReport({
      runId,
      format: 'md'
    });
    
    expect(report).toContain('# Batch Execution Report');
    expect(report).toContain('## Summary');
    expect(report).toContain('## Model Usage');
  });
});

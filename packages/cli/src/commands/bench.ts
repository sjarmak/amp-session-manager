import { SessionStore, WorktreeManager, getDbPath } from '@ampsm/core';
import { readFile, mkdir, writeFile } from 'fs/promises';
import { resolve, join, dirname } from 'path';
import { existsSync } from 'fs';
import * as yaml from 'yaml';

interface BenchmarkCase {
  id: string;
  repo: string;
  commit?: string;
  prompt: string;
  timeoutSec?: number;
  successCommand?: string;
  expectedFiles?: string[];
  description?: string;
}

interface BenchmarkResult {
  id: string;
  success: boolean;
  durationMs: number;
  metricsFile: string;
  output?: string;
  error?: string;
  toolCalls: number;
  fileEdits: number;
  tokenUsage?: {
    total: number;
    prompt: number;
    completion: number;
    cost: number;
  };
}

export async function benchCommand(
  suitePath: string, 
  options: { 
    dryRun?: boolean; 
    timeout?: number; 
    outputDir?: string;
    concurrent?: number;
    json?: boolean;
  }
) {
  try {
    // Resolve and validate suite file
    const resolvedPath = resolve(suitePath);
    if (!existsSync(resolvedPath)) {
      console.error(`Benchmark suite not found: ${resolvedPath}`);
      process.exit(1);
    }

    // Load benchmark suite
    const suiteContent = await readFile(resolvedPath, 'utf-8');
    const suite = suitePath.endsWith('.yaml') || suitePath.endsWith('.yml') 
      ? yaml.parse(suiteContent)
      : JSON.parse(suiteContent);

    if (!suite.cases || !Array.isArray(suite.cases)) {
      console.error('Invalid benchmark suite: missing "cases" array');
      process.exit(1);
    }

    const cases: BenchmarkCase[] = suite.cases;
    console.log(`Loaded ${cases.length} benchmark cases from ${suitePath}`);

    if (options.dryRun) {
      console.log('\nDry run - would execute:');
      for (const benchCase of cases) {
        console.log(`  ${benchCase.id}: ${benchCase.description || benchCase.prompt.slice(0, 100)}...`);
      }
      return;
    }

    // Setup output directory
    const outputDir = options.outputDir || join(process.cwd(), 'benchmark-results');
    await mkdir(outputDir, { recursive: true });

    const dbPath = process.env.AMPSM_DB_PATH || getDbPath();
    const store = new SessionStore(dbPath);
    
    const results: BenchmarkResult[] = [];
    const concurrent = options.concurrent || 1;
    
    console.log(`\nExecuting ${cases.length} benchmark cases (${concurrent} concurrent)...`);
    
    // Process cases in batches based on concurrency
    for (let i = 0; i < cases.length; i += concurrent) {
      const batch = cases.slice(i, i + concurrent);
      const batchPromises = batch.map(benchCase => 
        executeBenchmarkCase(benchCase, store, outputDir, options.timeout)
      );
      
      const batchResults = await Promise.allSettled(batchPromises);
      
      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        const benchCase = batch[j];
        
        if (result.status === 'fulfilled') {
          results.push(result.value);
          console.log(`✓ ${benchCase.id}: ${result.value.success ? 'PASS' : 'FAIL'} (${result.value.durationMs}ms)`);
        } else {
          results.push({
            id: benchCase.id,
            success: false,
            durationMs: 0,
            metricsFile: '',
            error: result.reason?.message || 'Unknown error',
            toolCalls: 0,
            fileEdits: 0
          });
          console.log(`✗ ${benchCase.id}: ERROR - ${result.reason?.message}`);
        }
      }
    }
    
    // Generate summary
    const summary = {
      total: results.length,
      passed: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      avgDuration: results.reduce((sum, r) => sum + r.durationMs, 0) / results.length,
      totalTokens: results.reduce((sum, r) => sum + (r.tokenUsage?.total || 0), 0),
      totalCost: results.reduce((sum, r) => sum + (r.tokenUsage?.cost || 0), 0),
      results
    };
    
    const summaryFile = join(outputDir, 'benchmark-summary.json');
    await writeFile(summaryFile, JSON.stringify(summary, null, 2));
    
    if (options.json) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      console.log(`\n=== Benchmark Summary ===`);
      console.log(`Total: ${summary.total}`);
      console.log(`Passed: ${summary.passed}`);
      console.log(`Failed: ${summary.failed}`);
      console.log(`Success Rate: ${((summary.passed / summary.total) * 100).toFixed(1)}%`);
      console.log(`Avg Duration: ${Math.round(summary.avgDuration)}ms`);
      console.log(`Total Tokens: ${summary.totalTokens}`);
      console.log(`Total Cost: $${summary.totalCost.toFixed(4)}`);
      console.log(`\nResults saved to: ${outputDir}`);
    }
    
    store.close();
    
    // Exit with non-zero if any failures
    if (summary.failed > 0) {
      process.exit(1);
    }
    
  } catch (error) {
    console.error('Benchmark execution failed:', error);
    process.exit(1);
  }
}

async function executeBenchmarkCase(
  benchCase: BenchmarkCase,
  store: SessionStore,
  outputDir: string,
  timeoutSec?: number
): Promise<BenchmarkResult> {
  const startTime = Date.now();
  const metricsFile = join(outputDir, `${benchCase.id}-metrics.jsonl`);
  
  try {
    // Create temporary session for this benchmark case
    const manager = new WorktreeManager(store, undefined, undefined, metricsFile);
    
    const session = await manager.createSession({
      name: `bench-${benchCase.id}`,
      ampPrompt: benchCase.prompt,
      repoRoot: benchCase.repo,
      baseBranch: 'main',
      scriptCommand: benchCase.successCommand,
      modelOverride: undefined
    });
    
    try {
      // Set timeout if specified
      const timeout = timeoutSec || benchCase.timeoutSec || 1800; // 30 min default
      const timeoutHandle = setTimeout(() => {
        throw new Error(`Timeout after ${timeout}s`);
      }, timeout * 1000);
      
      // Run iteration
      await manager.iterate(session.id);
      clearTimeout(timeoutHandle);
      
      const endTime = Date.now();
      const durationMs = endTime - startTime;
      
      // Run success command if specified
      let success = true;
      if (benchCase.successCommand) {
        try {
          const { spawn } = await import('child_process');
          const result = await new Promise<number>((resolve) => {
            const child = spawn('bash', ['-c', benchCase.successCommand!], {
              cwd: session.worktreePath,
              stdio: 'pipe'
            });
            child.on('close', resolve);
          });
          success = result === 0;
        } catch {
          success = false;
        }
      }
      
      // Parse metrics file for summary
      const metrics = await parseMetricsFile(metricsFile);
      
      return {
        id: benchCase.id,
        success,
        durationMs,
        metricsFile,
        toolCalls: metrics.toolCalls,
        fileEdits: metrics.fileEdits,
        tokenUsage: metrics.tokenUsage
      };
      
    } finally {
      // Cleanup session
      try {
        await manager.cleanup(session.id);
      } catch (error) {
        console.warn(`Failed to cleanup session ${session.id}:`, error);
      }
    }
    
  } catch (error) {
    const durationMs = Date.now() - startTime;
    
    return {
      id: benchCase.id,
      success: false,
      durationMs,
      metricsFile,
      error: error instanceof Error ? error.message : String(error),
      toolCalls: 0,
      fileEdits: 0
    };
  }
}

async function parseMetricsFile(filePath: string): Promise<{
  toolCalls: number;
  fileEdits: number;
  tokenUsage?: {
    total: number;
    prompt: number;
    completion: number;
    cost: number;
  };
}> {
  try {
    if (!existsSync(filePath)) {
      return { toolCalls: 0, fileEdits: 0 };
    }
    
    const content = await readFile(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line.trim());
    
    let toolCalls = 0;
    let fileEdits = 0;
    let totalTokens = 0;
    let promptTokens = 0;
    let completionTokens = 0;
    let totalCost = 0;
    
    for (const line of lines) {
      try {
        const event = JSON.parse(line);
        
        if (event.type === 'tool_call') {
          toolCalls++;
        } else if (event.type === 'file_edit') {
          fileEdits++;
        } else if (event.type === 'llm_usage') {
          totalTokens += event.data.totalTokens || 0;
          promptTokens += event.data.promptTokens || 0;
          completionTokens += event.data.completionTokens || 0;
          totalCost += event.data.costUsd || 0;
        }
      } catch {
        // Skip invalid JSON lines
      }
    }
    
    return {
      toolCalls,
      fileEdits,
      tokenUsage: totalTokens > 0 ? {
        total: totalTokens,
        prompt: promptTokens,
        completion: completionTokens,
        cost: totalCost
      } : undefined
    };
    
  } catch {
    return { toolCalls: 0, fileEdits: 0 };
  }
}

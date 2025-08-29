import { SessionStore, getDbPath, BenchmarkRunner, type BenchmarkResult } from '@ampsm/core';
import * as path from 'path';
import * as fs from 'fs';

export async function benchmarkCommand(options: {
  config: string;
  output?: string;
  models?: string;
  suites?: string; 
  format?: 'json' | 'markdown';
}): Promise<void> {
  const configPath = path.resolve(options.config);
  
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const dbPath = getDbPath();
  const store = new SessionStore(dbPath);
  const runner = new BenchmarkRunner(store, dbPath);

  // Set up event listeners for progress
  runner.on('benchmark-started', (result: BenchmarkResult) => {
    console.log(`🚀 Benchmark started: ${result.id}`);
  });

  runner.on('benchmark-finished', (result: BenchmarkResult) => {
    console.log(`✅ Benchmark completed: ${result.id}`);
    outputResults(result, options);
  });

  try {
    const result = await runner.runBenchmark(configPath);
    
    if (options.output) {
      fs.writeFileSync(options.output, JSON.stringify(result, null, 2));
      console.log(`📁 Results saved to: ${options.output}`);
    }

  } catch (error) {
    throw new Error(`Benchmark failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function outputResults(result: BenchmarkResult, options: any): void {
  if (options.format === 'markdown') {
    outputMarkdown(result);
  } else {
    outputJson(result);
  }
}

function outputMarkdown(result: BenchmarkResult): void {
    console.log(`\n## Benchmark Results: ${result.id}\n`);
    
    // Model comparison table
    console.log('| Model | Success Rate | Avg Iterations | Total Runtime |');
    console.log('|-------|--------------|----------------|---------------|');
    
    for (const [modelKey, modelResult] of Object.entries(result.models)) {
      const successRate = (modelResult.metrics.success_rate * 100).toFixed(1);
      const avgIterations = modelResult.metrics.avg_iterations?.toFixed(1) || 'N/A';
      const totalRuntime = modelResult.metrics.total_runtime_sec?.toFixed(0) || 'N/A';
      
      console.log(`| ${modelKey} | ${successRate}% | ${avgIterations} | ${totalRuntime}s |`);
    }

    // Detailed suite results
    console.log('\n### Suite Details\n');
    for (const [modelKey, modelResult] of Object.entries(result.models)) {
      console.log(`#### ${modelKey}`);
      for (const [suiteKey, suiteResult] of Object.entries(modelResult.suites)) {
        console.log(`- **${suiteKey}**: ${suiteResult.summary.passed}/${suiteResult.summary.total} passed (${(suiteResult.summary.successRate * 100).toFixed(1)}%)`);
      }
      console.log('');
    }
  }

function outputJson(result: BenchmarkResult): void {
  console.log(JSON.stringify(result, null, 2));
}

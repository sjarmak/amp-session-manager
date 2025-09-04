import { readFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { parse } from 'yaml'
import { EventEmitter } from 'node:events'

import { 
  BenchmarkSpecV2, 
  BenchmarkResult, 
  CaseResult, 
  BenchmarkCase,
  ModelConfig 
} from './types/benchmark.js'
import { ExecutorEvent, ExecutorContext } from './types/executor.js'
import { createExecutorRegistry } from './executors/index.js'
import { MetricsRegistry, defaultMetricsRegistry } from './metrics/registry.js'
import { BenchmarkReporter, ReportConfig } from './reporter/index.js'
// Import types from local types package instead
// import { SessionStore, MetricsEventBus } from '@ampsm/core'

export interface BenchmarkRunnerConfig {
  workingDir?: string
  outputDir?: string
  parallel?: number
  models?: string[]
  dryRun?: boolean
  metricsRegistry?: MetricsRegistry
  reportFormats?: ('json' | 'csv' | 'markdown' | 'html')[]
  ampSettings?: any
  sessionStore?: any  // Make optional for now, injected from desktop app
  metricsBus?: any   // Make optional for now, injected from desktop app
}

export class BenchmarkRunner extends EventEmitter {
  private executors = createExecutorRegistry()
  private metricsRegistry: MetricsRegistry

  constructor(private config: BenchmarkRunnerConfig = {}) {
    super()
    this.metricsRegistry = config.metricsRegistry || defaultMetricsRegistry
  }

  async listRuns(): Promise<any[]> {
    const { readdir, readFile } = await import('node:fs/promises');
    const path = await import('node:path');
    
    try {
      if (!this.config.outputDir) {
        return [];
      }
      
      const files = await readdir(this.config.outputDir);
      const resultFiles = files.filter(f => f.endsWith('.json') && !f.includes('/') && !f.startsWith('.'));
      
      const results = await Promise.all(
        resultFiles.map(async f => {
          const resultPath = path.join(this.config.outputDir!, f);
          const content = await readFile(resultPath, 'utf-8');
          return JSON.parse(content);
        })
      );
      
      return results.sort((a, b) => new Date(b.started).getTime() - new Date(a.started).getTime());
    } catch (error: any) {
      console.log('No benchmark results found:', error.message);
      return [];
    }
  }

  async deleteBenchmarkRun(runId: string): Promise<boolean> {
    const { readdir, unlink } = await import('node:fs/promises');
    const path = await import('node:path');
    
    try {
      if (!this.config.outputDir) {
        throw new Error('No output directory configured');
      }
      
      // Find files associated with this benchmark
      const files = await readdir(this.config.outputDir);
      const benchmarkFiles = files.filter(f => f.includes(runId.replace(/[^a-zA-Z0-9]/g, '_')));
      
      if (benchmarkFiles.length === 0) {
        return false; // No files found for this runId
      }
      
      // Delete all associated files (JSON, HTML, MD)
      let deletedCount = 0;
      for (const file of benchmarkFiles) {
        const filePath = path.join(this.config.outputDir!, file);
        try {
          await unlink(filePath);
          console.log(`📊 Deleted benchmark file: ${file}`);
          deletedCount++;
        } catch (error) {
          console.warn(`📊 Could not delete file ${file}:`, error);
        }
      }
      
      return deletedCount > 0;
    } catch (error) {
      console.error('Failed to delete benchmark run:', error);
      throw error;
    }
  }

  async getBenchmarkResult(runId: string): Promise<any> {
    const { readdir, readFile } = await import('node:fs/promises');
    const path = await import('node:path');
    
    try {
      if (!this.config.outputDir) {
        throw new Error('No output directory configured');
      }
      
      // Try to find result file by matching benchmark name (runId)
      const files = await readdir(this.config.outputDir);
      const resultFile = files.find(f => f.endsWith('.json') && f.includes(runId.replace(/[^a-zA-Z0-9]/g, '_')));
      
      if (!resultFile) {
        throw new Error(`No benchmark result found for runId: ${runId}`);
      }
      
      const resultPath = path.join(this.config.outputDir!, resultFile);
      const content = await readFile(resultPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.error('Failed to load benchmark result:', error);
      throw error;
    }
  }

  async runBenchmark(specPath: string): Promise<BenchmarkResult> {
    const spec = await this.loadBenchmarkSpec(specPath)
    const startTime = new Date()

    this.emit('benchmark_started', {
      name: spec.name,
      total_cases: this.countTotalCases(spec),
      models: Object.keys(spec.models)
    })

    try {
      const results = await this.executeBenchmark(spec)
      const endTime = new Date()

      const benchmarkResult: BenchmarkResult = {
        benchmark_name: spec.name,
        started: startTime.toISOString(),
        ended: endTime.toISOString(),
        total_duration_sec: (endTime.getTime() - startTime.getTime()) / 1000,
        config_file: specPath,
        cases: results,
        summary: this.computeSummary(results)
      }

      // Generate reports
      await this.generateReports(benchmarkResult)

      this.emit('benchmark_completed', benchmarkResult)
      return benchmarkResult

    } catch (error) {
      this.emit('benchmark_failed', error)
      throw error
    }
  }

  private async loadBenchmarkSpec(specPath: string): Promise<BenchmarkSpecV2> {
    const content = await readFile(specPath, 'utf-8')
    const spec = parse(content)
    
    if (spec.version !== 2) {
      throw new Error(`Unsupported benchmark spec version: ${spec.version}. Expected version 2.`)
    }

    return spec as BenchmarkSpecV2
  }

  private countTotalCases(spec: BenchmarkSpecV2): number {
    let total = 0
    const models = this.config.models || Object.keys(spec.models)

    for (const suite of spec.suites) {
      if (suite.swebench_cases_dir) {
        // TODO: Count SWE-bench cases from directory
        total += models.length * 10 // placeholder
      } else if (suite.cases) {
        total += suite.cases.length * models.length
      }
    }

    return total
  }

  private async executeBenchmark(spec: BenchmarkSpecV2): Promise<CaseResult[]> {
    const allCases = this.expandCases(spec)
    const results: CaseResult[] = []

    const parallel = this.config.parallel || spec.defaults.parallel || 1
    
    // Create worker pool
    const workers: Promise<CaseResult>[] = []
    let caseIndex = 0

    const processNext = async (): Promise<CaseResult | null> => {
      if (caseIndex >= allCases.length) return null
      
      const expandedCase = allCases[caseIndex++]
      
      if (this.config.dryRun) {
        console.log(`[DRY RUN] Would execute: ${expandedCase.case.id} with ${expandedCase.model.name}`)
        return {
          id: expandedCase.case.id,
          model: expandedCase.model.name,
          kind: expandedCase.case.kind || 'session',
          started: new Date().toISOString(),
          ended: new Date().toISOString(),
          duration_sec: 0,
          passed: true,
          metrics: { dry_run: 1 }
        }
      }

      return await this.executeCase(expandedCase.case, expandedCase.model, spec.defaults)
    }

    // Start initial batch of workers
    for (let i = 0; i < parallel && i < allCases.length; i++) {
      workers.push(processNext().then(async (result): Promise<CaseResult> => {
        if (!result) throw new Error('Unexpected null result')
        
        results.push(result)
        this.emit('case_completed', result)

        // Process next case
        let nextResult = await processNext()
        while (nextResult) {
          results.push(nextResult)
          this.emit('case_completed', nextResult)
          nextResult = await processNext()
          
          // Yield control to event loop to prevent blocking
          await new Promise(resolve => setImmediate(resolve))
        }

        return result
      }))
    }

    // Wait for all workers to complete
    await Promise.allSettled(workers)

    return results
  }

  private expandCases(spec: BenchmarkSpecV2): Array<{ case: BenchmarkCase, model: ModelConfig }> {
    const expanded: Array<{ case: BenchmarkCase, model: ModelConfig }> = []
    const models = this.config.models || Object.keys(spec.models)

    for (const suite of spec.suites) {
      if (suite.swebench_cases_dir) {
        // TODO: Load SWE-bench cases from directory
        console.warn(`SWE-bench cases from ${suite.swebench_cases_dir} not yet implemented`)
        continue
      }

      if (!suite.cases) continue

      for (const caseSpec of suite.cases) {
        for (const modelName of models) {
          const model = spec.models[modelName]
          if (!model) {
            console.warn(`Model ${modelName} not found in spec`)
            continue
          }

          // Apply suite-level defaults to case
          const enhancedCase: BenchmarkCase = {
            ...caseSpec,
            kind: caseSpec.kind || 'session', // Default to session
            timeout_sec: caseSpec.timeout_sec || suite.timeout_sec || spec.defaults.timeout_sec
          }

          expanded.push({ case: enhancedCase, model })
        }
      }
    }

    return expanded
  }

  private async executeCase(
    caseSpec: BenchmarkCase, 
    model: ModelConfig, 
    defaults: any
  ): Promise<CaseResult> {
    const kind = caseSpec.kind || 'session'
    const executor = this.executors[kind]

    if (!executor) {
      throw new Error(`No executor found for kind: ${kind}`)
    }

    const outputDir = join(
      this.config.outputDir || './benchmark-results',
      new Date().toISOString().slice(0, 10) // YYYY-MM-DD
    )
    await mkdir(outputDir, { recursive: true })

    // Create session for this benchmark case (if sessionStore is available)
    let sessionId: string | undefined
    if (this.config.sessionStore) {
      try {
        const session = this.config.sessionStore.createSession({
          kind: kind as any,
          source: 'benchmark',
          benchmarkCaseId: caseSpec.id,
          model: model.name,
          repoRoot: this.config.workingDir || process.cwd(),
          notes: `Benchmark case: ${caseSpec.id}`
        })
        sessionId = session.id
      } catch (error) {
        console.warn('Failed to create benchmark session:', error)
      }
    }

    const context: ExecutorContext = {
      case: caseSpec,
      model,
      defaults,
      workingDir: this.config.workingDir || process.cwd(),
      outputDir,
      ampSettings: this.config.ampSettings,
      sessionStore: this.config.sessionStore,
      metricsBus: this.config.metricsBus,
      sessionId
    }

    this.emit('case_started', {
      type: 'case_started',
      caseId: caseSpec.id,
      model: model.name,
      timestamp: new Date().toISOString()
    } as ExecutorEvent)

    try {
      const result = await executor.execute(context)
      
      // Enhance result with session analytics
      if (sessionId && result.session_id !== sessionId) {
        result.session_id = sessionId
      }
      
      // TODO: Extract token/cost analytics from session once available
      // This would involve querying the session's metrics or using a cost calculator
      
      this.emit('case_completed', {
        type: 'case_completed',
        caseId: caseSpec.id,
        model: model.name,
        timestamp: new Date().toISOString(),
        data: { passed: result.passed, duration: result.duration_sec }
      } as ExecutorEvent)

      return result
    } catch (error) {
      const failedResult: CaseResult = {
        id: caseSpec.id,
        model: model.name,
        kind,
        started: new Date().toISOString(),
        ended: new Date().toISOString(),
        duration_sec: 0,
        passed: false,
        metrics: {},
        error: error instanceof Error ? error.message : String(error)
      }

      this.emit('case_failed', {
        type: 'case_failed',
        caseId: caseSpec.id,
        model: model.name,
        timestamp: new Date().toISOString(),
        data: { error: failedResult.error }
      } as ExecutorEvent)

      return failedResult
    }
  }

  private computeSummary(results: CaseResult[]) {
    const totalCases = results.length
    const passedCases = results.filter(r => r.passed).length
    const successRate = totalCases > 0 ? passedCases / totalCases : 0

    // Sum token usage and costs
    const totalPromptTokens = results.reduce((sum, r) => sum + (r.tokens_prompt || 0), 0)
    const totalCompletionTokens = results.reduce((sum, r) => sum + (r.tokens_completion || 0), 0)
    const totalCostUsd = results.reduce((sum, r) => sum + (r.total_cost_usd || 0), 0)

    const byModel = this.metricsRegistry.computeModelMetrics(results)

    return {
      total_cases: totalCases,
      passed_cases: passedCases,
      success_rate: successRate,
      total_prompt_tokens: totalPromptTokens > 0 ? totalPromptTokens : undefined,
      total_completion_tokens: totalCompletionTokens > 0 ? totalCompletionTokens : undefined,
      total_cost_usd: totalCostUsd > 0 ? totalCostUsd : undefined,
      by_model: byModel
    }
  }

  private async generateReports(result: BenchmarkResult): Promise<void> {
    const outputDir = this.config.outputDir || './benchmark-results'
    const formats = this.config.reportFormats || ['json', 'markdown']

    const reportConfig: ReportConfig = {
      outputDir,
      benchmarkName: result.benchmark_name.replace(/[^a-zA-Z0-9]/g, '_'),
      formats
    }

    const reporter = new BenchmarkReporter(this.metricsRegistry, reportConfig)
    await reporter.generateReport(result)

    this.emit('reports_generated', { outputDir, formats })
  }
}

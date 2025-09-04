import { CaseResult, ModelSummary } from '../types/benchmark.js'

/**
 * Metric reducer function type
 */
export type MetricReducer = (results: CaseResult[]) => number

/**
 * Registry for metrics that can be computed across benchmark results
 */
export class MetricsRegistry {
  private reducers = new Map<string, MetricReducer>()

  constructor() {
    this.registerBuiltinMetrics()
  }

  /**
   * Register a custom metric
   */
  registerMetric(name: string, reducer: MetricReducer): void {
    this.reducers.set(name, reducer)
  }

  /**
   * Get all available metric names
   */
  getMetricNames(): string[] {
    return Array.from(this.reducers.keys())
  }

  /**
   * Compute all metrics for a set of results
   */
  computeMetrics(results: CaseResult[]): Record<string, number> {
    const metrics: Record<string, number> = {}
    
    for (const [name, reducer] of Array.from(this.reducers)) {
      try {
        metrics[name] = reducer(results)
      } catch (error) {
        console.warn(`Failed to compute metric ${name}:`, error)
        metrics[name] = 0
      }
    }

    return metrics
  }

  /**
   * Compute metrics grouped by model
   */
  computeModelMetrics(results: CaseResult[]): Record<string, ModelSummary> {
    const byModel: Record<string, CaseResult[]> = {}
    
    // Group results by model
    for (const result of results) {
      if (!byModel[result.model]) {
        byModel[result.model] = []
      }
      byModel[result.model].push(result)
    }

    // Compute metrics for each model
    const modelSummaries: Record<string, ModelSummary> = {}
    
    for (const [model, modelResults] of Object.entries(byModel)) {
      const passedCases = modelResults.filter(r => r.passed).length
      const totalCases = modelResults.length
      const totalDuration = modelResults.reduce((sum, r) => sum + r.duration_sec, 0)
      
      modelSummaries[model] = {
        total_cases: totalCases,
        passed_cases: passedCases,
        success_rate: totalCases > 0 ? passedCases / totalCases : 0,
        avg_duration_sec: totalCases > 0 ? totalDuration / totalCases : 0,
        metrics: this.computeMetrics(modelResults)
      }
    }

    return modelSummaries
  }

  private registerBuiltinMetrics(): void {
    // Success rate - percentage of passed cases
    this.registerMetric('success_rate', (results) => {
      const total = results.length
      const passed = results.filter(r => r.passed).length
      return total > 0 ? passed / total : 0
    })

    // Average iterations (for session cases)
    this.registerMetric('avg_iterations', (results) => {
      const sessionResults = results.filter(r => r.kind === 'session')
      if (sessionResults.length === 0) return 0
      
      const totalIterations = sessionResults.reduce((sum, r) => {
        return sum + (r.metrics.total_iterations as number || 0)
      }, 0)
      
      return totalIterations / sessionResults.length
    })

    // Total runtime in seconds
    this.registerMetric('total_runtime_sec', (results) => {
      return results.reduce((sum, r) => sum + r.duration_sec, 0)
    })

    // Average latency in milliseconds (for QA cases)
    this.registerMetric('avg_latency_ms', (results) => {
      const qaResults = results.filter(r => r.kind === 'qa')
      if (qaResults.length === 0) return 0
      
      const totalLatency = qaResults.reduce((sum, r) => {
        return sum + (r.metrics.avg_latency_ms as number || 0)
      }, 0)
      
      return totalLatency / qaResults.length
    })

    // Total token usage
    this.registerMetric('total_tokens', (results) => {
      return results.reduce((sum, r) => {
        const tokens = r.metrics.total_tokens as number || 0
        return sum + tokens
      }, 0)
    })

    // Pass rate (for QA cases)
    this.registerMetric('pass_rate', (results) => {
      const qaResults = results.filter(r => r.kind === 'qa')
      if (qaResults.length === 0) return 0
      
      const totalPassRate = qaResults.reduce((sum, r) => {
        return sum + (r.metrics.pass_rate as number || 0)
      }, 0)
      
      return totalPassRate / qaResults.length
    })

    // Total cost (if available)
    this.registerMetric('total_cost', (results) => {
      return results.reduce((sum, r) => {
        const cost = r.metrics.total_cost as number || 0
        return sum + cost
      }, 0)
    })
  }
}

export const defaultMetricsRegistry = new MetricsRegistry()

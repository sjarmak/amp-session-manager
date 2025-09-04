import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { BenchmarkResult, CaseResult, ModelSummary } from '../types/benchmark.js'
import { MetricsRegistry } from '../metrics/registry.js'

export interface ReportConfig {
  outputDir: string
  benchmarkName: string
  formats: ('json' | 'csv' | 'markdown' | 'html')[]
}

export class BenchmarkReporter {
  constructor(
    private metricsRegistry: MetricsRegistry,
    private config: ReportConfig
  ) {}

  async generateReport(result: BenchmarkResult): Promise<void> {
    // Ensure output directory exists
    mkdirSync(this.config.outputDir, { recursive: true })

    // Generate each requested format
    for (const format of this.config.formats) {
      switch (format) {
        case 'json':
          await this.generateJsonReport(result)
          break
        case 'csv':
          await this.generateCsvReport(result)
          break
        case 'markdown':
          await this.generateMarkdownReport(result)
          break
        case 'html':
          await this.generateHtmlReport(result)
          break
      }
    }
  }

  private async generateJsonReport(result: BenchmarkResult): Promise<void> {
    const filename = join(this.config.outputDir, `${this.config.benchmarkName}.json`)
    writeFileSync(filename, JSON.stringify(result, null, 2))
  }

  private async generateCsvReport(result: BenchmarkResult): Promise<void> {
    const filename = join(this.config.outputDir, `${this.config.benchmarkName}.csv`)
    
    // Generate CSV with case results
    const headers = [
      'case_id',
      'model',
      'kind',
      'passed',
      'duration_sec',
      'started',
      'ended'
    ]

    // Add metric columns
    const metricNames = new Set<string>()
    result.cases.forEach(c => {
      Object.keys(c.metrics).forEach(key => metricNames.add(key))
    })
    headers.push(...Array.from(metricNames).sort())

    const rows: string[] = []
    rows.push(headers.join(','))

    for (const caseResult of result.cases) {
      const row = [
        caseResult.id,
        caseResult.model,
        caseResult.kind,
        caseResult.passed.toString(),
        caseResult.duration_sec.toString(),
        caseResult.started,
        caseResult.ended
      ]

      // Add metric values
      for (const metricName of Array.from(metricNames).sort()) {
        const value = caseResult.metrics[metricName]
        row.push(value !== undefined ? value.toString() : '')
      }

      rows.push(row.join(','))
    }

    writeFileSync(filename, rows.join('\n'))
  }

  private async generateMarkdownReport(result: BenchmarkResult): Promise<void> {
    const filename = join(this.config.outputDir, `${this.config.benchmarkName}.md`)
    
    const lines: string[] = []
    
    lines.push(`# Benchmark Report: ${result.benchmark_name}`)
    lines.push('')
    lines.push(`**Started:** ${result.started}`)
    lines.push(`**Ended:** ${result.ended}`)
    lines.push(`**Duration:** ${Math.round(result.total_duration_sec)}s`)
    lines.push('')

    // Summary
    lines.push('## Summary')
    lines.push('')
    lines.push(`- **Total Cases:** ${result.summary.total_cases}`)
    lines.push(`- **Passed Cases:** ${result.summary.passed_cases}`)
    lines.push(`- **Success Rate:** ${(result.summary.success_rate * 100).toFixed(1)}%`)
    lines.push('')

    // Model comparison
    lines.push('## Model Comparison')
    lines.push('')
    lines.push('| Model | Cases | Passed | Success Rate | Avg Duration |')
    lines.push('|-------|-------|--------|--------------|--------------|')

    for (const [model, summary] of Object.entries(result.summary.by_model)) {
      lines.push(
        `| ${model} | ${summary.total_cases} | ${summary.passed_cases} | ${(summary.success_rate * 100).toFixed(1)}% | ${summary.avg_duration_sec.toFixed(1)}s |`
      )
    }
    lines.push('')

    // Detailed results by kind
    const byKind = this.groupByKind(result.cases)
    
    for (const [kind, cases] of Object.entries(byKind)) {
      lines.push(`## ${kind.toUpperCase()} Cases`)
      lines.push('')
      
      lines.push('| Case ID | Model | Passed | Duration | Key Metrics |')
      lines.push('|---------|-------|--------|----------|-------------|')
      
      for (const caseResult of cases) {
        const keyMetrics = this.formatKeyMetrics(caseResult, kind as any)
        lines.push(
          `| ${caseResult.id} | ${caseResult.model} | ${caseResult.passed ? '✅' : '❌'} | ${caseResult.duration_sec.toFixed(1)}s | ${keyMetrics} |`
        )
      }
      lines.push('')
    }

    writeFileSync(filename, lines.join('\n'))
  }

  private async generateHtmlReport(result: BenchmarkResult): Promise<void> {
    const filename = join(this.config.outputDir, `${this.config.benchmarkName}.html`)
    
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Benchmark Report: ${result.benchmark_name}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; margin: 40px; }
    .summary { background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0; }
    table { border-collapse: collapse; width: 100%; margin: 20px 0; }
    th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
    th { background: #f5f5f5; font-weight: 600; }
    .passed { color: #28a745; }
    .failed { color: #dc3545; }
    .metric-badge { display: inline-block; background: #e9ecef; padding: 2px 8px; border-radius: 4px; margin: 2px; font-size: 0.9em; }
  </style>
</head>
<body>
  <h1>Benchmark Report: ${result.benchmark_name}</h1>
  
  <div class="summary">
    <p><strong>Started:</strong> ${result.started}</p>
    <p><strong>Ended:</strong> ${result.ended}</p>
    <p><strong>Duration:</strong> ${Math.round(result.total_duration_sec)}s</p>
    <p><strong>Success Rate:</strong> ${(result.summary.success_rate * 100).toFixed(1)}%</p>
  </div>

  <h2>Model Comparison</h2>
  <table>
    <tr>
      <th>Model</th>
      <th>Cases</th>
      <th>Passed</th>
      <th>Success Rate</th>
      <th>Avg Duration</th>
    </tr>
    ${Object.entries(result.summary.by_model).map(([model, summary]) => `
    <tr>
      <td>${model}</td>
      <td>${summary.total_cases}</td>
      <td>${summary.passed_cases}</td>
      <td>${(summary.success_rate * 100).toFixed(1)}%</td>
      <td>${summary.avg_duration_sec.toFixed(1)}s</td>
    </tr>
    `).join('')}
  </table>

  <h2>All Cases</h2>
  <table>
    <tr>
      <th>Case ID</th>
      <th>Model</th>
      <th>Kind</th>
      <th>Result</th>
      <th>Duration</th>
      <th>Key Metrics</th>
    </tr>
    ${result.cases.map(c => `
    <tr>
      <td>${c.id}</td>
      <td>${c.model}</td>
      <td>${c.kind}</td>
      <td class="${c.passed ? 'passed' : 'failed'}">${c.passed ? '✅ Passed' : '❌ Failed'}</td>
      <td>${c.duration_sec.toFixed(1)}s</td>
      <td>${this.formatKeyMetricsHtml(c, c.kind)}</td>
    </tr>
    `).join('')}
  </table>
</body>
</html>
    `

    writeFileSync(filename, html)
  }

  private groupByKind(cases: CaseResult[]): Record<string, CaseResult[]> {
    const groups: Record<string, CaseResult[]> = {}
    
    for (const caseResult of cases) {
      if (!groups[caseResult.kind]) {
        groups[caseResult.kind] = []
      }
      groups[caseResult.kind].push(caseResult)
    }

    return groups
  }

  private formatKeyMetrics(caseResult: CaseResult, kind: string): string {
    const metrics: string[] = []

    switch (kind) {
      case 'qa':
        if (caseResult.metrics.pass_rate !== undefined) {
          metrics.push(`Pass: ${(caseResult.metrics.pass_rate as number * 100).toFixed(0)}%`)
        }
        if (caseResult.metrics.avg_latency_ms !== undefined) {
          metrics.push(`Latency: ${caseResult.metrics.avg_latency_ms}ms`)
        }
        break

      case 'session':
        if (caseResult.metrics.total_iterations !== undefined) {
          metrics.push(`Iterations: ${caseResult.metrics.total_iterations}`)
        }
        if (caseResult.metrics.total_tokens !== undefined) {
          metrics.push(`Tokens: ${caseResult.metrics.total_tokens}`)
        }
        break
    }

    return metrics.join(', ')
  }

  private formatKeyMetricsHtml(caseResult: CaseResult, kind: string): string {
    const metrics: string[] = []

    switch (kind) {
      case 'qa':
        if (caseResult.metrics.pass_rate !== undefined) {
          metrics.push(`<span class="metric-badge">Pass: ${(caseResult.metrics.pass_rate as number * 100).toFixed(0)}%</span>`)
        }
        if (caseResult.metrics.avg_latency_ms !== undefined) {
          metrics.push(`<span class="metric-badge">Latency: ${caseResult.metrics.avg_latency_ms}ms</span>`)
        }
        break

      case 'session':
        if (caseResult.metrics.total_iterations !== undefined) {
          metrics.push(`<span class="metric-badge">Iterations: ${caseResult.metrics.total_iterations}</span>`)
        }
        if (caseResult.metrics.total_tokens !== undefined) {
          metrics.push(`<span class="metric-badge">Tokens: ${caseResult.metrics.total_tokens}</span>`)
        }
        break
    }

    return metrics.join(' ')
  }
}

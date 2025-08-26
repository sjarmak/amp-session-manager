import { MetricsAPI, SessionMetricsSummary, IterationMetrics } from '../metrics-api';
import { Logger } from '../../utils/logger';

export interface SessionReport {
  sessionId: string;
  generatedAt: string;
  summary: SessionMetricsSummary;
  iterations: IterationMetrics[];
  insights: {
    performance: PerformanceInsights;
    costs: CostInsights;
    efficiency: EfficiencyInsights;
    recommendations: string[];
  };
  charts: ChartData[];
}

export interface PerformanceInsights {
  averageIterationTime: number;
  slowestIteration: IterationMetrics;
  fastestIteration: IterationMetrics;
  performanceTrend: 'improving' | 'declining' | 'stable';
  bottleneckTools: string[];
}

export interface CostInsights {
  totalCost: number;
  costPerIteration: number;
  mostExpensiveIteration: IterationMetrics;
  costByModel: Record<string, number>;
  costEfficiency: number; // tokens per dollar
  projectedMonthlyCost: number;
}

export interface EfficiencyInsights {
  codeProductivity: number; // LOC per hour
  testSuccessRate: number;
  toolEfficiency: Record<string, number>; // success rate by tool
  iterationSuccessRate: number;
  timeToFirstSuccess: number;
}

export interface ChartData {
  type: 'line' | 'bar' | 'pie' | 'scatter';
  title: string;
  data: any[];
  xAxis?: string;
  yAxis?: string;
}

export class SessionReportGenerator {
  private metricsAPI: MetricsAPI;
  private logger: Logger;

  constructor(metricsAPI: MetricsAPI, logger: Logger) {
    this.metricsAPI = metricsAPI;
    this.logger = logger;
  }

  async generateReport(sessionId: string): Promise<SessionReport> {
    try {
      const summary = await this.metricsAPI.getSessionSummary(sessionId);
      const iterations = await this.metricsAPI.getIterationMetrics(sessionId);

      if (!summary) {
        throw new Error(`Session ${sessionId} not found`);
      }

      const insights = this.generateInsights(summary, iterations);
      const charts = this.generateCharts(summary, iterations);

      return {
        sessionId,
        generatedAt: new Date().toISOString(),
        summary,
        iterations,
        insights,
        charts
      };

    } catch (error) {
      this.logger.error(`Error generating report for session ${sessionId}:`, error);
      throw error;
    }
  }

  async generateMarkdownReport(sessionId: string): Promise<string> {
    const report = await this.generateReport(sessionId);
    return this.formatAsMarkdown(report);
  }

  async generateHTMLReport(sessionId: string): Promise<string> {
    const report = await this.generateReport(sessionId);
    return this.formatAsHTML(report);
  }

  private generateInsights(summary: SessionMetricsSummary, iterations: IterationMetrics[]): SessionReport['insights'] {
    const performance = this.analyzePerformance(iterations);
    const costs = this.analyzeCosts(summary, iterations);
    const efficiency = this.analyzeEfficiency(summary, iterations);
    const recommendations = this.generateRecommendations(performance, costs, efficiency);

    return {
      performance,
      costs,
      efficiency,
      recommendations
    };
  }

  private analyzePerformance(iterations: IterationMetrics[]): PerformanceInsights {
    if (iterations.length === 0) {
      return {
        averageIterationTime: 0,
        slowestIteration: {} as IterationMetrics,
        fastestIteration: {} as IterationMetrics,
        performanceTrend: 'stable',
        bottleneckTools: []
      };
    }

    const avgTime = iterations.reduce((sum, iter) => sum + iter.durationMs, 0) / iterations.length;
    const slowest = iterations.reduce((max, iter) => iter.durationMs > max.durationMs ? iter : max);
    const fastest = iterations.reduce((min, iter) => iter.durationMs < min.durationMs ? iter : min);

    // Analyze trend (simple linear regression on duration)
    const trend = this.calculateTrend(iterations.map((iter, idx) => ({ x: idx, y: iter.durationMs })));
    const performanceTrend = trend > 5 ? 'declining' : trend < -5 ? 'improving' : 'stable';

    // Find bottleneck tools (tools with high failure rates or long durations)
    const toolStats = new Map<string, { failures: number; totalTime: number; calls: number }>();
    
    // Note: This would need to be expanded with actual tool call data
    const bottleneckTools: string[] = [];

    return {
      averageIterationTime: avgTime,
      slowestIteration: slowest,
      fastestIteration: fastest,
      performanceTrend,
      bottleneckTools
    };
  }

  private analyzeCosts(summary: SessionMetricsSummary, iterations: IterationMetrics[]): CostInsights {
    const totalCost = summary.totalCostUsd;
    const costPerIteration = iterations.length > 0 ? totalCost / iterations.length : 0;
    
    const mostExpensive = iterations.reduce((max, iter) => 
      iter.totalCostUsd > max.totalCostUsd ? iter : max, 
      iterations[0] || {} as IterationMetrics
    );

    const costEfficiency = totalCost > 0 ? summary.tokenUsage.totalTokens / totalCost : 0;
    
    // Project monthly cost based on session frequency
    const sessionDurationHours = summary.totalDurationMs / (1000 * 60 * 60);
    const costPerHour = sessionDurationHours > 0 ? totalCost / sessionDurationHours : 0;
    const projectedMonthlyCost = costPerHour * 8 * 22; // 8 hours/day, 22 working days

    return {
      totalCost,
      costPerIteration,
      mostExpensiveIteration: mostExpensive,
      costByModel: summary.tokenUsage.costByModel,
      costEfficiency,
      projectedMonthlyCost
    };
  }

  private analyzeEfficiency(summary: SessionMetricsSummary, iterations: IterationMetrics[]): EfficiencyInsights {
    const sessionDurationHours = summary.totalDurationMs / (1000 * 60 * 60);
    const codeProductivity = sessionDurationHours > 0 ? summary.totalLocAdded / sessionDurationHours : 0;
    
    const successfulIterations = iterations.filter(iter => iter.status === 'success').length;
    const iterationSuccessRate = iterations.length > 0 ? successfulIterations / iterations.length : 0;

    // Calculate test success rate
    const testResults = iterations.filter(iter => iter.testsResult);
    const testSuccessRate = testResults.length > 0 
      ? testResults.reduce((sum, iter) => sum + (iter.testsResult?.passRate || 0), 0) / testResults.length
      : 0;

    // Tool efficiency (would need more detailed tool data)
    const toolEfficiency: Record<string, number> = {};
    summary.toolUsage.forEach(tool => {
      toolEfficiency[tool.toolName] = tool.successRate;
    });

    // Time to first successful iteration
    const firstSuccess = iterations.find(iter => iter.status === 'success');
    const timeToFirstSuccess = firstSuccess ? firstSuccess.durationMs : 0;

    return {
      codeProductivity,
      testSuccessRate,
      toolEfficiency,
      iterationSuccessRate,
      timeToFirstSuccess
    };
  }

  private generateRecommendations(
    performance: PerformanceInsights,
    costs: CostInsights,
    efficiency: EfficiencyInsights
  ): string[] {
    const recommendations: string[] = [];

    // Performance recommendations
    if (performance.performanceTrend === 'declining') {
      recommendations.push('Performance is declining. Consider reviewing recent changes and optimizing slow operations.');
    }

    if (performance.bottleneckTools.length > 0) {
      recommendations.push(`Consider optimizing these tools: ${performance.bottleneckTools.join(', ')}`);
    }

    // Cost recommendations
    if (costs.costEfficiency < 1000) { // tokens per dollar
      recommendations.push('Cost efficiency is low. Consider using more cost-effective models for simple tasks.');
    }

    if (costs.projectedMonthlyCost > 100) {
      recommendations.push('Projected monthly cost is high. Monitor usage and consider optimization strategies.');
    }

    // Efficiency recommendations
    if (efficiency.iterationSuccessRate < 0.8) {
      recommendations.push('Iteration success rate is low. Review error patterns and improve automation.');
    }

    if (efficiency.testSuccessRate < 0.9) {
      recommendations.push('Test success rate could be improved. Focus on test quality and coverage.');
    }

    if (recommendations.length === 0) {
      recommendations.push('Performance and efficiency metrics look good. Keep up the excellent work!');
    }

    return recommendations;
  }

  private generateCharts(summary: SessionMetricsSummary, iterations: IterationMetrics[]): ChartData[] {
    const charts: ChartData[] = [];

    // Iteration performance over time
    charts.push({
      type: 'line',
      title: 'Iteration Performance Over Time',
      data: iterations.map((iter, idx) => ({
        iteration: idx + 1,
        duration: iter.durationMs / 1000, // Convert to seconds
        cost: iter.totalCostUsd,
        tokens: iter.totalTokens
      })),
      xAxis: 'iteration',
      yAxis: 'duration'
    });

    // Cost breakdown by model
    if (Object.keys(summary.tokenUsage.costByModel).length > 0) {
      charts.push({
        type: 'pie',
        title: 'Cost Breakdown by Model',
        data: Object.entries(summary.tokenUsage.costByModel).map(([model, cost]) => ({
          model,
          cost,
          percentage: (cost / summary.totalCostUsd) * 100
        }))
      });
    }

    // Tool usage statistics
    if (summary.toolUsage.length > 0) {
      charts.push({
        type: 'bar',
        title: 'Tool Usage Statistics',
        data: summary.toolUsage.map(tool => ({
          tool: tool.toolName,
          calls: tool.callCount,
          avgDuration: tool.avgDurationMs,
          successRate: tool.successRate * 100
        })),
        xAxis: 'tool',
        yAxis: 'calls'
      });
    }

    // Code changes over time
    charts.push({
      type: 'line',
      title: 'Code Changes Over Time',
      data: iterations.map((iter, idx) => ({
        iteration: idx + 1,
        filesChanged: iter.filesChanged,
        locAdded: iter.locAdded,
        locDeleted: iter.locDeleted,
        netChange: iter.locAdded - iter.locDeleted
      })),
      xAxis: 'iteration',
      yAxis: 'netChange'
    });

    return charts;
  }

  private calculateTrend(points: { x: number; y: number }[]): number {
    if (points.length < 2) return 0;

    const n = points.length;
    const sumX = points.reduce((sum, p) => sum + p.x, 0);
    const sumY = points.reduce((sum, p) => sum + p.y, 0);
    const sumXY = points.reduce((sum, p) => sum + p.x * p.y, 0);
    const sumXX = points.reduce((sum, p) => sum + p.x * p.x, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    return slope;
  }

  private formatAsMarkdown(report: SessionReport): string {
    const { summary, insights } = report;
    
    return `# Session Report: ${report.sessionId}

Generated: ${new Date(report.generatedAt).toLocaleString()}

## Summary

- **Total Iterations**: ${summary.totalIterations}
- **Success Rate**: ${(summary.successRate * 100).toFixed(1)}%
- **Total Duration**: ${(summary.totalDurationMs / 1000 / 60).toFixed(1)} minutes
- **Total Cost**: $${summary.totalCostUsd.toFixed(4)}
- **Files Changed**: ${summary.totalFilesChanged}
- **Lines Added**: +${summary.totalLocAdded}
- **Lines Deleted**: -${summary.totalLocDeleted}

## Performance Insights

- **Average Iteration Time**: ${(insights.performance.averageIterationTime / 1000).toFixed(1)}s
- **Performance Trend**: ${insights.performance.performanceTrend}
- **Slowest Iteration**: #${insights.performance.slowestIteration.iterationNumber} (${(insights.performance.slowestIteration.durationMs / 1000).toFixed(1)}s)
- **Fastest Iteration**: #${insights.performance.fastestIteration.iterationNumber} (${(insights.performance.fastestIteration.durationMs / 1000).toFixed(1)}s)

## Cost Analysis

- **Cost per Iteration**: $${insights.costs.costPerIteration.toFixed(4)}
- **Cost Efficiency**: ${insights.costs.costEfficiency.toFixed(0)} tokens/$
- **Projected Monthly Cost**: $${insights.costs.projectedMonthlyCost.toFixed(2)}

## Efficiency Metrics

- **Code Productivity**: ${insights.efficiency.codeProductivity.toFixed(1)} LOC/hour
- **Test Success Rate**: ${(insights.efficiency.testSuccessRate * 100).toFixed(1)}%
- **Iteration Success Rate**: ${(insights.efficiency.iterationSuccessRate * 100).toFixed(1)}%

## Tool Usage

${summary.toolUsage.map(tool => 
  `- **${tool.toolName}**: ${tool.callCount} calls, ${(tool.successRate * 100).toFixed(1)}% success rate, ${tool.avgDurationMs.toFixed(0)}ms avg`
).join('\n')}

## Recommendations

${insights.recommendations.map(rec => `- ${rec}`).join('\n')}

---
*Report generated by Amp Session Conductor Metrics System*
`;
  }

  private formatAsHTML(report: SessionReport): string {
    const markdown = this.formatAsMarkdown(report);
    
    // Simple markdown to HTML conversion (would use a proper library in production)
    return `<!DOCTYPE html>
<html>
<head>
  <title>Session Report: ${report.sessionId}</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; margin: 20px; }
    h1, h2 { color: #333; }
    .metric { background: #f4f4f4; padding: 10px; margin: 5px 0; border-radius: 5px; }
    .recommendation { background: #e7f3ff; padding: 10px; margin: 5px 0; border-radius: 5px; border-left: 4px solid #2196F3; }
  </style>
</head>
<body>
  <pre>${markdown}</pre>
</body>
</html>`;
  }
}

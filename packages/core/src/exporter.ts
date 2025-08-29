import { SessionStore } from './store.js';
import type { ExportOptions, ReportOptions } from '@ampsm/types';
import { writeFile, mkdir, readFile } from 'fs/promises';
import { join } from 'path';
import { MetricsAPI, SQLiteMetricsSink, costCalculator, Logger } from './metrics/index.js';

export class Exporter {
  private metricsAPI?: MetricsAPI;

  constructor(private store: SessionStore, dbPath?: string) {
    if (dbPath) {
      const logger = new Logger('Exporter');
      const sqliteSink = new SQLiteMetricsSink(dbPath, logger);
      this.metricsAPI = new MetricsAPI(sqliteSink, this.store, logger);
    }
  }

  async exportRun(options: ExportOptions): Promise<void> {
    const data = this.store.exportData(options);
    
    // Add comprehensive metrics data if available
    if (this.metricsAPI && data.sessions) {
      const enhancedData = { ...data };
      enhancedData.sessionsMetrics = [];
      
      for (const session of data.sessions) {
        try {
          const sessionMetrics = await this.metricsAPI.getSessionSummary(session.id);
          const iterationMetrics = await this.metricsAPI.getIterationMetrics(session.id);
          const toolUsage = await this.metricsAPI.getToolUsageStats(session.id);
          
          enhancedData.sessionsMetrics.push({
            sessionId: session.id,
            summary: sessionMetrics,
            iterations: iterationMetrics,
            toolUsage
          });
        } catch (error) {
          console.warn(`Failed to get metrics for session ${session.id}:`, error);
        }
      }
      
      Object.assign(data, enhancedData);
    }
    
    // Ensure output directory exists
    await mkdir(options.outDir, { recursive: true });

    switch (options.format) {
      case 'json':
        await this.exportAsJSON(data, options);
        break;
      case 'ndjson':
        await this.exportAsNDJSON(data, options);
        break;
      case 'csv':
        await this.exportAsCSV(data, options);
        break;
      default:
        throw new Error(`Unsupported format: ${options.format}`);
    }
  }

  private async exportAsJSON(data: any, options: ExportOptions) {
    const filename = options.runId ? `batch-${options.runId}.json` : 'export.json';
    const filepath = join(options.outDir, filename);
    await writeFile(filepath, JSON.stringify(data, null, 2));
    console.log(`Exported JSON to ${filepath}`);
  }

  private async exportAsNDJSON(data: any, options: ExportOptions) {
    for (const [table, rows] of Object.entries(data)) {
      if (!Array.isArray(rows)) continue;
      
      const filename = options.runId ? `${table}-${options.runId}.ndjson` : `${table}.ndjson`;
      const filepath = join(options.outDir, filename);
      const ndjsonContent = rows.map(row => JSON.stringify(row)).join('\n');
      await writeFile(filepath, ndjsonContent);
      console.log(`Exported ${table} to ${filepath}`);
    }
  }

  private async exportAsCSV(data: any, options: ExportOptions) {
    for (const [table, rows] of Object.entries(data)) {
      if (!Array.isArray(rows) || rows.length === 0) continue;
      
      // Only export CSV for iterations and tool_calls as specified
      if (table !== 'iterations' && table !== 'tool_calls') continue;
      
      const filename = options.runId ? `${table}-${options.runId}.csv` : `${table}.csv`;
      const filepath = join(options.outDir, filename);
      
      const headers = Object.keys(rows[0]);
      const csvContent = [
        headers.join(','),
        ...rows.map(row => headers.map(h => this.escapeCSV(row[h])).join(','))
      ].join('\n');
      
      await writeFile(filepath, csvContent);
      console.log(`Exported ${table} to ${filepath}`);
    }
  }

  private escapeCSV(value: any): string {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  async generateReport(options: ReportOptions): Promise<string> {
    const data = this.store.exportData({
      runId: options.runId,
      sessionIds: options.sessionIds,
      startDate: options.startDate,
      endDate: options.endDate,
      tables: ['sessions', 'iterations', 'tool_calls', 'batches', 'batch_items'],
      format: 'json',
      outDir: '/tmp' // Not used for report generation
    });

    const report = this.analyzeData(data);
    
    if (options.format === 'html') {
      return this.generateHTMLReport(report);
    } else {
      return this.generateMarkdownReport(report);
    }
  }

  private analyzeData(data: any) {
    const analysis = {
      summary: {
        totalSessions: data.sessions?.length || 0,
        totalIterations: data.iterations?.length || 0,
        totalBatches: data.batches?.length || 0,
        totalBatchItems: data.batch_items?.length || 0,
      },
      models: this.analyzeModels(data.iterations || []),
      tokens: this.analyzeTokens(data.iterations || []),
      toolUsage: this.analyzeToolUsage(data.tool_calls || []),
      performance: this.analyzePerformance(data.tool_calls || []),
      batchResults: this.analyzeBatchResults(data.batch_items || []),
    };

    return analysis;
  }

  private analyzeModels(iterations: any[]) {
    const modelStats: Record<string, { count: number; avgTokens: number; totalTokens: number }> = {};
    
    for (const iter of iterations) {
      const model = iter.model || 'unknown';
      if (!modelStats[model]) {
        modelStats[model] = { count: 0, avgTokens: 0, totalTokens: 0 };
      }
      modelStats[model].count++;
      modelStats[model].totalTokens += iter.totalTokens || 0;
    }

    // Calculate averages
    Object.values(modelStats).forEach(stats => {
      stats.avgTokens = stats.count > 0 ? Math.round(stats.totalTokens / stats.count) : 0;
    });

    return modelStats;
  }

  private analyzeTokens(iterations: any[]) {
    const totalTokens = iterations.reduce((sum, iter) => sum + (iter.totalTokens || 0), 0);
    const avgTokens = iterations.length > 0 ? Math.round(totalTokens / iterations.length) : 0;
    
    return {
      total: totalTokens,
      average: avgTokens,
      distribution: {
        prompt: iterations.reduce((sum, iter) => sum + (iter.promptTokens || 0), 0),
        completion: iterations.reduce((sum, iter) => sum + (iter.completionTokens || 0), 0),
      }
    };
  }

  private analyzeToolUsage(toolCalls: any[]) {
    const toolStats: Record<string, { count: number; successRate: number; avgDuration: number }> = {};
    
    for (const call of toolCalls) {
      const tool = call.toolName;
      if (!toolStats[tool]) {
        toolStats[tool] = { count: 0, successRate: 0, avgDuration: 0 };
      }
      toolStats[tool].count++;
    }

    // Calculate success rates and durations
    Object.entries(toolStats).forEach(([tool, stats]) => {
      const toolCallsForTool = toolCalls.filter((call: any) => call.toolName === tool);
      const successes = toolCallsForTool.filter((call: any) => call.success).length;
      stats.successRate = Math.round((successes / toolCallsForTool.length) * 100);
      
      const durationsMs = toolCallsForTool.filter((call: any) => call.durationMs).map((call: any) => call.durationMs);
      stats.avgDuration = durationsMs.length > 0 
        ? Math.round(durationsMs.reduce((sum: number, d: number) => sum + d, 0) / durationsMs.length)
        : 0;
    });

    return toolStats;
  }

  private analyzePerformance(toolCalls: any[]) {
    const slowestCalls = toolCalls
      .filter(call => call.durationMs)
      .sort((a, b) => (b.durationMs || 0) - (a.durationMs || 0))
      .slice(0, 10)
      .map(call => ({
        tool: call.toolName,
        duration: call.durationMs,
        timestamp: call.timestamp,
        success: call.success
      }));

    return { slowestCalls };
  }

  private analyzeBatchResults(batchItems: any[]) {
    const statusCounts = batchItems.reduce((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const avgDuration = batchItems
      .filter(item => item.startedAt && item.finishedAt)
      .reduce((sum, item) => {
        const start = new Date(item.startedAt!).getTime();
        const end = new Date(item.finishedAt!).getTime();
        return sum + (end - start);
      }, 0) / Math.max(1, batchItems.filter(item => item.startedAt && item.finishedAt).length);

    return {
      statusCounts,
      avgDurationMs: Math.round(avgDuration),
      totalItems: batchItems.length
    };
  }

  private generateMarkdownReport(analysis: any): string {
    return `# Batch Execution Report

## Summary
- **Total Sessions**: ${analysis.summary.totalSessions}
- **Total Iterations**: ${analysis.summary.totalIterations}
- **Total Batches**: ${analysis.summary.totalBatches}
- **Total Batch Items**: ${analysis.summary.totalBatchItems}

## Model Usage
${Object.entries(analysis.models).map(([model, stats]: [string, any]) => 
  `- **${model}**: ${stats.count} iterations, ${stats.totalTokens} tokens total, ${stats.avgTokens} avg`
).join('\n')}

## Token Analysis
- **Total Tokens**: ${analysis.tokens.total.toLocaleString()}
- **Average per Iteration**: ${analysis.tokens.average.toLocaleString()}
- **Prompt Tokens**: ${analysis.tokens.distribution.prompt.toLocaleString()}
- **Completion Tokens**: ${analysis.tokens.distribution.completion.toLocaleString()}

## Tool Usage
${Object.entries(analysis.toolUsage).map(([tool, stats]: [string, any]) => 
  `- **${tool}**: ${stats.count} calls, ${stats.successRate}% success, ${stats.avgDuration}ms avg`
).join('\n')}

## Performance
### Slowest Tool Calls
${analysis.performance.slowestCalls.map((call: any, i: number) => 
  `${i+1}. **${call.tool}** - ${call.duration}ms (${call.success ? 'success' : 'failed'})`
).join('\n')}

## Batch Results
${Object.entries(analysis.batchResults.statusCounts).map(([status, count]) => 
  `- **${status}**: ${count}`
).join('\n')}
- **Average Duration**: ${Math.round(analysis.batchResults.avgDurationMs / 1000)}s
`;
  }

  private generateHTMLReport(analysis: any): string {
    const md = this.generateMarkdownReport(analysis);
    // For now, just wrap in basic HTML - could enhance with proper markdown parser
    return `<!DOCTYPE html>
<html>
<head>
  <title>Batch Execution Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 40px; }
    h1, h2, h3 { color: #333; }
    ul { line-height: 1.6; }
    strong { color: #000; }
  </style>
</head>
<body>
  <pre style="white-space: pre-wrap; font-family: inherit;">${md}</pre>
</body>
</html>`;
  }

  async exportSession(sessionId: string, format: 'json' | 'markdown', outDir: string, includeConversation: boolean = true): Promise<string> {
    try {
      const sessionData = await this.store.exportSessionData(sessionId, includeConversation, this.metricsAPI);
    
    // Enhance with metrics data if available
    if (this.metricsAPI) {
      try {
        const sessionMetrics = await this.metricsAPI.getSessionSummary(sessionId);
        const iterationMetrics = await this.metricsAPI.getIterationMetrics(sessionId);
        const toolUsage = await this.metricsAPI.getToolUsageStats(sessionId);
        
        sessionData.detailedMetrics = {
          summary: sessionMetrics,
          iterations: iterationMetrics,
          toolUsage
        };
      } catch (error) {
        console.warn(`Failed to get detailed metrics for session ${sessionId}:`, error);
      }
    }

    // Try to include AGENT_CONTEXT files if they exist
    try {
      if (sessionData.session?.worktreePath) {
        const contextDir = join(sessionData.session.worktreePath, 'AGENT_CONTEXT');
        const contextFiles = {
          iterationLog: await this.tryReadFile(join(contextDir, 'ITERATION_LOG.md')),
          sessionMd: await this.tryReadFile(join(contextDir, 'SESSION.md')),
          diffSummary: await this.tryReadFile(join(contextDir, 'DIFF_SUMMARY.md')),
          lastStatus: await this.tryReadFile(join(contextDir, 'LAST_STATUS.json'))
        };
        sessionData.contextFiles = contextFiles;
      }
    } catch (error) {
      // Context files may not exist, that's fine
    }

    // Include YAML config if this is from a batch
    if (sessionData.batchInfo?.batchItem && sessionData.session.repoRoot) {
      try {
        // Try to find the original YAML file - this is heuristic based
        const yamlContent = await this.findYamlConfig(sessionData.batchInfo.runId, sessionData.session.repoRoot);
        if (yamlContent) {
          sessionData.batchYamlConfig = yamlContent;
        }
      } catch (error) {
        console.warn(`Could not find YAML config for batch ${sessionData.batchInfo.runId}:`, error);
      }
    }

    await mkdir(outDir, { recursive: true });

    if (format === 'json') {
      const filename = `session-${sessionId}.json`;
      const filepath = join(outDir, filename);
      await writeFile(filepath, JSON.stringify(sessionData, null, 2));
      return filepath;
    } else {
      const filename = `session-${sessionId}.md`;
      const filepath = join(outDir, filename);
      const markdown = this.generateSessionMarkdownReport(sessionData);
      await writeFile(filepath, markdown);
      return filepath;
    }
    } catch (error) {
      console.error('Error in exportSession:', error);
      throw error;
    }
  }

  private async tryReadFile(path: string): Promise<string | null> {
    try {
      return await readFile(path, 'utf-8');
    } catch {
      return null;
    }
  }

  private async findYamlConfig(runId: string, repoRoot: string): Promise<string | null> {
    // Common locations for YAML configs in eval scenarios
    const possiblePaths = [
      join(repoRoot, 'evals', `${runId}.yaml`),
      join(repoRoot, 'evals', `${runId}.yml`),
      join(repoRoot, `${runId}.yaml`),
      join(repoRoot, `${runId}.yml`),
      join(repoRoot, 'eval.yaml'),
      join(repoRoot, 'eval.yml')
    ];

    for (const path of possiblePaths) {
      const content = await this.tryReadFile(path);
      if (content) return content;
    }

    return null;
  }

  private generateSessionMarkdownReport(data: any): string {
    const session = data.session;
    const metrics = data.aggregateMetrics;
    
    let report = `# Session Export: ${session.name}

## Session Details
- **Session ID**: ${session.id}
- **Repository**: ${session.repoRoot}
- **Base Branch**: ${session.baseBranch}
- **Branch**: ${session.branchName}
- **Status**: ${session.status}
- **Mode**: ${session.mode || 'async'}
- **Created**: ${new Date(session.createdAt).toLocaleString()}
- **Last Run**: ${session.lastRun ? new Date(session.lastRun).toLocaleString() : 'Never'}
${session.modelOverride ? `- **Model Override**: ${session.modelOverride}` : ''}
${session.scriptCommand ? `- **Test Command**: ${session.scriptCommand}` : ''}

## Initial Prompt
\`\`\`
${session.ampPrompt || 'No prompt provided'}
\`\`\`

## Summary Metrics
- **Total Iterations**: ${metrics.iterationCount}
- **Total Tokens**: ${metrics.totalTokens.toLocaleString()}
- **Total Duration**: ${Math.round(metrics.totalDurationMs / 1000)}s
- **Files Modified**: ${metrics.filesModified}
- **Files Created**: ${metrics.filesCreated}
- **Tool Calls**: ${metrics.toolCallCount} (${metrics.successfulToolCalls} successful, ${metrics.failedToolCalls} failed)
`;

    // Add batch information if available
    if (data.batchInfo) {
      report += `
## Batch Information
- **Run ID**: ${data.batchInfo.runId}
- **Batch Status**: ${data.batchInfo.batchItem.status}
${data.batchInfo.batchDefaults ? `
### Batch Defaults
\`\`\`json
${JSON.stringify(data.batchInfo.batchDefaults, null, 2)}
\`\`\`
` : ''}
`;
    }

    // Add YAML config if available
    if (data.batchYamlConfig) {
      report += `
## Original YAML Configuration
\`\`\`yaml
${data.batchYamlConfig}
\`\`\`
`;
    }

    // Add iterations details
    if (data.iterations.length > 0) {
      report += `
## Iterations

| # | Start Time | Duration | Files Changed | Tokens | Test Result | Status |
|---|------------|----------|---------------|--------|-------------|---------|
`;
      data.iterations.forEach((iter: any, i: number) => {
        const duration = iter.endTime && iter.startTime 
          ? Math.round((new Date(iter.endTime).getTime() - new Date(iter.startTime).getTime()) / 1000)
          : '—';
        report += `| ${i + 1} | ${new Date(iter.startTime).toLocaleString()} | ${duration}s | ${iter.changedFiles} | ${iter.totalTokens || '—'} | ${iter.testResult || '—'} | ${iter.exitCode === 0 ? '✅' : iter.exitCode ? '❌' : '—'} |\n`;
      });
    }

    // Add conversation history
    if (data.conversation?.messages) {
      report += `
## Conversation History

`;
      data.conversation.messages.forEach((msg: any) => {
        const role = msg.role === 'user' ? '🧑‍💻 User' : msg.role === 'assistant' ? '🤖 Assistant' : '🔧 System';
        const timestamp = new Date(msg.created_at).toLocaleString();
        report += `### ${role} (${timestamp})

${msg.content}

`;
      });
    }

    // Add context files if available
    if (data.contextFiles) {
      if (data.contextFiles.iterationLog) {
        report += `
## Iteration Log
\`\`\`
${data.contextFiles.iterationLog}
\`\`\`
`;
      }
      if (data.contextFiles.sessionMd) {
        report += `
## Session Context
${data.contextFiles.sessionMd}
`;
      }
    }

    report += `
---
*Exported on ${new Date(data.exportedAt).toLocaleString()}*
`;

    return report;
  }
}

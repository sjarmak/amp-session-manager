import { Logger } from '../utils/logger';
import { SQLiteMetricsSink } from './sinks/sqlite-sink';
import { NDJSONMetricsSink } from './sinks/ndjson-sink';
import { CostCalculator, CostBreakdown } from '../cost-calculator';
import { SessionStore } from '../store';
import type { ToolCall, IterationRecord } from '@ampsm/types';

export interface FileEditStats {
  filePath: string;
  editCount: number;
  totalLinesAdded: number;
  totalLinesDeleted: number;
  operationType: 'create' | 'modify' | 'delete';
  lastModified: string;
}

export interface SessionMetricsSummary {
  sessionId: string;
  totalIterations: number;
  totalDurationMs: number;
  avgDurationMs: number;
  totalFilesChanged: number;
  totalLocAdded: number;
  totalLocDeleted: number;
  totalCostUsd: number;
  successfulIterations: number;
  successRate: number;
  firstIteration: string;
  lastIteration: string;
  tokenUsage: {
    totalPromptTokens: number;
    totalCompletionTokens: number;
    totalTokens: number;
    costBreakdown: CostBreakdown[];
    costByModel: Record<string, number>;
  };
  toolUsage: ToolUsageStats[];
  fileEdits: FileEditStats[];
  gitStats: {
    totalCommits: number;
    manualCommits: number;
    conflictEvents: number;
    mergeEvents: number;
  };
  testResults: {
    totalRuns: number;
    passRate: number;
    avgTestDuration: number;
  };
  userMessages: {
    totalMessages: number;
    messages: Array<{
      iterationId: string;
      message: string;
      timestamp: string;
    }>;
  };
}

export interface IterationMetrics {
  id: string;
  sessionId: string;
  iterationNumber: number;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  status: 'success' | 'failed' | 'awaiting-input';
  exitCode?: number;
  gitShaStart: string;
  gitShaEnd?: string;
  filesChanged: number;
  locAdded: number;
  locDeleted: number;
  totalCostUsd: number;
  toolCallsCount: number;
  toolFailures: number;
  avgToolDuration: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  testsResult?: {
    passed: number;
    failed: number;
    total: number;
    passRate: number;
  };
}

export interface ToolUsageStats {
  toolName: string;
  callCount: number;
  avgDurationMs: number;
  totalDurationMs: number;
  successRate: number;
  failureCount: number;
  totalCostUsd: number;
  p95DurationMs?: number;
}

export interface MetricsExportOptions {
  format: 'json' | 'csv' | 'xlsx';
  sessionIds?: string[];
  dateRange?: {
    start: string;
    end: string;
  };
  includeRawEvents?: boolean;
}

export interface MetricsExportResult {
  filePath: string;
  format: string;
  recordCount: number;
  fileSize: number;
}

export class MetricsAPI {
  private sqliteSink: SQLiteMetricsSink;
  private ndjsonSink?: NDJSONMetricsSink;
  private store: SessionStore;
  private logger: Logger;

  constructor(
    sqliteSink: SQLiteMetricsSink,
    store: SessionStore,
    logger: Logger,
    ndjsonSink?: NDJSONMetricsSink
  ) {
    this.sqliteSink = sqliteSink;
    this.ndjsonSink = ndjsonSink;
    this.store = store;
    this.logger = logger;
  }

  async getSessionSummary(sessionId: string): Promise<SessionMetricsSummary | null> {
    try {
      const rawSummary = this.sqliteSink.getSessionSummary(sessionId);
      if (!rawSummary) {
        return null;
      }

      const iterations = this.sqliteSink.getIterationMetrics(sessionId);
      const toolUsage = this.sqliteSink.getToolUsageStats(sessionId);
      const fileEdits = this.sqliteSink.getFileEditStats(sessionId);

      // Calculate token usage and costs
      const tokenUsage = this.calculateTokenUsageSummary(sessionId);
      const gitStats = this.calculateGitStats(sessionId);
      const testResults = this.calculateTestResults(sessionId);
      const userMessages = this.sqliteSink.getUserMessages(sessionId);

      const summary: SessionMetricsSummary = {
        sessionId,
        totalIterations: rawSummary.total_iterations,
        totalDurationMs: rawSummary.total_duration_ms || 0,
        avgDurationMs: rawSummary.avg_duration_ms || 0,
        totalFilesChanged: rawSummary.total_files_changed || 0,
        totalLocAdded: rawSummary.total_loc_added || 0,
        totalLocDeleted: rawSummary.total_loc_deleted || 0,
        totalCostUsd: rawSummary.total_cost_usd || 0,
        successfulIterations: rawSummary.successful_iterations || 0,
        successRate: rawSummary.total_iterations > 0 
          ? (rawSummary.successful_iterations || 0) / rawSummary.total_iterations 
          : 0,
        firstIteration: rawSummary.first_iteration,
        lastIteration: rawSummary.last_iteration,
        tokenUsage,
        toolUsage: toolUsage.map(this.transformToolUsageStats),
        fileEdits: fileEdits.map(this.transformFileEditStats),
        gitStats,
        testResults,
        userMessages: {
          totalMessages: userMessages.length,
          messages: userMessages
        }
      };

      return summary;

    } catch (error) {
      this.logger.error(`Error getting session summary for ${sessionId}:`, error);
      throw error;
    }
  }

  private transformRawMetrics(raw: any): IterationMetrics {
    return {
      id: raw.id,
      sessionId: raw.session_id,
      iterationNumber: raw.iteration_number,
      startedAt: raw.started_at,
      endedAt: raw.ended_at,
      durationMs: raw.duration_ms || 0,
      status: raw.status || 'success',
      exitCode: raw.exit_code,
      gitShaStart: raw.git_sha_start,
      gitShaEnd: raw.git_sha_end,
      filesChanged: raw.files_changed || 0,
      locAdded: raw.loc_added || 0,
      locDeleted: raw.loc_deleted || 0,
      totalCostUsd: raw.total_cost_usd || 0,
      toolCallsCount: raw.tool_calls_count || 0,
      toolFailures: raw.tool_failures || 0,
      avgToolDuration: raw.avg_tool_duration || 0,
      promptTokens: raw.prompt_tokens || 0,
      completionTokens: raw.completion_tokens || 0,
      totalTokens: raw.total_tokens || 0,
      testsResult: raw.total_tests ? {
        passed: raw.tests_passed || 0,
        failed: raw.tests_failed || 0,
        total: raw.total_tests,
        passRate: raw.total_tests > 0 ? (raw.tests_passed || 0) / raw.total_tests : 0
      } : undefined
    };
  }

  async getAllIterationMetrics(): Promise<IterationMetrics[]> {
    try {
      const rawMetrics = this.sqliteSink.getAllIterationMetrics();
      
      return rawMetrics.map(raw => this.transformRawMetrics(raw));
    } catch (error) {
      this.logger.error('Error getting all iteration metrics:', error);
      return [];
    }
  }

  async getIterationMetrics(sessionId: string): Promise<IterationMetrics[]> {
    try {
      const rawMetrics = this.sqliteSink.getIterationMetrics(sessionId);
      
      return rawMetrics.map(raw => this.transformRawMetrics(raw));

    } catch (error) {
      this.logger.error(`Error getting iteration metrics for ${sessionId}:`, error);
      throw error;
    }
  }

  async getToolUsageStats(sessionId: string): Promise<ToolUsageStats[]> {
    try {
      const rawStats = this.sqliteSink.getToolUsageStats(sessionId);
      return rawStats.map(this.transformToolUsageStats);
    } catch (error) {
      this.logger.error(`Error getting tool usage stats for ${sessionId}:`, error);
      throw error;
    }
  }

  async getGlobalStats(dateRange?: { start: string; end: string }): Promise<{
    totalSessions: number;
    totalIterations: number;
    totalCost: number;
    totalTokens: number;
    avgSessionDuration: number;
    mostUsedTools: ToolUsageStats[];
    costByModel: Record<string, number>;
  }> {
    try {
      // This would require additional queries across all sessions
      // For now, returning a placeholder structure
      return {
        totalSessions: 0,
        totalIterations: 0,
        totalCost: 0,
        totalTokens: 0,
        avgSessionDuration: 0,
        mostUsedTools: [],
        costByModel: {}
      };
    } catch (error) {
      this.logger.error('Error getting global stats:', error);
      throw error;
    }
  }

  async exportMetrics(sessionId: string, options: MetricsExportOptions): Promise<MetricsExportResult> {
    try {
      const summary = await this.getSessionSummary(sessionId);
      const iterations = await this.getIterationMetrics(sessionId);
      
      if (!summary) {
        throw new Error(`Session ${sessionId} not found`);
      }

      const exportData = {
        summary,
        iterations,
        exportedAt: new Date().toISOString(),
        options
      };

      // For now, export as JSON
      const filePath = `/tmp/session-${sessionId}-metrics.${options.format}`;
      
      switch (options.format) {
        case 'json':
          await this.exportAsJSON(exportData, filePath);
          break;
        case 'csv':
          await this.exportAsCSV(exportData, filePath);
          break;
        case 'xlsx':
          throw new Error('XLSX export not yet implemented');
        default:
          throw new Error(`Unsupported export format: ${options.format}`);
      }

      // Get file size
      const fs = await import('fs');
      const stats = await fs.promises.stat(filePath);

      return {
        filePath,
        format: options.format,
        recordCount: iterations.length,
        fileSize: stats.size
      };

    } catch (error) {
      this.logger.error(`Error exporting metrics for ${sessionId}:`, error);
      throw error;
    }
  }

  private calculateTokenUsageSummary(sessionId: string): SessionMetricsSummary['tokenUsage'] {
    const iterations = this.store.getIterations(sessionId);
    
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalTokens = 0;
    const costByModel: Record<string, number> = {};
    const costBreakdown: CostBreakdown[] = [];
    
    for (const iteration of iterations) {
      const promptTokens = iteration.promptTokens || 0;
      const completionTokens = iteration.completionTokens || 0;
      const iterTotalTokens = iteration.totalTokens || (promptTokens + completionTokens);
      
      totalPromptTokens += promptTokens;
      totalCompletionTokens += completionTokens;
      totalTokens += iterTotalTokens;
      
      // Calculate cost for this iteration
      if (iterTotalTokens > 0 && iteration.model) {
        const mockTelemetry = {
          promptTokens: promptTokens,
          completionTokens: completionTokens,
          totalTokens: iterTotalTokens,
          model: iteration.model,
          exitCode: iteration.exitCode || 0,
          toolCalls: []
        };
        
        const breakdown = CostCalculator.calculateCost(mockTelemetry);
        costBreakdown.push(breakdown);
        
        costByModel[iteration.model] = (costByModel[iteration.model] || 0) + breakdown.totalCost;
      }
    }
    
    return {
      totalPromptTokens,
      totalCompletionTokens,
      totalTokens,
      costBreakdown,
      costByModel
    };
  }

  private calculateGitStats(sessionId: string): SessionMetricsSummary['gitStats'] {
    // This would require additional database queries
    return {
      totalCommits: 0,
      manualCommits: 0,
      conflictEvents: 0,
      mergeEvents: 0
    };
  }

  private calculateTestResults(sessionId: string): SessionMetricsSummary['testResults'] {
    // This would require additional database queries
    return {
      totalRuns: 0,
      passRate: 0,
      avgTestDuration: 0
    };
  }

  /**
   * Get detailed tool call statistics for display
   */
  getToolCallDetails(sessionId: string, iterationId?: string): Array<{
    id: string;
    sessionId: string;
    iterationId: string;
    timestamp: string;
    toolName: string;
    args: Record<string, any>;
    success: boolean;
    durationMs: number | null;
    formattedDuration: string;
    formattedArgs: string;
  }> {
    const toolCalls = this.store.getToolCalls(sessionId, iterationId);
    
    return toolCalls.map((call: ToolCall) => ({
      id: call.id,
      sessionId: call.sessionId,
      iterationId: call.iterationId,
      timestamp: call.timestamp,
      toolName: call.toolName,
      args: call.argsJson ? JSON.parse(call.argsJson) : {},
      success: call.success,
      durationMs: call.durationMs || null,
      formattedDuration: call.durationMs ? `${call.durationMs}ms` : 'N/A',
      formattedArgs: this.formatToolArgs(call.argsJson)
    }));
  }

  /**
   * Get cost breakdown for a session with formatting
   */
  getCostBreakdown(sessionId: string): {
    totalCost: string;
    totalTokens: string;
    costByModel: Array<{
      model: string;
      cost: string;
      tokens: string;
      percentage: number;
    }>;
    averageCostPerIteration: string;
  } {
    const tokenUsage = this.calculateTokenUsageSummary(sessionId);
    const totalCost = Object.values(tokenUsage.costByModel).reduce((sum, cost) => sum + cost, 0);
    const totalTokens = tokenUsage.totalTokens;
    const iterations = this.store.getIterations(sessionId);
    
    const costByModel = Object.entries(tokenUsage.costByModel).map(([model, cost]) => ({
      model,
      cost: CostCalculator.formatCost(cost),
      tokens: CostCalculator.formatTokens(tokenUsage.totalTokens), // This should be per-model but we don't have that breakdown
      percentage: totalCost > 0 ? (cost / totalCost) * 100 : 0
    }));

    return {
      totalCost: CostCalculator.formatCost(totalCost),
      totalTokens: CostCalculator.formatTokens(totalTokens),
      costByModel,
      averageCostPerIteration: CostCalculator.formatCost(
        iterations.length > 0 ? totalCost / iterations.length : 0
      )
    };
  }

  /**
   * Get line change statistics for display
   */
  getLineChangeStats(sessionId: string): Array<{
    iterationId: string;
    iterationNumber: number;
    filesChanged: number;
    linesAdded: number;
    linesDeleted: number;
    netChange: number;
    timestamp: string;
  }> {
    const iterations = this.store.getIterations(sessionId);
    
    return iterations.map((iteration: IterationRecord, index: number) => ({
      iterationId: iteration.id,
      iterationNumber: index + 1,
      filesChanged: iteration.changedFiles || 0,
      linesAdded: 0, // TODO: Add linesAdded to IterationRecord
      linesDeleted: 0, // TODO: Add linesDeleted to IterationRecord  
      netChange: 0, // TODO: Calculate from actual line changes
      timestamp: iteration.startTime
    }));
  }

  private formatToolArgs(argsJson: string | null): string {
    if (!argsJson) return '{}';
    
    try {
      const args = JSON.parse(argsJson);
      // Format common argument patterns for better readability
      if (args.path) {
        const pathParts = args.path.split('/');
        args.path = pathParts.length > 3 ? `.../${pathParts.slice(-2).join('/')}` : args.path;
      }
      if (args.pattern && args.pattern.length > 30) {
        args.pattern = args.pattern.substring(0, 30) + '...';
      }
      return JSON.stringify(args, null, 0);
    } catch {
      return argsJson.substring(0, 50) + (argsJson.length > 50 ? '...' : '');
    }
  }

  private transformToolUsageStats(raw: any): ToolUsageStats {
    return {
      toolName: raw.tool_name,
      callCount: raw.call_count,
      avgDurationMs: raw.avg_duration_ms || 0,
      totalDurationMs: raw.total_duration_ms || 0,
      successRate: raw.call_count > 0 
        ? 1 - (raw.failure_count || 0) / raw.call_count 
        : 0,
      failureCount: raw.failure_count || 0,
      totalCostUsd: raw.total_cost_usd || 0
    };
  }

  private transformFileEditStats(raw: any): FileEditStats {
    return {
      filePath: raw.file_path,
      editCount: raw.edit_count || 0,
      totalLinesAdded: raw.total_lines_added || 0,
      totalLinesDeleted: raw.total_lines_deleted || 0,
      operationType: raw.operation_type || 'modify',
      lastModified: raw.last_modified
    };
  }

  private async exportAsJSON(data: any, filePath: string): Promise<void> {
    const fs = await import('fs');
    await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2));
  }

  private async exportAsCSV(data: any, filePath: string): Promise<void> {
    const fs = await import('fs');
    
    // Flatten iterations data for CSV
    const csvHeaders = [
      'sessionId', 'iterationNumber', 'startedAt', 'endedAt', 'durationMs',
      'status', 'filesChanged', 'locAdded', 'locDeleted', 'totalCostUsd',
      'toolCallsCount', 'toolFailures', 'promptTokens', 'completionTokens'
    ];

    const csvRows = data.iterations.map((iteration: IterationMetrics) => [
      iteration.sessionId,
      iteration.iterationNumber,
      iteration.startedAt,
      iteration.endedAt,
      iteration.durationMs,
      iteration.status,
      iteration.filesChanged,
      iteration.locAdded,
      iteration.locDeleted,
      iteration.totalCostUsd,
      iteration.toolCallsCount,
      iteration.toolFailures,
      iteration.promptTokens,
      iteration.completionTokens
    ]);

    const csvContent = [
      csvHeaders.join(','),
      ...csvRows.map((row: any) => row.map((cell: any) => 
        typeof cell === 'string' && cell.includes(',') 
          ? `"${cell.replace(/"/g, '""')}"` 
          : cell
      ).join(','))
    ].join('\n');

    await fs.promises.writeFile(filePath, csvContent);
  }

  // Real-time metrics methods
  async getSessionProgress(sessionId: string): Promise<{
    currentIteration: number;
    totalIterations: number;
    progress: number;
    estimatedCompletion?: string;
    currentStatus: string;
  }> {
    try {
      const iterations = await this.getIterationMetrics(sessionId);
      const latest = iterations[iterations.length - 1];
      
      this.logger.info(`Getting session progress for ${sessionId}: found ${iterations.length} iterations, latest: ${latest?.id}`);
      
      if (!latest) {
        return {
          currentIteration: 0,
          totalIterations: 0,
          progress: 0,
          currentStatus: 'not-started'
        };
      }

      // Get real-time metrics from NDJSON sink if available
      const realtimeMetrics = this.getRealtimeMetricsFromSink(sessionId, latest.id);

      return {
        currentIteration: latest.iterationNumber,
        totalIterations: iterations.length,
        progress: latest.status === 'success' ? 100 : 50,
        currentStatus: latest.status
      };

    } catch (error) {
      this.logger.error(`Error getting session progress for ${sessionId}:`, error);
      throw error;
    }
  }

  private getRealtimeMetricsFromSink(sessionId: string, iterationId: string) {
    if (!this.ndjsonSink || typeof this.ndjsonSink.getRealtimeSessionMetrics !== 'function') {
      return undefined;
    }

    const metrics = this.ndjsonSink.getRealtimeSessionMetrics(sessionId, iterationId);
    if (!metrics) return undefined;

    return {
      tokensGenerated: metrics.tokenUsage.totalTokens,
      activeTools: metrics.activeTools,
      costAccrued: this.calculateRealtimeCost(metrics.tokenUsage),
      timeElapsed: metrics.tokenUsage.lastUpdate ? 
        Date.now() - new Date(metrics.tokenUsage.lastUpdate).getTime() : 0
    };
  }

  private calculateRealtimeCost(tokenUsage: any): number {
    // Simple cost calculation - could be enhanced with model-specific pricing
    const promptCost = (tokenUsage.promptTokens || 0) * 0.01 / 1000; // $0.01 per 1K prompt tokens
    const completionCost = (tokenUsage.completionTokens || 0) * 0.03 / 1000; // $0.03 per 1K completion tokens
    return promptCost + completionCost;
  }

  async getRealtimeMetrics(sessionId?: string): Promise<{
    tokensPerSecond: number;
    costPerMinute: number;
    filesChangedPerIteration: number;
    averageToolResponseTime: number;
    currentTokens: number;
    currentCost: number;
    activeTools: Array<{
      toolName: string;
      startTime: string;
      args?: any;
    }>;
    completedTools: Array<{
      toolName: string;
      durationMs: number;
      success: boolean;
      startTime: string;
      endTime: string;
      args?: any;
    }>;
    modelBreakdown: Record<string, {
      tokens: number;
      cost: number;
      callCount: number;
    }>;
  }> {
    try {
      // If no specific session provided, get metrics from all sessions
      const iterations = sessionId 
        ? await this.getIterationMetrics(sessionId)
        : await this.getAllIterationMetrics();
      
      this.logger.info(`Getting realtime metrics for ${sessionId || 'all sessions'}: found ${iterations.length} iterations`);
      
      if (iterations.length === 0) {
        return {
          tokensPerSecond: 0,
          costPerMinute: 0,
          filesChangedPerIteration: 0,
          averageToolResponseTime: 0,
          currentTokens: 0,
          currentCost: 0,
          activeTools: [],
          completedTools: [],
          modelBreakdown: {}
        };
      }

      const totalDurationSeconds = iterations.reduce((sum, iter) => sum + iter.durationMs, 0) / 1000;
      const totalTokens = iterations.reduce((sum, iter) => sum + iter.totalTokens, 0);
      const totalCost = iterations.reduce((sum, iter) => sum + iter.totalCostUsd, 0);
      const totalFiles = iterations.reduce((sum, iter) => sum + iter.filesChanged, 0);
      const totalToolTime = iterations.reduce((sum, iter) => sum + (iter.avgToolDuration * iter.toolCallsCount), 0);
      const totalToolCalls = iterations.reduce((sum, iter) => sum + iter.toolCallsCount, 0);

      // Get tool call information from the latest iteration
      const latestIteration = iterations[iterations.length - 1];
      let completedTools: any[] = [];
      let modelBreakdown: Record<string, any> = {};

      if (latestIteration) {
        // Extract tool information from metrics if available
        // For now, create mock data based on available metrics
        // TODO: Parse actual tool calls from metrics when available
        completedTools = [];

        // Build model breakdown from iteration data
        modelBreakdown = {
          'gpt-4': {
            tokens: totalTokens,
            cost: totalCost,
            callCount: iterations.length
          }
        };
      }

      return {
        tokensPerSecond: totalDurationSeconds > 0 ? totalTokens / totalDurationSeconds : 0,
        costPerMinute: totalDurationSeconds > 0 ? (totalCost / totalDurationSeconds) * 60 : 0,
        filesChangedPerIteration: iterations.length > 0 ? totalFiles / iterations.length : 0,
        averageToolResponseTime: totalToolCalls > 0 ? totalToolTime / totalToolCalls : 0,
        currentTokens: totalTokens,
        currentCost: totalCost,
        activeTools: [], // Would need real-time tracking
        completedTools,
        modelBreakdown
      };

    } catch (error) {
      this.logger.error(`Error getting realtime metrics for ${sessionId}:`, error);
      throw error;
    }
  }


}

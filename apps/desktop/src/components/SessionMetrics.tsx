import React, { useState, useEffect } from 'react';

interface SessionMetricsProps {
  sessionId: string;
  className?: string;
}

interface MetricsSummary {
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
  tokenUsage: {
    totalPromptTokens: number;
    totalCompletionTokens: number;
    totalTokens: number;
    costByModel: Record<string, number>;
  };
  toolUsage: Array<{
    toolName: string;
    callCount: number;
    avgDurationMs: number;
    successRate: number;
  }>;
}

interface RealtimeMetrics {
  tokensPerSecond: number;
  costPerMinute: number;
  filesChangedPerIteration: number;
  averageToolResponseTime: number;
}

interface SessionProgress {
  currentIteration: number;
  totalIterations: number;
  progress: number;
  currentStatus: string;
}

export const SessionMetrics: React.FC<SessionMetricsProps> = ({ sessionId, className }) => {
  const [summary, setSummary] = useState<MetricsSummary | null>(null);
  const [realtimeMetrics, setRealtimeMetrics] = useState<RealtimeMetrics | null>(null);
  const [progress, setProgress] = useState<SessionProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = async () => {
    try {
      setLoading(true);
      setError(null);

      const [summaryResult, realtimeResult, progressResult] = await Promise.all([
        window.electronAPI.metrics.getSessionSummary(sessionId),
        window.electronAPI.metrics.getRealtimeMetrics(sessionId),
        window.electronAPI.metrics.getSessionProgress(sessionId)
      ]);

      if (summaryResult.success) {
        setSummary(summaryResult.summary);
      } else {
        console.warn('Failed to fetch summary:', summaryResult.error);
      }

      if (realtimeResult.success) {
        setRealtimeMetrics(realtimeResult.metrics);
      } else {
        console.warn('Failed to fetch realtime metrics:', realtimeResult.error);
      }

      if (progressResult.success) {
        setProgress(progressResult.progress);
      } else {
        console.warn('Failed to fetch progress:', progressResult.error);
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch metrics');
      console.error('Error fetching metrics:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      const result = await window.electronAPI.metrics.exportMetrics(sessionId, {
        format: 'json',
        includeRawEvents: true
      });

      if (result.success) {
        console.log('Metrics exported successfully:', result.result);
        // Could show a success notification here
      } else {
        console.error('Export failed:', result.error);
      }
    } catch (err) {
      console.error('Export error:', err);
    }
  };

  useEffect(() => {
    fetchMetrics();
    
    // Refresh metrics every 10 seconds
    const interval = setInterval(fetchMetrics, 10000);
    
    return () => clearInterval(interval);
  }, [sessionId]);

  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}min`;
  };

  const formatCost = (cost: number): string => {
    if (cost < 0.001) return `$${(cost * 1000).toFixed(1)}k`;
    return `$${cost.toFixed(4)}`;
  };

  const getStatusBadgeStyle = (status: string) => {
    switch (status) {
      case 'success':
        return 'text-green-600 bg-green-50 border border-green-200';
      case 'error':
        return 'text-red-600 bg-red-50 border border-red-200';
      case 'awaiting-input':
        return 'text-yellow-600 bg-yellow-50 border border-yellow-200';
      default:
        return 'text-gray-600 bg-gray-50 border border-gray-200';
    }
  };

  if (loading && !summary) {
    return (
      <div className={`p-6 ${className}`}>
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className={`p-6 ${className}`}>
        <div className="bg-white rounded-lg border">
          <div className="p-6">
            <p className="text-sm text-gray-500">
              {error || 'No metrics data available yet'}
            </p>
            <button
              onClick={fetchMetrics}
              className="mt-2 px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header with Export */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Session Metrics</h3>
        <button
          onClick={handleExport}
          className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 transition-colors flex items-center gap-2"
        >
          📥 Export
        </button>
      </div>

      {/* Progress */}
      {progress && (
        <div className="bg-white rounded-lg border">
          <div className="p-4 border-b">
            <h4 className="text-sm font-medium">Progress</h4>
          </div>
          <div className="p-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Iteration {progress.currentIteration} of {progress.totalIterations}</span>
                <span className={`px-2 py-1 rounded text-xs ${getStatusBadgeStyle(progress.currentStatus)}`}>
                  {progress.currentStatus}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                  style={{ width: `${progress.progress}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center space-x-2">
            <span className="text-blue-500">⏱️</span>
            <div>
              <p className="text-xs text-gray-500">Duration</p>
              <p className="text-lg font-semibold">{formatDuration(summary.totalDurationMs)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center space-x-2">
            <span className="text-green-500">💰</span>
            <div>
              <p className="text-xs text-gray-500">Total Cost</p>
              <p className="text-lg font-semibold">{formatCost(summary.totalCostUsd)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center space-x-2">
            <span className="text-purple-500">📝</span>
            <div>
              <p className="text-xs text-gray-500">Lines Changed</p>
              <p className="text-lg font-semibold">
                +{summary.totalLocAdded} -{summary.totalLocDeleted}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center space-x-2">
            <span className="text-orange-500">🧪</span>
            <div>
              <p className="text-xs text-gray-500">Success Rate</p>
              <p className="text-lg font-semibold">{(summary.successRate * 100).toFixed(1)}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Token Usage */}
      <div className="bg-white rounded-lg border">
        <div className="p-4 border-b">
          <h4 className="text-sm font-medium">Token Usage</h4>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Prompt Tokens</p>
              <p className="font-medium">{summary.tokenUsage.totalPromptTokens.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-gray-500">Completion Tokens</p>
              <p className="font-medium">{summary.tokenUsage.totalCompletionTokens.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-gray-500">Total Tokens</p>
              <p className="font-medium">{summary.tokenUsage.totalTokens.toLocaleString()}</p>
            </div>
          </div>
          
          {Object.keys(summary.tokenUsage.costByModel).length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-medium mb-2">Cost by Model</p>
              <div className="space-y-1">
                {Object.entries(summary.tokenUsage.costByModel).map(([model, cost]) => (
                  <div key={model} className="flex justify-between text-sm">
                    <span className="text-gray-500">{model}</span>
                    <span className="font-medium">{formatCost(cost)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Realtime Metrics */}
      {realtimeMetrics && (
        <div className="bg-white rounded-lg border">
          <div className="p-4 border-b">
            <h4 className="text-sm font-medium flex items-center">
              <span className="mr-2">⚡</span>
              Real-time Performance
            </h4>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-gray-500">Tokens/sec</p>
                <p className="font-medium">{realtimeMetrics.tokensPerSecond.toFixed(1)}</p>
              </div>
              <div>
                <p className="text-gray-500">Cost/min</p>
                <p className="font-medium">{formatCost(realtimeMetrics.costPerMinute)}</p>
              </div>
              <div>
                <p className="text-gray-500">Files/iter</p>
                <p className="font-medium">{realtimeMetrics.filesChangedPerIteration.toFixed(1)}</p>
              </div>
              <div>
                <p className="text-gray-500">Avg Tool Time</p>
                <p className="font-medium">{formatDuration(realtimeMetrics.averageToolResponseTime)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tool Usage */}
      {summary.toolUsage.length > 0 && (
        <div className="bg-white rounded-lg border">
          <div className="p-4 border-b">
            <h4 className="text-sm font-medium">Tool Usage</h4>
          </div>
          <div className="p-4">
            <div className="space-y-3">
              {summary.toolUsage.slice(0, 5).map((tool) => (
                <div key={tool.toolName} className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-medium">{tool.toolName}</span>
                      <span className="text-xs text-gray-500">
                        {tool.callCount} calls • {(tool.successRate * 100).toFixed(1)}% success
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">
                      Avg: {formatDuration(tool.avgDurationMs)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

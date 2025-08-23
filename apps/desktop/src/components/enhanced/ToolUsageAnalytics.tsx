import React, { useState, useEffect } from 'react';

interface ToolUsageAnalyticsProps {
  sessionId: string;
  className?: string;
}

interface ToolCall {
  id: string;
  toolName: string;
  startTime: string;
  endTime: string;
  durationMs: number;
  success: boolean;
  args: any;
  result?: any;
  errorMessage?: string;
  iterationId: string;
}

interface ToolAnalytics {
  toolName: string;
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  successRate: number;
  avgDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  p95DurationMs: number;
  totalDurationMs: number;
  recentCalls: ToolCall[];
  errorPatterns: Array<{
    error: string;
    count: number;
    percentage: number;
  }>;
  performanceTrend: 'improving' | 'degrading' | 'stable';
  utilizationScore: number; // 0-100 based on frequency and success
}

interface StreamingToolAnalytics {
  tools: ToolAnalytics[];
  activeCalls: ToolCall[];
  totalCalls: number;
  overallSuccessRate: number;
  mostUsedTool: string;
  slowestTool: string;
  fastestTool: string;
  recentFailures: ToolCall[];
  performanceMetrics: {
    avgResponseTime: number;
    throughput: number; // calls per minute
    errorRate: number;
  };
}

export const ToolUsageAnalytics: React.FC<ToolUsageAnalyticsProps> = ({ 
  sessionId, 
  className 
}) => {
  const [analytics, setAnalytics] = useState<StreamingToolAnalytics | null>(null);
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'overview' | 'detailed'>('overview');
  const [sortBy, setSortBy] = useState<'calls' | 'success' | 'duration'>('calls');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        setLoading(true);
        setError(null);

        // Placeholder for enhanced method - will be properly implemented  
        const result = await (window.electronAPI.metrics as any).getStreamingToolAnalytics?.(sessionId) || 
                      { success: false, error: 'Method not implemented yet' };
        
        if (result.success) {
          setAnalytics(result.analytics);
        } else {
          setError(result.error || 'Failed to fetch tool analytics');
        }

      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch tool analytics');
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
    
    // Update every 3 seconds for real-time analytics
    const interval = setInterval(fetchAnalytics, 3000);
    
    return () => clearInterval(interval);
  }, [sessionId]);

  const formatDuration = (ms: number | undefined): string => {
    const safeMs = ms || 0;
    if (safeMs < 1000) return `${safeMs}ms`;
    if (safeMs < 60000) return `${(safeMs / 1000).toFixed(1)}s`;
    return `${(safeMs / 60000).toFixed(1)}min`;
  };

  const getSuccessRateColor = (rate: number): string => {
    if (rate >= 95) return 'text-green-600 bg-green-50';
    if (rate >= 80) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  const getPerformanceTrendIcon = (trend: string): string => {
    switch (trend) {
      case 'improving': return '📈';
      case 'degrading': return '📉';
      default: return '➡️';
    }
  };

  const getSortedTools = (): ToolAnalytics[] => {
    if (!analytics) return [];
    
    return [...(analytics?.tools || [])].sort((a, b) => {
      switch (sortBy) {
        case 'calls':
          return b.totalCalls - a.totalCalls;
        case 'success':
          return b.successRate - a.successRate;
        case 'duration':
          return b.avgDurationMs - a.avgDurationMs;
        default:
          return 0;
      }
    });
  };

  if (loading) {
    return (
      <div className={`p-6 ${className}`}>
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !analytics) {
    return (
      <div className={`p-6 ${className}`}>
        <div className="bg-white rounded-lg border p-6">
          <p className="text-sm text-gray-500">
            {error || 'No tool analytics available'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold flex items-center">
          <span className="mr-2">🔧</span>
          Tool Usage Analytics
          {(analytics?.activeCalls?.length || 0) > 0 && (
            <span className="ml-2 text-xs text-yellow-600 bg-yellow-50 px-2 py-1 rounded">
              {analytics?.activeCalls?.length || 0} active
            </span>
          )}
        </h3>
        <div className="flex items-center space-x-2">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'calls' | 'success' | 'duration')}
            className="text-xs border rounded px-2 py-1"
          >
            <option value="calls">Sort by Calls</option>
            <option value="success">Sort by Success</option>
            <option value="duration">Sort by Duration</option>
          </select>
          <div className="flex space-x-1">
            <button
              onClick={() => setViewMode('overview')}
              className={`text-xs px-2 py-1 rounded ${
                viewMode === 'overview' 
                  ? 'bg-blue-100 text-blue-800' 
                  : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setViewMode('detailed')}
              className={`text-xs px-2 py-1 rounded ${
                viewMode === 'detailed' 
                  ? 'bg-blue-100 text-blue-800' 
                  : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              Detailed
            </button>
          </div>
        </div>
      </div>

      {/* Performance Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500">Total Calls</span>
            <div className="w-1 h-1 bg-blue-500 rounded-full animate-pulse"></div>
          </div>
          <p className="text-xl font-bold">{analytics?.totalCalls || 0}</p>
          <p className="text-xs text-gray-400">
            {(analytics?.performanceMetrics?.throughput || 0).toFixed(1)}/min
          </p>
        </div>

        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500">Success Rate</span>
          </div>
          <p className="text-xl font-bold">{(analytics?.overallSuccessRate || 0).toFixed(1)}%</p>
          <p className="text-xs text-gray-400">
            {(analytics?.performanceMetrics?.errorRate || 0).toFixed(1)}% errors
          </p>
        </div>

        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500">Avg Response</span>
          </div>
          <p className="text-xl font-bold">
            {formatDuration(analytics?.performanceMetrics?.avgResponseTime)}
          </p>
          <p className="text-xs text-gray-400">response time</p>
        </div>

        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500">Active Tools</span>
          </div>
          <p className="text-xl font-bold">{analytics?.tools?.length || 0}</p>
          <p className="text-xs text-gray-400">
            {analytics?.activeCalls?.length || 0} running
          </p>
        </div>
      </div>

      {/* Quick Insights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border p-4">
          <h4 className="text-sm font-medium text-blue-600 mb-2">🏆 Most Used</h4>
          <p className="text-lg font-bold">{analytics?.mostUsedTool || 'N/A'}</p>
          <p className="text-xs text-gray-500">
            {analytics?.tools?.find(t => t.toolName === analytics?.mostUsedTool)?.totalCalls || 0} calls
          </p>
        </div>

        <div className="bg-white rounded-lg border p-4">
          <h4 className="text-sm font-medium text-green-600 mb-2">⚡ Fastest</h4>
          <p className="text-lg font-bold">{analytics?.fastestTool || 'N/A'}</p>
          <p className="text-xs text-gray-500">
            {formatDuration(analytics?.tools?.find(t => t.toolName === analytics?.fastestTool)?.avgDurationMs || 0)} avg
          </p>
        </div>

        <div className="bg-white rounded-lg border p-4">
          <h4 className="text-sm font-medium text-red-600 mb-2">🐌 Slowest</h4>
          <p className="text-lg font-bold">{analytics?.slowestTool || 'N/A'}</p>
          <p className="text-xs text-gray-500">
            {formatDuration(analytics?.tools?.find(t => t.toolName === analytics?.slowestTool)?.avgDurationMs || 0)} avg
          </p>
        </div>
      </div>

      {/* Tool List */}
      <div className="bg-white rounded-lg border">
        <div className="p-4 border-b">
          <h4 className="text-sm font-medium flex items-center">
            <span className="mr-2">📊</span>
            Tool Performance
          </h4>
        </div>
        <div className="p-4">
          <div className="space-y-2">
            {getSortedTools().slice(0, viewMode === 'overview' ? 10 : 50).map((tool) => {
              const isActive = analytics?.activeCalls?.some(call => call.toolName === tool.toolName) || false;
              
              return (
                <div 
                  key={tool.toolName}
                  className={`p-3 rounded border cursor-pointer transition-colors ${
                    selectedTool === tool.toolName ? 'bg-blue-50 border-blue-200' : 'hover:bg-gray-50'
                  }`}
                  onClick={() => setSelectedTool(selectedTool === tool.toolName ? null : tool.toolName)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <span className="text-sm font-medium">{tool.toolName}</span>
                      {isActive && (
                        <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
                      )}
                      <span className={`text-xs px-2 py-1 rounded ${getSuccessRateColor(tool.successRate)}`}>
                        {(tool?.successRate || 0).toFixed(0)}%
                      </span>
                      <span className="text-xs text-gray-500">
                        {getPerformanceTrendIcon(tool.performanceTrend)}
                      </span>
                    </div>
                    <div className="flex items-center space-x-4 text-xs text-gray-500">
                      <span>{tool.totalCalls} calls</span>
                      <span>{formatDuration(tool.avgDurationMs)} avg</span>
                      <span className={`px-2 py-1 rounded ${
                        tool.utilizationScore > 80 ? 'bg-green-100 text-green-700' :
                        tool.utilizationScore > 50 ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {tool.utilizationScore}% util
                      </span>
                    </div>
                  </div>
                  
                  {/* Performance bar */}
                  <div className="mt-2 flex items-center space-x-2">
                    <div className="flex-1 bg-gray-100 rounded-full h-1">
                      <div 
                        className="bg-green-500 h-1 rounded-full"
                        style={{ width: `${tool.successRate}%` }}
                      ></div>
                    </div>
                    <span className="text-xs text-gray-500 w-16">
                      {tool.successfulCalls}/{tool.totalCalls}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tool Detail Drill-down */}
      {selectedTool && (
        <div className="bg-white rounded-lg border">
          <div className="p-4 border-b">
            <h4 className="text-sm font-medium flex items-center justify-between">
              <span className="flex items-center">
                <span className="mr-2">🔍</span>
                {selectedTool} Details
              </span>
              <button
                onClick={() => setSelectedTool(null)}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </h4>
          </div>
          <div className="p-4">
            {(() => {
              const tool = analytics?.tools?.find(t => t.toolName === selectedTool);
              if (!tool) return null;

              return (
                <div className="space-y-4">
                  {/* Performance Metrics */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center">
                      <p className="text-lg font-bold text-blue-600">{tool.totalCalls}</p>
                      <p className="text-xs text-gray-500">Total Calls</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-green-600">{formatDuration(tool.avgDurationMs)}</p>
                      <p className="text-xs text-gray-500">Avg Duration</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-orange-600">{formatDuration(tool.p95DurationMs)}</p>
                      <p className="text-xs text-gray-500">95th Percentile</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-purple-600">{tool.utilizationScore}%</p>
                      <p className="text-xs text-gray-500">Utilization</p>
                    </div>
                  </div>

                  {/* Error Patterns */}
                  {(tool?.errorPatterns?.length || 0) > 0 && (
                    <div>
                      <h5 className="text-sm font-medium mb-2">Common Errors</h5>
                      <div className="space-y-1">
                        {(tool?.errorPatterns || []).slice(0, 5).map((pattern, index) => (
                          <div key={index} className="flex justify-between items-center text-xs">
                            <span className="text-gray-700 truncate">{pattern.error}</span>
                            <div className="flex items-center space-x-2">
                              <span className="text-gray-500">{pattern.count}x</span>
                              <span className="text-red-600">{(pattern?.percentage || 0).toFixed(1)}%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recent Calls */}
                  <div>
                    <h5 className="text-sm font-medium mb-2">Recent Calls</h5>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {tool.recentCalls.slice(0, 10).map((call) => (
                        <div 
                          key={call.id} 
                          className="p-2 bg-gray-50 rounded text-xs border-l-2 border-gray-300"
                          style={{
                            borderLeftColor: call.success ? '#10b981' : '#ef4444'
                          }}
                        >
                          <div className="flex justify-between items-center mb-1">
                            <span className={call.success ? 'text-green-600' : 'text-red-600'}>
                              {call.success ? '✓' : '✗'} {formatDuration(call.durationMs)}
                            </span>
                            <span className="text-gray-500">
                              {new Date(call.endTime).toLocaleTimeString()}
                            </span>
                          </div>
                          {call.args && (
                            <div className="text-gray-600 mb-1">
                              <strong>Args:</strong> {JSON.stringify(call.args, null, 0).slice(0, 100)}...
                            </div>
                          )}
                          {call.errorMessage && (
                            <div className="text-red-600">
                              <strong>Error:</strong> {call.errorMessage}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Recent Failures */}
      {(analytics?.recentFailures?.length || 0) > 0 && (
        <div className="bg-white rounded-lg border">
          <div className="p-4 border-b">
            <h4 className="text-sm font-medium flex items-center">
              <span className="mr-2">⚠️</span>
              Recent Failures
              <span className="ml-2 text-xs text-red-600 bg-red-50 px-2 py-1 rounded">
                {analytics?.recentFailures?.length || 0} failures
              </span>
            </h4>
          </div>
          <div className="p-4">
            <div className="space-y-2">
              {(analytics?.recentFailures || []).slice(0, 5).map((failure) => (
                <div key={failure.id} className="p-2 bg-red-50 rounded text-xs border-l-2 border-red-400">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-medium">{failure.toolName}</span>
                    <span className="text-gray-500">
                      {new Date(failure.endTime).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="text-red-700">
                    {failure.errorMessage || 'Unknown error'}
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

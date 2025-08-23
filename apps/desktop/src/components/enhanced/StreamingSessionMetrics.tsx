import React, { useState, useEffect, useRef } from 'react';

interface StreamingSessionMetricsProps {
  sessionId: string;
  className?: string;
}

interface StreamingEvent {
  type: 'tool_start' | 'tool_finish' | 'token_usage' | 'model_change' | 'iteration_start' | 'iteration_end' | 'output' | 'error';
  timestamp: string;
  data: any;
}

interface RealtimeMetrics {
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
}

interface SessionProgress {
  currentIteration: number;
  totalIterations: number;
  progress: number;
  currentStatus: string;
  estimatedCompletion?: string;
  realtimeMetrics?: RealtimeMetrics;
}

interface TimelineEvent {
  id: string;
  timestamp: string;
  type: 'tool_start' | 'tool_finish' | 'token_usage' | 'model_change' | 'iteration_start' | 'iteration_end' | 'output' | 'error';
  data: any;
  duration?: number;
}

export const StreamingSessionMetrics: React.FC<StreamingSessionMetricsProps> = ({ 
  sessionId, 
  className 
}) => {
  const [progress, setProgress] = useState<SessionProgress | null>(null);
  const [realtimeMetrics, setRealtimeMetrics] = useState<RealtimeMetrics | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const eventListenerRef = useRef<((event: MessageEvent) => void) | null>(null);
  const metricsIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Real-time event handler
  const handleStreamingEvent = (event: StreamingEvent) => {
    const timelineEvent: TimelineEvent = {
      id: `${event.type}-${Date.now()}-${Math.random()}`,
      timestamp: event.timestamp,
      type: event.type,
      data: event.data
    };

    setTimeline(prev => [...prev.slice(-99), timelineEvent]); // Keep last 100 events
    
    // Update real-time metrics based on event
    setRealtimeMetrics(prev => {
      if (!prev) return null;
      
      const updated = { ...prev };
      
      switch (event.type) {
        case 'token_usage':
          updated.currentTokens += event.data.totalTokens || 0;
          updated.currentCost += event.data.cost || 0;
          
          const model = event.data.model || 'unknown';
          if (!updated.modelBreakdown[model]) {
            updated.modelBreakdown[model] = { tokens: 0, cost: 0, callCount: 0 };
          }
          updated.modelBreakdown[model].tokens += event.data.totalTokens || 0;
          updated.modelBreakdown[model].cost += event.data.cost || 0;
          updated.modelBreakdown[model].callCount += 1;
          break;
          
        case 'tool_start':
          updated.activeTools.push({
            toolName: event.data.toolName,
            startTime: event.timestamp,
            args: event.data.args
          });
          break;
          
        case 'tool_finish':
          const toolIndex = updated.activeTools.findIndex(t => t.toolName === event.data.toolName);
          if (toolIndex !== -1) {
            const startedTool = updated.activeTools[toolIndex];
            updated.activeTools.splice(toolIndex, 1);
            
            updated.completedTools.push({
              toolName: event.data.toolName,
              durationMs: event.data.durationMs,
              success: event.data.success,
              startTime: startedTool.startTime,
              endTime: event.timestamp,
              args: startedTool.args
            });
            
            // Keep only last 50 completed tools
            if (updated.completedTools.length > 50) {
              updated.completedTools = updated.completedTools.slice(-50);
            }
          }
          break;
      }
      
      return updated;
    });
  };

  // Setup streaming event listener
  useEffect(() => {
    const setupEventListener = async () => {
      try {
        // Check if session is currently running
        const session = await window.electronAPI.sessions.get(sessionId);
        if (session && 
            ['running', 'awaiting-input'].includes(session.status)) {
          setIsLive(true);
          
          // Setup real-time event listener
          const listener = (event: MessageEvent) => {
            if (event.data.type === 'streaming-event' && event.data.sessionId === sessionId) {
              handleStreamingEvent(event.data.event);
            }
          };
          
          window.addEventListener('message', listener);
          eventListenerRef.current = listener;
        }
      } catch (err) {
        console.error('Error setting up event listener:', err);
      }
    };

    setupEventListener();

    return () => {
      if (eventListenerRef.current) {
        window.removeEventListener('message', eventListenerRef.current);
      }
    };
  }, [sessionId]);

  // Fetch initial metrics and setup polling
  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        setLoading(true);
        setError(null);

        const [progressResult, metricsResult] = await Promise.allSettled([
          window.electronAPI.metrics.getSessionProgress(sessionId),
          window.electronAPI.metrics.getRealtimeMetrics(sessionId)
        ]);

        const progressRes = progressResult.status === 'fulfilled' ? progressResult.value : { success: false, error: progressResult.reason?.message };
        const metricsRes = metricsResult.status === 'fulfilled' ? metricsResult.value : { success: false, error: metricsResult.reason?.message };

        if (progressRes.success && 'progress' in progressRes) {
          setProgress(progressRes.progress);
        }

        if (metricsRes.success && 'metrics' in metricsRes) {
          setRealtimeMetrics(metricsRes.metrics);
        }

      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch metrics');
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
    
    // Setup polling for non-live sessions or as fallback
    metricsIntervalRef.current = setInterval(fetchMetrics, isLive ? 2000 : 10000);
    
    return () => {
      if (metricsIntervalRef.current) {
        clearInterval(metricsIntervalRef.current);
      }
    };
  }, [sessionId, isLive]);

  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}min`;
  };

  const formatCost = (cost: number | undefined): string => {
    return `$${(cost || 0).toFixed(4)}`;
  };

  const getToolSuccessRate = (toolName: string): number => {
    if (!realtimeMetrics?.completedTools) return 0;
    const toolCalls = realtimeMetrics.completedTools.filter(t => t.toolName === toolName);
    if (toolCalls.length === 0) return 0;
    const successful = toolCalls.filter(t => t.success).length;
    return (successful / toolCalls.length) * 100;
  };

  const getUniqueTools = (): string[] => {
    if (!realtimeMetrics) return [];
    const tools = new Set([
      ...(realtimeMetrics.activeTools || []).map(t => t.toolName),
      ...(realtimeMetrics.completedTools || []).map(t => t.toolName)
    ]);
    return Array.from(tools);
  };

  if (loading && !progress) {
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

  if (error || !progress) {
    return (
      <div className={`p-6 ${className}`}>
        <div className="bg-white rounded-lg border">
          <div className="p-6">
            <p className="text-sm text-gray-500">
              {error || 'No metrics data available yet'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header with Live Indicator */}
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <h3 className="text-lg font-semibold">Real-time Session Metrics</h3>
          {isLive && (
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-sm text-green-600 font-medium">LIVE</span>
            </div>
          )}
        </div>
      </div>

      {/* Real-time Progress */}
      <div className="bg-white rounded-lg border">
        <div className="p-4 border-b">
          <h4 className="text-sm font-medium flex items-center">
            <span className="mr-2">📊</span>
            Session Progress
            {progress.estimatedCompletion && (
              <span className="ml-2 text-xs text-gray-500">
                ETA: {new Date(progress.estimatedCompletion).toLocaleTimeString()}
              </span>
            )}
          </h4>
        </div>
        <div className="p-4">
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span>Iteration {progress.currentIteration}</span>
              <span className={`px-2 py-1 rounded text-xs ${
                progress.currentStatus === 'running' ? 'text-blue-600 bg-blue-50' :
                progress.currentStatus === 'success' ? 'text-green-600 bg-green-50' :
                progress.currentStatus === 'error' ? 'text-red-600 bg-red-50' :
                'text-yellow-600 bg-yellow-50'
              }`}>
                {progress.currentStatus}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div 
                className="bg-blue-600 h-3 rounded-full transition-all duration-500" 
                style={{ width: `${progress?.progress || 0}%` }}
              ></div>
            </div>
            <div className="text-xs text-gray-500 text-center">
              {(progress?.progress || 0).toFixed(1)}% complete
            </div>
          </div>
        </div>
      </div>

      {/* Real-time Metrics Dashboard */}
      {realtimeMetrics && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg border p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500">Current Tokens</span>
              {isLive && <div className="w-1 h-1 bg-green-500 rounded-full animate-pulse"></div>}
            </div>
            <p className="text-lg font-semibold">{(realtimeMetrics?.currentTokens || 0).toLocaleString()}</p>
            <p className="text-xs text-gray-400">{(realtimeMetrics?.tokensPerSecond || 0).toFixed(1)}/sec</p>
          </div>

          <div className="bg-white rounded-lg border p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500">Current Cost</span>
              {isLive && <div className="w-1 h-1 bg-green-500 rounded-full animate-pulse"></div>}
            </div>
            <p className="text-lg font-semibold">{formatCost(realtimeMetrics?.currentCost)}</p>
            <p className="text-xs text-gray-400">{formatCost(realtimeMetrics?.costPerMinute)}/min</p>
          </div>

          <div className="bg-white rounded-lg border p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500">Active Tools</span>
              {(realtimeMetrics?.activeTools?.length || 0) > 0 && (
                <div className="w-1 h-1 bg-yellow-500 rounded-full animate-pulse"></div>
              )}
            </div>
            <p className="text-lg font-semibold">{realtimeMetrics?.activeTools?.length || 0}</p>
            <p className="text-xs text-gray-400">
              {formatDuration(realtimeMetrics?.averageToolResponseTime || 0)} avg
            </p>
          </div>

          <div className="bg-white rounded-lg border p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500">Files/Iter</span>
            </div>
            <p className="text-lg font-semibold">
              {(realtimeMetrics?.filesChangedPerIteration || 0).toFixed(1)}
            </p>
            <p className="text-xs text-gray-400">avg changes</p>
          </div>
        </div>
      )}

      {/* Model Breakdown */}
      {realtimeMetrics?.modelBreakdown && Object.keys(realtimeMetrics.modelBreakdown).length > 0 && (
        <div className="bg-white rounded-lg border">
          <div className="p-4 border-b">
            <h4 className="text-sm font-medium flex items-center">
              <span className="mr-2">🤖</span>
              Model Usage Breakdown
            </h4>
          </div>
          <div className="p-4">
            <div className="space-y-3">
              {Object.entries(realtimeMetrics?.modelBreakdown || {}).map(([model, stats]) => (
                <div key={model} className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-medium">{model}</span>
                      <span className="text-xs text-gray-500">
                        {stats.callCount} calls
                      </span>
                    </div>
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>{(stats?.tokens || 0).toLocaleString()} tokens</span>
                      <span>{formatCost(stats.cost)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tool Usage Analytics */}
      {realtimeMetrics && getUniqueTools().length > 0 && (
        <div className="bg-white rounded-lg border">
          <div className="p-4 border-b">
            <h4 className="text-sm font-medium flex items-center">
              <span className="mr-2">🔧</span>
              Tool Usage Analytics
              {(realtimeMetrics?.activeTools?.length || 0) > 0 && (
                <span className="ml-2 text-xs text-yellow-600 bg-yellow-50 px-2 py-1 rounded">
                  {realtimeMetrics?.activeTools?.length || 0} active
                </span>
              )}
            </h4>
          </div>
          <div className="p-4">
            <div className="space-y-3">
              {getUniqueTools().slice(0, 10).map((toolName) => {
                const completed = realtimeMetrics.completedTools.filter(t => t.toolName === toolName);
                const active = realtimeMetrics.activeTools.find(t => t.toolName === toolName);
                const successRate = getToolSuccessRate(toolName);
                const avgDuration = completed.length > 0 
                  ? completed.reduce((sum, t) => sum + t.durationMs, 0) / completed.length 
                  : 0;

                return (
                  <div 
                    key={toolName} 
                    className={`p-3 rounded border cursor-pointer transition-colors ${
                      selectedTool === toolName ? 'bg-blue-50 border-blue-200' : 'hover:bg-gray-50'
                    }`}
                    onClick={() => setSelectedTool(selectedTool === toolName ? null : toolName)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium">{toolName}</span>
                        {active && (
                          <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
                        )}
                      </div>
                      <div className="flex items-center space-x-4 text-xs text-gray-500">
                        <span>{completed.length} calls</span>
                        <span className={successRate === 100 ? 'text-green-600' : 'text-yellow-600'}>
                          {(successRate || 0).toFixed(0)}% success
                        </span>
                        {avgDuration > 0 && (
                          <span>{formatDuration(avgDuration)} avg</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Tool Call Drill-down */}
      {selectedTool && realtimeMetrics && (
        <div className="bg-white rounded-lg border">
          <div className="p-4 border-b">
            <h4 className="text-sm font-medium flex items-center">
              <span className="mr-2">🔍</span>
              {selectedTool} Call Details
              <button
                onClick={() => setSelectedTool(null)}
                className="ml-auto text-xs text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </h4>
          </div>
          <div className="p-4 max-h-96 overflow-y-auto">
            <div className="space-y-2">
              {realtimeMetrics.completedTools
                .filter(t => t.toolName === selectedTool)
                .slice(-10)
                .map((call, index) => (
                  <div key={`${call.startTime}-${index}`} className="p-2 bg-gray-50 rounded text-xs">
                    <div className="flex justify-between items-center mb-1">
                      <span className={call.success ? 'text-green-600' : 'text-red-600'}>
                        {call.success ? '✓' : '✗'} {formatDuration(call.durationMs)}
                      </span>
                      <span className="text-gray-500">
                        {new Date(call.endTime).toLocaleTimeString()}
                      </span>
                    </div>
                    {call.args && (
                      <pre className="text-gray-600 whitespace-pre-wrap break-all mt-1">
                        {JSON.stringify(call.args, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Real-time Timeline */}
      <div className="bg-white rounded-lg border">
        <div className="p-4 border-b">
          <h4 className="text-sm font-medium flex items-center">
            <span className="mr-2">⏱️</span>
            Live Event Timeline
            <span className="ml-2 text-xs text-gray-500">
              {timeline.length} events
            </span>
          </h4>
        </div>
        <div className="p-4 max-h-64 overflow-y-auto">
          <div className="space-y-2">
            {timeline.slice(-20).reverse().map((event) => {
              const getEventIcon = (type: string) => {
                switch (type) {
                  case 'tool_start': return '🚀';
                  case 'tool_finish': return '✅';
                  case 'token_usage': return '🎯';
                  case 'model_info': return '🤖';
                  case 'error': return '❌';
                  default: return '📝';
                }
              };

              return (
                <div key={event.id} className="flex items-center space-x-3 py-1 border-b border-gray-100 last:border-b-0">
                  <span>{getEventIcon(event.type)}</span>
                  <div className="flex-1">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-medium">
                        {event.type.replace('_', ' ')}
                        {event.data.toolName && `: ${event.data.toolName}`}
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(event.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    {(event.data.totalTokens || event.data.durationMs || event.data.model) && (
                      <div className="text-xs text-gray-500">
                        {event.data.totalTokens && `${event.data.totalTokens} tokens`}
                        {event.data.durationMs && ` • ${formatDuration(event.data.durationMs)}`}
                        {event.data.model && ` • ${event.data.model}`}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

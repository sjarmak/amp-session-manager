import React, { useState, useEffect, useRef } from 'react';

interface SessionTimelineVisualizationProps {
  sessionId: string;
  className?: string;
}

interface TimelineEvent {
  id: string;
  timestamp: string;
  type: 'iteration_start' | 'iteration_end' | 'tool_start' | 'tool_finish' | 'token_usage' | 'model_change' | 'error' | 'user_input';
  data: any;
  duration?: number;
  iterationId?: string;
  children?: TimelineEvent[];
}

interface StreamingTimelineData {
  events: TimelineEvent[];
  totalDuration: number;
  currentTime: number;
  sessionStatus: 'idle' | 'running' | 'paused' | 'completed' | 'error';
  iterations: Array<{
    id: string;
    startTime: string;
    endTime?: string;
    status: 'running' | 'completed' | 'error';
    toolCalls: number;
    tokensUsed: number;
  }>;
  realtimeEvents: TimelineEvent[];
}

export const SessionTimelineVisualization: React.FC<SessionTimelineVisualizationProps> = ({ 
  sessionId, 
  className 
}) => {
  const [timelineData, setTimelineData] = useState<StreamingTimelineData | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);
  const [viewMode, setViewMode] = useState<'full' | 'iteration' | 'tools'>('full');
  const [autoScroll, setAutoScroll] = useState(true);
  const [timeScale, setTimeScale] = useState<'linear' | 'logarithmic'>('linear');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const timelineRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef<boolean>(autoScroll);

  // Update auto-scroll ref when state changes
  useEffect(() => {
    autoScrollRef.current = autoScroll;
  }, [autoScroll]);

  useEffect(() => {
    const fetchTimelineData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Placeholder for enhanced method - will be properly implemented
        const result = await (window.electronAPI.metrics as any).getSessionTimeline?.(sessionId) || 
                      { success: false, error: 'Method not implemented yet' };
        
        if (result.success) {
          setTimelineData(result.timeline);
          
          // Auto-scroll to latest events if enabled
          if (autoScrollRef.current && timelineRef.current) {
            timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
          }
        } else {
          setError(result.error || 'Failed to fetch timeline data');
        }

      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch timeline data');
      } finally {
        setLoading(false);
      }
    };

    fetchTimelineData();
    
    // Update every 2 seconds for real-time timeline
    const interval = setInterval(fetchTimelineData, 2000);
    
    return () => clearInterval(interval);
  }, [sessionId]);

  const formatTime = (timestamp: string): string => {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
  };

  const formatDuration = (ms: number | undefined): string => {
    const safeMs = ms || 0;
    if (safeMs < 1000) return `${safeMs}ms`;
    if (safeMs < 60000) return `${(safeMs / 1000).toFixed(1)}s`;
    return `${(safeMs / 60000).toFixed(1)}min`;
  };

  const getEventIcon = (event: TimelineEvent): string => {
    switch (event.type) {
      case 'iteration_start': return '🚀';
      case 'iteration_end': return '🏁';
      case 'tool_start': return '⚡';
      case 'tool_finish': return '✅';
      case 'token_usage': return '🎯';
      case 'model_change': return '🤖';
      case 'error': return '❌';
      case 'user_input': return '👤';
      default: return '📝';
    }
  };

  const getEventColor = (event: TimelineEvent): string => {
    switch (event.type) {
      case 'iteration_start': return 'border-l-blue-500 bg-blue-50';
      case 'iteration_end': return 'border-l-green-500 bg-green-50';
      case 'tool_start': return 'border-l-yellow-500 bg-yellow-50';
      case 'tool_finish': return 'border-l-emerald-500 bg-emerald-50';
      case 'token_usage': return 'border-l-purple-500 bg-purple-50';
      case 'model_change': return 'border-l-indigo-500 bg-indigo-50';
      case 'error': return 'border-l-red-500 bg-red-50';
      case 'user_input': return 'border-l-orange-500 bg-orange-50';
      default: return 'border-l-gray-500 bg-gray-50';
    }
  };

  const getFilteredEvents = (): TimelineEvent[] => {
    if (!timelineData) return [];
    
    switch (viewMode) {
      case 'iteration':
        return timelineData.events.filter(e => 
          e.type === 'iteration_start' || e.type === 'iteration_end'
        );
      case 'tools':
        return timelineData.events.filter(e => 
          e.type === 'tool_start' || e.type === 'tool_finish'
        );
      default:
        return timelineData.events;
    }
  };

  const calculateTimelinePosition = (timestamp: string): number => {
    if (!timelineData?.events || timelineData.events.length === 0) return 0;
    
    const startTime = new Date(timelineData.events[0].timestamp).getTime();
    const currentTime = new Date(timestamp).getTime();
    const totalDuration = timelineData.totalDuration || 1;
    
    const position = ((currentTime - startTime) / totalDuration) * 100;
    return Math.max(0, Math.min(100, position));
  };

  const getSessionProgress = (): number => {
    if (!timelineData?.iterations) return 0;
    
    const completedIterations = timelineData.iterations.filter(i => i.status === 'completed').length;
    const totalIterations = timelineData.iterations.length;
    
    return totalIterations > 0 ? (completedIterations / totalIterations) * 100 : 0;
  };

  if (loading) {
    return (
      <div className={`p-6 ${className}`}>
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !timelineData) {
    return (
      <div className={`p-6 ${className}`}>
        <div className="bg-white rounded-lg border p-6">
          <p className="text-sm text-gray-500">
            {error || 'No timeline data available'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <h3 className="text-lg font-semibold">Session Timeline</h3>
          <div className={`px-2 py-1 text-xs rounded-full ${
            timelineData.sessionStatus === 'running' ? 'bg-green-100 text-green-800' :
            timelineData.sessionStatus === 'completed' ? 'bg-blue-100 text-blue-800' :
            timelineData.sessionStatus === 'error' ? 'bg-red-100 text-red-800' :
            'bg-gray-100 text-gray-800'
          }`}>
            {timelineData.sessionStatus}
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <div className="flex space-x-1">
            {(['full', 'iteration', 'tools'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`text-xs px-2 py-1 rounded ${
                  viewMode === mode 
                    ? 'bg-blue-100 text-blue-800' 
                    : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
          
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`text-xs px-2 py-1 rounded ${
              autoScroll 
                ? 'bg-green-100 text-green-800' 
                : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            Auto-scroll: {autoScroll ? 'On' : 'Off'}
          </button>
        </div>
      </div>

      {/* Progress Overview */}
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium">Session Progress</h4>
          <span className="text-xs text-gray-500">
            {(timelineData?.iterations || []).filter(i => i.status === 'completed').length} / {timelineData?.iterations?.length || 0} iterations
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
          <div 
            className="bg-blue-600 h-2 rounded-full transition-all duration-500"
            style={{ width: `${getSessionProgress()}%` }}
          ></div>
        </div>
        <div className="flex justify-between text-xs text-gray-500">
          <span>Started: {formatTime(timelineData.events[0]?.timestamp)}</span>
          {timelineData.totalDuration > 0 && (
            <span>Duration: {formatDuration(timelineData.totalDuration)}</span>
          )}
        </div>
      </div>

      {/* Iteration Overview */}
      <div className="bg-white rounded-lg border">
        <div className="p-4 border-b">
          <h4 className="text-sm font-medium">Iterations</h4>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {timelineData.iterations.map((iteration, index) => {
              const duration = iteration.endTime 
                ? new Date(iteration.endTime).getTime() - new Date(iteration.startTime).getTime()
                : Date.now() - new Date(iteration.startTime).getTime();
              
              return (
                <div 
                  key={iteration.id}
                  className={`p-3 rounded border-l-4 ${
                    iteration.status === 'completed' ? 'border-l-green-500 bg-green-50' :
                    iteration.status === 'error' ? 'border-l-red-500 bg-red-50' :
                    'border-l-yellow-500 bg-yellow-50'
                  }`}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-medium">Iteration {index + 1}</span>
                    <div className={`w-2 h-2 rounded-full ${
                      iteration.status === 'completed' ? 'bg-green-500' :
                      iteration.status === 'error' ? 'bg-red-500' :
                      'bg-yellow-500 animate-pulse'
                    }`}></div>
                  </div>
                  <div className="text-xs text-gray-600">
                    <div>Tools: {iteration.toolCalls}</div>
                    <div>Tokens: {(iteration?.tokensUsed || 0).toLocaleString()}</div>
                    <div>Duration: {formatDuration(duration)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Timeline Events */}
      <div className="bg-white rounded-lg border">
        <div className="p-4 border-b">
          <h4 className="text-sm font-medium flex items-center">
            <span className="mr-2">⏱️</span>
            Event Timeline
            <span className="ml-2 text-xs text-gray-500">
              {getFilteredEvents().length} events
            </span>
          </h4>
        </div>
        <div 
          ref={timelineRef}
          className="p-4 max-h-96 overflow-y-auto"
        >
          <div className="space-y-3">
            {getFilteredEvents().map((event, index) => {
              const isSelected = selectedEvent?.id === event.id;
              
              return (
                <div 
                  key={`${event.id}-${index}`}
                  className={`p-3 rounded border-l-4 cursor-pointer transition-colors ${
                    getEventColor(event)
                  } ${
                    isSelected ? 'ring-2 ring-blue-300' : 'hover:shadow-sm'
                  }`}
                  onClick={() => setSelectedEvent(isSelected ? null : event)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <span className="text-lg">{getEventIcon(event)}</span>
                      <div>
                        <div className="text-sm font-medium">
                          {event.type.replace('_', ' ')}
                          {event.data.toolName && `: ${event.data.toolName}`}
                          {event.data.model && `: ${event.data.model}`}
                        </div>
                        <div className="text-xs text-gray-500">
                          {formatTime(event.timestamp)}
                          {event.duration && ` • ${formatDuration(event.duration)}`}
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-xs text-gray-500">
                      {event.data.tokens && `${event.data.tokens} tokens`}
                      {event.data.cost && ` • $${(event.data.cost || 0).toFixed(4)}`}
                    </div>
                  </div>
                  
                  {/* Expanded event details */}
                  {isSelected && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        <div>
                          <strong>Event ID:</strong> {event.id}
                        </div>
                        {event.iterationId && (
                          <div>
                            <strong>Iteration:</strong> {event.iterationId}
                          </div>
                        )}
                        {event.data.args && (
                          <div className="md:col-span-2">
                            <strong>Arguments:</strong>
                            <pre className="mt-1 p-2 bg-gray-100 rounded text-xs overflow-x-auto">
                              {JSON.stringify(event.data.args, null, 2)}
                            </pre>
                          </div>
                        )}
                        {event.data.result && (
                          <div className="md:col-span-2">
                            <strong>Result:</strong>
                            <pre className="mt-1 p-2 bg-gray-100 rounded text-xs overflow-x-auto">
                              {JSON.stringify(event.data.result, null, 2)}
                            </pre>
                          </div>
                        )}
                        {event.data.error && (
                          <div className="md:col-span-2">
                            <strong>Error:</strong>
                            <div className="mt-1 p-2 bg-red-100 rounded text-red-700 text-xs">
                              {event.data.error}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Live Events Stream */}
      {timelineData.realtimeEvents.length > 0 && (
        <div className="bg-white rounded-lg border">
          <div className="p-4 border-b">
            <h4 className="text-sm font-medium flex items-center">
              <span className="mr-2">📡</span>
              Live Events
              <div className="ml-2 w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            </h4>
          </div>
          <div className="p-4 max-h-48 overflow-y-auto">
            <div className="space-y-2">
              {timelineData.realtimeEvents.slice(-10).reverse().map((event, index) => (
                <div 
                  key={`live-${event.id}-${index}`}
                  className="flex items-center space-x-3 py-2 border-b border-gray-100 last:border-b-0"
                >
                  <span>{getEventIcon(event)}</span>
                  <div className="flex-1">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-medium">
                        {event.type.replace('_', ' ')}
                        {event.data.toolName && `: ${event.data.toolName}`}
                      </span>
                      <span className="text-xs text-gray-500">
                        {formatTime(event.timestamp)}
                      </span>
                    </div>
                    {(event.data.tokens || event.duration) && (
                      <div className="text-xs text-gray-500">
                        {event.data.tokens && `${event.data.tokens} tokens`}
                        {event.duration && ` • ${formatDuration(event.duration)}`}
                      </div>
                    )}
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

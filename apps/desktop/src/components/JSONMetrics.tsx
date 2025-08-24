import React, { useState, useEffect } from 'react';

interface JSONMetricsProps {
  sessionId: string;
  className?: string;
}

interface ParsedStreamMetrics {
  assistantMessages: Array<{
    timestamp: string;
    content: string;
    model: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  }>;
  sessionResults: Array<{
    timestamp: string;
    result: string;
    duration_ms: number;
    num_turns: number;
    is_error: boolean;
  }>;
  toolUsage: Array<{
    toolName: string;
    timestamp: string;
    args?: any;
  }>;
  totalTokens: {
    input: number;
    output: number;
    cacheCreation: number;
    cacheRead: number;
    total: number;
  };
  models: string[];
  filesModified: string[];
}

export function JSONMetrics({ sessionId, className = '' }: JSONMetricsProps) {
  const [metrics, setMetrics] = useState<ParsedStreamMetrics | null>(null);
  const [rawStreamData, setRawStreamData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStreamMetrics = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Try to get real stream events first
        const streamEventsResult = await window.electronAPI.sessions.getStreamEvents(sessionId);
        
        let jsonEvents: any[] = [];
        
        if (streamEventsResult.success && streamEventsResult.streamEvents && streamEventsResult.streamEvents.length > 0) {
          // Use real stream events if available
          jsonEvents = streamEventsResult.streamEvents.map(event => ({
            type: event.type,
            timestamp: event.timestamp,
            ...event.data
          }));
        } else {
          // Fallback to synthetic events from iterations and tool calls
          const [iterationsResult, toolCallsResult] = await Promise.all([
            window.electronAPI.sessions.getIterations(sessionId),
            window.electronAPI.sessions.getToolCalls(sessionId)
          ]);
          
          if (!iterationsResult.success || !toolCallsResult.success) {
            throw new Error(iterationsResult.error || toolCallsResult.error || 'Failed to load session data');
          }
          
          const iterations = iterationsResult.iterations || [];
          const toolCalls = toolCallsResult.toolCalls || [];
        
        // Add iteration events
        for (const iteration of iterations) {
          if (iteration.output) {
            jsonEvents.push({
              type: 'assistant',
              message: {
                content: [{ type: 'text', text: iteration.output }],
                model: iteration.model || 'unknown',
                usage: {
                  input_tokens: iteration.promptTokens || 0,
                  output_tokens: iteration.completionTokens || 0,
                  total_tokens: (iteration.promptTokens || 0) + (iteration.completionTokens || 0)
                }
              }
            });
          }
          
          if (iteration.endedAt && iteration.startedAt) {
            jsonEvents.push({
              type: 'result',
              result: iteration.output || '',
              duration_ms: new Date(iteration.endedAt).getTime() - new Date(iteration.startedAt).getTime(),
              num_turns: 1,
              is_error: !iteration.success
            });
          }
        }
        
          // Add tool call events
          for (const toolCall of toolCalls) {
            jsonEvents.push({
              type: 'assistant',
              message: {
                content: [{ 
                  type: 'tool_use', 
                  name: toolCall.toolName,
                  input: toolCall.args 
                }],
                model: 'unknown'
              }
            });
          }
        }
        
        setRawStreamData(jsonEvents);
        
        // Parse metrics from JSON events
        const parsedMetrics: ParsedStreamMetrics = {
          assistantMessages: [],
          sessionResults: [],
          toolUsage: [],
          totalTokens: { input: 0, output: 0, cacheCreation: 0, cacheRead: 0, total: 0 },
          models: [],
          filesModified: []
        };
        
        for (const event of jsonEvents) {
          switch (event.type) {
            case 'assistant_message':
              // Handle real stream events
              parsedMetrics.assistantMessages.push({
                timestamp: event.timestamp || new Date().toISOString(),
                content: event.content || '',
                model: event.model || 'unknown',
                usage: event.usage
              });
              
              // Extract token usage from real stream events
              if (event.usage) {
                parsedMetrics.totalTokens.input += event.usage.input_tokens || 0;
                parsedMetrics.totalTokens.output += event.usage.output_tokens || 0;
                parsedMetrics.totalTokens.cacheCreation += event.usage.cache_creation_input_tokens || 0;
                parsedMetrics.totalTokens.cacheRead += event.usage.cache_read_input_tokens || 0;
                parsedMetrics.totalTokens.total = parsedMetrics.totalTokens.input + parsedMetrics.totalTokens.output;
              }
              
              // Track models from real stream events
              if (event.model && !parsedMetrics.models.includes(event.model)) {
                parsedMetrics.models.push(event.model);
              }
              
              // Extract tools from assistant message events
              if (event.tools && Array.isArray(event.tools)) {
                event.tools.forEach((toolName: string) => {
                  parsedMetrics.toolUsage.push({
                    toolName: toolName,
                    timestamp: event.timestamp || new Date().toISOString(),
                    args: {}
                  });
                });
              }
              break;
              
            case 'token_usage':
              // Handle real token usage events
              if (event.totalTokens !== undefined) {
                parsedMetrics.totalTokens.input += event.promptTokens || 0;
                parsedMetrics.totalTokens.output += event.completionTokens || 0;
                parsedMetrics.totalTokens.total += event.totalTokens || 0;
              }
              if (event.model && !parsedMetrics.models.includes(event.model)) {
                parsedMetrics.models.push(event.model);
              }
              break;
              
            case 'model_change':
              // Handle model change events
              if (event.model && !parsedMetrics.models.includes(event.model)) {
                parsedMetrics.models.push(event.model);
              }
              break;
              
            case 'tool_start':
            case 'tool_finish':
            case 'streaming_tool_start':
            case 'streaming_tool_finish':
              // Handle real tool usage events
              parsedMetrics.toolUsage.push({
                toolName: event.toolName || event.tool || event.data?.tool,
                timestamp: event.timestamp || new Date().toISOString(),
                args: event.args || event.data?.args || {}
              });
              break;
              
            case 'session_result':
              parsedMetrics.sessionResults.push({
                timestamp: event.timestamp || new Date().toISOString(),
                result: event.result || '',
                duration_ms: event.durationMs || event.duration_ms || 0,
                num_turns: event.numTurns || event.num_turns || 0,
                is_error: event.isError || event.is_error || false
              });
              break;
              
            case 'assistant':
              // Handle fallback synthetic events
              if (event.message) {
                parsedMetrics.assistantMessages.push({
                  timestamp: event.timestamp || new Date().toISOString(),
                  content: event.message.content
                    ?.filter((item: any) => item.type === 'text')
                    ?.map((item: any) => item.text)
                    ?.join('') || '',
                  model: event.message.model || 'unknown',
                  usage: event.message.usage
                });
                
                // Extract token usage
                if (event.message.usage) {
                  parsedMetrics.totalTokens.input += event.message.usage.input_tokens || 0;
                  parsedMetrics.totalTokens.output += event.message.usage.output_tokens || 0;
                  parsedMetrics.totalTokens.cacheCreation += event.message.usage.cache_creation_input_tokens || 0;
                  parsedMetrics.totalTokens.cacheRead += event.message.usage.cache_read_input_tokens || 0;
                  parsedMetrics.totalTokens.total = parsedMetrics.totalTokens.input + parsedMetrics.totalTokens.output;
                }
                
                // Track models
                if (event.message.model && !parsedMetrics.models.includes(event.message.model)) {
                  parsedMetrics.models.push(event.message.model);
                }
                
                // Extract tool usage from message content
                if (event.message.content && Array.isArray(event.message.content)) {
                  event.message.content.forEach((item: any) => {
                    if (item.type === 'tool_use') {
                      parsedMetrics.toolUsage.push({
                        toolName: item.name,
                        timestamp: event.timestamp || new Date().toISOString(),
                        args: item.input
                      });
                    }
                  });
                }
              }
              break;
              
            case 'result':
              parsedMetrics.sessionResults.push({
                timestamp: event.timestamp || new Date().toISOString(),
                result: event.result || '',
                duration_ms: event.duration_ms || 0,
                num_turns: event.num_turns || 0,
                is_error: event.is_error || false
              });
              break;
          }
        }
        
        // Extract files from tool usage (create_file, edit_file)
        parsedMetrics.filesModified = parsedMetrics.toolUsage
          .filter(tool => ['create_file', 'edit_file'].includes(tool.toolName))
          .map(tool => tool.args?.path || 'unknown')
          .filter((path, index, arr) => arr.indexOf(path) === index); // dedupe
        
        setMetrics(parsedMetrics);
        
      } catch (err) {
        console.error('Error fetching stream metrics:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchStreamMetrics();
  }, [sessionId]);

  if (loading) {
    return (
      <div className={`flex items-center justify-center py-8 ${className}`}>
        <div className="text-gray-500">Loading JSON metrics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`py-8 ${className}`}>
        <div className="text-red-600 bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="font-semibold">Error Loading Metrics</h3>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className={`py-8 ${className}`}>
        <div className="text-gray-500 text-center">No metrics data available</div>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Token Usage Summary */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-semibold text-blue-900 mb-2">Token Usage</h4>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Input:</span>
              <span className="font-mono">{metrics.totalTokens.input.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span>Output:</span>
              <span className="font-mono">{metrics.totalTokens.output.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span>Cache Created:</span>
              <span className="font-mono">{metrics.totalTokens.cacheCreation.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span>Cache Read:</span>
              <span className="font-mono">{metrics.totalTokens.cacheRead.toLocaleString()}</span>
            </div>
            <hr className="border-blue-200" />
            <div className="flex justify-between font-semibold">
              <span>Total:</span>
              <span className="font-mono">{metrics.totalTokens.total.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Tool Usage Summary */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h4 className="font-semibold text-green-900 mb-2">Tool Usage</h4>
          <div className="space-y-1 text-sm">
            {Object.entries(
              metrics.toolUsage.reduce((acc, tool) => {
                acc[tool.toolName] = (acc[tool.toolName] || 0) + 1;
                return acc;
              }, {} as Record<string, number>)
            ).map(([toolName, count]) => (
              <div key={toolName} className="flex justify-between">
                <span className="capitalize">{toolName.replace('_', ' ')}:</span>
                <span className="font-mono">{count}</span>
              </div>
            ))}
            {metrics.toolUsage.length === 0 && (
              <div className="text-gray-500">No tools used</div>
            )}
          </div>
        </div>

        {/* Session Summary */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h4 className="font-semibold text-gray-900 mb-2">Session Summary</h4>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Messages:</span>
              <span className="font-mono">{metrics.assistantMessages.length}</span>
            </div>
            <div className="flex justify-between">
              <span>Files Modified:</span>
              <span className="font-mono">{metrics.filesModified.length}</span>
            </div>
            <div className="flex justify-between">
              <span>Models Used:</span>
              <span className="font-mono">{metrics.models.length}</span>
            </div>
            {metrics.sessionResults.length > 0 && (
              <div className="flex justify-between">
                <span>Duration:</span>
                <span className="font-mono">
                  {(metrics.sessionResults[metrics.sessionResults.length - 1].duration_ms / 1000).toFixed(1)}s
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Assistant Messages */}
      {metrics.assistantMessages.length > 0 && (
        <div className="bg-white border rounded-lg p-4">
          <h4 className="font-semibold mb-3">Assistant Messages</h4>
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {metrics.assistantMessages.map((msg, index) => (
              <div key={index} className="border-l-4 border-blue-200 pl-4 py-2 bg-gray-50">
                <div className="text-sm text-gray-600 mb-1">
                  Model: {msg.model}
                  {msg.usage && (
                    <span className="ml-4">
                      Tokens: {(msg.usage.input_tokens || 0) + (msg.usage.output_tokens || 0)}
                    </span>
                  )}
                </div>
                <div className="text-sm font-mono whitespace-pre-wrap">
                  {msg.content.slice(0, 200)}
                  {msg.content.length > 200 && '...'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Files Modified */}
      {metrics.filesModified.length > 0 && (
        <div className="bg-white border rounded-lg p-4">
          <h4 className="font-semibold mb-3">Files Modified ({metrics.filesModified.length})</h4>
          <div className="space-y-1">
            {metrics.filesModified.map((file, index) => (
              <div key={index} className="text-sm font-mono text-gray-700 bg-gray-50 px-2 py-1 rounded">
                {file.replace(/^.*\//, '')} {/* Show just filename */}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Raw Data (collapsible) */}
      <details className="bg-white border rounded-lg p-4">
        <summary className="font-semibold cursor-pointer mb-3">
          Raw Stream Data ({rawStreamData.length} events)
        </summary>
        <pre className="text-xs bg-gray-100 p-3 rounded overflow-auto max-h-96">
          {JSON.stringify(rawStreamData, null, 2)}
        </pre>
      </details>
    </div>
  );
}

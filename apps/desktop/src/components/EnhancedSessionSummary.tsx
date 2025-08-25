import React, { useState, useEffect } from 'react';
import type { Session } from "@ampsm/types";

interface EnhancedSessionSummaryProps {
  session: Session;
  className?: string;
}

interface SummaryMetrics {
  totalTokens: {
    input: number;
    output: number;
    total: number;
  };
  toolUsage: Record<string, number>;
  filesCreated: string[];
  filesModified: string[];
  linesChanged: {
    added: number;
    deleted: number;
    total: number;
  };
  assistantMessages: number;
  userMessages: number;
  models: string[];
  duration: number;
}

export function EnhancedSessionSummary({ session, className = '' }: EnhancedSessionSummaryProps) {
  const [metrics, setMetrics] = useState<SummaryMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSummaryMetrics = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Get data from multiple sources
        const [streamEventsResult, iterationsResult, toolCallsResult, apiSummaryResult] = await Promise.all([
          window.electronAPI.sessions.getStreamEvents(session.id),
          window.electronAPI.sessions.getIterations(session.id),
          window.electronAPI.sessions.getToolCalls(session.id),
          window.electronAPI.metrics.getSessionSummary(session.id)
        ]);

        const summaryMetrics: SummaryMetrics = {
          totalTokens: { input: 0, output: 0, total: 0 },
          toolUsage: {},
          filesCreated: [],
          filesModified: [],
          linesChanged: { added: 0, deleted: 0, total: 0 },
          assistantMessages: 0,
          userMessages: 0,
          models: [],
          duration: 0
        };

        // Count user messages (initial prompt + follow-ups)
        summaryMetrics.userMessages = 1; // Initial prompt
        if (session.followUpPrompts && Array.isArray(session.followUpPrompts)) {
          summaryMetrics.userMessages += session.followUpPrompts.length;
        }

        // Process iterations for tokens and duration
        if (iterationsResult.success && iterationsResult.iterations) {
          const iterations = iterationsResult.iterations;
          for (const iteration of iterations) {
            summaryMetrics.totalTokens.input += iteration.promptTokens || 0;
            summaryMetrics.totalTokens.output += iteration.completionTokens || 0;
            summaryMetrics.totalTokens.total += iteration.totalTokens || 0;
            
            if (iteration.model && !summaryMetrics.models.includes(iteration.model)) {
              summaryMetrics.models.push(iteration.model);
            }

            if (iteration.output && iteration.output.trim()) {
              summaryMetrics.assistantMessages++;
            }

            // Calculate duration
            if (iteration.startedAt && iteration.endedAt) {
              const duration = new Date(iteration.endedAt).getTime() - new Date(iteration.startedAt).getTime();
              summaryMetrics.duration += duration;
            }
          }
        }

        // Process tool calls
        if (toolCallsResult.success && toolCallsResult.toolCalls) {
          const toolCalls = toolCallsResult.toolCalls;
          for (const toolCall of toolCalls) {
            const toolName = toolCall.toolName;
            summaryMetrics.toolUsage[toolName] = (summaryMetrics.toolUsage[toolName] || 0) + 1;

            // Extract file operations from tool args
            try {
              const args = JSON.parse(toolCall.argsJson || '{}');
              if (toolName === 'create_file' && args.path) {
                if (!summaryMetrics.filesCreated.includes(args.path)) {
                  summaryMetrics.filesCreated.push(args.path);
                }
              } else if (toolName === 'edit_file' && args.path) {
                if (!summaryMetrics.filesModified.includes(args.path)) {
                  summaryMetrics.filesModified.push(args.path);
                }
              }
            } catch (e) {
              // Ignore JSON parse errors
            }
          }
        }

        // Get line changes from API summary (more reliable)
        if (apiSummaryResult.success && apiSummaryResult.summary) {
          summaryMetrics.linesChanged.added = apiSummaryResult.summary.totalLocAdded || 0;
          summaryMetrics.linesChanged.deleted = apiSummaryResult.summary.totalLocDeleted || 0;
          summaryMetrics.linesChanged.total = summaryMetrics.linesChanged.added + summaryMetrics.linesChanged.deleted;
        }

        // Process stream events if available for additional data
        if (streamEventsResult.success && streamEventsResult.streamEvents) {
          for (const event of streamEventsResult.streamEvents) {
            if (event.type === 'assistant_message' && event.data?.usage) {
              summaryMetrics.totalTokens.input += event.data.usage.input_tokens || 0;
              summaryMetrics.totalTokens.output += event.data.usage.output_tokens || 0;
            }
            
            if (event.type === 'tool_start' || event.type === 'tool_finish') {
              const toolName = event.data?.tool || event.data?.toolName;
              if (toolName) {
                summaryMetrics.toolUsage[toolName] = (summaryMetrics.toolUsage[toolName] || 0) + 1;
              }
            }
          }
        }

        // Ensure total tokens is correct
        summaryMetrics.totalTokens.total = Math.max(
          summaryMetrics.totalTokens.total,
          summaryMetrics.totalTokens.input + summaryMetrics.totalTokens.output
        );

        setMetrics(summaryMetrics);
        
      } catch (err) {
        console.error('Error fetching summary metrics:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchSummaryMetrics();
  }, [session.id]);

  if (loading) {
    return (
      <div className={`bg-white p-6 rounded-lg border ${className}`}>
        <h3 className="text-lg font-semibold mb-4">Session Summary</h3>
        <div className="animate-pulse space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !metrics) {
    return (
      <div className={`bg-white p-6 rounded-lg border ${className}`}>
        <h3 className="text-lg font-semibold mb-4">Session Summary</h3>
        <div className="text-red-600 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm">{error || 'No metrics data available'}</p>
        </div>
      </div>
    );
  }

  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}min`;
  };

  return (
    <div className={`bg-white p-6 rounded-lg border ${className}`}>
      <h3 className="text-lg font-semibold mb-4">Session Summary</h3>
      
      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Token Usage */}
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
            <hr className="border-blue-200" />
            <div className="flex justify-between font-semibold">
              <span>Total:</span>
              <span className="font-mono">{metrics.totalTokens.total.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* File Changes */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h4 className="font-semibold text-green-900 mb-2">File Changes</h4>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Created:</span>
              <span className="font-mono">{metrics.filesCreated.length}</span>
            </div>
            <div className="flex justify-between">
              <span>Modified:</span>
              <span className="font-mono">{metrics.filesModified.length}</span>
            </div>
            <div className="flex justify-between">
              <span>Lines Added:</span>
              <span className="font-mono text-green-600">+{metrics.linesChanged.added}</span>
            </div>
            <div className="flex justify-between">
              <span>Lines Deleted:</span>
              <span className="font-mono text-red-600">-{metrics.linesChanged.deleted}</span>
            </div>
          </div>
        </div>

        {/* Session Stats */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h4 className="font-semibold text-gray-900 mb-2">Session Stats</h4>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Messages:</span>
              <span className="font-mono">{metrics.assistantMessages + metrics.userMessages}</span>
            </div>
            <div className="flex justify-between">
              <span>Models:</span>
              <span className="font-mono">{metrics.models.length}</span>
            </div>
            <div className="flex justify-between">
              <span>Duration:</span>
              <span className="font-mono">{formatDuration(metrics.duration)}</span>
            </div>
            <div className="flex justify-between">
              <span>Tools Used:</span>
              <span className="font-mono">{Object.keys(metrics.toolUsage).length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tool Usage Details */}
      {Object.keys(metrics.toolUsage).length > 0 && (
        <div className="mb-6">
          <h4 className="font-semibold text-gray-900 mb-3">Tool Usage</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {Object.entries(metrics.toolUsage)
              .sort(([,a], [,b]) => b - a)
              .slice(0, 8)
              .map(([toolName, count]) => (
                <div key={toolName} className="bg-gray-50 border rounded px-3 py-2">
                  <div className="text-sm font-medium capitalize">
                    {toolName.replace('_', ' ')}
                  </div>
                  <div className="text-xs text-gray-600">
                    {count} call{count !== 1 ? 's' : ''}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Files Modified */}
      {(metrics.filesCreated.length > 0 || metrics.filesModified.length > 0) && (
        <div className="space-y-3">
          {metrics.filesCreated.length > 0 && (
            <div>
              <h4 className="font-semibold text-green-700 mb-2">
                Files Created ({metrics.filesCreated.length})
              </h4>
              <div className="space-y-1 max-h-24 overflow-y-auto">
                {metrics.filesCreated.slice(0, 5).map((file, index) => (
                  <div key={index} className="text-sm font-mono text-gray-700 bg-green-50 border-l-2 border-green-300 px-2 py-1 rounded">
                    {file.length > 60 ? `...${file.slice(-57)}` : file}
                  </div>
                ))}
                {metrics.filesCreated.length > 5 && (
                  <div className="text-xs text-gray-500 pl-2">
                    +{metrics.filesCreated.length - 5} more files
                  </div>
                )}
              </div>
            </div>
          )}
          
          {metrics.filesModified.length > 0 && (
            <div>
              <h4 className="font-semibold text-blue-700 mb-2">
                Files Modified ({metrics.filesModified.length})
              </h4>
              <div className="space-y-1 max-h-24 overflow-y-auto">
                {metrics.filesModified.slice(0, 5).map((file, index) => (
                  <div key={index} className="text-sm font-mono text-gray-700 bg-blue-50 border-l-2 border-blue-300 px-2 py-1 rounded">
                    {file.length > 60 ? `...${file.slice(-57)}` : file}
                  </div>
                ))}
                {metrics.filesModified.length > 5 && (
                  <div className="text-xs text-gray-500 pl-2">
                    +{metrics.filesModified.length - 5} more files
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

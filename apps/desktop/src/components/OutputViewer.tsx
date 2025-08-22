import React, { useState, useEffect } from "react";
import type { IterationRecord, ToolCall } from "@ampsm/types";

interface OutputViewerProps {
  sessionId: string;
  className?: string;
}

interface SessionOutput {
  iterations: IterationRecord[];
  toolCalls: ToolCall[];
}

export function OutputViewer({ sessionId, className }: OutputViewerProps) {
  const [output, setOutput] = useState<SessionOutput | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOutput = async () => {
    setLoading(true);
    setError(null);

    try {
      const [iterationsResult, toolCallsResult] = await Promise.all([
        window.electronAPI.sessions.getIterations(sessionId),
        window.electronAPI.sessions.getToolCalls(sessionId)
      ]);

      if (iterationsResult.success && toolCallsResult.success) {
        setOutput({
          iterations: iterationsResult.iterations || [],
          toolCalls: toolCallsResult.toolCalls || []
        });
      } else {
        setError(
          iterationsResult.error || toolCallsResult.error || "Failed to load output"
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load output");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOutput();
  }, [sessionId]);

  const getToolCallsForIteration = (iterationId: string): ToolCall[] => {
    if (!output) return [];
    return output.toolCalls.filter(tc => tc.iterationId === iterationId);
  };

  const formatTimestamp = (timestamp: string): string => {
    return new Date(timestamp).toLocaleString();
  };

  const getFileChangesForIteration = (iteration: IterationRecord): string[] => {
    const toolCalls = getToolCallsForIteration(iteration.id);
    const fileChanges: string[] = [];
    
    toolCalls.forEach(call => {
      if (call.toolName === 'edit_file' || call.toolName === 'create_file') {
        try {
          const args = JSON.parse(call.argsJson);
          if (args.path) {
            fileChanges.push(args.path);
          }
        } catch {
          // Ignore malformed JSON
        }
      }
    });
    
    return [...new Set(fileChanges)]; // Remove duplicates
  };

  if (loading) {
    return (
      <div className={`p-6 ${className || ""}`}>
        <div className="text-center">
          <div className="text-gray-600">Loading output...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-6 ${className || ""}`}>
        <div className="text-red-600">
          <div className="font-medium">Error loading output</div>
          <div className="text-sm mt-1">{error}</div>
          <button
            onClick={loadOutput}
            className="mt-2 text-sm text-red-600 underline"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!output || output.iterations.length === 0) {
    return (
      <div className={`p-6 ${className || ""}`}>
        <div className="text-center text-gray-500">
          No iterations have been run yet.
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className || ""}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Session Output</h3>
        <button
          onClick={loadOutput}
          className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Refresh
        </button>
      </div>

      <div className="space-y-4">
        {output.iterations.map((iteration, index) => {
          const toolCalls = getToolCallsForIteration(iteration.id);
          const fileChanges = getFileChangesForIteration(iteration);
          
          return (
            <div key={iteration.id} className="border rounded-lg bg-white">
              <div className="p-4 border-b bg-gray-50">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">
                    Iteration {index + 1}
                  </h4>
                  <div className="text-sm text-gray-500">
                    {formatTimestamp(iteration.startTime)}
                  </div>
                </div>
                {iteration.endTime && (
                  <div className="text-sm text-gray-600 mt-1">
                    Duration: {Math.round((new Date(iteration.endTime).getTime() - new Date(iteration.startTime).getTime()) / 1000)}s
                  </div>
                )}
              </div>

              <div className="p-4 space-y-4">
                {/* Text Output Section */}
                <div>
                  <h5 className="font-medium text-sm text-gray-700 mb-2">Text Output</h5>
                  <div className="bg-gray-50 p-3 rounded text-sm font-mono max-h-96 overflow-y-auto">
                    {(iteration as any).output || "No text output available"}
                  </div>
                </div>

                {/* Files Changed Section */}
                {fileChanges.length > 0 && (
                  <div>
                    <h5 className="font-medium text-sm text-gray-700 mb-2">
                      Files Changed ({fileChanges.length})
                    </h5>
                    <div className="space-y-1">
                      {fileChanges.map((filePath, fileIndex) => (
                        <div
                          key={fileIndex}
                          className="text-sm font-mono bg-blue-50 px-3 py-2 rounded border-l-4 border-blue-400"
                        >
                          {filePath}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tools Used Section */}
                {toolCalls.length > 0 && (
                  <div>
                    <h5 className="font-medium text-sm text-gray-700 mb-2">
                      Tools Used ({toolCalls.length})
                    </h5>
                    <div className="space-y-2">
                      {toolCalls.map((toolCall) => (
                        <div
                          key={toolCall.id}
                          className={`text-sm p-3 rounded border-l-4 ${
                            toolCall.success 
                              ? "bg-green-50 border-green-400" 
                              : "bg-red-50 border-red-400"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{toolCall.toolName}</span>
                            <span className={`text-xs px-2 py-1 rounded ${
                              toolCall.success 
                                ? "bg-green-100 text-green-800"
                                : "bg-red-100 text-red-800"
                            }`}>
                              {toolCall.success ? "Success" : "Failed"}
                            </span>
                          </div>
                          {toolCall.durationMs && (
                            <div className="text-xs text-gray-600 mt-1">
                              {toolCall.durationMs}ms
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Telemetry Info */}
                {(iteration.totalTokens || iteration.model) && (
                  <div className="pt-2 border-t">
                    <div className="flex justify-between text-sm text-gray-600">
                      {iteration.model && (
                        <span>Model: {iteration.model}</span>
                      )}
                      {iteration.totalTokens && (
                        <span>Tokens: {iteration.totalTokens}</span>
                      )}
                    </div>
                  </div>
                )}

                {/* CLI Log Metrics */}
                {((iteration as any).cliToolUsageCount !== undefined || 
                  (iteration as any).cliErrorCount !== undefined || 
                  (iteration as any).cliLogDurationMs !== undefined) && (
                  <div className="pt-2 border-t">
                    <h5 className="font-medium text-sm text-gray-700 mb-2">CLI Log Metrics</h5>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                      {(iteration as any).cliToolUsageCount !== undefined && (
                        <div className="flex items-center space-x-2">
                          <span className="text-blue-600">🔧</span>
                          <div>
                            <p className="text-xs text-gray-500">CLI Tool Calls</p>
                            <p className="font-medium">{(iteration as any).cliToolUsageCount}</p>
                          </div>
                        </div>
                      )}
                      {(iteration as any).cliErrorCount !== undefined && (
                        <div className="flex items-center space-x-2">
                          <span className={`${(iteration as any).cliErrorCount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {(iteration as any).cliErrorCount > 0 ? '❌' : '✅'}
                          </span>
                          <div>
                            <p className="text-xs text-gray-500">CLI Errors</p>
                            <p className="font-medium">{(iteration as any).cliErrorCount}</p>
                          </div>
                        </div>
                      )}
                      {(iteration as any).cliLogDurationMs !== undefined && (
                        <div className="flex items-center space-x-2">
                          <span className="text-gray-600">⏱️</span>
                          <div>
                            <p className="text-xs text-gray-500">CLI Duration</p>
                            <p className="font-medium">{(iteration as any).cliLogDurationMs}ms</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';

interface JSONMetricsProps {
  sessionId: string;
  className?: string;
  session?: any; // Session object with ampPrompt and followUpPrompts
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
  filesCreated: string[];
  filesModified: string[];
  userMessages: Array<{
    timestamp: string;
    message: string;
  }>;
  linesChanged: {
    added: number;
    deleted: number;
    total: number;
  };
}

export function JSONMetrics({ sessionId, className = '', session }: JSONMetricsProps) {
  const [metrics, setMetrics] = useState<ParsedStreamMetrics | null>(null);
  const [rawStreamData, setRawStreamData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apiSummary, setApiSummary] = useState<any>(null);

  useEffect(() => {
    const fetchStreamMetrics = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Get API summary for reliable line change data
        const summaryResult = await window.electronAPI.metrics.getSessionSummary(sessionId);
        setApiSummary(summaryResult);
        
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
          
          // Add user messages from session object to stream events
          if (session?.ampPrompt) {
            jsonEvents.unshift({
              type: 'user_message',
              timestamp: session.createdAt || new Date().toISOString(),
              message: session.ampPrompt
            });
          }
          
          // Add followup prompts if available
          if (session?.followUpPrompts && Array.isArray(session.followUpPrompts)) {
            session.followUpPrompts.forEach((prompt: string, index: number) => {
              const baseTime = new Date(session.createdAt || new Date()).getTime();
              const estimatedTimestamp = new Date(baseTime + (index + 1) * 60000).toISOString();
              
              jsonEvents.push({
                type: 'user_message',
                timestamp: estimatedTimestamp,
                message: prompt
              });
            });
          }
        } else {
          // Fallback to synthetic events from iterations, tool calls, and user messages
          const [iterationsResult, toolCallsResult, sessionSummaryResult] = await Promise.all([
            window.electronAPI.sessions.getIterations(sessionId),
            window.electronAPI.sessions.getToolCalls(sessionId),
            window.electronAPI.metrics.getSessionSummary(sessionId)
          ]);
          
          if (!iterationsResult.success || !toolCallsResult.success) {
            throw new Error(iterationsResult.error || toolCallsResult.error || 'Failed to load session data');
          }
          
          const iterations = iterationsResult.iterations || [];
          const toolCalls = toolCallsResult.toolCalls || [];
          
          // Add user messages from session object (same as Overview tab)
          if (session?.ampPrompt) {
            // Add initial prompt as first user message
            jsonEvents.push({
              type: 'user_message',
              timestamp: session.createdAt || new Date().toISOString(),
              message: session.ampPrompt
            });
          }
          
          // Add followup prompts if available
          if (session?.followUpPrompts && Array.isArray(session.followUpPrompts)) {
            session.followUpPrompts.forEach((prompt: string, index: number) => {
              // Estimate timestamp for followup prompts (they don't have explicit timestamps)
              const baseTime = new Date(session.createdAt || new Date()).getTime();
              const estimatedTimestamp = new Date(baseTime + (index + 1) * 60000).toISOString(); // Add 1 minute per followup
              
              jsonEvents.push({
                type: 'user_message',
                timestamp: estimatedTimestamp,
                message: prompt
              });
            });
          }
        
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
        
        // Debug: Log the structure of apiSummary
        if (apiSummary) {
          console.log('[DEBUG] API Summary structure:', {
            hasSummary: !!apiSummary.summary,
            hasToolUsage: !!apiSummary.summary?.toolUsage,
            toolUsageKeys: apiSummary.summary?.toolUsage ? Object.keys(apiSummary.summary.toolUsage) : [],
            toolUsageData: apiSummary.summary?.toolUsage
          });
        }
        
        // Parse metrics from JSON events
        const parsedMetrics: ParsedStreamMetrics = {
          assistantMessages: [],
          sessionResults: [],
          toolUsage: [],
          totalTokens: { input: 0, output: 0, cacheCreation: 0, cacheRead: 0, total: 0 },
          models: [],
          filesCreated: [],
          filesModified: [],
          userMessages: [],
          linesChanged: { added: 0, deleted: 0, total: 0 }
        };
        
        for (const event of jsonEvents) {
          switch (event.type) {
            case 'assistant_message':
              // Handle real stream events - supports both direct content and nested message structure
              let messageContent = '';
              let messageModel = 'unknown';
              let messageUsage = null;
              
              if (event.message) {
                // Handle nested message structure
                messageContent = event.message.content
                  ?.filter((item: any) => item.type === 'text')
                  ?.map((item: any) => item.text)
                  ?.join('') || '';
                messageModel = event.message.model || 'unknown';
                messageUsage = event.message.usage;
                
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
              } else {
                // Handle direct structure
                messageContent = event.content || '';
                messageModel = event.model || 'unknown';
                messageUsage = event.usage;
                
                // Extract tools from direct event tools array
                if (event.tools && Array.isArray(event.tools)) {
                  event.tools.forEach((toolName: string) => {
                    parsedMetrics.toolUsage.push({
                      toolName: toolName,
                      timestamp: event.timestamp || new Date().toISOString(),
                      args: {}
                    });
                  });
                }
              }
              
              // Only add messages that have actual text content (ignore tool-only messages)
              if (messageContent.trim()) {
                parsedMetrics.assistantMessages.push({
                  timestamp: event.timestamp || new Date().toISOString(),
                  content: messageContent,
                  model: messageModel,
                  usage: messageUsage
                });
              }
              
              // Extract token usage
              if (messageUsage) {
                parsedMetrics.totalTokens.input += messageUsage.input_tokens || 0;
                parsedMetrics.totalTokens.output += messageUsage.output_tokens || 0;
                parsedMetrics.totalTokens.cacheCreation += messageUsage.cache_creation_input_tokens || 0;
                parsedMetrics.totalTokens.cacheRead += messageUsage.cache_read_input_tokens || 0;
                parsedMetrics.totalTokens.total = parsedMetrics.totalTokens.input + parsedMetrics.totalTokens.output;
              }
              
              // Track models
              if (messageModel && !parsedMetrics.models.includes(messageModel)) {
                parsedMetrics.models.push(messageModel);
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
                const textContent = event.message.content
                  ?.filter((item: any) => item.type === 'text')
                  ?.map((item: any) => item.text)
                  ?.join('') || '';
                
                // Only add messages that have actual text content (ignore tool-only messages)
                if (textContent.trim()) {
                  parsedMetrics.assistantMessages.push({
                    timestamp: event.timestamp || new Date().toISOString(),
                    content: textContent,
                    model: event.message.model || 'unknown',
                    usage: event.message.usage
                  });
                }
                
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
                      console.log('[DEBUG] Found tool_use in assistant message:', item.name);
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
              
            case 'user_message':
              // Handle user message events
              parsedMetrics.userMessages.push({
                timestamp: event.timestamp || new Date().toISOString(),
                message: event.message || event.data?.message || ''
              });
              break;
              
            case 'file_edit':
              // Handle file edit events and track lines changed
              if (event.data?.linesAdded !== undefined) {
                const linesAdded = event.data.linesAdded || 0;
                const linesDeleted = event.data.linesDeleted || 0;
                
                parsedMetrics.linesChanged.added += linesAdded;
                parsedMetrics.linesChanged.deleted += linesDeleted;
                parsedMetrics.linesChanged.total += linesAdded + linesDeleted;
                
                // Track files created/modified
                const filePath = event.data.path;
                const operation = event.data.operation;
                
                if (filePath) {
                  if (operation === 'create' && !parsedMetrics.filesCreated.includes(filePath)) {
                    parsedMetrics.filesCreated.push(filePath);
                  } else if (operation === 'modify' && !parsedMetrics.filesModified.includes(filePath)) {
                    parsedMetrics.filesModified.push(filePath);
                  }
                }
              }
              break;
          }
        }
        
        // Extract files from assistant messages (markdown links) with action detection
        const filesCreatedFromMessages: string[] = [];
        const filesModifiedFromMessages: string[] = [];
        
        for (const msg of parsedMetrics.assistantMessages) {
          const linkRegex = /\[([^\]]+)\]\((file:\/\/\/[^\)]+)\)/g;
          let match;
          while ((match = linkRegex.exec(msg.content)) !== null) {
            // Extract filename from the markdown link text (first capture group)
            const filename = match[1];
            // Extract file path from URL (second capture group)
            const filePath = match[2].replace('file:///', '');
            
            // Use filename if it looks like a simple filename, otherwise use full path
            const displayPath = filename.includes('/') ? filePath : filename;
            
            // Determine if this is a creation or modification based on context
            const beforeLink = msg.content.substring(0, match.index);
            const contextWords = beforeLink.toLowerCase().split(/\s+/).slice(-10); // Last 10 words before the link
            
            const creationWords = ['created', 'added', 'generated', 'new', 'initialized'];
            const modificationWords = ['updated', 'modified', 'changed', 'edited', 'fixed'];
            
            const isCreation = creationWords.some(word => contextWords.includes(word));
            const isModification = modificationWords.some(word => contextWords.includes(word));
            
            if (isCreation && !isModification) {
              filesCreatedFromMessages.push(displayPath);
            } else if (isModification) {
              filesModifiedFromMessages.push(displayPath);
            } else {
              // If unclear, default to modified (safer assumption)
              filesModifiedFromMessages.push(displayPath);
            }
          }
        }
        
        // Extract files from tool usage
        const filesCreatedFromTools = parsedMetrics.toolUsage
          .filter(tool => tool.toolName === 'create_file')
          .map(tool => tool.args?.path)
          .filter(Boolean);
          
        const filesModifiedFromTools = parsedMetrics.toolUsage
          .filter(tool => tool.toolName === 'edit_file')
          .map(tool => tool.args?.path)
          .filter(Boolean);
        
        // Combine and dedupe files by category
        parsedMetrics.filesCreated = Array.from(
          new Set([...filesCreatedFromMessages, ...filesCreatedFromTools])
        );
        
        parsedMetrics.filesModified = Array.from(
          new Set([...filesModifiedFromMessages, ...filesModifiedFromTools])
        );
        
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
        <div className="text-gruvbox-fg2">Loading JSON metrics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`py-8 ${className}`}>
        <div className="text-gruvbox-red bg-gruvbox-bg2 border border-gruvbox-red/30 rounded-lg p-4">
          <h3 className="font-semibold">Error Loading Metrics</h3>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className={`py-8 ${className}`}>
        <div className="text-gruvbox-fg2 text-center">No metrics data available</div>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Token Usage Summary */}
        <div className="bg-gruvbox-bg2 border border-gruvbox-bg4 rounded-lg p-4">
          <h4 className="font-semibold text-gruvbox-blue mb-2">Token Usage</h4>
          <div className="space-y-1 text-sm text-gruvbox-fg1">
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
            <hr className="border-gruvbox-bg4" />
            <div className="flex justify-between font-semibold">
              <span>Total:</span>
              <span className="font-mono">{metrics.totalTokens.total.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Tool Usage Summary */}
        <div className="bg-gruvbox-bg2 border border-gruvbox-bg4 rounded-lg p-4">
          <h4 className="font-semibold text-gruvbox-green mb-2">Tool Usage</h4>
          <div className="space-y-1 text-sm text-gruvbox-fg1">
            {/* Use API summary data if available, fallback to stream data */}
            {(() => {
              // Try API summary first (reliable for completed sessions)
              if (apiSummary?.summary?.toolUsage && Array.isArray(apiSummary.summary.toolUsage) && apiSummary.summary.toolUsage.length > 0) {
                return apiSummary.summary.toolUsage.map((stats: any) => (
                  <div key={stats.toolName} className="flex justify-between">
                    <span className="capitalize">{stats.toolName.replace('_', ' ')}:</span>
                    <span className="font-mono">{stats.callCount}</span>
                  </div>
                ));
              }
              
              // Fallback to stream data (for new/active sessions)
              const streamToolUsage = metrics.toolUsage.reduce((acc, tool) => {
                acc[tool.toolName] = (acc[tool.toolName] || 0) + 1;
                return acc;
              }, {} as Record<string, number>);
              
              if (Object.keys(streamToolUsage).length > 0) {
                return Object.entries(streamToolUsage).map(([toolName, count]) => (
                  <div key={toolName} className="flex justify-between">
                    <span className="capitalize">{toolName.replace('_', ' ')}:</span>
                    <span className="font-mono">{count}</span>
                  </div>
                ));
              }
              
              return <div className="text-gruvbox-fg2">No tools used</div>;
            })()}
          </div>
        </div>

        {/* Session Summary */}
        <div className="bg-gruvbox-bg2 border border-gruvbox-bg4 rounded-lg p-4">
          <h4 className="font-semibold text-gruvbox-purple mb-2">Session Summary</h4>
          <div className="space-y-1 text-sm text-gruvbox-fg1">
            <div className="flex justify-between">
              <span>Messages:</span>
              <span className="font-mono">{metrics.assistantMessages.length}</span>
            </div>
            <div className="flex justify-between">
              <span>Files Created:</span>
              <span className="font-mono">{metrics.filesCreated.length}</span>
            </div>
            <div className="flex justify-between">
              <span>Files Modified:</span>
              <span className="font-mono">{metrics.filesModified.length}</span>
            </div>
            <div className="flex justify-between">
              <span>Models Used:</span>
              <span className="font-mono">{metrics.models.length}</span>
            </div>
            <div className="flex justify-between">
              <span>User Messages:</span>
              <span className="font-mono">{metrics.userMessages.length}</span>
            </div>
            <div className="flex justify-between">
              <span>Lines Added:</span>
              <span className="font-mono text-gruvbox-green">+{apiSummary?.summary?.totalLocAdded || 0}</span>
            </div>
            <div className="flex justify-between">
              <span>Lines Deleted:</span>
              <span className="font-mono text-gruvbox-red">-{apiSummary?.summary?.totalLocDeleted || 0}</span>
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

      {/* Conversation Flow */}
      {(metrics.assistantMessages.length > 0 || metrics.userMessages.length > 0) && (
        <div className="bg-gruvbox-bg1 border border-gruvbox-bg3 rounded-lg p-4">
          <h4 className="font-semibold mb-3 text-gruvbox-fg0">Conversation Flow</h4>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {(() => {
              // Merge user messages and assistant messages in chronological order
              const allMessages = [
                ...metrics.userMessages.map(msg => ({
                  type: 'user' as const,
                  timestamp: msg.timestamp,
                  content: msg.message,
                  ...msg
                })),
                ...metrics.assistantMessages.map(msg => ({
                  type: 'assistant' as const,
                  timestamp: msg.timestamp,
                  content: msg.content,
                  ...msg
                }))
              ].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

              return allMessages.map((msg, index) => (
                <div key={index} className={`border-l-4 pl-4 pr-4 py-3 rounded-r-lg ${
                  msg.type === 'user' 
                    ? 'border-gruvbox-purple bg-gruvbox-bg2' 
                    : 'border-gruvbox-blue bg-gruvbox-bg2'
                }`}>
                  <div className="flex justify-between items-start mb-2 gap-4">
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-sm font-semibold ${
                        msg.type === 'user' ? 'text-gruvbox-purple' : 'text-gruvbox-blue'
                      }`}>
                        {msg.type === 'user' ? 'User' : 'Amp'}
                      </span>
                      {msg.type === 'assistant' && msg.model && (
                        <span className="text-xs bg-gruvbox-bg3 text-gruvbox-fg2 px-2 py-1 rounded">
                          {msg.model}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gruvbox-fg2 text-right flex-shrink-0">
                      <div>{new Date(msg.timestamp).toLocaleString()}</div>
                      {msg.type === 'assistant' && msg.usage && (
                        <div className="mt-1">
                          Tokens: {(msg.usage.input_tokens || 0) + (msg.usage.output_tokens || 0)}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-sm text-gruvbox-fg1 min-w-0">
                    <div className="whitespace-pre-wrap break-words">
                      {msg.content.length > 500 
                        ? `${msg.content.slice(0, 500)}...` 
                        : msg.content
                      }
                    </div>
                  </div>
                </div>
              ));
            })()}
          </div>
        </div>
      )}

      {/* Files Created */}
      {metrics.filesCreated.length > 0 && (
        <div className="bg-gruvbox-bg1 border border-gruvbox-bg3 rounded-lg p-4">
          <h4 className="font-semibold mb-3 text-gruvbox-green">Files Created ({metrics.filesCreated.length})</h4>
          <div className="space-y-1">
            {metrics.filesCreated.map((file, index) => {
              const isFullPath = file.includes('/');
              const filename = isFullPath ? file.replace(/^.*\//, '') : file;
              const fileUrl = isFullPath ? `file:///${file}` : null;
              
              return (
                <div key={index} className="text-sm font-mono text-gruvbox-fg1 bg-gruvbox-bg2 border-l-2 border-gruvbox-green px-2 py-1 rounded flex justify-between items-center">
                  <span>{filename}</span>
                  {fileUrl && (
                    <a 
                      href={fileUrl} 
                      className="text-gruvbox-blue hover:text-gruvbox-bright-blue text-xs"
                      title="Open file"
                    >
                    Open
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Files Modified */}
      {metrics.filesModified.length > 0 && (
        <div className="bg-gruvbox-bg1 border border-gruvbox-bg3 rounded-lg p-4">
          <h4 className="font-semibold mb-3 text-gruvbox-blue">Files Modified ({metrics.filesModified.length})</h4>
          <div className="space-y-1">
            {metrics.filesModified.map((file, index) => {
              const isFullPath = file.includes('/');
              const filename = isFullPath ? file.replace(/^.*\//, '') : file;
              const fileUrl = isFullPath ? `file:///${file}` : null;
              
              return (
                <div key={index} className="text-sm font-mono text-gruvbox-fg1 bg-gruvbox-bg2 border-l-2 border-gruvbox-blue px-2 py-1 rounded flex justify-between items-center">
                  <span>{filename}</span>
                  {fileUrl && (
                    <a 
                      href={fileUrl} 
                      className="text-gruvbox-blue hover:text-gruvbox-bright-blue text-xs"
                      title="Open file"
                    >
                    Open
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Raw Data (collapsible) */}
      <details className="bg-gruvbox-bg1 border border-gruvbox-bg3 rounded-lg p-4">
        <summary className="font-semibold cursor-pointer mb-3 text-gruvbox-fg0">
          Raw Stream Data ({rawStreamData.length} events)
        </summary>
        <pre className="text-xs bg-gruvbox-bg2 text-gruvbox-fg1 p-3 rounded overflow-auto max-h-96">
          {JSON.stringify(rawStreamData, null, 2)}
        </pre>
      </details>
    </div>
  );
}

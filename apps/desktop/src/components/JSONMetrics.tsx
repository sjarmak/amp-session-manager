import React, { useState, useEffect } from 'react';
import { ToolCallDisplay } from './ToolCallDisplay';

/**
 * Map model override values to display names
 */
function getModelDisplayName(modelOverride?: string): string {
  switch (modelOverride) {
    case 'gpt-5':
      return 'gpt5';
    case 'alloy':
      return 'Alloy';
    case '':
    case undefined:
    case null:
      return 'Claude Sonnet 4';
    default:
      return modelOverride || 'Claude Sonnet 4';
  }
}

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
    threadId?: string;
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
    threadId?: string;
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
    threadId?: string;
  }>;
  linesChanged: {
    added: number;
    deleted: number;
    total: number;
  };
  threads: Array<{
    id: string;
    name: string;
    messages: Array<{
      type: 'user' | 'assistant';
      timestamp: string;
      content: string;
      model?: string;
      usage?: any;
      tools?: string[];
    }>;
  }>;
}

// Helper function to parse message content and extract tool calls
const parseMessageContent = (content: string) => {
  const textParts: string[] = [];
  const toolCalls: Array<{
    id: string;
    name: string;
    input: any;
    timestamp?: string;
    status?: 'pending' | 'success' | 'error';
  }> = [];

  try {
    // Check if content looks like it contains tool_use JSON
    if (content.includes('"type":"tool_use"') || content.includes("'type':'tool_use'")) {
      // Try to extract JSON objects from the content
      const jsonMatches = content.match(/\[?\{[^}]*"type":\s*"tool_use"[^}]*\}[^\]]*\]?/g);
      if (jsonMatches) {
        for (const match of jsonMatches) {
          try {
            let parsed;
            if (match.startsWith('[')) {
              parsed = JSON.parse(match);
              if (Array.isArray(parsed)) {
                parsed = parsed[0]; // Take first item if it's an array
              }
            } else {
              parsed = JSON.parse(match);
            }
            
            if (parsed.type === 'tool_use') {
              toolCalls.push({
                id: parsed.id || 'unknown',
                name: parsed.name || 'unknown_tool',
                input: parsed.input || {},
                status: 'success'
              });
            }
          } catch (e) {
            // Ignore parse errors for individual matches
          }
        }
        
        // Remove the JSON parts from content for text extraction
        let cleanContent = content;
        for (const match of jsonMatches) {
          cleanContent = cleanContent.replace(match, '').trim();
        }
        if (cleanContent) {
          textParts.push(cleanContent);
        }
      } else {
        textParts.push(content);
      }
    } else {
      textParts.push(content);
    }
  } catch (e) {
    // If parsing fails, just use the raw content as text
    textParts.push(content);
  }

  return {
    textContent: textParts.join('\n').trim(),
    toolCalls
  };
};

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
        console.log('Stream events result for session', sessionId, streamEventsResult);
        
        let jsonEvents: any[] = [];
        let hasThreadMessages = false;
        let threadsData: any[] = [];
        
        // First, try to get thread messages (most accurate source for user messages)
        try {
          const threadsResult = await window.electronAPI.sessions.getThreads(sessionId);
          if (threadsResult.success && threadsResult.threads && threadsResult.threads.length > 0) {
            threadsData = threadsResult.threads;
            
            // Get messages from all threads
            for (const thread of threadsResult.threads) {
              const messagesResult = await window.electronAPI.sessions.getThreadMessages(thread.id);
              if (messagesResult.success && messagesResult.messages && messagesResult.messages.length > 0) {
                hasThreadMessages = true;
                messagesResult.messages.forEach((msg: any) => {
                  jsonEvents.push({
                    type: msg.role === 'user' ? 'user_message' : 'assistant_message',
                    timestamp: msg.createdAt,
                    message: msg.role === 'user' ? msg.content : '',
                    content: msg.role === 'assistant' ? msg.content : '',
                    model: 'unknown', // Thread messages don't store model info
                    threadId: thread.id,
                    threadName: thread.name
                  });
                });
              }
            }
          }
        } catch (threadError) {
          console.log('Could not load thread messages:', threadError);
        }
        
        if (streamEventsResult.success && streamEventsResult.streamEvents && streamEventsResult.streamEvents.length > 0) {
          // Use real stream events if available
          const streamEvents = streamEventsResult.streamEvents.map(event => ({
            type: event.type,
            timestamp: event.timestamp,
            ...event.data
          }));
          console.log('Mapped stream events:', streamEvents);
          
          // Add ALL stream events, not just assistant messages and tool results
          jsonEvents.push(...streamEvents);
          
          // Only add session prompts if we don't have thread messages
          if (!hasThreadMessages) {
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
          
          // Only add session prompts if we don't have thread messages
          if (!hasThreadMessages) {
            // Fallback to session prompts if thread messages are not available
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
          }
        
        // Add iteration events
        for (const iteration of iterations) {
          if (iteration.output) {
            jsonEvents.push({
              type: 'assistant',
              message: {
                content: [{ type: 'text', text: iteration.output }],
                model: iteration.model || getModelDisplayName(session?.modelOverride),
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
        console.log('Final jsonEvents before parsing:', jsonEvents);
        
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
          linesChanged: { added: 0, deleted: 0, total: 0 },
          threads: []
        };
        
        for (const event of jsonEvents) {
          switch (event.type) {
            case 'assistant_message':
              // Handle real stream events - supports both direct content and nested message structure
              let messageContent = '';
              let messageModel = getModelDisplayName(session?.modelOverride);
              let messageUsage = null;
              
              if (event.message) {
                // Handle nested message structure
                messageContent = event.message.content
                  ?.filter((item: any) => item.type === 'text')
                  ?.map((item: any) => item.text)
                  ?.join('') || '';
                messageModel = event.message.model || getModelDisplayName(session?.modelOverride);
                messageUsage = event.message.usage;
                
                // Extract tool usage from message content
                if (event.message.content && Array.isArray(event.message.content)) {
                  event.message.content.forEach((item: any) => {
                    if (item.type === 'tool_use') {
                      console.log('[DEBUG] Found tool_use in message content (source 1):', item.name);
                      parsedMetrics.toolUsage.push({
                        toolName: item.name,
                        timestamp: event.timestamp || new Date().toISOString(),
                        args: item.input,
                        threadId: event.threadId
                      });
                    }
                  });
                }
              } else {
                // Handle direct structure
                messageContent = event.content || '';
                messageModel = event.model || getModelDisplayName(session?.modelOverride);
                messageUsage = event.usage;
                
                // Skip extracting tools from the direct tools array since these are artificially
                // added for UI display and not actual tool invocations
                // Tool usage should only come from actual tool_use message content
              }
              
              // Only add messages that have actual text content (ignore tool-only messages)
              if (messageContent.trim()) {
                parsedMetrics.assistantMessages.push({
                  timestamp: event.timestamp || new Date().toISOString(),
                  content: messageContent,
                  model: messageModel,
                  usage: messageUsage,
                  threadId: event.threadId
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
                console.log('[DEBUG] Adding model from assistant_message:', messageModel);
                parsedMetrics.models.push(messageModel);
              }
              break;
              
            case 'token_usage':
            case 'streaming_token_usage':
              // Handle real token usage events
              if (event.totalTokens !== undefined || event.data?.totalTokens !== undefined) {
                parsedMetrics.totalTokens.input += event.promptTokens || event.data?.promptTokens || 0;
                parsedMetrics.totalTokens.output += event.completionTokens || event.data?.completionTokens || 0;
                parsedMetrics.totalTokens.total += event.totalTokens || event.data?.totalTokens || 0;
              }
              const tokenModel = event.model || event.data?.model;
              if (tokenModel && !parsedMetrics.models.includes(tokenModel)) {
                console.log('[DEBUG] Adding model from token_usage:', tokenModel);
                parsedMetrics.models.push(tokenModel);
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
              console.log('[DEBUG] Found tool event:', event.event_type, event.toolName || event.tool || event.data?.tool || event.data?.toolName);
              parsedMetrics.toolUsage.push({
                toolName: event.toolName || event.tool || event.data?.tool || event.data?.toolName,
                timestamp: event.timestamp || new Date().toISOString(),
                args: event.args || event.data?.args || {},
                threadId: event.threadId
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
                    model: event.message.model || getModelDisplayName(session?.modelOverride),
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
                
                // Skip duplicate tool usage extraction - already handled above in the main event loop
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
                message: event.message || event.data?.message || '',
                threadId: event.threadId
              });
              break;
              
            case 'file_edit':
              // Handle file edit events and track lines changed
              // Check both event.data and direct event properties for line counts
              const linesAdded = event.data?.linesAdded ?? event.linesAdded ?? 0;
              const linesDeleted = event.data?.linesDeleted ?? event.linesDeleted ?? 0;
              
              if (linesAdded !== undefined || linesDeleted !== undefined) {
                
                parsedMetrics.linesChanged.added += linesAdded;
                parsedMetrics.linesChanged.deleted += linesDeleted;
                parsedMetrics.linesChanged.total += linesAdded + linesDeleted;
                
                // Track files created/modified
                const filePath = event.data?.path ?? event.path;
                const operation = event.data?.operation ?? event.operation;
                
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
        
        console.log('[DEBUG] Starting file extraction from messages...');
        
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
              console.log('[DEBUG] File classified as CREATED from message:', displayPath);
            } else if (isModification) {
              filesModifiedFromMessages.push(displayPath);
              console.log('[DEBUG] File classified as MODIFIED from message:', displayPath);
            } else {
              // If unclear, default to modified (safer assumption)
              filesModifiedFromMessages.push(displayPath);
              console.log('[DEBUG] File classified as MODIFIED (default) from message:', displayPath);
            }
          }
        }
        
        // Deduplicate tool usage before processing
        console.log('[DEBUG] Raw tool usage before dedup:', parsedMetrics.toolUsage.length);
        console.log('[DEBUG] create_file tools before dedup:', 
          parsedMetrics.toolUsage.filter(t => t.toolName === 'create_file').map(t => ({
            toolName: t.toolName,
            timestamp: t.timestamp,
            args: t.args,
            threadId: t.threadId
          }))
        );
        
        const uniqueToolUsage = parsedMetrics.toolUsage.reduce((unique: any[], tool: any) => {
          // More robust deduplication - use toolName and args only, ignore timestamp differences
          const argsKey = JSON.stringify(tool.args || {});
          const key = `${tool.toolName}-${argsKey}`;
          const exists = unique.some(existing => {
            const existingArgsKey = JSON.stringify(existing.args || {});
            return existing.toolName === tool.toolName && existingArgsKey === argsKey;
          });
          
          if (!exists) {
            unique.push(tool);
          } else {
            console.log('[DEBUG] Filtering duplicate tool:', tool.toolName, argsKey);
          }
          return unique;
        }, []);
        
        console.log('[DEBUG] Unique tool usage after dedup:', uniqueToolUsage.length);
        console.log('[DEBUG] create_file tools after dedup:', 
          uniqueToolUsage.filter(t => t.toolName === 'create_file').map(t => ({
            toolName: t.toolName,
            args: t.args
          }))
        );
        
        parsedMetrics.toolUsage = uniqueToolUsage;
        
        // Extract files from tool usage
        const filesCreatedFromTools = parsedMetrics.toolUsage
        .filter(tool => tool.toolName === 'create_file')
        .map(tool => tool.args?.path)
        .filter(Boolean);
          
        console.log('[DEBUG] Raw files from tools:', filesCreatedFromTools);
          
        const filesModifiedFromTools = parsedMetrics.toolUsage
          .filter(tool => tool.toolName === 'edit_file')
          .map(tool => tool.args?.path)
          .filter(Boolean);
        
        // Helper function to validate if a string is a valid file path
        const isValidFilePath = (path: string): boolean => {
          if (!path || typeof path !== 'string') return false;
          // Filter out JSON objects, arrays, and other non-path strings
          if (path.includes('{') || path.includes('[') || path.includes('"type"')) return false;
          // Must have at least one alphanumeric character
          if (!/[a-zA-Z0-9]/.test(path)) return false;
          // Should not be longer than reasonable file path length
          if (path.length > 500) return false;
          return true;
        };

        // Helper function to normalize file paths for better deduplication
        const normalizePath = (path: string): string => {
          if (!path) return path;
          // Remove file:// prefix if present
          let normalized = path.replace(/^file:\/\/\//, '');
          // Remove surrounding quotes if present (handle 'file.txt' vs file.txt)
          normalized = normalized.replace(/^['"`]|['"`]$/g, '');
          // Get just the filename if it's a full path
          const filename = normalized.split('/').pop() || '';
          // If filename looks reasonable, use it, otherwise keep full path
          return filename.length > 0 && filename.length < 100 ? filename : normalized;
        };
        
        // Normalize paths before deduplication
         const normalizedFromMessages = filesCreatedFromMessages.map(normalizePath);
         const normalizedFromTools = filesCreatedFromTools.map(normalizePath);
         
         console.log('[DEBUG] Files from messages (normalized):', normalizedFromMessages);
         console.log('[DEBUG] Files from tools (normalized):', normalizedFromTools);
         
         // Combine and dedupe files by category, filtering out invalid paths
         const allCreatedFiles = [...normalizedFromMessages, ...normalizedFromTools];
         console.log('[DEBUG] All created files before dedup:', allCreatedFiles);
         
         const deduplicatedFiles = Array.from(new Set(allCreatedFiles)).filter(isValidFilePath);
         console.log('[DEBUG] Files after dedup and filtering:', deduplicatedFiles);
         
         parsedMetrics.filesCreated = deduplicatedFiles;
        
        parsedMetrics.filesModified = Array.from(
        new Set([...filesModifiedFromMessages, ...filesModifiedFromTools])
        ).filter(isValidFilePath);
         
         // Debug and deduplicate models - normalize unknown/empty models first
         console.log('[DEBUG] Raw models before dedup:', parsedMetrics.models);
         
         // Normalize models: treat 'unknown', empty strings, null/undefined as the same
         const normalizedModels = parsedMetrics.models.map(model => {
           if (!model || model === 'unknown' || model === '') {
             return 'Claude Sonnet 4'; // Default model
           }
           return model;
         });
         
         parsedMetrics.models = Array.from(new Set(normalizedModels));
         console.log('[DEBUG] Models after normalization and dedup:', parsedMetrics.models);
        
        // Build threads structure for conversation flow
        const threadMap = new Map<string, {
          id: string;
          name: string;
          messages: Array<{
            type: 'user' | 'assistant';
            timestamp: string;
            content: string;
            model?: string;
            usage?: any;
            tools?: string[];
          }>;
        }>();

        // Initialize threads from threadsData if available
        for (const threadData of threadsData) {
          threadMap.set(threadData.id, {
            id: threadData.id,
            name: threadData.name || `Thread ${threadData.id}`,
            messages: []
          });
        }

        // If no threads data but we have messages, create a default thread
        if (threadMap.size === 0 && (parsedMetrics.userMessages.length > 0 || parsedMetrics.assistantMessages.length > 0)) {
          threadMap.set('default', {
            id: 'default',
            name: 'Main Conversation',
            messages: []
          });
        }

        // Add user messages to threads
        for (const userMsg of parsedMetrics.userMessages) {
          const threadId = userMsg.threadId || 'default';
          const thread = threadMap.get(threadId);
          if (thread) {
            thread.messages.push({
              type: 'user',
              timestamp: userMsg.timestamp,
              content: userMsg.message,
            });
          }
        }

        // Add assistant messages to threads
        for (const assistantMsg of parsedMetrics.assistantMessages) {
          const threadId = assistantMsg.threadId || 'default';
          const thread = threadMap.get(threadId);
          if (thread) {
            // Parse the message content to extract tools
            const parsed = parseMessageContent(assistantMsg.content);
            const toolsFromMessage = parsed.toolCalls.map(tc => tc.name);
            
            // Only use tools that are actually in the message content - don't add related tools
            // based on timing as this causes text messages to incorrectly show tool usage
            const allTools = toolsFromMessage;

            thread.messages.push({
              type: 'assistant',
              timestamp: assistantMsg.timestamp,
              content: assistantMsg.content,
              model: assistantMsg.model,
              usage: assistantMsg.usage,
              tools: allTools.length > 0 ? allTools : undefined
            });
            
            // Add extracted tool calls to the global tool usage tracking
            for (const toolCall of parsed.toolCalls) {
              console.log('[DEBUG] Found parsed tool call (source 3):', toolCall.name);
              parsedMetrics.toolUsage.push({
                toolName: toolCall.name,
                timestamp: assistantMsg.timestamp,
                threadId: threadId,
                args: toolCall.input
              });
            }
          }
        }

        // Sort messages within each thread by timestamp
        for (const thread of threadMap.values()) {
          thread.messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        }

        parsedMetrics.threads = Array.from(threadMap.values());
        
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



      {/* Files Created */}
      {metrics.filesCreated.length > 0 && (
        <div className="bg-gruvbox-bg1 border border-gruvbox-bg3 rounded-lg p-4">
          <h4 className="font-semibold mb-3 text-gruvbox-green">Files Created ({metrics.filesCreated.length})</h4>
          <div className="space-y-1">
            {metrics.filesCreated.map((file, index) => {
              const isFullPath = file.includes('/');
              const filename = isFullPath ? file.replace(/^.*\//, '') : file;
              
              return (
                <div key={index} className="text-sm font-mono text-gruvbox-fg1 bg-gruvbox-bg2 border-l-2 border-gruvbox-green px-2 py-1 rounded flex justify-between items-center">
                  <span title={isFullPath ? file : undefined}>{filename}</span>
                  {isFullPath && (
                    <button 
                      onClick={async () => {
                        try {
                          await window.electronAPI.shell.openPath(file);
                        } catch (error) {
                          console.error('Failed to open file:', error);
                        }
                      }}
                      className="text-gruvbox-blue hover:text-gruvbox-bright-blue text-xs hover:underline cursor-pointer"
                      title="Open file"
                    >
                      Open
                    </button>
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
              
              return (
                <div key={index} className="text-sm font-mono text-gruvbox-fg1 bg-gruvbox-bg2 border-l-2 border-gruvbox-blue px-2 py-1 rounded flex justify-between items-center">
                  <span title={isFullPath ? file : undefined}>{filename}</span>
                  {isFullPath && (
                    <button 
                      onClick={async () => {
                        try {
                          await window.electronAPI.shell.openPath(file);
                        } catch (error) {
                          console.error('Failed to open file:', error);
                        }
                      }}
                      className="text-gruvbox-blue hover:text-gruvbox-bright-blue text-xs hover:underline cursor-pointer"
                      title="Open file"
                    >
                      Open
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Thread Conversations */}
      {metrics.threads && metrics.threads.length > 0 && (
        <div className="bg-gruvbox-bg1 border border-gruvbox-bg3 rounded-lg p-4">
          <h4 className="font-semibold mb-3 text-gruvbox-purple">Conversation Flow</h4>
          {metrics.threads.map((thread, threadIndex) => (
          <div key={thread.id} className="mb-4 last:mb-0">
          <div className="flex justify-between items-start mb-2">
            <div className="font-medium text-gruvbox-fg0">{thread.name}</div>
                <div className="text-xs text-gruvbox-fg2">
                  {thread.messages.length} messages
                </div>
              </div>
              
              {/* Thread Metrics */}
              <div className="grid grid-cols-2 gap-4 mb-3 p-3 bg-gruvbox-bg2 rounded border border-gruvbox-bg3">
                <div className="text-xs">
                  <div className="text-gruvbox-fg2">Messages</div>
                  <div className="text-gruvbox-fg0">
                    {thread.messages?.length || 0} total
                  </div>
                </div>
              </div>
              
              <div className="space-y-2">
                {thread.messages.map((message, msgIndex) => (
                  <div key={msgIndex} className={`p-3 rounded ${
                    message.type === 'user' 
                      ? 'bg-gruvbox-bg2 border-l-4 border-gruvbox-green ml-0' 
                      : 'bg-gruvbox-bg3 border-l-4 border-gruvbox-blue ml-4'
                  }`}>
                    <div className="flex justify-between items-start mb-1">
                      <span className={`text-xs font-medium ${
                        message.type === 'user' ? 'text-gruvbox-green' : 'text-gruvbox-blue'
                      }`}>
                        {message.type === 'user' ? 'User' : 'Assistant'}
                        {message.model && ` (${message.model})`}
                      </span>
                      <span className="text-xs text-gruvbox-fg2">
                        {new Date(message.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-sm text-gruvbox-fg1 whitespace-pre-wrap">
                      {(() => {
                        // Parse JSON content for assistant messages
                        if (message.type === 'assistant' && typeof message.content === 'string' && message.content.startsWith('[')) {
                          try {
                            const parsed = JSON.parse(message.content);
                            if (Array.isArray(parsed)) {
                              const textContent = parsed
                                .filter((item: any) => item.type === 'text')
                                .map((item: any) => item.text)
                                .join(' ');
                              return textContent || message.content;
                            }
                          } catch (err) {
                            // If parsing fails, use raw content
                          }
                        }
                        
                        const content = message.content;
                        return content.length > 500 
                          ? `${content.substring(0, 500)}...` 
                          : content;
                      })()}
                    </div>
                    {message.tools && message.tools.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-gruvbox-bg2">
                        <div className="text-xs text-gruvbox-fg2 mb-1">Tools used:</div>
                        <div className="flex flex-wrap gap-1">
                          {message.tools.map((tool, toolIndex) => (
                            <span key={toolIndex} className="px-2 py-1 bg-gruvbox-bg2 text-xs rounded text-gruvbox-yellow">
                              {tool}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
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

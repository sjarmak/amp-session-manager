import React, { useState, useEffect } from 'react';
import type { Session } from "@ampsm/types";

interface ConversationFlowProps {
  session: Session;
}

interface ParsedStreamMetrics {
  userMessages: Array<{
    timestamp: string;
    message: string;
  }>;
  assistantMessages: Array<{
    timestamp: string;
    content: string;
    model: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
    };
  }>;
}

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

export function ConversationFlow({ session }: ConversationFlowProps) {
  const [metrics, setMetrics] = useState<ParsedStreamMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Debug logging
  console.log('[ConversationFlow] Session data:', { 
    id: session.id, 
    modelOverride: session.modelOverride,
    mappedModel: getModelDisplayName(session.modelOverride)
  });

  useEffect(() => {
    const fetchConversationData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Get stream events from the session
        const streamEventsResult = await window.electronAPI.sessions.getStreamEvents(session.id);
        
        const parsedMetrics: ParsedStreamMetrics = {
          userMessages: [],
          assistantMessages: []
        };

        // Add initial prompt as first user message
        if (session.ampPrompt) {
          parsedMetrics.userMessages.push({
            timestamp: session.createdAt || new Date().toISOString(),
            message: session.ampPrompt
          });
        }

        // Add follow-up prompts
        if (session.followUpPrompts && Array.isArray(session.followUpPrompts)) {
          session.followUpPrompts.forEach((prompt: string, index: number) => {
            const baseTime = new Date(session.createdAt || new Date()).getTime();
            const estimatedTimestamp = new Date(baseTime + (index + 1) * 60000).toISOString();
            
            parsedMetrics.userMessages.push({
              timestamp: estimatedTimestamp,
              message: prompt
            });
          });
        }

        // Parse stream events if available
        if (streamEventsResult.success && streamEventsResult.streamEvents) {
          for (const event of streamEventsResult.streamEvents) {
            if (event.type === 'assistant_message') {
              const textContent = event.data?.content || '';
              if (textContent.trim()) {
                const modelFromEvent = event.data?.model;
                const fallbackModel = getModelDisplayName(session.modelOverride);
                const finalModel = modelFromEvent || fallbackModel;
                console.log('[ConversationFlow] Stream event model resolution:', { 
                  modelFromEvent, 
                  sessionModelOverride: session.modelOverride, 
                  fallbackModel, 
                  finalModel 
                });
                
                parsedMetrics.assistantMessages.push({
                  timestamp: event.timestamp,
                  content: textContent,
                  model: finalModel,
                  usage: event.data?.usage
                });
              }
            } else if (event.type === 'user_message') {
              parsedMetrics.userMessages.push({
                timestamp: event.timestamp,
                message: event.data?.message || ''
              });
            }
          }
        } else {
          // Fallback: get assistant messages from iterations
          const iterationsResult = await window.electronAPI.sessions.getIterations(session.id);
          if (iterationsResult.success) {
            const iterations = iterationsResult.iterations || [];
            for (const iteration of iterations) {
              if (iteration.output) {
                const modelFromIteration = iteration.model;
                const fallbackModel = getModelDisplayName(session.modelOverride);
                const finalModel = modelFromIteration || fallbackModel;
                console.log('[ConversationFlow] Iteration model resolution:', { 
                  modelFromIteration, 
                  sessionModelOverride: session.modelOverride, 
                  fallbackModel, 
                  finalModel 
                });
                
                parsedMetrics.assistantMessages.push({
                  timestamp: iteration.startedAt || new Date().toISOString(),
                  content: iteration.output,
                  model: finalModel,
                  usage: {
                    input_tokens: iteration.promptTokens || 0,
                    output_tokens: iteration.completionTokens || 0
                  }
                });
              }
            }
          }
        }

        setMetrics(parsedMetrics);
      } catch (err) {
        console.error('Error fetching conversation data:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchConversationData();
  }, [session.id, session.ampPrompt, session.followUpPrompts, session.createdAt, JSON.stringify(session.followUpPrompts)]);

  if (loading) {
    return (
      <div className="bg-white p-6 rounded-lg border">
        <div className="flex items-center justify-center py-8">
          <div className="text-gray-500">Loading conversation...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white p-6 rounded-lg border">
        <div className="text-red-600 bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="font-semibold">Error Loading Conversation</h3>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  // Merge and sort all messages chronologically
  const allMessages = [
    ...((metrics?.userMessages || []).map(msg => ({
      type: 'user' as const,
      timestamp: msg.timestamp,
      content: msg.message,
      ...msg
    }))),
    ...((metrics?.assistantMessages || []).map(msg => ({
      type: 'assistant' as const,
      timestamp: msg.timestamp,
      content: msg.content,
      ...msg
    })))
  ].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return (
    <div className="bg-white p-6 rounded-lg border">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Conversation Flow</h3>
      </div>

      {allMessages.length > 0 ? (
        <div className="space-y-4 max-h-96 overflow-y-auto">
          {allMessages.map((msg, index) => (
            <div 
              key={index} 
              className={`border-l-4 pl-4 pr-4 py-3 rounded-r-lg ${
                msg.type === 'user' 
                  ? 'border-purple-400 bg-purple-50' 
                  : 'border-blue-400 bg-blue-50'
              }`}
            >
              <div className="flex justify-between items-start mb-2 gap-4">
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-sm font-semibold ${
                    msg.type === 'user' ? 'text-purple-700' : 'text-blue-700'
                  }`}>
                    {msg.type === 'user' ? 'User' : 'Assistant'}
                  </span>
                  {msg.type === 'assistant' && msg.model && (
                    <span className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded">
                      {msg.model}
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500 text-right flex-shrink-0">
                  <div>{new Date(msg.timestamp).toLocaleString()}</div>
                  {msg.type === 'assistant' && msg.usage && (
                    <div className="mt-1">
                      Tokens: {(msg.usage.input_tokens || 0) + (msg.usage.output_tokens || 0)}
                    </div>
                  )}
                </div>
              </div>
              <div className="text-sm text-gray-800 min-w-0">
                <div className="whitespace-pre-wrap break-words">
                  {(() => {
                    // Parse JSON content for assistant messages
                    if (msg.type === 'assistant' && typeof msg.content === 'string' && msg.content.startsWith('[')) {
                      try {
                        const parsed = JSON.parse(msg.content);
                        if (Array.isArray(parsed)) {
                          const textItems = parsed.filter((item: any) => item.type === 'text');
                          const toolItems = parsed.filter((item: any) => item.type === 'tool_use');
                          
                          const textContent = textItems.map((item: any) => item.text).join(' ');
                          const toolsUsed = toolItems.map((item: any) => item.name).join(', ');
                          
                          return (
                            <div>
                              {textContent && <div>{textContent}</div>}
                              {toolsUsed && (
                                <div className="mt-2 text-xs text-gray-600">
                                  Tools used: {toolsUsed}
                                </div>
                              )}
                            </div>
                          );
                        }
                      } catch (err) {
                        // If parsing fails, show raw content
                      }
                    }
                    
                    const content = msg.content;
                    return content.length > 500 
                      ? `${content.slice(0, 500)}...` 
                      : content;
                  })()}
                </div>
                {msg.content.length > 500 && (
                  <button 
                    className="text-blue-600 hover:text-blue-800 text-xs mt-2 underline"
                    onClick={() => {
                      const element = document.createElement('div');
                      element.innerHTML = `<pre class="whitespace-pre-wrap p-4 bg-gray-100 rounded text-sm">${msg.content}</pre>`;
                      const modal = document.createElement('div');
                      modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
                      modal.innerHTML = `
                        <div class="bg-white rounded-lg p-6 max-w-4xl max-h-96 overflow-y-auto m-4">
                          <div class="flex justify-between items-center mb-4">
                            <h3 class="font-semibold">Full Message</h3>
                            <button class="text-gray-500 hover:text-gray-700" onclick="this.closest('.fixed').remove()">×</button>
                          </div>
                          ${element.innerHTML}
                        </div>
                      `;
                      document.body.appendChild(modal);
                    }}
                  >
                    Show full message
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500">
          No conversation data available
        </div>
      )}
    </div>
  );
}

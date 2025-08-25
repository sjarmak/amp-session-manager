import React from 'react';
import { ToolCallDisplay } from './ToolCallDisplay';

interface StreamMessage {
  type: 'user_message' | 'assistant_message' | 'tool_use' | 'tool_result' | 'text';
  timestamp: string;
  content?: string;
  data?: any;
  model?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
}

interface StreamMessageDisplayProps {
  message: StreamMessage;
  className?: string;
}

export function StreamMessageDisplay({ message, className = '' }: StreamMessageDisplayProps) {
  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  // Handle tool_use messages with nice formatting
  if (message.type === 'tool_use' && message.data) {
    const toolCall = {
      id: message.data.id || 'unknown',
      name: message.data.name || 'unknown_tool',
      input: message.data.input || {},
      timestamp: message.timestamp,
      status: 'success' as const
    };

    return (
      <div className={`mb-3 ${className}`}>
        <ToolCallDisplay toolCall={toolCall} />
      </div>
    );
  }

  // Handle assistant messages
  if (message.type === 'assistant_message') {
    return (
      <div className={`bg-gruvbox-bg2 border-l-4 border-gruvbox-blue rounded-r-lg p-4 mb-3 ${className}`}>
        <div className="flex justify-between items-start mb-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gruvbox-blue">Amp</span>
            {message.model && (
              <span className="text-xs bg-gruvbox-bg3 text-gruvbox-fg2 px-2 py-1 rounded">
                {message.model}
              </span>
            )}
          </div>
          <div className="text-xs text-gruvbox-fg2 text-right">
            <div>{formatTimestamp(message.timestamp)}</div>
            {message.usage && (
              <div className="mt-1">
                Tokens: {(message.usage.input_tokens || 0) + (message.usage.output_tokens || 0)}
              </div>
            )}
          </div>
        </div>
        
        {message.content && (
          <div className="text-sm text-gruvbox-fg1 whitespace-pre-wrap break-words">
            {message.content}
          </div>
        )}
      </div>
    );
  }

  // Handle user messages
  if (message.type === 'user_message') {
    return (
      <div className={`bg-gruvbox-bg2 border-l-4 border-gruvbox-purple rounded-r-lg p-4 mb-3 ${className}`}>
        <div className="flex justify-between items-start mb-2">
          <span className="text-sm font-semibold text-gruvbox-purple">User</span>
          <div className="text-xs text-gruvbox-fg2">
            {formatTimestamp(message.timestamp)}
          </div>
        </div>
        
        <div className="text-sm text-gruvbox-fg1 whitespace-pre-wrap break-words">
          {message.content || message.data?.message || ''}
        </div>
      </div>
    );
  }

  // Handle tool results
  if (message.type === 'tool_result' && message.data) {
    return (
      <div className={`bg-gruvbox-bg1 border border-gruvbox-bg3 rounded-lg p-3 mb-2 ${className}`}>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold text-gruvbox-green">✅ Tool Result</span>
          <span className="text-xs text-gruvbox-fg2">{formatTimestamp(message.timestamp)}</span>
        </div>
        
        {message.data.success !== undefined && (
          <div className={`text-xs px-2 py-1 rounded mb-2 ${
            message.data.success 
              ? 'bg-gruvbox-green/20 text-gruvbox-green' 
              : 'bg-gruvbox-red/20 text-gruvbox-red'
          }`}>
            {message.data.success ? 'Success' : 'Failed'}
          </div>
        )}
        
        {message.data.output && (
          <pre className="text-xs bg-gruvbox-bg2 text-gruvbox-fg1 p-2 rounded overflow-x-auto max-h-32 overflow-y-auto">
            {typeof message.data.output === 'string' ? message.data.output : JSON.stringify(message.data.output, null, 2)}
          </pre>
        )}
      </div>
    );
  }

  // Fallback for other message types
  return (
    <div className={`bg-gruvbox-bg1 border border-gruvbox-bg3 rounded-lg p-3 mb-3 ${className}`}>
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs font-semibold text-gruvbox-fg2 capitalize">
          {message.type.replace('_', ' ')}
        </span>
        <span className="text-xs text-gruvbox-fg2">
          {formatTimestamp(message.timestamp)}
        </span>
      </div>
      
      {message.content && (
        <div className="text-sm text-gruvbox-fg1 whitespace-pre-wrap break-words">
          {message.content}
        </div>
      )}
      
      {message.data && (
        <details className="mt-2">
          <summary className="text-xs text-gruvbox-fg2 cursor-pointer">Raw Data</summary>
          <pre className="text-xs bg-gruvbox-bg2 text-gruvbox-fg1 p-2 rounded overflow-x-auto mt-1">
            {JSON.stringify(message.data, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}

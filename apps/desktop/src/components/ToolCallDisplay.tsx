import React, { useState } from 'react';

interface ToolCall {
  id: string;
  name: string;
  input: any;
  result?: any;
  status?: 'pending' | 'success' | 'error';
  timestamp?: string;
}

interface ToolCallDisplayProps {
  toolCall: ToolCall;
  className?: string;
}

// Helper function to extract filename from path
const getFileName = (path: string): string => {
  if (!path) return '';
  return path.split('/').pop() || path;
};

// Tool-specific formatters for better display
const formatToolInput = (toolName: string, input: any) => {
  switch (toolName) {
    case 'create_file':
      return {
        path: input.path,
        fileName: getFileName(input.path),
        preview: input.content ? `${input.content.slice(0, 100)}${input.content.length > 100 ? '...' : ''}` : ''
      };
    case 'edit_file':
      return {
        path: input.path,
        fileName: getFileName(input.path),
        old_str: input.old_str ? `${input.old_str.slice(0, 50)}${input.old_str.length > 50 ? '...' : ''}` : '',
        new_str: input.new_str ? `${input.new_str.slice(0, 50)}${input.new_str.length > 50 ? '...' : ''}` : ''
      };
    case 'read':
    case 'Read':
      return {
        path: input.path,
        fileName: getFileName(input.path),
        range: input.read_range ? `lines ${input.read_range[0]}-${input.read_range[1]}` : 'full file'
      };
    case 'bash':
    case 'Bash':
      return {
        command: input.cmd,
        cwd: input.cwd || 'default'
      };
    case 'grep':
    case 'Grep':
      return {
        pattern: input.pattern,
        path: input.path || input.glob || 'all files'
      };
    case 'todo_write':
      return {
        todoCount: Array.isArray(input.todos) ? input.todos.length : 'N/A',
        todos: Array.isArray(input.todos) ? input.todos.slice(0, 3) : []
      };
    default:
      return input;
  }
};

const getToolIcon = (toolName: string) => {
  switch (toolName) {
    case 'create_file':
      return '[+]';
    case 'edit_file':
      return '[~]';
    case 'read':
    case 'Read':
      return '[R]';
    case 'bash':
    case 'Bash':
      return '[$]';
    case 'grep':
    case 'Grep':
      return '[?]';
    case 'list_directory':
      return '[D]';
    case 'glob':
      return '[G]';
    case 'todo_write':
      return '[T]';
    default:
      return '[X]';
  }
};

const getToolColor = (toolName: string) => {
  switch (toolName) {
    case 'create_file':
      return 'text-gruvbox-green';
    case 'edit_file':
      return 'text-gruvbox-blue';
    case 'read':
    case 'Read':
      return 'text-gruvbox-purple';
    case 'bash':
    case 'Bash':
      return 'text-gruvbox-orange';
    case 'grep':
    case 'Grep':
      return 'text-gruvbox-yellow';
    default:
      return 'text-gruvbox-fg1';
  }
};

export function ToolCallDisplay({ toolCall, className = '' }: ToolCallDisplayProps) {
  const [expanded, setExpanded] = useState(false);
  const formatted = formatToolInput(toolCall.name, toolCall.input);
  const icon = getToolIcon(toolCall.name);
  const colorClass = getToolColor(toolCall.name);
  
  const statusColors = {
    pending: 'bg-gruvbox-yellow/20 border-gruvbox-yellow',
    success: 'bg-gruvbox-green/20 border-gruvbox-green',
    error: 'bg-gruvbox-red/20 border-gruvbox-red'
  };
  
  const statusColor = statusColors[toolCall.status || 'success'];

  return (
    <div className={`border rounded-lg p-3 ${statusColor} ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-1">
          <span className="text-lg">{icon}</span>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className={`font-semibold capitalize ${colorClass}`}>
                {toolCall.name.replace('_', ' ')}
              </span>
              {toolCall.timestamp && (
                <span className="text-xs text-gruvbox-fg2">
                  {new Date(toolCall.timestamp).toLocaleTimeString()}
                </span>
              )}
            </div>
            
            {/* Tool-specific formatted display */}
            <div className="text-sm text-gruvbox-fg1 space-y-1">
              {toolCall.name === 'create_file' && (
                <>
                  <div className="font-mono text-gruvbox-blue" title={formatted.path}>
                    <span className="bg-gruvbox-blue/20 text-gruvbox-blue px-2 py-1 rounded border border-gruvbox-blue/40 hover:bg-gruvbox-blue/30 cursor-help transition-colors font-semibold" title={formatted.path}>
                      {formatted.fileName}
                    </span>
                  </div>
                  {formatted.preview && (
                    <div className="text-gruvbox-fg2 italic">{formatted.preview}</div>
                  )}
                </>
              )}
              
              {toolCall.name === 'edit_file' && (
                <>
                  <div className="font-mono text-gruvbox-blue" title={formatted.path}>
                    <span className="bg-gruvbox-blue/20 text-gruvbox-blue px-1 py-0.5 rounded border border-gruvbox-blue/40 hover:bg-gruvbox-blue/30 cursor-help transition-colors font-semibold text-xs" title={formatted.path}>
                      {formatted.fileName}
                    </span>
                  </div>
                  <div className="text-gruvbox-red">- {formatted.old_str}</div>
                  <div className="text-gruvbox-green">+ {formatted.new_str}</div>
                </>
              )}
              
              {(toolCall.name === 'read' || toolCall.name === 'Read') && (
                <>
                  <div className="font-mono text-gruvbox-purple" title={formatted.path}>
                    <span className="bg-gruvbox-purple/20 text-gruvbox-purple px-1 py-0.5 rounded border border-gruvbox-purple/40 hover:bg-gruvbox-purple/30 cursor-help transition-colors font-semibold text-xs" title={formatted.path}>
                      {formatted.fileName}
                    </span>
                  </div>
                  <div className="text-gruvbox-fg2">{formatted.range}</div>
                </>
              )}
              
              {(toolCall.name === 'bash' || toolCall.name === 'Bash') && (
                <>
                  <div className="font-mono text-gruvbox-orange bg-gruvbox-bg2 px-2 py-1 rounded">
                    $ {formatted.command}
                  </div>
                  {formatted.cwd !== 'default' && (
                    <div className="text-gruvbox-fg2">in {formatted.cwd}</div>
                  )}
                </>
              )}
              
              {(toolCall.name === 'grep' || toolCall.name === 'Grep') && (
                <>
                  <div className="font-mono text-gruvbox-yellow">
                    "{formatted.pattern}" in {formatted.path}
                  </div>
                </>
              )}
              
              {toolCall.name === 'todo_write' && (
                <>
                  <div className="text-gruvbox-cyan">
                    Updated {formatted.todoCount} todo items
                  </div>
                  {formatted.todos && formatted.todos.length > 0 && (
                    <div className="space-y-1 mt-2">
                      {formatted.todos.map((todo: any, idx: number) => (
                        <div key={idx} className="text-xs bg-gruvbox-bg2 p-2 rounded border-l-2 border-gruvbox-cyan/40">
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${
                              todo.status === 'completed' ? 'bg-gruvbox-green' :
                              todo.status === 'in-progress' ? 'bg-gruvbox-yellow' :
                              'bg-gruvbox-fg2'
                            }`}></span>
                            <span className="text-gruvbox-fg1">{todo.content}</span>
                          </div>
                        </div>
                      ))}
                      {formatted.todoCount > 3 && (
                        <div className="text-xs text-gruvbox-fg2 italic">
                          ...and {formatted.todoCount - 3} more todos
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
              
              {!['create_file', 'edit_file', 'read', 'Read', 'bash', 'Bash', 'grep', 'Grep', 'todo_write'].includes(toolCall.name) && (
                <div className="font-mono text-gruvbox-fg2">
                  {Object.entries(formatted).map(([key, value]) => (
                    <div key={key} className="flex gap-2">
                      <span className="text-gruvbox-fg2">{key}:</span>
                      <span>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Expand/collapse button for raw details */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-gruvbox-fg2 hover:text-gruvbox-fg1 text-xs px-2 py-1 rounded border border-gruvbox-bg4 hover:border-gruvbox-fg2 transition-colors"
        >
          {expanded ? 'Hide' : 'Details'}
        </button>
      </div>
      
      {/* Raw JSON details (collapsible) */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-gruvbox-bg4">
          <div className="text-xs">
            <div className="font-semibold text-gruvbox-fg0 mb-2">Raw Input:</div>
            <pre className="bg-gruvbox-bg2 text-gruvbox-fg1 p-2 rounded overflow-x-auto text-xs">
              {JSON.stringify(toolCall.input, null, 2)}
            </pre>
            
            {toolCall.result && (
              <>
                <div className="font-semibold text-gruvbox-fg0 mb-2 mt-3">Result:</div>
                <pre className="bg-gruvbox-bg2 text-gruvbox-fg1 p-2 rounded overflow-auto text-xs max-h-32">
                  {typeof toolCall.result === 'string' ? toolCall.result : JSON.stringify(toolCall.result, null, 2)}
                </pre>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect, useRef } from 'react';

interface TodoItem {
  id: string;
  content: string;
  status: 'todo' | 'in-progress' | 'completed';
  priority: 'low' | 'medium' | 'high';
}

interface TodoAnchorProps {
  className?: string;
}

export function TodoAnchor({ className = '' }: TodoAnchorProps) {
  const [currentTodos, setCurrentTodos] = useState<TodoItem[]>([]);
  const [previousTodos, setPreviousTodos] = useState<TodoItem[]>([]);
  const [isVisible, setIsVisible] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const anchorRef = useRef<HTMLDivElement>(null);

  // Listen for todo_write events to update the displayed todos
  useEffect(() => {
    const handleTodoUpdate = (event: CustomEvent<{ todos: TodoItem[] }>) => {
      const newTodos = event.detail.todos;
      
      // Keep track of previous todos to show strikethrough effect
      setCurrentTodos(prevCurrent => {
        setPreviousTodos(prevCurrent);
        return newTodos;
      });
      
      // Show the anchor when todos are present
      setIsVisible(newTodos.length > 0);
    };

    // Custom event listener for todo updates
    window.addEventListener('todoUpdate' as any, handleTodoUpdate);
    
    return () => {
      window.removeEventListener('todoUpdate' as any, handleTodoUpdate);
    };
  }, []);

  // Combine current and previous todos to show completed ones with strikethrough
  const displayTodos = React.useMemo(() => {
    const todos = [...currentTodos];
    
    // Add completed todos from previous state that aren't in current todos
    previousTodos.forEach(prevTodo => {
      if (prevTodo.status === 'completed') {
        const stillExists = todos.find(t => t.id === prevTodo.id);
        if (!stillExists) {
          todos.push({ ...prevTodo, status: 'completed' });
        }
      }
    });
    
    return todos.sort((a, b) => {
      // Sort by status: in-progress, todo, completed
      const statusOrder = { 'in-progress': 0, 'todo': 1, 'completed': 2 };
      return statusOrder[a.status] - statusOrder[b.status];
    });
  }, [currentTodos, previousTodos]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return '✓';
      case 'in-progress':
        return '●';
      default:
        return '○';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-gruvbox-green';
      case 'in-progress':
        return 'text-gruvbox-yellow';
      default:
        return 'text-gruvbox-fg2';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'border-l-gruvbox-red';
      case 'medium':
        return 'border-l-gruvbox-yellow';
      default:
        return 'border-l-gruvbox-blue';
    }
  };

  if (!isVisible || displayTodos.length === 0) {
    return null;
  }

  return (
    <div 
      ref={anchorRef}
      className={`fixed bottom-4 right-4 max-w-sm bg-gruvbox-bg1 border border-gruvbox-bg3 rounded-lg shadow-lg z-50 ${className}`}
    >
      <div className="p-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-gruvbox-aqua font-bold text-sm">TODO Progress</span>
            <span className="text-xs text-gruvbox-fg2 bg-gruvbox-bg2 px-2 py-0.5 rounded">
              {displayTodos.filter(t => t.status === 'completed').length}/{displayTodos.length}
            </span>
          </div>
          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-gruvbox-fg2 hover:text-gruvbox-aqua text-xs font-bold px-1 py-0.5 rounded hover:bg-gruvbox-bg2"
            title={isExpanded ? "Minimize" : "Expand"}
          >
            {isExpanded ? '−' : '+'}
          </button>
        </div>
        
        {isExpanded && (
          <>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {displayTodos.map((todo) => (
                <div 
                  key={todo.id} 
                  className={`text-xs bg-gruvbox-bg2 p-2 rounded border-l-2 ${getPriorityColor(todo.priority)} ${
                    todo.status === 'completed' ? 'opacity-60' : ''
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className={`${getStatusColor(todo.status)} flex-shrink-0 text-sm`}>
                      {getStatusIcon(todo.status)}
                    </span>
                    <span 
                      className={`text-gruvbox-fg1 leading-relaxed ${
                        todo.status === 'completed' ? 'line-through' : ''
                      }`}
                    >
                      {todo.content}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            
            {/* Progress indicator */}
            <div className="mt-3 pt-2 border-t border-gruvbox-bg3">
              <div className="w-full bg-gruvbox-bg3 rounded-full h-1.5">
                <div 
                  className="bg-gruvbox-green h-1.5 rounded-full transition-all duration-300"
                  style={{ 
                    width: `${displayTodos.length > 0 ? (displayTodos.filter(t => t.status === 'completed').length / displayTodos.length) * 100 : 0}%` 
                  }}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

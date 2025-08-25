import React, { useState, useEffect, useRef } from 'react';
import type { Session } from '@ampsm/types';

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface Thread {
  id: string;
  sessionId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  messageCount: number;
}

interface InteractiveTabProps {
  session: Session;
}

type ConnectionState = 'connecting' | 'ready' | 'closed' | 'error';

export function InteractiveTab({ session }: InteractiveTabProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [connectionState, setConnectionState] = useState<ConnectionState>('closed');
  const [error, setError] = useState<string | null>(null);
  const [isStarted, setIsStarted] = useState(false);
  const [threadId, setThreadId] = useState('');
  const [showThreadDropdown, setShowThreadDropdown] = useState(false);
  const [availableThreads, setAvailableThreads] = useState<Thread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load message history and threads when component mounts
  useEffect(() => {
    loadMessageHistory();
    loadAvailableThreads();
  }, [session.id]);

  // Reload messages when selectedThreadId changes
  useEffect(() => {
    if (selectedThreadId) {
      loadThreadMessages(selectedThreadId);
    }
  }, [selectedThreadId]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowThreadDropdown(false);
      }
    };

    if (showThreadDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showThreadDropdown]);

  // Set up event listeners
  useEffect(() => {
    const unsubEvent = window.electronAPI.interactive.onEvent((sessionId, event) => {
      if (sessionId !== session.id) return;
      
      if (event.type === 'assistant_message' && event.data?.content) {
        const textContent = event.data.content
          .filter((c: any) => c.type === 'text')
          .map((c: any) => c.text)
          .join(' ');
          
        if (textContent.trim()) {
          addMessage('assistant', textContent);
        }
      } else if (event.type === 'output' && event.data?.content) {
        // Handle user messages that come back from stdout (like Go implementation)
        const textContent = event.data.content
          .filter((c: any) => c.type === 'text')
          .map((c: any) => c.text)
          .join(' ');
          
        if (textContent.trim()) {
          addMessage('user', textContent);
        }
      }
    });

    const unsubState = window.electronAPI.interactive.onState((sessionId, state) => {
      if (sessionId !== session.id) return;
      setConnectionState(state as ConnectionState);
      setError(null);
    });

    const unsubError = window.electronAPI.interactive.onError((sessionId, errorMsg) => {
      if (sessionId !== session.id) return;
      setError(errorMsg);
      setConnectionState('error');
    });

    return () => {
      unsubEvent();
      unsubState();
      unsubError();
    };
  }, [session.id]);

  const loadAvailableThreads = async () => {
    try {
      const result = await window.electronAPI.sessions.getThreads(session.id);
      if (result.success && result.threads) {
        console.log('Available threads for session:', session.id, result.threads);
        setAvailableThreads(result.threads);
        // If there are threads and no current selection, select the most recent one (unless we're starting a new thread)
        if (result.threads.length > 0 && !selectedThreadId && !session.threadId) {
          const mostRecentThread = result.threads[0]; // threads are sorted by updatedAt DESC
          console.log('Selecting most recent thread:', mostRecentThread);
          setSelectedThreadId(mostRecentThread.id);
          setThreadId(mostRecentThread.id);
          // Load messages for this thread only if we're not in a fresh new thread state
          if (selectedThreadId !== null) {
            loadThreadMessages(mostRecentThread.id);
          }
        } else if (session.threadId && !selectedThreadId) {
          // If session has a threadId, use it
          console.log('Using session threadId:', session.threadId);
          setSelectedThreadId(session.threadId);
          setThreadId(session.threadId);
        }
      } else {
        console.log('No threads found for session:', session.id);
      }
    } catch (err) {
      console.error('Failed to load available threads:', err);
    }
  };

  const loadThreadMessages = async (threadIdToLoad: string) => {
    try {
      console.log('Loading messages for thread:', threadIdToLoad);
      // Get messages from the thread storage system
      const result = await window.electronAPI.sessions.getThreadMessages(threadIdToLoad);
      console.log('Thread messages result:', result);
      if (result.success && result.messages && result.messages.length > 0) {
        const historyMessages: ChatMessage[] = result.messages.map((msg: any) => {
          // Parse message content if it's JSON
          let content = msg.content;
          try {
            // Try to parse as JSON array (Amp format)
            const parsed = JSON.parse(content);
            if (Array.isArray(parsed)) {
              content = parsed
                .filter((c: any) => c.type === 'text')
                .map((c: any) => c.text)
                .join(' ');
            }
          } catch {
            // If it's not JSON, use as-is
          }
          
          return {
            id: msg.id,
            sender: msg.role as 'user' | 'assistant',
            content: content.trim() || msg.content,
            timestamp: msg.createdAt
          };
        });
        
        console.log('Loaded thread messages:', historyMessages);
        setMessages(historyMessages);
      } else {
        // Fallback to interactive history if no thread messages found
        console.log('No thread messages found, trying interactive history as fallback');
        await loadInteractiveHistory();
      }
    } catch (err) {
      console.error('Failed to load thread messages:', err);
      // Fallback to interactive history
      await loadInteractiveHistory();
    }
  };

  const loadInteractiveHistory = async () => {
    try {
      const result = await window.electronAPI.interactive.getHistory(session.id);
      if (result.success && result.events) {
        const historyMessages: ChatMessage[] = [];
        
        for (const event of result.events) {
          if (event.type === 'user' && event.message?.content) {
            const textContent = event.message.content
              .filter((c: any) => c.type === 'text')
              .map((c: any) => c.text)
              .join(' ');
            
            if (textContent.trim()) {
              historyMessages.push({
                id: `user-${event.timestamp || Date.now()}`,
                sender: 'user',
                content: textContent,
                timestamp: event.timestamp || new Date().toISOString()
              });
            }
          } else if (event.type === 'assistant' && event.message?.content) {
            const textContent = event.message.content
              .filter((c: any) => c.type === 'text')
              .map((c: any) => c.text)
              .join(' ');
            
            if (textContent.trim()) {
              historyMessages.push({
                id: `assistant-${event.timestamp || Date.now()}`,
                sender: 'assistant',
                content: textContent,
                timestamp: event.timestamp || new Date().toISOString()
              });
            }
          }
        }
        
        setMessages(historyMessages);
      }
    } catch (err) {
      console.error('Failed to load interactive history:', err);
    }
  };

  const loadMessageHistory = async () => {
    if (selectedThreadId) {
      loadThreadMessages(selectedThreadId);
    } else {
      // Fallback to loading any existing messages
      await loadInteractiveHistory();
    }
  };

  const addMessage = (sender: 'user' | 'assistant', content: string) => {
    const newMessage: ChatMessage = {
      id: `${sender}-${Date.now()}-${Math.random()}`,
      sender,
      content,
      timestamp: new Date().toISOString()
    };
    
    setMessages(prev => [...prev, newMessage]);
  };

  const startNewThread = async () => {
    // Stop any existing session first
    if (isStarted) {
      await stopInteractiveSession();
    }
    
    // Reset all state for a fresh start
    setSelectedThreadId(null);
    setThreadId('new'); // Special marker to force new thread creation
    setMessages([]);
    setError(null);
    setConnectionState('closed');
    setIsStarted(false);
    setInput('');
    
    // Reload available threads to get updated list
    await loadAvailableThreads();
  };

  const startInteractiveSession = async () => {
    setError(null);
    setConnectionState('connecting');
    setIsStarted(true);
    
    try {
      const result = await window.electronAPI.interactive.start(session.id, threadId || undefined);
      
      if (!result.success) {
        setError(result.error || 'Failed to start interactive session');
        setConnectionState('error');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start session');
      setConnectionState('error');
    }
  };

  const stopInteractiveSession = async () => {
    try {
      await window.electronAPI.interactive.stop(session.id);
      setConnectionState('closed');
      setIsStarted(false);
    } catch (err) {
      console.error('Failed to stop interactive session:', err);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || connectionState !== 'ready') return;
    
    const messageText = input.trim();
    setInput('');
    
    // Don't add user message to UI immediately - it will come back from stdout
    
    try {
      const result = await window.electronAPI.interactive.send(session.id, messageText);
      if (!result.success) {
        setError(result.error || 'Failed to send message');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      sendMessage();
    }
  };

  const getConnectionBadge = () => {
    const colors = {
      connecting: 'bg-gruvbox-yellow/20 text-gruvbox-bright-yellow border-gruvbox-yellow',
      ready: 'bg-gruvbox-green/20 text-gruvbox-bright-green border-gruvbox-green',
      closed: 'bg-gruvbox-bg3 text-gruvbox-fg2 border-gruvbox-bg4',
      error: 'bg-gruvbox-red/20 text-gruvbox-bright-red border-gruvbox-red'
    };
    
    return (
      <span className={`px-2 py-1 text-xs rounded border ${colors[connectionState]}`}>
        {connectionState}
      </span>
    );
  };

  return (
    <div className="flex flex-col h-full max-h-[600px]">
      {/* Header with connection status */}
      <div className="flex items-center justify-between p-4 border-b border-gruvbox-bg3">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-gruvbox-fg0">Interactive Chat</h3>
          {getConnectionBadge()}
        </div>
        
        <div className="flex gap-2 items-center">
          {availableThreads.length > 0 && (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowThreadDropdown(!showThreadDropdown)}
                className="px-3 py-1 bg-gruvbox-bg3 text-gruvbox-fg1 rounded text-sm hover:bg-gruvbox-bg2 border border-gruvbox-bg4 flex items-center gap-2"
              >
                {selectedThreadId 
                  ? (() => {
                      const thread = availableThreads.find(t => t.id === selectedThreadId);
                      if (!thread) return 'Thread';
                      // Show thread name with short ID for uniqueness
                      return `${thread.name} (${thread.id.slice(0, 6)})`;
                    })()
                  : 'Select Thread'
                }
                <span className="text-xs">▼</span>
              </button>
              {showThreadDropdown && (
                <div className="absolute right-0 top-full mt-1 bg-gruvbox-bg1 border border-gruvbox-bg3 rounded-md shadow-lg z-10 min-w-48">
                  <div className="py-1">
                    <button
                      onClick={() => {
                        startNewThread();
                        setShowThreadDropdown(false);
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-gruvbox-fg2 hover:bg-gruvbox-bg2 border-b border-gruvbox-bg3"
                    >
                      Start New Thread
                    </button>
                    {availableThreads.map((thread) => (
                      <button
                        key={thread.id}
                        onClick={() => {
                          setSelectedThreadId(thread.id);
                          setThreadId(thread.id);
                          loadThreadMessages(thread.id);
                          setShowThreadDropdown(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-gruvbox-bg2 ${
                          selectedThreadId === thread.id ? 'bg-gruvbox-bg2 text-gruvbox-bright-blue' : 'text-gruvbox-fg1'
                        }`}
                      >
                        <div className="font-medium">{thread.name}</div>
                        <div className="text-xs text-gruvbox-fg2">
                        ID: {thread.id.slice(0, 8)}... • {thread.messageCount} messages • {new Date(thread.updatedAt).toLocaleDateString()}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          
          {/* New Thread button when no threads exist or as a standalone option */}
          {(availableThreads.length === 0 || isStarted) && (
            <button
              onClick={startNewThread}
              className="px-3 py-1 bg-gruvbox-bg3 text-gruvbox-fg1 rounded text-sm hover:bg-gruvbox-bg2 border border-gruvbox-bg4"
            >
              New Thread
            </button>
          )}
          
          {!isStarted ? (
            <button
              onClick={startInteractiveSession}
              className="px-3 py-1 bg-gruvbox-bright-green text-gruvbox-bg0 rounded text-sm hover:bg-gruvbox-green"
            >
              Start Chat
            </button>
          ) : (
            <button
              onClick={stopInteractiveSession}
              className="px-3 py-1 bg-gruvbox-bright-red text-gruvbox-bg0 rounded text-sm hover:bg-gruvbox-red"
            >
              Stop Chat
            </button>
          )}
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="p-3 bg-gruvbox-red/20 border-b border-gruvbox-red text-gruvbox-bright-red text-sm">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 underline hover:no-underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {messages.length === 0 ? (
          <div className="text-center text-gruvbox-fg2 py-8">
            {!isStarted ? (
              <p>Click "Start Chat" to begin an interactive conversation with Amp</p>
            ) : (
              <p>No messages yet. Type a message below to start the conversation.</p>
            )}
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] p-3 rounded-lg text-sm ${
                  message.sender === 'user'
                    ? 'bg-gruvbox-bright-blue text-gruvbox-bg0'
                    : 'bg-gruvbox-bg2 text-gruvbox-fg1 border border-gruvbox-bg3'
                }`}
              >
                <div className="whitespace-pre-wrap">{message.content}</div>
                <div
                  className={`text-xs mt-1 opacity-70 ${
                    message.sender === 'user' ? 'text-gruvbox-bg0' : 'text-gruvbox-fg2'
                  }`}
                >
                  {new Date(message.timestamp).toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-gruvbox-bg3 p-4">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={
              connectionState === 'ready' 
                ? "Type a message..."
                : "Start the chat session to send messages"
            }
            disabled={connectionState !== 'ready'}
            rows={2}
            className="flex-1 px-3 py-2 bg-gruvbox-bg2 border border-gruvbox-bg3 text-gruvbox-fg1 rounded-md focus:outline-none focus:ring-2 focus:ring-gruvbox-bright-blue disabled:opacity-50 disabled:cursor-not-allowed resize-none"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || connectionState !== 'ready'}
            className="px-4 py-2 bg-gruvbox-bright-blue text-gruvbox-bg0 rounded-md hover:bg-gruvbox-blue disabled:opacity-50 disabled:cursor-not-allowed self-end"
          >
            Send
          </button>
        </div>
        <div className="text-xs text-gruvbox-fg2 mt-1">
          Press {navigator.platform.toLowerCase().includes('mac') ? 'Cmd' : 'Ctrl'}+Enter to send, Enter for new line
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect, useRef } from 'react';
import type { Session } from '@ampsm/types';
import { StreamMessageDisplay } from './StreamMessageDisplay';
import { ToolCallDisplay } from './ToolCallDisplay';
import { RenderMarkdownContent } from '../utils/renderMarkdown';

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: string;
  toolCall?: {
    id: string;
    name: string;
    input: any;
    result?: any;
    status?: 'pending' | 'success' | 'error';
  };
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
  initialThreadId?: string | null;
  onThreadSelected?: (threadId: string | null) => void;
  onThreadsUpdated?: () => void;
}

type ConnectionState = 'connecting' | 'ready' | 'closed' | 'error';

export function InteractiveTab({ session, initialThreadId, onThreadSelected, onThreadsUpdated }: InteractiveTabProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [connectionState, setConnectionState] = useState<ConnectionState>('closed');
  const [error, setError] = useState<string | null>(null);
  const [isStarted, setIsStarted] = useState(false);
  const [threadId, setThreadId] = useState('');
  const [showThreadDropdown, setShowThreadDropdown] = useState(false);
  const [availableThreads, setAvailableThreads] = useState<Thread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isCreatingNewThread, setIsCreatingNewThread] = useState(false);
  const [isStartingNewThread, setIsStartingNewThread] = useState(false);
  const [handleId, setHandleId] = useState<string | null>(null);
  const [userScrolledUp, setUserScrolledUp] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const isCreatingNewThreadRef = useRef(isCreatingNewThread);
  const selectedThreadIdRef = useRef(selectedThreadId);
  const startInFlight = useRef<Promise<void> | null>(null);

  // Keep refs in sync with state
  useEffect(() => { 
    isCreatingNewThreadRef.current = isCreatingNewThread; 
  }, [isCreatingNewThread]);
  
  useEffect(() => { 
    selectedThreadIdRef.current = selectedThreadId; 
  }, [selectedThreadId]);

  // Track scroll position to detect if user scrolled up manually
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 10;
      setUserScrolledUp(!isAtBottom);
    };

    scrollContainer.addEventListener('scroll', handleScroll);
    return () => scrollContainer.removeEventListener('scroll', handleScroll);
  }, []);

  // Auto-scroll to bottom when new messages arrive, but only if user hasn't scrolled up
  useEffect(() => {
    if (!userScrolledUp && messagesEndRef.current) {
      // Use a small delay to avoid rapid successive scrolls
      const timeoutId = setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [messages, userScrolledUp]);

  // Load message history and threads when component mounts
  useEffect(() => {
    loadMessageHistory();
    loadAvailableThreads();
  }, [session.id]);

  // Reload messages when selectedThreadId changes
  useEffect(() => {
    if (selectedThreadId && !isCreatingNewThread && !isLoadingMessages && !isStartingNewThread) {
      console.log('useEffect: selectedThreadId changed, loading messages for:', selectedThreadId);
      loadThreadMessages(selectedThreadId);
    } else if (!selectedThreadId && !isCreatingNewThread && !isStartingNewThread) {
      console.log('useEffect: no selectedThreadId, clearing messages');
      setMessages([]);
    }
  }, [selectedThreadId, isCreatingNewThread, isLoadingMessages, isStartingNewThread]);

  // Handle initialThreadId from parent component
  useEffect(() => {
    if (initialThreadId && initialThreadId !== selectedThreadId) {
      console.log('Setting thread from initialThreadId:', initialThreadId);
      setSelectedThreadId(initialThreadId);
      setThreadId(initialThreadId);
      onThreadSelected?.(initialThreadId);
      loadThreadMessages(initialThreadId);
    }
  }, [initialThreadId, availableThreads]);

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
    const unsubEvent = window.electronAPI.interactive.onEvent((sessionId, evtHandleId, event) => {
      if (sessionId !== session.id || evtHandleId !== handleId) return;
      
      console.log('[DEBUG] Frontend: Received event:', { type: event?.type, subtype: event?.subtype, session_id: event?.session_id, isCreatingNewThread });
      
      // Handle system:init events to capture new thread IDs
      if (event?.type === 'system' && event?.subtype === 'init' && event?.session_id) {
        console.log('[DEBUG] Frontend: Received system:init, capturing thread ID:', event.session_id);
        
        // If we're creating a new thread OR if thread validation failed and a new thread was created
        if (isCreatingNewThread || (selectedThreadId && event.session_id !== selectedThreadId)) {
          console.log('=== FRONTEND DEBUG: New thread created with ID:', event.session_id, '===');
          setThreadId(event.session_id);
          setSelectedThreadId(event.session_id);
          setIsCreatingNewThread(false);
          // Don't call onThreadSelected here - it would trigger switchToThread and cause a double startInteractiveSession call
          // Clear messages to ensure fresh start for new thread
          setMessages([]);
          // Reload threads to include the new one
          loadAvailableThreads(true);
          // Notify parent that threads have been updated
          onThreadsUpdated?.();
          
          // If thread validation failed, notify user
          if (selectedThreadId && event.session_id !== selectedThreadId) {
            console.log(`Thread validation failed for ${selectedThreadId}, created new thread ${event.session_id}`);
          }
        }
        return;
      }
      
      // First, check if event is a JSON array string (the common case shown in the screenshot)
      if (typeof event === 'string' && event.startsWith('[')) {
        try {
          const parsedArray = JSON.parse(event);
          if (Array.isArray(parsedArray)) {
            // Process each item in the array
            for (const item of parsedArray) {
              if (item.type === 'tool_use') {
                addToolMessage({
                  id: item.id || `tool_${Date.now()}`,
                  name: item.name || 'unknown_tool',
                  input: item.input || {},
                  status: 'success'
                });
              } else if (item.type === 'text' && item.text?.trim()) {
                addMessage('assistant', item.text);
              }
            }
            return;
          }
        } catch (err) {
          // If parsing fails, continue with other handlers
        }
      }
      
      // Handle tool_use events with proper formatting
      if (event.type === 'tool_use' || (event.data?.type === 'tool_use')) {
        const toolData = event.data || event;
        addToolMessage({
          id: toolData.id || `tool_${Date.now()}`,
          name: toolData.name || 'unknown_tool',
          input: toolData.input || {},
          status: 'success'
        });
        return;
      }
      
      if (event.type === 'assistant_message' && event.data?.content) {
        // Check if this message contains tool calls
        const toolCalls = event.data.content.filter((c: any) => c.type === 'tool_use');
        const textContent = event.data.content
          .filter((c: any) => c.type === 'text')
          .map((c: any) => c.text)
          .join(' ');
        
        // Add tool calls first
        for (const toolCall of toolCalls) {
          addToolMessage({
            id: toolCall.id || `tool_${Date.now()}`,
            name: toolCall.name || 'unknown_tool',
            input: toolCall.input || {},
            status: 'success'
          });
        }
        
        // Then add text content if available
        if (textContent.trim()) {
          addMessage('assistant', textContent, event.data?.session_id || (event as any).session_id);
        }
      } else if (event.type === 'output' && event.data?.content) {
        // Handle user messages that come back from stdout (like Go implementation)
        const textContent = event.data.content
          .filter((c: any) => c.type === 'text')
          .map((c: any) => c.text)
          .join(' ');
          
        if (textContent.trim()) {
          addMessage('user', textContent, event.data?.session_id || (event as any).session_id);
        }
      } else if (typeof event === 'string' && event.includes('tool_use')) {
        // Handle raw JSON strings that might contain tool_use
        try {
          const parsed = JSON.parse(event);
          if (parsed.type === 'tool_use') {
            addToolMessage({
              id: parsed.id || `tool_${Date.now()}`,
              name: parsed.name || 'unknown_tool',
              input: parsed.input || {},
              status: 'success'
            });
            return;
          }
        } catch (err) {
          // If parsing fails, skip displaying raw JSON
          return;
        }
      } else {
        // Fallback: try to parse any string event as JSON for tool_use only
        if (typeof event === 'string') {
          try {
            const parsed = JSON.parse(event);
            if (parsed.type === 'tool_use') {
              addToolMessage({
                id: parsed.id || `tool_${Date.now()}`,
                name: parsed.name || 'unknown_tool',
                input: parsed.input || {},
                status: 'success'
              });
              return;
            }
            // Skip system messages (output, initialization, etc.)
            if (parsed.type === 'output' || parsed.data?.chunk || parsed.data?.subtype) {
              return;
            }
          } catch (err) {
            // Not JSON, ignore silently unless it's clearly a user message
          }
        }
        
        // Don't display raw JSON strings in the UI
        if (typeof event === 'string' && (event.includes('"type":') || event.startsWith('['))) {
          return;
        }
      }
    });

    const unsubState = window.electronAPI.interactive.onState((sessionId, stateHandleId, state) => {
      if (sessionId !== session.id || stateHandleId !== handleId) return;
      setConnectionState(state as ConnectionState);
      setError(null);
    });

    const unsubError = window.electronAPI.interactive.onError((sessionId, errorHandleId, errorMsg) => {
      if (sessionId !== session.id || errorHandleId !== handleId) return;
      setError(errorMsg);
      setConnectionState('error');
    });

    return () => {
      unsubEvent();
      unsubState();
      unsubError();
    };
  }, [session.id, isCreatingNewThread, handleId]);

  const loadAvailableThreads = async (skipAutoSelection = false) => {
    try {
      const result = await window.electronAPI.sessions.getThreads(session.id);
      if (result.success && result.threads) {
        console.log('Available threads for session:', session.id, result.threads);
        // Filter out threads that start with "Chat" (legacy) but be more permissive with IDs
        const validThreads = result.threads.filter(thread => {
          const isValidId = thread.id.startsWith('T-');
          const isNotChatName = !thread.name.startsWith('Chat ');
          const hasMessages = thread.messageCount > 0;
          
          console.log(`Thread ${thread.id} (${thread.name}): validId=${isValidId}, notChatName=${isNotChatName}, hasMessages=${hasMessages}`);
          
          // Include threads with proper IDs OR threads that have messages (even if legacy format)
          return isValidId && (isNotChatName || hasMessages);
        });
        console.log('Raw threads:', result.threads.length, 'Filtered valid threads:', validThreads.length, validThreads);
        setAvailableThreads(validThreads);
        
        // Only auto-select if not skipping and not creating a new thread
        if (!skipAutoSelection && !isCreatingNewThread) {
          // Don't auto-select threads - let the backend logic handle thread selection
          // The backend will use current amp thread if it belongs to this session, 
          // or create a new thread if needed. This prevents trying to continue 
          // orphaned threads that don't exist on ampcode.com.
          if (session.threadId && !selectedThreadId) {
            // Only use session.threadId if it's set (indicates a specific thread choice)
            console.log('Using explicitly set session threadId:', session.threadId);
            setSelectedThreadId(session.threadId);
            setThreadId(session.threadId);
          } else if (!initialThreadId) {
            // Only clear selection if there's no initialThreadId pending
            // No pre-selection - let backend handle thread selection
            console.log('No thread pre-selected - backend will handle thread selection');
            setSelectedThreadId(null);
            setThreadId('');
          }
        }
      } else {
        console.log('No threads found for session:', session.id);
      }
    } catch (err) {
      console.error('Failed to load available threads:', err);
    }
  };

  const loadThreadMessages = async (threadIdToLoad: string) => {
    if (isLoadingMessages) {
      console.log('Already loading messages, skipping duplicate request');
      return;
    }
    
    setIsLoadingMessages(true);
    try {
      console.log('Loading messages for thread:', threadIdToLoad);
      // Get messages from the thread storage system
      const result = await window.electronAPI.sessions.getThreadMessages(threadIdToLoad);
      console.log('Thread messages result:', result);
      if (result.success && result.messages && result.messages.length > 0) {
        const historyMessages: ChatMessage[] = [];
        
        for (const msg of result.messages) {
          // Parse message content if it's JSON
          let content = msg.content;
          let toolCalls: any[] = [];
          
          try {
            // Try to parse as JSON array (Amp format)
            const parsed = JSON.parse(content);
            if (Array.isArray(parsed)) {
              // Extract tool calls
              toolCalls = parsed.filter((c: any) => c.type === 'tool_use');
              
              // Extract text content
              content = parsed
                .filter((c: any) => c.type === 'text')
                .map((c: any) => c.text)
                .join(' ');
            } else if (parsed.type === 'tool_use') {
              // Single tool_use object
              toolCalls = [parsed];
              content = ''; // No text content for pure tool calls
            }
          } catch {
            // If it's not JSON, check if it contains tool_use
            if (content.includes('"type":"tool_use"')) {
              try {
                const toolParsed = JSON.parse(content);
                if (toolParsed.type === 'tool_use') {
                  toolCalls = [toolParsed];
                  content = '';
                }
              } catch {
                // Use as-is if parsing fails
              }
            }
          }
          
          // Add tool call messages first
          for (const toolCall of toolCalls) {
            historyMessages.push({
              id: toolCall.id || `tool-${msg.id}-${Date.now()}`,
              sender: 'tool',
              content: `Tool: ${toolCall.name || 'unknown_tool'}`,
              timestamp: msg.createdAt,
              toolCall: {
                id: toolCall.id || `tool-${msg.id}-${Date.now()}`,
                name: toolCall.name || 'unknown_tool',
                input: toolCall.input || {},
                status: 'success'
              }
            });
          }
          
          // Add text message if there's content
          if (content && content.trim()) {
            historyMessages.push({
              id: msg.id,
              sender: msg.role as 'user' | 'assistant',
              content: content.trim(),
              timestamp: msg.createdAt
            });
          }
        }
        
        console.log(`Loaded ${historyMessages.length} messages for thread ${threadIdToLoad}:`, historyMessages);
        setMessages(historyMessages);
      } else {
        console.log(`No thread messages found for thread ${threadIdToLoad}, clearing messages`);
        setMessages([]); // Clear messages instead of loading mixed history
      }
    } catch (err) {
      console.error(`Failed to load thread messages for ${threadIdToLoad}:`, err);
      setMessages([]); // Clear messages instead of loading mixed history
    } finally {
      setIsLoadingMessages(false);
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
            // Extract tool calls from assistant messages
            const toolCalls = event.message.content.filter((c: any) => c.type === 'tool_use');
            const textContent = event.message.content
              .filter((c: any) => c.type === 'text')
              .map((c: any) => c.text)
              .join(' ');
            
            // Add tool calls first
            for (const toolCall of toolCalls) {
              historyMessages.push({
                id: toolCall.id || `tool-${event.timestamp || Date.now()}`,
                sender: 'tool',
                content: `Tool: ${toolCall.name || 'unknown_tool'}`,
                timestamp: event.timestamp || new Date().toISOString(),
                toolCall: {
                  id: toolCall.id || `tool-${event.timestamp || Date.now()}`,
                  name: toolCall.name || 'unknown_tool',
                  input: toolCall.input || {},
                  status: 'success'
                }
              });
            }
            
            // Add text content if available
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
    if (isCreatingNewThread) {
      console.log('Creating new thread, not loading any history');
      setMessages([]);
      return;
    }
    
    if (selectedThreadId) {
      console.log(`Loading history for selected thread: ${selectedThreadId}`);
      loadThreadMessages(selectedThreadId);
    } else {
      console.log('No thread selected, clearing messages');
      setMessages([]); // Clear messages instead of loading mixed session history
    }
  };

  const addMessage = (sender: 'user' | 'assistant', content: string, messageThreadId?: string) => {
    // Only add message if it belongs to the current thread (or no thread filtering needed)
    if (messageThreadId && selectedThreadId && messageThreadId !== selectedThreadId) {
      console.log(`[DEBUG] Ignoring message from thread ${messageThreadId}, current thread is ${selectedThreadId}`);
      return;
    }
    
    const newMessage: ChatMessage = {
      id: `${sender}-${Date.now()}-${Math.random()}`,
      sender,
      content,
      timestamp: new Date().toISOString()
    };
    
    setMessages(prev => [...prev, newMessage]);
  };

  const addToolMessage = (toolCall: { id: string; name: string; input: any; status?: 'pending' | 'success' | 'error' }) => {
    const newMessage: ChatMessage = {
      id: toolCall.id || `tool-${Date.now()}-${Math.random()}`,
      sender: 'tool',
      content: `Tool: ${toolCall.name}`,
      timestamp: new Date().toISOString(),
      toolCall: {
        ...toolCall,
        status: toolCall.status || 'success'
      }
    };
    
    setMessages(prev => [...prev, newMessage]);
  };

  const startNewThread = async () => {
    console.log('Starting new thread...');
    
    // Stop any existing session first
    if (isStarted) {
      console.log('Stopping existing session before starting new thread');
      await stopInteractiveSession();
    }
    
    // Reset all state for a fresh start
    console.log('Setting isCreatingNewThread to true');
    setIsCreatingNewThread(true);
    setSelectedThreadId(null);
    setThreadId(''); // Clear thread ID completely
    onThreadSelected?.(null);
    setMessages([]); // Clear messages immediately
    setError(null);
    setConnectionState('closed');
    setIsStarted(false);
    setInput('');
    
    // Reload available threads to get updated list, but skip auto-selection
    await loadAvailableThreads(true);
    
    console.log('New thread setup completed, isCreatingNewThread:', true, 'ready to start fresh session');
  };

  const startInteractiveSession = async (forceNewThread = false, isThreadSwitch = false): Promise<void> => {
    // Simple mutex: if already starting, return early
    if (startInFlight.current) {
      console.log('Start already in flight, skipping');
      return;
    }
    
    const callId = Math.random().toString(36).substring(7);
    console.log(`=== FRONTEND DEBUG ${callId}: startInteractiveSession called ===`);
    console.log(`=== FRONTEND DEBUG ${callId}: forceNewThread = ${forceNewThread}, isCreatingNewThread = ${isCreatingNewThread}, isCreatingNewThreadRef.current = ${isCreatingNewThreadRef.current} ===`);
    
    startInFlight.current = (async () => {
      try {
        setError(null);
        if (!isThreadSwitch) {
          setConnectionState('connecting');
        }
        setIsStarted(true);
        
        // If forceNewThread or we're creating a new thread, pass 'new' to force backend to create one
        // Otherwise use the currently-selected thread, or null to let backend decide
        const shouldCreateNew = forceNewThread || isCreatingNewThreadRef.current;
        const threadArg = shouldCreateNew ? 'new' : (selectedThreadIdRef.current || null);
        console.log(`=== FRONTEND DEBUG ${callId}: shouldCreateNew = ${shouldCreateNew}, threadArg = "${threadArg}" ===`);
        
        // Clear messages before starting if creating new thread (not during thread switches)
        if (shouldCreateNew && !isThreadSwitch) {
          setMessages([]);
          console.log(`=== FRONTEND DEBUG ${callId}: Cleared messages for new thread ===`);
        }
        
        const result = await window.electronAPI.interactive.start(session.id, threadArg);
        
        if (result.success && result.handleId) {
          setHandleId(result.handleId);
          setConnectionState('ready');
          console.log(`=== FRONTEND DEBUG ${callId}: Session started with handleId = ${result.handleId} ===`);
        } else {
          setError(result.error || 'Failed to start interactive session');
          setConnectionState('error');
          setIsStarted(false);
        }
      } catch (error) {
        console.error(`=== FRONTEND DEBUG ${callId}: Exception during start:`, error);
        setError(error instanceof Error ? error.message : String(error));
        setConnectionState('error');
        setIsStarted(false);
      }
    })();
    
    await startInFlight.current;
    startInFlight.current = null;
  };

  const stopInteractiveSession = async () => {
    if (!handleId) return;
    
    try {
      await window.electronAPI.interactive.stop(session.id, handleId);
      setConnectionState('closed');
      setIsStarted(false);
      setHandleId(null);
    } catch (err) {
      console.error('Failed to stop interactive session:', err);
    }
  };

  const switchToThread = async (id: string) => {
    console.log('switchToThread called with:', id);
    
    // update UI state first
    setSelectedThreadId(id);
    setThreadId(id);
    
    // refresh thread list to ensure dropdown stays current
    await loadAvailableThreads(true);

    // if a session is live, restart it with the new thread
    if (isStarted) {
      console.log('Session is started, restarting with new thread:', id);
      await startInteractiveSession(false, true); // isThreadSwitch = true, mutex handles ordering
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || connectionState !== 'ready' || !handleId) return;
    
    const messageText = input.trim();
    setInput('');
    
    // Don't add user message to UI immediately - it will come back from stdout
    
    try {
      const result = await window.electronAPI.interactive.send(session.id, handleId, messageText);
      if (!result.success) {
        setError(result.error || 'Failed to send message');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
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
    <div className="flex flex-col h-full">
      {/* Header with connection status */}
      <div className="flex items-center justify-between p-4 border-b border-gruvbox-bg3">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-gruvbox-fg0">Interactive Chat</h3>
          {getConnectionBadge()}
          <span className={`px-2 py-1 text-xs rounded-full font-medium ${
            session?.ampMode === 'local-cli' 
              ? 'bg-gruvbox-bright-orange text-gruvbox-bg0' 
              : 'bg-gruvbox-bright-green text-gruvbox-bg0'
          }`}>
            {session?.ampMode === 'local-cli' ? 'LOCAL DEV' : 'PRODUCTION'}
          </span>
        </div>
        
        <div className="flex gap-2 items-center">
          {/* Thread selection dropdown - always show if there are threads */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setShowThreadDropdown(!showThreadDropdown)}
              className="px-3 py-1 bg-gruvbox-bg3 text-gruvbox-fg1 rounded text-sm hover:bg-gruvbox-bg2 border border-gruvbox-bg4 flex items-center gap-2"
            >
              {selectedThreadId && availableThreads.length > 0
                ? (() => {
                    const thread = availableThreads.find(t => t.id === selectedThreadId);
                    if (!thread) return 'New Thread';
                    return `${thread.name} (${thread.id.slice(0, 6)})`;
                  })()
                : availableThreads.length > 0 
                  ? 'Select Thread' 
                  : 'New Thread'
              }
              <span className="text-xs">▼</span>
            </button>
            {showThreadDropdown && (
              <div className="absolute right-0 top-full mt-1 bg-gruvbox-bg1 border border-gruvbox-bg3 rounded-md shadow-lg z-10 min-w-48">
                <div className="py-1">
                  <button
                    onClick={async () => {
                      if (isStartingNewThread) {
                        console.log('Already starting new thread, ignoring click');
                        return; // Prevent multiple clicks
                      }
                      
                      const clickId = Math.random().toString(36).substring(7);
                      console.log(`[DEBUG] Frontend: User clicked Start New Thread (${clickId}) - beginning flow`);
                      
                      setIsStartingNewThread(true); // Set this immediately to prevent double clicks
                      
                      try {
                        await startNewThread();
                        setShowThreadDropdown(false);
                        // Auto-start the interactive session immediately since state is already set
                        console.log(`[DEBUG] Frontend: (${clickId}) Auto-starting interactive session for new thread, isCreatingNewThread should be true`);
                        await startInteractiveSession(true); // Pass true to force new thread creation
                      } finally {
                        // Reset the button state only after everything completes
                        setIsStartingNewThread(false);
                      }
                    }}
                    disabled={isStartingNewThread}
                    className={`w-full text-left px-3 py-2 text-sm border-b border-gruvbox-bg3 font-medium ${
                      isStartingNewThread 
                        ? 'text-gruvbox-fg2 cursor-not-allowed opacity-50' 
                        : 'text-gruvbox-bright-green hover:bg-gruvbox-bg2'
                    }`}
                  >
                    {isStartingNewThread ? 'Starting...' : '+ Start New Thread'}
                  </button>
                  {availableThreads.length > 0 && availableThreads.map((thread) => (
                    <button
                      key={thread.id}
                      onClick={async () => {
                        console.log('Switching to thread:', thread.id);
                        setIsCreatingNewThread(false);
                        await switchToThread(thread.id);
                        onThreadSelected?.(thread.id);
                        setShowThreadDropdown(false);
                        // Message loading will be handled by useEffect
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
          
          {!isStarted ? (
            <button
              onClick={() => startInteractiveSession()}
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
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
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
            <div key={message.id}>
{(() => {
                // Check if this is a tool call message
                if (message.sender === 'tool' && message.toolCall) {
                  return (
                    <ToolCallDisplay 
                      toolCall={message.toolCall}
                      className="mb-3"
                    />
                  );
                }
                
                // Check if the message content contains raw tool_use JSON
                if (message.sender === 'assistant' && message.content.includes('"type":"tool_use"')) {
                  try {
                    const parsed = JSON.parse(message.content);
                    if (parsed.type === 'tool_use') {
                      const toolCall = {
                        id: parsed.id || `tool_${Date.now()}`,
                        name: parsed.name || 'unknown_tool',
                        input: parsed.input || {},
                        timestamp: message.timestamp,
                        status: 'success' as const
                      };
                      return (
                        <ToolCallDisplay 
                          toolCall={toolCall}
                          className="mb-3"
                        />
                      );
                    }
                  } catch (err) {
                    // If parsing fails, fall back to regular message display
                  }
                }
                
                // Regular message display
                return (
                  <div
                    className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'} mb-3`}
                  >
                    <div
                      className={`max-w-[80%] p-3 rounded-lg text-sm ${
                        message.sender === 'user'
                          ? 'bg-gruvbox-bright-blue text-gruvbox-bg0'
                          : 'bg-gruvbox-bg2 text-gruvbox-fg1 border border-gruvbox-bg3'
                      }`}
                    >
                      <RenderMarkdownContent 
                        content={message.content} 
                        className="break-words"
                      />
                      <div
                        className={`text-xs mt-1 opacity-70 ${
                          message.sender === 'user' ? 'text-gruvbox-bg0' : 'text-gruvbox-fg2'
                        }`}
                      >
                        {new Date(message.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                );
              })()}
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
            onKeyDown={handleKeyDown}
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

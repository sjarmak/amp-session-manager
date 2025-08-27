import React, { useState, useEffect } from "react";
import type { Session } from "@ampsm/types";
import { MergeWizard } from "./MergeWizard";
import { SessionMetrics } from "./SessionMetrics";
import { JSONMetrics } from "./JSONMetrics";
import { InteractiveTab } from "./InteractiveTab";
import { ToolCallDisplay } from "./ToolCallDisplay";
import { GitActionsTab } from "./GitActionsTab";
import { ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline';
import { RenderMarkdownContent } from "../utils/renderMarkdown";




interface SessionViewProps {
  session: Session;
  onBack: () => void;
  onSessionUpdated: () => void;
  onMergeCompleted?: () => void;
  initialTab?: "overview" | "interactive" | "git";
}

export function SessionView({
  session,
  onBack,
  onSessionUpdated,
  onMergeCompleted,
  initialTab,
}: SessionViewProps) {
  const [activeTab, setActiveTab] = useState<
    "overview" | "interactive" | "git"
  >(initialTab || "overview");
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  
  // Restore tab from localStorage on mount, unless initialTab is specified
  React.useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    } else {
      const saved = localStorage.getItem(`sessionTab_${session.id}`);
      const validTabs = ["overview", "interactive", "git"];
      if (saved && validTabs.includes(saved)) {
        setActiveTab(saved as any);
      }
    }
  }, [session.id, initialTab]);
  
  // Save active tab to localStorage whenever it changes
  React.useEffect(() => {
    localStorage.setItem(`sessionTab_${session.id}`, activeTab);
  }, [activeTab, session.id]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  
  const [threads, setThreads] = useState<Array<{
    id: string;
    sessionId: string;
    name: string;
    createdAt: string;
    updatedAt: string;
    status: string;
    messageCount: number;
  }>>([]);
  
  const [threadMessages, setThreadMessages] = useState<Record<string, Array<{
    id: string;
    threadId: string;
    role: string;
    content: string;
    createdAt: string;
    idx: number;
  }>>>({});

  const [showMergeWizard, setShowMergeWizard] = useState(false);

  // Load threads and their messages
  const loadThreads = async () => {
    try {
      const threadsResult = await window.electronAPI.sessions.getThreads(session.id);
      if (threadsResult.success && threadsResult.threads) {
        // Filter out invalid threads - be more permissive to avoid hiding threads completely
        const validThreads = threadsResult.threads.filter(thread => {
          const isValidId = thread.id.startsWith('T-');
          const isNotChatName = !thread.name.startsWith('Chat ');
          const hasMessages = thread.messageCount > 0;
          
          // Include threads with proper IDs OR threads that have messages (even if legacy format)
          return isValidId && (isNotChatName || hasMessages);
        });
        console.log('SessionView - Raw threads:', threadsResult.threads.length, 'Valid threads:', validThreads.length, validThreads);
        
        const sortedThreads = validThreads.sort((a, b) => 
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        setThreads(sortedThreads);
        
        // Load messages for each thread
        const messagesMap: Record<string, any[]> = {};
        for (const thread of sortedThreads) {
          const messagesResult = await window.electronAPI.sessions.getThreadMessages(thread.id);
          if (messagesResult.success && messagesResult.messages) {
            messagesMap[thread.id] = messagesResult.messages;
          }
        }
        setThreadMessages(messagesMap);
      }
    } catch (error) {
      console.error('Failed to load threads:', error);
    }
  };

  useEffect(() => {
    loadThreads();
  }, [session.id]);

  // Reload threads when switching to overview tab
  useEffect(() => {
    if (activeTab === 'overview') {
      loadThreads();
    }
  }, [activeTab]);



  const handleDelete = async () => {
    console.log("Delete button clicked");
    if (
      !window.confirm(
        `Are you sure you want to delete session "${session.name}"? This will remove the worktree and branch. UNMERGED CHANGES WILL BE LOST.`
      )
    ) {
      console.log("Delete cancelled by user");
      return;
    }
    console.log("Delete confirmed, proceeding...");

    setLoading(true);
    setError(null);

    try {
      console.log("Calling cleanup for session:", session.id);
      const result = await window.electronAPI.sessions.cleanup(session.id);
      console.log("Cleanup result:", result);
      if (result && result.success) {
        console.log("Cleanup successful, going back to session list");
        onSessionUpdated(); // Refresh session list
        onBack(); // Go back to session list
      } else {
        console.log("Cleanup failed:", result.error);
        // If it's the reachability error, offer force cleanup
        if (result.error?.includes("not reachable from base branch")) {
          setLoading(false); // Clear loading state before showing dialog
          const forceConfirm = window.confirm(
            "Session has unmerged commits. Force delete anyway? This will permanently lose the changes."
          );
          if (forceConfirm) {
            setLoading(true); // Resume loading for force delete
            const forceResult = await window.electronAPI.sessions.cleanup(
              session.id,
              true
            );
            if (forceResult && forceResult.success) {
              onSessionUpdated();
              onBack();
              return;
            } else {
              setError((forceResult && forceResult.error) || "Failed to force delete session");
            }
          } else {
            setError("Delete cancelled. Session has unmerged commits.");
          }
        } else {
          setError(result.error || "Failed to delete session");
        }
      }
    } catch (err) {
      console.log("Cleanup threw error:", err);
      setError(err instanceof Error ? err.message : "Failed to delete session");
    } finally {
      setLoading(false);
    }
  };



  const getStatusColor = (status: Session["status"]) => {
    switch (status) {
      case "idle":
        return "text-gruvbox-bright-green bg-gruvbox-green/20 border-gruvbox-green";
      case "running":
        return "text-gruvbox-bright-blue bg-gruvbox-blue/20 border-gruvbox-blue";
      case "awaiting-input":
        return "text-gruvbox-bright-yellow bg-gruvbox-yellow/20 border-gruvbox-yellow";
      case "error":
        return "text-gruvbox-bright-red bg-gruvbox-red/20 border-gruvbox-red";
      case "done":
        return "text-gruvbox-fg2 bg-gruvbox-bg3 border-gruvbox-bg4";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="text-gruvbox-fg2 hover:text-gruvbox-fg1"
          >
            ← Back
          </button>
          <h1 className="text-2xl font-bold text-gruvbox-fg0">{session.name}</h1>
          <span
            className={`px-3 py-1 text-sm rounded-full border ${getStatusColor(
              session.status
            )}`}
          >
            {session.status}
          </span>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-gruvbox-red/20 border border-gruvbox-red rounded-md">
          <div className="text-gruvbox-bright-red font-medium">Error</div>
          <div className="text-gruvbox-red text-sm mt-1">{error}</div>
          <button
            onClick={() => setError(null)}
            className="mt-2 text-sm text-gruvbox-bright-red underline"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="flex space-x-1 border-b border-gruvbox-bg4">
        {["overview", "interactive", "git"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as any)}
            className={`px-4 py-2 text-sm font-medium capitalize ${
              activeTab === tab
                ? "text-gruvbox-bright-blue border-b-2 border-gruvbox-bright-blue"
                : "text-gruvbox-fg2 hover:text-gruvbox-fg1"
            }`}
          >
            {tab === "interactive" ? "Amp Chat" : tab}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div className="space-y-4">
          <div className="bg-gruvbox-bg1 p-6 rounded-lg border border-gruvbox-bg3">
            <h3 className="text-lg font-semibold mb-4 text-gruvbox-fg0">Session Details</h3>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-sm font-medium text-gruvbox-fg2">ID</dt>
                <dd className="mt-1 text-sm text-gruvbox-fg1 font-mono">
                  {session.id}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gruvbox-fg2">Status</dt>
                <dd className="mt-1 text-sm text-gruvbox-fg1">{session.status}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gruvbox-fg2">
                  Repository
                </dt>
                <dd className="mt-1 text-sm text-gruvbox-fg1">
                  {session.repoRoot}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gruvbox-fg2">
                  Base Branch
                </dt>
                <dd className="mt-1 text-sm text-gruvbox-fg1">
                  {session.baseBranch}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gruvbox-fg2">
                  Session Branch
                </dt>
                <dd className="mt-1 text-sm text-gruvbox-fg1 font-mono">
                  {session.branchName}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gruvbox-fg2">
                  Worktree Path
                </dt>
                <dd className="mt-1 text-sm text-gruvbox-fg1 font-mono">
                  {session.worktreePath}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gruvbox-fg2">Created</dt>
                <dd className="mt-1 text-sm text-gruvbox-fg1">
                  {new Date(session.createdAt).toLocaleString()}
                </dd>
              </div>
              {session.lastRun && (
                <div>
                  <dt className="text-sm font-medium text-gruvbox-fg2">
                    Last Run
                  </dt>
                  <dd className="mt-1 text-sm text-gruvbox-fg1">
                    {new Date(session.lastRun).toLocaleString()}
                  </dd>
                </div>
              )}
              {session.scriptCommand && (
                <div className="sm:col-span-2">
                  <dt className="text-sm font-medium text-gruvbox-fg2">
                    Test Command
                  </dt>
                  <dd className="mt-1 text-sm text-gruvbox-fg1 font-mono bg-gruvbox-bg2 p-2 rounded">
                    {session.scriptCommand}
                  </dd>
                </div>
              )}
              {session.modelOverride && (
                <div>
                  <dt className="text-sm font-medium text-gruvbox-fg2">
                    Model Override
                  </dt>
                  <dd className="mt-1 text-sm text-gruvbox-fg1">
                    {session.modelOverride}
                    {session.modelOverride === "gpt-5" && (
                      <span className="ml-2 text-xs text-gruvbox-bright-blue bg-gruvbox-blue/30 px-2 py-1 rounded">
                        uses --try-gpt5 flag
                      </span>
                    )}
                  </dd>
                </div>
              )}
              {session.threadId && (
                <div className="sm:col-span-2">
                  <dt className="text-sm font-medium text-gruvbox-fg2">
                    Amp Thread
                  </dt>
                  <dd className="mt-1 text-sm text-gruvbox-fg1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono bg-gruvbox-bg2 px-2 py-1 rounded">
                        {session.threadId}
                      </span>
                      <a 
                        href={`https://ampcode.com/threads/${session.threadId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gruvbox-bright-blue hover:text-gruvbox-blue text-sm font-medium transition-colors"
                      >
                        View on Amp →
                      </a>
                    </div>
                  </dd>
                </div>
              )}
            </dl>
          </div>



          {/* Session Summary with Complete Metrics */}
          <div className="bg-gruvbox-bg1 p-6 rounded-lg border border-gruvbox-bg3">
            <h3 className="text-lg font-semibold mb-4 text-gruvbox-fg0">Session Summary</h3>
            <JSONMetrics sessionId={session.id} session={session} />
          </div>

          {/* Thread-Specific Sections */}
          {threads.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-xl font-semibold text-gruvbox-fg0 border-b border-gruvbox-bg3 pb-2">
                Threads ({threads.length})
              </h3>
              
              {threads.map((thread, index) => (
                <div key={thread.id} className="bg-gruvbox-bg1 p-6 rounded-lg border border-gruvbox-bg3">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center">
                      <ChatBubbleLeftRightIcon className="w-5 h-5 text-gruvbox-bright-blue mr-2" />
                      <h4 className="text-lg font-semibold text-gruvbox-fg0">
                        {thread.name}
                      </h4>
                      <span className="ml-2 text-xs text-gruvbox-fg2 bg-gruvbox-bg2 px-2 py-1 rounded font-mono">
                        {thread.id}
                      </span>
                      <span className="ml-2 text-xs text-gruvbox-fg2 bg-gruvbox-bg3 px-2 py-1 rounded">
                        #{index + 1}
                      </span>
                    </div>
                    
                    {/* Use actual thread ID for amp link */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          console.log('Continue thread clicked:', thread.id);
                          // Navigate to interactive tab with this thread selected
                          setSelectedThreadId(thread.id);
                          setActiveTab('interactive');
                        }}
                        className="text-gruvbox-bright-green hover:text-gruvbox-green text-sm font-medium bg-gruvbox-bg2 px-3 py-1 rounded transition-colors"
                      >
                        Continue Thread →
                      </button>
                      <a 
                        href={`https://ampcode.com/threads/${thread.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gruvbox-bright-blue hover:text-gruvbox-blue text-sm font-medium bg-gruvbox-bg2 px-3 py-1 rounded transition-colors"
                      >
                        View on Amp →
                      </a>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-4">
                    <div>
                      <dt className="text-sm font-medium text-gruvbox-fg2">Created</dt>
                      <dd className="mt-1 text-sm text-gruvbox-fg1">
                        {new Date(thread.createdAt).toLocaleString()}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gruvbox-fg2">Last Updated</dt>
                      <dd className="mt-1 text-sm text-gruvbox-fg1">
                        {new Date(thread.updatedAt).toLocaleString()}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gruvbox-fg2">Messages</dt>
                      <dd className="mt-1 text-sm text-gruvbox-fg1">
                        {thread.messageCount} messages
                      </dd>
                    </div>
                  </div>

                  {/* Thread Conversation */}
                  {threadMessages[thread.id] && threadMessages[thread.id].length > 0 && (
                    <div className="mt-4">
                      <h5 className="text-sm font-medium text-gruvbox-fg2 mb-2">Conversation</h5>
                      <div className="bg-gruvbox-bg2 rounded-lg p-4 max-h-96 overflow-y-auto">
                        {threadMessages[thread.id].map((message) => (
                          <div key={message.id} className="mb-3 last:mb-0">
                            <div className={`text-xs font-medium mb-1 ${
                              message.role === 'user' 
                                ? 'text-gruvbox-bright-green' 
                                : message.role === 'assistant'
                                ? 'text-gruvbox-bright-blue'
                                : 'text-gruvbox-fg2'
                            }`}>
                              {message.role === 'user' ? 'User' : message.role === 'assistant' ? 'Amp' : 'System'}
                              <span className="ml-2 text-gruvbox-fg2">
                                {new Date(message.createdAt).toLocaleTimeString()}
                              </span>
                            </div>
                            {(() => {
                              try {
                                // Try to parse as JSON first (for assistant messages)
                                const parsed = JSON.parse(message.content);
                                
                                // Check if this is a tool_use message
                                if (parsed.type === 'tool_use' && parsed.name) {
                                  const toolCall = {
                                    id: parsed.id || `tool_${Date.now()}`,
                                    name: parsed.name,
                                    input: parsed.input || {},
                                    timestamp: message.createdAt,
                                    status: 'success' as const
                                  };
                                  return <ToolCallDisplay toolCall={toolCall} className="mt-2" />;
                                }
                                
                                // Handle JSON array format (Amp format with mixed content types)
                                if (Array.isArray(parsed)) {
                                  const elements: JSX.Element[] = [];
                                  let textContent = '';
                                  let hasToolCalls = false;
                                  
                                  // First pass: collect all text and identify tool calls
                                  for (const item of parsed) {
                                    if (item.type === 'tool_use' && item.name) {
                                      hasToolCalls = true;
                                    } else if (item.type === 'text' && item.text) {
                                      textContent += (textContent ? ' ' : '') + item.text;
                                    }
                                  }
                                  
                                  // If we have both tool calls and text, show them separately
                                  if (hasToolCalls) {
                                    for (let i = 0; i < parsed.length; i++) {
                                      const item = parsed[i];
                                      
                                      if (item.type === 'tool_use' && item.name) {
                                        const toolCall = {
                                          id: item.id || `tool_${Date.now()}_${i}`,
                                          name: item.name,
                                          input: item.input || {},
                                          timestamp: message.createdAt,
                                          status: 'success' as const
                                        };
                                        elements.push(
                                          <ToolCallDisplay key={i} toolCall={toolCall} className="mb-2" />
                                        );
                                      }
                                    }
                                    
                                    // Add text content if any
                                    if (textContent.trim()) {
                                      elements.unshift(
                                        <RenderMarkdownContent 
                                          key="text" 
                                          content={textContent}
                                          className="text-sm text-gruvbox-fg1 mb-2"
                                        />
                                      );
                                    }
                                  } else if (textContent.trim()) {
                                    // Only text content, no tool calls - display as normal conversation text
                                    return (
                                      <RenderMarkdownContent 
                                        content={textContent}
                                        className="text-sm text-gruvbox-fg1"
                                      />
                                    );
                                  }
                                  
                                  return elements.length > 0 ? <div>{elements}</div> : (
                                    <div className="bg-gruvbox-bg3/50 p-2 rounded">
                                      <RenderMarkdownContent 
                                        content={message.content}
                                        className="text-sm text-gruvbox-fg1"
                                      />
                                    </div>
                                  );
                                }
                                
                                // Extract text content from single objects
                                if (parsed.text) {
                                  return (
                                    <div className="bg-gruvbox-bg3/50 p-2 rounded">
                                      <RenderMarkdownContent 
                                        content={parsed.text}
                                        className="text-sm text-gruvbox-fg1"
                                      />
                                    </div>
                                  );
                                } else if (parsed.content) {
                                  return (
                                    <div className="bg-gruvbox-bg3/50 p-2 rounded">
                                      <RenderMarkdownContent 
                                        content={parsed.content}
                                        className="text-sm text-gruvbox-fg1"
                                      />
                                    </div>
                                  );
                                }
                                
                                // Fallback for other JSON structures
                                return (
                                  <div className="bg-gruvbox-bg3/50 p-2 rounded">
                                    <RenderMarkdownContent 
                                      content={message.content}
                                      className="text-sm text-gruvbox-fg1"
                                    />
                                  </div>
                                );
                              } catch {
                                // If not JSON, return content as-is
                                return (
                                  <div className="bg-gruvbox-bg3/50 p-2 rounded">
                                    <RenderMarkdownContent 
                                      content={message.content}
                                      className="text-sm text-gruvbox-fg1"
                                    />
                                  </div>
                                );
                              }
                            })()}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Thread-Specific Metrics Placeholder */}
                  <div className="mt-4 p-3 bg-gruvbox-bg2/50 rounded border border-gruvbox-bg3">
                    <p className="text-sm text-gruvbox-fg2 italic">
                      Thread-specific metrics will be calculated based on conversation content and tool usage within this thread.
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Delete Session Button */}
          <div className="bg-gruvbox-bg1 p-6 rounded-lg border border-gruvbox-bright-red">
            <h3 className="text-lg font-semibold mb-4 text-gruvbox-bright-red">
              Delete Session
            </h3>
            <p className="text-gruvbox-fg2 mb-4">
              Permanently remove this session, including its worktree and
              branch. This cannot be undone.
            </p>
            <button
              onClick={handleDelete}
              disabled={loading}
              className="px-4 py-2 bg-gruvbox-bright-red text-gruvbox-bg0 rounded-md hover:bg-gruvbox-red disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Delete Session
            </button>
          </div>
        </div>
      )}







      {activeTab === "interactive" && (
        <div className="bg-gruvbox-bg1 rounded-lg border border-gruvbox-bg3 h-[600px] flex flex-col">
          <InteractiveTab 
              session={session} 
              initialThreadId={selectedThreadId}
              onThreadSelected={setSelectedThreadId}
              onThreadsUpdated={loadThreads}
            />
        </div>
      )}

      {activeTab === "git" && (
        <div className="bg-gruvbox-bg1 rounded-lg border border-gruvbox-bg3">
          <GitActionsTab session={session} onSessionUpdate={onSessionUpdated} />
        </div>
      )}

      {showMergeWizard && (
        <MergeWizard
          session={session}
          onClose={() => setShowMergeWizard(false)}
          onComplete={onMergeCompleted || onSessionUpdated}
        />
      )}
    </div>
  );
}

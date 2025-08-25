import React, { useState, useEffect } from "react";
import type { Session } from "@ampsm/types";
import { MergeWizard } from "./MergeWizard";
import { SessionMetrics } from "./SessionMetrics";
import { JSONMetrics } from "./JSONMetrics";
import { InteractiveTab } from "./InteractiveTab";
import { ToolCallDisplay } from "./ToolCallDisplay";
import { ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline';




interface SessionViewProps {
  session: Session;
  onBack: () => void;
  onSessionUpdated: () => void;
  initialTab?: "overview" | "actions" | "interactive";
}

export function SessionView({
  session,
  onBack,
  onSessionUpdated,
  initialTab,
}: SessionViewProps) {
  const [activeTab, setActiveTab] = useState<
    "overview" | "actions" | "interactive"
  >(initialTab || "overview");
  
  // Temporarily disabled localStorage tab restoration for debugging
  // React.useEffect(() => {
  //   const saved = localStorage.getItem(`sessionTab_${session.id}`);
  //   const validTabs = ["overview", "actions"];
  //   if (saved && validTabs.includes(saved)) {
  //     setActiveTab(saved as any);
  //   }
  // }, [session.id]);
  
  // Temporarily disabled localStorage saving
  // React.useEffect(() => {
  //   localStorage.setItem(`sessionTab_${session.id}`, activeTab);
  // }, [activeTab, session.id]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [iterationNotes, setIterationNotes] = useState("");
  const [includeContext, setIncludeContext] = useState(false);
  
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
  const [squashMessage, setSquashMessage] = useState("");
  const [rebaseTarget, setRebaseTarget] = useState(session.baseBranch);
  const [showMergeWizard, setShowMergeWizard] = useState(false);

  // Load threads and their messages
  useEffect(() => {
    const loadThreads = async () => {
      try {
        const threadsResult = await window.electronAPI.sessions.getThreads(session.id);
        if (threadsResult.success && threadsResult.threads) {
          const sortedThreads = threadsResult.threads.sort((a, b) => 
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

    loadThreads();
  }, [session.id]);



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

  const handleIterate = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.sessions.iterate(
        session.id,
        iterationNotes.trim() || undefined,
        includeContext
      );

      if (result && result.success) {
        onSessionUpdated();
        setIterationNotes("");
        setIncludeContext(false);
      } else {
        setError((result && result.error) || "Failed to continue thread");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to continue thread"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSquash = async () => {
    if (!squashMessage.trim()) {
      setError("Please provide a commit message for squash");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.sessions.squash(
        session.id,
        squashMessage
      );

      if (result && result.success) {
        onSessionUpdated();
        setSquashMessage("");
      } else {
        setError((result && result.error) || "Failed to squash commits");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to squash commits");
    } finally {
      setLoading(false);
    }
  };

  const handleRebase = async () => {
    if (!rebaseTarget.trim()) {
      setError("Please provide a target branch for rebase");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.sessions.rebase(
        session.id,
        rebaseTarget
      );

      if (result && result.success) {
        onSessionUpdated();
      } else {
        setError((result && result.error) || "Failed to rebase");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rebase");
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
        {["overview", "actions", "interactive"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as any)}
            className={`px-4 py-2 text-sm font-medium capitalize ${
              activeTab === tab
                ? "text-gruvbox-bright-blue border-b-2 border-gruvbox-bright-blue"
                : "text-gruvbox-fg2 hover:text-gruvbox-fg1"
            }`}
          >
            {tab}
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
                  <div className="flex items-center mb-4">
                    <ChatBubbleLeftRightIcon className="w-5 h-5 text-gruvbox-bright-blue mr-2" />
                    <h4 className="text-lg font-semibold text-gruvbox-fg0">
                      {thread.name}
                    </h4>
                    <span className="ml-2 text-xs text-gruvbox-fg2 bg-gruvbox-bg2 px-2 py-1 rounded">
                      #{index + 1}
                    </span>
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
                              {message.role === 'user' ? 'User' : message.role === 'assistant' ? 'Assistant' : 'System'}
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
                                        <div key="text" className="text-sm text-gruvbox-fg1 whitespace-pre-wrap mb-2">
                                          {textContent}
                                        </div>
                                      );
                                    }
                                  } else if (textContent.trim()) {
                                    // Only text content, no tool calls - display as normal conversation text
                                    return (
                                      <div className="text-sm text-gruvbox-fg1 whitespace-pre-wrap">
                                        {textContent}
                                      </div>
                                    );
                                  }
                                  
                                  return elements.length > 0 ? <div>{elements}</div> : (
                                    <div className="text-sm text-gruvbox-fg1 whitespace-pre-wrap bg-gruvbox-bg3/50 p-2 rounded">
                                      {message.content}
                                    </div>
                                  );
                                }
                                
                                // Extract text content from single objects
                                if (parsed.text) {
                                  return (
                                    <div className="text-sm text-gruvbox-fg1 whitespace-pre-wrap bg-gruvbox-bg3/50 p-2 rounded">
                                      {parsed.text}
                                    </div>
                                  );
                                } else if (parsed.content) {
                                  return (
                                    <div className="text-sm text-gruvbox-fg1 whitespace-pre-wrap bg-gruvbox-bg3/50 p-2 rounded">
                                      {parsed.content}
                                    </div>
                                  );
                                }
                                
                                // Fallback for other JSON structures
                                return (
                                  <div className="text-sm text-gruvbox-fg1 whitespace-pre-wrap bg-gruvbox-bg3/50 p-2 rounded">
                                    {message.content}
                                  </div>
                                );
                              } catch {
                                // If not JSON, return content as-is
                                return (
                                  <div className="text-sm text-gruvbox-fg1 whitespace-pre-wrap bg-gruvbox-bg3/50 p-2 rounded">
                                    {message.content}
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

      {activeTab === "actions" && (
        <div className="space-y-6">
          <div className="bg-gruvbox-bg1 p-6 rounded-lg border border-gruvbox-bg3">
            <h3 className="text-lg font-semibold mb-4 text-gruvbox-fg0">Continue Thread</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gruvbox-fg2 mb-1">
                  Send followup message
                </label>
                <textarea
                  value={iterationNotes}
                  onChange={(e) => setIterationNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 bg-gruvbox-bg2 border border-gruvbox-bg3 text-gruvbox-fg1 rounded-md focus:outline-none focus:ring-2 focus:ring-gruvbox-bright-blue"
                  placeholder="Message to continue the thread..."
                />
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="includeContextFollow"
                  checked={includeContext}
                  onChange={(e) => setIncludeContext(e.target.checked)}
                  className="mr-2 rounded border-gruvbox-bg3 text-gruvbox-bright-blue focus:ring-gruvbox-bright-blue"
                />
                <label htmlFor="includeContextFollow" className="text-sm text-gruvbox-fg2">
                  Include CONTEXT.md file content if it exists
                </label>
              </div>
              <button
                onClick={handleIterate}
                disabled={loading || session.status === "running"}
                className="px-4 py-2 bg-gruvbox-bright-blue text-gruvbox-bg0 rounded-md hover:bg-gruvbox-blue disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Running..." : "Continue Thread"}
              </button>
            </div>
          </div>

          <div className="bg-gruvbox-bg1 p-6 rounded-lg border border-gruvbox-bg3">
            <h3 className="text-lg font-semibold mb-4 text-gruvbox-fg0">Squash Commits</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gruvbox-fg2 mb-1">
                  Commit Message
                </label>
                <input
                  type="text"
                  value={squashMessage}
                  onChange={(e) => setSquashMessage(e.target.value)}
                  className="w-full px-3 py-2 bg-gruvbox-bg2 border border-gruvbox-bg3 text-gruvbox-fg1 rounded-md focus:outline-none focus:ring-2 focus:ring-gruvbox-bright-blue"
                  placeholder={`feat: ${session.name}`}
                />
              </div>
              <button
                onClick={handleSquash}
                disabled={loading}
                className="px-4 py-2 bg-gruvbox-bright-blue text-gruvbox-bg0 rounded-md hover:bg-gruvbox-blue disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Squashing..." : "Squash Commits"}
              </button>
            </div>
          </div>

          <div className="bg-gruvbox-bg1 p-6 rounded-lg border border-gruvbox-bg3">
            <h3 className="text-lg font-semibold mb-4 text-gruvbox-fg0">Rebase Session</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gruvbox-fg2 mb-1">
                  Target Branch
                </label>
                <input
                  type="text"
                  value={rebaseTarget}
                  onChange={(e) => setRebaseTarget(e.target.value)}
                  className="w-full px-3 py-2 bg-gruvbox-bg2 border border-gruvbox-bg3 text-gruvbox-fg1 rounded-md focus:outline-none focus:ring-2 focus:ring-gruvbox-bright-blue"
                  placeholder={session.baseBranch}
                />
              </div>
              <button
                onClick={handleRebase}
                disabled={loading}
                className="px-4 py-2 bg-gruvbox-bright-blue text-gruvbox-bg0 rounded-md hover:bg-gruvbox-blue disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Rebasing..." : "Rebase onto Target"}
              </button>
            </div>
          </div>

          <div className="bg-gruvbox-bg1 p-6 rounded-lg border border-gruvbox-bright-green">
            <h3 className="text-lg font-semibold mb-4 text-gruvbox-fg0">
              Merge to Main
            </h3>
            <p className="text-gruvbox-fg2 mb-4">
              Use the merge wizard to squash commits, rebase, and merge to the
              base branch in one guided flow.
            </p>
            <button
              onClick={() => setShowMergeWizard(true)}
              disabled={loading}
              className="px-6 py-3 bg-gruvbox-bright-green text-gruvbox-bg0 rounded-md hover:bg-gruvbox-green disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
            >
              Start Merge Wizard
            </button>
          </div>
        </div>
      )}





      {activeTab === "interactive" && (
        <div className="bg-gruvbox-bg1 rounded-lg border border-gruvbox-bg3">
          <InteractiveTab session={session} />
        </div>
      )}

      {showMergeWizard && (
        <MergeWizard
          session={session}
          onClose={() => setShowMergeWizard(false)}
          onComplete={onSessionUpdated}
        />
      )}
    </div>
  );
}

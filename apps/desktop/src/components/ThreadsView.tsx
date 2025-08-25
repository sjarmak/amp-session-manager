import React, { useState, useEffect } from 'react';
import type { Session } from '@ampsm/types';

interface ThreadsViewProps {
  currentSessionId?: string;
}

// Simple utility for getting thread info for a session (local implementation)
function getSessionThreadInfo(session: Session) {
  if (!session.threadId) {
    return null;
  }

  return {
    id: session.threadId,
    url: `https://ampcode.com/threads/${session.threadId}`,
    sessionId: session.id,
    sessionName: session.name,
    createdAt: session.createdAt,
    lastRun: session.lastRun
  };
}

export function ThreadsView({ currentSessionId }: ThreadsViewProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSessions = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Get sessions that have threads using Electron API
      const allSessions = await window.electronAPI.sessions.list();
      let sessionList = allSessions.filter(session => session.threadId);

      // If we have a current session context, show only that session's thread
      if (currentSessionId) {
        const currentSession = await window.electronAPI.sessions.get(currentSessionId);
        sessionList = currentSession && currentSession.threadId ? [currentSession] : [];
      }
      
      setSessions(sessionList);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, [currentSessionId]);

  if (loading) {
    return (
      <div className="p-4 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gruvbox-bright-blue mx-auto"></div>
        <p className="mt-2 text-gruvbox-fg2">Loading session threads...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center">
        <div className="text-gruvbox-bright-red mb-2">Error loading session threads</div>
        <p className="text-gruvbox-fg2 text-sm">{error}</p>
        <button 
          onClick={loadSessions}
          className="mt-2 px-4 py-2 bg-gruvbox-bright-blue text-gruvbox-bg0 rounded hover:bg-gruvbox-blue"
        >
          Retry
        </button>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="p-4 text-center">
        <p className="text-gruvbox-fg2">
          {currentSessionId ? 'Current session has no thread' : 'No sessions with threads found'}
        </p>
        <button 
          onClick={loadSessions}
          className="mt-2 px-4 py-2 bg-gruvbox-bright-blue text-gruvbox-bg0 rounded hover:bg-gruvbox-blue"
        >
          Refresh
        </button>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gruvbox-fg0">
          {currentSessionId ? 'Current Session Thread' : `Session Threads (${sessions.length})`}
        </h2>
        <button 
          onClick={loadSessions}
          className="px-3 py-1 bg-gruvbox-bg3 text-gruvbox-fg1 rounded hover:bg-gruvbox-bg4 text-sm"
        >
          Refresh
        </button>
      </div>
      
      <div className="space-y-3">
        {sessions.map((session) => {
          const threadInfo = getSessionThreadInfo(session);
          if (!threadInfo) return null;

          return (
            <div key={session.id} className="border border-gruvbox-bg3 bg-gruvbox-bg1 rounded-lg p-3 hover:bg-gruvbox-bg2">
              <div className="flex justify-between items-start mb-2">
                <div className="font-medium text-sm text-gruvbox-fg1">{session.name}</div>
                <div className="text-xs text-gruvbox-fg2">
                  {session.lastRun ? new Date(session.lastRun).toLocaleDateString() : 'Not run'}
                </div>
              </div>
              
              <div className="text-xs text-gruvbox-fg2 mb-2">
                Session: {session.id} | Status: {session.status}
              </div>
              
              <div className="text-xs text-gruvbox-fg2 mb-2">
                Thread: {threadInfo.id}
              </div>
              
              {session.ampPrompt && (
                <div className="text-xs text-gruvbox-fg2 line-clamp-2 mb-2">
                  {session.ampPrompt.slice(0, 150)}...
                </div>
              )}
              
              <div className="mt-2">
                <a 
                  href={threadInfo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gruvbox-bright-blue hover:text-gruvbox-blue text-xs"
                >
                  View Thread on Amp →
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

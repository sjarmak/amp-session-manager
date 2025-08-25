import React, { useState, useEffect } from 'react';
import type { Session } from '@ampsm/types';

interface SessionListProps {
  onSessionSelect: (session: Session) => void;
  onNewAsyncSession: () => void;
  onNewInteractiveSession: () => void;
}

export function SessionList({ onSessionSelect, onNewAsyncSession, onNewInteractiveSession }: SessionListProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSessions = async () => {
    try {
      setLoading(true);
      setError(null);
      const sessionList = await window.electronAPI.sessions.list();
      setSessions(sessionList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const getStatusColor = (status: Session['status']) => {
    switch (status) {
      case 'idle': return 'text-gruvbox-green bg-gruvbox-green-dim/20 border border-gruvbox-green-dim/30';
      case 'running': return 'text-gruvbox-blue bg-gruvbox-blue-dim/20 border border-gruvbox-blue-dim/30';
      case 'awaiting-input': return 'text-gruvbox-yellow bg-gruvbox-yellow-dim/20 border border-gruvbox-yellow-dim/30';
      case 'error': return 'text-gruvbox-red bg-gruvbox-red-dim/20 border border-gruvbox-red-dim/30';
      case 'done': return 'text-gruvbox-gray bg-gruvbox-gray/20 border border-gruvbox-gray/30';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-gruvbox-light2">Loading sessions...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-gruvbox-red-dim/10 border border-gruvbox-red-dim/30 rounded-md">
        <div className="text-gruvbox-red font-medium">Error loading sessions</div>
        <div className="text-gruvbox-red text-sm mt-1">{error}</div>
        <button 
          onClick={loadSessions}
          className="mt-2 px-3 py-1 text-sm bg-gruvbox-red-dim/20 text-gruvbox-red rounded hover:bg-gruvbox-red-dim/30 border border-gruvbox-red-dim/40"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gruvbox-light1">Sessions</h2>
        <div className="flex gap-2">
          <button
            onClick={onNewAsyncSession}
            className="px-4 py-2 bg-gruvbox-blue text-gruvbox-dark0 rounded-md hover:bg-gruvbox-blue-dim focus:outline-none focus:ring-2 focus:ring-gruvbox-blue/50 shadow-lg shadow-gruvbox-blue/25 transition-all"
          >
            New Async Session
          </button>
          <button
            onClick={onNewInteractiveSession}
            className="px-4 py-2 bg-gruvbox-aqua text-gruvbox-dark0 rounded-md hover:bg-gruvbox-aqua-dim focus:outline-none focus:ring-2 focus:ring-gruvbox-aqua/50 shadow-lg shadow-gruvbox-aqua/25 transition-all"
          >
            New Interactive Session
          </button>
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-gruvbox-light3 mb-4">No sessions found</div>
          <div className="flex gap-2 justify-center">
            <button
              onClick={onNewAsyncSession}
              className="px-4 py-2 bg-gruvbox-blue text-gruvbox-dark0 rounded-md hover:bg-gruvbox-blue-dim shadow-lg shadow-gruvbox-blue/25 transition-all"
            >
              Create Async Session
            </button>
            <button
              onClick={onNewInteractiveSession}
              className="px-4 py-2 bg-gruvbox-aqua text-gruvbox-dark0 rounded-md hover:bg-gruvbox-aqua-dim shadow-lg shadow-gruvbox-aqua/25 transition-all"
            >
              Create Interactive Session
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <div
              key={session.id}
              className="p-4 bg-gruvbox-dark0 border border-gruvbox-dark3/50 rounded-lg hover:shadow-lg hover:shadow-gruvbox-aqua/10 cursor-pointer transition-all hover:border-gruvbox-aqua/30"
              onClick={() => onSessionSelect(session)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-gruvbox-light1">{session.name}</h3>
                    <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(session.status)}`}>
                      {session.status}
                    </span>
                  </div>
                  <p className="text-sm text-gruvbox-light2 mt-1 line-clamp-2">
                    {session.ampPrompt}
                  </p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-gruvbox-light4">
                    <span>Branch: {session.branchName}</span>
                    <span>Created: {new Date(session.createdAt).toLocaleDateString()}</span>
                    {session.lastRun && (
                      <span>Last Run: {new Date(session.lastRun).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-center">
        <button
          onClick={loadSessions}
          className="px-3 py-1 text-sm text-gruvbox-light3 hover:text-gruvbox-light1 transition-colors"
        >
          Refresh
        </button>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import type { Session } from '@ampsm/types';

interface SessionListProps {
  onSessionSelect: (session: Session) => void;
  onNewSession: () => void;
}

export function SessionList({ onSessionSelect, onNewSession }: SessionListProps) {
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
      case 'idle': return 'text-green-600 bg-green-50';
      case 'running': return 'text-blue-600 bg-blue-50';
      case 'awaiting-input': return 'text-yellow-600 bg-yellow-50';
      case 'error': return 'text-red-600 bg-red-50';
      case 'done': return 'text-gray-600 bg-gray-50';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-gray-500">Loading sessions...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-md">
        <div className="text-red-800 font-medium">Error loading sessions</div>
        <div className="text-red-600 text-sm mt-1">{error}</div>
        <button 
          onClick={loadSessions}
          className="mt-2 px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-800">Sessions</h2>
        <button
          onClick={onNewSession}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          New Session
        </button>
      </div>

      {sessions.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-gray-500 mb-4">No sessions found</div>
          <button
            onClick={onNewSession}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Create your first session
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <div
              key={session.id}
              className="p-4 bg-white border border-gray-200 rounded-lg hover:shadow-md cursor-pointer transition-shadow"
              onClick={() => onSessionSelect(session)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-gray-900">{session.name}</h3>
                    <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(session.status)}`}>
                      {session.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                    {session.ampPrompt}
                  </p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
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
          className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
        >
          Refresh
        </button>
      </div>
    </div>
  );
}

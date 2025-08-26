import React, { useState, useEffect } from 'react';
import type { Session } from '@ampsm/types';
import { MainRepoGitView } from './MainRepoGitView';

interface SessionListProps {
  onSessionSelect: (session: Session) => void;
  onNewSession: () => void;
}

export function SessionList({ onSessionSelect, onNewSession }: SessionListProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [showMainRepoGit, setShowMainRepoGit] = useState(false);
  const [currentRepoPath, setCurrentRepoPath] = useState<string | null>(null);

  const loadSessions = async () => {
    try {
      setLoading(true);
      setError(null);
      const sessionList = await window.electronAPI.sessions.list();
      setSessions(sessionList);
      // Clear selection when sessions are reloaded
      setSelectedSessions(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectSession = (sessionId: string, checked: boolean) => {
    setSelectedSessions(prev => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(sessionId);
      } else {
        newSet.delete(sessionId);
      }
      return newSet;
    });
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedSessions(new Set(sessions.map(s => s.id)));
    } else {
      setSelectedSessions(new Set());
    }
  };

  const openMainRepoGit = (repoPath: string) => {
    setCurrentRepoPath(repoPath);
    setShowMainRepoGit(true);
  };

  const getUniqueRepoPaths = (): string[] => {
    const repoPaths = new Set<string>();
    sessions.forEach(session => {
      if (session.repoRoot) {
        repoPaths.add(session.repoRoot);
      }
    });
    return Array.from(repoPaths);
  };

  const handleBulkDelete = async () => {
    if (selectedSessions.size === 0) return;

    const sessionNames = sessions
      .filter(s => selectedSessions.has(s.id))
      .map(s => s.name)
      .join(', ');

    if (!window.confirm(
      `Are you sure you want to delete ${selectedSessions.size} session(s): ${sessionNames}? This will remove the worktrees and branches. UNMERGED CHANGES WILL BE LOST.`
    )) {
      return;
    }

    setDeleting(true);
    setError(null);

    try {
      const deletePromises = Array.from(selectedSessions).map(async (sessionId) => {
        try {
          const result = await window.electronAPI.sessions.cleanup(sessionId);
          if (!result?.success) {
            // Try force delete for sessions with unmerged commits
            const forceResult = await window.electronAPI.sessions.cleanup(sessionId, true);
            if (!forceResult?.success) {
              throw new Error(`Failed to delete session: ${forceResult?.error || 'Unknown error'}`);
            }
          }
          return { sessionId, success: true };
        } catch (err) {
          return { 
            sessionId, 
            success: false, 
            error: err instanceof Error ? err.message : 'Unknown error' 
          };
        }
      });

      const results = await Promise.all(deletePromises);
      const failures = results.filter(r => !r.success);
      
      if (failures.length > 0) {
        setError(`Failed to delete ${failures.length} session(s): ${failures.map(f => f.error).join(', ')}`);
      }

      // Reload sessions regardless of failures
      await loadSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete sessions');
    } finally {
      setDeleting(false);
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
        <button
          onClick={onNewSession}
          className="px-4 py-2 bg-gruvbox-aqua text-gruvbox-dark0 rounded-md hover:bg-gruvbox-aqua-dim focus:outline-none focus:ring-2 focus:ring-gruvbox-aqua/50 shadow-lg shadow-gruvbox-aqua/25 transition-all"
        >
          New Session
        </button>
      </div>

      {sessions.length > 0 && (
        <div className="flex items-center justify-between p-3 bg-gruvbox-dark1 border border-gruvbox-dark3/50 rounded-lg">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gruvbox-light2">
              <input
                type="checkbox"
                checked={selectedSessions.size === sessions.length && sessions.length > 0}
                onChange={(e) => handleSelectAll(e.target.checked)}
                className="rounded border-gruvbox-dark3 text-gruvbox-blue focus:ring-gruvbox-blue focus:ring-offset-gruvbox-dark0"
              />
              Select All
            </label>
            {selectedSessions.size > 0 && (
              <span className="text-xs text-gruvbox-light3">
                {selectedSessions.size} selected
              </span>
            )}
          </div>
          <button
            onClick={handleBulkDelete}
            disabled={selectedSessions.size === 0 || deleting}
            className="px-4 py-2 bg-gruvbox-red text-gruvbox-light1 rounded-md hover:bg-gruvbox-red-dim disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-gruvbox-red/50 shadow-lg shadow-gruvbox-red/25 transition-all"
          >
            {deleting ? 'Deleting...' : 'Delete Selected'}
          </button>
        </div>
      )}

      {sessions.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-gruvbox-light3 mb-4">No sessions found</div>
          <div className="flex gap-2 justify-center">
            <button
              onClick={onNewSession}
              className="px-4 py-2 bg-gruvbox-aqua text-gruvbox-dark0 rounded-md hover:bg-gruvbox-aqua-dim shadow-lg shadow-gruvbox-aqua/25 transition-all"
            >
              Create Session
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <div
              key={session.id}
              className="p-4 bg-gruvbox-dark0 border border-gruvbox-dark3/50 rounded-lg hover:shadow-lg hover:shadow-gruvbox-aqua/10 transition-all hover:border-gruvbox-aqua/30"
            >
              <div className="flex items-start gap-3">
                <div className="flex items-center pt-1">
                  <input
                    type="checkbox"
                    checked={selectedSessions.has(session.id)}
                    onChange={(e) => {
                      e.stopPropagation();
                      handleSelectSession(session.id, e.target.checked);
                    }}
                    className="rounded border-gruvbox-dark3 text-gruvbox-blue focus:ring-gruvbox-blue focus:ring-offset-gruvbox-dark0"
                  />
                </div>
                <div 
                  className="flex-1 cursor-pointer"
                  onClick={() => onSessionSelect(session)}
                >
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-gruvbox-light1">{session.name}</h3>
                    <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(session.status)}`}>
                      {session.status}
                    </span>
                  </div>
                  <p className="text-sm text-gruvbox-light2 mt-1 line-clamp-2">
                    {session.ampPrompt}
                  </p>
                  <div className="space-y-1 mt-2 text-xs text-gruvbox-light4">
                    <div>Repository: {session.repoRoot}</div>
                    <div className="flex items-center gap-4">
                      <span>Branch: {session.branchName}</span>
                      <span>Created: {new Date(session.createdAt).toLocaleDateString()}</span>
                      {session.lastRun && (
                        <span>Last Run: {new Date(session.lastRun).toLocaleDateString()}</span>
                      )}
                    </div>
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

      {showMainRepoGit && currentRepoPath && (
        <MainRepoGitView
          repoPath={currentRepoPath}
          onClose={() => setShowMainRepoGit(false)}
        />
      )}
    </div>
  );
}

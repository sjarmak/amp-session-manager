import React, { useState } from 'react';
import type { Session } from '@ampsm/types';

interface SessionViewProps {
  session: Session;
  onBack: () => void;
  onSessionUpdated: () => void;
}

export function SessionView({ session, onBack, onSessionUpdated }: SessionViewProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'diff' | 'actions'>('overview');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [iterationNotes, setIterationNotes] = useState('');
  const [squashMessage, setSquashMessage] = useState('');
  const [rebaseTarget, setRebaseTarget] = useState(session.baseBranch);

  const handleIterate = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await window.electronAPI.sessions.iterate(
        session.id, 
        iterationNotes.trim() || undefined
      );
      
      if (result.success) {
        onSessionUpdated();
        setIterationNotes('');
      } else {
        setError(result.error || 'Failed to run iteration');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run iteration');
    } finally {
      setLoading(false);
    }
  };

  const handleSquash = async () => {
    if (!squashMessage.trim()) {
      setError('Please provide a commit message for squash');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const result = await window.electronAPI.sessions.squash(session.id, squashMessage);
      
      if (result.success) {
        onSessionUpdated();
        setSquashMessage('');
      } else {
        setError(result.error || 'Failed to squash commits');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to squash commits');
    } finally {
      setLoading(false);
    }
  };

  const handleRebase = async () => {
    if (!rebaseTarget.trim()) {
      setError('Please provide a target branch for rebase');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const result = await window.electronAPI.sessions.rebase(session.id, rebaseTarget);
      
      if (result.success) {
        onSessionUpdated();
      } else {
        setError(result.error || 'Failed to rebase');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rebase');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: Session['status']) => {
    switch (status) {
      case 'idle': return 'text-green-600 bg-green-50 border-green-200';
      case 'running': return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'awaiting-input': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'error': return 'text-red-600 bg-red-50 border-red-200';
      case 'done': return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="text-gray-500 hover:text-gray-700"
          >
            ← Back
          </button>
          <h1 className="text-2xl font-bold text-gray-900">{session.name}</h1>
          <span className={`px-3 py-1 text-sm rounded-full border ${getStatusColor(session.status)}`}>
            {session.status}
          </span>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-md">
          <div className="text-red-800 font-medium">Error</div>
          <div className="text-red-600 text-sm mt-1">{error}</div>
          <button 
            onClick={() => setError(null)}
            className="mt-2 text-sm text-red-600 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="flex space-x-1 border-b border-gray-200">
        {['overview', 'diff', 'actions'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as any)}
            className={`px-4 py-2 text-sm font-medium capitalize ${
              activeTab === tab
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-4">
          <div className="bg-white p-6 rounded-lg border">
            <h3 className="text-lg font-semibold mb-4">Session Details</h3>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-sm font-medium text-gray-500">ID</dt>
                <dd className="mt-1 text-sm text-gray-900 font-mono">{session.id}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Status</dt>
                <dd className="mt-1 text-sm text-gray-900">{session.status}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Repository</dt>
                <dd className="mt-1 text-sm text-gray-900">{session.repoRoot}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Base Branch</dt>
                <dd className="mt-1 text-sm text-gray-900">{session.baseBranch}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Session Branch</dt>
                <dd className="mt-1 text-sm text-gray-900 font-mono">{session.branchName}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Worktree Path</dt>
                <dd className="mt-1 text-sm text-gray-900 font-mono">{session.worktreePath}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Created</dt>
                <dd className="mt-1 text-sm text-gray-900">{new Date(session.createdAt).toLocaleString()}</dd>
              </div>
              {session.lastRun && (
                <div>
                  <dt className="text-sm font-medium text-gray-500">Last Run</dt>
                  <dd className="mt-1 text-sm text-gray-900">{new Date(session.lastRun).toLocaleString()}</dd>
                </div>
              )}
              {session.scriptCommand && (
                <div className="sm:col-span-2">
                  <dt className="text-sm font-medium text-gray-500">Test Command</dt>
                  <dd className="mt-1 text-sm text-gray-900 font-mono bg-gray-50 p-2 rounded">{session.scriptCommand}</dd>
                </div>
              )}
              {session.modelOverride && (
                <div>
                  <dt className="text-sm font-medium text-gray-500">Model Override</dt>
                  <dd className="mt-1 text-sm text-gray-900">{session.modelOverride}</dd>
                </div>
              )}
            </dl>
          </div>

          <div className="bg-white p-6 rounded-lg border">
            <h3 className="text-lg font-semibold mb-4">Prompt</h3>
            <div className="bg-gray-50 p-4 rounded-md">
              <p className="text-gray-800 whitespace-pre-wrap">{session.ampPrompt}</p>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'diff' && (
        <div className="bg-white p-6 rounded-lg border">
          <h3 className="text-lg font-semibold mb-4">Session Changes</h3>
          <div className="text-gray-600">
            Diff view not implemented yet. Use CLI command: 
            <code className="ml-2 px-2 py-1 bg-gray-100 rounded">amp-sessions diff {session.id}</code>
          </div>
        </div>
      )}

      {activeTab === 'actions' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-lg border">
            <h3 className="text-lg font-semibold mb-4">Run Iteration</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes (optional)
                </label>
                <textarea
                  value={iterationNotes}
                  onChange={(e) => setIterationNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Notes for this iteration..."
                />
              </div>
              <button
                onClick={handleIterate}
                disabled={loading || session.status === 'running'}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Running...' : 'Run Iteration'}
              </button>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg border">
            <h3 className="text-lg font-semibold mb-4">Squash Commits</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Commit Message
                </label>
                <input
                  type="text"
                  value={squashMessage}
                  onChange={(e) => setSquashMessage(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={`feat: ${session.name}`}
                />
              </div>
              <button
                onClick={handleSquash}
                disabled={loading}
                className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Squashing...' : 'Squash Commits'}
              </button>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg border">
            <h3 className="text-lg font-semibold mb-4">Rebase Session</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Target Branch
                </label>
                <input
                  type="text"
                  value={rebaseTarget}
                  onChange={(e) => setRebaseTarget(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={session.baseBranch}
                />
              </div>
              <button
                onClick={handleRebase}
                disabled={loading}
                className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Rebasing...' : 'Rebase onto Target'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import type { Session } from '@ampsm/types';
import { MergeWizard } from './MergeWizard';

interface GitActionsTabProps {
  session: Session;
  onSessionUpdate?: () => void;
}

interface GitStatus {
  hasUnstagedChanges: boolean;
  hasStagedChanges: boolean;
  unstagedFiles: string[];
  stagedFiles: string[];
  commitHistory: { sha: string; message: string; author: string; date: string }[];
  isClean: boolean;
}

interface CommitOperation {
  type: 'commit' | 'rollback' | 'squash';
  loading: boolean;
  error: string | null;
}

export function GitActionsTab({ session, onSessionUpdate }: GitActionsTabProps) {
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [commitMessage, setCommitMessage] = useState('');
  const [squashMessage, setSquashMessage] = useState('');
  const [includeManualCommits, setIncludeManualCommits] = useState(true);
  const [selectedCommits, setSelectedCommits] = useState<string[]>([]);
  const [operation, setOperation] = useState<CommitOperation>({ type: 'commit', loading: false, error: null });
  const [showMergeWizard, setShowMergeWizard] = useState(false);

  useEffect(() => {
    loadGitStatus();

    // Listen for interactive changes being staged
    const handleChangesStaged = (event: any, sessionId: string, data: any) => {
      if (sessionId === session.id) {
        console.log('Interactive changes staged:', data);
        loadGitStatus(); // Refresh git status
      }
    };

    window.electronAPI.onInteractiveChangesStaged?.(handleChangesStaged);

    return () => {
      // Cleanup listener if needed
      if (window.electronAPI.offInteractiveChangesStaged) {
        window.electronAPI.offInteractiveChangesStaged(handleChangesStaged);
      }
    };
  }, [session.id]);

  const loadGitStatus = async () => {
    try {
      const result = await window.electronAPI.sessions.getGitStatus(session.id);
      if (result && result.success && result.result) {
        setGitStatus(result.result);
      }
    } catch (err) {
      console.error('Failed to load git status:', err);
    }
  };

  const stageAllChanges = async () => {
    setOperation({ type: 'commit', loading: true, error: null });
    try {
      const result = await window.electronAPI.sessions.stageAllChanges(session.id);
      if (result && result.success) {
        await loadGitStatus();
      } else {
        setOperation(prev => ({ ...prev, error: result?.error || 'Failed to stage changes' }));
      }
    } catch (err) {
      setOperation(prev => ({ ...prev, error: err instanceof Error ? err.message : 'Unknown error' }));
    } finally {
      setOperation(prev => ({ ...prev, loading: false }));
    }
  };

  const unstageAllChanges = async () => {
    setOperation({ type: 'commit', loading: true, error: null });
    try {
      const result = await window.electronAPI.sessions.unstageAllChanges(session.id);
      if (result && result.success) {
        await loadGitStatus();
      } else {
        setOperation(prev => ({ ...prev, error: result?.error || 'Failed to unstage changes' }));
      }
    } catch (err) {
      setOperation(prev => ({ ...prev, error: err instanceof Error ? err.message : 'Unknown error' }));
    } finally {
      setOperation(prev => ({ ...prev, loading: false }));
    }
  };

  const commitStagedChanges = async () => {
    if (!commitMessage.trim()) {
      setOperation(prev => ({ ...prev, error: 'Commit message is required' }));
      return;
    }

    setOperation({ type: 'commit', loading: true, error: null });
    try {
      const result = await window.electronAPI.sessions.commitStagedChanges(session.id, commitMessage);
      if (result && result.success) {
        setCommitMessage('');
        await loadGitStatus();
        onSessionUpdate?.();
      } else {
        setOperation(prev => ({ ...prev, error: result?.error || 'Failed to commit changes' }));
      }
    } catch (err) {
      setOperation(prev => ({ ...prev, error: err instanceof Error ? err.message : 'Unknown error' }));
    } finally {
      setOperation(prev => ({ ...prev, loading: false }));
    }
  };

  const rollbackLastCommit = async () => {
    if (!gitStatus?.commitHistory.length) return;

    setOperation({ type: 'rollback', loading: true, error: null });
    try {
      const result = await window.electronAPI.sessions.rollbackLastCommit(session.id);
      if (result && result.success) {
        await loadGitStatus();
        onSessionUpdate?.();
      } else {
        setOperation(prev => ({ ...prev, error: result?.error || 'Failed to rollback commit' }));
      }
    } catch (err) {
      setOperation(prev => ({ ...prev, error: err instanceof Error ? err.message : 'Unknown error' }));
    } finally {
      setOperation(prev => ({ ...prev, loading: false }));
    }
  };

  const rollbackToCommit = async (commitSha: string) => {
    setOperation({ type: 'rollback', loading: true, error: null });
    try {
      const result = await window.electronAPI.sessions.rollbackToCommit(session.id, commitSha);
      if (result && result.success) {
        await loadGitStatus();
        onSessionUpdate?.();
      } else {
        setOperation(prev => ({ ...prev, error: result?.error || 'Failed to rollback to commit' }));
      }
    } catch (err) {
      setOperation(prev => ({ ...prev, error: err instanceof Error ? err.message : 'Unknown error' }));
    } finally {
      setOperation(prev => ({ ...prev, loading: false }));
    }
  };

  const squashCommits = async () => {
    if (!squashMessage.trim()) {
      setOperation(prev => ({ ...prev, error: 'Squash message is required' }));
      return;
    }

    setOperation({ type: 'squash', loading: true, error: null });
    try {
      const result = await window.electronAPI.sessions.squashCommits(session.id, {
        message: squashMessage,
        includeManual: includeManualCommits,
        selectedCommits: selectedCommits.length > 0 ? selectedCommits : undefined
      });
      if (result && result.success) {
        setSquashMessage('');
        setSelectedCommits([]);
        await loadGitStatus();
        onSessionUpdate?.();
      } else {
        setOperation(prev => ({ ...prev, error: result?.error || 'Failed to squash commits' }));
      }
    } catch (err) {
      setOperation(prev => ({ ...prev, error: err instanceof Error ? err.message : 'Unknown error' }));
    } finally {
      setOperation(prev => ({ ...prev, loading: false }));
    }
  };

  const openInEditor = () => {
    window.electronAPI.sessions.openInEditor(session.id);
  };

  if (!gitStatus) {
    return (
      <div className="p-6 space-y-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gruvbox-blue mx-auto"></div>
        <p className="text-center text-gruvbox-light3">Loading git status...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gruvbox-light1">Git Actions</h2>
        <div className="flex items-center space-x-3">
          <label className="flex items-center text-gruvbox-light2 text-sm">
            <input
              type="checkbox"
              checked={session.autoCommit !== false}
              onChange={async (e) => {
                const result = await window.electronAPI.sessions.setAutoCommit(session.id, e.target.checked);
                if (result && result.success) {
                  onSessionUpdate?.();
                }
              }}
              className="mr-2 rounded border-gruvbox-light2/30 bg-gruvbox-dark0 text-gruvbox-aqua focus:ring-gruvbox-aqua/20"
            />
            <span>Auto-commit changes</span>
          </label>
          <button
            onClick={openInEditor}
            className="px-3 py-1 text-sm bg-gruvbox-gray text-gruvbox-light0 rounded hover:bg-gruvbox-gray transition-colors"
          >
            Open in Editor
          </button>
        </div>
      </div>

      {operation.error && (
        <div className="p-3 bg-gruvbox-red/10 border border-gruvbox-red/30 rounded-lg">
          <p className="text-gruvbox-red text-sm">{operation.error}</p>
        </div>
      )}

      {/* Working Directory Status */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-gruvbox-light1">Working Directory</h3>
        
        <div className="grid grid-cols-3 gap-4">
          <div className={`p-3 rounded border text-center ${gitStatus.isClean ? 'bg-gruvbox-green/10 border-gruvbox-green/30 text-gruvbox-green' : 'bg-gruvbox-yellow/10 border-gruvbox-yellow/30 text-gruvbox-yellow'}`}>
            <div className="font-semibold">{gitStatus.isClean ? 'Clean' : 'Modified'}</div>
            <div className="text-xs">Repository</div>
          </div>
          <div className={`p-3 rounded border text-center ${gitStatus.hasStagedChanges ? 'bg-gruvbox-blue/10 border-gruvbox-blue/30 text-gruvbox-blue' : 'bg-gruvbox-bg3/10 border-gruvbox-bg3/30 text-gruvbox-light4'}`}>
            <div className="font-semibold">{gitStatus.stagedFiles.length}</div>
            <div className="text-xs">Staged Files</div>
          </div>
          <div className={`p-3 rounded border text-center ${gitStatus.hasUnstagedChanges ? 'bg-gruvbox-orange/10 border-gruvbox-orange/30 text-gruvbox-orange' : 'bg-gruvbox-bg3/10 border-gruvbox-bg3/30 text-gruvbox-light4'}`}>
            <div className="font-semibold">{gitStatus.unstagedFiles.length}</div>
            <div className="text-xs">Unstaged Files</div>
          </div>
        </div>

        {/* File Lists */}
        {gitStatus.unstagedFiles.length > 0 && (
          <div className="p-3 bg-gruvbox-orange/10 border border-gruvbox-orange/30 rounded-lg">
            <h4 className="font-semibold text-gruvbox-orange mb-2">Unstaged Changes:</h4>
            <ul className="text-sm text-gruvbox-light2 space-y-1 max-h-32 overflow-y-auto">
              {gitStatus.unstagedFiles.map((file, index) => (
                <li key={index} className="font-mono">• {file}</li>
              ))}
            </ul>
          </div>
        )}

        {gitStatus.stagedFiles.length > 0 && (
          <div className="p-3 bg-gruvbox-blue/10 border border-gruvbox-blue/30 rounded-lg">
            <h4 className="font-semibold text-gruvbox-blue mb-2">Staged Changes:</h4>
            <ul className="text-sm text-gruvbox-light2 space-y-1 max-h-32 overflow-y-auto">
              {gitStatus.stagedFiles.map((file, index) => (
                <li key={index} className="font-mono">• {file}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Stage/Unstage Actions */}
        <div className="flex space-x-3">
          <button
            onClick={stageAllChanges}
            disabled={operation.loading || !gitStatus.hasUnstagedChanges}
            className="px-4 py-2 bg-gruvbox-blue text-gruvbox-dark0 rounded hover:bg-gruvbox-blue disabled:opacity-50 transition-colors"
          >
            Stage All Changes
          </button>
          <button
            onClick={unstageAllChanges}
            disabled={operation.loading || !gitStatus.hasStagedChanges}
            className="px-4 py-2 border border-gruvbox-light2/30 text-gruvbox-light2 rounded hover:bg-gruvbox-dark2/20 disabled:opacity-50 transition-colors"
          >
            Unstage All
          </button>
        </div>
      </div>

      {/* Commit Section */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-gruvbox-light1">Commit Changes</h3>
        
        <div>
          <textarea
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            placeholder="Enter commit message..."
            className="w-full p-3 bg-gruvbox-dark0 border border-gruvbox-light2/30 rounded-md text-gruvbox-light1 placeholder-gruvbox-light4 focus:outline-none focus:ring-2 focus:ring-gruvbox-aqua focus:border-gruvbox-aqua resize-none"
            rows={3}
            disabled={operation.loading}
          />
        </div>

        <button
          onClick={commitStagedChanges}
          disabled={operation.loading || !gitStatus.hasStagedChanges || !commitMessage.trim()}
          className="px-4 py-2 bg-gruvbox-green text-gruvbox-dark0 rounded hover:bg-gruvbox-green disabled:opacity-50 transition-colors"
        >
          {operation.type === 'commit' && operation.loading ? 'Committing...' : 'Commit Staged Changes'}
        </button>
      </div>

      {/* Commit History & Rollback */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-gruvbox-light1">Commit History</h3>
        
        <div className="max-h-64 overflow-y-auto border border-gruvbox-light2/20 rounded-lg">
          {gitStatus.commitHistory.map((commit, index) => (
            <div
              key={commit.sha}
              className="p-3 border-b border-gruvbox-light2/10 last:border-b-0 hover:bg-gruvbox-dark2/20"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="font-mono text-sm text-gruvbox-blue">
                    {commit.sha.slice(0, 8)}
                  </div>
                  <div className="text-gruvbox-light1 font-medium">
                    {commit.message}
                  </div>
                  <div className="text-sm text-gruvbox-light4">
                    {commit.author} • {new Date(commit.date).toLocaleDateString()}
                  </div>
                </div>
                <button
                  onClick={() => rollbackToCommit(commit.sha)}
                  disabled={operation.loading || index === 0}
                  className="px-3 py-1 text-sm bg-gruvbox-red/20 text-gruvbox-red border border-gruvbox-red/30 rounded hover:bg-gruvbox-red/30 disabled:opacity-50 transition-colors"
                >
                  Rollback to Here
                </button>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={rollbackLastCommit}
          disabled={operation.loading || gitStatus.commitHistory.length === 0}
          className="px-4 py-2 bg-gruvbox-red text-gruvbox-light0 rounded hover:bg-gruvbox-red disabled:opacity-50 transition-colors"
        >
          {operation.type === 'rollback' && operation.loading ? 'Rolling back...' : 'Rollback Last Commit'}
        </button>
      </div>

      {/* Squash Section */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-gruvbox-light1">Squash Commits</h3>
        
        <div>
          <textarea
            value={squashMessage}
            onChange={(e) => setSquashMessage(e.target.value)}
            placeholder="Enter squash commit message..."
            className="w-full p-3 bg-gruvbox-dark0 border border-gruvbox-light2/30 rounded-md text-gruvbox-light1 placeholder-gruvbox-light4 focus:outline-none focus:ring-2 focus:ring-gruvbox-aqua focus:border-gruvbox-aqua resize-none"
            rows={2}
            disabled={operation.loading}
          />
        </div>

        <label className="flex items-center text-gruvbox-light2">
          <input
            type="checkbox"
            checked={includeManualCommits}
            onChange={(e) => setIncludeManualCommits(e.target.checked)}
            disabled={operation.loading}
            className="mr-2 rounded border-gruvbox-light2/30 bg-gruvbox-dark0 text-gruvbox-aqua focus:ring-gruvbox-aqua/20"
          />
          <span>Include manual commits in squash</span>
        </label>

        <button
          onClick={squashCommits}
          disabled={operation.loading || gitStatus.commitHistory.length < 2 || !squashMessage.trim()}
          className="px-4 py-2 bg-gruvbox-purple text-gruvbox-light0 rounded hover:bg-gruvbox-purple disabled:opacity-50 transition-colors"
        >
          {operation.type === 'squash' && operation.loading ? 'Squashing...' : 'Squash Commits'}
        </button>
      </div>

      {/* Merge to Main */}
      <div className="space-y-3 pt-4 border-t border-gruvbox-light2/20">
        <h3 className="text-lg font-semibold text-gruvbox-light1">Merge to Main</h3>
        <p className="text-sm text-gruvbox-light3">
          Once you've committed and organized your changes, you can merge this session to the main branch.
        </p>
        
        <button
          onClick={() => setShowMergeWizard(true)}
          disabled={operation.loading || (gitStatus.hasUnstagedChanges)}
          className="px-6 py-2 bg-gruvbox-aqua text-gruvbox-dark0 rounded hover:bg-gruvbox-aqua disabled:opacity-50 transition-colors font-semibold"
        >
          Open Merge Wizard
        </button>
      </div>

      {showMergeWizard && (
        <MergeWizard
          session={session}
          onClose={() => setShowMergeWizard(false)}
          onComplete={() => {
            setShowMergeWizard(false);
            onSessionUpdate?.();
          }}
        />
      )}
    </div>
  );
}

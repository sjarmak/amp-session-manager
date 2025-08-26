import React, { useState, useEffect } from 'react';

interface MainRepoGitViewProps {
  repoPath: string;
  onClose?: () => void;
}

interface MainGitStatus {
  hasUnstagedChanges: boolean;
  hasStagedChanges: boolean;
  unstagedFiles: string[];
  stagedFiles: string[];
  commitHistory: { sha: string; message: string; author: string; date: string }[];
  isClean: boolean;
}

interface CommitOperation {
  type: 'stage' | 'unstage' | 'commit';
  loading: boolean;
  error: string | null;
}

export function MainRepoGitView({ repoPath, onClose }: MainRepoGitViewProps) {
  const [gitStatus, setGitStatus] = useState<MainGitStatus | null>(null);
  const [commitMessage, setCommitMessage] = useState('');
  const [operation, setOperation] = useState<CommitOperation>({ type: 'stage', loading: false, error: null });

  useEffect(() => {
    loadGitStatus();
  }, [repoPath]);

  const loadGitStatus = async () => {
    try {
      const result = await window.electronAPI.main.getGitStatus(repoPath);
      if (result && result.success && result.result) {
        setGitStatus(result.result);
      }
    } catch (err) {
      console.error('Failed to load main git status:', err);
    }
  };

  const stageAllChanges = async () => {
    setOperation({ type: 'stage', loading: true, error: null });
    try {
      const result = await window.electronAPI.main.stageAllChanges(repoPath);
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
    setOperation({ type: 'unstage', loading: true, error: null });
    try {
      const result = await window.electronAPI.main.unstageAllChanges(repoPath);
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
      const result = await window.electronAPI.main.commitStagedChanges(repoPath, commitMessage);
      if (result && result.success) {
        setCommitMessage('');
        await loadGitStatus();
      } else {
        setOperation(prev => ({ ...prev, error: result?.error || 'Failed to commit changes' }));
      }
    } catch (err) {
      setOperation(prev => ({ ...prev, error: err instanceof Error ? err.message : 'Unknown error' }));
    } finally {
      setOperation(prev => ({ ...prev, loading: false }));
    }
  };

  if (!gitStatus) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-gruvbox-dark0 p-6 rounded-lg border border-gruvbox-light2/30 w-full max-w-4xl max-h-[80vh] overflow-y-auto">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gruvbox-blue mx-auto"></div>
          <p className="text-center text-gruvbox-light3 mt-4">Loading git status...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gruvbox-dark0 p-6 rounded-lg border border-gruvbox-light2/30 w-full max-w-4xl max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gruvbox-light1">Main Repository Git Status</h2>
          <button
            onClick={onClose}
            className="px-4 py-2 text-gruvbox-light2 hover:text-gruvbox-light1 transition-colors"
          >
            Close
          </button>
        </div>

        <div className="text-sm text-gruvbox-light4 mb-4 font-mono">
          {repoPath}
        </div>

        {operation.error && (
          <div className="mb-4 p-3 bg-gruvbox-red/10 border border-gruvbox-red/30 rounded-lg">
            <p className="text-gruvbox-red text-sm">{operation.error}</p>
          </div>
        )}

        {/* Working Directory Status */}
        <div className="space-y-4">
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
              <div className="text-xs">Untracked/Modified Files</div>
            </div>
          </div>

          {/* File Lists */}
          {gitStatus.unstagedFiles.length > 0 && (
            <div className="p-3 bg-gruvbox-orange/10 border border-gruvbox-orange/30 rounded-lg">
              <h4 className="font-semibold text-gruvbox-orange mb-2">Untracked/Modified Files:</h4>
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
              {operation.type === 'stage' && operation.loading ? 'Staging...' : 'Stage All Changes'}
            </button>
            <button
              onClick={unstageAllChanges}
              disabled={operation.loading || !gitStatus.hasStagedChanges}
              className="px-4 py-2 border border-gruvbox-light2/30 text-gruvbox-light2 rounded hover:bg-gruvbox-dark2/20 disabled:opacity-50 transition-colors"
            >
              {operation.type === 'unstage' && operation.loading ? 'Unstaging...' : 'Unstage All'}
            </button>
          </div>
        </div>

        {/* Commit Section */}
        <div className="space-y-4 mt-6">
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

        {/* Recent Commits */}
        {gitStatus.commitHistory.length > 0 && (
          <div className="space-y-3 mt-6">
            <h3 className="text-lg font-semibold text-gruvbox-light1">Recent Commits</h3>
            
            <div className="max-h-48 overflow-y-auto border border-gruvbox-light2/20 rounded-lg">
              {gitStatus.commitHistory.slice(0, 5).map((commit) => (
                <div
                  key={commit.sha}
                  className="p-3 border-b border-gruvbox-light2/10 last:border-b-0"
                >
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
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { CommitMeta, GitFileInfo } from '../types/git-state';

interface GitCommitViewProps {
  commits: CommitMeta[];
  stagedFiles: GitFileInfo[];
  onCommitStaged: (message: string) => void;
  onAmendCommit: (sha: string, message: string) => void;
  onDropCommit: (sha: string) => void;
  onResetToCommit: (sha: string, soft: boolean) => void;
  loading: boolean;
}

export function GitCommitView({
  commits,
  stagedFiles,
  onCommitStaged,
  onAmendCommit,
  onDropCommit,
  onResetToCommit,
  loading
}: GitCommitViewProps) {
  const [newCommitMessage, setNewCommitMessage] = useState('');
  const [editingCommit, setEditingCommit] = useState<string | null>(null);
  const [editMessage, setEditMessage] = useState('');
  const [stageAllFiles, setStageAllFiles] = useState(false);

  const handleCreateCommit = async () => {
    if (!newCommitMessage.trim()) return;
    
    await onCommitStaged(newCommitMessage.trim());
    setNewCommitMessage('');
    setStageAllFiles(false);
  };

  const handleStartEdit = (commit: CommitMeta) => {
    setEditingCommit(commit.sha);
    setEditMessage(commit.message);
  };

  const handleSaveEdit = async () => {
    if (!editingCommit || !editMessage.trim()) return;
    
    await onAmendCommit(editingCommit, editMessage.trim());
    setEditingCommit(null);
    setEditMessage('');
  };

  const handleCancelEdit = () => {
    setEditingCommit(null);
    setEditMessage('');
  };

  const getCommitType = (message: string): 'amp' | 'manual' => {
    return message.startsWith('amp:') ? 'amp' : 'manual';
  };

  const formatCommitDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  const getCommitIcon = (message: string) => {
    const type = getCommitType(message);
    return type === 'amp' ? '🤖' : '👤';
  };

  const getCommitTypeColor = (message: string) => {
    const type = getCommitType(message);
    return type === 'amp' ? 'text-blue-400' : 'text-green-400';
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Commit Management</h2>
        <div className="text-sm text-gray-500">
          Create, edit, and manage commits
        </div>
      </div>

      {/* New Commit Form */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 space-y-4">
        <h3 className="text-lg font-medium">Create New Commit</h3>
        
        {stagedFiles.length > 0 && (
          <div className="text-sm text-green-400">
            {stagedFiles.length} file{stagedFiles.length !== 1 ? 's' : ''} staged for commit
          </div>
        )}

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="stageAll"
              checked={stageAllFiles}
              onChange={(e) => setStageAllFiles(e.target.checked)}
              className="rounded border-gray-600"
            />
            <label htmlFor="stageAll" className="text-sm text-gray-300">
              Stage all changes before committing
            </label>
          </div>

          <textarea
            value={newCommitMessage}
            onChange={(e) => setNewCommitMessage(e.target.value)}
            placeholder="Enter commit message..."
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            rows={3}
          />

          <button
            onClick={handleCreateCommit}
            disabled={!newCommitMessage.trim() || (stagedFiles.length === 0 && !stageAllFiles) || loading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-md text-white font-medium"
          >
            {stageAllFiles ? 'Stage All & Commit' : 'Commit Staged'}
          </button>
        </div>
      </div>

      {/* Commit Timeline */}
      <div className="space-y-3">
        <h3 className="text-lg font-medium">Commit History</h3>
        
        {commits.length === 0 ? (
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 text-center text-gray-500">
            No commits found
          </div>
        ) : (
          <div className="space-y-2">
            {commits.map((commit) => (
              <div
                key={commit.sha}
                className="bg-gray-800 rounded-lg border border-gray-700 p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">{getCommitIcon(commit.message)}</span>
                      <span className={`text-xs font-mono px-2 py-1 rounded ${getCommitTypeColor(commit.message)} bg-gray-700`}>
                        {getCommitType(commit.message).toUpperCase()}
                      </span>
                      <span className="text-xs font-mono text-gray-400">
                        {commit.sha.substring(0, 8)}
                      </span>
                    </div>

                    {editingCommit === commit.sha ? (
                      <div className="space-y-3">
                        <textarea
                          value={editMessage}
                          onChange={(e) => setEditMessage(e.target.value)}
                          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                          rows={2}
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={handleSaveEdit}
                            disabled={!editMessage.trim() || loading}
                            className="px-3 py-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded text-sm text-white"
                          >
                            Save
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="px-3 py-1 bg-gray-600 hover:bg-gray-700 rounded text-sm text-white"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="text-sm text-white mb-1">{commit.message}</div>
                        <div className="text-xs text-gray-400">
                          {commit.author} • {formatCommitDate(commit.timestamp)}
                        </div>
                      </>
                    )}
                  </div>

                  {editingCommit !== commit.sha && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleStartEdit(commit)}
                        disabled={loading}
                        className="px-3 py-1 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-700 rounded text-sm text-white"
                        title="Edit commit message"
                      >
                        ✏️ Edit
                      </button>
                      <button
                        onClick={() => onResetToCommit(commit.sha, true)}
                        disabled={loading}
                        className="px-3 py-1 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-700 rounded text-sm text-white"
                        title="Soft reset to this commit (keep changes staged)"
                      >
                        🔄 Reset
                      </button>
                      <button
                        onClick={() => onDropCommit(commit.sha)}
                        disabled={loading}
                        className="px-3 py-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 rounded text-sm text-white"
                        title="Drop this commit (dangerous)"
                      >
                        🗑️ Drop
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Commit Statistics */}
      {commits.length > 0 && (
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-blue-400">
                {commits.filter(c => getCommitType(c.message) === 'amp').length}
              </div>
              <div className="text-sm text-gray-400">Amp Commits</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-400">
                {commits.filter(c => getCommitType(c.message) === 'manual').length}
              </div>
              <div className="text-sm text-gray-400">Manual Commits</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-300">
                {commits.length}
              </div>
              <div className="text-sm text-gray-400">Total Commits</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

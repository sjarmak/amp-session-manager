import React from 'react';
import { CommitMeta } from '../types/git-state';

interface GitMergePlanViewProps {
  commits: CommitMeta[];
  selectedCommits: string[];
  baseBranch: string;
  onToggleCommit: (sha: string) => void;
  onExecutePlan: () => void;
  loading: boolean;
}

export function GitMergePlanView({
  commits,
  selectedCommits,
  baseBranch,
  onToggleCommit,
  onExecutePlan,
  loading
}: GitMergePlanViewProps) {
  const selectedCommitObjects = commits.filter(c => selectedCommits.includes(c.sha));

  const getCommitIcon = (message: string) => {
    return message.startsWith('amp:') ? '🤖' : '👤';
  };



  const renderMergePreview = () => {
    if (selectedCommitObjects.length === 0) {
      return (
        <div className="text-center text-gray-500 py-8">
          No commits selected for merge
        </div>
      );
    }

    return (
      <div className="space-y-2">
        <div className="text-sm text-gray-400 mb-4">
          These commits will be rebased and merged individually:
        </div>
        {selectedCommitObjects.map((commit) => (
          <div key={commit.sha} className="flex items-center gap-3 py-2 px-3 bg-gray-700 rounded">
            <span className="text-lg">{getCommitIcon(commit.message)}</span>
            <span className="text-xs font-mono text-gray-400">
              {commit.sha.substring(0, 8)}
            </span>
            <span className="text-sm flex-1">{commit.message}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Merge Plan</h2>
        <div className="text-sm text-gray-500">
          Select commits and merge strategy
        </div>
      </div>

      {/* Commit Selection */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium">Select Commits</h3>
          <div className="flex gap-2">
            <button
              onClick={() => commits.forEach(c => {
                if (!selectedCommits.includes(c.sha)) {
                  onToggleCommit(c.sha);
                }
              })}
              className="text-sm text-blue-400 hover:text-blue-300"
            >
              Select All
            </button>
            <button
              onClick={() => selectedCommits.forEach(sha => onToggleCommit(sha))}
              className="text-sm text-gray-400 hover:text-gray-300"
            >
              Clear All
            </button>
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg border border-gray-700 max-h-80 overflow-y-auto">
          {commits.length === 0 ? (
            <div className="p-4 text-center text-gray-500">
              No commits available
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {commits.map((commit) => (
                <div
                  key={commit.sha}
                  className={`flex items-center gap-3 p-3 rounded cursor-pointer hover:bg-gray-700 ${
                    selectedCommits.includes(commit.sha) ? 'bg-blue-900/50 border border-blue-700' : ''
                  }`}
                  onClick={() => onToggleCommit(commit.sha)}
                >
                  <input
                    type="checkbox"
                    checked={selectedCommits.includes(commit.sha)}
                    onChange={() => onToggleCommit(commit.sha)}
                    className="rounded border-gray-600"
                  />
                  <span className="text-lg">{getCommitIcon(commit.message)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-gray-400">
                        {commit.sha.substring(0, 8)}
                      </span>
                      <span className={`text-xs px-2 py-1 rounded ${
                        commit.message.startsWith('amp:') ? 'bg-blue-900 text-blue-300' : 'bg-green-900 text-green-300'
                      }`}>
                        {commit.message.startsWith('amp:') ? 'AMP' : 'MANUAL'}
                      </span>
                    </div>
                    <div className="text-sm text-white truncate">{commit.message}</div>
                    <div className="text-xs text-gray-400">
                      {commit.author} • {new Date(commit.timestamp * 1000).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>



      {/* Merge Preview */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 space-y-4">
        <h3 className="text-lg font-medium">Merge Preview</h3>
        <div className="text-sm text-gray-400 mb-3">
          Changes will be rebased onto <code className="bg-gray-700 px-2 py-1 rounded text-blue-400">{baseBranch}</code>
        </div>
        {renderMergePreview()}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-4 pt-4 border-t border-gray-700">
        <button
          onClick={onExecutePlan}
          disabled={selectedCommits.length === 0 || loading}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-md text-white font-medium"
        >
          {loading ? 'Processing...' : `Rebase & Merge to ${baseBranch}`}
        </button>
      </div>
    </div>
  );
}

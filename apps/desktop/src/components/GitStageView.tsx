import React, { useState } from 'react';
import { GitFileInfo } from '../types/git-state';

interface GitStageViewProps {
  unstagedFiles: GitFileInfo[];
  stagedFiles: GitFileInfo[];
  onStageFiles: (files: string[]) => void;
  onUnstageFiles: (files: string[]) => void;
  onViewDiff: (file: string) => void;
  loading: boolean;
}

export function GitStageView({
  unstagedFiles,
  stagedFiles,
  onStageFiles,
  onUnstageFiles,
  onViewDiff,
  loading
}: GitStageViewProps) {
  const [selectedUnstaged, setSelectedUnstaged] = useState<string[]>([]);
  const [selectedStaged, setSelectedStaged] = useState<string[]>([]);

  const handleToggleUnstaged = (filePath: string) => {
    setSelectedUnstaged(prev => 
      prev.includes(filePath) 
        ? prev.filter(p => p !== filePath)
        : [...prev, filePath]
    );
  };

  const handleToggleStaged = (filePath: string) => {
    setSelectedStaged(prev => 
      prev.includes(filePath) 
        ? prev.filter(p => p !== filePath)
        : [...prev, filePath]
    );
  };

  const handleStageSelected = () => {
    if (selectedUnstaged.length > 0) {
      onStageFiles(selectedUnstaged);
      setSelectedUnstaged([]);
    }
  };

  const handleUnstageSelected = () => {
    if (selectedStaged.length > 0) {
      onUnstageFiles(selectedStaged);
      setSelectedStaged([]);
    }
  };

  const getFileIcon = (status: GitFileInfo['status']) => {
    switch (status) {
      case 'modified': return '📝';
      case 'added': return '➕';
      case 'deleted': return '🗑️';
      case 'renamed': return '🔄';
      case 'copied': return '📄';
      case 'untracked': return '❓';
      default: return '📄';
    }
  };

  const getStatusColor = (status: GitFileInfo['status']) => {
    switch (status) {
      case 'modified': return 'text-orange-400';
      case 'added': return 'text-green-400';
      case 'deleted': return 'text-red-400';
      case 'renamed': return 'text-blue-400';
      case 'copied': return 'text-purple-400';
      case 'untracked': return 'text-gray-400';
      default: return 'text-gray-400';
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Stage Files</h2>
        <div className="text-sm text-gray-500">
          Select files to stage or unstage changes
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Unstaged Files */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">Working Tree ({unstagedFiles.length})</h3>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedUnstaged(unstagedFiles.map(f => f.path))}
                className="text-sm text-blue-400 hover:text-blue-300"
              >
                Select All
              </button>
              <button
                onClick={() => setSelectedUnstaged([])}
                className="text-sm text-gray-400 hover:text-gray-300"
              >
                Clear
              </button>
            </div>
          </div>
          
          <div className="bg-gray-800 rounded-lg border border-gray-700 max-h-80 overflow-y-auto">
            {unstagedFiles.length === 0 ? (
              <div className="p-4 text-center text-gray-500">
                No unstaged changes
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {unstagedFiles.map((file) => (
                  <div
                    key={file.path}
                    className={`flex items-center gap-3 p-2 rounded cursor-pointer hover:bg-gray-700 ${
                      selectedUnstaged.includes(file.path) ? 'bg-blue-900/50 border border-blue-700' : ''
                    }`}
                    onClick={() => handleToggleUnstaged(file.path)}
                  >
                    <input
                      type="checkbox"
                      checked={selectedUnstaged.includes(file.path)}
                      onChange={() => handleToggleUnstaged(file.path)}
                      className="rounded border-gray-600"
                    />
                    <span className="text-lg">{getFileIcon(file.status)}</span>
                    <span className={`text-xs font-mono ${getStatusColor(file.status)}`}>
                      {file.status.toUpperCase()}
                    </span>
                    <span className="text-sm font-mono flex-1 truncate">{file.path}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewDiff(file.path);
                      }}
                      className="text-xs text-gray-400 hover:text-gray-300 px-2 py-1 rounded border border-gray-600"
                    >
                      Diff
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={handleStageSelected}
            disabled={selectedUnstaged.length === 0 || loading}
            className="w-full py-2 px-4 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-md text-white font-medium"
          >
            Stage Selected ({selectedUnstaged.length})
          </button>
        </div>

        {/* Staged Files */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">Index ({stagedFiles.length})</h3>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedStaged(stagedFiles.map(f => f.path))}
                className="text-sm text-blue-400 hover:text-blue-300"
              >
                Select All
              </button>
              <button
                onClick={() => setSelectedStaged([])}
                className="text-sm text-gray-400 hover:text-gray-300"
              >
                Clear
              </button>
            </div>
          </div>
          
          <div className="bg-gray-800 rounded-lg border border-gray-700 max-h-80 overflow-y-auto">
            {stagedFiles.length === 0 ? (
              <div className="p-4 text-center text-gray-500">
                No staged changes
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {stagedFiles.map((file) => (
                  <div
                    key={file.path}
                    className={`flex items-center gap-3 p-2 rounded cursor-pointer hover:bg-gray-700 ${
                      selectedStaged.includes(file.path) ? 'bg-blue-900/50 border border-blue-700' : ''
                    }`}
                    onClick={() => handleToggleStaged(file.path)}
                  >
                    <input
                      type="checkbox"
                      checked={selectedStaged.includes(file.path)}
                      onChange={() => handleToggleStaged(file.path)}
                      className="rounded border-gray-600"
                    />
                    <span className="text-lg">{getFileIcon(file.status)}</span>
                    <span className={`text-xs font-mono ${getStatusColor(file.status)}`}>
                      {file.status.toUpperCase()}
                    </span>
                    <span className="text-sm font-mono flex-1 truncate">{file.path}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewDiff(file.path);
                      }}
                      className="text-xs text-gray-400 hover:text-gray-300 px-2 py-1 rounded border border-gray-600"
                    >
                      Diff
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={handleUnstageSelected}
            disabled={selectedStaged.length === 0 || loading}
            className="w-full py-2 px-4 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-md text-white font-medium"
          >
            Unstage Selected ({selectedStaged.length})
          </button>
        </div>
      </div>

      {/* Bulk Actions */}
      <div className="flex gap-4 pt-4 border-t border-gray-700">
        <button
          onClick={() => onStageFiles(unstagedFiles.map(f => f.path))}
          disabled={unstagedFiles.length === 0 || loading}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-md text-white font-medium"
        >
          Stage All
        </button>
        <button
          onClick={() => onUnstageFiles(stagedFiles.map(f => f.path))}
          disabled={stagedFiles.length === 0 || loading}
          className="px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-md text-white font-medium"
        >
          Unstage All
        </button>
      </div>
    </div>
  );
}

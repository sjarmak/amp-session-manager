import React, { useReducer, useEffect, useState } from 'react';
import { Session } from '@ampsm/types';
import { GitStageView } from './GitStageView';
import { GitCommitView } from './GitCommitView';
import { GitMergePlanView } from './GitMergePlanView';
import { 
  GitState, 
  GitAction, 
  WizardStep, 
  GitFileInfo,
  initialGitState, 
  gitStateReducer 
} from '../types/git-state';

interface EnhancedMergeWizardProps {
  session: Session;
  onComplete: () => void;
  onCancel: () => void;
}

export function EnhancedMergeWizard({ session, onComplete, onCancel }: EnhancedMergeWizardProps) {
  const [gitState, dispatch] = useReducer(gitStateReducer, initialGitState);
  const [showDiff, setShowDiff] = useState<string | null>(null);
  const [diffContent, setDiffContent] = useState<string>('');

  useEffect(() => {
    refreshGitState();
  }, [session.id]);

  const refreshGitState = async () => {
    dispatch({ type: 'SET_LOADING', loading: true });
    
    try {
      const response = await window.electronAPI.sessions.getGitStatus(session.id);
      if (!response.success) {
        throw new Error(response.error || 'Failed to get Git status');
      }

      const { result } = response;
      
      // Convert file arrays to GitFileInfo format
      const unstaged: GitFileInfo[] = result.unstagedFiles.map((path: string) => ({
        path,
        status: 'modified' as const // We'll enhance this later with proper status parsing
      }));
      
      const staged: GitFileInfo[] = result.stagedFiles.map((path: string) => ({
        path,
        status: 'modified' as const
      }));

      dispatch({
        type: 'REFRESH_STATE',
        payload: {
          unstaged,
          staged,
          commits: result.commitHistory || [],
          isDirty: result.hasUnstagedChanges || result.hasStagedChanges,
          error: undefined
        }
      });
    } catch (error) {
      dispatch({ 
        type: 'SET_ERROR', 
        error: error instanceof Error ? error.message : 'Failed to refresh Git state' 
      });
    }
  };

  const handleStageFiles = async (files: string[]) => {
    dispatch({ type: 'SET_LOADING', loading: true });
    
    try {
      const response = await window.electronAPI.sessions.stageFiles(session.id, files);
      if (!response.success) {
        throw new Error(response.error || 'Failed to stage files');
      }
      await refreshGitState();
    } catch (error) {
      dispatch({ 
        type: 'SET_ERROR', 
        error: error instanceof Error ? error.message : 'Failed to stage files' 
      });
    }
  };

  const handleUnstageFiles = async (files: string[]) => {
    dispatch({ type: 'SET_LOADING', loading: true });
    
    try {
      const response = await window.electronAPI.sessions.unstageFiles(session.id, files);
      if (!response.success) {
        throw new Error(response.error || 'Failed to unstage files');
      }
      await refreshGitState();
    } catch (error) {
      dispatch({ 
        type: 'SET_ERROR', 
        error: error instanceof Error ? error.message : 'Failed to unstage files' 
      });
    }
  };

  const handleViewDiff = async (filePath: string) => {
    try {
      const response = await window.electronAPI.sessions.getDiff(session.id, filePath);
      if (!response.success || !response.result) {
        throw new Error(response.error || 'Failed to get diff');
      }
      setDiffContent(response.result.diff);
      setShowDiff(filePath);
    } catch (error) {
      dispatch({ 
        type: 'SET_ERROR', 
        error: error instanceof Error ? error.message : 'Failed to get diff' 
      });
    }
  };

  const handleCommitStaged = async (message: string) => {
    dispatch({ type: 'SET_LOADING', loading: true });
    
    try {
      const response = await window.electronAPI.sessions.commitStagedChanges(session.id, message);
      if (!response.success) {
        throw new Error(response.error || 'Failed to commit');
      }
      await refreshGitState();
    } catch (error) {
      dispatch({ 
        type: 'SET_ERROR', 
        error: error instanceof Error ? error.message : 'Failed to commit' 
      });
    }
  };

  const handleAmendCommit = async (sha: string, message: string) => {
    dispatch({ type: 'SET_LOADING', loading: true });
    
    try {
      const response = await window.electronAPI.sessions.commitAmend(session.id, message);
      if (!response.success) {
        throw new Error(response.error || 'Failed to amend commit');
      }
      await refreshGitState();
    } catch (error) {
      dispatch({ 
        type: 'SET_ERROR', 
        error: error instanceof Error ? error.message : 'Failed to amend commit' 
      });
    }
  };

  const handleDropCommit = async (sha: string) => {
    if (!confirm('Are you sure you want to drop this commit? This action cannot be undone.')) {
      return;
    }
    
    dispatch({ type: 'SET_LOADING', loading: true });
    
    try {
      // Find parent commit and soft reset to it
      const commitIndex = gitState.commits.findIndex(c => c.sha === sha);
      if (commitIndex === -1) {
        throw new Error('Commit not found');
      }
      
      // Reset to parent (next commit in the array since they're in reverse chronological order)
      const parentCommit = gitState.commits[commitIndex + 1];
      if (!parentCommit) {
        throw new Error('Cannot drop the initial commit');
      }
      
      const response = await window.electronAPI.sessions.resetToCommit(session.id, parentCommit.sha, true);
      if (!response.success) {
        throw new Error(response.error || 'Failed to drop commit');
      }
      await refreshGitState();
    } catch (error) {
      dispatch({ 
        type: 'SET_ERROR', 
        error: error instanceof Error ? error.message : 'Failed to drop commit' 
      });
    }
  };

  const handleResetToCommit = async (sha: string, soft: boolean) => {
    const resetType = soft ? 'soft' : 'hard';
    if (!confirm(`Are you sure you want to ${resetType} reset to this commit?`)) {
      return;
    }
    
    dispatch({ type: 'SET_LOADING', loading: true });
    
    try {
      const response = await window.electronAPI.sessions.resetToCommit(session.id, sha, soft);
      if (!response.success) {
        throw new Error(response.error || 'Failed to reset');
      }
      await refreshGitState();
    } catch (error) {
      dispatch({ 
        type: 'SET_ERROR', 
        error: error instanceof Error ? error.message : 'Failed to reset' 
      });
    }
  };

  const handleExecutePlan = async () => {
    dispatch({ type: 'SET_LOADING', loading: true });
    
    try {
      // Continue with rebase and merge - skip squash entirely
      dispatch({ type: 'SET_STEP', step: 'rebase' });
      
      // Start the rebase process
      const rebaseResponse = await window.electronAPI.sessions.rebaseOntoBase(session.id);
      if (!rebaseResponse.success) {
        throw new Error(rebaseResponse.error || 'Failed to rebase onto base branch');
      }
      
      // If rebase successful, proceed to merge
      dispatch({ type: 'SET_STEP', step: 'merge' });
      
      // Execute the merge
      const mergeResponse = await window.electronAPI.sessions.fastForwardMerge(session.id);
      if (!mergeResponse.success) {
        throw new Error(mergeResponse.error || 'Failed to merge');
      }
      
      // Success - go to cleanup/done step
      dispatch({ type: 'SET_STEP', step: 'done' });
      
      // Navigate back to sessions after a brief delay
      setTimeout(() => {
        onComplete();
      }, 2000);
      
    } catch (error) {
      dispatch({ 
        type: 'SET_ERROR', 
        error: error instanceof Error ? error.message : 'Failed to execute plan' 
      });
    }
  };

  const renderStepContent = () => {
    switch (gitState.step) {
      case 'preflight':
        return (
          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Pre-flight Checks</h2>
              <button
                onClick={refreshGitState}
                disabled={gitState.loading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded-md text-white font-medium"
              >
                {gitState.loading ? 'Checking...' : 'Re-run Checks'}
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <div className={`text-2xl font-bold ${gitState.unstaged.length > 0 ? 'text-orange-400' : 'text-green-400'}`}>
                      {gitState.unstaged.length}
                    </div>
                    <div className="text-sm text-gray-400">Unstaged Files</div>
                  </div>
                  <div className="text-center">
                    <div className={`text-2xl font-bold ${gitState.staged.length > 0 ? 'text-blue-400' : 'text-gray-400'}`}>
                      {gitState.staged.length}
                    </div>
                    <div className="text-sm text-gray-400">Staged Files</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-400">
                      {gitState.commits.length}
                    </div>
                    <div className="text-sm text-gray-400">Total Commits</div>
                  </div>
                  <div className="text-center">
                    <div className={`text-2xl font-bold ${gitState.isDirty ? 'text-red-400' : 'text-green-400'}`}>
                      {gitState.isDirty ? '⚠️' : '✅'}
                    </div>
                    <div className="text-sm text-gray-400">Repository Status</div>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex gap-4 pt-4 border-t border-gray-700">
              <button
                onClick={() => dispatch({ type: 'SET_STEP', step: 'stage' })}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-white font-medium"
              >
                Continue to Staging
              </button>
              <button
                onClick={onCancel}
                className="px-6 py-2 bg-gray-600 hover:bg-gray-700 rounded-md text-white font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        );

      case 'stage':
        return (
          <GitStageView
            unstagedFiles={gitState.unstaged}
            stagedFiles={gitState.staged}
            onStageFiles={handleStageFiles}
            onUnstageFiles={handleUnstageFiles}
            onViewDiff={handleViewDiff}
            loading={gitState.loading}
          />
        );

      case 'commit':
        return (
          <GitCommitView
            commits={gitState.commits}
            stagedFiles={gitState.staged}
            onCommitStaged={handleCommitStaged}
            onAmendCommit={handleAmendCommit}
            onDropCommit={handleDropCommit}
            onResetToCommit={handleResetToCommit}
            loading={gitState.loading}
          />
        );

      case 'plan':
        return (
          <GitMergePlanView
            commits={gitState.commits}
            selectedCommits={gitState.selectedCommits}
            baseBranch={session.baseBranch}
            onToggleCommit={(sha) => dispatch({ type: 'TOGGLE_COMMIT_SELECTION', sha })}
            onExecutePlan={handleExecutePlan}
            loading={gitState.loading}
          />
        );

      case 'done':
        return (
          <div className="p-6 space-y-6 text-center">
            <div className="text-green-400 text-6xl mb-4">✅</div>
            <h2 className="text-2xl font-semibold text-green-400">Merge Completed Successfully!</h2>
            <p className="text-gray-300">Your session changes have been successfully merged to {session.baseBranch}.</p>
            <p className="text-gray-400 text-sm">Redirecting to sessions list...</p>
          </div>
        );

      default:
        return <div>Step not implemented: {gitState.step}</div>;
    }
  };

  const getStepTitle = (step: WizardStep): string => {
    switch (step) {
      case 'preflight': return 'Pre-flight Checks';
      case 'stage': return 'Stage Files';
      case 'commit': return 'Manage Commits';
      case 'plan': return 'Merge Plan';
      case 'rebase': return 'Rebase';
      case 'merge': return 'Merge';
      case 'cleanup': return 'Cleanup';
      case 'done': return 'Complete';
      default: return step;
    }
  };

  const steps: WizardStep[] = ['preflight', 'stage', 'commit', 'plan', 'rebase', 'merge', 'cleanup', 'done'];
  const currentStepIndex = steps.indexOf(gitState.step);

  return (
    <div className="h-full flex flex-col">
      {/* Header with Step Indicator */}
      <div className="border-b border-gray-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Enhanced Merge Wizard</h1>
          <div className="text-sm text-gray-400">
            Session: {session.name}
          </div>
        </div>
        
        {/* Step Indicator */}
        <div className="flex items-center space-x-4">
          {steps.map((step, index) => (
            <React.Fragment key={step}>
              <div className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  index < currentStepIndex 
                    ? 'bg-green-600 text-white' 
                    : index === currentStepIndex 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-600 text-gray-300'
                }`}>
                  {index < currentStepIndex ? '✓' : index + 1}
                </div>
                <div className={`ml-2 text-sm ${
                  index === currentStepIndex ? 'text-white font-medium' : 'text-gray-400'
                }`}>
                  {getStepTitle(step)}
                </div>
              </div>
              {index < steps.length - 1 && (
                <div className={`flex-1 h-px ${
                  index < currentStepIndex ? 'bg-green-600' : 'bg-gray-600'
                }`} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Navigation */}
      <div className="border-b border-gray-700 p-4 flex gap-2">
        <button
          onClick={() => {
            const prevIndex = Math.max(0, currentStepIndex - 1);
            dispatch({ type: 'SET_STEP', step: steps[prevIndex] });
          }}
          disabled={currentStepIndex === 0 || gitState.loading}
          className="px-4 py-2 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-md text-white font-medium"
        >
          Back
        </button>
        
        <button
          onClick={() => {
            const nextIndex = Math.min(steps.length - 1, currentStepIndex + 1);
            dispatch({ type: 'SET_STEP', step: steps[nextIndex] });
          }}
          disabled={currentStepIndex === steps.length - 1 || gitState.loading}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-md text-white font-medium"
        >
          Next
        </button>

        <button
          onClick={refreshGitState}
          disabled={gitState.loading}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-md text-white font-medium ml-auto"
        >
          Refresh
        </button>
      </div>

      {/* Error Display */}
      {gitState.error && (
        <div className="bg-red-900/50 border border-red-700 p-4 m-4 rounded-lg">
          <div className="flex items-center gap-2">
            <span className="text-red-400 font-bold">Error:</span>
            <span className="text-red-300">{gitState.error}</span>
          </div>
          <button
            onClick={() => dispatch({ type: 'SET_ERROR', error: undefined })}
            className="mt-2 px-3 py-1 bg-red-700 hover:bg-red-600 rounded text-sm text-white"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        {renderStepContent()}
      </div>

      {/* Diff Modal */}
      {showDiff && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg border border-gray-700 w-4/5 h-4/5 flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
              <h3 className="text-lg font-medium">Diff: {showDiff}</h3>
              <button
                onClick={() => setShowDiff(null)}
                className="px-3 py-1 bg-gray-600 hover:bg-gray-700 rounded text-white"
              >
                Close
              </button>
            </div>
            <div className="flex-1 p-4 overflow-auto">
              <pre className="text-sm font-mono bg-gray-900 p-4 rounded whitespace-pre-wrap">
                {diffContent || 'No diff available'}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

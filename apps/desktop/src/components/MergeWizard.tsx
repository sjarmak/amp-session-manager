import React, { useState, useEffect } from 'react';
import type { Session, PreflightResult, RebaseResult } from '@ampsm/types';

interface MergeWizardProps {
  session: Session;
  onClose: () => void;
  onComplete: () => void;
}

type WizardStep = 'preflight' | 'squash' | 'rebase' | 'conflicts' | 'merge' | 'cleanup' | 'complete';

interface StepperProps {
  currentStep: WizardStep;
  completedSteps: WizardStep[];
  hasError?: boolean;
}

const STEPS: { key: WizardStep; label: string }[] = [
  { key: 'preflight', label: 'Preflight' },
  { key: 'squash', label: 'Squash' },
  { key: 'rebase', label: 'Rebase' },
  { key: 'merge', label: 'Merge' },
  { key: 'cleanup', label: 'Cleanup' },
  { key: 'complete', label: 'Complete' },
];

function Stepper({ currentStep, completedSteps, hasError }: StepperProps) {
  const currentIndex = STEPS.findIndex(s => s.key === currentStep);
  
  return (
    <div className="flex items-center justify-between w-full mb-8">
      {STEPS.map((step, index) => {
        const isCompleted = completedSteps.includes(step.key);
        const isCurrent = step.key === currentStep;
        const isError = isCurrent && hasError;
        
        return (
          <React.Fragment key={step.key}>
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                isCompleted ? 'bg-green-500 text-white' :
                isError ? 'bg-red-500 text-white' :
                isCurrent ? 'bg-blue-500 text-white' :
                'bg-gray-300 text-gray-600'
              }`}>
                {isCompleted ? '✓' : index + 1}
              </div>
              <span className={`text-xs mt-1 ${
                isCurrent ? 'text-blue-600 font-semibold' :
                isCompleted ? 'text-green-600' :
                isError ? 'text-red-600' :
                'text-gray-500'
              }`}>
                {step.label}
              </span>
            </div>
            {index < STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 mx-2 ${
                index < currentIndex ? 'bg-green-500' :
                index === currentIndex && hasError ? 'bg-red-500' :
                'bg-gray-300'
              }`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export function MergeWizard({ session, onClose, onComplete }: MergeWizardProps) {
  const [currentStep, setCurrentStep] = useState<WizardStep>('preflight');
  const [completedSteps, setCompletedSteps] = useState<WizardStep[]>([]);
  const [preflightResult, setPreflightResult] = useState<PreflightResult | null>(null);
  const [squashMessage, setSquashMessage] = useState('');
  const [includeManual, setIncludeManual] = useState<'include' | 'exclude'>('include');
  const [conflictFiles, setConflictFiles] = useState<string[]>([]);
  const [exportPatch, setExportPatch] = useState(false);
  const [patchPath, setPatchPath] = useState('');
  const [cleanupAfterMerge, setCleanupAfterMerge] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-run preflight on mount
  useEffect(() => {
    runPreflight();
  }, []);

  const runPreflight = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await window.electronAPI.sessions.preflight(session.id);
      if (result.success && result.result) {
        setPreflightResult(result.result);
        if (result.result.issues.length === 0) {
          markStepCompleted('preflight');
          setCurrentStep('squash');
        }
      } else {
        setError(result.error || 'Preflight check failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const runSquash = async () => {
    if (!squashMessage.trim()) {
      setError('Please provide a squash commit message');
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      const result = await window.electronAPI.sessions.squashSession(session.id, {
        message: squashMessage,
        includeManual
      });
      
      if (result.success) {
        markStepCompleted('squash');
        setCurrentStep('rebase');
        await runRebase();
      } else {
        setError(result.error || 'Squash failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const runRebase = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await window.electronAPI.sessions.rebaseOntoBase(session.id);
      
      if (result.success && result.result) {
        if (result.result.status === 'conflict') {
          setConflictFiles(result.result.files || []);
          setCurrentStep('conflicts');
        } else {
          markStepCompleted('rebase');
          setCurrentStep('merge');
        }
      } else {
        setError(result.error || 'Rebase failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const continueMerge = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await window.electronAPI.sessions.continueMerge(session.id);
      
      if (result.success && result.result) {
        if (result.result.status === 'conflict') {
          setConflictFiles(result.result.files || []);
        } else {
          markStepCompleted('rebase');
          setCurrentStep('merge');
        }
      } else {
        setError(result.error || 'Continue merge failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const abortMerge = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await window.electronAPI.sessions.abortMerge(session.id);
      
      if (result.success) {
        onClose();
      } else {
        setError(result.error || 'Abort merge failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const runMerge = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Export patch if requested
      if (exportPatch && patchPath) {
        const exportResult = await window.electronAPI.sessions.exportPatch(session.id, patchPath);
        if (!exportResult.success) {
          setError(exportResult.error || 'Export patch failed');
          return;
        }
      }

      // Fast-forward merge
      const mergeResult = await window.electronAPI.sessions.fastForwardMerge(session.id, { noFF: false });
      
      if (mergeResult.success) {
        markStepCompleted('merge');
        setCurrentStep('cleanup');
        
        if (cleanupAfterMerge) {
          await runCleanup();
        }
      } else {
        setError(mergeResult.error || 'Merge failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const runCleanup = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await window.electronAPI.sessions.cleanup(session.id);
      
      if (result.success) {
        markStepCompleted('cleanup');
        setCurrentStep('complete');
      } else {
        setError(result.error || 'Cleanup failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const markStepCompleted = (step: WizardStep) => {
    setCompletedSteps(prev => [...prev, step]);
  };

  const openInVSCode = () => {
    // This would need to be implemented as an IPC call
    console.log('Open in VS Code:', session.worktreePath);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-auto p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Merge to Main</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>

        <div className="mb-6 p-4 bg-blue-50 rounded-lg">
          <h3 className="font-semibold text-blue-900">Session: {session.name}</h3>
          <p className="text-sm text-blue-700">
            {session.branchName} → {session.baseBranch}
          </p>
        </div>

        <Stepper
          currentStep={currentStep}
          completedSteps={completedSteps}
          hasError={!!error}
        />

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {/* Preflight Step */}
        {currentStep === 'preflight' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Preflight Checks</h3>
            
            {preflightResult ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div className={`p-3 rounded ${preflightResult.repoClean ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                    Repository Clean: {preflightResult.repoClean ? 'Yes' : 'No'}
                  </div>
                  <div className={`p-3 rounded ${preflightResult.baseUpToDate ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                    Base Up to Date: {preflightResult.baseUpToDate ? 'Yes' : 'No'}
                  </div>
                  {preflightResult.testsPass !== undefined && (
                    <div className={`p-3 rounded ${preflightResult.testsPass ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                      Tests Pass: {preflightResult.testsPass ? 'Yes' : 'No'}
                    </div>
                  )}
                  {preflightResult.typecheckPasses !== undefined && (
                    <div className={`p-3 rounded ${preflightResult.typecheckPasses ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                      Typecheck Passes: {preflightResult.typecheckPasses ? 'Yes' : 'No'}
                    </div>
                  )}
                </div>
                
                <div className="p-3 bg-gray-50 rounded">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>Ahead by: {preflightResult.aheadBy} commits</div>
                    <div>Behind by: {preflightResult.behindBy} commits</div>
                    <div>Amp commits: {preflightResult.ampCommitsCount}</div>
                    <div>Branchpoint: {preflightResult.branchpointSha.slice(0, 8)}</div>
                  </div>
                </div>
                
                {preflightResult.issues.length > 0 && (
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded">
                    <h4 className="font-semibold text-yellow-800 mb-2">Issues:</h4>
                    <ul className="text-sm text-yellow-700">
                      {preflightResult.issues.map((issue, index) => (
                        <li key={index}>• {issue}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                <p className="mt-2 text-gray-600">Running preflight checks...</p>
              </div>
            ) : null}

            <div className="flex justify-end space-x-3">
              <button
                onClick={runPreflight}
                disabled={loading}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
              >
                Re-run Checks
              </button>
              <button
                onClick={() => setCurrentStep('squash')}
                disabled={!preflightResult || loading}
                className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Squash Step */}
        {currentStep === 'squash' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Squash Commits</h3>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Squash Commit Message
              </label>
              <textarea
                value={squashMessage}
                onChange={(e) => setSquashMessage(e.target.value)}
                placeholder="Enter a commit message for the squashed commits..."
                className="w-full p-3 border border-gray-300 rounded-md"
                rows={3}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Manual Commits
              </label>
              <select
                value={includeManual}
                onChange={(e) => setIncludeManual(e.target.value as 'include' | 'exclude')}
                className="w-full p-2 border border-gray-300 rounded-md"
              >
                <option value="include">Include manual commits in squash</option>
                <option value="exclude">Preserve manual commits separately</option>
              </select>
            </div>

            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setCurrentStep('preflight')}
                disabled={loading}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 disabled:opacity-50"
              >
                Back
              </button>
              <button
                onClick={runSquash}
                disabled={loading || !squashMessage.trim()}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
              >
                {loading ? 'Squashing...' : 'Squash & Continue'}
              </button>
            </div>
          </div>
        )}

        {/* Conflicts Step */}
        {currentStep === 'conflicts' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-red-600">Rebase Conflicts Detected</h3>
            
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-800 mb-3">
                The following files have conflicts that need to be resolved:
              </p>
              <ul className="text-sm text-red-700 space-y-1">
                {conflictFiles.map((file, index) => (
                  <li key={index} className="font-mono">• {file}</li>
                ))}
              </ul>
            </div>

            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h4 className="font-semibold text-blue-900 mb-2">Resolution Steps:</h4>
              <ol className="text-sm text-blue-800 space-y-1">
                <li>1. Open the session in your editor</li>
                <li>2. Resolve conflicts in each file</li>
                <li>3. Stage the resolved files with `git add`</li>
                <li>4. Click "Mark Resolved & Continue"</li>
              </ol>
            </div>

            <div className="flex justify-end space-x-3">
              <button
                onClick={openInVSCode}
                className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
              >
                Open in VS Code
              </button>
              <button
                onClick={abortMerge}
                disabled={loading}
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
              >
                Abort Merge
              </button>
              <button
                onClick={continueMerge}
                disabled={loading}
                className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
              >
                {loading ? 'Continuing...' : 'Mark Resolved & Continue'}
              </button>
            </div>
          </div>
        )}

        {/* Merge Step */}
        {currentStep === 'merge' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Merge & Options</h3>
            
            <div className="space-y-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={exportPatch}
                  onChange={(e) => setExportPatch(e.target.checked)}
                  className="mr-2"
                />
                <span>Export patch file before merge</span>
              </label>
              
              {exportPatch && (
                <input
                  type="text"
                  value={patchPath}
                  onChange={(e) => setPatchPath(e.target.value)}
                  placeholder="Path to save patch file..."
                  className="w-full p-2 border border-gray-300 rounded-md"
                />
              )}
              
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={cleanupAfterMerge}
                  onChange={(e) => setCleanupAfterMerge(e.target.checked)}
                  className="mr-2"
                />
                <span>Cleanup worktree and branch after merge</span>
              </label>
            </div>

            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-green-800">
                Ready to merge <strong>{session.branchName}</strong> into <strong>{session.baseBranch}</strong>
              </p>
            </div>

            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setCurrentStep('squash')}
                disabled={loading}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 disabled:opacity-50"
              >
                Back
              </button>
              <button
                onClick={runMerge}
                disabled={loading || (exportPatch && !patchPath)}
                className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
              >
                {loading ? 'Merging...' : 'Merge to Main'}
              </button>
            </div>
          </div>
        )}

        {/* Cleanup Step */}
        {currentStep === 'cleanup' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Cleanup Session</h3>
            
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-yellow-800 mb-2">
                The merge was successful! Would you like to clean up the session?
              </p>
              <p className="text-sm text-yellow-700">
                This will remove the worktree and delete the branch. This action cannot be undone.
              </p>
            </div>

            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setCurrentStep('complete')}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
              >
                Skip Cleanup
              </button>
              <button
                onClick={runCleanup}
                disabled={loading}
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
              >
                {loading ? 'Cleaning up...' : 'Clean Up Session'}
              </button>
            </div>
          </div>
        )}

        {/* Complete Step */}
        {currentStep === 'complete' && (
          <div className="space-y-4 text-center">
            <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto">
              <span className="text-2xl text-white">✓</span>
            </div>
            <h3 className="text-lg font-semibold text-green-600">Merge Complete!</h3>
            <p className="text-gray-600">
              Session <strong>{session.name}</strong> has been successfully merged into <strong>{session.baseBranch}</strong>.
            </p>
            <div className="flex justify-center">
              <button
                onClick={() => {
                  onComplete();
                  onClose();
                }}
                className="px-6 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

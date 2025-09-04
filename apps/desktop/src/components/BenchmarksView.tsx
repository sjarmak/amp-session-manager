import React, { useState, useEffect } from 'react';
import { formatDate } from '../utils/date';
import { getStatusColor, getStatusBgColor } from '../utils/status';
import { DesktopBenchmarkRun } from '../types/benchmark';

interface TooltipProps {
  children: React.ReactNode;
  content: string;
}

function Tooltip({ children, content }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="relative inline-block">
      <div
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
      >
        {children}
      </div>
      {isVisible && (
        <div className="fixed z-50 p-3 text-sm text-gruvbox-fg0 bg-gruvbox-bg0 border border-gruvbox-bg3 rounded shadow-xl max-w-md break-words" 
             style={{
               top: '50%',
               left: '50%',
               transform: 'translate(-50%, -50%)'
             }}>
          {content}
        </div>
      )}
    </div>
  );
}

export interface BenchmarkRun extends DesktopBenchmarkRun {
  // Legacy alias for backwards compatibility
}

export interface BenchmarksViewProps {
  onRunSelect: (runId: string, type: string) => void;
  onNewRun: () => void;
}

export function BenchmarksView({ onRunSelect, onNewRun }: BenchmarksViewProps) {
  const [runs, setRuns] = useState<BenchmarkRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [aborting, setAborting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadRuns();

    // Set up event listeners for real-time updates
    let eventHandler: any = null;

    const handleBenchmarkEvent = (event: any) => {
      if (['run-started', 'run-finished', 'run-aborted'].includes(event.type)) {
        loadRuns();
      } else if (event.type === 'run-updated' && event.runId) {
        setRuns(prev => 
          prev.map(run => 
            run.runId === event.runId ? { ...run, ...event.run } : run
          )
        );
      }
    };

    if (window.electronAPI?.benchmarks?.onEvent) {
      eventHandler = window.electronAPI.benchmarks.onEvent(handleBenchmarkEvent);
      return () => {
        if (eventHandler && window.electronAPI?.benchmarks?.offEvent) {
          window.electronAPI.benchmarks.offEvent(eventHandler);
        }
      };
    }
  }, []);

  const loadRuns = async () => {
    try {
      console.log('🔍 BenchmarksView: Starting to load runs');
      setLoading(true);
      setError(null);
      
      if (!window.electronAPI?.benchmarks?.listRuns) {
        throw new Error('Benchmark API not available');
      }
      
      console.log('🔍 BenchmarksView: Calling window.electronAPI.benchmarks.listRuns()');
      const benchmarkRuns = await window.electronAPI.benchmarks.listRuns();
      console.log('🔍 BenchmarksView: Got response:', benchmarkRuns);
      setRuns(benchmarkRuns || []);
    } catch (error) {
      console.error('❌ BenchmarksView: Failed to load benchmark runs:', error);
      setError(error instanceof Error ? error.message : 'Failed to load benchmark runs');
      setRuns([]); // Set empty array on error
    } finally {
      setLoading(false);
    }
  };

  // Utility functions moved to shared utils

  const handleDelete = async (runId: string) => {
    if (deleting || !confirm('Are you sure you want to delete this benchmark run? This cannot be undone.')) {
      return;
    }

    try {
      setDeleting(runId);
      await window.electronAPI.benchmarks.delete(runId);
      await loadRuns();
    } catch (error) {
      console.error('Failed to delete benchmark run:', error);
      alert('Failed to delete run. Check console for details.');
    } finally {
      setDeleting(null);
    }
  };

  const handleAbort = async (runId: string) => {
    if (aborting || !confirm('Are you sure you want to abort this running benchmark? This will stop all in-progress cases.')) {
      return;
    }

    try {
      setAborting(runId);
      await window.electronAPI.benchmarks.abort(runId);
      await loadRuns();
    } catch (error) {
      console.error('Failed to abort benchmark run:', error);
      alert('Failed to abort run. Check console for details.');
    } finally {
      setAborting(null);
    }
  };

  const handleCopyPath = async (path: string) => {
    try {
      await navigator.clipboard.writeText(path);
      // Could add a toast notification here if desired
    } catch (error) {
      console.error('Failed to copy path:', error);
    }
  };

  const handleExportJson = async (runId: string) => {
    try {
      if (!window.electronAPI?.benchmarks?.exportJson) {
        alert('Export functionality not available');
        return;
      }
      
      const result = await window.electronAPI.benchmarks.exportJson(runId);
      if (result.success) {
        alert(`Benchmark exported successfully to: ${result.path}`);
      } else {
        alert(`Export failed: ${result.error}`);
      }
    } catch (error) {
      console.error('Failed to export benchmark:', error);
      alert('Failed to export benchmark. Check console for details.');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gruvbox-fg2">Loading benchmark runs...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-gruvbox-bright-red mb-4">Error: {error}</div>
        <button
          onClick={loadRuns}
          className="bg-gruvbox-bright-blue text-gruvbox-bg0 px-4 py-2 rounded-lg hover:bg-gruvbox-blue transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gruvbox-fg0">Benchmark Evaluations</h2>
        <button
          onClick={onNewRun}
          className="bg-gruvbox-bright-blue text-gruvbox-bg0 px-4 py-2 rounded-lg hover:bg-gruvbox-blue transition-colors"
        >
          New Benchmark Run
        </button>
      </div>

      {runs.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-gruvbox-fg2 mb-4">No benchmark runs found</div>
          <button
            onClick={onNewRun}
            className="bg-gruvbox-bright-blue text-gruvbox-bg0 px-6 py-3 rounded-lg hover:bg-gruvbox-blue transition-colors"
          >
            Create Your First Benchmark Run
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="w-full">
            <table className="w-full bg-gruvbox-bg1 border border-gruvbox-bg3 rounded-lg table-fixed">
              <thead className="bg-gruvbox-bg2">
                <tr>
                  <th className="w-20 px-3 py-3 text-left text-xs font-medium text-gruvbox-fg2 uppercase tracking-wider">
                    Run ID
                  </th>
                  <th className="w-32 px-3 py-3 text-left text-xs font-medium text-gruvbox-fg2 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="w-40 px-3 py-3 text-left text-xs font-medium text-gruvbox-fg2 uppercase tracking-wider">
                    Source
                  </th>
                  <th className="w-20 px-3 py-3 text-left text-xs font-medium text-gruvbox-fg2 uppercase tracking-wider">
                    Cases
                  </th>
                  <th className="w-20 px-3 py-3 text-left text-xs font-medium text-gruvbox-fg2 uppercase tracking-wider">
                    Progress
                  </th>
                  <th className="w-20 px-3 py-3 text-left text-xs font-medium text-gruvbox-fg2 uppercase tracking-wider">
                    Tokens
                  </th>
                  <th className="w-16 px-3 py-3 text-left text-xs font-medium text-gruvbox-fg2 uppercase tracking-wider">
                    Cost
                  </th>
                  <th className="w-16 px-3 py-3 text-left text-xs font-medium text-gruvbox-fg2 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="w-24 px-3 py-3 text-left text-xs font-medium text-gruvbox-fg2 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-gruvbox-bg1 divide-y divide-gruvbox-bg3">
                {runs.map((run) => (
                  <tr key={run.runId} className="hover:bg-gruvbox-bg2 group">
                    <td className="px-3 py-4 whitespace-nowrap">
                      <button
                        onClick={() => onRunSelect(run.runId, run.type)}
                        className="text-gruvbox-bright-purple hover:text-gruvbox-purple font-mono text-sm truncate block max-w-full"
                        title={run.runId}
                      >
                        {run.runId.slice(0, 8)}
                      </button>
                    </td>
                    <td className="px-3 py-4 text-sm text-gruvbox-fg1">
                    <div className="truncate" title={formatDate(run.createdAt)}>
                    {formatDate(run.createdAt)}
                    </div>
                    </td>
                    <td className="px-3 py-4 text-sm text-gruvbox-fg2">
                      {run.casesDir ? (
                        <div className="flex items-center gap-1">
                          <Tooltip content={run.casesDir}>
                            <span className="truncate block cursor-help">
                              {run.casesDir.split('/').pop() || run.casesDir}
                            </span>
                          </Tooltip>
                          <button
                            onClick={() => handleCopyPath(run.casesDir!)}
                            className="text-gruvbox-fg3 hover:text-gruvbox-bright-blue text-xs p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Copy full path"
                          >
                            Copy
                          </button>
                        </div>
                      ) : (
                        'N/A'
                      )}
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap text-sm text-gruvbox-fg1 text-center">
                      {run.totalCases}
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap text-sm text-gruvbox-fg1">
                      <div className="text-gruvbox-fg1 text-xs">{run.completedCases}/{run.totalCases}</div>
                      <div className="text-xs text-gruvbox-fg2">
                        {run.passedCases}✓ {run.failedCases}✗
                      </div>
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap text-sm text-gruvbox-fg1">
                      <div className="text-xs">
                        {run.totalTokens ? (
                          <div>
                            <div>{(run.totalTokens / 1000).toFixed(1)}k</div>
                            <div className="text-gruvbox-fg3">tokens</div>
                          </div>
                        ) : (
                          <div className="text-gruvbox-fg3">-</div>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap text-sm text-gruvbox-fg1">
                      <div className="text-xs">
                        {run.totalCost ? (
                          <div>
                            <div>${run.totalCost.toFixed(3)}</div>
                            <div className="text-gruvbox-fg3">USD</div>
                          </div>
                        ) : (
                          <div className="text-gruvbox-fg3">-</div>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <span className={`inline-flex px-1 py-1 text-xs font-semibold rounded-full ${getStatusColor(run.status as any)} ${getStatusBgColor(run.status as any)}`}>
                          {run.status}
                        </span>
                        {run.status === 'running' && (
                          <div className="w-1 h-1 bg-gruvbox-bright-blue rounded-full animate-pulse" />
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap text-sm text-gruvbox-fg2">
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => onRunSelect(run.runId, run.type)}
                          className="text-gruvbox-bright-purple hover:text-gruvbox-purple text-xs"
                        >
                          View
                        </button>
                        {run.status === 'running' ? (
                          <button
                            onClick={() => handleAbort(run.runId)}
                            disabled={aborting === run.runId}
                            className="text-gruvbox-bright-orange hover:text-gruvbox-orange disabled:opacity-50 text-xs"
                          >
                            {aborting === run.runId ? 'Aborting...' : 'Abort'}
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => handleExportJson(run.runId)}
                              className="text-gruvbox-bright-green hover:text-gruvbox-green text-xs"
                            >
                              Export
                            </button>
                            <button
                              onClick={() => handleDelete(run.runId)}
                              disabled={deleting === run.runId}
                              className="text-gruvbox-bright-red hover:text-gruvbox-red disabled:opacity-50 text-xs"
                            >
                              {deleting === run.runId ? 'Deleting...' : 'Delete'}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

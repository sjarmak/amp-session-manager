import React, { useState, useEffect } from 'react';

export interface BenchmarkRun {
  runId: string;
  type: 'swebench' | 'custom';
  createdAt: string;
  casesDir?: string;
  totalCases: number;
  completedCases: number;
  passedCases: number;
  failedCases: number;
  status: 'running' | 'completed' | 'failed';
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
      window.electronAPI.benchmarks.onEvent(handleBenchmarkEvent);
      return () => {
        if (window.electronAPI?.benchmarks?.offEvent) {
          window.electronAPI.benchmarks.offEvent(handleBenchmarkEvent);
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

  const formatDate = (isoString: string) => {
    return new Date(isoString).toLocaleString();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'text-gruvbox-bright-blue bg-gruvbox-blue/20';
      case 'completed': return 'text-gruvbox-bright-green bg-gruvbox-green/20';
      case 'failed': return 'text-gruvbox-bright-red bg-gruvbox-red/20';
      default: return 'text-gruvbox-fg2 bg-gruvbox-bg3';
    }
  };

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
          <div className="overflow-x-auto">
            <table className="min-w-full bg-gruvbox-bg1 border border-gruvbox-bg3 rounded-lg">
              <thead className="bg-gruvbox-bg2">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gruvbox-fg2 uppercase tracking-wider">
                    Run ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gruvbox-fg2 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gruvbox-fg2 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gruvbox-fg2 uppercase tracking-wider">
                    Source
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gruvbox-fg2 uppercase tracking-wider">
                    Total Cases
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gruvbox-fg2 uppercase tracking-wider">
                    Progress
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gruvbox-fg2 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gruvbox-fg2 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-gruvbox-bg1 divide-y divide-gruvbox-bg3">
                {runs.map((run) => (
                  <tr key={run.runId} className="hover:bg-gruvbox-bg2">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => onRunSelect(run.runId, run.type)}
                        className="text-gruvbox-bright-purple hover:text-gruvbox-purple font-mono text-sm"
                      >
                        {run.runId.slice(0, 8)}
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gruvbox-fg1">
                      {formatDate(run.createdAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gruvbox-fg1">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        run.type === 'swebench' ? 'bg-gruvbox-purple/20 text-gruvbox-bright-purple' : 'bg-gruvbox-blue/20 text-gruvbox-bright-blue'
                      }`}>
                        {run.type === 'swebench' ? 'SWE-bench' : 'Custom'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gruvbox-fg2 max-w-xs truncate">
                      {run.casesDir || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gruvbox-fg1">
                      {run.totalCases}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gruvbox-fg1">
                      <div className="text-gruvbox-fg1">{run.completedCases}/{run.totalCases}</div>
                      <div className="text-xs text-gruvbox-fg2">
                        {run.passedCases}✓ {run.failedCases}✗
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(run.status)}`}>
                          {run.status}
                        </span>
                        {run.status === 'running' && (
                          <div className="w-2 h-2 bg-gruvbox-bright-blue rounded-full animate-pulse" />
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gruvbox-fg2">
                      <button
                        onClick={() => onRunSelect(run.runId, run.type)}
                        className="text-gruvbox-bright-purple hover:text-gruvbox-purple mr-3"
                      >
                        View
                      </button>
                      {run.status === 'running' ? (
                        <button
                          onClick={() => handleAbort(run.runId)}
                          disabled={aborting === run.runId}
                          className="text-gruvbox-bright-orange hover:text-gruvbox-orange disabled:opacity-50"
                        >
                          {aborting === run.runId ? 'Aborting...' : 'Abort'}
                        </button>
                      ) : (
                        <button
                          onClick={() => handleDelete(run.runId)}
                          disabled={deleting === run.runId}
                          className="text-gruvbox-bright-red hover:text-gruvbox-red disabled:opacity-50"
                        >
                          {deleting === run.runId ? 'Deleting...' : 'Delete'}
                        </button>
                      )}
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

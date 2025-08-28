import React, { useState, useEffect } from 'react';

export interface BatchRun {
  runId: string;
  createdAt: string;
  defaultModel?: string;
  concurrency: number;
  totalItems: number;
  queuedCount: number;
  runningCount: number;
  successCount: number;
  failCount: number;
  errorCount: number;
  timeoutCount: number;
  totalTokens: number;
  status: 'running' | 'completed' | 'aborted' | 'error';
}

export interface BatchesViewProps {
  onRunSelect: (runId: string) => void;
  onNewBatch: () => void;
}

export function BatchesView({ onRunSelect, onNewBatch }: BatchesViewProps) {
  const [runs, setRuns] = useState<BatchRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRuns();
    
    // Listen for batch events to update the list in real-time
    const handleBatchEvent = (event: any) => {
      if (event.type === 'run-started' || event.type === 'run-finished' || event.type === 'run-aborted') {
        loadRuns(); // Reload the full list when runs change
      } else if (event.type === 'run-updated') {
        // Update specific run in place
        setRuns(prevRuns => 
          prevRuns.map(run => 
            run.runId === event.runId ? { ...run, ...event.run } : run
          )
        );
      }
    };

    window.electronAPI.batch.onEvent(handleBatchEvent);
    
    return () => {
      window.electronAPI.batch.offEvent(handleBatchEvent);
    };
  }, []);

  const loadRuns = async () => {
    try {
      setLoading(true);
      const batchRuns = await window.electronAPI.batch.listRuns();
      setRuns(batchRuns);
    } catch (error) {
      console.error('Failed to load batch runs:', error);
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
      case 'aborted': return 'text-gruvbox-bright-yellow bg-gruvbox-yellow/20';
      case 'error': return 'text-gruvbox-bright-red bg-gruvbox-red/20';
      default: return 'text-gruvbox-fg2 bg-gruvbox-bg3';
    }
  };



  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gruvbox-fg2">Loading batch runs...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gruvbox-fg0">Batch Evaluations</h2>
        <button
          onClick={onNewBatch}
          className="bg-gruvbox-bright-blue text-gruvbox-bg0 px-4 py-2 rounded-lg hover:bg-gruvbox-blue transition-colors"
        >
          New Batch
        </button>
      </div>

      {runs.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-gruvbox-fg2 mb-4">No batch runs found</div>
          <button
            onClick={onNewBatch}
            className="bg-gruvbox-bright-blue text-gruvbox-bg0 px-6 py-3 rounded-lg hover:bg-gruvbox-blue transition-colors"
          >
            Create Your First Batch
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
                    Concurrency
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gruvbox-fg2 uppercase tracking-wider">
                    Items
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
                        onClick={() => onRunSelect(run.runId)}
                        className="text-gruvbox-bright-blue hover:text-gruvbox-blue font-mono text-sm"
                      >
                        {run.runId.slice(0, 8)}
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gruvbox-fg1">
                      {formatDate(run.createdAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gruvbox-fg1">
                      {run.concurrency}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gruvbox-fg1">
                      <div className="text-gruvbox-fg1">{run.totalItems}</div>
                      <div className="text-xs text-gruvbox-fg2">
                        {run.successCount}✓ {run.failCount}✗ {run.errorCount}⚠ {run.queuedCount}⏳
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(run.status)}`}>
                          {run.status}
                        </span>
                        {run.status === 'running' && (
                          <div className="flex items-center gap-1">
                            <div className="w-2 h-2 bg-gruvbox-bright-blue rounded-full animate-pulse"></div>
                            <span className="text-xs text-gruvbox-bright-blue font-medium">Live</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gruvbox-fg2">
                      <button
                        onClick={() => onRunSelect(run.runId)}
                        className="text-gruvbox-bright-purple hover:text-gruvbox-purple mr-3"
                      >
                        View
                      </button>
                      {run.status === 'running' ? (
                        <button
                          onClick={() => handleAbort(run.runId)}
                          className="text-gruvbox-bright-red hover:text-gruvbox-red"
                        >
                          Abort
                        </button>
                      ) : (
                        <button
                          onClick={() => handleDelete(run.runId)}
                          className="text-gruvbox-bright-red hover:text-gruvbox-red"
                        >
                          Delete
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

  async function handleAbort(runId: string) {
    if (confirm('Are you sure you want to abort this batch run?')) {
      try {
        await window.electronAPI.batch.abort(runId);
        await loadRuns(); // Refresh the list
      } catch (error) {
        console.error('Failed to abort batch:', error);
      }
    }
  }

  async function handleDelete(runId: string) {
    if (confirm('Are you sure you want to delete this batch run? This cannot be undone.')) {
      try {
        await window.electronAPI.batch.delete(runId);
        await loadRuns(); // Refresh the list
      } catch (error) {
        console.error('Failed to delete batch:', error);
      }
    }
  }
}

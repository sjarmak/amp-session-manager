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
      case 'running': return 'text-blue-600 bg-blue-100';
      case 'completed': return 'text-green-600 bg-green-100';
      case 'aborted': return 'text-yellow-600 bg-yellow-100';
      case 'error': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-500">Loading batch runs...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Batch Evaluations</h2>
        <button
          onClick={onNewBatch}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          New Batch
        </button>
      </div>

      {runs.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-gray-500 mb-4">No batch runs found</div>
          <button
            onClick={onNewBatch}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Create Your First Batch
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white border border-gray-200 rounded-lg">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Run ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Model
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Concurrency
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Items
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tokens
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {runs.map((run) => (
                  <tr key={run.runId} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => onRunSelect(run.runId)}
                        className="text-blue-600 hover:text-blue-800 font-mono text-sm"
                      >
                        {run.runId.slice(0, 8)}
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatDate(run.createdAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {run.defaultModel || 'default'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {run.concurrency}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div className="text-gray-900">{run.totalItems}</div>
                      <div className="text-xs text-gray-500">
                        {run.successCount}✓ {run.failCount}✗ {run.errorCount}⚠ {run.queuedCount}⏳
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(run.status)}`}>
                        {run.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {run.totalTokens.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <button
                        onClick={() => onRunSelect(run.runId)}
                        className="text-indigo-600 hover:text-indigo-900 mr-3"
                      >
                        View
                      </button>
                      {run.status === 'running' && (
                        <button
                          onClick={() => handleAbort(run.runId)}
                          className="text-red-600 hover:text-red-900"
                        >
                          Abort
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
}

import React, { useState, useEffect } from 'react';

export interface BatchItem {
  id: string;
  runId: string;
  sessionId?: string;
  repo: string;
  prompt: string;
  status: 'queued' | 'running' | 'success' | 'fail' | 'timeout' | 'error';
  error?: string;
  startedAt?: string;
  finishedAt?: string;
  model?: string;
  iterSha?: string;
  tokensTotal?: number;
  toolCalls?: number;
  duration?: number;
}

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

export interface BatchRunDetailProps {
  runId: string;
  onBack: () => void;
}

export function BatchRunDetail({ runId, onBack }: BatchRunDetailProps) {
  const [run, setRun] = useState<BatchRun | null>(null);
  const [items, setItems] = useState<BatchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadRunData();
    
    // Setup event listener for live updates
    const handleBatchEvent = (event: any) => {
      if (event.runId === runId) {
        loadRunData();
      }
    };

    window.electronAPI.batch.onEvent(handleBatchEvent);
    
    return () => {
      window.electronAPI.batch.offEvent(handleBatchEvent);
    };
  }, [runId]);

  const loadRunData = async () => {
    try {
      setLoading(true);
      const [runData, itemsData] = await Promise.all([
        window.electronAPI.batch.getRun(runId),
        window.electronAPI.batch.listItems({ runId, limit: 1000 })
      ]);
      
      if (runData) {
        setRun(runData);
      }
      setItems(itemsData.items);
    } catch (error) {
      console.error('Failed to load run data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (format: 'json' | 'csv') => {
    try {
      const result = await window.electronAPI.dialog.selectDirectory();
      if (!result.canceled && result.filePaths[0]) {
        await window.electronAPI.batch.export({
          runId,
          outDir: result.filePaths[0],
          tables: ['batches', 'batch_items', 'sessions', 'iterations'],
          format
        });
      }
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  const handleReport = async (format: 'md' | 'html') => {
    try {
      const result = await window.electronAPI.dialog.selectDirectory();
      if (!result.canceled && result.filePaths[0]) {
        const outPath = `${result.filePaths[0]}/batch-report-${runId.slice(0, 8)}.${format}`;
        await window.electronAPI.batch.report({
          runId,
          out: outPath,
          format
        });
      }
    } catch (error) {
      console.error('Report generation failed:', error);
    }
  };

  const filteredItems = items.filter(item => {
    const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
    const matchesSearch = searchTerm === '' || 
      item.repo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.prompt.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });



  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-500">Loading batch run details...</div>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-500 mb-4">Batch run not found</div>
        <button
          onClick={onBack}
          className="text-blue-600 hover:text-blue-800"
        >
          ← Back to Batches
        </button>
      </div>
    );
  }

  const progressPercent = run.totalItems > 0 
    ? Math.round(((run.successCount + run.failCount + run.errorCount + run.timeoutCount) / run.totalItems) * 100)
    : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <button
            onClick={onBack}
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            ← Back to Batches
          </button>
          <h2 className="text-2xl font-bold text-gray-800">
            Run {run.runId.slice(0, 8)}
          </h2>
          <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${getStatusColor(run.status)}`}>
            {run.status}
          </span>
        </div>
        
        <div className="flex space-x-2">
          <div className="relative">
            <button
              className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors"
              onClick={() => document.getElementById('export-menu')?.classList.toggle('hidden')}
            >
              Export ▼
            </button>
            <div id="export-menu" className="hidden absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-10">
              <div className="py-1">
                <button
                  onClick={() => handleExport('json')}
                  className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 w-full text-left"
                >
                  Export as JSON
                </button>
                <button
                  onClick={() => handleExport('csv')}
                  className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 w-full text-left"
                >
                  Export as CSV
                </button>
              </div>
            </div>
          </div>
          
          <div className="relative">
            <button
              className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors"
              onClick={() => document.getElementById('report-menu')?.classList.toggle('hidden')}
            >
              Report ▼
            </button>
            <div id="report-menu" className="hidden absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-10">
              <div className="py-1">
                <button
                  onClick={() => handleReport('md')}
                  className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 w-full text-left"
                >
                  Generate Markdown
                </button>
                <button
                  onClick={() => handleReport('html')}
                  className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 w-full text-left"
                >
                  Generate HTML
                </button>
              </div>
            </div>
          </div>

          {run.status === 'running' && (
            <button
              onClick={() => handleAbort()}
              className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
            >
              Abort
            </button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-blue-50 p-4 rounded-lg">
          <div className="text-blue-600 text-sm font-medium">Total Items</div>
          <div className="text-2xl font-bold text-blue-900">{run.totalItems}</div>
        </div>
        <div className="bg-green-50 p-4 rounded-lg">
          <div className="text-green-600 text-sm font-medium">Success</div>
          <div className="text-2xl font-bold text-green-900">{run.successCount}</div>
        </div>
        <div className="bg-yellow-50 p-4 rounded-lg">
          <div className="text-yellow-600 text-sm font-medium">Failed</div>
          <div className="text-2xl font-bold text-yellow-900">{run.failCount + run.errorCount + run.timeoutCount}</div>
        </div>
        <div className="bg-purple-50 p-4 rounded-lg">
          <div className="text-purple-600 text-sm font-medium">Total Tokens</div>
          <div className="text-2xl font-bold text-purple-900">{run.totalTokens.toLocaleString()}</div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex justify-between text-sm font-medium text-gray-700 mb-2">
          <span>Progress</span>
          <span>{progressPercent}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          ></div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex space-x-4 mb-6">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search by repo or prompt..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="all">All Status</option>
          <option value="queued">Queued</option>
          <option value="running">Running</option>
          <option value="success">Success</option>
          <option value="fail">Failed</option>
          <option value="error">Error</option>
          <option value="timeout">Timeout</option>
        </select>
      </div>

      {/* Items table */}
      <div className="overflow-x-auto">
        <table className="min-w-full bg-white border border-gray-200 rounded-lg">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Repository
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Prompt
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Duration
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
            {filteredItems.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  <div className="max-w-xs truncate" title={item.repo}>
                    {item.repo.split('/').pop() || item.repo}
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-900">
                  <div className="max-w-md truncate" title={item.prompt}>
                    {item.prompt}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(item.status)}`}>
                    {item.status}
                  </span>
                  {item.error && (
                    <div className="text-xs text-red-600 mt-1 max-w-xs truncate" title={item.error}>
                      {item.error}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {formatDuration(item.duration)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {item.tokensTotal?.toLocaleString() || 'N/A'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {item.sessionId && (
                    <button
                      onClick={() => openSession(item.sessionId!)}
                      className="text-indigo-600 hover:text-indigo-900 mr-3"
                    >
                      View Session
                    </button>
                  )}
                  {item.status === 'success' && item.iterSha && (
                    <button
                      onClick={() => openWorktree(item.sessionId!)}
                      className="text-green-600 hover:text-green-900"
                    >
                      Open Code
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredItems.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          No items match the current filters
        </div>
      )}
    </div>
  );

  function formatDuration(ms?: number) {
    if (!ms) return 'N/A';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'running': return 'text-blue-600 bg-blue-100';
      case 'success': return 'text-green-600 bg-green-100';
      case 'fail': return 'text-yellow-600 bg-yellow-100';
      case 'error': return 'text-red-600 bg-red-100';
      case 'timeout': return 'text-orange-600 bg-orange-100';
      case 'queued': return 'text-gray-600 bg-gray-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  }

  async function handleAbort() {
    if (confirm('Are you sure you want to abort this batch run?')) {
      try {
        await window.electronAPI.batch.abort(runId);
      } catch (error) {
        console.error('Failed to abort batch:', error);
      }
    }
  }

  function openSession(sessionId: string) {
    // This would navigate to the session view
    console.log('Open session:', sessionId);
  }

  function openWorktree(sessionId: string) {
    // This would open the worktree in VS Code
    console.log('Open worktree for session:', sessionId);
  }
}

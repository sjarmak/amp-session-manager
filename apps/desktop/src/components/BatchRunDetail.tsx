import React, { useState, useEffect, useRef } from 'react';

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
  ampMode?: 'production' | 'local-cli';
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
  onSessionSelect: (session: any) => void;
}

export function BatchRunDetail({ runId, onBack, onSessionSelect }: BatchRunDetailProps) {
  const [run, setRun] = useState<BatchRun | null>(null);
const [items, setItems] = useState<BatchItem[]>([]);
const [loading, setLoading] = useState(true);
const [statusFilter, setStatusFilter] = useState<string>('all');
const [searchTerm, setSearchTerm] = useState('');
const [exportMenuOpen, setExportMenuOpen] = useState(false);
const exportMenuRef = useRef<HTMLDivElement>(null);

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

  // Click away to close export menu
  useEffect(() => {
    const handleClickAway = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setExportMenuOpen(false);
      }
    };

    if (exportMenuOpen) {
      document.addEventListener('mousedown', handleClickAway);
      return () => document.removeEventListener('mousedown', handleClickAway);
    }
  }, [exportMenuOpen]);

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
        <div className="text-gruvbox-fg2">Loading batch run details...</div>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="text-center py-12">
        <div className="text-gruvbox-fg2 mb-4">Batch run not found</div>
        <button
          onClick={onBack}
          className="text-gruvbox-bright-blue hover:text-gruvbox-blue"
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
            className="text-gruvbox-bright-blue hover:text-gruvbox-blue font-medium"
          >
            ← Back to Batches
          </button>
          <h2 className="text-2xl font-bold text-gruvbox-fg0">
            Run {run.runId.slice(0, 8)}
          </h2>
          <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${getStatusColor(run.status)}`}>
            {run.status}
          </span>
        </div>
        
        <div className="flex space-x-2">
          <div className="relative" ref={exportMenuRef}>
            <button
              className="bg-gruvbox-bg2 text-gruvbox-fg1 px-4 py-2 rounded-lg hover:bg-gruvbox-bg3 transition-colors"
              onClick={() => setExportMenuOpen(!exportMenuOpen)}
            >
              Export ▼
            </button>
            {exportMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-gruvbox-bg1 border border-gruvbox-bg3 rounded-md shadow-lg z-10">
                <div className="py-1">
                  <button
                    onClick={() => {
                      handleExport('json');
                      setExportMenuOpen(false);
                    }}
                    className="block px-4 py-2 text-sm text-gruvbox-fg1 hover:bg-gruvbox-bg2 w-full text-left"
                  >
                    Export as JSON
                  </button>
                  <button
                    onClick={() => {
                      handleExport('csv');
                      setExportMenuOpen(false);
                    }}
                    className="block px-4 py-2 text-sm text-gruvbox-fg1 hover:bg-gruvbox-bg2 w-full text-left"
                  >
                    Export as CSV
                  </button>
                  <hr className="my-1 border-gruvbox-bg3" />
                  <button
                    onClick={() => {
                      handleReport('md');
                      setExportMenuOpen(false);
                    }}
                    className="block px-4 py-2 text-sm text-gruvbox-fg1 hover:bg-gruvbox-bg2 w-full text-left"
                  >
                    Generate Markdown Report
                  </button>
                  <button
                    onClick={() => {
                      handleReport('html');
                      setExportMenuOpen(false);
                    }}
                    className="block px-4 py-2 text-sm text-gruvbox-fg1 hover:bg-gruvbox-bg2 w-full text-left"
                  >
                    Generate HTML Report
                  </button>
                </div>
              </div>
            )}
          </div>

          {run.status === 'running' && (
            <button
              onClick={() => handleAbort()}
              className="bg-gruvbox-red text-gruvbox-bg0 px-4 py-2 rounded-lg hover:bg-gruvbox-bright-red transition-colors"
            >
              Abort
            </button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gruvbox-bg2 border border-gruvbox-bg4 p-4 rounded-lg">
          <div className="text-gruvbox-blue text-sm font-medium">Total Items</div>
          <div className="text-2xl font-bold text-gruvbox-fg0">{run.totalItems}</div>
        </div>
        <div className="bg-gruvbox-bg2 border border-gruvbox-bg4 p-4 rounded-lg">
          <div className="text-gruvbox-green text-sm font-medium">Success</div>
          <div className="text-2xl font-bold text-gruvbox-fg0">{run.successCount}</div>
        </div>
        <div className="bg-gruvbox-bg2 border border-gruvbox-bg4 p-4 rounded-lg">
          <div className="text-gruvbox-yellow text-sm font-medium">Failed</div>
          <div className="text-2xl font-bold text-gruvbox-fg0">{run.failCount + run.errorCount + run.timeoutCount}</div>
        </div>
        <div className="bg-gruvbox-bg2 border border-gruvbox-bg4 p-4 rounded-lg">
          <div className="text-gruvbox-purple text-sm font-medium">Total Tokens</div>
          <div className="text-2xl font-bold text-gruvbox-fg0">{run.totalTokens.toLocaleString()}</div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex justify-between text-sm font-medium text-gruvbox-fg1 mb-2">
          <span>Progress</span>
          <span>{progressPercent}%</span>
        </div>
        <div className="w-full bg-gruvbox-bg3 rounded-full h-2">
          <div
            className="bg-gruvbox-blue h-2 rounded-full transition-all duration-300"
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
            className="w-full px-4 py-2 bg-gruvbox-bg1 border border-gruvbox-bg3 text-gruvbox-fg0 rounded-lg focus:ring-2 focus:ring-gruvbox-blue focus:border-gruvbox-blue placeholder-gruvbox-fg2"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 bg-gruvbox-bg1 border border-gruvbox-bg3 text-gruvbox-fg0 rounded-lg focus:ring-2 focus:ring-gruvbox-blue focus:border-gruvbox-blue"
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
        <table className="min-w-full bg-gruvbox-bg1 border border-gruvbox-bg3 rounded-lg">
          <thead className="bg-gruvbox-bg2">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gruvbox-fg2 uppercase tracking-wider">
                Repository
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gruvbox-fg2 uppercase tracking-wider">
                Prompt
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gruvbox-fg2 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gruvbox-fg2 uppercase tracking-wider">
                Amp Mode
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gruvbox-fg2 uppercase tracking-wider">
                Duration
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gruvbox-fg2 uppercase tracking-wider">
                Tokens
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gruvbox-fg2 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-gruvbox-bg1 divide-y divide-gruvbox-bg3">
            {filteredItems.map((item) => (
              <tr key={item.id} className="hover:bg-gruvbox-bg2">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gruvbox-fg1">
                  <div className="max-w-xs truncate" title={item.repo}>
                    {item.repo.split('/').pop() || item.repo}
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gruvbox-fg1">
                  <div className="max-w-md truncate" title={item.prompt}>
                    {item.prompt}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(item.status)}`}>
                    {item.status}
                  </span>
                  {item.error && (
                    <div className="text-xs text-gruvbox-red mt-1 max-w-xs truncate" title={item.error}>
                      {item.error}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gruvbox-fg1">
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                    item.ampMode === 'local-cli' 
                      ? 'bg-gruvbox-bright-yellow/20 text-gruvbox-bright-yellow' 
                      : 'bg-gruvbox-blue/20 text-gruvbox-bright-blue'
                  }`}>
                    {item.ampMode || 'production'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gruvbox-fg1">
                  {formatDuration(item.duration)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gruvbox-fg1">
                  {item.tokensTotal?.toLocaleString() || 'N/A'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gruvbox-fg2">
                  {item.sessionId && (
                    <button
                      onClick={() => openSession(item.sessionId!)}
                      className="text-gruvbox-bright-blue hover:text-gruvbox-blue mr-3"
                    >
                      View Session
                    </button>
                  )}
                  {item.status === 'success' && item.iterSha && (
                    <button
                      onClick={() => openWorktree(item.sessionId!)}
                      className="text-gruvbox-bright-green hover:text-gruvbox-green"
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
        <div className="text-center py-8 text-gruvbox-fg2">
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
      case 'running': return 'text-gruvbox-bright-blue bg-gruvbox-blue/20';
      case 'success': return 'text-gruvbox-bright-green bg-gruvbox-green/20';
      case 'fail': return 'text-gruvbox-bright-yellow bg-gruvbox-yellow/20';
      case 'error': return 'text-gruvbox-bright-red bg-gruvbox-red/20';
      case 'timeout': return 'text-gruvbox-bright-orange bg-gruvbox-orange/20';
      case 'queued': return 'text-gruvbox-fg2 bg-gruvbox-bg3';
      default: return 'text-gruvbox-fg2 bg-gruvbox-bg3';
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

  async function openSession(sessionId: string) {
    try {
      const session = await window.electronAPI.sessions.get(sessionId);
      if (session) {
        onSessionSelect(session);
      } else {
        console.error('Session not found:', sessionId);
      }
    } catch (error) {
      console.error('Failed to get session:', error);
    }
  }

  function openWorktree(sessionId: string) {
    // This would open the worktree in VS Code
    console.log('Open worktree for session:', sessionId);
  }
}

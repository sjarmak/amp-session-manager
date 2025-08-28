import React, { useState, useEffect } from 'react';
import type { Session } from '@ampsm/types';

export interface BenchmarkResult {
  instanceId: string;
  sessionId?: string;
  passed: boolean | null;
  completedAt?: string;
  error?: string;
}

export interface BenchmarkRunDetailProps {
  runId: string;
  type: string;
  onBack: () => void;
  onSessionSelect: (session: Session) => void;
}

export function BenchmarkRunDetail({ runId, type, onBack, onSessionSelect }: BenchmarkRunDetailProps) {
  const [run, setRun] = useState<any>(null);
  const [results, setResults] = useState<BenchmarkResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'passed' | 'failed'>('all');

  useEffect(() => {
    loadRunDetails();

    // Set up event listeners for real-time updates
    const handleBenchmarkEvent = (event: any) => {
      if (event.runId === runId) {
        if (['run-finished', 'run-aborted'].includes(event.type)) {
          loadRunDetails();
        } else if (event.type === 'run-updated' && event.run) {
          setRun((prevRun: any) => prevRun ? { ...prevRun, ...event.run } : prevRun);
        }
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
  }, [runId]);

  const loadRunDetails = async () => {
    try {
      console.log('🔍 BenchmarkRunDetail: Loading details for runId:', runId);
      setLoading(true);
      const [runData, resultsData] = await Promise.all([
        window.electronAPI.benchmarks.getRun(runId),
        window.electronAPI.benchmarks.getResults(runId)
      ]);
      console.log('🔍 BenchmarkRunDetail: Got runData:', runData);
      console.log('🔍 BenchmarkRunDetail: Got resultsData:', resultsData);
      setRun(runData);
      setResults(resultsData);
    } catch (error) {
      console.error('❌ BenchmarkRunDetail: Failed to load benchmark run details:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (isoString: string) => {
    return new Date(isoString).toLocaleString();
  };

  const getStatusColor = (passed: boolean | null) => {
    if (passed === null) return 'text-gruvbox-fg2 bg-gruvbox-bg3';
    return passed ? 'text-gruvbox-bright-green bg-gruvbox-green/20' : 'text-gruvbox-bright-red bg-gruvbox-red/20';
  };

  const getStatusText = (passed: boolean | null) => {
    if (passed === null) return 'pending';
    return passed ? 'passed' : 'failed';
  };

  const filteredResults = results.filter(result => {
    if (selectedFilter === 'all') return true;
    if (selectedFilter === 'passed') return result.passed === true;
    if (selectedFilter === 'failed') return result.passed === false;
    return true;
  });

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gruvbox-fg2">Loading benchmark run details...</div>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="text-center py-12">
        <div className="text-gruvbox-bright-red mb-4">Benchmark run not found</div>
        <button
          onClick={onBack}
          className="bg-gruvbox-bright-blue text-gruvbox-bg0 px-4 py-2 rounded-lg hover:bg-gruvbox-blue transition-colors"
        >
          Back to Benchmark Runs
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center mb-6">
        <button
          onClick={onBack}
          className="mr-4 text-gruvbox-fg2 hover:text-gruvbox-fg0"
        >
          ← Back
        </button>
        <h2 className="text-2xl font-bold text-gruvbox-fg0">
          {type === 'swebench' ? 'SWE-bench' : 'Benchmark'} Run {run.id.slice(0, 8)}
        </h2>
      </div>

      {/* Run Summary */}
      <div className="bg-gruvbox-bg1 rounded-lg p-6 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-sm text-gruvbox-fg2">Created</div>
            <div className="font-medium text-gruvbox-fg1">{formatDate(run.createdAt)}</div>
          </div>
          <div>
            <div className="text-sm text-gruvbox-fg2">Source</div>
            <div className="font-medium text-sm text-gruvbox-fg1" title={run.casesDir || 'Custom'}>
              {run.casesDir ? (
                <div className="flex items-center gap-2">
                  <span className="truncate">
                    {run.casesDir.split('/').pop() || run.casesDir}
                  </span>
                  <button
                    onClick={() => navigator.clipboard.writeText(run.casesDir)}
                    className="text-gruvbox-fg3 hover:text-gruvbox-bright-blue text-xs p-1 rounded"
                    title="Copy full path"
                  >
                    📋
                  </button>
                </div>
              ) : (
                'Custom'
              )}
            </div>
          </div>
          <div>
            <div className="text-sm text-gruvbox-fg2">Total Cases</div>
            <div className="font-medium text-gruvbox-fg1">{run.total}</div>
          </div>
          <div>
            <div className="text-sm text-gruvbox-fg2">Status</div>
            <div className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(null)}`}>
              {run.status}
            </div>
          </div>
        </div>

        {run.completed > 0 && (
          <div className="mt-4 pt-4 border-t border-gruvbox-bg3">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="text-sm text-gruvbox-fg2">Completed</div>
                <div className="font-medium text-gruvbox-fg1">{run.completed}/{run.total}</div>
              </div>
              <div>
                <div className="text-sm text-gruvbox-fg2">Passed</div>
                <div className="font-medium text-gruvbox-bright-green">{run.passed}</div>
              </div>
              <div>
                <div className="text-sm text-gruvbox-fg2">Failed</div>
                <div className="font-medium text-gruvbox-bright-red">{run.failed}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="mb-4">
        <nav className="flex space-x-1 bg-gruvbox-bg2 p-1 rounded-lg w-fit">
          <button
            onClick={() => setSelectedFilter('all')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              selectedFilter === 'all' 
                ? 'bg-gruvbox-bright-purple text-gruvbox-bg0 shadow-sm' 
                : 'text-gruvbox-fg2 hover:text-gruvbox-fg0 hover:bg-gruvbox-purple/20'
            }`}
          >
            All ({results.length})
          </button>
          <button
            onClick={() => setSelectedFilter('passed')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              selectedFilter === 'passed' 
                ? 'bg-gruvbox-bright-purple text-gruvbox-bg0 shadow-sm' 
                : 'text-gruvbox-fg2 hover:text-gruvbox-fg0 hover:bg-gruvbox-purple/20'
            }`}
          >
            Passed ({results.filter(r => r.passed === true).length})
          </button>
          <button
            onClick={() => setSelectedFilter('failed')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              selectedFilter === 'failed' 
                ? 'bg-gruvbox-bright-purple text-gruvbox-bg0 shadow-sm' 
                : 'text-gruvbox-fg2 hover:text-gruvbox-fg0 hover:bg-gruvbox-purple/20'
            }`}
          >
            Failed ({results.filter(r => r.passed === false).length})
          </button>
        </nav>
      </div>

      {/* Results Table */}
      {filteredResults.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-gruvbox-fg2">No results found for the selected filter</div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-gruvbox-bg1 border border-gruvbox-bg3 rounded-lg">
            <thead className="bg-gruvbox-bg2">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gruvbox-fg2 uppercase tracking-wider">
                  Instance ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gruvbox-fg2 uppercase tracking-wider">
                  Session
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gruvbox-fg2 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gruvbox-fg2 uppercase tracking-wider">
                  Completed At
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gruvbox-fg2 uppercase tracking-wider">
                  Error
                </th>
              </tr>
            </thead>
            <tbody className="bg-gruvbox-bg1 divide-y divide-gruvbox-bg3">
              {filteredResults.map((result) => (
                <tr key={result.instanceId} className="hover:bg-gruvbox-bg2">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gruvbox-fg1">{result.instanceId}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {result.sessionId ? (
                      <button
                        onClick={() => window.electronAPI.sessions.get(result.sessionId!).then(session => {
                          if (session) {
                            onSessionSelect(session);
                          }
                        })}
                        className="text-gruvbox-bright-blue hover:text-gruvbox-blue font-mono text-sm"
                      >
                        {result.sessionId.slice(0, 8)}
                      </button>
                    ) : (
                      <span className="text-gruvbox-fg2 text-sm">No session</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(result.passed)}`}>
                      {getStatusText(result.passed)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gruvbox-fg1">
                    {result.completedAt ? formatDate(result.completedAt) : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gruvbox-bright-red max-w-xs truncate">
                    {result.error || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

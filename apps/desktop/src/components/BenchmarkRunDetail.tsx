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
    if (passed === null) return 'text-gray-600 bg-gray-100';
    return passed ? 'text-green-600 bg-green-100' : 'text-red-600 bg-red-100';
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
        <div className="text-gray-500">Loading benchmark run details...</div>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="text-center py-12">
        <div className="text-red-500 mb-4">Benchmark run not found</div>
        <button
          onClick={onBack}
          className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
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
          className="mr-4 text-gray-500 hover:text-gray-700"
        >
          ← Back
        </button>
        <h2 className="text-2xl font-bold text-gray-800">
          {type === 'swebench' ? 'SWE-bench' : 'Benchmark'} Run {run.id.slice(0, 8)}
        </h2>
      </div>

      {/* Run Summary */}
      <div className="bg-gray-50 rounded-lg p-6 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-sm text-gray-500">Created</div>
            <div className="font-medium">{formatDate(run.createdAt)}</div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Source</div>
            <div className="font-medium text-sm truncate">{run.casesDir || 'Custom'}</div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Total Cases</div>
            <div className="font-medium">{run.total}</div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Status</div>
            <div className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(null)}`}>
              {run.status}
            </div>
          </div>
        </div>

        {run.completed > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="text-sm text-gray-500">Completed</div>
                <div className="font-medium">{run.completed}/{run.total}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Passed</div>
                <div className="font-medium text-green-600">{run.passed}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Failed</div>
                <div className="font-medium text-red-600">{run.failed}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="mb-4">
        <nav className="flex space-x-1 bg-gray-200 p-1 rounded-lg w-fit">
          <button
            onClick={() => setSelectedFilter('all')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              selectedFilter === 'all' 
                ? 'bg-purple-500 text-white shadow-sm' 
                : 'text-gray-600 hover:text-gray-900 hover:bg-purple-100'
            }`}
          >
            All ({results.length})
          </button>
          <button
            onClick={() => setSelectedFilter('passed')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              selectedFilter === 'passed' 
                ? 'bg-purple-500 text-white shadow-sm' 
                : 'text-gray-600 hover:text-gray-900 hover:bg-purple-100'
            }`}
          >
            Passed ({results.filter(r => r.passed === true).length})
          </button>
          <button
            onClick={() => setSelectedFilter('failed')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              selectedFilter === 'failed' 
                ? 'bg-purple-500 text-white shadow-sm' 
                : 'text-gray-600 hover:text-gray-900 hover:bg-purple-100'
            }`}
          >
            Failed ({results.filter(r => r.passed === false).length})
          </button>
        </nav>
      </div>

      {/* Results Table */}
      {filteredResults.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-gray-500">No results found for the selected filter</div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white border border-gray-200 rounded-lg">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Instance ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Session
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Completed At
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Error
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredResults.map((result) => (
                <tr key={result.instanceId} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{result.instanceId}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {result.sessionId ? (
                      <button
                        onClick={() => window.electronAPI.sessions.get(result.sessionId!).then(session => {
                          if (session) {
                            onSessionSelect(session);
                          }
                        })}
                        className="text-blue-600 hover:text-blue-800 font-mono text-sm"
                      >
                        {result.sessionId.slice(0, 8)}
                      </button>
                    ) : (
                      <span className="text-gray-400 text-sm">No session</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(result.passed)}`}>
                      {getStatusText(result.passed)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {result.completedAt ? formatDate(result.completedAt) : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600 max-w-xs truncate">
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

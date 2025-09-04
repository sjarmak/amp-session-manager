import React, { useState, useEffect } from 'react';
import { formatDate } from '../utils/date';
import { getStatusColor, getStatusBgColor } from '../utils/status';
import { CaseResult, BenchmarkResult } from '../types/benchmark';
import { FileLink } from './FileLink';

export interface BenchmarkDetailProps {
  runId: string;
  type: string;
  onBack: () => void;
}

export default function BenchmarkRunDetail({ runId, type, onBack }: BenchmarkDetailProps) {
  const [result, setResult] = useState<BenchmarkResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>('all');
  const [selectedKind, setSelectedKind] = useState<string>('all');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadBenchmarkResult();
  }, [runId]);

  const loadBenchmarkResult = async () => {
    try {
      setLoading(true);
      setError(null);
      
      if (type === 'yaml') {
        // Load v2 benchmark result
        const response = await window.electronAPI.benchmarks.getResult(runId);
        if (response.success) {
          setResult(response.result);
        } else {
          setError(response.error || 'Failed to load benchmark result');
        }
      } else {
        // Handle legacy SWE-bench results
        setError('Legacy benchmark results not yet supported in new UI');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gruvbox-fg2">Loading benchmark details...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-gruvbox-bright-red mb-4">Error: {error}</div>
        <button
          onClick={onBack}
          className="bg-gruvbox-bright-blue text-gruvbox-bg0 px-4 py-2 rounded-lg hover:bg-gruvbox-blue transition-colors"
        >
          Back to Benchmarks
        </button>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="text-center py-12">
        <div className="text-gruvbox-fg2 mb-4">Benchmark result not found</div>
        <button
          onClick={onBack}
          className="bg-gruvbox-bright-blue text-gruvbox-bg0 px-4 py-2 rounded-lg hover:bg-gruvbox-blue transition-colors"
        >
          Back to Benchmarks
        </button>
      </div>
    );
  }

  // Filter cases based on selected model and kind
  const filteredCases = result.cases.filter(c => {
    if (selectedModel !== 'all' && c.model !== selectedModel) return false;
    if (selectedKind !== 'all' && c.kind !== selectedKind) return false;
    return true;
  });

  // Get unique models and kinds for filtering
  const models = Array.from(new Set(result.cases.map(c => c.model)));
  const kinds = Array.from(new Set(result.cases.map(c => c.kind)));

  const formatMetricValue = (value: any): string => {
    if (typeof value === 'number') {
      if (value < 1 && value > 0) {
        return (value * 100).toFixed(1) + '%';
      }
      if (value === Math.floor(value)) {
        return value.toString();
      }
      return value.toFixed(2);
    }
    return String(value);
  };

  const toggleRowExpanded = (rowId: string) => {
    const newExpandedRows = new Set(expandedRows);
    if (newExpandedRows.has(rowId)) {
      newExpandedRows.delete(rowId);
    } else {
      newExpandedRows.add(rowId);
    }
    setExpandedRows(newExpandedRows);
  };

  const openSessionAnalytics = (sessionId: string) => {
    // Navigate to session analytics - you'll need to implement this based on your routing
    console.log('Opening session analytics for:', sessionId);
    // TODO: Implement navigation to session detail with analytics tab
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="text-gruvbox-bright-blue hover:text-gruvbox-blue"
          >
            ← Back
          </button>
          <h2 className="text-2xl font-bold text-gruvbox-fg0">
            {result.benchmark_name}
          </h2>
        </div>
        <div className="text-sm text-gruvbox-fg2">
          Run ID: {runId}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gruvbox-bg1 border border-gruvbox-bg3 rounded-lg p-4">
          <div className="text-2xl font-bold text-gruvbox-bright-green">
            {result.summary.passed_cases}
          </div>
          <div className="text-sm text-gruvbox-fg2">Passed Cases</div>
        </div>
        <div className="bg-gruvbox-bg1 border border-gruvbox-bg3 rounded-lg p-4">
          <div className="text-2xl font-bold text-gruvbox-fg0">
            {result.summary.total_cases}
          </div>
          <div className="text-sm text-gruvbox-fg2">Total Cases</div>
        </div>
        <div className="bg-gruvbox-bg1 border border-gruvbox-bg3 rounded-lg p-4">
          <div className="text-2xl font-bold text-gruvbox-bright-blue">
            {(result.summary.success_rate * 100).toFixed(1)}%
          </div>
          <div className="text-sm text-gruvbox-fg2">Success Rate</div>
        </div>
        <div className="bg-gruvbox-bg1 border border-gruvbox-bg3 rounded-lg p-4">
          <div className="text-2xl font-bold text-gruvbox-bright-yellow">
            {Math.round(result.total_duration_sec)}s
          </div>
          <div className="text-sm text-gruvbox-fg2">Total Duration</div>
        </div>
      </div>

      {/* Configuration File */}
      {result.config_file && (
        <div className="bg-gruvbox-bg1 border border-gruvbox-bg3 rounded-lg p-4">
          <h3 className="text-lg font-bold text-gruvbox-fg0 mb-2">Configuration</h3>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gruvbox-fg2">YAML File:</span>
            <FileLink href={`file:///${result.config_file}`}>
              {result.config_file.split('/').pop() || result.config_file}
            </FileLink>
          </div>
        </div>
      )}

      {/* Model Comparison */}
      {Object.keys(result.summary.by_model).length > 1 && (
        <div className="bg-gruvbox-bg1 border border-gruvbox-bg3 rounded-lg p-4">
          <h3 className="text-lg font-bold text-gruvbox-fg0 mb-4">Model Comparison</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gruvbox-bg3">
                  <th className="text-left py-2 px-3 text-gruvbox-fg2">Model</th>
                  <th className="text-left py-2 px-3 text-gruvbox-fg2">Cases</th>
                  <th className="text-left py-2 px-3 text-gruvbox-fg2">Passed</th>
                  <th className="text-left py-2 px-3 text-gruvbox-fg2">Success Rate</th>
                  <th className="text-left py-2 px-3 text-gruvbox-fg2">Avg Duration</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(result.summary.by_model).map(([model, summary]) => (
                  <tr key={model} className="border-b border-gruvbox-bg2">
                    <td className="py-2 px-3 font-mono text-gruvbox-bright-purple">{model}</td>
                    <td className="py-2 px-3 text-gruvbox-fg1">{summary.total_cases}</td>
                    <td className="py-2 px-3 text-gruvbox-bright-green">{summary.passed_cases}</td>
                    <td className="py-2 px-3 text-gruvbox-bright-blue">
                      {(summary.success_rate * 100).toFixed(1)}%
                    </td>
                    <td className="py-2 px-3 text-gruvbox-fg1">
                      {summary.avg_duration_sec.toFixed(1)}s
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-4">
        <div>
          <label className="block text-sm text-gruvbox-fg2 mb-1">Model</label>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="bg-gruvbox-bg1 border border-gruvbox-bg3 rounded px-3 py-1 text-gruvbox-fg0 focus:border-gruvbox-bright-blue focus:outline-none"
          >
            <option value="all">All Models</option>
            {models.map(model => (
              <option key={model} value={model}>{model}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm text-gruvbox-fg2 mb-1">Type</label>
          <select
            value={selectedKind}
            onChange={(e) => setSelectedKind(e.target.value)}
            className="bg-gruvbox-bg1 border border-gruvbox-bg3 rounded px-3 py-1 text-gruvbox-fg0 focus:border-gruvbox-bright-blue focus:outline-none"
          >
            <option value="all">All Types</option>
            {kinds.map(kind => (
              <option key={kind} value={kind}>{kind.toUpperCase()}</option>
            ))}
          </select>
        </div>
        <div className="text-sm text-gruvbox-fg2 self-end py-1">
          Showing {filteredCases.length} of {result.cases.length} cases
        </div>
      </div>

      {/* Case Results */}
      <div className="bg-gruvbox-bg1 border border-gruvbox-bg3 rounded-lg">
        <div className="p-4 border-b border-gruvbox-bg3">
          <h3 className="text-lg font-bold text-gruvbox-fg0">Case Results</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gruvbox-bg2">
              <tr>
                <th className="text-left py-3 px-4 text-gruvbox-fg2">Case ID</th>
                <th className="text-left py-3 px-4 text-gruvbox-fg2">Model</th>
                <th className="text-left py-3 px-4 text-gruvbox-fg2">Type</th>
                <th className="text-left py-3 px-4 text-gruvbox-fg2">Status</th>
                <th className="text-left py-3 px-4 text-gruvbox-fg2">Duration</th>
                <th className="text-left py-3 px-4 text-gruvbox-fg2">Tokens</th>
                <th className="text-left py-3 px-4 text-gruvbox-fg2">Cost</th>
                <th className="text-left py-3 px-4 text-gruvbox-fg2">Details</th>
              </tr>
            </thead>
            <tbody>
              {filteredCases.map((caseResult, index) => {
                const rowId = `${caseResult.id}-${caseResult.model}`;
                const isExpanded = expandedRows.has(rowId);
                
                return (
                  <React.Fragment key={rowId}>
                    <tr className={`border-b border-gruvbox-bg2 ${index % 2 === 0 ? 'bg-gruvbox-bg0' : 'bg-gruvbox-bg1'}`}>
                      <td className="py-3 px-4 font-mono text-gruvbox-bright-purple">
                        {caseResult.id}
                      </td>
                      <td className="py-3 px-4 text-gruvbox-fg1">
                        {caseResult.model}
                      </td>
                      <td className="py-3 px-4">
                        <span className="bg-gruvbox-bg2 text-gruvbox-fg1 px-2 py-1 rounded text-xs uppercase">
                          {caseResult.kind}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          caseResult.passed 
                            ? 'bg-gruvbox-bright-green bg-opacity-20 text-gruvbox-bright-green'
                            : 'bg-gruvbox-bright-red bg-opacity-20 text-gruvbox-bright-red'
                        }`}>
                          {caseResult.passed ? '✓ Passed' : '✗ Failed'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gruvbox-fg1">
                        {caseResult.duration_sec.toFixed(1)}s
                      </td>
                      <td className="py-3 px-4 text-gruvbox-fg1">
                        <div className="text-sm">
                          {(caseResult.tokens_prompt || 0) + (caseResult.tokens_completion || 0) > 0 ? (
                            <div>
                              <div>{(((caseResult.tokens_prompt || 0) + (caseResult.tokens_completion || 0)) / 1000).toFixed(1)}k</div>
                              <div className="text-xs text-gruvbox-fg3">
                                {caseResult.tokens_prompt || 0}p + {caseResult.tokens_completion || 0}c
                              </div>
                            </div>
                          ) : (
                            <span className="text-gruvbox-fg3">-</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-gruvbox-fg1">
                        {caseResult.total_cost_usd ? (
                          <div className="text-sm">
                            ${caseResult.total_cost_usd.toFixed(4)}
                          </div>
                        ) : (
                          <span className="text-gruvbox-fg3">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => toggleRowExpanded(rowId)}
                            className="text-gruvbox-bright-blue hover:text-gruvbox-blue text-sm"
                          >
                            {isExpanded ? 'Hide' : 'Show'} Details
                          </button>
                          {caseResult.session_id && (
                            <button
                              onClick={() => openSessionAnalytics(caseResult.session_id!)}
                              className="text-gruvbox-bright-purple hover:text-gruvbox-purple text-sm"
                            >
                              Analytics
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    
                    {isExpanded && (
                      <tr className={`${index % 2 === 0 ? 'bg-gruvbox-bg0' : 'bg-gruvbox-bg1'}`}>
                        <td colSpan={8} className="py-4 px-4">
                          <div className="bg-gruvbox-bg2 rounded-lg p-4 space-y-4">
                            
                            {/* Detailed Q&A Section */}
                            {caseResult.kind === 'qa' && (
                              <DetailedQAResults caseResult={caseResult} />
                            )}

                            {/* Judge Score */}
                            {caseResult.judge && (
                              <div>
                                <h4 className="text-sm font-semibold text-gruvbox-fg0 mb-2">LLM Judge Evaluation</h4>
                                <div className="bg-gruvbox-bg1 rounded p-3">
                                  <div className="flex items-center gap-2 mb-2">
                                    <span className="text-lg font-bold text-gruvbox-bright-blue">
                                      {caseResult.judge.score.toFixed(1)}%
                                    </span>
                                    <span className="text-sm text-gruvbox-fg2">Score</span>
                                  </div>
                                  {caseResult.judge.notes && (
                                    <div className="text-sm text-gruvbox-fg1 whitespace-pre-wrap">
                                      {caseResult.judge.notes}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* All Metrics */}
                            <div>
                              <h4 className="text-sm font-semibold text-gruvbox-fg0 mb-2">All Metrics</h4>
                              <div className="flex flex-wrap gap-2">
                                {Object.entries(caseResult.metrics).map(([key, value]) => (
                                  <span key={key} className="bg-gruvbox-bg1 text-gruvbox-fg1 px-3 py-1 rounded text-sm">
                                    <span className="text-gruvbox-fg2">{key}:</span> {formatMetricValue(value)}
                                  </span>
                                ))}
                              </div>
                            </div>

                            {/* Artifacts */}
                            {caseResult.artifacts && caseResult.artifacts.length > 0 && (
                              <div>
                                <h4 className="text-sm font-semibold text-gruvbox-fg0 mb-2">Output Files</h4>
                                <div className="flex flex-wrap gap-2">
                                  {caseResult.artifacts.map((artifact, i) => (
                                    <span key={i} className="bg-gruvbox-bg1 text-gruvbox-fg2 px-2 py-1 rounded text-xs font-mono">
                                      {artifact.split('/').pop()}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Error Details */}
                            {caseResult.error && (
                              <div>
                                <h4 className="text-sm font-semibold text-gruvbox-bright-red mb-2">Error</h4>
                                <div className="bg-gruvbox-bg1 rounded p-3 text-sm text-gruvbox-bright-red font-mono">
                                  {caseResult.error}
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {filteredCases.length === 0 && (
        <div className="text-center py-8 text-gruvbox-fg2">
          No cases match the selected filters
        </div>
      )}
    </div>
  );
}

interface DetailedQAResultsProps {
  caseResult: CaseResult;
}

function DetailedQAResults({ caseResult }: DetailedQAResultsProps) {
  const [qaData, setQaData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (caseResult.artifacts && caseResult.artifacts.length > 1) {
      loadQAData();
    }
  }, [caseResult.artifacts]);

  const loadQAData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Get the graded results file (second artifact)
      const gradedFilePath = caseResult.artifacts?.[1];
      if (!gradedFilePath) {
        setError('No graded results file found');
        return;
      }

      // Read the file using the fs API
      const response = await window.electronAPI.fs.readFile(gradedFilePath);
      if (response.success) {
        const qaResults = JSON.parse(response.content!);
        setQaData(qaResults);
      } else {
        setError(response.error || 'Failed to read QA results');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load QA data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-4">
        <div className="text-sm text-gruvbox-fg2">Loading detailed results...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-4">
        <div className="text-sm text-gruvbox-bright-red">Error: {error}</div>
      </div>
    );
  }

  if (!qaData || !qaData.questions) {
    return null;
  }

  return (
    <div>
      <h4 className="text-sm font-semibold text-gruvbox-fg0 mb-3">Question & Answer Details</h4>
      <div className="space-y-3">
        {qaData.questions.map((question: any, index: number) => (
          <div key={index} className="bg-gruvbox-bg1 rounded-lg p-3">
            <div className="space-y-2">
              {/* Question */}
              <div>
                <div className="text-xs text-gruvbox-fg3 mb-1">Question {index + 1}:</div>
                <div className="text-sm text-gruvbox-fg0 font-medium">
                  {question.input}
                </div>
              </div>

              {/* Expected Answer */}
              <div>
                <div className="text-xs text-gruvbox-fg3 mb-1">Expected:</div>
                <div className="text-sm text-gruvbox-bright-green">
                  {Array.isArray(question.expectedOutput) 
                    ? question.expectedOutput.join(' OR ')
                    : question.expectedOutput}
                </div>
              </div>

              {/* Agent Answer */}
              <div>
                <div className="text-xs text-gruvbox-fg3 mb-1">Agent Response:</div>
                <div className="text-sm text-gruvbox-bright-blue">
                  {question.output || (question.error ? `Error: ${question.error}` : 'No response')}
                </div>
              </div>

              {/* Judge Evaluation */}
              {question.grade && (
                <div>
                  <div className="text-xs text-gruvbox-fg3 mb-1">Evaluation:</div>
                  <div className="flex items-start gap-2">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      question.grade.score === '1/1' || (question.grade.passed === question.grade.total && question.grade.total > 0)
                        ? 'bg-gruvbox-bright-green bg-opacity-20 text-gruvbox-bright-green'
                        : 'bg-gruvbox-bright-red bg-opacity-20 text-gruvbox-bright-red'
                    }`}>
                      {question.grade.score}
                    </span>
                    <div className="text-sm text-gruvbox-fg1 flex-1">
                      {question.grade.reasoning}
                    </div>
                  </div>
                </div>
              )}

              {/* Timing */}
              {question.durationMs && (
                <div className="text-xs text-gruvbox-fg3">
                  Response time: {question.durationMs}ms
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

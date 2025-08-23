import React, { useState, useEffect } from 'react';

interface RealtimeCostTrackerProps {
  sessionId: string;
  className?: string;
}

interface CostBreakdown {
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
  callCount: number;
}

interface CostMetrics {
  currentTotalCost: number;
  costPerMinute: number;
  costPerToken: number;
  projectedSessionCost: number;
  modelBreakdown: CostBreakdown[];
  costHistory: Array<{
    timestamp: string;
    cumulativeCost: number;
    intervalCost: number;
  }>;
  budgetStatus?: {
    limit: number;
    used: number;
    percentage: number;
    warning: boolean;
  };
}

export const RealtimeCostTracker: React.FC<RealtimeCostTrackerProps> = ({ 
  sessionId, 
  className 
}) => {
  const [costMetrics, setCostMetrics] = useState<CostMetrics | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [timeWindow, setTimeWindow] = useState<'5m' | '15m' | '1h'>('15m');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCostMetrics = async () => {
      try {
        setLoading(true);
        setError(null);

        // Placeholder for enhanced method - will be properly implemented
        const result = await window.electronAPI.metrics.getRealtimeCostBreakdown(sessionId).catch(() => ({
          success: false,
          error: 'Enhanced cost tracking not yet available'
        }));
        
        if (result.success && 'costMetrics' in result) {
          setCostMetrics(result.costMetrics);
        } else {
          setError('error' in result ? result.error : 'Failed to fetch cost metrics');
        }

      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch cost metrics');
      } finally {
        setLoading(false);
      }
    };

    fetchCostMetrics();
    
    // Update every 5 seconds for real-time tracking
    const interval = setInterval(fetchCostMetrics, 5000);
    
    return () => clearInterval(interval);
  }, [sessionId]);

  const formatCost = (cost: number | undefined): string => {
    const safeValue = cost || 0;
    if (safeValue === 0) return '$0.00';
    if (safeValue < 0.01) return `$${safeValue.toFixed(4)}`;
    return `$${safeValue.toFixed(3)}`;
  };

  const getModelColor = (model: string): string => {
    const colors = {
      'gpt-4': 'bg-purple-100 text-purple-800',
      'gpt-4-turbo': 'bg-blue-100 text-blue-800',
      'gpt-3.5-turbo': 'bg-green-100 text-green-800',
      'claude-3': 'bg-orange-100 text-orange-800',
      'claude-3.5-sonnet': 'bg-indigo-100 text-indigo-800',
    };
    return colors[model as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  const getCostTrend = (): 'increasing' | 'stable' | 'decreasing' => {
    if (!costMetrics?.costHistory || costMetrics.costHistory.length < 2) return 'stable';
    
    const recent = costMetrics.costHistory.slice(-3);
    const avgRecentCost = recent.reduce((sum, h) => sum + h.intervalCost, 0) / recent.length;
    const earlier = costMetrics.costHistory.slice(-6, -3);
    const avgEarlierCost = earlier.reduce((sum, h) => sum + h.intervalCost, 0) / earlier.length;
    
    if (avgRecentCost > avgEarlierCost * 1.1) return 'increasing';
    if (avgRecentCost < avgEarlierCost * 0.9) return 'decreasing';
    return 'stable';
  };

  const getTrendIcon = (trend: string): string => {
    switch (trend) {
      case 'increasing': return '📈';
      case 'decreasing': return '📉';
      default: return '➡️';
    }
  };

  if (loading) {
    return (
      <div className={`p-6 ${className}`}>
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !costMetrics) {
    return (
      <div className={`p-6 ${className}`}>
        <div className="bg-white rounded-lg border p-6">
          <p className="text-sm text-gray-500">
            {error || 'No cost data available'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold flex items-center">
          <span className="mr-2">💰</span>
          Real-time Cost Tracking
        </h3>
        <div className="flex items-center space-x-2">
          <span className="text-sm text-gray-500">Trend:</span>
          <span className="text-sm">{getTrendIcon(getCostTrend())}</span>
        </div>
      </div>

      {/* Cost Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500">Current Total</span>
            <div className="w-1 h-1 bg-green-500 rounded-full animate-pulse"></div>
          </div>
          <p className="text-xl font-bold">{formatCost(costMetrics?.currentTotalCost)}</p>
          <p className="text-xs text-gray-400">
            {formatCost(costMetrics?.costPerToken)} per token
          </p>
        </div>

        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500">Rate</span>
          </div>
          <p className="text-xl font-bold">{formatCost(costMetrics?.costPerMinute)}</p>
          <p className="text-xs text-gray-400">per minute</p>
        </div>

        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500">Projected</span>
          </div>
          <p className="text-xl font-bold">{formatCost(costMetrics?.projectedSessionCost)}</p>
          <p className="text-xs text-gray-400">session total</p>
        </div>

        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500">Models</span>
          </div>
          <p className="text-xl font-bold">{costMetrics?.modelBreakdown?.length || 0}</p>
          <p className="text-xs text-gray-400">in use</p>
        </div>
      </div>

      {/* Budget Status */}
      {costMetrics?.budgetStatus && (
        <div className="bg-white rounded-lg border">
          <div className="p-4 border-b">
            <h4 className="text-sm font-medium flex items-center">
              <span className="mr-2">📊</span>
              Budget Status
              {costMetrics.budgetStatus.warning && (
                <span className="ml-2 text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded">
                  ⚠️ Warning
                </span>
              )}
            </h4>
          </div>
          <div className="p-4">
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span>Used: {formatCost(costMetrics.budgetStatus.used)}</span>
                <span>Limit: {formatCost(costMetrics.budgetStatus.limit)}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div 
                  className={`h-3 rounded-full transition-all duration-300 ${
                    costMetrics.budgetStatus.percentage > 90 ? 'bg-red-500' :
                    costMetrics.budgetStatus.percentage > 75 ? 'bg-orange-500' :
                    'bg-green-500'
                  }`}
                  style={{ width: `${Math.min(costMetrics?.budgetStatus?.percentage || 0, 100)}%` }}
                ></div>
              </div>
              <div className="text-xs text-center text-gray-500">
                {(costMetrics?.budgetStatus?.percentage || 0).toFixed(1)}% of budget used
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Model Breakdown */}
      <div className="bg-white rounded-lg border">
        <div className="p-4 border-b">
          <h4 className="text-sm font-medium flex items-center">
            <span className="mr-2">🤖</span>
            Cost by Model
          </h4>
        </div>
        <div className="p-4">
          <div className="space-y-3">
            {(costMetrics?.modelBreakdown || [])
              .sort((a, b) => b.totalCost - a.totalCost)
              .map((model) => (
                <div 
                  key={model.model}
                  className={`p-3 rounded border cursor-pointer transition-colors ${
                    selectedModel === model.model ? 'bg-blue-50 border-blue-200' : 'hover:bg-gray-50'
                  }`}
                  onClick={() => setSelectedModel(selectedModel === model.model ? null : model.model)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <span className={`text-xs px-2 py-1 rounded ${getModelColor(model.model)}`}>
                        {model.model}
                      </span>
                      <div className="text-sm">
                        <div className="font-medium">{formatCost(model.totalCost)}</div>
                        <div className="text-xs text-gray-500">
                          {model?.callCount || 0} calls • {(model?.totalTokens || 0).toLocaleString()} tokens
                        </div>
                      </div>
                    </div>
                    <div className="text-right text-xs text-gray-500">
                      <div>Input: {formatCost(model.inputCost)}</div>
                      <div>Output: {formatCost(model.outputCost)}</div>
                    </div>
                  </div>
                  
                  {selectedModel === model.model && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <div className="grid grid-cols-3 gap-4 text-xs">
                        <div>
                          <div className="text-gray-500">Prompt Tokens</div>
                          <div className="font-medium">{(model?.promptTokens || 0).toLocaleString()}</div>
                          <div className="text-gray-400">
                            {formatCost((model?.inputCost || 0) / (model?.promptTokens || 1))}/token
                          </div>
                        </div>
                        <div>
                          <div className="text-gray-500">Completion Tokens</div>
                          <div className="font-medium">{(model?.completionTokens || 0).toLocaleString()}</div>
                          <div className="text-gray-400">
                            {formatCost((model?.outputCost || 0) / (model?.completionTokens || 1))}/token
                          </div>
                        </div>
                        <div>
                          <div className="text-gray-500">Avg Cost/Call</div>
                          <div className="font-medium">{formatCost((model?.totalCost || 0) / (model?.callCount || 1))}</div>
                          <div className="text-gray-400">
                            {((model?.totalTokens || 0) / (model?.callCount || 1)).toLocaleString()} tokens
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Cost History Chart */}
      <div className="bg-white rounded-lg border">
        <div className="p-4 border-b">
          <div className="flex justify-between items-center">
            <h4 className="text-sm font-medium flex items-center">
              <span className="mr-2">📈</span>
              Cost Trends
            </h4>
            <div className="flex space-x-1">
              {(['5m', '15m', '1h'] as const).map((window) => (
                <button
                  key={window}
                  onClick={() => setTimeWindow(window)}
                  className={`text-xs px-2 py-1 rounded ${
                    timeWindow === window 
                      ? 'bg-blue-100 text-blue-800' 
                      : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  {window}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="p-4">
          <div className="space-y-2">
            {(costMetrics?.costHistory || []).slice(-10).map((point, index) => {
              const history = costMetrics?.costHistory || [];
              const maxCost = history.length > 0 ? Math.max(...history.map(h => h.intervalCost)) : 0;
              const width = maxCost > 0 ? (point.intervalCost / maxCost) * 100 : 0;
              
              return (
                <div key={`${point.timestamp}-${index}`} className="flex items-center space-x-3">
                  <span className="text-xs text-gray-500 w-16">
                    {new Date(point.timestamp).toLocaleTimeString([], { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                  </span>
                  <div className="flex-1 relative">
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div 
                        className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${width}%` }}
                      ></div>
                    </div>
                  </div>
                  <div className="text-xs font-medium w-16 text-right">
                    {formatCost(point.intervalCost)}
                  </div>
                  <div className="text-xs text-gray-500 w-16 text-right">
                    {formatCost(point.cumulativeCost)}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex justify-between text-xs text-gray-500">
            <span>Time</span>
            <span className="flex space-x-16">
              <span>Interval Cost</span>
              <span>Total Cost</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

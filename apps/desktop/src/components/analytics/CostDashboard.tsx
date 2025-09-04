import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import { format } from 'date-fns';
import type { SessionMetrics } from '@ampsm/core';

interface MetricCardProps {
  title: string;
  value: string;
  trend?: number;
  description?: string;
}

function MetricCard({ title, value, trend, description }: MetricCardProps) {
  return (
    <div className="bg-gruvbox-bg1 p-4 rounded-lg border border-gruvbox-bg3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gruvbox-fg2">{title}</h3>
        {trend !== undefined && (
          <span className={`text-xs font-medium ${
            trend > 0 ? 'text-gruvbox-bright-red' : trend < 0 ? 'text-gruvbox-bright-green' : 'text-gruvbox-fg2'
          }`}>
            {trend > 0 ? '↗' : trend < 0 ? '↘' : '→'} {Math.abs(trend).toFixed(1)}%
          </span>
        )}
      </div>
      <div className="mt-2">
        <p className="text-2xl font-bold text-gruvbox-fg0">{value}</p>
        {description && (
          <p className="text-xs text-gruvbox-fg2 mt-1">{description}</p>
        )}
      </div>
    </div>
  );
}

interface CostDashboardProps {
  sessionId: string;
  className?: string;
}

interface CostData {
  totalCost: number;
  totalTokens: number;
  avgIterationCost: number;
  timeSeries: Array<{
    timestamp: string;
    cost: number;
    tokens: number;
  }>;
  modelBreakdown: Array<{
    model: string;
    cost: number;
    tokens: number;
    color: string;
  }>;
}

export function CostDashboard({ sessionId, className = '' }: CostDashboardProps) {
  const [metrics, setMetrics] = useState<SessionMetrics | null>(null);
  const [costData, setCostData] = useState<CostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAnalytics();
  }, [sessionId]);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load session metrics
      const metricsResult = await window.electronAPI.sessions.getMetrics(sessionId);
      if (metricsResult.success && metricsResult.metrics) {
        setMetrics(metricsResult.metrics);
      }

      // Load detailed cost data
      const costResult = await window.electronAPI.sessions.getCostData(sessionId);
      if (costResult.success && costResult.data) {
        setCostData(costResult.data);
      }
    } catch (error) {
      console.error('Failed to load analytics:', error);
      setError(error instanceof Error ? error.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={`p-6 ${className}`}>
        <div className="animate-pulse space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-gruvbox-bg1 p-4 rounded-lg border border-gruvbox-bg3 h-24"></div>
            ))}
          </div>
          <div className="bg-gruvbox-bg1 p-4 rounded-lg border border-gruvbox-bg3 h-64"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-6 ${className}`}>
        <div className="bg-gruvbox-red/20 border border-gruvbox-red rounded-lg p-4">
          <h3 className="text-gruvbox-bright-red font-medium">Error Loading Analytics</h3>
          <p className="text-gruvbox-red text-sm mt-1">{error}</p>
          <button
            onClick={loadAnalytics}
            className="mt-2 text-sm text-gruvbox-bright-red underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className={`p-6 ${className}`}>
        <div className="text-center py-8">
          <p className="text-gruvbox-fg2">No analytics data available for this session.</p>
          <p className="text-gruvbox-fg2 text-sm mt-1">Data will appear after session activity.</p>
        </div>
      </div>
    );
  }

  const modelColors = [
    '#83a598', // gruvbox-blue
    '#b8bb26', // gruvbox-green  
    '#fabd2f', // gruvbox-yellow
    '#fe8019', // gruvbox-orange
    '#d3869b', // gruvbox-purple
    '#8ec07c', // gruvbox-aqua
  ];

  return (
    <div className={`p-6 space-y-6 ${className}`}>
      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard 
          title="Total Cost"
          value={`$${metrics.totalCost.toFixed(4)}`}
          description={`Across ${metrics.iterationCount} iterations`}
        />
        <MetricCard 
          title="Total Tokens"
          value={(metrics.totalTokensIn + metrics.totalTokensOut).toLocaleString()}
          description={`${metrics.totalTokensIn.toLocaleString()} in, ${metrics.totalTokensOut.toLocaleString()} out`}
        />
        <MetricCard 
          title="Avg. Iteration Cost"
          value={`$${metrics.avgIterationCost.toFixed(4)}`}
          description="Per successful iteration"
        />
        <MetricCard 
          title="Success Rate"
          value={`${(metrics.successRate * 100).toFixed(1)}%`}
          description={`${metrics.errorCount} errors`}
        />
      </div>

      {/* Time Series Chart */}
      {costData?.timeSeries && costData.timeSeries.length > 0 && (
        <div className="bg-gruvbox-bg1 p-6 rounded-lg border border-gruvbox-bg3">
          <h3 className="text-lg font-semibold mb-4 text-gruvbox-fg0">Cost Over Time</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={costData.timeSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="#665c54" />
              <XAxis 
                dataKey="timestamp" 
                stroke="#a89984"
                fontSize={12}
                tickFormatter={(value) => format(new Date(value), 'HH:mm')}
              />
              <YAxis stroke="#a89984" fontSize={12} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#3c3836', 
                  border: '1px solid #665c54',
                  borderRadius: '6px',
                  color: '#ebdbb2'
                }}
                labelFormatter={(value) => format(new Date(value), 'PPpp')}
                formatter={(value: number, name: string) => [
                  name === 'cost' ? `$${value.toFixed(4)}` : value.toLocaleString(),
                  name === 'cost' ? 'Cost' : 'Tokens'
                ]}
              />
              <Line 
                type="monotone" 
                dataKey="cost" 
                stroke="#83a598" 
                strokeWidth={2}
                dot={{ fill: '#83a598', strokeWidth: 2, r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Model Breakdown */}
      {costData?.modelBreakdown && costData.modelBreakdown.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Cost by Model */}
          <div className="bg-gruvbox-bg1 p-6 rounded-lg border border-gruvbox-bg3">
            <h3 className="text-lg font-semibold mb-4 text-gruvbox-fg0">Cost by Model</h3>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={costData.modelBreakdown}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  dataKey="cost"
                  label={({ model, cost }) => `${model}: $${cost.toFixed(4)}`}
                >
                  {costData.modelBreakdown.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={modelColors[index % modelColors.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#3c3836', 
                    border: '1px solid #665c54',
                    borderRadius: '6px',
                    color: '#ebdbb2'
                  }}
                  formatter={(value: number) => [`$${value.toFixed(4)}`, 'Cost']}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Token Usage by Model */}
          <div className="bg-gruvbox-bg1 p-6 rounded-lg border border-gruvbox-bg3">
            <h3 className="text-lg font-semibold mb-4 text-gruvbox-fg0">Tokens by Model</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={costData.modelBreakdown} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#665c54" />
                <XAxis 
                  dataKey="model" 
                  stroke="#a89984"
                  fontSize={12}
                />
                <YAxis stroke="#a89984" fontSize={12} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#3c3836', 
                    border: '1px solid #665c54',
                    borderRadius: '6px',
                    color: '#ebdbb2'
                  }}
                  formatter={(value: number) => [value.toLocaleString(), 'Tokens']}
                />
                <Bar dataKey="tokens" fill="#b8bb26" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Session Summary */}
      <div className="bg-gruvbox-bg1 p-6 rounded-lg border border-gruvbox-bg3">
        <h3 className="text-lg font-semibold mb-4 text-gruvbox-fg0">Session Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <dt className="font-medium text-gruvbox-fg2">Duration</dt>
            <dd className="text-gruvbox-fg1">
              {Math.round(metrics.duration / 1000 / 60)} minutes
            </dd>
          </div>
          <div>
            <dt className="font-medium text-gruvbox-fg2">Iterations</dt>
            <dd className="text-gruvbox-fg1">{metrics.iterationCount}</dd>
          </div>
          <div>
            <dt className="font-medium text-gruvbox-fg2">Avg. Tokens/Iteration</dt>
            <dd className="text-gruvbox-fg1">{Math.round(metrics.avgIterationTokens)}</dd>
          </div>
          <div>
            <dt className="font-medium text-gruvbox-fg2">Last Updated</dt>
            <dd className="text-gruvbox-fg1">
              {format(new Date(metrics.lastUpdated), 'PPpp')}
            </dd>
          </div>
        </div>
      </div>
    </div>
  );
}

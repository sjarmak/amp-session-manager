import React, { useState, useEffect } from 'react';
import { StreamingSessionMetrics } from './StreamingSessionMetrics';
import { RealtimeCostTracker } from './RealtimeCostTracker';
import { ToolUsageAnalytics } from './ToolUsageAnalytics';
import { SessionTimelineVisualization } from './SessionTimelineVisualization';

interface EnhancedMetricsDashboardProps {
  sessionId: string;
  className?: string;
}

type TabType = 'overview' | 'cost' | 'tools' | 'timeline';

interface DashboardTab {
  id: TabType;
  label: string;
  icon: string;
  component: React.ComponentType<{ sessionId: string; className?: string }>;
  badge?: number;
}

interface SessionStatus {
  status: 'idle' | 'running' | 'awaiting-input' | 'error' | 'done';
  currentIteration: number;
  lastActivity: string;
  isLive: boolean;
}

export const EnhancedMetricsDashboard: React.FC<EnhancedMetricsDashboardProps> = ({ 
  sessionId, 
  className 
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [sessionStatus, setSessionStatus] = useState<SessionStatus | null>(null);
  const [notifications, setNotifications] = useState<Array<{
    id: string;
    type: 'info' | 'warning' | 'error';
    message: string;
    timestamp: string;
  }>>([]);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const tabs: DashboardTab[] = [
    {
      id: 'overview',
      label: 'Overview',
      icon: '📊',
      component: StreamingSessionMetrics
    },
    {
      id: 'cost',
      label: 'Cost Tracking',
      icon: '💰',
      component: RealtimeCostTracker
    },
    {
      id: 'tools',
      label: 'Tool Analytics',
      icon: '🔧',
      component: ToolUsageAnalytics
    },
    {
      id: 'timeline',
      label: 'Timeline',
      icon: '⏱️',
      component: SessionTimelineVisualization
    }
  ];

  // Fetch session status
  useEffect(() => {
    const fetchSessionStatus = async () => {
      try {
        const session = await window.electronAPI.sessions.get(sessionId);
        if (session) {
          setSessionStatus({
            status: session.status,
            currentIteration: 0, // Will be updated from metrics
            lastActivity: session.lastRun || session.createdAt,
            isLive: ['running', 'awaiting-input'].includes(session.status)
          });
        }
      } catch (error) {
        console.error('Error fetching session status:', error);
      }
    };

    fetchSessionStatus();
    
    // Update session status every 5 seconds
    const interval = setInterval(fetchSessionStatus, 5000);
    
    return () => clearInterval(interval);
  }, [sessionId]);

  // Listen for real-time notifications
  useEffect(() => {
    const handleNotification = (event: MessageEvent) => {
      if (event.data.type === 'session-notification' && event.data.sessionId === sessionId) {
        const notification = {
          id: `notif-${Date.now()}-${Math.random()}`,
          type: event.data.notificationType || 'info',
          message: event.data.message,
          timestamp: new Date().toISOString()
        };
        
        setNotifications(prev => [...prev.slice(-4), notification]); // Keep last 5 notifications
        
        // Auto-remove after 10 seconds
        setTimeout(() => {
          setNotifications(prev => prev.filter(n => n.id !== notification.id));
        }, 10000);
      }
    };

    window.addEventListener('message', handleNotification);
    
    return () => window.removeEventListener('message', handleNotification);
  }, [sessionId]);

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'running': return 'text-green-600 bg-green-50 border-green-200';
      case 'awaiting-input': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'error': return 'text-red-600 bg-red-50 border-red-200';
      case 'done': return 'text-blue-600 bg-blue-50 border-blue-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const exportAllMetrics = async () => {
    try {
      const result = await window.electronAPI.metrics.exportMetrics(sessionId, {
        format: 'json',
        includeRawEvents: true
      });
      
      if (result.success) {
        const notification = {
          id: `export-${Date.now()}`,
          type: 'info' as const,
          message: `Metrics exported successfully to ${result.result.filePath}`,
          timestamp: new Date().toISOString()
        };
        setNotifications(prev => [...prev.slice(-4), notification]);
      } else {
        throw new Error(result.error || 'Export failed');
      }
    } catch (error) {
      const notification = {
        id: `export-error-${Date.now()}`,
        type: 'error' as const,
        message: `Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date().toISOString()
      };
      setNotifications(prev => [...prev.slice(-4), notification]);
    }
  };

  const ActiveComponent = tabs.find(tab => tab.id === activeTab)?.component;

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header with Session Status */}
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-4">
          <h2 className="text-xl font-bold">Enhanced Metrics Dashboard</h2>
          {sessionStatus && (
            <div className="flex items-center space-x-2">
              <div className={`px-3 py-1 text-sm rounded-full border ${getStatusColor(sessionStatus.status)}`}>
                {sessionStatus.status}
              </div>
              {sessionStatus.isLive && (
                <div className="flex items-center space-x-1">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-sm text-green-600 font-medium">LIVE</span>
                </div>
              )}
              <span className="text-sm text-gray-500">
                Iteration {sessionStatus.currentIteration}
              </span>
            </div>
          )}
        </div>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`text-sm px-3 py-1 rounded border ${
              autoRefresh 
                ? 'bg-green-50 text-green-700 border-green-200' 
                : 'bg-gray-50 text-gray-700 border-gray-200'
            }`}
          >
            Auto-refresh: {autoRefresh ? 'On' : 'Off'}
          </button>
          <button
            onClick={exportAllMetrics}
            className="text-sm px-3 py-1 rounded border border-gray-300 hover:bg-gray-50 transition-colors flex items-center space-x-2"
          >
            <span>📥</span>
            <span>Export All</span>
          </button>
        </div>
      </div>

      {/* Real-time Notifications */}
      {notifications.length > 0 && (
        <div className="space-y-2">
          {notifications.map((notification) => (
            <div
              key={notification.id}
              className={`p-3 rounded-lg border-l-4 animate-fade-in ${
                notification.type === 'error' ? 'bg-red-50 border-l-red-400 text-red-800' :
                notification.type === 'warning' ? 'bg-yellow-50 border-l-yellow-400 text-yellow-800' :
                'bg-blue-50 border-l-blue-400 text-blue-800'
              }`}
            >
              <div className="flex justify-between items-start">
                <span className="text-sm">{notification.message}</span>
                <button
                  onClick={() => setNotifications(prev => prev.filter(n => n.id !== notification.id))}
                  className="text-gray-400 hover:text-gray-600 ml-2"
                >
                  ✕
                </button>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {new Date(notification.timestamp).toLocaleTimeString()}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="bg-white rounded-lg border">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center space-x-2 py-4 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className="bg-red-100 text-red-800 text-xs rounded-full px-2 py-1">
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {ActiveComponent && (
            <ActiveComponent 
              sessionId={sessionId} 
              className="w-full"
            />
          )}
        </div>
      </div>

      {/* Quick Stats Footer */}
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center justify-between text-sm text-gray-600">
          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-2">
              <span>Session ID:</span>
              <code className="bg-gray-100 px-2 py-1 rounded text-xs">
                {sessionId.slice(0, 8)}...
              </code>
            </div>
            {sessionStatus && sessionStatus.lastActivity && (
              <div className="flex items-center space-x-2">
                <span>Last Activity:</span>
                <span>{new Date(sessionStatus.lastActivity).toLocaleString()}</span>
              </div>
            )}
          </div>
          <div className="flex items-center space-x-4 text-xs text-gray-500">
            <span>Real-time metrics enabled</span>
            <span>•</span>
            <span>Auto-refresh: {autoRefresh ? 'On' : 'Off'}</span>
            <span>•</span>
            <span>Enhanced streaming</span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
};

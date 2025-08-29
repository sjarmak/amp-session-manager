'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { BottomNavigation } from '@/components/ui/navigation';
import { 
  ArrowLeft, 
  Play, 
  Square, 
  GitMerge, 
  FileText, 
  Activity, 
  BarChart3,
  Clock
} from 'lucide-react';
import { clsx } from 'clsx';

type Tab = 'live' | 'diff' | 'metrics' | 'history';

interface SessionDetailClientProps {
  id: string;
}

export function SessionDetailClient({ id }: SessionDetailClientProps) {
  const router = useRouter();
  const sessionId = id;
  const [activeTab, setActiveTab] = useState<Tab>('live');

  const { data: sessionResponse, isLoading } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => api.getSession(sessionId),
    enabled: !!sessionId,
  });

  const session = sessionResponse?.data;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center h-screen p-4">
        <h2 className="text-lg font-semibold mb-2">Session Not Found</h2>
        <p className="text-muted-foreground text-center mb-4">
          The session you're looking for doesn't exist or has been deleted.
        </p>
        <button
          onClick={() => router.push('/')}
          className="bg-primary text-primary-foreground px-4 py-2 rounded-lg"
        >
          Go Home
        </button>
      </div>
    );
  }

  const tabs = [
    { id: 'live', label: 'Live', icon: Play },
    { id: 'diff', label: 'Diff', icon: FileText },
    { id: 'metrics', label: 'Metrics', icon: BarChart3 },
    { id: 'history', label: 'History', icon: Clock },
  ] as const;

  const statusColor = {
    'idle': 'text-gray-600',
    'running': 'text-blue-600',
    'awaiting-input': 'text-yellow-600',
    'error': 'text-red-600',
    'done': 'text-green-600',
  }[session.status];

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="bg-card border-b border-border p-4 safe-area-top">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => router.back()}
            className="flex items-center text-muted-foreground hover:text-foreground touch-target"
          >
            <ArrowLeft className="h-5 w-5 mr-1" />
            Back
          </button>
          <div className="flex items-center space-x-2">
            {session.status === 'running' ? (
              <button className="flex items-center px-3 py-1.5 bg-red-500 text-white rounded-lg touch-target">
                <Square className="h-4 w-4 mr-1" />
                Stop
              </button>
            ) : (
              <button className="flex items-center px-3 py-1.5 bg-primary text-primary-foreground rounded-lg touch-target">
                <Play className="h-4 w-4 mr-1" />
                Continue
              </button>
            )}
            <button className="flex items-center px-3 py-1.5 border border-border rounded-lg touch-target">
              <GitMerge className="h-4 w-4 mr-1" />
              Merge
            </button>
          </div>
        </div>

        <div>
          <h1 className="text-lg font-semibold text-foreground truncate">
            {session.name}
          </h1>
          <div className="flex items-center mt-1 space-x-3">
            <span className={clsx('text-sm font-medium', statusColor)}>
              {session.status.charAt(0).toUpperCase() + session.status.slice(1).replace('-', ' ')}
            </span>
            <span className="text-sm text-muted-foreground">
              {session.repoRoot.split('/').pop()}
            </span>
            {session.iterations && (
              <span className="text-sm text-muted-foreground">
                {session.iterations.length} iterations
              </span>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex mt-4 -mb-4 border-b border-border">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={clsx(
                'flex-1 flex flex-col items-center pb-3 pt-1 touch-target transition-colors',
                activeTab === id
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4 mb-1" />
              <span className="text-xs font-medium">{label}</span>
            </button>
          ))}
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'live' && <LiveTab session={session} />}
        {activeTab === 'diff' && <DiffTab sessionId={session.id} />}
        {activeTab === 'metrics' && <MetricsTab session={session} />}
        {activeTab === 'history' && <HistoryTab session={session} />}
      </div>

      <BottomNavigation />
    </div>
  );
}

// Tab Components (simplified versions)
function LiveTab({ session }: { session: any }) {
  return (
    <div className="p-4 pb-20">
      <div className="bg-card rounded-lg border border-border p-4">
        <h3 className="font-semibold mb-2">Session Prompt</h3>
        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
          {session.ampPrompt}
        </p>
      </div>
      
      {session.status === 'running' && (
        <div className="mt-4 bg-card rounded-lg border border-border p-4">
          <h3 className="font-semibold mb-2">Live Activity</h3>
          <div className="flex items-center text-sm text-muted-foreground">
            <Activity className="h-4 w-4 mr-2 animate-pulse" />
            Amp is working on your request...
          </div>
        </div>
      )}
    </div>
  );
}

function DiffTab({ sessionId }: { sessionId: string }) {
  const { data: diffResponse, isLoading } = useQuery({
    queryKey: ['session-diff', sessionId],
    queryFn: () => api.getSessionDiff(sessionId),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const diff = diffResponse?.data;

  return (
    <div className="p-4 pb-20">
      {diff ? (
        <div className="space-y-4">
          <div className="bg-card rounded-lg border border-border p-4">
            <h3 className="font-semibold mb-2">Summary</h3>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>{diff.summary.totalFiles} files changed</p>
              <p className="text-green-600">+{diff.summary.totalAdditions} additions</p>
              <p className="text-red-600">-{diff.summary.totalDeletions} deletions</p>
            </div>
          </div>
          
          {diff.files.map((file, index) => (
            <div key={index} className="bg-card rounded-lg border border-border p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-sm">{file.path}</h4>
                <span className={clsx(
                  'text-xs px-2 py-1 rounded',
                  file.status === 'added' && 'bg-green-100 text-green-800',
                  file.status === 'modified' && 'bg-blue-100 text-blue-800',
                  file.status === 'deleted' && 'bg-red-100 text-red-800'
                )}>
                  {file.status}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                <span className="text-green-600">+{file.additions}</span>
                <span className="mx-2">•</span>
                <span className="text-red-600">-{file.deletions}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-2" />
          <p>No changes yet</p>
        </div>
      )}
    </div>
  );
}

function MetricsTab({ session }: { session: any }) {
  const totalMetrics = session.iterations?.reduce((acc: any, iter: any) => {
    if (iter.metrics) {
      acc.tokens += iter.metrics.tokenUsage.total;
      acc.cost += iter.metrics.costCents;
      acc.duration += iter.metrics.durationMs;
    }
    return acc;
  }, { tokens: 0, cost: 0, duration: 0 }) || { tokens: 0, cost: 0, duration: 0 };

  return (
    <div className="p-4 pb-20 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card rounded-lg border border-border p-4">
          <h3 className="text-sm font-medium text-muted-foreground mb-1">Total Tokens</h3>
          <p className="text-2xl font-bold">{totalMetrics.tokens.toLocaleString()}</p>
        </div>
        <div className="bg-card rounded-lg border border-border p-4">
          <h3 className="text-sm font-medium text-muted-foreground mb-1">Total Cost</h3>
          <p className="text-2xl font-bold">${(totalMetrics.cost / 100).toFixed(2)}</p>
        </div>
        <div className="bg-card rounded-lg border border-border p-4">
          <h3 className="text-sm font-medium text-muted-foreground mb-1">Runtime</h3>
          <p className="text-2xl font-bold">
            {Math.round(totalMetrics.duration / 1000 / 60)}m
          </p>
        </div>
        <div className="bg-card rounded-lg border border-border p-4">
          <h3 className="text-sm font-medium text-muted-foreground mb-1">Iterations</h3>
          <p className="text-2xl font-bold">{session.iterations?.length || 0}</p>
        </div>
      </div>
    </div>
  );
}

function HistoryTab({ session }: { session: any }) {
  return (
    <div className="p-4 pb-20">
      {session.iterations && session.iterations.length > 0 ? (
        <div className="space-y-4">
          {session.iterations.map((iteration: any, index: number) => (
            <div key={iteration.id} className="bg-card rounded-lg border border-border p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium">Iteration {index + 1}</h3>
                <span className={clsx(
                  'text-xs px-2 py-1 rounded',
                  iteration.status === 'completed' && 'bg-green-100 text-green-800',
                  iteration.status === 'running' && 'bg-blue-100 text-blue-800',
                  iteration.status === 'error' && 'bg-red-100 text-red-800'
                )}>
                  {iteration.status}
                </span>
              </div>
              <p className="text-sm text-muted-foreground mb-2">
                {iteration.prompt}
              </p>
              <div className="text-xs text-muted-foreground">
                {new Date(iteration.startedAt).toLocaleString()}
                {iteration.metrics && (
                  <span className="ml-2">
                    • {iteration.metrics.tokenUsage.total} tokens
                    • ${(iteration.metrics.costCents / 100).toFixed(2)}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <Clock className="h-12 w-12 mx-auto mb-2" />
          <p>No iterations yet</p>
        </div>
      )}
    </div>
  );
}

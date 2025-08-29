'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { BottomNavigation } from '@/components/ui/navigation';
import { PullToRefresh } from '@/components/ui/pull-to-refresh';
import { 
  MessageSquare, 
  Clock, 
  AlertCircle, 
  Loader2,
  CheckCircle2
} from 'lucide-react';
import { clsx } from 'clsx';

export const dynamic = 'force-dynamic';

export default function ThreadsPage() {
  const router = useRouter();
  const {
    data: threadsResponse,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['threads'],
    queryFn: () => api.getThreads(50),
  });

  const threads = threadsResponse?.data || [];

  const handleRefresh = async () => {
    await refetch();
  };

  if (error) {
    return (
      <div className="flex flex-col h-screen">
        <header className="bg-card border-b border-border p-4 safe-area-top">
          <div className="flex items-center">
            <MessageSquare className="h-6 w-6 text-primary mr-2" />
            <h1 className="text-xl font-bold text-foreground">Threads</h1>
          </div>
        </header>
        
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <AlertCircle className="h-12 w-12 text-destructive mb-4" />
          <h2 className="text-lg font-semibold text-foreground mb-2">
            Connection Error
          </h2>
          <p className="text-sm text-muted-foreground text-center mb-4">
            Unable to load threads. Check your connection and try again.
          </p>
          <button
            onClick={() => refetch()}
            className="bg-primary text-primary-foreground px-4 py-2 rounded-lg touch-target"
          >
            Retry
          </button>
        </div>
        
        <BottomNavigation />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="bg-card border-b border-border p-4 safe-area-top">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <MessageSquare className="h-6 w-6 text-primary mr-2" />
            <h1 className="text-xl font-bold text-foreground">Threads</h1>
          </div>
          <span className="text-sm text-muted-foreground">
            {threads.length} {threads.length === 1 ? 'thread' : 'threads'}
          </span>
        </div>
      </header>

      {/* Content */}
      <PullToRefresh onRefresh={handleRefresh}>
        <div className="p-4 pb-20">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : threads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <MessageSquare className="h-16 w-16 text-muted-foreground mb-4" />
              <h2 className="text-lg font-semibold text-foreground mb-2">
                No threads yet
              </h2>
              <p className="text-sm text-muted-foreground mb-6">
                Threads are created when you start sessions or continue conversations with Amp.
              </p>
              <button
                onClick={() => router.push('/sessions/new')}
                className="bg-primary text-primary-foreground px-6 py-3 rounded-lg touch-target font-medium"
              >
                Start a Session
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {threads.map((thread) => (
                <ThreadCard key={thread.id} thread={thread} />
              ))}
            </div>
          )}
        </div>
      </PullToRefresh>

      <BottomNavigation />
    </div>
  );
}

function ThreadCard({ thread }: { thread: any }) {
  const statusIconMap: Record<string, typeof Clock> = {
    active: Clock,
    completed: CheckCircle2,
    error: AlertCircle,
  };
  
  const StatusIcon = statusIconMap[thread.status] || Clock;

  const timeAgo = new Date(thread.lastMessageAt).toLocaleDateString();

  return (
    <Link href={`/threads/${thread.id}`} className="block mobile-tap">
      <div className="bg-card rounded-lg border border-border p-4 shadow-sm hover:shadow-md transition-shadow duration-200">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-foreground truncate">
              {thread.title}
            </h3>
            <div className="flex items-center mt-1 space-x-2 text-xs text-muted-foreground">
              <StatusIcon className="h-3 w-3" />
              <span className={clsx(
                'font-medium',
                thread.status === 'active' && 'text-blue-600',
                thread.status === 'completed' && 'text-green-600',
                thread.status === 'error' && 'text-red-600',
              )}>
                {thread.status.charAt(0).toUpperCase() + thread.status.slice(1)}
              </span>
            </div>
          </div>
          <span className="text-xs text-muted-foreground flex-shrink-0 ml-2">
            {timeAgo}
          </span>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center">
            <MessageSquare className="h-3 w-3 mr-1" />
            {thread.messageCount} message{thread.messageCount !== 1 ? 's' : ''}
          </div>
          {thread.model && (
            <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">
              {thread.model}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

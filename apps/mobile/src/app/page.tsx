'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { SessionCard } from '@/components/sessions/session-card';
import { PullToRefresh } from '@/components/ui/pull-to-refresh';
import { BottomNavigation } from '@/components/ui/navigation';
import { Loader2, AlertCircle, Zap } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  const router = useRouter();
  const {
    data: response,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api.getSessions(),
  });

  const sessions = response?.data || [];

  const handleRefresh = async () => {
    await refetch();
  };

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-lg font-semibold text-foreground mb-2">
          Connection Error
        </h2>
        <p className="text-sm text-muted-foreground text-center mb-4">
          Unable to connect to the Amp server. Make sure the server is running and accessible.
        </p>
        <button
          onClick={() => refetch()}
          className="bg-primary text-primary-foreground px-4 py-2 rounded-lg touch-target"
        >
          Retry
        </button>
        <BottomNavigation />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="bg-card border-b border-border p-4 safe-area-top">
        <div className="flex items-center">
          <Zap className="h-6 w-6 text-primary mr-2" />
          <h1 className="text-xl font-bold text-foreground">Sessions</h1>
        </div>
      </header>

      {/* Content */}
      <PullToRefresh onRefresh={handleRefresh}>
        <div className="p-4 pb-20">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Zap className="h-16 w-16 text-muted-foreground mb-4" />
              <h2 className="text-lg font-semibold text-foreground mb-2">
                No sessions yet
              </h2>
              <p className="text-sm text-muted-foreground mb-6">
                Create your first Amp session to get started with AI-powered coding.
              </p>
              <button
                onClick={() => router.push('/sessions/new')}
                className="bg-primary text-primary-foreground px-6 py-3 rounded-lg touch-target font-medium"
              >
                Create Session
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map((session) => (
                <SessionCard key={session.id} session={session} />
              ))}
            </div>
          )}
        </div>
      </PullToRefresh>

      {/* Bottom Navigation */}
      <BottomNavigation />
    </div>
  );
}

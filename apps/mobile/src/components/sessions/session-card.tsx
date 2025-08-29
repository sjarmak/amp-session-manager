'use client';

import Link from 'next/link';
import { Session } from '@/types/api';
import { clsx } from 'clsx';
import { Calendar, GitBranch, Clock, AlertCircle } from 'lucide-react';

interface SessionCardProps {
  session: Session;
}

function StatusChip({ status }: { status: Session['status'] }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        {
          'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100': status === 'idle',
          'bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100': status === 'running',
          'bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-100': status === 'awaiting-input',
          'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100': status === 'error',
          'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100': status === 'done',
        }
      )}
    >
      {status === 'running' && <div className="animate-pulse-soft mr-1.5 h-2 w-2 rounded-full bg-current" />}
      {status === 'error' && <AlertCircle className="mr-1 h-3 w-3" />}
      {status.charAt(0).toUpperCase() + status.slice(1).replace('-', ' ')}
    </span>
  );
}

export function SessionCard({ session }: SessionCardProps) {
  const repoName = session.repoRoot.split('/').pop() || 'Unknown';
  const lastActivity = session.lastRun || session.createdAt;
  const timeAgo = new Date(lastActivity).toLocaleDateString();
  const iterationCount = session.iterations?.length || 0;

  return (
    <Link href={`/sessions/${session.id}`} className="block mobile-tap">
      <div className="bg-card rounded-lg border border-border p-4 shadow-sm hover:shadow-md transition-shadow duration-200">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-foreground truncate">
              {session.name}
            </h3>
            <p className="text-xs text-muted-foreground mt-1 flex items-center">
              <GitBranch className="h-3 w-3 mr-1" />
              {repoName}
            </p>
          </div>
          <StatusChip status={session.status} />
        </div>

        <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
          {session.ampPrompt}
        </p>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center">
            <Calendar className="h-3 w-3 mr-1" />
            {timeAgo}
          </div>
          <div className="flex items-center">
            <Clock className="h-3 w-3 mr-1" />
            {iterationCount} iteration{iterationCount !== 1 ? 's' : ''}
          </div>
        </div>

        {session.baseBranch && (
          <div className="mt-2 pt-2 border-t border-border">
            <span className="text-xs text-muted-foreground">
              Branch: <code className="font-mono">{session.branchName || session.baseBranch}</code>
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}

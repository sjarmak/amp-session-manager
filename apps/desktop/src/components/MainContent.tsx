import React from 'react';
import type { Session } from '@ampsm/types';
import type { View } from '../hooks/useNavigation';
import { SessionList } from './SessionList';
import { SessionView } from './SessionView';
import { BatchesView } from './BatchesView';
import { BatchRunDetail } from './BatchRunDetail';
import { BenchmarksView } from './BenchmarksView';
import BenchmarkRunDetail from './BenchmarkRunDetail';

interface MainContentProps {
  currentView: View;
  selectedSession: Session | null;
  selectedBatchRun: string | null;
  selectedBenchmarkRun: { runId: string; type: string } | null;
  newInteractiveSessionId: string | null;
  refreshKey: number;
  
  // Event handlers
  onSessionSelect: (session: Session) => void;
  onNewSession: () => void;
  onBackToList: () => void;
  onSessionUpdated: () => void;
  onMergeCompleted: () => void;
  onBatchRunSelect: (runId: string) => void;
  onNewBatch: () => void;
  onBackToBatches: () => void;
  onBenchmarkRunSelect: (runId: string, type: string) => void;
  onNewBenchmark: () => void;
  onBackToBenchmarks: () => void;
}

export function MainContent({
  currentView,
  selectedSession,
  selectedBatchRun,
  selectedBenchmarkRun,
  newInteractiveSessionId,
  refreshKey,
  onSessionSelect,
  onNewSession,
  onBackToList,
  onSessionUpdated,
  onMergeCompleted,
  onBatchRunSelect,
  onNewBatch,
  onBackToBatches,
  onBenchmarkRunSelect,
  onNewBenchmark,
  onBackToBenchmarks,
}: MainContentProps) {
  return (
    <div className="bg-gruvbox-dark1 rounded-lg shadow-xl shadow-gruvbox-dark0/50 border border-gruvbox-dark3/50 p-6">
      {currentView === 'sessions' ? (
        <div key={refreshKey}>
          <SessionList 
            onSessionSelect={onSessionSelect}
            onNewSession={onNewSession}
          />
        </div>
      ) : currentView === 'batches' ? (
        <div key={refreshKey}>
          <BatchesView
            onRunSelect={onBatchRunSelect}
            onNewBatch={onNewBatch}
          />
        </div>
      ) : currentView === 'benchmarks' ? (
        <div key={refreshKey}>
          <BenchmarksView
            onRunSelect={onBenchmarkRunSelect}
            onNewRun={onNewBenchmark}
          />
        </div>
      ) : currentView === 'batch-detail' && selectedBatchRun ? (
        <BatchRunDetail
          runId={selectedBatchRun}
          onBack={onBackToBatches}
          onSessionSelect={onSessionSelect}
        />
      ) : currentView === 'benchmark-detail' && selectedBenchmarkRun ? (
        <BenchmarkRunDetail
          runId={selectedBenchmarkRun.runId}
          type={selectedBenchmarkRun.type}
          onBack={onBackToBenchmarks}
        />
      ) : currentView === 'session' && selectedSession ? (
        <SessionView
          key={`${selectedSession.id}-${refreshKey}`}
          session={selectedSession}
          onBack={onBackToList}
          onSessionUpdated={onSessionUpdated}
          onMergeCompleted={onMergeCompleted}
          initialTab={newInteractiveSessionId === selectedSession.id ? "interactive" : undefined}
        />
      ) : null}
    </div>
  );
}

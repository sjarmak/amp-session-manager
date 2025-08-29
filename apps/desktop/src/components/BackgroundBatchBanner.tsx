import React, { useState, useEffect } from 'react';

interface RunningBatch {
  runId: string;
  status: string;
  totalItems: number;
  queuedCount?: number;
  runningCount?: number;
  successCount?: number;
  failCount?: number;
  errorCount?: number;
  timeoutCount?: number;
}

export function BackgroundBatchBanner() {
  const [runningBatches, setRunningBatches] = useState<RunningBatch[]>([]);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    const loadRunningBatches = async () => {
      try {
        const runs = await window.electronAPI.batch.listRuns();
        const running = runs.filter((run: any) => run.status === 'running');
        setRunningBatches(running);
        
        // Reset dismissed state when new batches start
        if (running.length > 0) {
          setIsDismissed(false);
        }
      } catch (error) {
        console.error('Failed to load running batches:', error);
      }
    };

    loadRunningBatches();

    // Poll for updates as fallback
    const interval = setInterval(loadRunningBatches, 5000);

    const handleBatchEvent = (event: any) => {
      if (event.type === 'run-started') {
        loadRunningBatches();
      } else if (event.type === 'run-finished' || event.type === 'run-aborted') {
        setRunningBatches(prev => prev.filter(batch => batch.runId !== event.runId));
      } else if (event.type === 'run-updated' && event.run) {
        setRunningBatches(prev => 
          prev.map(batch => 
            batch.runId === event.runId ? { ...batch, ...event.run } : batch
          )
        );
      }
    };

    window.electronAPI.batch.onEvent(handleBatchEvent);
    return () => {
      clearInterval(interval);
      window.electronAPI.batch.offEvent(handleBatchEvent);
    };
  }, []);

  // Don't show if no running batches or user dismissed it
  if (runningBatches.length === 0 || isDismissed) {
    return null;
  }

  const totalBatches = runningBatches.length;
  const totalItems = runningBatches.reduce((sum, batch) => sum + (batch.totalItems || 0), 0);
  const completedItems = runningBatches.reduce((sum, batch) => {
    // Use the aggregated counts instead of trying to access individual items
    const completed = (batch.successCount || 0) + (batch.failCount || 0) + (batch.errorCount || 0) + (batch.timeoutCount || 0);
    return sum + completed;
  }, 0);

  return (
    <div className="fixed top-0 left-0 right-0 bg-gradient-to-r from-gruvbox-blue/80 to-gruvbox-bright-blue/80 backdrop-blur-sm text-gruvbox-bg0 px-4 py-2 shadow-lg border-b border-gruvbox-bright-blue/30 z-[61]">
      <div className="flex items-center justify-between max-w-6xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-gruvbox-bg0 rounded-full animate-pulse"></div>
            <span className="font-semibold text-base">
              {totalBatches} Batch{totalBatches > 1 ? 'es' : ''} Running
            </span>
          </div>
          
          <div className="h-4 w-px bg-gruvbox-bg0/30"></div>
          
          <div className="text-xs opacity-90">
            {completedItems}/{totalItems} completed
          </div>
        </div>
        
        <button
          onClick={() => setIsDismissed(true)}
          className="p-1 hover:bg-gruvbox-bg0/20 rounded transition-colors"
          title="Dismiss notification"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

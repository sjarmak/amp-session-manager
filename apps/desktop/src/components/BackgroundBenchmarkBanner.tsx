import React, { useState, useEffect } from 'react';

interface RunningBenchmark {
  runId: string;
  status: string;
  totalCases?: number;
  completedCases?: number;
}

export function BackgroundBenchmarkBanner() {
  const [runningBenchmarks, setRunningBenchmarks] = useState<RunningBenchmark[]>([]);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    let eventHandler: any = null;

    const loadRunningBenchmarks = async () => {
      try {
        const runs = await window.electronAPI.benchmarks.listRuns();
        console.log('🔍 BackgroundBenchmarkBanner: All runs:', runs);
        const running = runs.filter((run: any) => run.status === 'running');
        console.log('🔍 BackgroundBenchmarkBanner: Running benchmarks:', running);
        setRunningBenchmarks(running);
        
        // Reset dismissed state when new benchmarks start
        if (running.length > 0) {
          console.log('🔍 BackgroundBenchmarkBanner: Found running benchmarks, resetting dismissed state');
          setIsDismissed(false);
        }

        // Only start polling if we have running benchmarks, stop if none
        if (running.length > 0 && !interval) {
          interval = setInterval(loadRunningBenchmarks, 5000);
        } else if (running.length === 0 && interval) {
          clearInterval(interval);
          interval = null;
        }
      } catch (error) {
        console.error('Failed to load running benchmarks:', error);
      }
    };

    loadRunningBenchmarks();

    const handleBenchmarkEvent = (event: any) => {
      console.log('🔄 BackgroundBenchmarkBanner: Got benchmark event:', event);
      if (event.type === 'run-started') {
        loadRunningBenchmarks();
      } else if (event.type === 'run-finished' || event.type === 'run-aborted') {
        setRunningBenchmarks(prev => prev.filter(benchmark => benchmark.runId !== event.runId));
        // Re-check and potentially stop polling
        loadRunningBenchmarks();
      } else if (event.type === 'run-updated' && event.run) {
        setRunningBenchmarks(prev => 
          prev.map(benchmark => 
            benchmark.runId === event.runId ? { ...benchmark, ...event.run } : benchmark
          )
        );
      }
    };

    eventHandler = window.electronAPI.benchmarks.onEvent(handleBenchmarkEvent);
    return () => {
      if (interval) clearInterval(interval);
      if (eventHandler) {
        window.electronAPI.benchmarks.offEvent(eventHandler);
      }
    };
  }, []);

  // Don't show if no running benchmarks or user dismissed it
  if (runningBenchmarks.length === 0 || isDismissed) {
    return null;
  }

  const totalBenchmarks = runningBenchmarks.length;
  const totalCases = runningBenchmarks.reduce((sum, benchmark) => sum + (benchmark.totalCases || 0), 0);
  const completedCases = runningBenchmarks.reduce((sum, benchmark) => sum + (benchmark.completedCases || 0), 0);

  return (
    <div className="fixed top-[2.5rem] left-0 right-0 bg-gradient-to-r from-gruvbox-purple/80 to-gruvbox-bright-purple/80 backdrop-blur-sm text-gruvbox-bg0 px-4 py-2 shadow-lg border-b border-gruvbox-bright-purple/30 z-[60]">
      <div className="flex items-center justify-between max-w-6xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-gruvbox-bg0 rounded-full animate-pulse"></div>
            <span className="font-semibold text-base">
              {totalBenchmarks} Benchmark{totalBenchmarks > 1 ? 's' : ''} Running
            </span>
          </div>
          
          <div className="h-4 w-px bg-gruvbox-bg0/30"></div>
          
          <div className="text-xs opacity-90">
            {completedCases}/{totalCases} completed
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

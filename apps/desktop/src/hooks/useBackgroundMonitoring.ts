import { useState, useEffect } from 'react';

export function useBackgroundMonitoring() {
  const [hasBatchRunning, setHasBatchRunning] = useState(false);
  const [hasBenchmarkRunning, setHasBenchmarkRunning] = useState(false);

  // Monitor batch running state
  useEffect(() => {
    const checkBatchStatus = async () => {
      try {
        const runs = await window.electronAPI.batch.listRuns();
        const hasRunning = runs.some((run: any) => run.status === 'running');
        setHasBatchRunning(hasRunning);
      } catch (error) {
        console.error('Failed to check batch status:', error);
      }
    };

    checkBatchStatus();

    const handleBatchEvent = (event: any) => {
      if (event.type === 'run-started') {
        setHasBatchRunning(true);
      } else if (event.type === 'run-finished' || event.type === 'run-aborted') {
        // Check if any batches are still running
        checkBatchStatus();
      }
    };

    window.electronAPI.batch.onEvent(handleBatchEvent);
    return () => window.electronAPI.batch.offEvent(handleBatchEvent);
  }, []);

  // Monitor benchmark running state
  useEffect(() => {
    const checkBenchmarkStatus = async () => {
      try {
        const runs = await window.electronAPI.benchmarks.listRuns();
        const hasRunning = runs.some((run: any) => run.status === 'running');
        setHasBenchmarkRunning(hasRunning);
      } catch (error) {
        console.error('Failed to check benchmark status:', error);
      }
    };

    checkBenchmarkStatus();

    const handleBenchmarkEvent = (event: any) => {
      if (event.type === 'run-started') {
        setHasBenchmarkRunning(true);
      } else if (event.type === 'run-finished' || event.type === 'run-aborted') {
        // Check if any benchmarks are still running
        checkBenchmarkStatus();
      }
    };

    if (window.electronAPI?.benchmarks?.onEvent) {
      window.electronAPI.benchmarks.onEvent(handleBenchmarkEvent);
      return () => {
        if (window.electronAPI?.benchmarks?.offEvent) {
          window.electronAPI.benchmarks.offEvent(handleBenchmarkEvent);
        }
      };
    }
  }, []);

  return {
    hasBatchRunning,
    hasBenchmarkRunning,
  };
}

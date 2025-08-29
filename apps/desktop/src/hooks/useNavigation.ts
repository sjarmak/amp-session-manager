import { useState, useCallback } from 'react';
import type { Session } from '@ampsm/types';

export type View = 'sessions' | 'batches' | 'benchmarks' | 'session' | 'batch-detail' | 'benchmark-detail';

export interface NavigationState {
  currentView: View;
  selectedSession: Session | null;
  selectedBatchRun: string | null;
  selectedBenchmarkRun: { runId: string; type: string } | null;
  newInteractiveSessionId: string | null;
}

export function useNavigation() {
  const [currentView, setCurrentView] = useState<View>('sessions');
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [selectedBatchRun, setSelectedBatchRun] = useState<string | null>(null);
  const [selectedBenchmarkRun, setSelectedBenchmarkRun] = useState<{ runId: string; type: string } | null>(null);
  const [newInteractiveSessionId, setNewInteractiveSessionId] = useState<string | null>(null);

  const handleSessionSelect = useCallback((session: Session) => {
    setNewInteractiveSessionId(null); // Clear the flag when manually selecting
    setSelectedSession(session);
    setCurrentView('session');
  }, []);

  const handleBackToList = useCallback(() => {
    setSelectedSession(null);
    setCurrentView('sessions');
  }, []);

  const handleBatchRunSelect = useCallback((runId: string) => {
    setSelectedBatchRun(runId);
    setCurrentView('batch-detail');
  }, []);

  const handleBackToBatches = useCallback(() => {
    setSelectedBatchRun(null);
    setCurrentView('batches');
  }, []);

  const handleBenchmarkRunSelect = useCallback((runId: string, type: string) => {
    setSelectedBenchmarkRun({ runId, type });
    setCurrentView('benchmark-detail');
  }, []);

  const handleBackToBenchmarks = useCallback(() => {
    setSelectedBenchmarkRun(null);
    setCurrentView('benchmarks');
  }, []);

  const setSessionForInteractive = useCallback((session: Session) => {
    setNewInteractiveSessionId(session.id);
    setSelectedSession(session);
    setCurrentView('session');
  }, []);

  return {
    // State
    currentView,
    selectedSession,
    selectedBatchRun,
    selectedBenchmarkRun,
    newInteractiveSessionId,
    
    // Actions
    setCurrentView,
    setSelectedSession,
    handleSessionSelect,
    handleBackToList,
    handleBatchRunSelect,
    handleBackToBatches,
    handleBenchmarkRunSelect,
    handleBackToBenchmarks,
    setSessionForInteractive,
  };
}

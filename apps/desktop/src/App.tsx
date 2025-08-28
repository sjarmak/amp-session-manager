import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import type { Session } from '@ampsm/types';
import { SessionList } from './components/SessionList';
import { SessionView } from './components/SessionView';
import { NewSessionModal } from './components/NewSessionModal';
import { BatchesView } from './components/BatchesView';
import { BatchRunDetail } from './components/BatchRunDetail';
import { NewBatchModal } from './components/NewBatchModal';
import { BenchmarksView } from './components/BenchmarksView';
import { BenchmarkRunDetail } from './components/BenchmarkRunDetail';
import { NewBenchmarkModal } from './components/NewBenchmarkModal';
import { BackgroundBatchBanner } from './components/BackgroundBatchBanner';
import { BackgroundBenchmarkBanner } from './components/BackgroundBenchmarkBanner';

import NotificationSettingsModal from './components/NotificationSettingsModal';
import { AuthStatus } from './components/AuthStatus';
import './App.css';

function App() {
  const [currentView, setCurrentView] = useState<'sessions' | 'batches' | 'benchmarks' | 'session' | 'batch-detail' | 'benchmark-detail'>('sessions');
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [selectedBatchRun, setSelectedBatchRun] = useState<string | null>(null);
  const [selectedBenchmarkRun, setSelectedBenchmarkRun] = useState<{ runId: string; type: string } | null>(null);
  const [showNewSessionModal, setShowNewSessionModal] = useState(false);

  const [showNewBatchModal, setShowNewBatchModal] = useState(false);
  const [showNewBenchmarkModal, setShowNewBenchmarkModal] = useState(false);
  const [showNotificationSettings, setShowNotificationSettings] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [newInteractiveSessionId, setNewInteractiveSessionId] = useState<string | null>(null);
  const [hasBatchRunning, setHasBatchRunning] = useState(false);
  const [hasBenchmarkRunning, setHasBenchmarkRunning] = useState(false);

  const handleSessionSelect = (session: Session) => {
    setNewInteractiveSessionId(null); // Clear the flag when manually selecting
    setSelectedSession(session);
    setCurrentView('session');
  };

  const handleBackToList = () => {
    setSelectedSession(null);
    setCurrentView('sessions');
  };

  const handleSessionCreated = (session?: Session) => {
    setRefreshKey(prev => prev + 1);
    // Navigate to the session immediately and show interactive tab
    if (session) {
      setNewInteractiveSessionId(session.id);
      setSelectedSession(session);
      setCurrentView('session');
    }
  };

  const handleNewSession = () => {
    setShowNewSessionModal(true);
  };

  const handleSessionUpdated = () => {
    setRefreshKey(prev => prev + 1);
    // Clear the newInteractiveSessionId flag to prevent forcing tab back to interactive
    setNewInteractiveSessionId(null);
  };

  const handleMergeCompleted = () => {
    handleSessionUpdated();
    // Navigate back to sessions list after merge
    handleBackToList();
  };

  const handleBatchRunSelect = (runId: string) => {
    setSelectedBatchRun(runId);
    setCurrentView('batch-detail');
  };

  const handleBackToBatches = () => {
    setSelectedBatchRun(null);
    setCurrentView('batches');
  };

  const handleBatchCreated = () => {
    setRefreshKey(prev => prev + 1);
  };

  const handleBenchmarkRunSelect = (runId: string, type: string) => {
    setSelectedBenchmarkRun({ runId, type });
    setCurrentView('benchmark-detail');
  };

  const handleBackToBenchmarks = () => {
    setSelectedBenchmarkRun(null);
    setCurrentView('benchmarks');
  };

  const handleBenchmarkCreated = () => {
    setRefreshKey(prev => prev + 1);
  };



  // Reload selected session when refreshKey changes
  useEffect(() => {
    if (selectedSession && refreshKey > 0) {
      window.electronAPI.sessions.get(selectedSession.id)
        .then(updatedSession => {
          if (updatedSession) {
            setSelectedSession(updatedSession);
          }
        })
        .catch(error => {
          console.error('Failed to reload session:', error);
        });
    }
  }, [refreshKey, selectedSession?.id]);

  // Handle notification actions
  useEffect(() => {
    const handleNotificationAction = async (action: string) => {
      const [type, sessionName] = action.split(':');
      
      switch (type) {
        case 'view':
          // Find session by name and navigate to it
          try {
            const sessions = await window.electronAPI.sessions.list();
            const session = sessions.find(s => s.name === sessionName);
            if (session) {
              handleSessionSelect(session);
            }
          } catch (error) {
            console.error('Failed to find session:', error);
          }
          break;
        case 'conflicts':
        case 'tests':
          // Navigate to session and maybe specific tab
          try {
            const sessions = await window.electronAPI.sessions.list();
            const session = sessions.find(s => s.name === sessionName);
            if (session) {
              handleSessionSelect(session);
            }
          } catch (error) {
            console.error('Failed to find session:', error);
          }
          break;
        default:
          console.log('Unknown notification action:', action);
      }
    };

    window.electronAPI.notifications.onAction(handleNotificationAction);
    return () => {
      window.electronAPI.notifications.offAction(handleNotificationAction);
    };
  }, []);

  // Monitor batch running state for padding adjustment
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

  // Monitor benchmark running state for padding adjustment
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

  return (
    <div className="min-h-screen bg-gruvbox-dark0">
      <BackgroundBatchBanner />
      <BackgroundBenchmarkBanner />
      <div className={`container mx-auto py-8 px-4 max-w-6xl ${(hasBatchRunning || hasBenchmarkRunning) ? 'pt-24' : ''}`}>
        <header className="text-center mb-8 relative app-header">
          <div className="flex items-center justify-center gap-2 mb-4">
            <img 
              src="/images/AmpRedSymbol.png" 
              alt="Amp Logo" 
              className="h-12 w-auto"
            />
            <h1 className="text-5xl font-bold text-gruvbox-light0">
              Amp Session Orchestrator
            </h1>
          </div>
          <p className="text-gruvbox-light3 font-header italic font-thin">
            Orchestrate parallel, multi-thread Amp sessions in isolated worktrees
          </p>
          
          {/* Settings Button */}
          <button
            onClick={() => setShowNotificationSettings(true)}
            className="absolute top-0 right-0 p-2 text-gruvbox-light3 hover:text-gruvbox-light1 transition-colors"
            title="Notification Settings"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </header>

        {/* Auth Status */}
        <div className="mb-6">
          <AuthStatus />
        </div>

        {/* Navigation tabs */}
        <div className="mb-6">
          <nav className="flex space-x-1 bg-gruvbox-dark1 p-1 rounded-lg border border-gruvbox-dark3">
            <button
              onClick={() => setCurrentView('sessions')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                currentView === 'sessions' 
                  ? 'bg-gruvbox-aqua text-gruvbox-dark0 shadow-lg shadow-gruvbox-aqua/25' 
                  : 'text-gruvbox-light3 hover:text-gruvbox-light1 hover:bg-gruvbox-aqua-dim/20'
              }`}
            >
              Sessions
            </button>
            <button
              onClick={() => setCurrentView('batches')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                currentView === 'batches' 
                  ? 'bg-gruvbox-aqua text-gruvbox-dark0 shadow-lg shadow-gruvbox-aqua/25' 
                  : 'text-gruvbox-light3 hover:text-gruvbox-light1 hover:bg-gruvbox-aqua-dim/20'
              }`}
            >
              Batches
            </button>
            <button
              onClick={() => setCurrentView('benchmarks')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                currentView === 'benchmarks' 
                  ? 'bg-gruvbox-aqua text-gruvbox-dark0 shadow-lg shadow-gruvbox-aqua/25' 
                  : 'text-gruvbox-light3 hover:text-gruvbox-light1 hover:bg-gruvbox-aqua-dim/20'
              }`}
            >
              Benchmarks
            </button>

          </nav>
        </div>

        <div className="bg-gruvbox-dark1 rounded-lg shadow-xl shadow-gruvbox-dark0/50 border border-gruvbox-dark3/50 p-6">
          {currentView === 'sessions' ? (
            <div key={refreshKey}>
              <SessionList 
                onSessionSelect={handleSessionSelect}
                onNewSession={handleNewSession}
              />
            </div>
          ) : currentView === 'batches' ? (
            <div key={refreshKey}>
              <BatchesView
                onRunSelect={handleBatchRunSelect}
                onNewBatch={() => setShowNewBatchModal(true)}
              />
            </div>
          ) : currentView === 'benchmarks' ? (
            <div key={refreshKey}>
              <BenchmarksView
                onRunSelect={handleBenchmarkRunSelect}
                onNewRun={() => setShowNewBenchmarkModal(true)}
              />
            </div>

          ) : currentView === 'batch-detail' && selectedBatchRun ? (
            <BatchRunDetail
              runId={selectedBatchRun}
              onBack={handleBackToBatches}
              onSessionSelect={handleSessionSelect}
            />
          ) : currentView === 'benchmark-detail' && selectedBenchmarkRun ? (
            <BenchmarkRunDetail
              runId={selectedBenchmarkRun.runId}
              type={selectedBenchmarkRun.type}
              onBack={handleBackToBenchmarks}
              onSessionSelect={handleSessionSelect}
            />
          ) : currentView === 'session' && selectedSession ? (
            <SessionView
              key={`${selectedSession.id}-${refreshKey}`}
              session={selectedSession}
              onBack={handleBackToList}
              onSessionUpdated={handleSessionUpdated}
              onMergeCompleted={handleMergeCompleted}
              initialTab={newInteractiveSessionId === selectedSession.id ? "interactive" : undefined}
            />
          ) : null}
        </div>

        <NewSessionModal
          isOpen={showNewSessionModal}
          onClose={() => {
            console.log('NewSessionModal onClose called');
            setShowNewSessionModal(false);
          }}
          onSessionCreated={handleSessionCreated}
        />

        <NewBatchModal
          isOpen={showNewBatchModal}
          onClose={() => setShowNewBatchModal(false)}
          onBatchCreated={handleBatchCreated}
        />

        <NewBenchmarkModal
          isOpen={showNewBenchmarkModal}
          onClose={() => setShowNewBenchmarkModal(false)}
          onBenchmarkCreated={handleBenchmarkCreated}
        />

        <NotificationSettingsModal
          isOpen={showNotificationSettings}
          onClose={() => setShowNotificationSettings(false)}
        />
      </div>
    </div>
  );
}

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}

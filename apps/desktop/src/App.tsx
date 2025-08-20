import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Session } from '@ampsm/types';
import { SessionList } from './components/SessionList';
import { SessionView } from './components/SessionView';
import { NewSessionModal } from './components/NewSessionModal';
import { BatchesView } from './components/BatchesView';
import { BatchRunDetail } from './components/BatchRunDetail';
import { NewBatchModal } from './components/NewBatchModal';
import './App.css';

function App() {
  const [currentView, setCurrentView] = useState<'sessions' | 'batches' | 'session' | 'batch-detail'>('sessions');
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [selectedBatchRun, setSelectedBatchRun] = useState<string | null>(null);
  const [showNewSessionModal, setShowNewSessionModal] = useState(false);
  const [showNewBatchModal, setShowNewBatchModal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleSessionSelect = (session: Session) => {
    setSelectedSession(session);
    setCurrentView('session');
  };

  const handleBackToList = () => {
    setSelectedSession(null);
    setCurrentView('sessions');
  };

  const handleSessionCreated = () => {
    setRefreshKey(prev => prev + 1);
  };

  const handleSessionUpdated = () => {
    setRefreshKey(prev => prev + 1);
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

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="container mx-auto py-8 px-4 max-w-6xl">
        <header className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <img 
              src="/images/Amp_Style_Light.png" 
              alt="Amp Logo" 
              className="h-12 w-auto"
            />
            <h1 className="text-5xl font-bold text-black">
              Session Manager
            </h1>
          </div>
          <p className="text-gray-600">
            Manage isolated Git worktree sessions with Amp's autonomous coding agent
          </p>
        </header>

        {/* Navigation tabs */}
        <div className="mb-6">
          <nav className="flex space-x-1 bg-gray-200 p-1 rounded-lg">
            <button
              onClick={() => setCurrentView('sessions')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                currentView === 'sessions' 
                  ? 'bg-orange-500 text-white shadow-sm' 
                  : 'text-gray-600 hover:text-gray-900 hover:bg-orange-100'
              }`}
            >
              Sessions
            </button>
            <button
              onClick={() => setCurrentView('batches')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                currentView === 'batches' 
                  ? 'bg-orange-500 text-white shadow-sm' 
                  : 'text-gray-600 hover:text-gray-900 hover:bg-orange-100'
              }`}
            >
              Batches
            </button>
          </nav>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-6">
          {currentView === 'sessions' ? (
            <div key={refreshKey}>
              <SessionList 
                onSessionSelect={handleSessionSelect}
                onNewSession={() => setShowNewSessionModal(true)}
              />
            </div>
          ) : currentView === 'batches' ? (
            <div key={refreshKey}>
              <BatchesView
                onRunSelect={handleBatchRunSelect}
                onNewBatch={() => setShowNewBatchModal(true)}
              />
            </div>
          ) : currentView === 'batch-detail' && selectedBatchRun ? (
            <BatchRunDetail
              runId={selectedBatchRun}
              onBack={handleBackToBatches}
            />
          ) : selectedSession ? (
            <SessionView
              key={`${selectedSession.id}-${refreshKey}`}
              session={selectedSession}
              onBack={handleBackToList}
              onSessionUpdated={handleSessionUpdated}
            />
          ) : null}
        </div>

        <NewSessionModal
          isOpen={showNewSessionModal}
          onClose={() => setShowNewSessionModal(false)}
          onSessionCreated={handleSessionCreated}
        />

        <NewBatchModal
          isOpen={showNewBatchModal}
          onClose={() => setShowNewBatchModal(false)}
          onBatchCreated={handleBatchCreated}
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

import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Session } from '@ampsm/types';
import { SessionList } from './components/SessionList';
import { SessionView } from './components/SessionView';
import { NewSessionModal } from './components/NewSessionModal';
import './App.css';

function App() {
  const [currentView, setCurrentView] = useState<'list' | 'session'>('list');
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [showNewSessionModal, setShowNewSessionModal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleSessionSelect = (session: Session) => {
    setSelectedSession(session);
    setCurrentView('session');
  };

  const handleBackToList = () => {
    setSelectedSession(null);
    setCurrentView('list');
  };

  const handleSessionCreated = () => {
    setRefreshKey(prev => prev + 1);
  };

  const handleSessionUpdated = () => {
    setRefreshKey(prev => prev + 1);
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="container mx-auto py-8 px-4 max-w-6xl">
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            Amp Session Manager
          </h1>
          <p className="text-gray-600">
            Manage isolated Git worktree sessions with Amp
          </p>
        </header>

        <div className="bg-white rounded-lg shadow-lg p-6">
          {currentView === 'list' ? (
            <div key={refreshKey}>
              <SessionList 
                onSessionSelect={handleSessionSelect}
                onNewSession={() => setShowNewSessionModal(true)}
              />
            </div>
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
      </div>
    </div>
  );
}

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}

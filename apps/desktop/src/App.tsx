import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import type { Session } from '@ampsm/types';
import { SessionList } from './components/SessionList';
import { SessionView } from './components/SessionView';
import { NewSessionModal } from './components/NewSessionModal';
import { BatchesView } from './components/BatchesView';
import { BatchRunDetail } from './components/BatchRunDetail';
import { NewBatchModal } from './components/NewBatchModal';
import { ThreadsView } from './components/ThreadsView';
import NotificationSettingsModal from './components/NotificationSettingsModal';
import { AuthStatus } from './components/AuthStatus';
import './App.css';

function App() {
  const [currentView, setCurrentView] = useState<'sessions' | 'batches' | 'threads' | 'session' | 'batch-detail'>('sessions');
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [selectedBatchRun, setSelectedBatchRun] = useState<string | null>(null);
  const [showNewSessionModal, setShowNewSessionModal] = useState(false);
  const [showNewBatchModal, setShowNewBatchModal] = useState(false);
  const [showNotificationSettings, setShowNotificationSettings] = useState(false);
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

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="container mx-auto py-8 px-4 max-w-6xl">
        <header className="text-center mb-8 relative app-header">
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
          <p className="text-gray-600 font-header italic font-thin">
            Orchestrate parallel Amp sessions and batch experiments in isolated worktrees
          </p>
          
          {/* Settings Button */}
          <button
            onClick={() => setShowNotificationSettings(true)}
            className="absolute top-0 right-0 p-2 text-gray-500 hover:text-gray-700 transition-colors"
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
            <button
              onClick={() => setCurrentView('threads')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                currentView === 'threads' 
                  ? 'bg-orange-500 text-white shadow-sm' 
                  : 'text-gray-600 hover:text-gray-900 hover:bg-orange-100'
              }`}
            >
              Threads
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
          ) : currentView === 'threads' ? (
            <div key={refreshKey}>
              <ThreadsView />
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

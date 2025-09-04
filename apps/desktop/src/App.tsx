import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Session } from '@ampsm/types';
import { useNavigation } from './hooks/useNavigation';
import { useNotifications } from './hooks/useNotifications';
import { useBackgroundMonitoring } from './hooks/useBackgroundMonitoring';
import { useSessionRefresh } from './hooks/useSessionRefresh';
import { AppHeader } from './components/AppHeader';
import { MainTabs } from './components/MainTabs';
import { MainContent } from './components/MainContent';
import { NewSessionModal } from './components/NewSessionModal';
import { NewBatchModal } from './components/NewBatchModal';
import NewBenchmarkModal from './components/NewBenchmarkModal';
import { BackgroundBatchBanner } from './components/BackgroundBatchBanner';
import { BackgroundBenchmarkBanner } from './components/BackgroundBenchmarkBanner';
import NotificationSettingsModal from './components/NotificationSettingsModal';
import AmpSettingsModal from './components/AmpSettingsModal';
import { AuthStatus } from './components/AuthStatus';
import './App.css';

function App() {
  // Modal states
  const [showNewSessionModal, setShowNewSessionModal] = useState(false);
  const [showNewBatchModal, setShowNewBatchModal] = useState(false);
  const [showNewBenchmarkModal, setShowNewBenchmarkModal] = useState(false);
  const [showNotificationSettings, setShowNotificationSettings] = useState(false);
  const [showAmpSettings, setShowAmpSettings] = useState(false);

  // Custom hooks
  const navigation = useNavigation();
  const { hasBatchRunning, hasBenchmarkRunning } = useBackgroundMonitoring();
  const { refreshKey, triggerRefresh } = useSessionRefresh({
    selectedSession: navigation.selectedSession,
    onSessionUpdate: navigation.setSelectedSession,
  });

  // Use notifications hook
  useNotifications({ onSessionSelect: navigation.handleSessionSelect });

  // Event handlers
  const handleSessionCreated = (session?: Session) => {
    triggerRefresh();
    if (session) {
      navigation.setSessionForInteractive(session);
    }
  };

  const handleNewSession = () => {
    setShowNewSessionModal(true);
  };

  const handleSessionUpdated = () => {
    triggerRefresh();
  };

  const handleMergeCompleted = () => {
    navigation.handleBackToList();
    triggerRefresh();
  };

  const handleBatchCreated = () => {
    triggerRefresh();
  };

  const handleBenchmarkStart = async (options: any) => {
    try {
      const result = await window.electronAPI.benchmarks.start(options);
      if (result.success) {
        console.log('Benchmark started:', result);
        triggerRefresh();
      } else {
        console.error('Failed to start benchmark:', result.error);
      }
    } catch (error) {
      console.error('Error starting benchmark:', error);
    }
  };

  const handleBenchmarkCreated = () => {
    triggerRefresh();
  };

  return (
    <div className="min-h-screen bg-gruvbox-dark0">
      <BackgroundBatchBanner />
      <BackgroundBenchmarkBanner />
      <div className={`container mx-auto py-8 px-4 max-w-6xl ${
        hasBatchRunning && hasBenchmarkRunning ? 'pt-20' : 
        (hasBatchRunning || hasBenchmarkRunning) ? 'pt-12' : ''
      }`}>
        <AppHeader 
          onSettingsClick={() => setShowNotificationSettings(true)}
          onAmpSettingsClick={() => setShowAmpSettings(true)}
        />

        {/* Auth Status */}
        <div className="mb-6">
          <AuthStatus />
        </div>

        <MainTabs 
          currentView={navigation.currentView} 
          onViewChange={navigation.setCurrentView}
        />

        <MainContent
          currentView={navigation.currentView}
          selectedSession={navigation.selectedSession}
          selectedBatchRun={navigation.selectedBatchRun}
          selectedBenchmarkRun={navigation.selectedBenchmarkRun}
          newInteractiveSessionId={navigation.newInteractiveSessionId}
          refreshKey={refreshKey}
          onSessionSelect={navigation.handleSessionSelect}
          onNewSession={handleNewSession}
          onBackToList={navigation.handleBackToList}
          onSessionUpdated={handleSessionUpdated}
          onMergeCompleted={handleMergeCompleted}
          onBatchRunSelect={navigation.handleBatchRunSelect}
          onNewBatch={() => setShowNewBatchModal(true)}
          onBackToBatches={navigation.handleBackToBatches}
          onBenchmarkRunSelect={navigation.handleBenchmarkRunSelect}
          onNewBenchmark={() => setShowNewBenchmarkModal(true)}
          onBackToBenchmarks={navigation.handleBackToBenchmarks}
        />

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
          onStart={handleBenchmarkStart}
        />

        <NotificationSettingsModal
          isOpen={showNotificationSettings}
          onClose={() => setShowNotificationSettings(false)}
        />

        <AmpSettingsModal
          isOpen={showAmpSettings}
          onClose={() => setShowAmpSettings(false)}
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

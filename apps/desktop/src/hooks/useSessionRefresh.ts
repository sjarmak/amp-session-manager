import { useState, useEffect, useCallback } from 'react';
import type { Session } from '@ampsm/types';

interface UseSessionRefreshProps {
  selectedSession: Session | null;
  onSessionUpdate: (session: Session) => void;
}

export function useSessionRefresh({ selectedSession, onSessionUpdate }: UseSessionRefreshProps) {
  const [refreshKey, setRefreshKey] = useState(0);

  // Reload selected session when refreshKey changes
  useEffect(() => {
    if (selectedSession && refreshKey > 0) {
      window.electronAPI.sessions.get(selectedSession.id)
        .then(updatedSession => {
          if (updatedSession) {
            onSessionUpdate(updatedSession);
          }
        })
        .catch(error => {
          console.error('Failed to reload session:', error);
        });
    }
  }, [refreshKey, selectedSession?.id, onSessionUpdate]);

  const triggerRefresh = useCallback(() => {
    setRefreshKey(prev => prev + 1);
  }, []);

  return {
    refreshKey,
    triggerRefresh,
  };
}

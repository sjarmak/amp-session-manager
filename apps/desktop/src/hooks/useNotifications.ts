import { useEffect } from 'react';
import type { Session } from '@ampsm/types';

interface UseNotificationsProps {
  onSessionSelect: (session: Session) => void;
}

export function useNotifications({ onSessionSelect }: UseNotificationsProps) {
  // Handle notification actions
  useEffect(() => {
    const handleNotificationAction = async (action: string) => {
      const [type, sessionName] = action.split(':');
      
      switch (type) {
        case 'view':
        case 'conflicts':
        case 'tests':
          // Find session by name and navigate to it
          try {
            const sessions = await window.electronAPI.sessions.list();
            const session = sessions.find(s => s.name === sessionName);
            if (session) {
              onSessionSelect(session);
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
  }, [onSessionSelect]);
}

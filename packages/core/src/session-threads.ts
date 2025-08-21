import type { Session } from '@ampsm/types';

// Simple utility for getting thread URL for a session
export function getSessionThreadUrl(session: Session): string | null {
  if (!session.threadId) {
    return null;
  }
  return `https://ampcode.com/threads/${session.threadId}`;
}

// Get thread info for a session
export function getSessionThreadInfo(session: Session) {
  if (!session.threadId) {
    return null;
  }

  return {
    id: session.threadId,
    url: `https://ampcode.com/threads/${session.threadId}`,
    sessionId: session.id,
    sessionName: session.name,
    createdAt: session.createdAt,
    lastRun: session.lastRun
  };
}

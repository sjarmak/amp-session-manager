import { StreamMessage } from '@/types/api';

export class SSEClient {
  private eventSource: EventSource | null = null;
  private baseUrl: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  constructor(baseUrl: string = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000') {
    this.baseUrl = baseUrl;
  }

  connect(threadId: string, onMessage: (message: StreamMessage) => void, onError?: (error: Event) => void) {
    if (this.eventSource) {
      this.disconnect();
    }

    const url = `${this.baseUrl}/api/v1/streams/threads/${threadId}/logs`;
    this.eventSource = new EventSource(url);

    this.eventSource.onmessage = (event) => {
      try {
        const message: StreamMessage = JSON.parse(event.data);
        onMessage(message);
        this.reconnectAttempts = 0; // Reset on successful message
      } catch (error) {
        console.error('Failed to parse SSE message:', error);
      }
    };

    this.eventSource.onerror = (event) => {
      console.error('SSE connection error:', event);
      
      if (onError) {
        onError(event);
      }

      // Attempt reconnection with exponential backoff
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
        
        setTimeout(() => {
          console.log(`Attempting SSE reconnection #${this.reconnectAttempts}`);
          this.connect(threadId, onMessage, onError);
        }, delay);
      }
    };

    this.eventSource.onopen = () => {
      console.log('SSE connection established');
      this.reconnectAttempts = 0;
    };

    return this.eventSource;
  }

  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.reconnectAttempts = 0;
  }

  isConnected(): boolean {
    return this.eventSource?.readyState === EventSource.OPEN;
  }

  getReadyState(): number | undefined {
    return this.eventSource?.readyState;
  }
}

// Hook for React components
export function useSSE(threadId: string | null, onMessage: (message: StreamMessage) => void) {
  const sseClient = new SSEClient();

  const connect = () => {
    if (!threadId) return;
    
    return sseClient.connect(threadId, onMessage, (error) => {
      console.error('SSE error in hook:', error);
    });
  };

  const disconnect = () => {
    sseClient.disconnect();
  };

  return {
    connect,
    disconnect,
    isConnected: () => sseClient.isConnected(),
    client: sseClient,
  };
}

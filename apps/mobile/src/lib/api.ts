import { 
  Session, 
  Thread, 
  ThreadMessage, 
  Repository, 
  Config, 
  ApiResponse,
  SessionDiff,
  CreateSessionRequest,
  IterateSessionRequest,
  CreateThreadMessageRequest
} from '@/types/api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const defaultOptions: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(url, defaultOptions);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      return { data, success: true };
    } catch (error) {
      console.error(`API request failed: ${endpoint}`, error);
      return {
        data: null as any,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // Health check
  async health() {
    return this.request<{ status: string; timestamp: string }>('/health');
  }

  // Sessions
  async getSessions() {
    return this.request<Session[]>('/api/v1/sessions');
  }

  async getSession(id: string) {
    return this.request<Session>(`/api/v1/sessions/${id}`);
  }

  async createSession(data: CreateSessionRequest) {
    return this.request<Session>('/api/v1/sessions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async iterateSession(id: string, data: IterateSessionRequest) {
    return this.request<{ threadId: string }>(`/api/v1/sessions/${id}/iterate`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async abortSession(id: string) {
    return this.request<{ success: boolean }>(`/api/v1/sessions/${id}/abort`, {
      method: 'POST',
    });
  }

  async mergeSession(id: string) {
    return this.request<{ success: boolean }>(`/api/v1/sessions/${id}/merge`, {
      method: 'POST',
    });
  }

  async getSessionDiff(id: string, format: 'text' | 'html' = 'text') {
    return this.request<SessionDiff>(`/api/v1/sessions/${id}/diff?format=${format}`);
  }

  // Threads
  async getThreads(limit?: number) {
    const query = limit ? `?limit=${limit}` : '';
    return this.request<Thread[]>(`/api/v1/threads${query}`);
  }

  async getThreadMessages(id: string) {
    return this.request<ThreadMessage[]>(`/api/v1/threads/${id}/messages`);
  }

  async addThreadMessage(id: string, data: CreateThreadMessageRequest) {
    return this.request<ThreadMessage>(`/api/v1/threads/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Repositories
  async getRepositories() {
    return this.request<Repository[]>('/api/v1/repos');
  }

  async scanRepositories(roots: string[]) {
    return this.request<{ scanned: number; indexed: number }>('/api/v1/repos/scan', {
      method: 'POST',
      body: JSON.stringify({ roots }),
    });
  }

  async cloneRepository(url: string, path?: string) {
    return this.request<Repository>('/api/v1/repos/clone', {
      method: 'POST',
      body: JSON.stringify({ url, path }),
    });
  }

  // Configurations
  async getConfigs() {
    return this.request<Config[]>('/api/v1/configs');
  }
}

export const api = new ApiClient();

import type { ThreadStore, NormalizedThread, ThreadMessage } from '@ampsm/types';

export class ThreadStoreService {
  private store: ThreadStore;

  constructor(store: ThreadStore) {
    this.store = store;
  }

  async getThreads(options: { limit?: number } = {}): Promise<NormalizedThread[]> {
    return this.store.getAllThreads(options.limit);
  }

  async getThread(id: string): Promise<NormalizedThread | null> {
    return this.store.getFullThread(id);
  }

  async getThreadMessages(id: string): Promise<ThreadMessage[]> {
    const thread = await this.getThread(id);
    return thread?.messages || [];
  }

  async addThreadMessage(threadId: string, message: Omit<ThreadMessage, 'id' | 'thread_id'>): Promise<void> {
    const newMessage: ThreadMessage = {
      ...message,
      id: this.generateMessageId(),
      thread_id: threadId
    };

    await this.store.upsertMessage(newMessage);
  }

  async searchThreads(query: string, limit = 10): Promise<Array<{
    id: string;
    url: string;
    repo: string | null;
    branch: string | null;
    updated_at: string;
    message_count: number;
    tool_call_count: number;
    diff_count: number;
  }>> {
    return this.store.searchThreads(query, limit);
  }

  async getRecentThreads(hours = 24, limit = 20): Promise<NormalizedThread[]> {
    return this.store.getRecentThreads(hours, limit);
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

import type { NormalizedThread } from '@ampsm/types';

export interface WebFetcherConfig {
  sessionCookie: string;
}

export class ThreadWebFetcher {
  private sessionCookie: string;

  constructor(sessionCookie: string) {
    this.sessionCookie = sessionCookie;
  }

  async fetchThread(threadId: string): Promise<NormalizedThread> {
    const response = await fetch(`https://ampcode.com/threads/${threadId}`, {
      method: 'GET',
      headers: {
        'Cookie': this.sessionCookie,
        'Accept': 'application/json',
        'User-Agent': 'amp-session-manager/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch thread ${threadId}: ${response.status} ${response.statusText}`);
    }

    const threadData = await response.json();
    return this.normalizeThread(threadData);
  }

  private normalizeThread(data: any): NormalizedThread {
    // Flatten tool calls and diffs from messages
    const toolCalls = [];
    const diffs = [];
    const messages = [];
    const metrics = [];

    // Process messages and extract nested data
    if (data.messages && Array.isArray(data.messages)) {
      for (const msg of data.messages) {
        messages.push({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp
        });

        // Extract tool calls
        if (msg.toolCalls && Array.isArray(msg.toolCalls)) {
          for (const toolCall of msg.toolCalls) {
            toolCalls.push({
              id: toolCall.id,
              messageId: msg.id,
              toolName: toolCall.toolName,
              parameters: toolCall.parameters,
              result: toolCall.result,
              timestamp: toolCall.timestamp,
              durationMs: toolCall.durationMs
            });
          }
        }

        // Extract diffs
        if (msg.diffs && Array.isArray(msg.diffs)) {
          for (const diff of msg.diffs) {
            diffs.push({
              id: diff.id,
              messageId: msg.id,
              filePath: diff.filePath,
              oldContent: diff.oldContent,
              newContent: diff.newContent,
              operation: diff.operation,
              timestamp: diff.timestamp
            });
          }
        }
      }
    }

    // Extract global metrics
    if (data.metrics) {
      metrics.push({
        id: 'metric-1',
        messageId: undefined,
        model: data.metrics.model,
        promptTokens: data.metrics.promptTokens,
        completionTokens: data.metrics.completionTokens,
        totalTokens: data.metrics.totalTokens,
        durationMs: data.metrics.durationMs,
        timestamp: data.lastUpdatedAt
      });
    }

    return {
      id: data.id,
      title: data.title,
      createdAt: data.createdAt,
      lastUpdatedAt: data.lastUpdatedAt,
      messageCount: messages.length,
      totalTokens: data.metrics?.totalTokens || 0,
      modelUsed: data.metrics?.model || 'unknown',
      status: 'active',
      messages,
      toolCalls,
      diffs,
      metrics
    };
  }
}

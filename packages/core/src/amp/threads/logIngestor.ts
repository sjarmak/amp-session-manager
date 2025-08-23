import type { ThreadToolCall as DatabaseThreadToolCall, ThreadMetric as DatabaseThreadMetric, ThreadDiff as DatabaseThreadDiff } from '@ampsm/types';

export interface LogIngestorOptions {
  includeMetrics?: boolean;
  includeDiffs?: boolean;
}

// Legacy interfaces for backward compatibility with tests
export interface ThreadToolCall {
  id: string;
  messageId?: string | null;
  toolName: string;
  parameters: any;
  result?: any;
  timestamp?: string;
  durationMs?: number;
}

export interface ThreadMetric {
  id: string | number;
  messageId?: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  durationMs?: number;
  timestamp: string;
}

export interface ThreadDiff {
  id: string;
  messageId?: string;
  filePath: string;
  oldContent?: string;
  newContent?: string;
  operation?: string;
  timestamp: string;
}

export interface LogIngestResult {
  threadId: string;
  toolCalls: ThreadToolCall[];
  metrics: ThreadMetric[];
  diffs: ThreadDiff[];
}

export class LogIngestor {
  constructor() {}

  async ingestLogs(logData: string, threadId?: string): Promise<LogIngestResult> {
    const result: LogIngestResult = {
      threadId: threadId || '',
      toolCalls: [],
      metrics: [],
      diffs: []
    };

    if (!logData.trim()) {
      return result;
    }

    const lines = logData.split('\n');
    const pendingToolCalls = new Map<string, Partial<ThreadToolCall>>();

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const event = JSON.parse(line);
        
        if (event.level !== 'debug') continue;

        // Update threadId from log if not provided
        if (!result.threadId && event.threadId) {
          result.threadId = event.threadId;
        }

        // Process tool calls
        if (event.message && event.message.startsWith('Tool call') && event.toolName) {
          const toolCall = this.processToolCall(event);
          if (toolCall) {
            pendingToolCalls.set(event.toolName, toolCall);
          }
        }

        // Process tool results
        if (event.message === 'Tool result' && event.toolName && event.result) {
          const pending = pendingToolCalls.get(event.toolName);
          if (pending) {
            pending.result = event.result;
            result.toolCalls.push({
              id: `tool-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              messageId: event.messageId,
              ...pending
            } as ThreadToolCall);
            pendingToolCalls.delete(event.toolName);
          }
        }

        // Process metrics
        if (event.message === 'Model completion' && (event.totalTokens || event.model)) {
          result.metrics.push(this.processMetric(event, result.threadId));
        }

        // Process diffs
        if (event.message === 'Diff generated' && event.filePath) {
          result.diffs.push(this.processDiff(event, result.threadId));
        }
      } catch (error) {
        // Skip invalid JSON lines
        continue;
      }
    }

    return result;
  }

  private processToolCall(event: any): Partial<ThreadToolCall> | null {
    if (!event.toolName) return null;

    return {
      toolName: event.toolName,
      parameters: event.parameters || {},
      timestamp: event.timestamp,
      durationMs: event.durationMs,
      messageId: event.messageId
    };
  }

  private processMetric(event: any, threadId: string): ThreadMetric {
    return {
      id: `metric-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      messageId: event.messageId,
      model: event.model || 'unknown',
      promptTokens: event.promptTokens,
      completionTokens: event.completionTokens,
      totalTokens: event.totalTokens,
      durationMs: event.durationMs,
      timestamp: event.timestamp
    };
  }

  private processDiff(event: any, threadId: string): ThreadDiff {
    return {
      id: `diff-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      messageId: event.messageId,
      filePath: event.filePath,
      oldContent: event.oldContent || '',
      newContent: event.newContent || '',
      operation: event.operation || 'unknown',
      timestamp: event.timestamp
    };
  }

  async ingestDebugLog(debugData: string, threadId?: string): Promise<LogIngestResult> {
    return this.ingestLogs(debugData, threadId);
  }

  async ingestFromFile(filePath: string, threadId?: string): Promise<LogIngestResult> {
    const fs = await import('fs/promises');
    const debugData = await fs.readFile(filePath, 'utf-8');
    return this.ingestLogs(debugData, threadId);
  }

  async ingestFromStdin(threadId?: string): Promise<LogIngestResult> {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    const debugData = Buffer.concat(chunks).toString('utf-8');
    return this.ingestLogs(debugData, threadId);
  }
}

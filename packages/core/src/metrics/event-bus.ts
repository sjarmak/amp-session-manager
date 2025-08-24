import { EventEmitter } from 'events';
import { Logger } from '../utils/logger';

export interface MetricEvent {
  type: string;
  sessionId: string;
  iterationId?: string;
  timestamp: string;
  data: Record<string, any>;
}

export interface IterationStartEvent extends MetricEvent {
  type: 'iteration_start';
  data: {
    iterationNumber: number;
    gitSha: string;
  };
}

export interface IterationEndEvent extends MetricEvent {
  type: 'iteration_end';
  data: {
    iterationNumber: number;
    status: 'success' | 'failed' | 'awaiting-input';
    durationMs: number;
    exitCode?: number;
  };
}

export interface GitOperationEvent extends MetricEvent {
  type: 'git_operation';
  data: {
    operation: 'commit' | 'merge' | 'rebase' | 'checkout';
    shaBefore?: string;
    shaAfter?: string;
    filesChanged: number;
    insertions: number;
    deletions: number;
    conflicted: boolean;
    durationMs: number;
  };
}

export interface ToolCallEvent extends MetricEvent {
  type: 'tool_call';
  data: {
    toolName: string;
    args: Record<string, any>;
    startTime: string;
    endTime: string;
    durationMs: number;
    success: boolean;
    errorMessage?: string;
    costUsd?: number;
  };
}

export interface LLMUsageEvent extends MetricEvent {
  type: 'llm_usage';
  data: {
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    costUsd: number;
    latencyMs: number;
    temperature?: number;
    topP?: number;
  };
}

export interface StreamingTokenUsageEvent extends MetricEvent {
  type: 'streaming_token_usage';
  data: {
    model: string;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    costUsd?: number;
    isIncremental: boolean;
  };
}

export interface StreamingToolStartEvent extends MetricEvent {
  type: 'streaming_tool_start';
  data: {
    toolName: string;
    args: Record<string, any>;
  };
}

export interface StreamingToolFinishEvent extends MetricEvent {
  type: 'streaming_tool_finish';
  data: {
    toolName: string;
    durationMs?: number;
    success: boolean;
  };
}

export interface TestResultEvent extends MetricEvent {
  type: 'test_result';
  data: {
    framework: string;
    command: string;
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    coveragePercent?: number;
    durationMs: number;
    exitCode: number;
  };
}

export interface FileEditEvent extends MetricEvent {
  type: 'file_edit';
  data: {
    path: string;
    linesAdded: number;
    linesDeleted: number;
    diff?: string; // unified diff, truncated to reasonable size
    operation: 'create' | 'modify' | 'delete';
  };
}

export interface UserMessageEvent extends MetricEvent {
  type: 'user_message';
  data: {
    message: string;
    messageId?: string;
    threadId?: string;
    attachedFiles?: string[];
    userState?: Record<string, any>;
  };
}

export type MetricEventTypes = 
  | IterationStartEvent
  | IterationEndEvent
  | GitOperationEvent
  | ToolCallEvent
  | LLMUsageEvent
  | StreamingTokenUsageEvent
  | StreamingToolStartEvent
  | StreamingToolFinishEvent
  | TestResultEvent
  | FileEditEvent
  | UserMessageEvent;

export interface MetricsSink {
  name: string;
  handle(event: MetricEventTypes): Promise<void>;
  flush?(): Promise<void>;
  close?(): Promise<void>;
}

export class MetricsEventBus extends EventEmitter {
  private sinks: MetricsSink[] = [];
  private logger: Logger;

  constructor(logger: Logger) {
    super();
    this.logger = logger;
    this.setMaxListeners(20); // Allow multiple sinks
  }

  addSink(sink: MetricsSink): void {
    this.sinks.push(sink);
    this.logger.debug(`Added metrics sink: ${sink.name}`);
  }

  removeSink(sinkName: string): boolean {
    const index = this.sinks.findIndex(sink => sink.name === sinkName);
    if (index !== -1) {
      this.sinks.splice(index, 1);
      this.logger.debug(`Removed metrics sink: ${sinkName}`);
      return true;
    }
    return false;
  }

  async publish(event: MetricEventTypes): Promise<void> {
    this.emit('metric', event);
    
    // Ensure timestamp is set
    if (!event.timestamp) {
      event.timestamp = new Date().toISOString();
    }

    // Send to all sinks in parallel
    const promises = this.sinks.map(async (sink) => {
      try {
        await sink.handle(event);
      } catch (error) {
        this.logger.error(`Error in metrics sink ${sink.name}:`, error);
      }
    });

    await Promise.allSettled(promises);
  }

  async flush(): Promise<void> {
    const promises = this.sinks
      .filter(sink => sink.flush)
      .map(sink => sink.flush!());
    
    await Promise.allSettled(promises);
  }

  async close(): Promise<void> {
    await this.flush();
    
    const promises = this.sinks
      .filter(sink => sink.close)
      .map(sink => sink.close!());
    
    await Promise.allSettled(promises);
    this.sinks.length = 0;
  }

  // Helper methods for publishing specific event types
  async publishIterationStart(sessionId: string, iterationId: string, iterationNumber: number, gitSha: string): Promise<void> {
    await this.publish({
      type: 'iteration_start',
      sessionId,
      iterationId,
      timestamp: new Date().toISOString(),
      data: {
        iterationNumber,
        gitSha
      }
    });
  }

  async publishIterationEnd(
    sessionId: string, 
    iterationId: string, 
    iterationNumber: number, 
    status: 'success' | 'failed' | 'awaiting-input',
    durationMs: number,
    exitCode?: number
  ): Promise<void> {
    await this.publish({
      type: 'iteration_end',
      sessionId,
      iterationId,
      timestamp: new Date().toISOString(),
      data: {
        iterationNumber,
        status,
        durationMs,
        exitCode
      }
    });
  }

  async publishGitOperation(
    sessionId: string,
    iterationId: string,
    operation: 'commit' | 'merge' | 'rebase' | 'checkout',
    details: {
      shaBefore?: string;
      shaAfter?: string;
      filesChanged: number;
      insertions: number;
      deletions: number;
      conflicted: boolean;
      durationMs: number;
    }
  ): Promise<void> {
    await this.publish({
      type: 'git_operation',
      sessionId,
      iterationId,
      timestamp: new Date().toISOString(),
      data: {
        operation,
        ...details
      }
    });
  }

  async publishToolCall(
    sessionId: string,
    iterationId: string,
    toolName: string,
    args: Record<string, any>,
    result: {
      startTime: string;
      endTime: string;
      durationMs: number;
      success: boolean;
      errorMessage?: string;
      costUsd?: number;
    }
  ): Promise<void> {
    await this.publish({
      type: 'tool_call',
      sessionId,
      iterationId,
      timestamp: new Date().toISOString(),
      data: {
        toolName,
        args,
        ...result
      }
    });
  }

  async publishLLMUsage(
    sessionId: string,
    iterationId: string,
    model: string,
    usage: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      costUsd: number;
      latencyMs: number;
      temperature?: number;
      topP?: number;
    }
  ): Promise<void> {
    await this.publish({
      type: 'llm_usage',
      sessionId,
      iterationId,
      timestamp: new Date().toISOString(),
      data: {
        model,
        ...usage
      }
    });
  }

  async publishTestResult(
    sessionId: string,
    iterationId: string,
    framework: string,
    command: string,
    result: {
      total: number;
      passed: number;
      failed: number;
      skipped: number;
      coveragePercent?: number;
      durationMs: number;
      exitCode: number;
    }
  ): Promise<void> {
    await this.publish({
      type: 'test_result',
      sessionId,
      iterationId,
      timestamp: new Date().toISOString(),
      data: {
        framework,
        command,
        ...result
      }
    });
  }

  async publishFileEdit(
    sessionId: string,
    iterationId: string,
    path: string,
    details: {
      linesAdded: number;
      linesDeleted: number;
      diff?: string;
      operation: 'create' | 'modify' | 'delete';
    }
  ): Promise<void> {
    await this.publish({
      type: 'file_edit',
      sessionId,
      iterationId,
      timestamp: new Date().toISOString(),
      data: {
        path,
        ...details
      }
    });
  }

  async publishUserMessage(
    sessionId: string,
    iterationId: string,
    message: string,
    details?: {
      messageId?: string;
      threadId?: string;
      attachedFiles?: string[];
      userState?: Record<string, any>;
    }
  ): Promise<void> {
    await this.publish({
      type: 'user_message',
      sessionId,
      iterationId,
      timestamp: new Date().toISOString(),
      data: {
        message,
        ...details
      }
    });
  }

  // Streaming event methods
  async publishStreamingTokenUsage(
    sessionId: string,
    iterationId: string,
    model: string,
    tokens: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
      costUsd?: number;
    },
    isIncremental = true
  ): Promise<void> {
    await this.publish({
      type: 'streaming_token_usage',
      sessionId,
      iterationId,
      timestamp: new Date().toISOString(),
      data: {
        model,
        ...tokens,
        isIncremental
      }
    });
  }

  async publishStreamingToolStart(
    sessionId: string,
    iterationId: string,
    toolName: string,
    args: Record<string, any>
  ): Promise<void> {
    await this.publish({
      type: 'streaming_tool_start',
      sessionId,
      iterationId,
      timestamp: new Date().toISOString(),
      data: {
        toolName,
        args
      }
    });
  }

  async publishStreamingToolFinish(
    sessionId: string,
    iterationId: string,
    toolName: string,
    durationMs?: number,
    success = true
  ): Promise<void> {
    await this.publish({
      type: 'streaming_tool_finish',
      sessionId,
      iterationId,
      timestamp: new Date().toISOString(),
      data: {
        toolName,
        durationMs,
        success
      }
    });
  }

  // Connect to AmpAdapter streaming events
  connectToAmpAdapter(ampAdapter: any, sessionId: string, iterationId: string): () => void {
    const handleStreamingEvent = async (streamingEvent: any) => {
      try {
        const { type, data } = streamingEvent;
        
        switch (type) {
          case 'token_usage':
            if (data.tokens && data.model) {
              await this.publishStreamingTokenUsage(
                sessionId,
                iterationId,
                data.model,
                {
                  promptTokens: data.tokens.prompt,
                  completionTokens: data.tokens.completion,
                  totalTokens: data.tokens.total
                }
              );
            }
            break;
            
          case 'tool_start':
            if (data.tool) {
              await this.publishStreamingToolStart(
                sessionId,
                iterationId,
                data.tool,
                data.args || {}
              );
            }
            break;
            
          case 'tool_finish':
            if (data.tool) {
              await this.publishStreamingToolFinish(
                sessionId,
                iterationId,
                data.tool,
                data.duration,
                data.success
              );
            }
            break;
        }
      } catch (error) {
        this.logger.error('Error handling streaming event:', error);
      }
    };

    // Listen to streaming events
    ampAdapter.on('streaming-event', handleStreamingEvent);

    // Return cleanup function
    return () => {
      ampAdapter.removeListener('streaming-event', handleStreamingEvent);
    };
  }
}

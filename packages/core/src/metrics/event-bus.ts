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

export type MetricEventTypes = 
  | IterationStartEvent
  | IterationEndEvent
  | GitOperationEvent
  | ToolCallEvent
  | LLMUsageEvent
  | TestResultEvent;

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
}

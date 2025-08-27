import fs from 'fs';
import path from 'path';
import { MetricsSink, MetricEventTypes } from '../event-bus';
import { Logger } from '../../utils/logger';

export class NDJSONMetricsSink implements MetricsSink {
  name = 'ndjson';
  private writeStream: fs.WriteStream;
  private logger: Logger;
  private pendingWrites: Promise<void>[] = [];
  private realtimeBuffer: string[] = [];
  private flushInterval?: NodeJS.Timeout;
  private streamingAggregates: Map<string, any> = new Map();

  constructor(filePath: string, logger: Logger, options: {
    enableRealtimeBuffering?: boolean;
    bufferFlushIntervalMs?: number;
    enableStreaming?: boolean;
  } = {}) {
    this.logger = logger;
    
    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.writeStream = fs.createWriteStream(filePath, { flags: 'a' });
    
    this.writeStream.on('error', (error) => {
      this.logger.error('NDJSON sink write error:', error);
    });

    // Setup real-time buffering for streaming events
    if (options.enableRealtimeBuffering) {
      this.setupRealtimeBuffering(options.bufferFlushIntervalMs || 1000);
    }

    this.logger.debug(`NDJSON metrics sink writing to: ${filePath}`);
  }

  private setupRealtimeBuffering(flushIntervalMs: number) {
    this.flushInterval = setInterval(() => {
      if (this.realtimeBuffer.length > 0) {
        this.flushRealtimeBuffer();
      }
    }, flushIntervalMs);
  }

  async handle(event: MetricEventTypes): Promise<void> {
    // Handle streaming events with special processing
    if (this.isStreamingEvent(event)) {
      this.processStreamingEvent(event);
    }

    const line = JSON.stringify(event) + '\n';
    
    // For high-frequency events, use buffering
    if (this.isHighFrequencyEvent(event) && this.realtimeBuffer) {
      this.realtimeBuffer.push(line);
      return;
    }
    
    const writePromise = new Promise<void>((resolve, reject) => {
      this.writeStream.write(line, (error: any) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });

    this.pendingWrites.push(writePromise);
    
    // Clean up completed writes
    this.pendingWrites = this.pendingWrites.filter(promise => {
      return promise.catch(() => false); // Keep pending promises
    });

    await writePromise;
  }

  private isStreamingEvent(event: MetricEventTypes): boolean {
    return event.type.startsWith('streaming_');
  }

  private isHighFrequencyEvent(event: MetricEventTypes): boolean {
    return ['streaming_token_usage', 'streaming_tool_start', 'streaming_tool_finish'].includes(event.type);
  }

  private processStreamingEvent(event: MetricEventTypes): void {
    const key = `${event.sessionId}_${event.iterationId}`;
    
    switch (event.type) {
      case 'streaming_token_usage':
        this.aggregateTokenUsage(key, event);
        break;
      case 'streaming_tool_start':
        this.trackToolStart(key, event);
        break;
      case 'streaming_tool_finish':
        this.trackToolFinish(key, event);
        break;
    }
  }

  private aggregateTokenUsage(key: string, event: any): void {
    if (!this.streamingAggregates.has(key)) {
      this.streamingAggregates.set(key, {
        sessionId: event.sessionId,
        iterationId: event.iterationId,
        totalTokens: 0,
        promptTokens: 0,
        completionTokens: 0,

        lastUpdate: event.timestamp
      });
    }

    const aggregate = this.streamingAggregates.get(key)!;
    const data = event.data;
    
    if (data.totalTokens) aggregate.totalTokens += data.totalTokens;
    if (data.promptTokens) aggregate.promptTokens += data.promptTokens;
    if (data.completionTokens) aggregate.completionTokens += data.completionTokens;

    aggregate.lastUpdate = event.timestamp;
  }

  private trackToolStart(key: string, event: any): void {
    if (!this.streamingAggregates.has(key)) {
      this.streamingAggregates.set(key, {
        sessionId: event.sessionId,
        iterationId: event.iterationId,
        activeTools: new Map(),
        completedTools: []
      });
    }

    const aggregate = this.streamingAggregates.get(key)!;
    if (!aggregate.activeTools) aggregate.activeTools = new Map();
    
    aggregate.activeTools.set(event.data.toolName, {
      startTime: event.timestamp,
      args: event.data.args
    });
  }

  private trackToolFinish(key: string, event: any): void {
    const aggregate = this.streamingAggregates.get(key);
    if (!aggregate || !aggregate.activeTools) return;

    const toolStart = aggregate.activeTools.get(event.data.toolName);
    if (toolStart) {
      if (!aggregate.completedTools) aggregate.completedTools = [];
      
      aggregate.completedTools.push({
        toolName: event.data.toolName,
        startTime: toolStart.startTime,
        endTime: event.timestamp,
        durationMs: event.data.durationMs,
        success: event.data.success,
        args: toolStart.args
      });
      
      aggregate.activeTools.delete(event.data.toolName);
    }
  }

  private async flushRealtimeBuffer(): Promise<void> {
    if (this.realtimeBuffer.length === 0) return;

    const bufferedData = this.realtimeBuffer.join('');
    this.realtimeBuffer.length = 0;

    const writePromise = new Promise<void>((resolve, reject) => {
      this.writeStream.write(bufferedData, (error: any) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });

    this.pendingWrites.push(writePromise);
    await writePromise;
  }

  async flush(): Promise<void> {
    // Flush realtime buffer first
    if (this.realtimeBuffer.length > 0) {
      await this.flushRealtimeBuffer();
    }
    
    // Wait for all pending writes to complete
    await Promise.allSettled(this.pendingWrites);
    
    return new Promise<void>((resolve, reject) => {
      this.writeStream.once('drain', resolve);
      this.writeStream.once('error', reject);
      
      // If the stream is already drained, resolve immediately
      if (this.writeStream.writableNeedDrain === false) {
        resolve();
      }
    });
  }

  async close(): Promise<void> {
    // Clear flush interval
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = undefined;
    }
    
    await this.flush();
    
    return new Promise<void>((resolve, reject) => {
      this.writeStream.end((error: any) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  // Get streaming aggregates for real-time metrics
  getStreamingAggregates(): Map<string, any> {
    return this.streamingAggregates;
  }

  // Get real-time session metrics  
  getRealtimeSessionMetrics(sessionId: string, iterationId?: string): {
    tokenUsage: any;
    activeTools: string[];
    completedTools: any[];
  } | null {
    const key = iterationId ? `${sessionId}_${iterationId}` : sessionId;
    const aggregate = this.streamingAggregates.get(key);
    
    if (!aggregate) return null;

    return {
      tokenUsage: {
        totalTokens: aggregate.totalTokens || 0,
        promptTokens: aggregate.promptTokens || 0,
        completionTokens: aggregate.completionTokens || 0,

        lastUpdate: aggregate.lastUpdate
      },
      activeTools: Array.from(aggregate.activeTools?.keys() || []),
      completedTools: aggregate.completedTools || []
    };
  }

  // Utility methods for reading back NDJSON data
  static async readEvents(filePath: string): Promise<MetricEventTypes[]> {
    if (!fs.existsSync(filePath)) {
      return [];
    }

    const content = await fs.promises.readFile(filePath, 'utf8');
    const lines = content.trim().split('\n').filter(line => line.length > 0);
    
    return lines.map(line => {
      try {
        return JSON.parse(line) as MetricEventTypes;
      } catch (error) {
        console.warn(`Failed to parse NDJSON line: ${line}`, error);
        return null;
      }
    }).filter((event): event is MetricEventTypes => event !== null);
  }

  static async readEventsForSession(filePath: string, sessionId: string): Promise<MetricEventTypes[]> {
    const allEvents = await this.readEvents(filePath);
    return allEvents.filter(event => event.sessionId === sessionId);
  }

  static async readEventsInTimeRange(
    filePath: string, 
    startTime: string, 
    endTime: string
  ): Promise<MetricEventTypes[]> {
    const allEvents = await this.readEvents(filePath);
    return allEvents.filter(event => 
      event.timestamp >= startTime && event.timestamp <= endTime
    );
  }

  // Export to different formats
  static async exportToCSV(filePath: string, outputPath: string): Promise<void> {
    const events = await this.readEvents(filePath);
    
    if (events.length === 0) {
      await fs.promises.writeFile(outputPath, 'No events found\n');
      return;
    }

    // Flatten events for CSV export
    const csvHeaders = new Set<string>();
    const rows: Record<string, any>[] = [];

    for (const event of events) {
      const flatEvent: Record<string, any> = {
        type: event.type,
        sessionId: event.sessionId,
        iterationId: event.iterationId || '',
        timestamp: event.timestamp,
      };

      // Flatten the data object
      for (const [key, value] of Object.entries(event.data)) {
        const flatKey = `data_${key}`;
        flatEvent[flatKey] = typeof value === 'object' ? JSON.stringify(value) : value;
        csvHeaders.add(flatKey);
      }

      rows.push(flatEvent);
    }

    // Create CSV content
    const headers = ['type', 'sessionId', 'iterationId', 'timestamp', ...Array.from(csvHeaders).sort()];
    const csvContent = [
      headers.join(','),
      ...rows.map(row => 
        headers.map(header => {
          const value = row[header] || '';
          // Escape commas and quotes in CSV
          if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        }).join(',')
      )
    ].join('\n');

    await fs.promises.writeFile(outputPath, csvContent);
  }

  static async exportToJSON(filePath: string, outputPath: string): Promise<void> {
    const events = await this.readEvents(filePath);
    await fs.promises.writeFile(outputPath, JSON.stringify(events, null, 2));
  }

  // Analytics helpers
  static analyzeEvents(events: MetricEventTypes[]): {
    sessionSummaries: Record<string, any>;
    toolUsage: Record<string, any>;
    timelineStats: any[];
  } {
    const sessionSummaries: Record<string, any> = {};
    const toolUsage: Record<string, any> = {};
    const timelineStats: any[] = [];

    for (const event of events) {
      const sessionId = event.sessionId;
      
      if (!sessionSummaries[sessionId]) {
        sessionSummaries[sessionId] = {
          sessionId,
          totalEvents: 0,
          startTime: event.timestamp,
          endTime: event.timestamp,
          eventTypes: new Set(),
          totalCost: 0,
          totalTokens: 0,
        };
      }

      const summary = sessionSummaries[sessionId];
      summary.totalEvents++;
      summary.eventTypes.add(event.type);
      summary.endTime = event.timestamp;

      // Tool usage tracking
      if (event.type === 'tool_call') {
        const toolName = (event.data as any).toolName;
        if (!toolUsage[toolName]) {
          toolUsage[toolName] = {
            toolName,
            totalCalls: 0,
            totalDuration: 0,
            successCount: 0,
            failureCount: 0,
            totalCost: 0,
          };
        }
        
        const tool = toolUsage[toolName];
        tool.totalCalls++;
        tool.totalDuration += (event.data as any).durationMs || 0;
        if ((event.data as any).success) {
          tool.successCount++;
        } else {
          tool.failureCount++;
        }
        tool.totalCost += (event.data as any).costUsd || 0;
      }

      // Cost and token tracking
      if (event.type === 'llm_usage') {
        summary.totalCost += (event.data as any).costUsd || 0;
        summary.totalTokens += (event.data as any).totalTokens || 0;
      }

      // Timeline data
      timelineStats.push({
        timestamp: event.timestamp,
        sessionId: event.sessionId,
        type: event.type,
        durationMs: (event.data as any).durationMs || 0,
        cost: (event.data as any).costUsd || 0,
      });
    }

    // Convert sets to arrays for JSON serialization
    Object.values(sessionSummaries).forEach(summary => {
      summary.eventTypes = Array.from(summary.eventTypes);
    });

    return {
      sessionSummaries,
      toolUsage,
      timelineStats: timelineStats.sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    };
  }
}

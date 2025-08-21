import fs from 'fs';
import path from 'path';
import { MetricsSink, MetricEventTypes } from '../event-bus';
import { Logger } from '../../utils/logger';

export class NDJSONMetricsSink implements MetricsSink {
  name = 'ndjson';
  private writeStream: fs.WriteStream;
  private logger: Logger;
  private pendingWrites: Promise<void>[] = [];

  constructor(filePath: string, logger: Logger) {
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

    this.logger.debug(`NDJSON metrics sink writing to: ${filePath}`);
  }

  async handle(event: MetricEventTypes): Promise<void> {
    const line = JSON.stringify(event) + '\n';
    
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

  async flush(): Promise<void> {
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

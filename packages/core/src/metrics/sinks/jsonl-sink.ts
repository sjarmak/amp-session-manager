import { createWriteStream, WriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import { dirname } from 'path';
import { MetricsSink, MetricEventTypes } from '../event-bus';
import { Logger } from '../../utils/logger';

export interface JSONLSinkOptions {
  filePath: string;
  autoFlush?: boolean;
  truncateArgs?: boolean; // truncate large args to prevent bloated files
  maxDiffLines?: number; // max lines to include in diff
}

export class JSONLSink implements MetricsSink {
  public readonly name = 'jsonl';
  private stream: WriteStream | null = null;
  private logger: Logger;
  private options: JSONLSinkOptions;

  constructor(logger: Logger, options: JSONLSinkOptions) {
    this.logger = logger;
    this.options = {
      autoFlush: true,
      truncateArgs: true,
      maxDiffLines: 200,
      ...options
    };
  }

  async initialize(): Promise<void> {
    // Ensure directory exists
    await mkdir(dirname(this.options.filePath), { recursive: true });
    
    this.stream = createWriteStream(this.options.filePath, { 
      flags: 'a', // append mode
      encoding: 'utf8'
    });

    this.logger.debug(`JSONL metrics sink initialized: ${this.options.filePath}`);
  }

  async handle(event: MetricEventTypes): Promise<void> {
    if (!this.stream) {
      await this.initialize();
    }

    const processedEvent = this.preprocessEvent(event);
    const line = JSON.stringify(processedEvent) + '\n';
    
    return new Promise((resolve, reject) => {
      this.stream!.write(line, 'utf8', (error) => {
        if (error) {
          this.logger.error('Error writing to JSONL sink:', error);
          reject(error);
        } else {
          if (this.options.autoFlush) {
            this.stream!.uncork(); // flush immediately for crash safety
          }
          resolve();
        }
      });
    });
  }

  async flush(): Promise<void> {
    if (!this.stream) return;
    
    return new Promise((resolve) => {
      this.stream!.uncork();
      // Force sync to disk for reliability
      this.stream!.once('drain', resolve);
      if (!this.stream!.writableNeedDrain) {
        resolve();
      }
    });
  }

  async close(): Promise<void> {
    if (!this.stream) return;
    
    return new Promise((resolve) => {
      this.stream!.end(() => {
        this.stream = null;
        resolve();
      });
    });
  }

  private preprocessEvent(event: MetricEventTypes): MetricEventTypes {
    const processed = { ...event };
    
    // Truncate args for tool_call events to prevent huge payloads
    if (this.options.truncateArgs && event.type === 'tool_call') {
      const args = event.data.args;
      if (args) {
        const truncated = this.truncateObject(args, 2000); // 2KB limit
        processed.data = { ...event.data, args: truncated };
      }
    }

    // Truncate diff for file_edit events  
    if (event.type === 'file_edit' && event.data.diff) {
      const lines = event.data.diff.split('\n');
      if (lines.length > (this.options.maxDiffLines || 200)) {
        const truncated = lines.slice(0, this.options.maxDiffLines).join('\n') + 
          `\n... (truncated ${lines.length - (this.options.maxDiffLines || 200)} lines)`;
        processed.data = { ...event.data, diff: truncated };
      }
    }

    return processed;
  }

  private truncateObject(obj: any, maxSize: number): any {
    const str = JSON.stringify(obj);
    if (str.length <= maxSize) return obj;
    
    const truncated = str.substring(0, maxSize - 20) + '... [TRUNCATED]';
    try {
      return JSON.parse(truncated + '}');
    } catch {
      return { _truncated: true, _originalSize: str.length, _preview: truncated };
    }
  }
}

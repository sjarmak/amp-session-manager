import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { Logger } from '../utils/logger';
import { MetricsEventBus } from './event-bus';

export interface AmpWrapperOptions {
  ampPath?: string;
  sessionId: string;
  iterationId: string;
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
}

export interface AmpWrapperResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  startTime: string;
  endTime: string;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    model: string;
  };
  toolCalls: Array<{
    toolName: string;
    args: Record<string, any>;
    durationMs: number;
    success: boolean;
    errorMessage?: string;
  }>;
}

export class AmpWrapper extends EventEmitter {
  private logger: Logger;
  private eventBus: MetricsEventBus;
  private ampPath: string;

  constructor(logger: Logger, eventBus: MetricsEventBus, ampPath: string = 'amp') {
    super();
    this.logger = logger;
    this.eventBus = eventBus;
    this.ampPath = ampPath;
  }

  async execute(
    args: string[],
    options: AmpWrapperOptions
  ): Promise<AmpWrapperResult> {
    const startTime = new Date().toISOString();
    const startTimestamp = Date.now();

    this.logger.debug(`Executing amp with args: ${args.join(' ')}`);

    // Add debug flags to get more structured output
    const enhancedArgs = [
      ...args,
      '--log-level', 'debug'
    ];

    const result: AmpWrapperResult = {
      exitCode: 0,
      stdout: '',
      stderr: '',
      durationMs: 0,
      startTime,
      endTime: '',
      toolCalls: []
    };

    try {
      const childProcess = spawn(this.ampPath, enhancedArgs, {
        cwd: options.cwd || process.cwd(),
        env: { ...process.env, ...options.env },
        stdio: ['inherit', 'pipe', 'pipe']
      });

      // Set up timeout if specified
      let timeoutHandle: NodeJS.Timeout | null = null;
      if (options.timeout) {
        timeoutHandle = setTimeout(() => {
          childProcess.kill('SIGTERM');
          this.logger.warn(`Amp process timed out after ${options.timeout}ms`);
        }, options.timeout);
      }

      // Collect stdout and stderr
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      childProcess.stdout?.on('data', (chunk: Buffer) => {
        stdoutChunks.push(chunk);
        // Emit real-time output for monitoring
        this.emit('stdout', chunk.toString());
        this.parseOutput(chunk.toString(), options);
      });

      childProcess.stderr?.on('data', (chunk: Buffer) => {
        stderrChunks.push(chunk);
        // Emit real-time error output
        this.emit('stderr', chunk.toString());
        this.parseErrorOutput(chunk.toString(), options);
      });

      // Wait for process to complete
      const exitCode = await new Promise<number>((resolve, reject) => {
        childProcess.on('close', (code) => {
          if (timeoutHandle) {
            clearTimeout(timeoutHandle);
          }
          resolve(code || 0);
        });

        childProcess.on('error', (error) => {
          if (timeoutHandle) {
            clearTimeout(timeoutHandle);
          }
          reject(error);
        });
      });

      const endTime = new Date().toISOString();
      const endTimestamp = Date.now();
      const durationMs = endTimestamp - startTimestamp;

      result.exitCode = exitCode;
      result.stdout = Buffer.concat(stdoutChunks).toString();
      result.stderr = Buffer.concat(stderrChunks).toString();
      result.endTime = endTime;
      result.durationMs = durationMs;

      // Parse token usage and tool calls from output
      result.tokenUsage = this.extractTokenUsage(result.stdout + result.stderr);
      result.toolCalls = this.extractToolCalls(result.stdout + result.stderr);

      // Publish metrics events
      await this.publishMetrics(options, result);

      this.logger.debug(`Amp execution completed. Exit code: ${exitCode}, Duration: ${durationMs}ms`);
      
      return result;

    } catch (error) {
      const endTime = new Date().toISOString();
      const durationMs = Date.now() - startTimestamp;

      result.exitCode = -1;
      result.endTime = endTime;
      result.durationMs = durationMs;
      result.stderr = error instanceof Error ? error.message : String(error);

      this.logger.error('Amp execution failed:', error);
      
      // Still publish metrics for failed executions
      await this.publishMetrics(options, result);
      
      throw error;
    }
  }

  private parseOutput(output: string, options: AmpWrapperOptions): void {
    // Look for structured output patterns in Amp CLI
    // This would need to be adjusted based on actual Amp CLI output format
    
    // Example patterns to look for:
    // - Tool call starts/ends
    // - Token usage information
    // - Model information
    
    const lines = output.split('\n');
    for (const line of lines) {
      // Example: look for tool execution patterns
      if (line.includes('Executing tool:') || line.includes('Tool completed:')) {
        this.emit('tool-event', line);
      }
      
      // Example: look for token usage patterns
      if (line.includes('tokens') && (line.includes('prompt') || line.includes('completion'))) {
        this.emit('token-usage', line);
      }
    }
  }

  private parseErrorOutput(output: string, options: AmpWrapperOptions): void {
    // Parse error output for tool failures, timeouts, etc.
    const lines = output.split('\n');
    for (const line of lines) {
      if (line.includes('Tool failed:') || line.includes('Error:')) {
        this.emit('tool-error', line);
      }
    }
  }

  private extractTokenUsage(output: string): AmpWrapperResult['tokenUsage'] {
    // Parse token usage from Amp CLI output
    // This is a placeholder - would need to be adapted to actual Amp output format
    
    const tokenRegex = /(?:used|consumed)\s+(\d+)\s+(?:prompt\s+)?tokens.*?(\d+)\s+(?:completion\s+)?tokens/i;
    const modelRegex = /(?:model|using):\s*([^\s,]+)/i;
    
    const tokenMatch = output.match(tokenRegex);
    const modelMatch = output.match(modelRegex);
    
    if (tokenMatch) {
      const promptTokens = parseInt(tokenMatch[1], 10);
      const completionTokens = parseInt(tokenMatch[2], 10);
      
      return {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        model: modelMatch?.[1] || 'unknown'
      };
    }
    
    return undefined;
  }

  private extractToolCalls(output: string): AmpWrapperResult['toolCalls'] {
    // Parse tool calls from Amp CLI output
    // This is a placeholder - would need to be adapted to actual Amp output format
    
    const toolCalls: AmpWrapperResult['toolCalls'] = [];
    const lines = output.split('\n');
    
    let currentTool: Partial<AmpWrapperResult['toolCalls'][0]> | null = null;
    
    for (const line of lines) {
      // Look for tool execution start
      const startMatch = line.match(/Executing tool:\s*(\w+)\s*\((.*)\)/);
      if (startMatch) {
        currentTool = {
          toolName: startMatch[1],
          args: this.parseToolArgs(startMatch[2]),
          success: false,
          durationMs: 0
        };
        continue;
      }
      
      // Look for tool execution end
      const endMatch = line.match(/Tool completed:\s*(\w+)\s*.*?(\d+)ms/);
      if (endMatch && currentTool && currentTool.toolName === endMatch[1]) {
        currentTool.durationMs = parseInt(endMatch[2], 10);
        currentTool.success = true;
        toolCalls.push(currentTool as AmpWrapperResult['toolCalls'][0]);
        currentTool = null;
        continue;
      }
      
      // Look for tool failures
      const errorMatch = line.match(/Tool failed:\s*(\w+)\s*-\s*(.*)/);
      if (errorMatch && currentTool && currentTool.toolName === errorMatch[1]) {
        currentTool.success = false;
        currentTool.errorMessage = errorMatch[2];
        toolCalls.push(currentTool as AmpWrapperResult['toolCalls'][0]);
        currentTool = null;
        continue;
      }
    }
    
    return toolCalls;
  }

  private parseToolArgs(argsString: string): Record<string, any> {
    try {
      // Try to parse as JSON first
      return JSON.parse(argsString);
    } catch {
      // Fall back to simple key=value parsing
      const args: Record<string, any> = {};
      const pairs = argsString.split(',');
      
      for (const pair of pairs) {
        const [key, value] = pair.split('=', 2);
        if (key && value) {
          args[key.trim()] = value.trim();
        }
      }
      
      return args;
    }
  }

  private async publishMetrics(
    options: AmpWrapperOptions,
    result: AmpWrapperResult
  ): Promise<void> {
    // Publish token usage if available
    if (result.tokenUsage) {
      await this.eventBus.publishLLMUsage(
        options.sessionId,
        options.iterationId,
        result.tokenUsage.model,
        {
          promptTokens: result.tokenUsage.promptTokens,
          completionTokens: result.tokenUsage.completionTokens,
          totalTokens: result.tokenUsage.totalTokens,
          costUsd: this.calculateTokenCost(result.tokenUsage),
          latencyMs: result.durationMs
        }
      );
    }

    // Publish tool calls
    for (const toolCall of result.toolCalls) {
      await this.eventBus.publishToolCall(
        options.sessionId,
        options.iterationId,
        toolCall.toolName,
        toolCall.args,
        {
          startTime: result.startTime,
          endTime: result.endTime,
          durationMs: toolCall.durationMs,
          success: toolCall.success,
          errorMessage: toolCall.errorMessage
        }
      );
    }
  }

  private calculateTokenCost(tokenUsage: NonNullable<AmpWrapperResult['tokenUsage']>): number {
    // Pricing table - this should be configurable or fetched from a service
    const pricing: Record<string, { promptPrice: number; completionPrice: number }> = {
      'gpt-4': { promptPrice: 0.03, completionPrice: 0.06 },
      'gpt-4-turbo': { promptPrice: 0.01, completionPrice: 0.03 },
      'gpt-3.5-turbo': { promptPrice: 0.0015, completionPrice: 0.002 },
      'claude-3-sonnet': { promptPrice: 0.003, completionPrice: 0.015 },
      'claude-3-haiku': { promptPrice: 0.00025, completionPrice: 0.00125 }
    };

    const modelPricing = pricing[tokenUsage.model.toLowerCase()] || pricing['gpt-4'];
    
    const promptCost = (tokenUsage.promptTokens / 1000) * modelPricing.promptPrice;
    const completionCost = (tokenUsage.completionTokens / 1000) * modelPricing.completionPrice;
    
    return promptCost + completionCost;
  }

  // Convenience methods for common Amp operations
  async executePrompt(prompt: string, options: AmpWrapperOptions): Promise<AmpWrapperResult> {
    return this.execute(['-x', prompt], options);
  }

  async continueThread(threadId: string, options: AmpWrapperOptions): Promise<AmpWrapperResult> {
    return this.execute(['threads', 'continue', threadId], options);
  }

  async createThread(options: AmpWrapperOptions): Promise<AmpWrapperResult> {
    return this.execute(['threads', 'new'], options);
  }
}

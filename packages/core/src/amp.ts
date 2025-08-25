import { spawn } from 'child_process';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { EventEmitter } from 'events';
import type { AmpTelemetry } from '@ampsm/types';
import { TelemetryParser } from './telemetry-parser.js';


/**
 * Redacts secrets from text based on environment variable keys
 */
function redactSecrets(text: string, env?: Record<string, string>): string {
  if (!env) return text;
  
  let redacted = text;
  Object.entries(env).forEach(([key, value]) => {
    if (/TOKEN|KEY|SECRET/i.test(key) && value) {
      redacted = redacted.split(value).join('[REDACTED]');
    }
  });
  
  return redacted;
}

export interface AmpAdapterConfig {
  ampPath?: string;
  ampArgs?: string[];
  enableJSONLogs?: boolean;
  env?: Record<string, string>;
  extraArgs?: string[];
}

export interface AmpIterationResult {
  success: boolean;
  output: string;
  telemetry: AmpTelemetry;
  awaitingInput: boolean;
}

export interface StreamingEvent {
  type: 'tool_start' | 'tool_finish' | 'token_usage' | 'model_info' | 'model_change' | 'assistant_message' | 'session_result' | 'output' | 'error';
  timestamp: string;
  data: any;
}

export interface InteractiveHandle {
  send(message: string): void;
  stop(): Promise<void>;
  on(event: 'streaming-event' | 'state' | 'error', listener: (...args: any[]) => void): this;
  off(event: string, listener: (...args: any[]) => void): this;
}

export type InteractiveState = 'connecting' | 'ready' | 'closed' | 'error';

export class AmpAdapter extends EventEmitter {
  private config: AmpAdapterConfig;
  private telemetryParser = new TelemetryParser();
  public lastUsedArgs?: string[];
  private store?: any;
  private jsonBuffer: string = '';

  constructor(config: AmpAdapterConfig = {}, store?: any) {
    super();
    this.config = {
      ampPath: config.ampPath || process.env.AMP_BIN || 'amp',
      ampArgs: config.ampArgs || [],
      enableJSONLogs: config.enableJSONLogs !== false, // Default to true for streaming
      env: config.env,
      extraArgs: config.extraArgs || []
    };
    this.store = store;
  }

  private async hasExistingThread(sessionId: string): Promise<boolean> {
    if (!this.store) return false;
    try {
      const threads = this.store.getSessionThreads(sessionId);
      return threads.length > 0 && threads[0].messageCount > 0;
    } catch {
      return false;
    }
  }

  private async getOrCreateThread(sessionId: string, prompt?: string): Promise<string> {
    if (!this.store) throw new Error('Store not available');
    
    const threads = this.store.getSessionThreads(sessionId);
    
    if (threads.length > 0) {
      // Use the most recent active thread
      const activeThread = threads.find((t: any) => t.status === 'active') || threads[0];
      return activeThread.id;
    }
    
    // Create new thread
    const session = this.store.getSession(sessionId);
    const threadName = prompt ? `${prompt.slice(0, 50)}...` : 'Interactive Session';
    return this.store.createThread(sessionId, threadName);
  }

  private async getIterationCount(sessionId: string): Promise<number> {
    if (!this.store) return 0;
    try {
      const iterations = this.store.getIterations(sessionId);
      return iterations.length;
    } catch (error) {
      console.warn('Error getting iteration count:', error);
      return 0;
    }
  }

  async continueThread(
    prompt: string, 
    workingDir: string, 
    modelOverride?: string,
    sessionId?: string,
    includeContext?: boolean
  ): Promise<AmpIterationResult> {
    // If no sessionId provided, fallback to legacy behavior (direct amp command)
    if (!sessionId) {
      console.warn('No sessionId provided - using legacy mode without thread management');
      const finalPrompt = await this.buildIterationPrompt(prompt, workingDir, sessionId, includeContext);
      return this.runAmpCommandWithArgs(['-x'], finalPrompt, workingDir, modelOverride, sessionId);
    }

    const isFirstRun = !(await this.hasExistingThread(sessionId));
    
    if (isFirstRun) {
      // Create new thread and store user message
      const threadId = await this.getOrCreateThread(sessionId, prompt);
      if (this.store) {
        this.store.addThreadMessage(threadId, 'user', prompt);
      }
      
      const finalPrompt = await this.buildIterationPrompt(prompt, workingDir, sessionId, includeContext);
      return this.runAmpCommand(finalPrompt, workingDir, modelOverride, sessionId, threadId);
    } else {
      // Get existing thread and continue it
      const threadId = await this.getOrCreateThread(sessionId);
      if (this.store) {
        this.store.addThreadMessage(threadId, 'user', prompt);
      }
      
      // Get existing iterations to determine which model to use (alternate)
      const existingIterations = await this.getIterationCount(sessionId);
      const useGpt5 = existingIterations % 2 === 1; // Odd iterations (2nd, 4th, etc.) use GPT-5
      
      console.log(`🔄 Continuing thread ${threadId}: existingIterations=${existingIterations}, useGpt5=${useGpt5}, model=${useGpt5 ? 'gpt-5' : 'default'}`);
      
      // Use proper thread continuation command
      const alternatingModel = useGpt5 ? 'gpt-5' : undefined; // undefined = default model
      return this.runThreadContinue(threadId, prompt, workingDir, alternatingModel, sessionId, includeContext);
    }
  }

  async runIteration(
    prompt: string, 
    workingDir: string, 
    modelOverride?: string,
    sessionId?: string,
    includeContext?: boolean
  ): Promise<AmpIterationResult> {
    return this.continueThread(prompt, workingDir, modelOverride, sessionId, includeContext);
  }

  async runThreadContinue(
    threadId: string,
    prompt: string, 
    workingDir: string, 
    modelOverride?: string,
    sessionId?: string,
    includeContext?: boolean
  ): Promise<AmpIterationResult> {
    // Prepare final prompt with context if needed
    let finalPrompt = prompt;
    if (includeContext) {
      const contextMd = await this.safeReadFile(join(workingDir, 'CONTEXT.md'));
      if (contextMd.trim()) {
        finalPrompt = `${prompt}\n\n${contextMd}`;
      }
    }

    console.log('Thread continue command:', {
      threadId,
      workingDir,
      promptLength: finalPrompt.length
    });

    // For thread continuation, use --execute mode with the message
    // Format: amp threads continue <threadId> --execute "message" [options]
    const args = ['threads', 'continue', threadId, '--execute', finalPrompt];
    
    // Add model override
    if (modelOverride === 'gpt-5') {
      args.push('--try-gpt5');
    } else if (modelOverride === 'alloy') {
      // For alloy mode, we need to set the config instead of a flag
      // This will be handled via environment variable  
    } else if (modelOverride) {
      args.push('--model', modelOverride);
    }

    // Enable streaming JSON for real-time telemetry if configured
    if (this.config.enableJSONLogs) {
      args.push('--stream-json');
    }

    // Add debug logging if available
    try {
      const tempLogFile = join(tmpdir(), `amp_debug_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.log`);
      // Test write permissions by creating a test file
      const { writeFileSync, unlinkSync } = await import('fs');
      const testFile = tempLogFile + '.test';
      writeFileSync(testFile, 'test', { mode: 0o600 }); // Secure permissions
      unlinkSync(testFile);
      
      // If test succeeded, use debug logging
      args.push('--log-level', 'debug', '--log-file', tempLogFile);
      console.log('Debug logging enabled for thread continuation');
    } catch (debugSetupError) {
      console.warn('Debug logging unavailable for thread continuation:', (debugSetupError as Error).message);
    }

    return this.executeAmpCommandNoStdin(args, workingDir, sessionId, threadId);
  }

  private async runAmpCommand(
    finalPrompt: string,
    workingDir: string,
    modelOverride?: string,
    sessionId?: string,
    threadId?: string
  ): Promise<AmpIterationResult> {
    // Use -x for interactive mode for new threads
    const args = ['-x', ...(this.config.ampArgs || []), ...(this.config.extraArgs || [])];
    return this.runAmpCommandWithArgs(args, finalPrompt, workingDir, modelOverride, sessionId, threadId);
  }

  private async runAmpCommandWithArgs(
    baseArgs: string[],
    finalPrompt: string,
    workingDir: string,
    modelOverride?: string,
    sessionId?: string,
    threadId?: string
  ): Promise<AmpIterationResult> {
    const args = [...baseArgs];
    
    // Add model override
    if (modelOverride === 'gpt-5') {
      args.push('--try-gpt5');
    } else if (modelOverride === 'alloy') {
      // For alloy mode, we need to set the config instead of a flag
      // This will be handled via environment variable
    } else if (modelOverride) {
      args.push('--model', modelOverride);
    }

    return this.executeAmpCommand(args, finalPrompt, workingDir, sessionId, true, threadId);
  }

  private async executeAmpCommandNoStdin(
    args: string[],
    workingDir: string,
    sessionId?: string,
    threadId?: string
  ): Promise<AmpIterationResult> {
    // For commands that don't need stdin (like --execute commands)
    return this.executeAmpCommand(args, '', workingDir, sessionId, false, threadId);
  }

  private async executeAmpCommand(
    args: string[],
    finalPrompt: string,
    workingDir: string,
    sessionId?: string,
    useStdin: boolean = true,
    threadId?: string
  ): Promise<AmpIterationResult> {
    
    return new Promise(async (resolve) => {
      // Setup debug logging if available
      let debugLogFile: string | null = null;
      
      // Try to enable debug logging (with fallback) - handle missing config gracefully
      try {
        const tempLogFile = join(tmpdir(), `amp_debug_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.log`);
        // Test write permissions by creating a test file
        const { writeFileSync, unlinkSync } = await import('fs');
        const testFile = tempLogFile + '.test';
        writeFileSync(testFile, 'test', { mode: 0o600 }); // Secure permissions
        unlinkSync(testFile);
        
        // If test succeeded, use debug logging
        debugLogFile = tempLogFile;
        args.push('--log-level', 'debug', '--log-file', debugLogFile);
        console.log('Debug logging enabled for metrics parsing');
      } catch (debugSetupError) {
        console.warn('Debug logging unavailable, will use text parsing fallback:', (debugSetupError as Error).message);
        debugLogFile = null;
      }
      
      // Note: Session-specific log files don't capture tool execution details,
      // so we rely on the shared CLI log with timing-based isolation

      // Enable streaming JSON for real-time telemetry if configured
      if (this.config.enableJSONLogs) {
        args.push('--stream-json');
      }

      // Add the prompt (use stdin for long prompts)
      console.log('Amp environment check:', {
        AMP_API_KEY: process.env.AMP_API_KEY ? '***exists***' : 'MISSING',
        ampPath: this.config.ampPath,
        sessionId,
        args,
        workingDir
      });
      
      const ampStartTime = Date.now();
      
      // Store args for UI verification
      this.lastUsedArgs = args;
      
      // Use environment variables for authentication
      const env = this.config.env ? { ...process.env, ...this.config.env } : { ...process.env };
      
      // Ensure AMP_API_KEY is available - check shell environment if missing
      if (!env.AMP_API_KEY && process.env.SHELL) {
        try {
          const { spawn } = await import('child_process');
          const result = await new Promise<string>((resolve) => {
            const shell = spawn(process.env.SHELL!, ['-c', 'source ~/.zshrc && echo $AMP_API_KEY'], { 
              stdio: ['pipe', 'pipe', 'pipe'] 
            });
            let output = '';
            shell.stdout?.on('data', (data) => output += data.toString());
            shell.on('close', () => resolve(output.trim()));
          });
          
          if (result && result !== 'your-actual-api-key-here') {
            env.AMP_API_KEY = result;
            console.log('AMP_API_KEY sourced from shell environment');
          }
        } catch (error) {
          console.warn('Failed to source AMP_API_KEY from shell:', error);
        }
      }
      
      // Handle alloy mode via environment variable - check if alloy model is in args
      const hasAlloyModel = args.some(arg => arg.includes('alloy'));
      if (hasAlloyModel) {
        env['amp.internal.alloy.enable'] = 'true';
      }
      
      const child = spawn(this.config.ampPath!, args, {
        cwd: workingDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        env
      });
      
      let output = '';
      let stderr = '';
      let streamBuffer = '';
      
      // Real-time telemetry tracking
      const realtimeTelemetry: AmpTelemetry = {
        exitCode: 0,
        toolCalls: []
      };
      
      child.stdout?.on('data', (data) => {
        const chunk = data.toString();
        output += chunk;
        
        // Emit raw output event
        this.emit('streaming-event', {
          type: 'output',
          timestamp: new Date().toISOString(),
          data: { chunk }
        } as StreamingEvent);
        
        // Process streaming JSON if enabled
        if (this.config.enableJSONLogs) {
          this.processStreamingJSON(chunk, realtimeTelemetry, sessionId, threadId);
        }
      });
      
      child.stderr?.on('data', (data) => {
        const chunk = data.toString();
        stderr += chunk;
        
        // Emit error event
        this.emit('streaming-event', {
          type: 'error',
          timestamp: new Date().toISOString(),
          data: { chunk }
        } as StreamingEvent);
        
        // Also process stderr for JSON logs (some tools log to stderr)
        if (this.config.enableJSONLogs) {
          this.processStreamingJSON(chunk, realtimeTelemetry, sessionId, threadId);
        }
      });
      
      // Send prompt via stdin only if needed (not for --execute commands)
      if (useStdin && child.stdin && finalPrompt) {
        console.log('Sending prompt to Amp (first 200 chars):', finalPrompt.slice(0, 200));
        child.stdin.write(finalPrompt);
        child.stdin.end();
      } else if (child.stdin) {
        // Close stdin even if not sending data
        child.stdin.end();
      }
      
      child.on('close', async (exitCode) => {
        const ampDuration = Date.now() - ampStartTime;
        const fullOutput = output + stderr;
        
        // Clean up JSON buffer when process completes
        this.jsonBuffer = '';
        
        console.log('Amp process completed:', { 
          exitCode, 
          durationMs: ampDuration,
          outputLength: output.length,
          stderrLength: stderr.length,
          stderr: stderr.slice(0, 200) // Log first 200 chars of stderr
        }); 
        console.log('Raw stdout (first 500 chars):', output.slice(0, 500));
        console.log('Full output for telemetry parsing:', fullOutput.slice(-500)); // Log last 500 chars
        const redactedOutput = redactSecrets(fullOutput, this.config.env);
        console.log('Redacted output length:', redactedOutput.length);
        
        // Parse telemetry from output
        const parsedTelemetry = this.telemetryParser.parseOutput(fullOutput);
        
        // Merge real-time telemetry with parsed telemetry
        const telemetry = {
          ...parsedTelemetry,
          toolCalls: [
            ...(parsedTelemetry.toolCalls || []),
            ...(realtimeTelemetry.toolCalls || [])
          ]
        };
        
        console.log(`[DEBUG] Final telemetry - Parsed tools: ${parsedTelemetry.toolCalls?.length || 0}, Realtime tools: ${realtimeTelemetry.toolCalls?.length || 0}, Total: ${telemetry.toolCalls.length}`);
        
        // Clean up debug log file
        if (debugLogFile) {
          try {
            const { unlink } = await import('fs/promises');
            await unlink(debugLogFile);
          } catch (cleanupError) {
            console.warn('Failed to clean up debug log file:', cleanupError);
          }
        }

        // Check for awaiting input condition
        const awaitingInput = this.detectAwaitingInput(fullOutput);

        resolve({
          success: exitCode === 0,
          output: redactedOutput,
          telemetry,
          awaitingInput
        });
      });
      
      child.on('error', (error) => {
        const errorOutput = `Failed to spawn amp: ${error.message}`;
        resolve({
          success: false,
          output: redactSecrets(errorOutput, this.config.env),
          telemetry: {
            exitCode: -1,
            toolCalls: []
          },
          awaitingInput: false
        });
      });
    });
  }

  async consultOracle(
    query: string,
    workingDir: string,
    context?: string,
    modelOverride?: string
  ): Promise<AmpIterationResult> {
    const oraclePrompt = this.buildOraclePrompt(query, context);
    
    return new Promise(async (resolve) => {
      const args = [...(this.config.ampArgs || []), ...(this.config.extraArgs || []), '--oracle'];
      
      // Try to enable debug logging (with fallback)
      let debugLogFile: string | null = null;
      try {
        const tempLogFile = join(tmpdir(), `amp_oracle_debug_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.log`);
        // Test write permissions by creating a test file
        const { writeFileSync, unlinkSync } = await import('fs');
        const testFile = tempLogFile + '.test';
        writeFileSync(testFile, 'test', { mode: 0o600 }); // Secure permissions
        unlinkSync(testFile);
        
        // If test succeeded, use debug logging
        debugLogFile = tempLogFile;
        args.push('--log-level', 'debug', '--log-file', debugLogFile);
        console.log('Oracle debug logging enabled for metrics parsing');
      } catch (debugSetupError) {
        console.warn('Oracle debug logging unavailable, will use text parsing fallback:', (debugSetupError as Error).message);
        debugLogFile = null;
      }
      
      // Add model override for oracle
      if (modelOverride === 'gpt-5') {
        args.push('--try-gpt5');
      } else if (modelOverride && modelOverride !== 'alloy') {
        args.push('--model', modelOverride);
      }
      
      // Enable streaming JSON for oracle if supported and configured
      if (this.config.enableJSONLogs) {
        args.push('--stream-json');
      }
      
      const env = this.config.env ? { ...process.env, ...this.config.env } : { ...process.env };
      
      // Ensure AMP_API_KEY is available - check shell environment if missing
      if (!env.AMP_API_KEY && process.env.SHELL) {
        try {
          const { spawn } = await import('child_process');
          const result = await new Promise<string>((resolve) => {
            const shell = spawn(process.env.SHELL!, ['-c', 'source ~/.zshrc && echo $AMP_API_KEY'], { 
              stdio: ['pipe', 'pipe', 'pipe'] 
            });
            let output = '';
            shell.stdout?.on('data', (data) => output += data.toString());
            shell.on('close', () => resolve(output.trim()));
          });
          
          if (result && result !== 'your-actual-api-key-here') {
            env.AMP_API_KEY = result;
            console.log('AMP_API_KEY sourced from shell environment for Oracle');
          }
        } catch (error) {
          console.warn('Failed to source AMP_API_KEY from shell for Oracle:', error);
        }
      }
      
      // Handle alloy mode for oracle
      if (modelOverride === 'alloy') {
        env['amp.internal.alloy.enable'] = 'true';
      }
      
      const child = spawn(this.config.ampPath!, args, {
        cwd: workingDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        env
      });
      
      let output = '';
      let stderr = '';
      
      // Real-time telemetry tracking for oracle
      const realtimeTelemetry: AmpTelemetry = {
        exitCode: 0,
        toolCalls: []
      };
      
      child.stdout?.on('data', (data) => {
        const chunk = data.toString();
        output += chunk;
        
        // Emit raw output event
        this.emit('streaming-event', {
          type: 'output',
          timestamp: new Date().toISOString(),
          data: { chunk, isOracle: true }
        } as StreamingEvent);
        
        // Process streaming JSON if enabled
        if (this.config.enableJSONLogs) {
          this.processStreamingJSON(chunk, realtimeTelemetry, undefined, undefined);
        }
      });
      
      child.stderr?.on('data', (data) => {
        const chunk = data.toString();
        stderr += chunk;
        
        // Emit error event
        this.emit('streaming-event', {
          type: 'error',
          timestamp: new Date().toISOString(),
          data: { chunk, isOracle: true }
        } as StreamingEvent);
        
        // Also process stderr for JSON logs (some tools log to stderr)
        if (this.config.enableJSONLogs) {
          this.processStreamingJSON(chunk, realtimeTelemetry, undefined, undefined);
        }
      });
      
      if (child.stdin) {
        child.stdin.write(oraclePrompt);
        child.stdin.end();
      }
      
      child.on('close', async (exitCode) => {
        const fullOutput = output + stderr;
        
        // Clean up JSON buffer when oracle process completes  
        this.jsonBuffer = '';
        
        const redactedOutput = redactSecrets(fullOutput, this.config.env);
        
        // Parse telemetry from output
        const telemetry = this.telemetryParser.parseOutput(fullOutput);
        
        // Clean up debug log file
        if (debugLogFile) {
          try {
            const { unlink } = await import('fs/promises');
            await unlink(debugLogFile);
          } catch (cleanupError) {
            console.warn('Failed to clean up oracle debug log file:', cleanupError);
          }
        }

        resolve({
          success: exitCode === 0,
          output: redactedOutput,
          telemetry,
          awaitingInput: false
        });
      });
      
      child.on('error', (error) => {
        const errorOutput = `Failed to spawn amp oracle: ${error.message}`;
        resolve({
          success: false,
          output: redactSecrets(errorOutput, this.config.env),
          telemetry: {
            exitCode: -1,
            toolCalls: []
          },
          awaitingInput: false
        });
      });
    });
  }

  private async buildIterationPrompt(prompt: string, workingDir: string, sessionId?: string, includeContext?: boolean): Promise<string> {
    try {
      // If user doesn't want context, just return the prompt
      if (!includeContext) {
        return prompt;
      }
      
      // Check if CONTEXT.md exists and include it if user opted in
      const contextMd = await this.safeReadFile(join(workingDir, 'CONTEXT.md'));
      
      if (!contextMd.trim()) {
        return prompt;
      }
      
      // Include CONTEXT.md with the prompt since user opted in
      return `${prompt}

${contextMd}`;
    } catch (error) {
      console.warn('Failed to build iteration prompt:', error);
      return prompt;
    }
  }

  // Note: buildContinuePrompt is no longer used - thread continuation now uses proper CLI commands

  private buildOraclePrompt(query: string, context?: string): string {
    return `Please analyze this query and provide expert guidance:

Query: ${query}

${context ? `Additional Context:\n${context}\n` : ''}

Please provide a thorough analysis and actionable recommendations.`;
  }

  private async safeReadFile(path: string): Promise<string> {
    try {
      return await readFile(path, 'utf-8');
    } catch {
      return '';
    }
  }

  private detectAwaitingInput(output: string): boolean {
    const awaitingPatterns = [
      /awaiting input/i,
      /waiting for input/i,
      /please provide/i,
      /user input required/i,
      /paused for input/i
    ];

    return awaitingPatterns.some(pattern => pattern.test(output));
  }

  // Legacy method for backward compatibility
  async runIterationLegacy(prompt: string, workingDir: string, modelOverride?: string): Promise<{
    success: boolean;
    output: string;
    tokenUsage?: number;
  }> {
    const result = await this.runIteration(prompt, workingDir, modelOverride);
    return {
      success: result.success,
      output: result.output,
      tokenUsage: result.telemetry.totalTokens
    };
  }

  /**
   * Validate Amp CLI authentication and return detailed status
   */
  async validateAuth(): Promise<{
    isAuthenticated: boolean;
    error?: string;
    suggestion?: string;
    hasCredits?: boolean;
  }> {
    return new Promise(async (resolve) => {
      const testPrompt = 'echo "auth test"';
      const env = this.config.env ? { ...process.env, ...this.config.env } : { ...process.env };
      
      // Ensure AMP_API_KEY is available - check shell environment if missing
      if (!env.AMP_API_KEY && process.env.SHELL) {
        try {
          const { spawn } = await import('child_process');
          const result = await new Promise<string>((resolve) => {
            const shell = spawn(process.env.SHELL!, ['-c', 'source ~/.zshrc && echo $AMP_API_KEY'], { 
              stdio: ['pipe', 'pipe', 'pipe'] 
            });
            let output = '';
            shell.stdout?.on('data', (data) => output += data.toString());
            shell.on('close', () => resolve(output.trim()));
          });
          
          if (result && result !== 'your-actual-api-key-here') {
            env.AMP_API_KEY = result;
            console.log('AMP_API_KEY sourced from shell environment for auth validation');
          }
        } catch (error) {
          console.warn('Failed to source AMP_API_KEY from shell for auth validation:', error);
        }
      }
      
      const child = spawn(this.config.ampPath!, ['-x'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env
      });
      
      let output = '';
      let stderr = '';
      
      child.stdout?.on('data', (data) => output += data.toString());
      child.stderr?.on('data', (data) => stderr += data.toString());
      
      if (child.stdin) {
        child.stdin.write(testPrompt);
        child.stdin.end();
      }
      
      child.on('close', (exitCode) => {
        const fullOutput = output + stderr;
        
        if (fullOutput.includes('Not logged in') || fullOutput.includes('Unauthorized')) {
          resolve({
            isAuthenticated: false,
            error: 'Not logged in to Amp CLI',
            suggestion: 'Run "amp login" in terminal or use the built-in login flow'
          });
        } else if (fullOutput.includes('Insufficient credit')) {
          resolve({
            isAuthenticated: true,
            hasCredits: false,
            error: 'Insufficient credit balance',
            suggestion: 'Add credits to your Amp account at ampcode.com/settings'
          });
        } else if (exitCode === 0) {
          resolve({
            isAuthenticated: true,
            hasCredits: true
          });
        } else {
          resolve({
            isAuthenticated: false,
            error: `Auth validation failed: ${fullOutput.slice(0, 100)}`,
            suggestion: 'Check your Amp CLI configuration'
          });
        }
      });
      
      child.on('error', (error) => {
        resolve({
          isAuthenticated: false,
          error: `Failed to run amp CLI: ${error.message}`,
          suggestion: 'Make sure Amp CLI is installed and in your PATH'
        });
      });
    });
  }
  
  /**
   * Process streaming JSON chunks and emit real-time telemetry events
   * Handles multi-line JSON objects and partial chunks across data reads
   */
  private processStreamingJSON(chunk: string, realtimeTelemetry: AmpTelemetry, sessionId?: string, threadId?: string) {
    // Add chunk to buffer
    this.jsonBuffer += chunk;
    
    console.log(`[DEBUG] Stream JSON chunk received (${chunk.length} chars):`, chunk.slice(0, 200));
    console.log(`[DEBUG] Current buffer size: ${this.jsonBuffer.length} chars`);
    
    // Process complete JSON objects from buffer
    const completeObjects = this.extractCompleteJSONObjects();
    
    console.log(`[DEBUG] Extracted ${completeObjects.length} complete JSON objects`);
    
    for (const jsonString of completeObjects) {
      try {
        const parsed = JSON.parse(jsonString);
        
        console.log(`[DEBUG] Parsed JSON object:`, { type: parsed.type, keys: Object.keys(parsed) });
        
        // Process stream-json format directly (no need for JSONL parser)
        const streamEvent = this.parseStreamJSONEvent(parsed);
        
        console.log(`[DEBUG] Stream event result:`, streamEvent ? { type: streamEvent.type, hasContent: !!(streamEvent.content || streamEvent.result) } : 'null');
        
        if (streamEvent) {
          // Update real-time telemetry
          this.updateRealtimeTelemetry(realtimeTelemetry, streamEvent);
          
          // Persist stream event to store if sessionId provided
          if (sessionId && this.store) {
            try {
              console.log(`[DEBUG] Persisting stream event to store:`, { sessionId, type: streamEvent.type });
              this.store.addStreamEvent(sessionId, streamEvent.type, streamEvent.timestamp, streamEvent);
              
              // Store assistant messages in thread_messages table
              if (streamEvent.type === 'assistant_message' && threadId && streamEvent.content) {
                console.log(`[DEBUG] Storing assistant message in thread ${threadId}`);
                this.store.addThreadMessage(threadId, 'assistant', streamEvent.content);
              }
            } catch (error) {
              console.warn('Failed to persist stream event:', error);
            }
          } else {
            console.log(`[DEBUG] Not persisting stream event - store:`, !!this.store, 'sessionId:', sessionId);
          }
          
          // Emit specific streaming events based on type
          switch (streamEvent.type) {
            case 'tool_start':
              this.emit('streaming-event', {
                type: 'tool_start',
                timestamp: streamEvent.timestamp,
                data: {
                  toolName: streamEvent.tool,
                  args: streamEvent.args,
                  sessionId
                }
              } as StreamingEvent);
              break;
              
            case 'tool_finish':
              this.emit('streaming-event', {
                type: 'tool_finish',
                timestamp: streamEvent.timestamp,
                data: {
                  toolName: streamEvent.tool,
                  durationMs: streamEvent.duration,
                  success: streamEvent.success,
                  sessionId
                }
              } as StreamingEvent);
              break;
              
            case 'token_usage':
              this.emit('streaming-event', {
                type: 'token_usage',
                timestamp: streamEvent.timestamp,
                data: {
                  totalTokens: streamEvent.tokens?.total || streamEvent.tokens,
                  promptTokens: streamEvent.tokens?.input_tokens || streamEvent.tokens?.prompt,
                  completionTokens: streamEvent.tokens?.output_tokens || streamEvent.tokens?.completion,
                  cost: streamEvent.cost,
                  model: streamEvent.model,
                  sessionId
                }
              } as StreamingEvent);
              break;
              
            case 'assistant_message':
              this.emit('streaming-event', {
                type: 'assistant_message',
                timestamp: streamEvent.timestamp,
                data: {
                  content: streamEvent.content,
                  model: streamEvent.model,
                  usage: streamEvent.usage,
                  sessionId: streamEvent.session_id || sessionId
                }
              } as StreamingEvent);
              break;
              
            case 'session_result':
              this.emit('streaming-event', {
                type: 'session_result',
                timestamp: streamEvent.timestamp,
                data: {
                  result: streamEvent.result,
                  durationMs: streamEvent.duration_ms,
                  numTurns: streamEvent.num_turns,
                  isError: streamEvent.is_error,
                  sessionId: streamEvent.session_id || sessionId
                }
              } as StreamingEvent);
              break;
              
            case 'model_info':
              this.emit('streaming-event', {
                type: 'model_change',
                timestamp: streamEvent.timestamp,
                data: {
                  model: streamEvent.model,
                  sessionId
                }
              } as StreamingEvent);
              break;
          }
        }
      } catch (error) {
        // Log parse errors for debugging but continue processing
        console.warn('JSON parse error in streaming data:', error instanceof Error ? error.message : String(error));
        console.warn('Failed JSON string:', jsonString.slice(0, 200));
      }
    }
  }

  /**
   * Extract complete JSON objects from the buffer
   * Handles both single-line and multi-line JSON objects
   */
  private extractCompleteJSONObjects(): string[] {
    const completeObjects: string[] = [];
    let position = 0;
    
    console.log(`[DEBUG] Extracting from buffer (${this.jsonBuffer.length} chars):`, this.jsonBuffer.slice(0, 200));
    
    while (position < this.jsonBuffer.length) {
      // Skip non-JSON content (text, whitespace, etc.)
      const jsonStart = this.findNextJSONStart(position);
      if (jsonStart === -1) {
        // No more JSON objects found, keep remaining content in buffer
        console.log(`[DEBUG] No more JSON objects found, remaining buffer:`, this.jsonBuffer.slice(position, position + 100));
        this.jsonBuffer = this.jsonBuffer.slice(position);
        break;
      }
      
      console.log(`[DEBUG] Found JSON start at position ${jsonStart}`);
      
      // Try to extract complete JSON object starting at jsonStart
      const jsonEnd = this.findJSONObjectEnd(jsonStart);
      if (jsonEnd === -1) {
        // Incomplete JSON object, keep from jsonStart onwards in buffer
        console.log(`[DEBUG] Incomplete JSON object, keeping from position ${jsonStart}`);
        this.jsonBuffer = this.jsonBuffer.slice(jsonStart);
        break;
      }
      
      // Extract complete JSON object
      const jsonString = this.jsonBuffer.slice(jsonStart, jsonEnd + 1);
      completeObjects.push(jsonString);
      position = jsonEnd + 1;
    }
    
    // If we processed all complete objects, remove them from buffer
    if (completeObjects.length > 0 && position >= this.jsonBuffer.length) {
      this.jsonBuffer = '';
    }
    
    // Clear buffer if it gets too large without valid JSON (prevent memory leaks)
    if (this.jsonBuffer.length > 50000) {
      // Try to salvage any JSON objects that might be at the end
      const lastBraceIndex = this.jsonBuffer.lastIndexOf('{');
      if (lastBraceIndex > 0) {
        this.jsonBuffer = this.jsonBuffer.slice(lastBraceIndex);
      } else {
        console.warn('Clearing large JSON buffer without recoverable JSON');
        this.jsonBuffer = '';
      }
    }
    
    return completeObjects;
  }
  
  /**
   * Find the next JSON object start position (opening brace)
   */
  private findNextJSONStart(fromPosition: number): number {
    for (let i = fromPosition; i < this.jsonBuffer.length; i++) {
      if (this.jsonBuffer[i] === '{') {
        return i;
      }
    }
    return -1;
  }
  
  /**
   * Find the end of a JSON object starting at the given position
   * Returns the position of the closing brace, or -1 if incomplete
   */
  private findJSONObjectEnd(startPosition: number): number {
    let braceCount = 0;
    let inString = false;
    let escapeNext = false;
    
    for (let i = startPosition; i < this.jsonBuffer.length; i++) {
      const char = this.jsonBuffer[i];
      
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      
      if (char === '\\') {
        escapeNext = true;
        continue;
      }
      
      if (char === '"') {
        inString = !inString;
        continue;
      }
      
      if (inString) {
        continue;
      }
      
      if (char === '{') {
        braceCount++;
      } else if (char === '}') {
        braceCount--;
        
        if (braceCount === 0) {
          return i; // Found complete JSON object
        }
      }
    }
    
    return -1; // Incomplete JSON object
  }
  
  /**
   * Convert a flat stream-json object into the internal StreamingEvent shape
   * Returns null for unknown / unhandled record types.
   */
  private parseStreamJSONEvent(parsed: any): any | null {
    if (!parsed || typeof parsed !== 'object' || !parsed.type) return null;

    // Normalise timestamp – fall back to "now" if the record does not supply one
    const ts = parsed.timestamp ?? new Date().toISOString();

    switch (parsed.type) {
      /* ──────────────────────────────── tool execution ─────────────────────────────── */
      case 'tool_start':
        return {
          type: 'tool_start',
          timestamp: ts,
          tool: parsed.tool,
          args: parsed.args ?? parsed.input   // both names appear in the wild
        };

      case 'tool_finish':
        return {
          type: 'tool_finish',
          timestamp: ts,
          tool: parsed.tool,
          success: parsed.success !== false,   // default to true when field absent
          duration: parsed.duration ?? parsed.elapsed ?? 0
        };

      /* ──────────────────────────────── token usage ─────────────────────────────── */
      case 'token_usage': {
        // The parser must always expose a "tokens" object with prompt/completion/total.
        const tk = parsed.tokens ?? {
          prompt:  parsed.prompt_tokens     ?? parsed.prompt    ?? 0,
          completion: parsed.completion_tokens ?? parsed.completion ?? 0,
          total:   parsed.total_tokens      ?? parsed.total     ??
                   ((parsed.prompt_tokens ?? 0) + (parsed.completion_tokens ?? 0))
        };

        return {
          type: 'token_usage',
          timestamp: ts,
          tokens: tk,
          model: parsed.model,
          cost: parsed.cost ?? this.calculateCost(tk, parsed.model)
        };
      }

      /* ──────────────────────────────── assistant messages ─────────────────────────────── */
      case 'assistant':
        // Extract assistant message content and usage metrics
        if (parsed.message) {
          const message = parsed.message;
          
          // Extract token usage from message
          if (message.usage) {
            setTimeout(() => {
              this.emit('streaming-event', {
                type: 'token_usage',
                timestamp: ts,
                data: {
                  totalTokens: (message.usage.input_tokens || 0) + (message.usage.output_tokens || 0),
                  promptTokens: message.usage.input_tokens || message.usage.cache_read_input_tokens || 0,
                  completionTokens: message.usage.output_tokens || 0,
                  cacheCreationTokens: message.usage.cache_creation_input_tokens || 0,
                  model: message.model || 'unknown',
                  sessionId: parsed.session_id
                }
              });
            }, 0);
          }
          
          // Extract text content for display
          const textContent = message.content
            ?.filter((item: any) => item.type === 'text')
            ?.map((item: any) => item.text)
            ?.join('') || '';
          
          // Extract tool usage from content
          const toolUses = message.content
            ?.filter((item: any) => item.type === 'tool_use') || [];
          
          // Emit tool events for each tool use
          for (const toolUse of toolUses) {
            if (toolUse.name) {
              console.log(`[DEBUG] Emitting tool_start event for tool: ${toolUse.name}`);
              setTimeout(() => {
                this.emit('streaming-event', {
                  type: 'tool_start',
                  timestamp: ts,
                  data: {
                    tool: toolUse.name,
                    args: toolUse.input || {},
                    sessionId: parsed.session_id
                  }
                });
              }, 0);
            }
          }
          
          return {
            type: 'assistant_message',
            timestamp: ts,
            content: textContent,
            model: message.model,
            usage: message.usage,
            session_id: parsed.session_id,
            tools: toolUses.map((tool: any) => tool.name).filter(Boolean)
          };
        }
        break;

      /* ──────────────────────────────── result summary ─────────────────────────────── */
      case 'result':
        return {
          type: 'session_result',
          timestamp: ts,
          result: parsed.result,
          duration_ms: parsed.duration_ms,
          num_turns: parsed.num_turns,
          is_error: parsed.is_error,
          session_id: parsed.session_id
        };

      /* ──────────────────────────────── model selection / info ───────────────────── */
      case 'model_info':
      case 'model_change':
        return {
          type: 'model_info',
          timestamp: ts,
          model: parsed.model
        };

      /* ──────────────────────────────── file edits ───────────────────── */
      case 'file_edit':
        return {
          type: 'file_edit',
          timestamp: ts,
          path: parsed.path,
          operation: parsed.operation,
          linesAdded: parsed.linesAdded || 0,
          linesDeleted: parsed.linesDeleted || 0
        };

      default:
        // Unknown record type – safely ignore
        return null;
    }
  }
  
  /**
   * Calculate token cost based on usage and model
   */
  private calculateCost(tokens: any, model?: string): number {
    // Basic cost calculation - adjust rates as needed
    const inputCost = (tokens.prompt || tokens.input_tokens || 0) * 0.00001; // $0.01 per 1K tokens
    const outputCost = (tokens.completion || tokens.output_tokens || 0) * 0.00003; // $0.03 per 1K tokens
    return inputCost + outputCost;
  }
  
  /**
   * Update real-time telemetry with new event data
   */
  private updateRealtimeTelemetry(telemetry: AmpTelemetry, event: any) {
    if (event.type === 'token_usage' && event.tokens) {
      telemetry.promptTokens = (telemetry.promptTokens || 0) + (event.tokens.prompt || 0);
      telemetry.completionTokens = (telemetry.completionTokens || 0) + (event.tokens.completion || 0);
      telemetry.totalTokens = (telemetry.totalTokens || 0) + (event.tokens.total || 0);
      
      if (event.model && !telemetry.model) {
        telemetry.model = event.model;
      }
    }
    
    if (event.type === 'model_info' && event.model && !telemetry.model) {
      telemetry.model = event.model;
    }
    
    // Handle assistant_message events with tools
    if (event.type === 'assistant_message' && event.tools && event.tools.length > 0) {
      console.log(`[DEBUG] Adding ${event.tools.length} tools from assistant message to telemetry`);
      for (const toolName of event.tools) {
        const toolCall = {
          toolName: toolName,
          args: {},
          success: true,
          timestamp: event.timestamp
        };
        telemetry.toolCalls.push(toolCall);
        console.log(`[DEBUG] Added tool call: ${toolName}`);
      }
    }
    
    if ((event.type === 'tool_start' || event.type === 'tool_finish') && event.tool) {
      // Find existing tool call or create new one
      let toolCall = telemetry.toolCalls.find(tc => 
        tc.toolName === event.tool && 
        Math.abs(new Date(tc.timestamp).getTime() - new Date(event.timestamp).getTime()) < 300000 // 5 min window
      );
      
      if (!toolCall && event.type === 'tool_start') {
        toolCall = {
          toolName: event.tool,
          args: event.args || {},
          success: true,
          timestamp: event.timestamp
        };
        telemetry.toolCalls.push(toolCall);
      } else if (toolCall && event.type === 'tool_finish') {
        toolCall.success = event.success !== false;
        toolCall.durationMs = event.duration;
      }
    }
  }

  /**
   * Check if amp CLI is authenticated
   */
  async checkAuthentication(): Promise<boolean> {
    return new Promise((resolve) => {
      const child = spawn(this.config.ampPath!, ['threads', 'list'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let stderr = '';
      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });
      
      child.on('close', (exitCode: number) => {
        resolve(exitCode === 0 && !stderr.includes('Not logged in'));
      });
      
      child.on('error', () => {
        resolve(false);
      });
    });
  }

  /**
   * Start an interactive streaming session with Amp CLI
   */
  startInteractive(
    sessionId: string,
    workingDir: string,
    modelOverride?: string,
    threadId?: string
  ): InteractiveHandle {
    const interactiveHandle = new InteractiveHandleImpl(
      sessionId,
      workingDir,
      modelOverride,
      threadId,
      this.config,
      this.store,
      this.telemetryParser
    );

    return interactiveHandle;
  }

  /**
   * Create a new thread within an existing session
   */
  async createNewThread(sessionId: string, name?: string): Promise<string> {
    if (!this.store) {
      throw new Error('Store not available');
    }
    
    const session = this.store.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    
    const threadName = name || `Thread ${new Date().toISOString().slice(0, 16)}`;
    return this.store.createThread(sessionId, threadName);
  }
}

class InteractiveHandleImpl extends EventEmitter implements InteractiveHandle {
  private child: any = null;
  private state: InteractiveState = 'connecting';
  private sessionId: string;
  private threadId?: string;
  private store?: any;
  private jsonBuffer: string = '';
  private realtimeTelemetry: AmpTelemetry = { exitCode: 0, toolCalls: [] };

  constructor(
    sessionId: string,
    workingDir: string,
    modelOverride: string | undefined,
    threadId: string | undefined,
    config: AmpAdapterConfig,
    store: any,
    telemetryParser: any
  ) {
    super();
    this.sessionId = sessionId;
    this.threadId = threadId;
    this.store = store;
    this.initializeConnection(workingDir, modelOverride, threadId, config, store, telemetryParser);
  }

  private async initializeConnection(
    workingDir: string,
    modelOverride: string | undefined,
    threadId: string | undefined,
    config: AmpAdapterConfig,
    store: any,
    telemetryParser: any
  ) {
    try {
      // Build args for streaming interactive mode - use the same as Go implementation
      const args = [
        '--execute',
        '--stream-json',
        '--stream-json-input'
      ];

      // Add thread continuation if threadId provided or session has existing threads
      if (threadId && threadId !== 'new') {
        // Continue specific existing thread
        args.unshift('threads', 'continue', threadId);
      } else if (threadId === 'new' || !threadId) {
        // Force new thread creation or handle case with no threadId
        if (threadId === 'new') {
          // Explicitly requested new thread - always create one
          const threadName = `Chat ${new Date().toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false 
          })}`;
          this.threadId = store.createThread(this.sessionId, threadName);
          console.log(`Force created new thread ${this.threadId} for interactive session`);
        } else if (store) {
          try {
            // Check for existing threads using new thread model
            const threads = store.getSessionThreads(this.sessionId);
            if (threads.length > 0 && threads[0].messageCount > 0) {
              const activeThread = threads.find((t: any) => t.status === 'active') || threads[0];
              this.threadId = activeThread.id;
              args.unshift('threads', 'continue', activeThread.id);
            } else {
              // Create new thread for interactive session
              const threadName = `Chat ${new Date().toLocaleTimeString('en-US', { 
                hour: '2-digit', 
                minute: '2-digit',
                hour12: false 
              })}`;
              this.threadId = store.createThread(this.sessionId, threadName);
              console.log(`Created new thread ${this.threadId} for interactive session`);
            }
          } catch (error) {
            console.warn('Could not check for existing threads:', error);
          }
        }
      }

      // Add model override if specified
      if (modelOverride === 'gpt-5') {
        args.push('--try-gpt5');
      } else if (modelOverride && modelOverride !== 'default') {
        args.push('--model', modelOverride);
      }

      // Add extra args
      if (config.extraArgs?.length) {
        args.push(...config.extraArgs);
      }

      console.log('Starting interactive amp process:', config.ampPath, args);

      // Set up environment
      const env = { ...process.env, ...config.env };
      if (config.enableJSONLogs) {
        env['amp.internal.alloy.enable'] = 'true';
      }

      // Spawn the amp process
      this.child = spawn(config.ampPath!, args, {
        cwd: workingDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        env
      });

      // Set up event handlers
      this.setupEventHandlers(store, telemetryParser);

      // For streaming mode with --stream-json-input, the process will send 
      // a system init message when ready. We wait for that instead of using a timeout.

    } catch (error) {
      this.state = 'error';
      this.emit('error', error);
    }
  }

  private setupEventHandlers(store: any, telemetryParser: any) {
    if (!this.child) return;

    let stderrBuffer = '';

    this.child.stdout?.on('data', (data: Buffer) => {
      const chunk = data.toString();
      
      // Emit raw output event
      this.emit('streaming-event', {
        type: 'output',
        timestamp: new Date().toISOString(),
        data: { chunk }
      });

      // Process streaming JSON
      this.processStreamingJSON(chunk, store, telemetryParser);
    });

    this.child.stderr?.on('data', (data: Buffer) => {
      const chunk = data.toString();
      stderrBuffer += chunk;
      
      // Emit error event (stderr is plain text, not JSON)
      this.emit('streaming-event', {
        type: 'error',
        timestamp: new Date().toISOString(),
        data: { chunk }
      });

      // Don't process stderr as JSON - it's plain text debug output
    });

    this.child.on('close', (exitCode: number) => {
      console.log('Interactive amp process closed with code:', exitCode);
      
      // Check for authentication errors
      if (exitCode === 1 && stderrBuffer.includes('Not logged in')) {
        this.state = 'error';
        this.emit('error', new Error('Amp CLI authentication required. Please run "amp login" to authenticate.'));
      } else {
        this.state = exitCode === 0 ? 'closed' : 'error';
        if (exitCode !== 0 && stderrBuffer.trim()) {
          this.emit('error', new Error(`Amp process failed: ${stderrBuffer.trim()}`));
        }
      }
      
      this.emit('state', this.state);
      
      // Clean up JSON buffer
      this.jsonBuffer = '';
    });

    this.child.on('error', (error: Error) => {
      console.error('Interactive amp process error:', error);
      this.state = 'error';
      this.emit('error', error);
    });
  }

  private processStreamingJSON(chunk: string, store: any, telemetryParser: any) {
    this.jsonBuffer += chunk;

    // Extract complete JSON objects
    const completeObjects = this.extractCompleteJSONObjects();
    
    for (const jsonString of completeObjects) {
      try {
        const parsedObject = JSON.parse(jsonString);
        
        // Signal ready when we get the first system init message (like Go implementation)
        if (this.state === 'connecting' && parsedObject.type === 'system' && parsedObject.subtype === 'init') {
          this.state = 'ready';
          this.emit('state', this.state);
          console.log('Interactive session ready with tools:', parsedObject.tools);
        }
        
        // Store raw stream event
        if (store) {
          const type = parsedObject.type || 'unknown';
          const timestamp = new Date().toISOString();
          store.addStreamEvent(this.sessionId, type, timestamp, parsedObject);
          
          // Store assistant messages in thread_messages table
          if (parsedObject.type === 'assistant' && this.threadId && parsedObject.message?.content) {
            console.log(`[DEBUG] Storing interactive assistant message in thread ${this.threadId}`);
            const content = typeof parsedObject.message.content === 'string' 
              ? parsedObject.message.content 
              : JSON.stringify(parsedObject.message.content);
            store.addThreadMessage(this.threadId, 'assistant', content);
          }
        }

        // Convert to structured event and emit
        const streamingEvent = this.convertToStreamingEvent(parsedObject);
        if (streamingEvent) {
          this.emit('streaming-event', streamingEvent);
        }

      } catch (error) {
        console.warn('JSON parse error in interactive streaming:', error instanceof Error ? error.message : String(error));
      }
    }
  }

  private convertToStreamingEvent(parsed: any): StreamingEvent | null {
    const ts = new Date().toISOString();

    switch (parsed.type) {
      case 'assistant':
        return {
          type: 'assistant_message',
          timestamp: ts,
          data: {
            content: parsed.message?.content,
            usage: parsed.message?.usage,
            sessionId: parsed.session_id
          }
        };

      case 'user':
        return {
          type: 'output',
          timestamp: ts,
          data: {
            content: parsed.message?.content,
            sessionId: parsed.session_id
          }
        };

      case 'result':
        return {
          type: 'session_result',
          timestamp: ts,
          data: {
            success: !parsed.is_error,
            result: parsed.result,
            duration_ms: parsed.duration_ms,
            usage: parsed.usage,
            sessionId: parsed.session_id
          }
        };

      default:
        return null;
    }
  }

  private extractCompleteJSONObjects(): string[] {
    const completeObjects: string[] = [];
    let position = 0;
    
    while (position < this.jsonBuffer.length) {
      const jsonStart = this.findNextJSONStart(position);
      if (jsonStart === -1) {
        this.jsonBuffer = this.jsonBuffer.slice(position);
        break;
      }
      
      const jsonEnd = this.findJSONObjectEnd(jsonStart);
      if (jsonEnd === -1) {
        this.jsonBuffer = this.jsonBuffer.slice(jsonStart);
        break;
      }
      
      const jsonString = this.jsonBuffer.slice(jsonStart, jsonEnd + 1);
      completeObjects.push(jsonString);
      position = jsonEnd + 1;
    }
    
    if (completeObjects.length > 0 && position >= this.jsonBuffer.length) {
      this.jsonBuffer = '';
    }
    
    return completeObjects;
  }

  private findNextJSONStart(fromPosition: number): number {
    for (let i = fromPosition; i < this.jsonBuffer.length; i++) {
      if (this.jsonBuffer[i] === '{') {
        return i;
      }
    }
    return -1;
  }

  private findJSONObjectEnd(startPosition: number): number {
    let braceCount = 0;
    let inString = false;
    let escapeNext = false;
    
    for (let i = startPosition; i < this.jsonBuffer.length; i++) {
      const char = this.jsonBuffer[i];
      
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      
      if (char === '\\') {
        escapeNext = true;
        continue;
      }
      
      if (char === '"') {
        inString = !inString;
        continue;
      }
      
      if (!inString) {
        if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            return i;
          }
        }
      }
    }
    
    return -1;
  }

  send(message: string): void {
    if (!this.child || !this.child.stdin || this.state !== 'ready') {
      console.warn('Cannot send message: connection not ready');
      return;
    }

    // Store user message in thread if we have a thread ID and store
    if (this.threadId && this.store) {
      try {
        console.log(`[DEBUG] Storing user message in thread ${this.threadId}`);
        this.store.addThreadMessage(this.threadId, 'user', message);
      } catch (error) {
        console.warn('Failed to store user message:', error);
      }
    }

    this.sendMessage(message);
  }

  private sendMessage(message: string): void {
    if (!this.child?.stdin) return;

    // Send JSON formatted message for --stream-json-input mode (like Go implementation)
    const messageObj = {
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'text', text: message }]
      }
    };

    const jsonLine = JSON.stringify(messageObj) + '\n';
    this.child.stdin.write(jsonLine);
  }

  async stop(): Promise<void> {
    if (!this.child) return;

    return new Promise((resolve) => {
      this.child.on('close', () => {
        this.state = 'closed';
        this.emit('state', this.state);
        resolve();
      });

      if (this.child.stdin) {
        this.child.stdin.end();
      }
      
      // Force kill after 5 seconds if graceful shutdown fails
      setTimeout(() => {
        if (this.child && !this.child.killed) {
          this.child.kill();
          resolve();
        }
      }, 5000);
    });
  }
}

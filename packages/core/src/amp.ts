import { spawn } from 'child_process';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import type { AmpTelemetry } from '@ampsm/types';
import { TelemetryParser } from './telemetry-parser.js';
import { EnhancedDebugParser } from './enhanced-debug-parser.js';

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

export class AmpAdapter {
  private config: AmpAdapterConfig;
  private telemetryParser = new TelemetryParser();
  public lastUsedArgs?: string[];
  private store?: any;

  constructor(config: AmpAdapterConfig = {}, store?: any) {
    this.config = {
      ampPath: config.ampPath || process.env.AMP_BIN || 'amp',
      ampArgs: config.ampArgs || [],
      enableJSONLogs: config.enableJSONLogs || false, // Default to false for compatibility
      env: config.env,
      extraArgs: config.extraArgs || []
    };
    this.store = store;
  }

  private async hasExistingThread(sessionId: string): Promise<boolean> {
    if (!this.store) return false;
    try {
      const session = this.store.getSession(sessionId);
      // Check if session has threadId AND it's been run before (has lastRun)
      return !!(session?.threadId && session?.lastRun);
    } catch {
      return false;
    }
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
    // For first run, use full prompt with default model. For follow-ups, alternate between default and gpt-5
    const isFirstRun = !sessionId || !(await this.hasExistingThread(sessionId));
    
    if (isFirstRun) {
      const finalPrompt = await this.buildIterationPrompt(prompt, workingDir, sessionId, includeContext);
      return this.runAmpCommand(finalPrompt, workingDir, modelOverride);
    } else {
      // Get existing iterations to determine which model to use (alternate)
      const existingIterations = await this.getIterationCount(sessionId);
      const useGpt5 = existingIterations % 2 === 1; // Odd iterations (2nd, 4th, etc.) use GPT-5
      
      console.log(`🔄 Alternating model logic: existingIterations=${existingIterations}, useGpt5=${useGpt5}, model=${useGpt5 ? 'gpt-5' : 'default'}`);
      
      // Build full conversation context from session follow-up prompts
      const fullContextPrompt = await this.buildContinuePrompt(prompt, sessionId, workingDir, includeContext);
      const alternatingModel = useGpt5 ? 'gpt-5' : undefined; // undefined = default model
      return this.runAmpCommand(fullContextPrompt, workingDir, alternatingModel, sessionId);
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

  private async runAmpCommand(
    finalPrompt: string,
    workingDir: string,
    modelOverride?: string,
    sessionId?: string
  ): Promise<AmpIterationResult> {
    
    return new Promise(async (resolve) => {
      const args = ['-x', ...(this.config.ampArgs || []), ...(this.config.extraArgs || [])];
      
      // Try to enable debug logging for enhanced parsing (with fallback)
      let debugLogFile: string | null = null;
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
        console.log('Debug logging enabled for enhanced metrics parsing');
      } catch (debugSetupError) {
        console.warn('Debug logging unavailable, will use text parsing fallback:', (debugSetupError as Error).message);
        debugLogFile = null;
      }
      
      // Note: Session-specific log files don't capture tool execution details,
      // so we rely on the shared CLI log with timing-based isolation
      
      // Add model override
      if (modelOverride === 'gpt-5') {
        args.push('--try-gpt5');
      } else if (modelOverride === 'alloy') {
        // For alloy mode, we need to set the config instead of a flag
        // This will be handled via environment variable
      } else if (modelOverride) {
        args.push('--model', modelOverride);
      }

      // Note: Real Amp CLI doesn't support --jsonl-logs, so we skip this

      // Add the prompt (use stdin for long prompts)
      console.log('Amp environment check:', {
        AMP_API_KEY: process.env.AMP_API_KEY ? '***exists***' : 'MISSING',
        ampPath: this.config.ampPath,
        modelOverride,
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
      
      // Handle alloy mode via environment variable
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
      
      child.stdout?.on('data', (data) => output += data.toString());
      child.stderr?.on('data', (data) => stderr += data.toString());
      
      // Send prompt via stdin
      if (child.stdin) {
        console.log('Sending prompt to Amp (first 200 chars):', finalPrompt.slice(0, 200));
        child.stdin.write(finalPrompt);
        child.stdin.end();
      }
      
      child.on('close', async (exitCode) => {
        const ampDuration = Date.now() - ampStartTime;
        const fullOutput = output + stderr;
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
        
        // Use enhanced debug parser with fallback to text parsing
        const telemetry = EnhancedDebugParser.parseWithFallback(
          debugLogFile,
          fullOutput,
          exitCode || 0,
          modelOverride
        );
        console.log('Enhanced parsed telemetry:', telemetry);
        
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
      
      // Try to enable debug logging for enhanced parsing (with fallback)
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
        console.log('Oracle debug logging enabled for enhanced metrics parsing');
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
      
      child.stdout?.on('data', (data) => output += data.toString());
      child.stderr?.on('data', (data) => stderr += data.toString());
      
      if (child.stdin) {
        child.stdin.write(oraclePrompt);
        child.stdin.end();
      }
      
      child.on('close', async (exitCode) => {
        const fullOutput = output + stderr;
        const redactedOutput = redactSecrets(fullOutput, this.config.env);
        
        // Use enhanced debug parser with fallback to text parsing
        const telemetry = EnhancedDebugParser.parseWithFallback(
          debugLogFile,
          fullOutput,
          exitCode || 0,
          modelOverride
        );
        console.log('Enhanced parsed oracle telemetry:', telemetry);
        
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

  private async buildContinuePrompt(currentPrompt: string, sessionId?: string, workingDir?: string, includeContext?: boolean): Promise<string> {
    try {
      if (!sessionId) {
        return `/continue\n\n${currentPrompt}`;
      }

      // Get session to retrieve follow-up prompts
      const { SessionStore } = await import('./store.js');
      const sessionStore = new SessionStore();
      const session = sessionStore.getSession(sessionId);
      
      if (!session) {
        return `/continue\n\n${currentPrompt}`;
      }

      const followUpPrompts = session.followUpPrompts || [];
      
      // Build conversation - don't include currentPrompt as it's not stored yet
      let conversationText: string;
      if (followUpPrompts.length === 0) {
        conversationText = `Original Prompt\n${session.ampPrompt}\n\n---\n\nFollow-up Message\n${currentPrompt}`;
      } else {
        const fullConversation = [session.ampPrompt, ...followUpPrompts, currentPrompt];
        conversationText = fullConversation
          .map((p, i) => i === 0 ? `Original Prompt\n${p}` : `Follow-up Message\n${p}`)
          .join('\n\n---\n\n');
      }
      
      let finalPrompt = `/continue\n\n${conversationText}`;
      
      // Include CONTEXT.md if requested and working directory is provided
      if (includeContext && workingDir) {
        const contextMd = await this.safeReadFile(join(workingDir, 'CONTEXT.md'));
        if (contextMd.trim()) {
          finalPrompt += `\n\n${contextMd}`;
        }
      }
      
      return finalPrompt;
    } catch (error) {
      console.warn('Failed to build continue prompt with full context:', error);
      return `/continue\n\n${currentPrompt}`;
    }
  }

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
}

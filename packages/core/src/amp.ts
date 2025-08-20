import { spawn } from 'child_process';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
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

export class AmpAdapter {
  private config: AmpAdapterConfig;
  private telemetryParser = new TelemetryParser();

  constructor(config: AmpAdapterConfig = {}) {
    this.config = {
      ampPath: config.ampPath || process.env.AMP_BIN || 'amp',
      ampArgs: config.ampArgs || [],
      enableJSONLogs: config.enableJSONLogs || false, // Default to false for compatibility
      env: config.env,
      extraArgs: config.extraArgs || []
    };
  }

  async runIteration(
    prompt: string, 
    workingDir: string, 
    modelOverride?: string,
    sessionId?: string
  ): Promise<AmpIterationResult> {
    // Generate iteration prompt with context
    const fullPrompt = await this.buildIterationPrompt(prompt, workingDir, sessionId);
    
    return new Promise((resolve) => {
      const args = ['-x', ...(this.config.ampArgs || []), ...(this.config.extraArgs || [])];
      
      // Add model override
      if (modelOverride === 'gpt-5') {
        args.push('--try-gpt5');
      } else if (modelOverride) {
        args.push('--model', modelOverride);
      }

      // Enable JSON logs if available
      if (this.config.enableJSONLogs) {
        args.push('--jsonl-logs');
      }

      // Add the prompt (use stdin for long prompts)
      console.log('Amp environment check:', {
        AMP_API_KEY: process.env.AMP_API_KEY ? '***exists***' : 'MISSING',
        ampPath: this.config.ampPath,
        args
      });
      
      const child = spawn(this.config.ampPath!, args, {
        cwd: workingDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: this.config.env ? { ...process.env, ...this.config.env } : process.env
      });
      
      let output = '';
      let stderr = '';
      
      child.stdout?.on('data', (data) => output += data.toString());
      child.stderr?.on('data', (data) => stderr += data.toString());
      
      // Send prompt via stdin
      if (child.stdin) {
        console.log('Sending prompt to Amp (first 200 chars):', fullPrompt.slice(0, 200));
        child.stdin.write(fullPrompt);
        child.stdin.end();
      }
      
      child.on('close', (exitCode) => {
        const fullOutput = output + stderr;
        console.log('Amp process output:', { exitCode, stderr: stderr.slice(0, 200) }); // Log first 200 chars of stderr
        const redactedOutput = redactSecrets(fullOutput, this.config.env);
        const telemetry = this.telemetryParser.parseOutput(fullOutput);
        telemetry.exitCode = exitCode || 0;

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
    context?: string
  ): Promise<AmpIterationResult> {
    const oraclePrompt = this.buildOraclePrompt(query, context);
    
    return new Promise((resolve) => {
      const args = [...(this.config.ampArgs || []), ...(this.config.extraArgs || []), '--oracle'];
      
      const child = spawn(this.config.ampPath!, args, {
        cwd: workingDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: this.config.env ? { ...process.env, ...this.config.env } : process.env
      });
      
      let output = '';
      let stderr = '';
      
      child.stdout?.on('data', (data) => output += data.toString());
      child.stderr?.on('data', (data) => stderr += data.toString());
      
      if (child.stdin) {
        child.stdin.write(oraclePrompt);
        child.stdin.end();
      }
      
      child.on('close', (exitCode) => {
        const fullOutput = output + stderr;
        const redactedOutput = redactSecrets(fullOutput, this.config.env);
        const telemetry = this.telemetryParser.parseOutput(fullOutput);
        telemetry.exitCode = exitCode || 0;

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

  private async buildIterationPrompt(prompt: string, workingDir: string, sessionId?: string): Promise<string> {
    try {
      // Read agent context files
      const sessionMd = await this.safeReadFile(join(workingDir, 'AGENT_CONTEXT', 'SESSION.md'));
      const diffSummary = await this.safeReadFile(join(workingDir, 'AGENT_CONTEXT', 'DIFF_SUMMARY.md'));
      
      return `You are improving the Amp Session Manager in this worktree.

Goal:
- ${prompt}

Context:
- Tech: Electron + React + TypeScript + Vite + Tailwind; Node TypeScript backend; SQLite via better-sqlite3.
- This worktree represents a single user session branch.
- You must end with a deterministic commit if any file changes were made.

Constraints:
- Do not modify Amp's source or global environment.
- Prefer standard git, node, pnpm commands.
- Do not read .env or log secrets.
- Keep changes focused; avoid broad refactors unless explicitly requested.

Available references:
- AGENT_CONTEXT/SESSION.md (session briefing)
- AGENT_CONTEXT/DIFF_SUMMARY.md (recent diffs)
- packages/core (session engine, git ops, amp adapter)
- packages/cli (amp-sessions CLI)
- apps/desktop (Electron+React UI)

${sessionMd ? `Session Context:\n${sessionMd}\n` : ''}
${diffSummary && diffSummary !== 'No changes since last iteration.' ? `Recent Changes:\n${diffSummary}\n` : ''}

Definition of done for this iteration:
- Implement the requested change(s).
- All TypeScript compiles; unit tests pass locally.
- Commit message begins with 'amp:' and concisely summarizes what changed.

Now:
- Explain your plan in 3–6 bullet points.
- Make the minimal necessary code changes.
- Update or add tests if needed.
- Run quick self-checks and finalize.`;
    } catch (error) {
      console.warn('Failed to build full iteration prompt:', error);
      return prompt;
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
}

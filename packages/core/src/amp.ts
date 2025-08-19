import { spawn } from 'child_process';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import type { AmpTelemetry } from '@ampsm/types';
import { TelemetryParser } from './telemetry-parser.js';

export interface AmpAdapterConfig {
  ampPath?: string;
  ampArgs?: string[];
  enableJSONLogs?: boolean;
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
      enableJSONLogs: config.enableJSONLogs !== false
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
      const args = [...(this.config.ampArgs || [])];
      
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
      const child = spawn(this.config.ampPath!, args, {
        cwd: workingDir,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let output = '';
      let stderr = '';
      
      child.stdout?.on('data', (data) => output += data.toString());
      child.stderr?.on('data', (data) => stderr += data.toString());
      
      // Send prompt via stdin
      if (child.stdin) {
        child.stdin.write(fullPrompt);
        child.stdin.end();
      }
      
      child.on('close', (exitCode) => {
        const fullOutput = output + stderr;
        const telemetry = this.telemetryParser.parseOutput(fullOutput);
        telemetry.exitCode = exitCode || 0;

        // Check for awaiting input condition
        const awaitingInput = this.detectAwaitingInput(fullOutput);

        resolve({
          success: exitCode === 0,
          output: fullOutput,
          telemetry,
          awaitingInput
        });
      });
      
      child.on('error', (error) => {
        resolve({
          success: false,
          output: `Failed to spawn amp: ${error.message}`,
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
      const args = [...(this.config.ampArgs || []), '--oracle'];
      
      const child = spawn(this.config.ampPath!, args, {
        cwd: workingDir,
        stdio: ['pipe', 'pipe', 'pipe']
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
        const telemetry = this.telemetryParser.parseOutput(fullOutput);
        telemetry.exitCode = exitCode || 0;

        resolve({
          success: exitCode === 0,
          output: fullOutput,
          telemetry,
          awaitingInput: false
        });
      });
      
      child.on('error', (error) => {
        resolve({
          success: false,
          output: `Failed to spawn amp oracle: ${error.message}`,
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

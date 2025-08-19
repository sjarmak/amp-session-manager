export interface Session {
  id: string;
  name: string;
  ampPrompt: string;
  repoRoot: string;
  baseBranch: string;
  branchName: string;
  worktreePath: string;
  status: 'idle' | 'running' | 'awaiting-input' | 'error' | 'done';
  scriptCommand?: string;
  modelOverride?: string;
  createdAt: string;
  lastRun?: string;
  notes?: string;
}

export interface IterationRecord {
  id: string;
  sessionId: string;
  startTime: string;
  endTime?: string;
  commitSha?: string;
  changedFiles: number;
  testResult?: 'pass' | 'fail';
  testExitCode?: number;
  tokenUsage?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  model?: string;
  ampVersion?: string;
  exitCode?: number;
}

export interface ToolCall {
  id: string;
  sessionId: string;
  iterationId: string;
  timestamp: string;
  toolName: string;
  argsJson: string;
  success: boolean;
  durationMs?: number;
  rawJson?: string;
}

export interface AmpTelemetry {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  model?: string;
  ampVersion?: string;
  exitCode: number;
  toolCalls: Array<{
    toolName: string;
    args: Record<string, any>;
    success: boolean;
    durationMs?: number;
    timestamp: string;
  }>;
}

export interface SessionCreateOptions {
  name: string;
  ampPrompt: string;
  repoRoot: string;
  baseBranch?: string;
  scriptCommand?: string;
  modelOverride?: string;
}

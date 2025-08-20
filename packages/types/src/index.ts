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

export interface PreflightResult {
  repoClean: boolean;
  baseUpToDate: boolean;
  testsPass?: boolean;
  typecheckPasses?: boolean;
  aheadBy: number;
  behindBy: number;
  branchpointSha: string;
  ampCommitsCount: number;
  issues: string[];
}

export interface SquashOptions {
  includeManual?: 'include' | 'exclude';
  message: string;
}

export interface RebaseResult {
  status: 'ok' | 'conflict';
  files?: string[];
}

export interface MergeOptions {
  noFF?: boolean;
}

export interface MergeRecord {
  id: string;
  sessionId: string;
  startedAt: string;
  finishedAt?: string;
  baseBranch: string;
  mode: string;
  result: string;
  conflictFiles?: string[];
  squashMessage?: string;
}

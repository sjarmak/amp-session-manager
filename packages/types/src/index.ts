export interface Session {
  id: string;
  name: string;
  ampPrompt: string;
  followUpPrompts?: string[];
  repoRoot: string;
  baseBranch: string;
  branchName: string;
  worktreePath: string;
  status: 'idle' | 'running' | 'awaiting-input' | 'error' | 'done';
  scriptCommand?: string;
  modelOverride?: string;
  threadId?: string;
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
  ampArgs?: string;
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
  threadId?: string;
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

export interface Plan {
  runId?: string;
  concurrency: number;
  defaults: {
    baseBranch: string;
    scriptCommand?: string;
    model?: string;
    jsonLogs?: boolean;
    timeoutSec?: number;
    retries?: number;
    mergeOnPass?: boolean;
  };
  matrix: PlanItem[];
}

export interface PlanItem {
  repo: string;
  prompt: string;
  baseBranch?: string;
  scriptCommand?: string;
  model?: string;
  timeoutSec?: number;
  mergeOnPass?: boolean;
}

export interface BatchRecord {
  runId: string;
  createdAt: string;
  defaultsJson: string;
}

export interface BatchItem {
  id: string;
  runId: string;
  sessionId?: string;
  repo: string;
  prompt: string;
  status: 'queued' | 'running' | 'success' | 'fail' | 'timeout' | 'error';
  error?: string;
  startedAt?: string;
  finishedAt?: string;
  model?: string;
  iterSha?: string;
  tokensTotal?: number;
  toolCalls?: number;
}

export interface ExportOptions {
  runId?: string;
  sessionIds?: string[];
  startDate?: string;
  endDate?: string;
  tables: string[];
  format: 'json' | 'ndjson' | 'csv';
  outDir: string;
}

export interface ReportOptions {
  runId?: string;
  sessionIds?: string[];
  startDate?: string;
  endDate?: string;
  format: 'md' | 'html';
}

// Thread-related types
export interface NormalizedThread {
  id: string;
  url: string;
  repo: string | null;
  branch: string | null;
  latest_commit_sha: string | null;
  created_at: string;
  updated_at: string;
  last_sync_at: string | null;
  source: 'web' | 'cache' | 'logs' | 'git' | 'mixed';
  messages: ThreadMessage[];
  tool_calls: ThreadToolCall[];
  diffs: ThreadDiff[];
  metrics: ThreadMetric[];
}

export interface ThreadMessage {
  id: string;
  thread_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
  idx: number;
}

export interface ThreadToolCall {
  id: string;
  thread_id: string;
  message_id: string | null;
  tool_name: string;
  arguments_json: string;
  started_at: string | null;
  finished_at: string | null;
  status: string | null;
  result_json: string | null;
}

export interface ThreadDiff {
  id: string;
  thread_id: string;
  message_id: string | null;
  file_path: string;
  patch: string;
  created_at: string;
}

export interface ThreadMetric {
  id: number;
  thread_id: string;
  at: string;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_creation_input_tokens: number | null;
  cache_read_input_tokens: number | null;
  inference_duration_ms: number | null;
  tokens_per_second: number | null;
  active_tool_count: number | null;
  file_tracker_records: number | null;
  service_tier: string | null;
  raw_event_json: string;
}

export interface ThreadStore {
  upsertThread(thread: Partial<NormalizedThread> & { id: string }, options?: { skipIfNewer?: boolean }): Promise<void>;
  upsertMessage(message: ThreadMessage): Promise<void>;
  upsertMessages(messages: ThreadMessage[]): Promise<void>;
  upsertToolCall(toolCall: ThreadToolCall): Promise<void>;
  upsertToolCalls(toolCalls: ThreadToolCall[]): Promise<void>;
  upsertDiff(diff: ThreadDiff): Promise<void>;
  upsertDiffs(diffs: ThreadDiff[]): Promise<void>;
  insertMetric(metric: Omit<ThreadMetric, 'id'>): Promise<void>;
  insertMetrics(metrics: Array<Omit<ThreadMetric, 'id'>>): Promise<void>;
  getThread(id: string): NormalizedThread | null;
  getAllThreads(limit?: number): NormalizedThread[];
  getFullThread(id: string): NormalizedThread | null;
  searchThreads(query: string, limit?: number): Array<{
    id: string;
    url: string;
    repo: string | null;
    branch: string | null;
    updated_at: string;
    message_count: number;
    tool_call_count: number;
    diff_count: number;
  }>;
  getRecentThreads(hours?: number, limit?: number): NormalizedThread[];
  deleteThread(id: string): void;
}

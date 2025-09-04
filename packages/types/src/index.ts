export interface Session {
  id: string;
  name: string;
  ampPrompt?: string;
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
  mode?: 'async' | 'interactive';
  autoCommit?: boolean; // If false, stage changes instead of committing them
  ampMode?: 'production' | 'local-cli' | 'local-server';
  agentId?: string;
  agentMode?: number;
  multiProvider?: number;
  alloyMode?: number;
  autoRoute?: number;
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
  output?: string;
  cliToolUsageCount?: number;
  cliErrorCount?: number;
  cliLogDurationMs?: number;
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
  ampPrompt?: string;
  repoRoot: string;
  baseBranch?: string;
  scriptCommand?: string;
  modelOverride?: string;
  threadId?: string;
  mode?: "async" | "interactive";
  autoCommit?: boolean;
  ampMode?: 'production' | 'local-cli' | 'local-server';
  agentId?: string;
  agentMode?: number;
  multiProvider?: number;
  alloyMode?: number;
  autoRoute?: number;
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
    ampMode?: 'production' | 'local-cli';
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
  ampMode?: 'production' | 'local-cli';
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
  threadId?: string;
  repo: string;
  prompt: string;
  status: 'queued' | 'running' | 'success' | 'fail' | 'timeout' | 'error';
  error?: string;
  startedAt?: string;
  finishedAt?: string;
  model?: string;
  matrixIndex?: number;
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

// SWE-bench types
export interface SweBenchCase {
  id: string;                // e.g. "apache#1234"
  repo: string;              // gh slug, used to locate local mirror
  bugCommit: string;         // SHA the tests fail on
  fixCommit: string;         // golden patch SHA (used only for diff metrics)
  testPath: string;          // tests/foo/test_bar.py::TestBaz::test_qux
  prompt: string;            // Provided by dataset, fallback = template
}

export interface SweBenchRun {
  id: string;
  name: string;
  casesDir: string;          // folder user pointed at
  createdAt: string;
  total: number;
  completed: number;
  passed: number;
  failed: number;
  status: "running"|"done"|"aborted";
}

export interface SweBenchCaseResult {
  runId: string;
  caseId: string;
  sessionId: string;         // FK → sessions table
  status: "pass"|"fail";
  iterations: number;
  wallTimeSec: number;
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
  ampMode?: 'production' | 'local-cli' | 'local-server';
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

// Session-Thread Relationship Types
export interface SessionThread {
  id: string;
  sessionId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  status: 'active' | 'archived' | 'completed';
  messageCount?: number;
  ampMode?: 'production' | 'local-cli' | 'local-server';
}

export interface SessionThreadMessage {
  id: string;
  threadId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  idx: number;
}

export interface AmpRuntimeConfig {
  ampCliPath?: string;
  ampServerUrl?: string; // e.g., "http://localhost:7002"
}

export interface AmpSettings {
  mode: 'production' | 'local-cli' | 'local-server';
  localCliPath?: string;
  serverUrl?: string;
}

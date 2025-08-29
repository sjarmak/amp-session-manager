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
  iterations?: Iteration[];
}

export interface Iteration {
  id: string;
  sessionId: string;
  prompt: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  startedAt: string;
  completedAt?: string;
  errorMessage?: string;
  threadId?: string;
  metrics?: IterationMetrics;
  commitSha?: string;
  changedFiles?: string[];
}

export interface IterationMetrics {
  tokenUsage: {
    input: number;
    output: number;
    total: number;
  };
  costCents: number;
  durationMs: number;
  model: string;
}

export interface Thread {
  id: string;
  title: string;
  createdAt: string;
  lastMessageAt: string;
  messageCount: number;
  status: 'active' | 'completed' | 'error';
  model?: string;
}

export interface ThreadMessage {
  id: string;
  threadId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  metadata?: {
    tokenUsage?: {
      input: number;
      output: number;
    };
    model?: string;
    costCents?: number;
  };
}

export interface Repository {
  path: string;
  name: string;
  branch: string;
  isGitRepo: boolean;
  hasRemote: boolean;
  remoteUrl?: string;
  lastCommit?: {
    hash: string;
    message: string;
    author: string;
    date: string;
  };
}

export interface Config {
  id: string;
  name: string;
  model: string;
  scriptCommand?: string;
  baseBranch: string;
  notes?: string;
  createdAt: string;
}

export interface ApiResponse<T> {
  data: T;
  success: boolean;
  error?: string;
}

export interface StreamMessage {
  type: 'log' | 'error' | 'status' | 'metrics' | 'diff';
  timestamp: string;
  data: any;
}

export interface SessionDiff {
  files: Array<{
    path: string;
    status: 'added' | 'modified' | 'deleted';
    additions: number;
    deletions: number;
    patch?: string;
  }>;
  summary: {
    totalFiles: number;
    totalAdditions: number;
    totalDeletions: number;
  };
}

export interface CreateSessionRequest {
  name: string;
  ampPrompt: string;
  repoRoot: string;
  baseBranch?: string;
  scriptCommand?: string;
  modelOverride?: string;
  notes?: string;
}

export interface IterateSessionRequest {
  prompt?: string;
  continueFromThread?: string;
}

export interface CreateThreadMessageRequest {
  content: string;
  role?: 'user';
}

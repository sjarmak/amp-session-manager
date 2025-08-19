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
}

export interface SessionCreateOptions {
  name: string;
  ampPrompt: string;
  repoRoot: string;
  baseBranch?: string;
  scriptCommand?: string;
  modelOverride?: string;
}

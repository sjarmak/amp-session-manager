export interface AmpTraceEvent {
  id: string;                    // nanoid for unique span identification
  parentId?: string;            // for nested operations
  sessionId: string;            // link to session
  tsStart: number;              // performance.now()
  tsEnd?: number;
  type: 'agent' | 'tool' | 'git' | 'eval' | 'workflow' | 'ui';
  name: string;                 // e.g., 'openai:chat', 'git:commit', 'test:run'
  attrs: Record<string, any>;   // tokens, cost, model, exitCode, etc.
  status: 'running' | 'success' | 'error' | 'cancelled';
  errorMessage?: string;
  stackTrace?: string;
}

export interface CostMetrics {
  tokensIn: number;
  tokensOut: number;
  costUSD: number;
  model: string;
  provider: 'openai' | 'anthropic' | 'local';
}

export interface SessionMetrics {
  sessionId: string;
  totalCost: number;
  totalTokensIn: number;
  totalTokensOut: number;
  iterationCount: number;
  avgIterationCost: number;
  avgIterationTokens: number;
  duration: number;
  successRate: number;
  errorCount: number;
  lastUpdated: number;
}

export interface EvalResult {
  id: string;
  name: string;
  score: number;        // 0-100
  passed: boolean;
  duration: number;
  details?: any;
  error?: string;
}

export interface EvalConfig {
  name: string;
  script: string;       // path to JS/TS file or inline code
  weight: number;       // for weighted scoring
  timeout: number;      // milliseconds
  required: boolean;    // blocks merge if fails
}

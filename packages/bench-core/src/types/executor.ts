import { CaseResult, BenchmarkCase, ModelConfig, BenchmarkDefaults } from './benchmark.js'
// Types will be injected from the desktop app which has access to @ampsm/core

/**
 * Context passed to all executors
 */
export interface ExecutorContext {
  case: BenchmarkCase
  model: ModelConfig
  defaults: BenchmarkDefaults
  workingDir: string
  outputDir: string
  ampSettings?: any
  
  // Session analytics integration (types injected from desktop app)
  sessionStore?: any
  metricsBus?: any
  sessionId?: string
}

/**
 * Base executor interface
 */
export interface Executor {
  execute(context: ExecutorContext): Promise<CaseResult>
}

/**
 * Registry of available executors
 */
export type ExecutorRegistry = Record<string, Executor>

/**
 * Event types for streaming execution updates
 */
export interface ExecutorEvent {
  type: 'case_started' | 'case_progress' | 'case_completed' | 'case_failed'
  caseId: string
  model: string
  timestamp: string
  data?: any
}

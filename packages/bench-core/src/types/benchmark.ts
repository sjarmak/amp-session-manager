/**
 * Unified benchmark specification types for v2 format
 */

export interface BenchmarkSpecV2 {
  version: 2
  name: string
  description?: string
  defaults: BenchmarkDefaults
  models: Record<string, ModelConfig>
  metrics: string[]
  suites: BenchmarkSuite[]
}

export interface BenchmarkDefaults {
  base_branch?: string
  parallel?: number
  max_iterations?: number
  timeout_sec?: number
  json_logs?: boolean
  merge_on_pass?: boolean
  amp_server_url?: string
}

export interface ModelConfig {
  name: string
  amp_args?: string[]
  amp_cli_path?: string
}

export interface BenchmarkSuite {
  id: string
  description?: string
  swebench_cases_dir?: string
  max_iterations?: number
  timeout_sec?: number
  cases?: BenchmarkCase[]
}

export interface BenchmarkCase {
  id: string
  kind?: 'qa' | 'session' | 'swebench'
  
  // Common fields
  timeout_sec?: number
  amp_args?: string[]
  
  // QA executor fields
  eval_spec?: string
  
  // Session executor fields
  repo?: string
  prompt?: string
  script_command?: string
  setup_script?: string
  follow_up_prompts?: string[]
  
  // Model overrides
  amp_cli_path?: string
}

/**
 * Common result interface for all executors
 */
export interface CaseResult {
  id: string
  model: string
  kind: 'qa' | 'session' | 'swebench'
  started: string // ISO date
  ended: string // ISO date
  duration_sec: number
  passed: boolean
  metrics: Record<string, number | string>
  artifacts?: string[] // paths to result files, logs, diffs
  error?: string
  
  // Session analytics fields
  session_id?: string
  tokens_prompt?: number
  tokens_completion?: number
  total_cost_usd?: number
  judge?: { score: number; notes: string } | null
}

export interface BenchmarkResult {
  benchmark_name: string
  started: string
  ended: string
  total_duration_sec: number
  config_file?: string
  cases: CaseResult[]
  summary: {
    total_cases: number
    passed_cases: number
    success_rate: number
    total_prompt_tokens?: number
    total_completion_tokens?: number
    total_cost_usd?: number
    by_model: Record<string, ModelSummary>
  }
}

export interface ModelSummary {
  total_cases: number
  passed_cases: number
  success_rate: number
  avg_duration_sec: number
  metrics: Record<string, number>
}

/**
 * Legacy Amp eval spec types (for QA executor)
 */
export interface LegacyEvalSpec {
  repo: string
  rev: string
  cwd?: string
  questions: LegacyEvalQuestion[]
}

export interface LegacyEvalQuestion {
  input: string
  expectedOutput: string | string[]
  output?: string
  outputCmd?: string
  error?: string
  durationMs?: number
  grade?: LegacyEvalGrade
}

export interface LegacyEvalGrade {
  score: string // "n/m" for arrays, "0-100" for strings
  passed: number // number that passed for arrays, 0-100 for strings
  total: number // total number for arrays, 100 for strings
  reasoning: string
  itemResults?: Array<{
    expectedItem: string
    passed: boolean
    reasoning: string
  }>
}

export interface LegacyEvalResult {
  repo: string
  rev: string
  questions: LegacyEvalQuestion[]
}

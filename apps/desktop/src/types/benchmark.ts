// Re-export types from bench-core for desktop app
export * from '@ampsm/bench-core'

// Additional desktop-specific interfaces
export interface DesktopBenchmarkRun {
  runId: string
  type: 'swebench' | 'yaml' | 'qa' | 'session'
  createdAt: string
  name: string
  status: 'running' | 'completed' | 'failed'
  
  // v2 benchmark result fields
  benchmark_name?: string
  started?: string
  ended?: string
  total_duration_sec?: number
  
  // Legacy fields for backwards compatibility
  casesDir?: string
  totalCases: number
  completedCases: number
  passedCases: number
  failedCases: number
  
  // Enhanced fields
  models?: string[]
  suites?: string[]
  outputDir?: string
  reportFormats?: string[]
  
  // Session analytics fields
  totalTokens?: number
  totalCost?: number
}

export interface BenchmarkStartOptions {
  type: 'swebench' | 'yaml' | 'qa' | 'session'
  
  // SWE-bench options
  casesDir?: string
  parallel?: number
  maxIterations?: number
  timeoutSec?: number
  filter?: string
  
  // YAML benchmark options
  yamlConfigPath?: string
  models?: string[]
  dryRun?: boolean
  
  // Common options
  name?: string
}

export interface NewBenchmarkModalProps {
  isOpen: boolean
  onClose: () => void
  onStart: (options: BenchmarkStartOptions) => void
}

export interface BenchmarkDetailProps {
  runId: string
  type: string
  onBack: () => void
}

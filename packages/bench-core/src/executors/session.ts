import { join } from 'node:path'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { execFileSync, spawn } from 'node:child_process'
import { v4 as uuidv4 } from 'uuid'

import { Executor, ExecutorContext } from '../types/executor.js'
import { CaseResult } from '../types/benchmark.js'

/**
 * Session Executor - handles complex multi-iteration session-based benchmarks
 * This is a simplified version of the WorktreeManager specifically for benchmarking
 */
export class SessionExecutor implements Executor {
  async execute(context: ExecutorContext): Promise<CaseResult> {
    const startTime = new Date()
    const caseId = context.case.id
    const modelName = context.model.name

    if (!context.case.repo || !context.case.prompt) {
      throw new Error(`Session case ${caseId} missing required fields: repo, prompt`)
    }

    // Create session workspace
    const sessionId = uuidv4().slice(0, 8)
    const sessionDir = join(context.outputDir, `${caseId}_${modelName}_${sessionId}`)
    mkdirSync(sessionDir, { recursive: true })

    try {
      // Resolve repo path relative to working directory
      const repoPath = context.case.repo.startsWith('/') 
        ? context.case.repo 
        : join(context.workingDir, context.case.repo)
      
      // Run setup script first if provided (to create repo structure)
      if (context.case.setup_script) {
        await this.runScript(context.case.setup_script, context.workingDir, 'setup')
      }

      // Setup git worktree
      const worktreePath = await this.setupWorktree(repoPath, sessionDir, sessionId)

      // Execute the main session iterations
      const iterations = await this.runIterations(
        context.case.prompt,
        context.case.follow_up_prompts || [],
        worktreePath,
        context.model,
        context.case,
        context.defaults.max_iterations || 10,
        context.case.timeout_sec || context.defaults.timeout_sec || 900
      )

      // Run test/validation script
      let testResult = false
      if (context.case.script_command) {
        testResult = await this.runTestScript(context.case.script_command, worktreePath)
      }

      // Collect metrics
      const metrics = this.calculateMetrics(iterations, testResult)

      const endTime = new Date()
      const duration = (endTime.getTime() - startTime.getTime()) / 1000

      return {
        id: caseId,
        model: modelName,
        kind: 'session',
        started: startTime.toISOString(),
        ended: endTime.toISOString(),
        duration_sec: duration,
        passed: testResult,
        metrics,
        artifacts: [sessionDir, join(sessionDir, 'session.log')]
      }

    } catch (error) {
      const endTime = new Date()
      const duration = (endTime.getTime() - startTime.getTime()) / 1000

      return {
        id: caseId,
        model: modelName,
        kind: 'session',
        started: startTime.toISOString(),
        ended: endTime.toISOString(),
        duration_sec: duration,
        passed: false,
        metrics: { error: 1 },
        error: error instanceof Error ? error.message : String(error),
        artifacts: [sessionDir]
      }
    }
  }

  private async setupWorktree(repoPath: string, sessionDir: string, sessionId: string): Promise<string> {
    // Determine if it's a local path or remote repo
    const isLocalPath = repoPath.startsWith('/') || repoPath.startsWith('./') || repoPath.startsWith('../')
    
    let targetRepo: string
    if (isLocalPath) {
      targetRepo = repoPath
    } else {
      // For benchmark temporary repos, we need to create them first
      targetRepo = repoPath
    }

    // For temporary repositories that don't exist yet, create a simple git repo
    if (!existsSync(targetRepo)) {
      // Check if this is a temp repo path - if so, create it
      if (targetRepo.includes('temp-repos/') || targetRepo.includes('evals/')) {
        mkdirSync(targetRepo, { recursive: true })
        
        // Initialize git repo with main branch
        execFileSync('git', ['init', '-b', 'main'], {
          cwd: targetRepo,
          stdio: 'pipe'
        })
        
        // Create initial commit
        writeFileSync(join(targetRepo, 'README.md'), `# Benchmark Test Repository\n\nTemporary repository for benchmark case.`)
        execFileSync('git', ['add', '.'], {
          cwd: targetRepo,
          stdio: 'pipe'
        })
        execFileSync('git', ['-c', 'user.email=benchmark@test.com', '-c', 'user.name=Benchmark', 'commit', '-m', 'Initial benchmark setup'], {
          cwd: targetRepo,
          stdio: 'pipe'
        })
      } else {
        throw new Error(`Repository not found: ${targetRepo}`)
      }
    }

    // Create worktree
    const timestamp = Date.now()
    const branchName = `amp-bench-${sessionId}-${timestamp}`
    const worktreePath = join(sessionDir, 'worktree')

    try {
      // Create worktree and branch atomically to avoid conflicts
      // This creates the branch and worktree in one step without checking out the branch in main working tree
      execFileSync('git', ['worktree', 'add', '-b', branchName, worktreePath, 'main'], {
        cwd: targetRepo,
        stdio: 'pipe'
      })

      return worktreePath
    } catch (error) {
      throw new Error(`Failed to setup worktree: ${error}`)
    }
  }

  private async runIterations(
    initialPrompt: string,
    followUpPrompts: string[],
    worktreePath: string,
    model: any,
    caseConfig: any,
    maxIterations: number,
    timeoutSec: number
  ): Promise<IterationResult[]> {
    const iterations: IterationResult[] = []
    const sessionLogPath = join(worktreePath, '..', 'session.log')
    
    const allPrompts = [initialPrompt, ...followUpPrompts]
    
    for (let i = 0; i < Math.min(allPrompts.length, maxIterations); i++) {
      const prompt = allPrompts[i]
      const iterationStart = new Date()

      try {
        this.logMessage(sessionLogPath, `=== Iteration ${i + 1} ===`)
        this.logMessage(sessionLogPath, `Prompt: ${prompt}`)

        const result = await this.runAmpIteration(
          prompt,
          worktreePath,
          model,
          caseConfig,
          timeoutSec
        )

        const iterationEnd = new Date()
        const duration = (iterationEnd.getTime() - iterationStart.getTime()) / 1000

        const iteration: IterationResult = {
          number: i + 1,
          prompt,
          duration_sec: duration,
          success: result.success,
          output: result.output,
          tokens: result.tokens || 0,
          error: result.error
        }

        iterations.push(iteration)
        
        this.logMessage(sessionLogPath, `Result: ${result.success ? 'SUCCESS' : 'FAILED'}`)
        this.logMessage(sessionLogPath, `Duration: ${duration}s`)
        this.logMessage(sessionLogPath, `Output: ${result.output}`)
        
        if (result.error) {
          this.logMessage(sessionLogPath, `Error: ${result.error}`)
        }

        // If this iteration failed, stop early
        if (!result.success) {
          break
        }

      } catch (error) {
        const iterationEnd = new Date()
        const duration = (iterationEnd.getTime() - iterationStart.getTime()) / 1000

        iterations.push({
          number: i + 1,
          prompt,
          duration_sec: duration,
          success: false,
          output: '',
          tokens: 0,
          error: error instanceof Error ? error.message : String(error)
        })

        this.logMessage(sessionLogPath, `Iteration ${i + 1} failed: ${error}`)
        break
      }
    }

    return iterations
  }

  private async runAmpIteration(
    prompt: string,
    worktreePath: string,
    model: any,
    caseConfig: any,
    timeoutSec: number
  ): Promise<{ success: boolean; output: string; tokens?: number; error?: string }> {
    const ampArgs = [
      ...(model.amp_args || []),
      ...(caseConfig.amp_args || []),
      '-x', // Execute mode
      prompt
    ]

    try {
      const output = execFileSync('amp', ampArgs, {
        cwd: worktreePath,
        encoding: 'utf-8',
        timeout: timeoutSec * 1000,
        stdio: ['pipe', 'pipe', 'pipe']
      })

      // TODO: Parse tokens from output if using --stream-json
      const tokens = this.extractTokensFromOutput(output)

      return {
        success: true,
        output: output.trim(),
        tokens
      }

    } catch (error: any) {
      return {
        success: false,
        output: error.stdout || '',
        error: error.message || 'Unknown error'
      }
    }
  }

  private async runScript(script: string, worktreePath: string, label: string): Promise<void> {
    try {
      execFileSync('bash', ['-c', script], {
        cwd: worktreePath,
        stdio: 'pipe'
      })
    } catch (error) {
      throw new Error(`${label} script failed: ${error}`)
    }
  }

  private async runTestScript(scriptCommand: string, worktreePath: string): Promise<boolean> {
    try {
      execFileSync('bash', ['-c', scriptCommand], {
        cwd: worktreePath,
        stdio: 'pipe'
      })
      return true
    } catch (error) {
      return false
    }
  }

  private extractTokensFromOutput(output: string): number {
    // Try to extract token usage from amp output
    // This is a simplified version - in reality we'd parse JSON logs
    const tokenMatch = output.match(/total_tokens[\"':]?\s*(\d+)/i)
    return tokenMatch ? parseInt(tokenMatch[1], 10) : 0
  }

  private calculateMetrics(iterations: IterationResult[], testPassed: boolean): Record<string, number | string> {
    const successfulIterations = iterations.filter(i => i.success).length
    const totalDuration = iterations.reduce((sum, i) => sum + i.duration_sec, 0)
    const totalTokens = iterations.reduce((sum, i) => sum + i.tokens, 0)

    return {
      total_iterations: iterations.length,
      successful_iterations: successfulIterations,
      iteration_success_rate: iterations.length > 0 ? successfulIterations / iterations.length : 0,
      total_duration_sec: totalDuration,
      avg_iteration_duration: iterations.length > 0 ? totalDuration / iterations.length : 0,
      total_tokens: totalTokens,
      test_passed: testPassed ? '1' : '0'
    }
  }

  private logMessage(logPath: string, message: string): void {
    const timestamp = new Date().toISOString()
    const logLine = `[${timestamp}] ${message}\n`
    writeFileSync(logPath, logLine, { flag: 'a' })
  }
}

interface IterationResult {
  number: number
  prompt: string
  duration_sec: number
  success: boolean
  output: string
  tokens: number
  error?: string
}

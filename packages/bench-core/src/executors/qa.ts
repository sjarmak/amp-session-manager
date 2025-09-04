import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { parse, stringify } from 'yaml'
import { v4 as uuidv4 } from 'uuid'

import { Executor, ExecutorContext } from '../types/executor.js'
import { CaseResult, LegacyEvalSpec, LegacyEvalResult } from '../types/benchmark.js'

/**
 * QA Executor - wraps Amp's legacy run-eval.ts and grade.ts system
 */
export class QAExecutor implements Executor {
  private context?: ExecutorContext

  async execute(context: ExecutorContext): Promise<CaseResult> {
    this.context = context
    const startTime = new Date()
    const caseId = context.case.id
    const modelName = context.model.name

    if (!context.case.eval_spec) {
      throw new Error(`QA case ${caseId} missing eval_spec field`)
    }

    // Resolve eval spec path
    const evalSpecPath = context.case.eval_spec.startsWith('/')
      ? context.case.eval_spec
      : join(context.workingDir, context.case.eval_spec)

    try {
      // Read the legacy eval spec
      const evalSpecContent = readFileSync(evalSpecPath, 'utf-8')
      const evalSpec: LegacyEvalSpec = parse(evalSpecContent)

      // Store questions and answers in session if available
      if (context.sessionStore && context.sessionId) {
        // Create a thread for this QA evaluation
        const threadId = context.sessionStore.createThread(
          context.sessionId, 
          `QA Evaluation: ${caseId}`
        )
        
        // Store initial context message
        context.sessionStore.addThreadMessage(
          threadId,
          'system',
          `Starting QA evaluation for case: ${caseId}\nModel: ${modelName}\nQuestions: ${evalSpec.questions.length}`
        )
      }

      // Prepare output directory
      const runId = uuidv4().slice(0, 8)
      const outputDir = join(context.outputDir, `${caseId}_${modelName}_${runId}`)
      mkdirSync(outputDir, { recursive: true })

      // Run eval with model-specific args
      const ampArgs = [
        ...(context.model.amp_args || []),
        ...(context.case.amp_args || [])
      ]

      const resultPath = await this.runEval(evalSpecPath, outputDir, ampArgs, context.case.timeout_sec)

      // Grade the results
      const gradedResultPath = await this.gradeResults(resultPath)

      // Parse results and extract metrics
      const gradedContent = readFileSync(gradedResultPath, 'utf-8')
      const gradedResult: LegacyEvalResult = JSON.parse(gradedContent)

      // Store Q&A pairs and grades in session
      if (context.sessionStore && context.sessionId) {
        const threadId = context.sessionStore.createThread(
          context.sessionId,
          `QA Results: ${caseId}`
        )
        
        for (const question of gradedResult.questions) {
          // Store question
          context.sessionStore.addThreadMessage(
            threadId,
            'user',
            question.input
          )
          
          // Store answer or error
          if (question.output) {
            context.sessionStore.addThreadMessage(
              threadId,
              'assistant',
              question.output
            )
          } else if (question.error) {
            context.sessionStore.addThreadMessage(
              threadId,
              'assistant',
              `Error: ${question.error}`
            )
          }
          
          // Store grade information
          if (question.grade) {
            context.sessionStore.addThreadMessage(
              threadId,
              'system',
              JSON.stringify({
                type: 'evaluation',
                score: question.grade.score,
                passed: question.grade.passed,
                total: question.grade.total,
                reasoning: question.grade.reasoning
              })
            )
          }
        }
      }

      const metrics = this.extractMetrics(gradedResult)
      const passed = this.calculatePassed(gradedResult)
      
      // Calculate judge score for session analytics
      const questionsWithGrades = gradedResult.questions.filter(q => q.grade)
      const totalPassed = questionsWithGrades.reduce((sum, q) => sum + (q.grade?.passed || 0), 0)
      const totalPoints = questionsWithGrades.reduce((sum, q) => sum + (q.grade?.total || 0), 0)
      const judgeScore = totalPoints > 0 ? (totalPassed / totalPoints) * 100 : 0
      
      const judgeNotes = questionsWithGrades
        .filter(q => q.grade?.reasoning)
        .map(q => `${q.input}: ${q.grade!.reasoning}`)
        .join('\n')

      const endTime = new Date()

      return {
        id: caseId,
        model: modelName,
        kind: 'qa',
        started: startTime.toISOString(),
        ended: endTime.toISOString(),
        duration_sec: (endTime.getTime() - startTime.getTime()) / 1000,
        passed,
        metrics,
        artifacts: [resultPath, gradedResultPath],
        session_id: context.sessionId,
        // TODO: Extract actual token usage from amp CLI output
        judge: judgeScore > 0 ? { score: judgeScore, notes: judgeNotes } : null
      }

    } catch (error) {
      const endTime = new Date()
      
      return {
        id: caseId,
        model: modelName,
        kind: 'qa',
        started: startTime.toISOString(),
        ended: endTime.toISOString(),
        duration_sec: (endTime.getTime() - startTime.getTime()) / 1000,
        passed: false,
        metrics: {},
        error: error instanceof Error ? error.message : String(error),
        session_id: context.sessionId
      }
    }
  }

  private async runEval(evalSpecPath: string, outputDir: string, ampArgs: string[], timeoutSec?: number): Promise<string> {
    const runId = Date.now().toString()
    const resultPath = join(outputDir, `result.${runId}.json`)

    // Read and parse the YAML eval spec in the parent process
    const evalSpecContent = readFileSync(evalSpecPath, 'utf-8')
    const evalSpec = parse(evalSpecContent)
    
    // Create JSON version for the script to use
    const jsonEvalSpecPath = join(outputDir, 'eval-spec.json')
    writeFileSync(jsonEvalSpecPath, JSON.stringify(evalSpec, null, 2))

    // Create a temporary run-eval script that outputs to our desired location
    const tempScriptPath = join(outputDir, 'run-eval.cjs')
    const runEvalScript = this.generateRunEvalScript(jsonEvalSpecPath, resultPath, ampArgs, timeoutSec || 300, this.context?.ampSettings)
    writeFileSync(tempScriptPath, runEvalScript)

    try {
      // Execute the eval script from the project root where node_modules is available
      const projectRoot = this.findProjectRoot()
      execFileSync('node', [tempScriptPath], {
        cwd: projectRoot,
        timeout: (timeoutSec || 900) * 1000, // Convert to ms
        stdio: 'inherit'
      })

      return resultPath
    } catch (error) {
      throw new Error(`Failed to run eval: ${error}`)
    }
  }

  private async gradeResults(resultPath: string): Promise<string> {
    const outputDir = dirname(resultPath)
    const gradedPath = resultPath.replace('.json', '-graded.json')

    // Create a temporary grade script
    const tempGradeScript = join(outputDir, 'grade.cjs')
    const gradeScript = this.generateGradeScript(resultPath, gradedPath)
    writeFileSync(tempGradeScript, gradeScript)

    try {
      // Execute the grade script from the project root where node_modules is available
      const projectRoot = this.findProjectRoot()
      execFileSync('node', [tempGradeScript], {
        cwd: projectRoot,
        timeout: 300000, // 5 minutes
        stdio: 'inherit',
        env: { ...process.env, OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY }
      })

      return gradedPath
    } catch (error) {
      throw new Error(`Failed to grade results: ${error}`)
    }
  }

  private generateRunEvalScript(evalSpecPath: string, outputPath: string, ampArgs: string[], timeoutSec: number, ampSettings?: any): string {
    // Build command array for amp CLI
    const commandArray = []
    
    // Add CLI path if using local CLI
    if (ampSettings?.localCliPath && (ampSettings?.mode === 'local-cli' || ampSettings?.mode === 'local-server')) {
      commandArray.push(ampSettings.localCliPath)
    } else {
      commandArray.push('amp')
    }
    
    // Add server URL if using local server mode (not needed for local CLI)
    if (ampSettings?.mode === 'local-server' && ampSettings?.localServerUrl) {
      commandArray.push('--server', ampSettings.localServerUrl)
    }
    
    // Add any additional amp arguments
    commandArray.push(...ampArgs)
    
    return `
const { execFileSync } = require('node:child_process')
const { readFileSync, writeFileSync } = require('node:fs')

const evalSpec = JSON.parse(readFileSync('${evalSpecPath}', 'utf-8'))
const results = {
  repo: evalSpec.repo,
  rev: evalSpec.rev,
  questions: []
}

console.log(\`Running \${evalSpec.questions.length} eval questions...\`)

for (let i = 0; i < evalSpec.questions.length; i++) {
  const question = evalSpec.questions[i]
  console.log(\`=== Question \${i + 1}/\${evalSpec.questions.length} ===\`)
  console.log(\`Input: \${question.input}\`)

  if (question.output !== undefined) {
    console.log('Skipping - output already exists')
    results.questions.push(question)
    continue
  }

  const startTime = performance.now()
  let actualOutput, errorMessage, durationMs
  
  const ampCommand = ${JSON.stringify(commandArray)}
  const fullCommand = [...ampCommand, '-x', question.input]
  console.log(\`Running: \${fullCommand.join(' ')}\`)

  try {
    const executable = ${(ampSettings?.localCliPath && (ampSettings?.mode === 'local-cli' || ampSettings?.mode === 'local-server')) ? JSON.stringify('node') : JSON.stringify('amp')}
    
    // Set up environment variables for local development
    const env = { ...process.env }
    ${ampSettings?.mode === 'local-server' && ampSettings?.localServerUrl ? `
    env.AMP_URL = '${ampSettings.localServerUrl}'
    env.NODE_TLS_REJECT_UNAUTHORIZED = '0'` : ''}
    ${ampSettings?.mode === 'local-cli' && ampSettings?.localCliPath ? `
    env.AMP_URL = 'https://localhost:7002'
    env.NODE_TLS_REJECT_UNAUTHORIZED = '0'` : ''}
    
    actualOutput = execFileSync(executable, fullCommand, {
      encoding: 'utf-8',
      timeout: ${timeoutSec * 1000},
      stdio: ['pipe', 'pipe', 'inherit'],
      cwd: evalSpec.cwd || process.cwd(),
      env
    }).trim()
    
    const endTime = performance.now()
    durationMs = Math.round(endTime - startTime)
    console.log(\`Actual output: \${actualOutput}\`)
    console.log(\`Duration: \${durationMs}ms\`)
  } catch (error) {
    const endTime = performance.now()
    durationMs = Math.round(endTime - startTime)
    errorMessage = error.code === 'ETIMEDOUT' ? 'Command timed out' : error.message
    console.log(\`Error: \${errorMessage}\`)
  }

  results.questions.push({
    input: question.input,
    expectedOutput: question.expectedOutput,
    output: actualOutput,
    error: errorMessage,
    durationMs,
    outputCmd: \`\${ampCommand.join(' ')} -x\`
  })
}

writeFileSync('${outputPath}', JSON.stringify(results, null, 2))
console.log('Results written to ${outputPath}')
`
  }

  private generateGradeScript(resultPath: string, outputPath: string): string {
    return `
const { readFileSync, writeFileSync } = require('node:fs')

async function gradeSingleItem(input, expectedItem, actualOutput) {
  const systemPrompt = \`You are an expert evaluator for AI-generated responses. Your task is to determine if an actual output adequately covers a specific expected point.

Instructions:
1. Compare the actual output against the single expected point
2. Consider partial matches, alternative phrasings, and equivalent information
3. Be generous with partial credit for alternative but equivalent answers
4. Return true if the expected point is reasonably covered, false if not

Respond in JSON format:
{
  "passed": <true/false>,
  "reasoning": "<brief explanation>"
}\`

  const userPrompt = \`Question: \${input}

Expected Point: \${expectedItem}

Actual Output:
\${actualOutput}

Does the actual output adequately cover the expected point?\`

  try {
    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY environment variable is required')
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': \`Bearer \${apiKey}\`,
        'HTTP-Referer': 'https://github.com/sourcegraph/amp',
        'X-Title': 'Amp Bench QA Grader'
      },
      body: JSON.stringify({
        model: 'anthropic/claude-3.5-haiku',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1
      })
    })

    if (!response.ok) {
      throw new Error(\`HTTP \${response.status}: \${response.statusText}\`)
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content
    if (!content) {
      throw new Error('No content in OpenRouter response')
    }

    const result = JSON.parse(content)
    return {
      passed: Boolean(result.passed),
      reasoning: result.reasoning || 'No reasoning provided'
    }
  } catch (error) {
    return {
      passed: false,
      reasoning: \`Error during grading: \${error.message}\`
    }
  }
}

async function gradeQuestion(input, expectedOutput, actualOutput) {
  if (Array.isArray(expectedOutput)) {
    const gradingPromises = expectedOutput.map(async (expectedItem) => {
      const result = await gradeSingleItem(input, expectedItem, actualOutput)
      return {
        expectedItem,
        passed: result.passed,
        reasoning: result.reasoning
      }
    })

    const itemResults = await Promise.all(gradingPromises)
    const passedCount = itemResults.filter(item => item.passed).length

    return {
      score: \`\${passedCount}/\${expectedOutput.length}\`,
      passed: passedCount,
      total: expectedOutput.length,
      reasoning: \`\${passedCount} out of \${expectedOutput.length} expected points covered\`,
      itemResults
    }
  } else {
    const result = await gradeSingleItem(input, expectedOutput, actualOutput)
    return {
      score: result.passed ? '1/1' : '0/1',
      passed: result.passed ? 1 : 0,
      total: 1,
      reasoning: result.reasoning
    }
  }
}

async function main() {
  const evalResult = JSON.parse(readFileSync('${resultPath}', 'utf-8'))
  console.log(\`Grading \${evalResult.questions.length} questions...\`)

  const gradedQuestions = []
  
  for (let i = 0; i < evalResult.questions.length; i++) {
    const question = evalResult.questions[i]
    console.log(\`=== Grading Question \${i + 1}/\${evalResult.questions.length} ===\`)
    
    if (question.error) {
      console.log('Skipping - has error')
      gradedQuestions.push(question)
      continue
    }

    const grade = await gradeQuestion(
      question.input,
      question.expectedOutput,
      question.output || ''
    )

    console.log(\`Score: \${grade.score}\`)
    gradedQuestions.push({ ...question, grade })
  }

  const gradedResult = { ...evalResult, questions: gradedQuestions }
  writeFileSync('${outputPath}', JSON.stringify(gradedResult, null, 2))
  console.log('Graded results written to ${outputPath}')
}

main().catch(error => {
  console.error('Error:', error)
  process.exit(1)
})
`
  }

  private extractMetrics(result: LegacyEvalResult): Record<string, number | string> {
    const questionsWithGrades = result.questions.filter(q => q.grade)
    const questionsWithOutput = result.questions.filter(q => q.output && !q.error)
    const durations = result.questions.map(q => q.durationMs).filter((d): d is number => d !== undefined)

    const totalPassed = questionsWithGrades.reduce((sum, q) => sum + (q.grade?.passed || 0), 0)
    const totalPoints = questionsWithGrades.reduce((sum, q) => sum + (q.grade?.total || 0), 0)

    const avgDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0

    return {
      total_questions: result.questions.length,
      questions_with_output: questionsWithOutput.length,
      questions_graded: questionsWithGrades.length,
      pass_rate: totalPoints > 0 ? totalPassed / totalPoints : 0,
      avg_latency_ms: Math.round(avgDuration),
      total_points: totalPoints,
      passed_points: totalPassed
    }
  }

  private calculatePassed(result: LegacyEvalResult): boolean {
    const questionsWithGrades = result.questions.filter(q => q.grade)
    if (questionsWithGrades.length === 0) return false

    const totalPassed = questionsWithGrades.reduce((sum, q) => sum + (q.grade?.passed || 0), 0)
    const totalPoints = questionsWithGrades.reduce((sum, q) => sum + (q.grade?.total || 0), 0)

    // Consider passed if >80% of points are achieved
    return totalPoints > 0 && (totalPassed / totalPoints) > 0.8
  }

  private findProjectRoot(): string {
    // Start from current directory and walk up to find package.json
    let currentDir = process.cwd()
    
    while (currentDir !== '/') {
      if (existsSync(join(currentDir, 'package.json'))) {
        return currentDir
      }
      currentDir = dirname(currentDir)
    }
    
    // Fallback to current working directory
    return process.cwd()
  }
}

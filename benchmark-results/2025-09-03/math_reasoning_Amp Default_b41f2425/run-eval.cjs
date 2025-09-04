
const { execFileSync } = require('node:child_process')
const { readFileSync, writeFileSync } = require('node:fs')
const { parse, stringify } = require('yaml')

const evalSpec = parse(readFileSync('/Users/sjarmak/amp-workflow-manager-v2/evals/math-reasoning.yaml', 'utf-8'))
const results = {
  repo: evalSpec.repo,
  rev: evalSpec.rev,
  questions: []
}

console.log(`Running ${evalSpec.questions.length} eval questions...`)

for (let i = 0; i < evalSpec.questions.length; i++) {
  const question = evalSpec.questions[i]
  console.log(`=== Question ${i + 1}/${evalSpec.questions.length} ===`)
  console.log(`Input: ${question.input}`)

  if (question.output !== undefined) {
    console.log('Skipping - output already exists')
    results.questions.push(question)
    continue
  }

  const startTime = performance.now()
  let actualOutput, errorMessage, durationMs

  try {
    const ampCommand = [[].join(' '), '-x', question.input].filter(x => x)
    console.log(`Running: amp ${ampCommand.join(' ')}`)

    actualOutput = execFileSync('amp', ampCommand, {
      encoding: 'utf-8',
      timeout: 60000,
      stdio: ['pipe', 'pipe', 'inherit'],
      cwd: evalSpec.cwd || process.cwd()
    }).trim()
    
    const endTime = performance.now()
    durationMs = Math.round(endTime - startTime)
    console.log(`Actual output: ${actualOutput}`)
    console.log(`Duration: ${durationMs}ms`)
  } catch (error) {
    const endTime = performance.now()
    durationMs = Math.round(endTime - startTime)
    errorMessage = error.code === 'ETIMEDOUT' ? 'Command timed out' : error.message
    console.log(`Error: ${errorMessage}`)
  }

  results.questions.push({
    input: question.input,
    expectedOutput: question.expectedOutput,
    output: actualOutput,
    error: errorMessage,
    durationMs,
    outputCmd: `amp ${[].join(' ')} -x`
  })
}

writeFileSync('benchmark-results/2025-09-03/math_reasoning_Amp Default_b41f2425/result.1756925427469.yaml', stringify(results))
console.log('Results written to benchmark-results/2025-09-03/math_reasoning_Amp Default_b41f2425/result.1756925427469.yaml')

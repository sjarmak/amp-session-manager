
const { execFileSync } = require('node:child_process')
const { readFileSync, writeFileSync } = require('node:fs')

const evalSpec = JSON.parse(readFileSync('benchmark-results/2025-09-03/math_reasoning_Amp Default_0b9f7eef/eval-spec.json', 'utf-8'))
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
  
  const ampCommand = ["/Users/sjarmak/amp/cli/dist/main.js"]
  const fullCommand = [...ampCommand, '-x', question.input]
  console.log(`Running: ${fullCommand.join(' ')}`)

  try {
    const executable = "node"
    
    // Set up environment variables for local development
    const env = { ...process.env }
    
    
    env.AMP_URL = 'https://localhost:7002'
    env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
    
    actualOutput = execFileSync(executable, fullCommand, {
      encoding: 'utf-8',
      timeout: 60000,
      stdio: ['pipe', 'pipe', 'inherit'],
      cwd: evalSpec.cwd || process.cwd(),
      env
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
    outputCmd: `${ampCommand.join(' ')} -x`
  })
}

writeFileSync('benchmark-results/2025-09-03/math_reasoning_Amp Default_0b9f7eef/result.1756928534669.json', JSON.stringify(results, null, 2))
console.log('Results written to benchmark-results/2025-09-03/math_reasoning_Amp Default_0b9f7eef/result.1756928534669.json')

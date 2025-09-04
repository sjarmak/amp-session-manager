
const { readFileSync, writeFileSync } = require('node:fs')

async function gradeSingleItem(input, expectedItem, actualOutput) {
  const systemPrompt = `You are an expert evaluator for AI-generated responses. Your task is to determine if an actual output adequately covers a specific expected point.

Instructions:
1. Compare the actual output against the single expected point
2. Consider partial matches, alternative phrasings, and equivalent information
3. Be generous with partial credit for alternative but equivalent answers
4. Return true if the expected point is reasonably covered, false if not

Respond in JSON format:
{
  "passed": <true/false>,
  "reasoning": "<brief explanation>"
}`

  const userPrompt = `Question: ${input}

Expected Point: ${expectedItem}

Actual Output:
${actualOutput}

Does the actual output adequately cover the expected point?`

  try {
    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY environment variable is required')
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
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
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
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
      reasoning: `Error during grading: ${error.message}`
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
      score: `${passedCount}/${expectedOutput.length}`,
      passed: passedCount,
      total: expectedOutput.length,
      reasoning: `${passedCount} out of ${expectedOutput.length} expected points covered`,
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
  const evalResult = JSON.parse(readFileSync('benchmark-results/2025-09-03/math_reasoning_Amp Default_0b9f7eef/result.1756928534669.json', 'utf-8'))
  console.log(`Grading ${evalResult.questions.length} questions...`)

  const gradedQuestions = []
  
  for (let i = 0; i < evalResult.questions.length; i++) {
    const question = evalResult.questions[i]
    console.log(`=== Grading Question ${i + 1}/${evalResult.questions.length} ===`)
    
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

    console.log(`Score: ${grade.score}`)
    gradedQuestions.push({ ...question, grade })
  }

  const gradedResult = { ...evalResult, questions: gradedQuestions }
  writeFileSync('benchmark-results/2025-09-03/math_reasoning_Amp Default_0b9f7eef/result.1756928534669-graded.json', JSON.stringify(gradedResult, null, 2))
  console.log('Graded results written to benchmark-results/2025-09-03/math_reasoning_Amp Default_0b9f7eef/result.1756928534669-graded.json')
}

main().catch(error => {
  console.error('Error:', error)
  process.exit(1)
})

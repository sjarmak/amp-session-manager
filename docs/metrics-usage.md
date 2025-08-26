# Amp Session Conductor - Enhanced Metrics Usage

The amp-session-manager now includes comprehensive metrics tracking similar to amp-eval, with detailed tool usage, file edit tracking, and benchmark execution support.

## Key Features

- **Detailed event tracking**: Tool calls, file edits, token usage, timing
- **JSONL export**: Compatible with amp-eval analysis tools
- **File diff tracking**: Automatic detection of file changes after tool execution
- **Benchmark execution**: Run automated test suites with metrics collection
- **Multiple storage formats**: SQLite (structured), NDJSON (streaming), JSONL (amp-eval compatible)

## Basic Usage

### 1. Run Session with Metrics Export

```bash
# Run an iteration with detailed metrics export
amp-sessions iterate session-123 --metrics-file ./metrics.jsonl

# The JSONL file will contain events like:
# {"type":"iteration_start","sessionId":"session-123","timestamp":"2024-01-01T10:00:00.000Z","data":{"iterationNumber":1,"gitSha":"abc123"}}
# {"type":"tool_call","sessionId":"session-123","timestamp":"2024-01-01T10:00:01.000Z","data":{"toolName":"read_file","args":{"path":"src/main.js"},"durationMs":150,"success":true}}
# {"type":"file_edit","sessionId":"session-123","timestamp":"2024-01-01T10:00:05.000Z","data":{"path":"src/main.js","linesAdded":5,"linesDeleted":2,"operation":"modify"}}
```

### 2. Analyze Metrics Data

```bash
# The JSONL file can be processed with standard tools
cat metrics.jsonl | jq '.type' | sort | uniq -c
#     1 iteration_start
#     4 tool_call
#     2 file_edit
#     3 llm_usage
#     1 iteration_end

# Count tool usage
cat metrics.jsonl | jq 'select(.type=="tool_call") | .data.toolName' | sort | uniq -c
#     2 "read_file"
#     1 "edit_file"
#     1 "create_file"

# Calculate total tokens
cat metrics.jsonl | jq 'select(.type=="llm_usage") | .data.totalTokens' | paste -sd+ | bc
# 2456
```

## Benchmark Execution

### 1. Create Benchmark Suite

Create a YAML file defining your test cases:

```yaml
# benchmark-suite.yaml
name: "Code Quality Improvements"
description: "Test Amp's ability to improve code quality"

cases:
  - id: "refactor-legacy"
    description: "Refactor legacy code to modern standards"
    repo: "/path/to/legacy-project"
    prompt: |
      Please refactor the main.js file to use modern JavaScript:
      - Convert var to const/let
      - Use arrow functions where appropriate
      - Add proper error handling
    timeoutSec: 600
    successCommand: "npm test"
    
  - id: "add-tests"
    description: "Add comprehensive tests to untested module"
    repo: "/path/to/project"
    prompt: |
      Add comprehensive unit tests for the utils/helpers.js module.
      Cover all functions with positive, negative, and edge cases.
    timeoutSec: 900
    successCommand: "npm test -- --coverage --testPathPattern=helpers"
```

### 2. Run Benchmark

```bash
# Execute benchmark suite
amp-sessions bench ./benchmark-suite.yaml \
  --output-dir ./benchmark-results \
  --concurrent 2 \
  --timeout 1800

# Output:
# Loaded 2 benchmark cases from ./benchmark-suite.yaml
# Executing 2 benchmark cases (2 concurrent)...
# ✓ refactor-legacy: PASS (45230ms)
# ✓ add-tests: PASS (67890ms)
# 
# === Benchmark Summary ===
# Total: 2
# Passed: 2
# Failed: 0
# Success Rate: 100.0%
# Avg Duration: 56560ms
# Total Tokens: 8942
# Total Cost: $0.2456
# 
# Results saved to: ./benchmark-results
```

### 3. Analyze Benchmark Results

```bash
# View summary
cat benchmark-results/benchmark-summary.json

# Analyze individual case metrics
cat benchmark-results/refactor-legacy-metrics.jsonl | jq 'select(.type=="tool_call")'
cat benchmark-results/add-tests-metrics.jsonl | jq 'select(.type=="file_edit")'

# Generate report
jq -r '
.results[] | 
[.id, .success, (.durationMs/1000), .toolCalls, .fileEdits, (.tokenUsage.cost // 0)] |
@csv
' benchmark-results/benchmark-summary.json > results.csv
```

## Event Types Reference

### Tool Call Event
```json
{
  "type": "tool_call",
  "sessionId": "session-123",
  "iterationId": "iter-456",
  "timestamp": "2024-01-01T10:00:01.000Z",
  "data": {
    "toolName": "read_file",
    "args": {"path": "src/main.js"},
    "startTime": "2024-01-01T10:00:00.500Z",
    "endTime": "2024-01-01T10:00:01.000Z",
    "durationMs": 500,
    "success": true,
    "costUsd": 0.001
  }
}
```

### File Edit Event
```json
{
  "type": "file_edit",
  "sessionId": "session-123",
  "iterationId": "iter-456", 
  "timestamp": "2024-01-01T10:00:05.000Z",
  "data": {
    "path": "src/main.js",
    "linesAdded": 5,
    "linesDeleted": 2,
    "operation": "modify",
    "diff": "@@ -10,3 +10,6 @@\n function main() {\n+  // Improved error handling\n+  try {\n     const result = processData();\n+  } catch (error) {\n+    console.error('Processing failed:', error);\n+  }\n }"
  }
}
```

### LLM Usage Event  
```json
{
  "type": "llm_usage",
  "sessionId": "session-123",
  "iterationId": "iter-456",
  "timestamp": "2024-01-01T10:00:02.000Z", 
  "data": {
    "model": "gpt-4",
    "promptTokens": 1500,
    "completionTokens": 800,
    "totalTokens": 2300,
    "costUsd": 0.092,
    "latencyMs": 2500
  }
}
```

## Advanced Usage

### Custom Analysis Scripts

```javascript
// analyze-metrics.js - Custom analysis of JSONL metrics
const fs = require('fs');

function analyzeMetrics(jsonlPath) {
  const events = fs.readFileSync(jsonlPath, 'utf8')
    .trim()
    .split('\n')
    .map(line => JSON.parse(line));
    
  const analysis = {
    toolUsage: {},
    fileChanges: 0,
    totalCost: 0,
    duration: 0
  };
  
  events.forEach(event => {
    if (event.type === 'tool_call') {
      analysis.toolUsage[event.data.toolName] = 
        (analysis.toolUsage[event.data.toolName] || 0) + 1;
    }
    
    if (event.type === 'file_edit') {
      analysis.fileChanges++;
    }
    
    if (event.type === 'llm_usage') {
      analysis.totalCost += event.data.costUsd;
    }
  });
  
  return analysis;
}

// Usage
const analysis = analyzeMetrics('./metrics.jsonl');
console.log(JSON.stringify(analysis, null, 2));
```

### Integration with CI/CD

```yaml
# .github/workflows/benchmark.yml
name: Amp Benchmark Tests

on: [push, pull_request]

jobs:
  benchmark:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install amp-sessions
        run: npm install -g @ampsm/cli
        
      - name: Run benchmarks
        run: |
          amp-sessions bench .github/benchmark-suite.yaml \
            --output-dir ./benchmark-results \
            --json > benchmark-output.json
            
      - name: Upload results
        uses: actions/upload-artifact@v3
        with:
          name: benchmark-results
          path: benchmark-results/
          
      - name: Check success rate
        run: |
          SUCCESS_RATE=$(jq '.passed / .total * 100' benchmark-output.json)
          if (( $(echo "$SUCCESS_RATE < 80" | bc -l) )); then
            echo "Benchmark success rate $SUCCESS_RATE% is below threshold"
            exit 1
          fi
```

## Migration from Existing Metrics

If you have existing metrics collection, the new system is backward compatible:

1. **SQLite storage**: Continues to work alongside JSONL export
2. **Desktop UI**: Updated to show enhanced metrics automatically  
3. **Existing sessions**: Will start using enhanced metrics on next iteration

The JSONL format is designed to be compatible with amp-eval analysis tools, enabling seamless integration with existing evaluation workflows.

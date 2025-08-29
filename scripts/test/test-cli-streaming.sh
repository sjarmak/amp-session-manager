#!/bin/bash

# Test streaming events by running actual CLI iteration
echo "🧪 Testing CLI streaming events..."

# Create test directory
TEST_DIR="/tmp/cli-streaming-test"
mkdir -p "$TEST_DIR"
cd "$TEST_DIR"

# Initialize git repo
if [ ! -d ".git" ]; then
    git init
    echo "console.log('Hello world');" > test.js
    git add test.js
    git commit -m "Initial commit"
fi

echo "📂 Test repo: $TEST_DIR"

# Create session
echo "🏗️  Creating session..."
SESSION_CMD="npx tsx /Users/sjarmak/amp-workflow-manager-v2/packages/cli/src/index.ts new --repo '$TEST_DIR' --name 'streaming-test' --prompt 'Add a comment to test.js' --base master"

echo "Running: $SESSION_CMD"
SESSION_OUTPUT=$(eval $SESSION_CMD)
echo "Session output: $SESSION_OUTPUT"

SESSION_ID=$(echo "$SESSION_OUTPUT" | grep -o 'Session ID: [a-f0-9-]*' | cut -d' ' -f3)

if [ -z "$SESSION_ID" ]; then
    echo "❌ Failed to create session"
    exit 1
fi

echo "✅ Created session: $SESSION_ID"

# Run iteration with debug output to see what events are generated
METRICS_FILE="$TEST_DIR/debug-metrics.jsonl"
echo "📊 Running iteration with metrics output..."
echo "Metrics file: $METRICS_FILE"

# Run with debug output and capture both stdout/stderr
ITERATION_CMD="npx tsx /Users/sjarmak/amp-workflow-manager-v2/packages/cli/src/index.ts iterate '$SESSION_ID' --metrics-file '$METRICS_FILE' --notes 'test'"

echo "Running: $ITERATION_CMD"
eval $ITERATION_CMD 2>&1 | tee iteration-debug.log

echo ""
echo "📋 Results Analysis:"
echo "==================="

# Check session log for amp debug output
SESSION_LOG_PATH="$TEST_DIR/.worktrees/$SESSION_ID/.amp-session.log"
echo "Session log path: $SESSION_LOG_PATH"
if [ -f "$SESSION_LOG_PATH" ]; then
    echo "✅ Session log exists ($(wc -l < "$SESSION_LOG_PATH") lines)"
    echo "Last 10 lines of session log:"
    tail -n 10 "$SESSION_LOG_PATH"
else
    echo "❌ Session log not found"
fi

# Check metrics file
if [ -f "$METRICS_FILE" ]; then
    echo "✅ Metrics file exists ($(wc -l < "$METRICS_FILE") lines)"
    echo ""
    echo "📊 Metrics events:"
    while IFS= read -r line; do
        if command -v jq >/dev/null 2>&1; then
            echo "$line" | jq -c '{ type: .type, sessionId: .sessionId, hasData: (.data != null) }'
        else
            echo "$line" | grep -o '"type":"[^"]*"' | head -1
        fi
    done < "$METRICS_FILE"
    
    echo ""
    echo "📄 Sample metrics event:"
    if command -v jq >/dev/null 2>&1; then
        head -n 1 "$METRICS_FILE" | jq .
    else
        head -n 1 "$METRICS_FILE"
    fi
else
    echo "❌ Metrics file not found"
fi

# Check for streaming JSON in iteration output
echo ""
echo "🔍 Checking for streaming JSON in iteration debug log..."
if grep -q '{"' iteration-debug.log; then
    echo "✅ JSON events found in debug log"
    grep '{"' iteration-debug.log | head -3
else
    echo "❌ No JSON events found in debug log"
fi

# Status check
echo ""
echo "📈 Final session status:"
npx tsx /Users/sjarmak/amp-workflow-manager-v2/packages/cli/src/index.ts status "$SESSION_ID"

echo ""
echo "🧹 Cleanup (session will be preserved for inspection)..."
echo "Test files at: $TEST_DIR"
echo "Session ID: $SESSION_ID"

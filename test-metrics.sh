#!/bin/bash

# Test script to verify metrics are working

echo "Testing amp-session-manager metrics..."

# Create a test directory
TEST_DIR="$HOME/tmp/amp-test-metrics"
mkdir -p "$TEST_DIR"

# Initialize a git repository
cd "$TEST_DIR"
if [ ! -d ".git" ]; then
    git init
    echo "console.log('Hello world');" > test.js
    git add test.js
    git commit -m "Initial commit"
fi

echo "Created test repository at: $TEST_DIR"

# Create a session
SESSION_ID=$(npx tsx packages/cli/src/index.ts new \
    --repo "$TEST_DIR" \
    --name "metrics-test" \
    --prompt "Add a comment to test.js explaining what the code does" \
    --base master | grep -o 'Session ID: [a-f0-9-]*' | cut -d' ' -f3)

if [ -z "$SESSION_ID" ]; then
    echo "Failed to create session"
    exit 1
fi

echo "Created session: $SESSION_ID"

# Run iteration with metrics export
METRICS_FILE="$TEST_DIR/metrics-test.jsonl"
echo "Running iteration with metrics export to: $METRICS_FILE"

npx tsx packages/cli/src/index.ts iterate "$SESSION_ID" \
    --metrics-file "$METRICS_FILE" \
    --notes "Add a helpful comment"

# Check if metrics file exists and has content
if [ -f "$METRICS_FILE" ]; then
    echo "✓ Metrics file created successfully"
    echo "File size: $(wc -l < "$METRICS_FILE") lines"
    echo ""
    echo "Sample metrics events:"
    head -n 5 "$METRICS_FILE" | jq . 2>/dev/null || head -n 5 "$METRICS_FILE"
    echo ""
    echo "Event types found:"
    cat "$METRICS_FILE" | jq -r '.type' 2>/dev/null | sort | uniq -c || \
        grep -o '"type":"[^"]*"' "$METRICS_FILE" | sort | uniq -c
else
    echo "✗ Metrics file not found"
    echo "Session status:"
    npx tsx packages/cli/src/index.ts status "$SESSION_ID"
fi

echo ""
echo "Cleanup session..."
npx tsx packages/cli/src/index.ts cleanup "$SESSION_ID" --yes

echo "Test completed."

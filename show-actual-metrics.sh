#!/bin/bash

echo "Checking for actual metrics data in amp-session-manager..."
echo

# Check SQLite database for existing data
DB_FILE="packages/cli/sessions.sqlite"
if [ -f "$DB_FILE" ]; then
    echo "📊 SQLite Database Contents:"
    echo "Sessions:"
    sqlite3 "$DB_FILE" "SELECT id, name, status, created_at FROM sessions;" 2>/dev/null || echo "  (no sessions found)"
    echo
    echo "Iterations:"  
    sqlite3 "$DB_FILE" "SELECT session_id, id, status, duration_ms FROM iterations LIMIT 5;" 2>/dev/null || echo "  (no iterations found)"
    echo
    echo "Tool Calls:"
    sqlite3 "$DB_FILE" "SELECT tool_name, duration_ms, success FROM tool_calls LIMIT 5;" 2>/dev/null || echo "  (no tool calls found)"
    echo
else
    echo "📊 No SQLite database found at: $DB_FILE"
fi

# Check for any JSONL files
echo "📁 Looking for JSONL metrics files:"
find . -name "*.jsonl" -type f 2>/dev/null | head -5 | while read file; do
    echo "  Found: $file"
    if [ -f "$file" ]; then
        echo "    Lines: $(wc -l < "$file" 2>/dev/null)"
        echo "    Sample:"
        head -n 2 "$file" 2>/dev/null | sed 's/^/      /'
    fi
done

# Check for NDJSON files  
echo
echo "📁 Looking for NDJSON metrics files:"
find . -name "*.ndjson" -type f 2>/dev/null | head -5 | while read file; do
    echo "  Found: $file"
    if [ -f "$file" ]; then
        echo "    Lines: $(wc -l < "$file" 2>/dev/null)"
    fi
done

# Show available CLI commands related to metrics
echo
echo "🛠️  Available metrics commands:"
echo "  amp-sessions iterate <id> --metrics-file <path>  # Export metrics to JSONL"
echo "  amp-sessions bench <suite.yaml>                  # Run benchmark with metrics"
echo "  amp-sessions tools <id>                          # Show tool usage"
echo "  amp-sessions usage <id>                          # Show token usage"

echo
echo "💡 To test metrics capture:"
echo "  1. Create a session: amp-sessions new --repo /path/to/repo --name test --prompt 'add comments'"
echo "  2. Run with metrics: amp-sessions iterate <id> --metrics-file ./test-metrics.jsonl"  
echo "  3. Check output: cat ./test-metrics.jsonl"

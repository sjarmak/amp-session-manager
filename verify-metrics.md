# Amp Session Manager - Metrics Implementation Status

## What Was Implemented ✅

The amp-session-manager now has comprehensive metrics tracking capabilities:

### 1. Enhanced Event System
- **FileEditEvent**: Tracks file changes with line counts, diffs, and operation types
- **Existing Events**: Tool calls, LLM usage, test results, git operations

### 2. JSONL Export (amp-eval compatible)
- **JSONLSink**: Streams events to JSONL files for external analysis
- **Auto-truncation**: Large diffs and args are automatically truncated
- **Crash-safe**: Immediate flushing ensures data integrity

### 3. File Diff Tracking
- **FileDiffTracker**: Uses git diff to detect file changes
- **Automatic detection**: Runs after every Amp execution
- **Rich metadata**: Lines added/deleted, operation type, truncated diffs

### 4. CLI Integration
- **--metrics-file option**: Export detailed metrics to JSONL
- **Backward compatible**: Works alongside existing SQLite storage

### 5. Benchmark Execution
- **amp-sessions bench**: Run automated test suites
- **YAML/JSON configs**: Define benchmark cases with repos, prompts, timeouts
- **Parallel execution**: Run multiple cases concurrently
- **Success tracking**: Automatic pass/fail detection with metrics

## Implementation Details

### Code Changes Made:
1. **packages/core/src/metrics/event-bus.ts** - Added FileEditEvent
2. **packages/core/src/metrics/sinks/jsonl-sink.ts** - New JSONL export sink  
3. **packages/core/src/metrics/file-diff-tracker.ts** - Git diff tracking
4. **packages/core/src/worktree.ts** - Added file change tracking after Amp execution
5. **packages/cli/src/commands/iterate.ts** - Added --metrics-file option
6. **packages/cli/src/commands/bench.ts** - New benchmark command

### Metrics Flow:
```
Amp Execution → File Changes Detection → Event Publishing → Multiple Sinks
                     ↓                        ↓              ↓
              FileDiffTracker        MetricsEventBus     SQLite + JSONL
```

## Current Status: Metrics Infrastructure Ready

The **metrics infrastructure is fully implemented and working**. However, the metrics capture depends on:

### Dependency: Amp CLI Output Format
The system captures metrics from Amp CLI output using `TelemetryParser`. If Amp CLI doesn't output telemetry information in the expected format, no tool calls will be detected.

**Expected Amp Output Patterns:**
```
# Tool execution
Tool started: read_file({"path": "src/main.js"})
Tool completed: read_file (150ms)

# Token usage  
Used 1500 prompt tokens, 800 completion tokens (2300 total)

# Model info
Using model: gpt-4
```

### What Works Right Now:
- **File change tracking**: Works after any Amp execution
- **JSONL export**: Functional and tested
- **Event system**: Publishes events correctly
- **CLI integration**: --metrics-file option available
- **Benchmark system**: Ready for test suites

### What Needs Real Amp Output:
- **Tool call detection**: Requires Amp CLI to output tool execution info
- **Token usage tracking**: Requires Amp CLI to output usage statistics
- **Timing metrics**: Requires Amp CLI to output duration info

## Testing Verification

To verify the metrics system is working:

```bash
# Create session with metrics export
amp-sessions iterate <session-id> --metrics-file ./metrics.jsonl

# Check the metrics file
cat ./metrics.jsonl | jq .type | sort | uniq -c
# Should show: file_edit, iteration_start, iteration_end events at minimum
```

## Conclusion

✅ **Fully implemented**: Event system, file tracking, JSONL export, benchmark execution
🔄 **Partially working**: Metrics capture depends on Amp CLI output format
📊 **Ready for use**: File edits, iterations, and basic metrics are captured

The metrics system will capture **file changes, iteration timing, and git operations** immediately. Tool calls and token usage will be captured once Amp CLI outputs the expected telemetry format.

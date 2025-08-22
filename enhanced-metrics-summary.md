# Enhanced Metrics Implementation Summary

## Changes Made

✅ **Enhanced Debug Parser Created** (`packages/core/src/enhanced-debug-parser.ts`)
- Ported proven parsing logic from `amp_runner.py`
- Extracts tool calls, token usage, and performance metrics from JSON debug logs
- Provides fallback to text parsing when debug logs unavailable
- Handles thread ID extraction

✅ **AmpAdapter Updated** (`packages/core/src/amp.ts`)
- Modified both `runIteration` and `consultOracle` methods
- Added automatic debug log file creation with `--log-level debug --log-file`
- Integrated `EnhancedDebugParser.parseWithFallback()` to replace old text-only parsing
- Automatic cleanup of temporary debug log files

## Key Features

### Debug Log Parsing
The enhanced parser matches these JSON patterns from Amp debug logs:
```json
{"name":"invokeTool","message":"toolu_abc123, invoking tool"}
{"name":"toolCall","message":"{\"name\":\"glob\",\"arguments\":{...},\"toolId\":\"toolu_abc123\"}"}
{"input_tokens":1500,"output_tokens":800}
{"inferenceDuration":2.5,"tokensPerSecond":320,"outputTokens":800}
```

### Fallback Strategy
1. **Primary**: Parse structured JSON debug logs for maximum accuracy
2. **Fallback**: Parse text output using regex patterns if debug logs fail/empty
3. **Graceful**: Never fail completely - always returns valid telemetry structure

### Integration Points
- `AmpAdapter.runIteration()` - Main session iteration parsing
- `AmpAdapter.consultOracle()` - Oracle query parsing  
- Automatic temporary log file management
- Thread ID extraction for session correlation

## Expected Benefits

🎯 **Higher Accuracy**: JSON parsing vs text pattern matching
📊 **Better Tool Detection**: Structured tool call data with arguments
🔢 **Precise Token Counts**: Direct token usage from LLM metrics
⚡ **Performance Data**: Inference duration and tokens-per-second
🧵 **Thread Tracking**: Thread ID extraction for session isolation

## Testing Status

✅ Mock data test passed - parsing logic verified
❌ Real Amp command test blocked by authentication
✅ TypeScript compilation successful (with existing unrelated errors)

## Next Steps for Validation

To fully test the enhanced metrics:
1. Run an Amp session in the session manager
2. Check logs for "Enhanced parsed telemetry:" messages  
3. Verify metrics display in UI shows more accurate data
4. Compare with previous parsing results

The enhanced parser maintains backward compatibility - if debug log parsing fails, it falls back to the previous text parsing approach.

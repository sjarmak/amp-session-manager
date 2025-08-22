# Debug Logging Issues Found

## 🚨 Critical Issue: Log File Creation Failure

**Problem**: If Amp CLI can't create the debug log file, it **fails completely** instead of running without logging.

**Test case**: 
```bash
amp -x --log-level debug --log-file /root/no-permission.log
# Result: "Failed to create log directory: Error: ENOENT: no such file or directory, mkdir '/root'"
```

**Impact**: Any session where the temp directory is not writable will fail entirely.

## Other Potential Issues Identified

### 1. **Performance Impact**
- Debug logging adds overhead to every Amp execution
- Log files can grow large with complex sessions
- JSON parsing adds processing time

### 2. **Disk Space**
- Temporary log files created for every session
- If cleanup fails, files accumulate in `/tmp`
- No size limits on debug logs

### 3. **Concurrency Issues**
- Multiple sessions create files simultaneously 
- File name collisions unlikely but possible
- Race conditions in cleanup

### 4. **Error Handling Gaps**
- Current implementation assumes log file creation always works
- Missing fallback when debug logging fails
- No graceful degradation

### 5. **Security Concerns**
- Debug logs may contain sensitive information
- Temporary files in `/tmp` readable by other users (depending on umask)
- Log files persist if cleanup fails

## Recommended Solutions

### Immediate Fix: Make Debug Logging Optional
```typescript
// Only add debug logging if explicitly enabled
if (this.config.enableDebugLogging) {
  const debugLogFile = join(tmpdir(), `amp_debug_${Date.now()}.log`);
  args.push('--log-level', 'debug', '--log-file', debugLogFile);
}
```

### Better Approach: Graceful Fallback
```typescript
// Try debug logging, fall back to normal execution
try {
  const debugLogFile = join(tmpdir(), `amp_debug_${Date.now()}.log`);
  // Test if we can write to temp directory first
  const testFile = debugLogFile + '.test';
  writeFileSync(testFile, 'test');
  unlinkSync(testFile);
  
  args.push('--log-level', 'debug', '--log-file', debugLogFile);
  useDebugLogging = true;
} catch {
  console.warn('Debug logging unavailable, using text parsing fallback');
  useDebugLogging = false;
}
```

### Alternative: Use Default Amp Logging
Instead of custom log files, could parse the default Amp CLI logs at `~/.cache/amp/logs/cli.log` with timestamp filtering (similar to existing `AmpLogParser`).

## Status
- ❌ **Current implementation is broken** - causes session failures
- ⚠️ **High priority fix needed** before deployment
- ✅ **Parsing logic is sound** - just the log file creation is problematic

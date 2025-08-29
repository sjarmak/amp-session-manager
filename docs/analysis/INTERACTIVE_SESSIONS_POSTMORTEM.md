# Interactive Sessions "Thread Not Found" Issue - Post-Mortem

## Issue Summary

Interactive sessions were failing with "Thread not found" errors when users clicked "Start Chat", preventing any interactive conversations from working.

## Root Cause Analysis

### Primary Issue: Local vs Server Thread Creation Mismatch

The core problem was that the system was creating thread IDs locally in the SQLite database but the Amp CLI server didn't know about these locally-created threads.

**Flow that was broken:**
1. User clicks "Start Chat" 
2. Backend creates thread locally: `store.createThread()` → generates `T-abc123...`
3. Backend tells amp CLI: `amp threads continue T-abc123...`
4. **Amp CLI responds: "Thread not found"** ❌

**Why this happened:**
- `store.createThread()` only creates database entries locally
- Amp CLI server maintains its own thread registry
- Local thread IDs never get registered with Amp server

### Secondary Issue: Thread Selection Logic

The thread selection logic had a hierarchy problem:
1. **Current amp thread detection** (from `~/.local/state/amp/last-thread-id`)
2. **Local session thread lookup** 
3. **New thread creation**

When existing threads were found locally but were invalid on the server, the system would still try to use them.

## Investigation Process

1. **Initial symptom**: `Error: Thread T-325288d6-7518-41e2-af1d-bdc295e36d91 not found`
2. **Thread ID mismatch discovery**: System showed one thread ID in logs vs different ID in amp command
3. **Debug logging**: Added extensive logging to trace thread selection flow
4. **Database inspection**: Found orphaned threads in local SQLite but not on Amp server
5. **Logic flow analysis**: Identified that `args.unshift('threads', 'continue', threadId)` was missing for new thread creation

## The Fix

### Backend Changes (`packages/core/src/amp.ts`)

**Before:**
```typescript
// Created local thread but didn't tell amp CLI to use it
this.threadId = store.createThread(this.sessionId, 'Interactive Session');
// Missing: args.unshift('threads', 'continue', this.threadId);
```

**After:**
```typescript
// Let amp CLI create thread naturally, then capture the ID
if (threadId === 'new') {
  console.log(`Explicitly requested new thread, will let amp CLI create it naturally`);
  // Don't pass any thread args - let amp create fresh thread
} else if (currentThreadExists && currentThreadBelongsToSession) {
  args.unshift('threads', 'continue', currentThreadId);
} else {
  // Let amp CLI create new thread, capture ID from streaming response
}

// In streaming response handler:
if (!this.threadId && parsedObject.session_id) {
  this.threadId = parsedObject.session_id;
  store.createThread(this.sessionId, 'Interactive Session', this.threadId);
}
```

### Database Schema Enhancement (`packages/core/src/store.ts`)

```typescript
// Added optional providedId parameter
createThread(sessionId: string, name: string, providedId?: string): string {
  const id = providedId || `T-${randomUUID()}`;
  // ... rest of creation logic
}
```

### Frontend Fix (`apps/desktop/src/components/InteractiveTab.tsx`)

```typescript
// Properly pass 'new' when explicitly creating new thread
const threadArg = isCreatingNewThread ? 'new' : (selectedThreadId || null);
```

## Key Lessons Learned

### 1. **Server-Client Thread Sync**
- Never create thread IDs locally and expect external services to recognize them
- Always let the authoritative system (Amp CLI) create the entity first
- Capture and store the server-generated IDs locally for reference

### 2. **State Management Hierarchy**
- Current amp thread (from filesystem) should take precedence 
- Only fall back to local session threads if they're validated against server
- Always have a "create new" escape hatch that doesn't depend on local state

### 3. **Interactive vs Batch Mode Distinction**
- Interactive sessions need real-time thread creation and continuation
- Batch/iteration sessions can work with pre-planned thread strategies
- The two modes have different thread lifecycle requirements

### 4. **Debug Logging Strategy**
- Log thread selection decisions at each branch point
- Include both local and server thread IDs in logs
- Track the full args array being passed to amp CLI
- Differentiate between thread creation vs continuation paths

## Prevention Strategies

### 1. **Thread Validation Layer**
Add a `validateThreadExists()` method that checks amp CLI before using any thread:
```typescript
async validateThreadExists(threadId: string): Promise<boolean> {
  // Call amp CLI to verify thread exists and is accessible
  // Return false for orphaned/invalid threads
}
```

### 2. **Integration Tests**
- Test new thread creation in interactive mode
- Test thread resumption after navigation
- Test thread selection with multiple existing threads
- Test "New Thread" button specifically

### 3. **Better Error Messages**
Instead of generic "Thread not found", provide:
- "Thread was created locally but doesn't exist on Amp server - creating new thread"
- "Current amp thread doesn't belong to this session - will create new thread"

### 4. **Frontend State Cleanup**
- Clear thread-related state when switching sessions
- Reset `isCreatingNewThread` flag properly
- Ensure thread dropdown reflects actual server state

## Files Modified

- [`packages/core/src/amp.ts`](file:///Users/sjarmak/amp-workflow-manager-v2/packages/core/src/amp.ts#L1410-L1450) - Thread selection logic
- [`packages/core/src/store.ts`](file:///Users/sjarmak/amp-workflow-manager-v2/packages/core/src/store.ts#L1059) - `createThread` method signature
- [`apps/desktop/src/components/InteractiveTab.tsx`](file:///Users/sjarmak/amp-workflow-manager-v2/apps/desktop/src/components/InteractiveTab.tsx#L519) - Frontend thread argument passing

## Success Metrics

✅ **New thread creation**: amp CLI creates thread, system captures and stores ID locally  
✅ **Thread resumption**: Existing valid threads can be continued successfully  
✅ **Thread persistence**: Threads appear in dropdown after navigation  
✅ **Thread isolation**: Different sessions maintain separate thread lists  

## Future Improvements

1. **Thread Cleanup**: Implement cleanup of orphaned local threads that don't exist on server
2. **Thread Validation**: Periodic validation of stored threads against amp server
3. **Better UX**: Show thread creation/loading states in the UI
4. **Error Recovery**: Graceful fallback when thread continuation fails

---

*Issue resolved on: 2025-08-27*  
*Duration: ~2 hours of investigation and fixes*  
*Impact: Fixed all interactive session functionality*

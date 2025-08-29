# Orphan Worktree Mitigation Strategies

## Immediate Improvements (P0)

### 1. Enhanced Transaction Safety
- **Add database transactions** for session creation with proper rollback
- **Implement cleanup checkpoints** during session creation
- **Add process signal handlers** to cleanup on termination (SIGINT, SIGTERM)

### 2. Proactive Orphan Detection
- **Startup cleanup routine** - run `pruneOrphans()` on app start
- **Background orphan scanner** - periodic cleanup every 30 minutes
- **Pre-operation cleanup** - scan before creating new sessions

### 3. Improved Error Recovery
- **Retry mechanisms** for git operations with exponential backoff
- **Partial cleanup recovery** - track cleanup progress and resume
- **Lock file timeout** - auto-cleanup stale git locks after timeout

## Medium-term Enhancements (P1)

### 4. Session State Management
```typescript
// Enhanced session states
type SessionState = 'creating' | 'ready' | 'running' | 'cleaning' | 'error' | 'orphaned';

// State transitions with automatic cleanup triggers
const stateTransitions = {
  creating: ['ready', 'error', 'orphaned'],
  cleaning: ['cleaned', 'error', 'orphaned']
};
```

### 5. Atomic Operations Framework
- **Two-phase commit** for session operations
- **Rollback logs** to track what needs cleanup
- **Health check API** to verify session integrity

### 6. User-Facing Tools
- **Session health dashboard** showing orphan status
- **One-click cleanup button** in UI
- **Cleanup notifications** when orphans detected
- **Safe mode** that prevents operations until cleanup complete

## Long-term Solutions (P2)

### 7. Git Worktree Alternatives
- **In-memory workspaces** for short sessions
- **Container-based isolation** instead of worktrees
- **Symbolic link management** for lighter-weight sessions

### 8. Advanced Monitoring
- **Session lifecycle metrics** to identify failure patterns
- **Cleanup success rates** tracking
- **Resource usage monitoring** to prevent system overload

## Implementation Priority

### Phase 1: Critical Fixes (This Week)
1. Add startup cleanup routine to desktop app
2. Implement process signal handlers
3. Add retry logic to git operations
4. Enhanced error logging for diagnostics

### Phase 2: User Experience (Next Sprint)
1. UI cleanup notifications
2. Session health indicators
3. Automated background cleanup
4. Improved error messages

### Phase 3: Architecture Improvements (Future)
1. Database transactions
2. Atomic operations framework
3. Alternative workspace strategies

## Code Changes Needed

### 1. Startup Cleanup Hook
```typescript
// In desktop app main.ts
app.whenReady().then(async () => {
  // Run cleanup before UI loads
  await runStartupCleanup();
  createWindow();
});
```

### 2. Process Signal Handlers
```typescript
// In WorktreeManager constructor
process.on('SIGINT', () => this.emergencyCleanup());
process.on('SIGTERM', () => this.emergencyCleanup());
```

### 3. Enhanced Session Creation
```typescript
async createSession(options: SessionCreateOptions): Promise<Session> {
  const transaction = this.store.beginTransaction();
  try {
    const session = transaction.createSession(options);
    await this.createWorktreeWithCleanup(session);
    transaction.commit();
    return session;
  } catch (error) {
    transaction.rollback();
    await this.cleanupFailedSession(session);
    throw error;
  }
}
```

## Monitoring and Alerts

### Desktop App Indicators
- 🟢 All sessions healthy
- 🟡 Orphans detected, cleanup available  
- 🔴 Cleanup required before operations
- ⚠️ Manual intervention needed

### CLI Status Commands
```bash
amp-sessions health          # Check for orphans
amp-sessions cleanup --auto  # Safe automatic cleanup
amp-sessions repair --force  # Force cleanup all orphans
```

## Risk Assessment

### Low Risk Changes
- Startup cleanup routine
- Background orphan detection
- UI indicators and notifications

### Medium Risk Changes  
- Process signal handlers
- Retry mechanisms with backoff
- Enhanced error recovery

### High Risk Changes
- Database transactions (requires migration)
- Alternative workspace strategies
- Atomic operations framework

## Success Metrics

1. **Orphan Rate Reduction**: < 1% of sessions become orphaned
2. **Cleanup Success**: > 99% automatic cleanup success rate
3. **User Intervention**: < 5% require manual cleanup
4. **Detection Time**: Orphans detected within 5 minutes
5. **User Satisfaction**: No user complaints about orphaned state

## Testing Strategy

### Unit Tests
- Session creation failure scenarios
- Cleanup operation edge cases
- Git lock conflict handling

### Integration Tests  
- End-to-end session lifecycle
- Process interruption simulation
- Multi-session concurrency

### User Acceptance Tests
- Recovery from orphaned state
- UI cleanup workflows
- Performance under load

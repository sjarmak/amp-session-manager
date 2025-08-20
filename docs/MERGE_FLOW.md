# Merge-to-Main Flow

This document describes the production-ready merge flow that safely integrates session changes into the main branch with conflict resolution and cleanup.

## Overview

The merge-to-main flow provides a guided, step-by-step process to:
1. **Validate** the session is ready for merge (preflight checks)
2. **Squash** commits into a clean, reviewable change
3. **Rebase** onto the current base branch
4. **Handle conflicts** with guided resolution
5. **Merge** into the base branch
6. **Clean up** the session worktree and branch

## CLI Workflow

### Basic Merge

```bash
# Complete merge with all defaults
amp-sessions merge session-123 --message "feat: add user authentication"
```

### Advanced Merge with Options

```bash
amp-sessions merge session-123 \
  --message "feat: implement advanced user authentication with JWT and refresh tokens" \
  --include-manual exclude \
  --onto develop \
  --no-ff \
  --push \
  --remote upstream \
  --export-patch ./user-auth.patch \
  --pr \
  --json
```

### Step-by-Step Process

#### 1. Preflight Checks

```bash
# Check if session is ready to merge
amp-sessions preflight session-123

# Output example:
Preflight Checks for Session: session-123
==================================================
✓ Repository clean: Yes
✓ Base up to date: Yes
✓ Tests pass: Yes
✓ Typecheck passes: Yes

Branch Status:
  Ahead by: 3 commits
  Behind by: 0 commits
  Branchpoint: a1b2c3d4
  Amp commits: 2

✅ All checks passed - ready to merge!
```

#### 2. Handle Issues

If preflight detects issues:

```bash
⚠️  Issues:
  - Repository has uncommitted changes
  - Base branch main is behind origin
  - Tests failed with exit code 1
  - TypeScript compilation failed
```

Resolve issues before continuing:

```bash
# Clean up uncommitted changes
cd /path/to/repo/.worktrees/session-123
git add . && git commit -m "amp: final changes"

# Update base branch
cd /path/to/repo
git checkout main
git pull --ff-only

# Fix tests and typecheck issues, then retry preflight
```

#### 3. Execute Merge

```bash
# Run complete merge flow
amp-sessions merge session-123 --message "feat: add authentication system"

# Process output:
🚀 Starting merge process for session: Add Authentication
============================================================
1️⃣  Running preflight checks...
2️⃣  Squashing commits...
3️⃣  Rebasing onto base branch...
4️⃣  Exporting patch...
5️⃣  Merging into base branch...
6️⃣  Pushing to remote...
7️⃣  Creating pull request...

✅ Session merged successfully!
   Session: Add Authentication
   Branch: amp/add-auth/20241219-143502 → main
   Message: feat: add authentication system
   Patch: ./auth-system.patch

To clean up the session worktree:
   amp-sessions cleanup session-123
```

#### 4. Handle Conflicts

If conflicts occur during rebase:

```bash
❌ Merge failed - conflicts detected in 2 files:
  - src/auth/login.ts
  - src/types/user.ts

Resolve conflicts and run: amp-sessions continue-merge session-123
```

Resolve conflicts manually:

```bash
# Navigate to worktree
cd /path/to/repo/.worktrees/session-123

# Edit conflicted files
vim src/auth/login.ts
vim src/types/user.ts

# Stage resolved files
git add src/auth/login.ts src/types/user.ts

# Continue merge process
amp-sessions continue-merge session-123
```

Or abort if needed:

```bash
# Abort merge and return to previous state
amp-sessions abort-merge session-123
```

#### 5. Clean Up

```bash
# Remove worktree and branch after successful merge
amp-sessions cleanup session-123

# With confirmation prompt:
⚠️  This will permanently remove:
   - Worktree: /path/to/repo/.worktrees/session-123
   - Branch: amp/add-auth/20241219-143502

This action cannot be undone.
Are you sure you want to continue? (y/N): y

✅ Session cleaned up successfully!
Worktree and branch have been safely removed.
```

## Desktop App Merge Wizard

The desktop app provides a visual merge wizard accessible from the session view:

### Launching the Wizard

1. Open a session in the desktop app
2. Go to the **Actions** tab
3. Click **🚀 Start Merge Wizard**

### Wizard Steps

#### Step 1: Preflight Checks
- Automatic validation of repository state
- Visual indicators for each check (repo clean, base updated, tests, typecheck)
- Branch status display (ahead/behind commits, amp commits count)
- Issues list with actionable guidance

#### Step 2: Squash Configuration
- Commit message input (required)
- Toggle for including/excluding manual commits
- Preview of changes to be squashed

#### Step 3: Rebase Process
- Automatic rebase onto base branch
- Real-time progress indication
- **Conflict Resolution** (if needed):
  - List of conflicted files
  - "Open in VS Code" button
  - "Mark Resolved & Continue" / "Abort" options
  - Help text with resolution steps

#### Step 4: Merge Options
- Export patch toggle with file path input
- Cleanup after merge toggle
- Final confirmation before merge

#### Step 5: Completion
- Success confirmation
- Summary of completed actions
- Optional cleanup step

### Conflict Resolution in Desktop

When conflicts occur, the wizard shows:

```
❌ Rebase Conflicts Detected

The following files have conflicts that need to be resolved:
• src/auth/login.ts
• src/types/user.ts

Resolution Steps:
1. Open the session in your editor
2. Resolve conflicts in each file  
3. Stage the resolved files with `git add`
4. Click "Mark Resolved & Continue"

[Open in VS Code]  [Abort Merge]  [Mark Resolved & Continue]
```

## Command Reference

### Preflight

```bash
amp-sessions preflight <sessionId> [--json]
```

**Options:**
- `--json`: Output results in JSON format for scripting

### Merge

```bash
amp-sessions merge <sessionId> --message "<message>" [options]
```

**Required Options:**
- `--message <message>`: Commit message for squashed changes

**Optional Options:**
- `--include-manual <include|exclude>`: Handle manual commits (default: include)
- `--onto <branch>`: Target branch to merge onto (default: session's base branch)
- `--no-ff`: Use --no-ff merge instead of --ff-only
- `--push`: Push to remote after merge
- `--remote <remote>`: Remote to push to (default: origin)
- `--export-patch <file>`: Export patch file before merge
- `--pr`: Create pull request using gh CLI (requires gh installed)
- `--json`: Output JSON for scripting

### Continue/Abort Merge

```bash
amp-sessions continue-merge <sessionId> [--json]
amp-sessions abort-merge <sessionId> [--json]
```

### Cleanup

```bash
amp-sessions cleanup <sessionId> [--yes] [--json]
```

**Options:**
- `--yes`: Skip confirmation prompt
- `--json`: Output JSON format

## Safety Features

### Preflight Validation
- **Repository Clean**: No uncommitted changes
- **Base Up to Date**: Base branch is current with origin
- **Tests Pass**: All configured tests succeed
- **TypeScript**: Compilation succeeds (if monorepo detected)
- **Branch Analysis**: Ahead/behind status, amp commits count

### Conflict Detection
- Automatic conflict detection during rebase
- Clear file-by-file conflict reporting
- Guided resolution with help text
- Safe abort option to return to previous state

### Safe Cleanup
- Verification that session commit is reachable from base
- Prevents accidental data loss from unmerged sessions
- Confirmation prompts for destructive operations

### Atomic Operations
- Each step can be safely interrupted
- Clean rollback on failures
- Consistent state maintenance

## Best Practices

### Before Merging
1. **Complete your work**: Ensure all intended changes are committed
2. **Run tests**: Verify the session passes all tests
3. **Review changes**: Use `amp-sessions diff <session-id>` to review
4. **Update base**: Ensure main branch is current

### Commit Messages
Use conventional commit format:
- `feat: add new feature`
- `fix: resolve bug in authentication`
- `docs: update API documentation`
- `refactor: improve error handling`

### Conflict Resolution
1. **Understand conflicts**: Review both versions carefully
2. **Test after resolution**: Ensure resolution doesn't break functionality
3. **Commit resolved files**: Use `git add` then continue merge
4. **Document complex resolutions**: Add comments explaining non-obvious choices

### Post-Merge
1. **Verify integration**: Test merged changes in main branch
2. **Clean up promptly**: Remove session worktrees to save space
3. **Update documentation**: If the change affects user-facing features

## Troubleshooting

### "Session commit is not reachable from base branch"
**Cause**: Trying to cleanup a session that wasn't properly merged
**Solution**: Complete the merge process first, or force cleanup manually

### "Merge conflicts detected"
**Cause**: Changes conflict with updates in base branch
**Solution**: Use conflict resolution workflow or rebase session manually

### "Base branch is behind origin"
**Cause**: Local base branch needs updates
**Solution**: `git checkout main && git pull --ff-only`

### "Tests failed during preflight"
**Cause**: Session changes break existing tests
**Solution**: Fix tests in the session or update the session code

### "Cannot create pull request"
**Cause**: `gh` CLI not installed or not authenticated
**Solution**: Install GitHub CLI and authenticate, or skip `--pr` option

## Integration with CI/CD

### JSON Output for Scripting

All merge commands support `--json` output:

```bash
amp-sessions merge session-123 --message "feat: add auth" --json
```

```json
{
  "status": "success",
  "sessionId": "session-123", 
  "mergeId": "merge-456",
  "baseBranch": "main",
  "message": "Session merged successfully"
}
```

### Automated Workflows

```bash
#!/bin/bash
# Automated merge script

SESSION_ID="$1"
MESSAGE="$2"

# Run preflight checks
if ! amp-sessions preflight "$SESSION_ID" --json | jq -r '.result.issues | length' | grep -q '^0$'; then
    echo "❌ Preflight checks failed"
    exit 1
fi

# Attempt merge
if amp-sessions merge "$SESSION_ID" --message "$MESSAGE" --push --json; then
    echo "✅ Merge successful"
    amp-sessions cleanup "$SESSION_ID" --yes
else
    echo "❌ Merge failed"
    exit 1
fi
```

## Advanced Usage

### Patch Export for Code Review

```bash
# Export patch before merging for review
amp-sessions merge session-123 \
  --message "feat: add authentication" \
  --export-patch ./review/auth-feature.patch

# Review the patch
git apply --check ./review/auth-feature.patch
```

### Multi-Repository Workflows

```bash
# Merge to different target branch
amp-sessions merge session-123 \
  --message "feat: add microservice" \
  --onto develop \
  --remote upstream
```

### Integration with Pull Request Workflows

```bash
# Create PR automatically after merge
amp-sessions merge session-123 \
  --message "feat: implement user dashboard" \
  --push \
  --pr

# Custom PR creation (if gh installed)
# Will run: gh pr create --fill
```

This merge-to-main flow ensures safe, reviewable, and repeatable integration of Amp session work into production branches.

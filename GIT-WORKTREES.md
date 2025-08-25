# Git Worktrees Strategy

Amp Session Manager uses Git worktrees to provide complete isolation between sessions while maintaining a clean, reviewable history.

## Why Git Worktrees?

Git worktrees allow multiple working directories from the same repository, each on different branches. This provides:

- **Complete Isolation**: Sessions can't interfere with each other
- **Parallel Development**: Multiple sessions can run simultaneously
- **Clean History**: Each session maintains its own commit history
- **Easy Integration**: Standard Git workflows for merging back

## Worktree Structure

```
<repo-root>/
├── .git/                    # Main Git directory
├── .worktrees/              # Session worktrees
│   ├── <session-id-1>/      # Session 1 working directory
│   │   ├── .git             # Points to main .git
│   │   └── <project-files>  # Session's version of files
│   └── <session-id-2>/      # Session 2 working directory
│       ├── .git
│       └── <project-files>
└── <main-branch-files>      # Main working directory
```

## Branch Naming Convention

Branches follow the pattern: `amp/<slug>/<timestamp>`

Examples:
- `amp/fix-auth-bug/20240101-143022`
- `amp/add-session-ui/20240101-150000`
- `amp/refactor-git-ops/20240101-160500`

**Benefits:**
- Clear identification of Amp-managed branches
- Chronological ordering
- Human-readable session identification
- Easy cleanup of old branches

## Session Lifecycle

### 1. Session Creation

```bash
# Create branch from base (e.g., main)
git branch amp/feature-x/20240101-120000 main

# Create worktree directory
mkdir -p .worktrees/<session-id>

# Add worktree on the new branch
git worktree add .worktrees/<session-id> amp/feature-x/20240101-120000

# Initialize agent context
cd .worktrees/<session-id>
mkdir AGENT_CONTEXT
# ... create context files
# Stage context files (no commit - branch starts at base tip)
git add AGENT_CONTEXT/
```

### 2. Iteration Commits

Each Amp iteration results in a commit:

```bash
# Amp makes changes to files
# ... files modified by Amp

# Stage all changes
git add -A

# Commit with amp: prefix
git commit -m "amp: implement authentication middleware"
```

**Commit Message Rules:**
- Amp commits: Start with `amp:`
- Manual commits: Free-form (avoid `amp:` prefix)
- Keep subject line ≤ 72 characters
- Include rationale in body if needed

### 3. Manual Edits

Users can edit files manually at any time:

```bash
# User makes manual changes
# ... edit files

# Commit manual changes
git add specific-files
git commit -m "fix: correct typo in error message"
```

Manual commits are preserved separately and can be included in final squash or kept as-is.

### 4. Squash and Rebase

Before merging back, squash Amp commits:

```bash
# Option 1: Soft reset and recommit
git reset --soft main
git commit -m "feat: implement user authentication system"

# Option 2: Interactive rebase
git rebase -i --rebase-merges main
# Mark amp: commits as 'squash' or 'fixup'
```

Then rebase onto current base branch:

```bash
# Ensure base is up to date
git checkout main
git pull --ff-only

# Rebase session branch
git checkout amp/feature-x/20240101-120000
git rebase main
```

### 5. Cleanup

After successful merge:

```bash
# Remove worktree
git worktree remove .worktrees/<session-id>

# Delete branch (only after merge)
git branch -D amp/feature-x/20240101-120000
```

## Conflict Resolution

When conflicts occur during rebase:

1. **Stop Process**: Set session status to `awaiting-input`
2. **Surface Conflicts**: Show conflicted files in UI/CLI
3. **Provide Guidance**: Create `AGENT_CONTEXT/REBASE_HELP.md`
4. **Manual Resolution**: User resolves conflicts
5. **Continue**: Resume rebase process

Example conflict guidance:

```markdown
# Rebase Conflict Resolution

Conflicts detected in the following files:
- src/auth.ts (lines 15-23)
- package.json (dependencies section)

To resolve:
1. Edit the conflicted files
2. Remove conflict markers (<<<, ===, >>>)
3. Stage resolved files: `git add <file>`
4. Continue rebase: `git rebase --continue`

Or abort and seek help: `git rebase --abort`
```

## Parallel Sessions

Multiple sessions can run safely because:

- Each has its own working directory
- Git tracks branches independently  
- File locks prevent corruption
- Conflicts only occur at merge time

**Best Practices:**
- Avoid overlapping file modifications
- Coordinate large refactors
- Rebase frequently to minimize conflicts
- Use session naming to indicate scope

## Backup and Recovery

**Automatic Backups:**
- All changes committed to Git (distributed backup)
- Session metadata in SQLite database
- Worktree paths tracked for recovery

**Recovery Scenarios:**
```bash
# Reattach lost worktree
git worktree add .worktrees/<session-id> <branch-name>

# Recover from corrupted worktree
git worktree remove .worktrees/<session-id> --force
git worktree add .worktrees/<session-id> <branch-name>

# Find orphaned branches
git branch --all | grep amp/
```

## Performance Considerations

- **Disk Space**: Each worktree is a full working directory
- **File Watching**: Multiple directories to monitor
- **Git Operations**: Scale with number of active sessions

**Optimizations:**
- Clean up completed sessions promptly
- Use sparse-checkout for large repositories
- Limit concurrent sessions based on system resources
- Monitor disk space usage

## Integration with IDEs

Most IDEs handle worktrees well:

**VS Code:**
```bash
# Open session in new window
code .worktrees/<session-id>

# Or add to workspace
# File -> Add Folder to Workspace
```

**JetBrains IDEs:**
- Open worktree directory as new project
- Enable VCS integration for the worktree
- Use built-in Git tools for commit/rebase

## Troubleshooting

Common issues and solutions:

```bash
# Worktree already exists
git worktree remove <path> --force
git worktree add <path> <branch>

# Branch already exists
git branch -D <branch-name>
git branch <branch-name> <base-branch>

# Corrupted worktree
rm -rf .worktrees/<session-id>
git worktree prune
git worktree add .worktrees/<session-id> <branch-name>
```

## Advanced Usage

**Sparse Checkout** (for large repos):
```bash
git -C .worktrees/<session-id> config core.sparseCheckout true
echo "src/*" > .worktrees/<session-id>/.git/info/sparse-checkout
git -C .worktrees/<session-id> read-tree -m -u HEAD
```

**Shared Cache** (experimental):
```bash
# Share object cache between worktrees
git worktree add --detach .worktrees/<session-id>
git -C .worktrees/<session-id> checkout <branch-name>
```

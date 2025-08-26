# Operations Guide

This document contains examples and known gotchas for the Amp Session Conductor.

## CLI Examples

### Creating a Session

```bash
# Basic session creation
amp-sessions new --repo /path/to/your/repo --name "Add authentication" --prompt "Implement user authentication with JWT tokens"

# With test script and model override
amp-sessions new \
  --repo /path/to/your/repo \
  --base develop \
  --name "Add user management" \
  --prompt "Create user CRUD operations with proper validation" \
  --script "pnpm test" \
  --model "gpt-4"
```

### Managing Sessions

```bash
# List all sessions
amp-sessions list

# Show session details
amp-sessions status <session-id>

# View session changes
amp-sessions diff <session-id>
amp-sessions diff <session-id> --staged
amp-sessions diff <session-id> --name-only
```

### Running Iterations

```bash
# Run an iteration
amp-sessions iterate <session-id>

# Run with notes
amp-sessions iterate <session-id> --notes "Fix the failing test"

# Run the test script manually
amp-sessions run <session-id>
```

### Telemetry and Observability

```bash
# View tool call history
amp-sessions tools <session-id>
amp-sessions tools <session-id> --last
amp-sessions tools <session-id> --since abc123
amp-sessions tools <session-id> --limit 10 --json

# View token usage statistics
amp-sessions usage <session-id>
amp-sessions usage <session-id> --last
amp-sessions usage <session-id> --range 5 --json

# Stream amp logs in real-time
amp-sessions logs <session-id> --follow
amp-sessions logs <session-id> --lines 50
```

### Configuration

```bash
# Set Amp CLI path
amp-sessions config set ampPath /path/to/amp

# Set additional Amp arguments
amp-sessions config set ampArgs "--verbose --timeout 300"

# Enable/disable JSON logs
amp-sessions config set enableJSONLogs true

# Configure Amp environment variables
amp-sessions config set ampEnv.AMP_BIN /path/to/amp
amp-sessions config set ampEnv.AMP_ARGS "--verbose --timeout 300"
amp-sessions config set ampEnv.AMP_ENABLE_JSONL true
amp-sessions config set ampEnv.AMP_TOKEN your_token_here

# View current configuration (secrets will be redacted)
amp-sessions config get
amp-sessions config get ampPath
amp-sessions config get ampEnv.AMP_BIN
```

### Finalizing Sessions

#### Traditional Workflow (Individual Steps)

```bash
# Squash all commits into one
amp-sessions squash <session-id> --message "feat: implement user authentication"

# Rebase onto target branch
amp-sessions rebase <session-id> --onto main
```

#### Merge-to-Main Workflow (Guided Process)

```bash
# Run preflight checks before merging
amp-sessions preflight <session-id>
amp-sessions preflight <session-id> --json

# Complete merge flow (squash + rebase + merge)
amp-sessions merge <session-id> \
  --message "feat: implement user authentication" \
  --include-manual include \
  --onto main \
  --push \
  --export-patch ./auth-feature.patch

# Handle conflicts during merge
amp-sessions continue-merge <session-id>
amp-sessions abort-merge <session-id>

# Clean up after successful merge
amp-sessions cleanup <session-id> --yes
```

## Desktop App

Launch the desktop app to get a visual interface for session management:

```bash
cd apps/desktop
pnpm dev
```

The desktop app provides:
- Session list with status indicators
- New session creation modal with repository picker
- Session detail view with iteration, squash, and rebase controls
- **Merge Wizard**: Guided merge-to-main flow with conflict handling
- Real-time notifications for operations
- Iteration console with live Amp logs
- Tool calls panel showing all tool usage
- Token usage sparklines and statistics
- Model override selector for per-session configuration

## Known Gotchas

### Git Repository Requirements

- The target repository must be a valid Git repository
- You must have uncommitted changes staged before creating a worktree
- Ensure the base branch exists and is up-to-date

### Worktree Isolation

- Each session creates an isolated worktree at `<repo>/.worktrees/<session-id>`
- Never manually edit files in the worktree - use Amp iterations instead
- The `AGENT_CONTEXT/` directory contains session metadata and logs

### SQLite Database

- By default, the session database is stored in the user's config directory:
  - macOS: `~/Library/Application Support/ampsm/sessions.sqlite`
  - Linux: `~/.config/ampsm/sessions.sqlite`  
  - Windows: `%APPDATA%\ampsm\sessions.sqlite`
- Override with environment variable: `AMPSM_DB_PATH=/path/to/custom/sessions.sqlite`
- The database is automatically created on first use
- Sessions persist across CLI and desktop app usage

### Dependencies

- Requires `git` (>= 2.38 recommended)
- Requires `node` (LTS version)
- Native compilation required for SQLite (better-sqlite3)

### Error Recovery

If a session gets into a bad state:

```bash
# Check session status
amp-sessions status <session-id>

# Inspect git state in worktree
cd <repo>/.worktrees/<session-id>
git status
git log --oneline

# Manual cleanup if needed
git worktree remove <worktree-path>
git branch -D <branch-name>
```

### Performance Tips

- Keep session prompts focused and specific
- Use test scripts to validate iterations automatically
- Regularly squash and rebase completed sessions
- Clean up old worktrees when sessions are merged

## Troubleshooting

### "Could not locate git repository"
- Ensure the path points to a valid git repository root
- Check that `.git` directory exists in the specified path

### "Branch already exists"
- Session branch names are auto-generated with timestamps
- If this error occurs, wait a moment and retry

### "Worktree path already exists"
- Previous session cleanup may have failed
- Manually remove the worktree directory and retry

### SQLite binding errors
- Run `pnpm rebuild better-sqlite3` to rebuild native bindings
- Ensure you have build tools installed (Xcode Command Line Tools on macOS)

### "Amp command not found"
- Install Amp CLI globally or ensure it's in your PATH
- Configure custom Amp path: `amp-sessions config set ampPath /path/to/amp`
- For testing, use the fake amp fixture included in the tests

### Amp Setup and Authentication Issues
- Run the smoke check to verify your Amp setup: `amp-sessions verify-amp`
- See [AUTHENTICATED_TESTS.md](./AUTHENTICATED_TESTS.md) for detailed auth setup
- Configure authentication with environment variables or config commands

## Telemetry and Token Tracking

The system automatically captures detailed telemetry from Amp iterations:

### Token Usage Tracking
- **Prompt tokens**: Input tokens consumed by the model
- **Completion tokens**: Output tokens generated by the model  
- **Total tokens**: Combined prompt + completion tokens
- **Model tracking**: Which model was used for each iteration
- **Per-session aggregation**: Total usage across all iterations

### Tool Call Monitoring
- **Tool name**: Which tools were invoked (Read, edit_file, etc.)
- **Arguments**: Parameters passed to each tool (with privacy preservation)
- **Success/failure**: Whether each tool call succeeded
- **Duration**: How long each tool call took to execute
- **Timestamp**: When each tool was invoked

### Telemetry Formats
- **JSONL logs**: Preferred format with structured data
- **Text logs**: Fallback parsing with regex patterns
- **Mixed output**: Robust handling of both structured and unstructured logs

## Desktop UI

The desktop app provides an intuitive interface for both individual sessions and batch operations:

### Batch Management
- **Batches Tab**: Access all batch functionality from the main navigation
- **Live Progress**: Real-time updates of batch run status and item completion
- **Plan Editor**: Built-in YAML editor with validation for batch plans
- **Export/Report**: One-click generation of data exports and analysis reports
- **Run Control**: Start, monitor, and abort batch runs from the UI

### Integration with CLI
The desktop UI uses the same core functionality as the CLI:
- Identical batch runs and exports between CLI and UI
- Shared database and telemetry collection
- Same session management and Git operations

### Configuration Options
```bash
# Set custom Amp binary path
amp-sessions config set ampPath /usr/local/bin/amp

# Add Amp CLI arguments (space-separated)
amp-sessions config set ampArgs "--verbose --jsonl-logs"

# Enable JSON log parsing (default: true)  
amp-sessions config set enableJSONLogs true
```

### Model Override Support
- **gpt-5**: Automatically uses `--try-gpt5` flag
- **Custom models**: Passed via `--model` argument
- **Per-session**: Each session can use different models
- **Oracle consultation**: Automatic o3 model usage when needed

## Architecture Notes

The system uses:
- **SQLite** for persistent session metadata and telemetry
- **Git worktrees** for isolated development environments
- **Electron + React** for the desktop interface
- **Commander.js** for the CLI interface
- **TypeScript** throughout for type safety
- **Real-time telemetry parsing** for observability

Sessions are designed to be:
- **Isolated**: Each session has its own branch and worktree
- **Persistent**: Session state survives across restarts
- **Reviewable**: All changes are committed and can be diffed
- **Mergeable**: Sessions can be squashed and rebased cleanly
- **Observable**: Full telemetry and token tracking for analysis

## See Also

- [Batch Evaluations Guide](BATCH_EVALS.md) - Running multiple sessions in parallel for evaluation
- [Merge Flow Documentation](MERGE_FLOW.md) - Squashing and merging session changes
- [Authenticated Tests](AUTHENTICATED_TESTS.md) - Running tests with real Amp authentication

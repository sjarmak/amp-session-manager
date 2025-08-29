# Amp Session Orchestrator

[![CI Status](https://github.com/sjarmak/amp-session-manager/workflows/ci/badge.svg)](https://github.com/sjarmak/amp-session-manager/actions) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A cross-platform desktop app and CLI that turns AI coding sessions into first-class, reviewable Git branches. Create isolated sessions, chat with Amp interactively, track real-time metrics, and merge changes cleanly to your main branch.

## Quick Start

```bash
git clone https://github.com/sjarmak/amp-session-orchestrator.git
cd amp-session-orchestrator
pnpm install && pnpm build
cd apps/desktop && pnpm dev
```

**Prerequisites**: Git ≥2.38, Node.js ≥18, pnpm ≥8, authenticated Amp CLI

## Desktop App Workflow

### Creating Sessions

1. **Launch the Desktop App**: Run `pnpm dev` from the `apps/desktop` directory
2. **Navigate to Sessions Tab**: Main interface for session management
3. **Create New Session**: 
   - Click "New Session" to open the creation modal
   - **Select Repository**: Use the file browser to choose your project directory
   - **Configure Session**:
     - Session name (descriptive identifier)
     - Base branch (default: `main`)
     - Model selection (GPT-5, Alloy, Claude Sonnet 4)
     - Optional test script for validation
   - Click "Create" to initialize the session worktree and branch

### Amp Chat Interface

The Interactive tab provides real-time communication with Amp:

- **Starting Conversations**: Type your coding request or question
- **Continuing Threads**: Previous messages maintain conversation context
- **Thread Management**: 
  - Each session maintains its own conversation thread
  - Switch between sessions to continue different conversations
  - All chat history is preserved and reviewable
- **Real-time Streaming**: Watch Amp's responses appear live
- **Tool Call Execution**: See detailed tool usage and results
- **Connection Status**: Monitor Amp connectivity and authentication

### Metrics Dashboard

The Overview tab displays comprehensive session analytics:

- **Performance Metrics**:
  - Tokens per second processing rate
  - Cost per minute tracking
  - Real-time session progress
- **Token Usage Breakdown**:
  - Input/output tokens by model
  - Total session consumption
  - Cost analysis and budgeting
- **Tool Usage Statistics**:
  - Tool call frequency and success rates
  - File modification tracking
  - Error analysis and debugging
- **Session Timeline**:
  - Iteration history and progress
  - Commit timeline with messages
  - Status changes and events
- **Export Options**: Download metrics as JSON, CSV, or JSONL

### Git Management

The Git tab provides full version control operations:

- **File Status Monitor**:
  - View staged and unstaged changes
  - Preview file modifications with diff viewer
  - Track which files Amp has modified
- **Staging Operations**:
  - Stage individual files or all changes
  - Unstage files before committing
  - Review changes before finalizing
- **Commit Workflow**:
  - Create commits with custom messages
  - View commit history and timeline
  - All Amp commits automatically prefixed with `amp:`
- **Merge to Main**:
  - **Squash**: Combine all `amp:` commits into single commit
  - **Rebase**: Apply changes onto latest main branch
  - **Conflict Resolution**: Guided workflow for merge conflicts
  - **Final Merge**: Clean integration back to main branch

### Session Monitoring

- **Real-time Status**: Track session state (idle, running, awaiting-input, error, done)
- **Background Processing**: Monitor long-running operations
- **Notifications**: Desktop alerts for session completion or errors
- **Progress Tracking**: Visual indicators for iteration progress

## Batch Processing

### Desktop App Batch Management

1. **Navigate to Batches Tab**: Access batch processing interface
2. **Create Batch Configuration**:
   - Upload YAML configuration file or create inline
   - Define multiple repositories and prompts
   - Set concurrency limits and validation scripts
3. **Monitor Execution**: 
   - Real-time progress tracking across all sessions
   - Individual session status updates
   - Aggregate metrics and success rates
4. **Review Results**: Export batch results and analyze outcomes

### CLI Batch Operations

```bash
# Create batch configuration
cat > batch-config.yaml << EOF
name: "Authentication Features"
repos:
  - path: "./frontend"
    baseBranch: "main"
  - path: "./backend"
    baseBranch: "develop"
items:
  - name: "jwt-auth"
    prompt: "Implement JWT authentication middleware"
    script: "npm test"
  - name: "refresh-tokens"
    prompt: "Add refresh token rotation"
concurrency: 2
EOF

# Execute batch
pnpm cli batch start --file batch-config.yaml

# Monitor progress
pnpm cli batch status batch-123 --follow

# Export results
pnpm cli batch export batch-123 --format csv
```

## Benchmarks and Evaluation

### Desktop App Benchmarks

1. **Navigate to Benchmarks Tab**: Access evaluation interface
2. **Configure Benchmark**:
   - Select SWE-bench dataset or custom problems
   - Choose repositories for testing
   - Set evaluation criteria and scripts
3. **Monitor Execution**: Track benchmark progress and results
4. **Analyze Results**: View success rates, performance metrics, and detailed reports

### CLI Benchmark Operations

```bash
# Run SWE-bench evaluation
pnpm cli bench swe-bench-lite --dataset ./swe-bench.jsonl

# Custom benchmark
pnpm cli bench custom --config ./custom-benchmark.yaml

# Export results
pnpm cli bench export bench-run-123 --format csv
```

## Configuration

### Global Settings

Configure the app through `~/.ampsm/config.yaml`:

```yaml
git:
  default_base_branch: "main"
  commit_prefix: "amp:"
amp:
  default_model: "claude-3-5-sonnet"
  timeout: "300s"
notifications:
  desktop: true
telemetry:
  enabled: true
  export_formats: ["jsonl", "csv"]
ui:
  theme: "gruvbox"
  auto_update: true
```

### Environment Variables

```bash
export AMP_API_KEY="your-amp-api-key"              # Required
export AMPSM_DB_PATH="/custom/path/sessions.db"    # Optional
export AMPSM_LOG_LEVEL="debug"                     # Optional
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Desktop app won't start | `pnpm store prune && rm -rf node_modules && pnpm install` |
| IPC handler errors | Restart desktop app; handlers register at startup |
| Git worktree issues | Ensure repo is clean and base branch exists |
| Authentication errors | Run `amp login` and verify with `amp whoami` |

### Verification Commands

```bash
pnpm cli doctor              # System health check
pnpm cli verify-amp          # Test Amp integration
pnpm cli clean-environment   # Clean orphaned worktrees
```

## Architecture

- **packages/core**: Session engine, Git operations, SQLite persistence
- **packages/cli**: Command-line interface (`@ampsm/cli` → `amp-sessions`)
- **packages/types**: Shared TypeScript contracts
- **apps/desktop**: Electron + React + TypeScript + Vite + Tailwind

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed documentation.

## License

MIT License - see [LICENSE](LICENSE) for details.

---

**Support**: [GitHub Issues](https://github.com/sjarmak/amp-session-orchestrator/issues) | [Discussions](https://github.com/sjarmak/amp-session-manager/discussions)

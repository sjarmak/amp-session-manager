# Amp Session Manager

A cross-platform desktop application and CLI that transforms Amp coding sessions into a disciplined, auditable Git workflow with isolated worktrees, atomic commits, and comprehensive telemetry.

## Overview

Amp Session Manager wraps the Amp coding agent in a reproducible Git workflow. Every time you ask Amp to change code, it works inside an **isolated worktree on its own branch**, commits after every iteration, and records rich telemetry. You can run many sessions in parallel, review diffs, and safely squash/rebase/merge changes back to your main branch.

## Core Capabilities

- **Isolated Git Worktree Sessions**: Each session runs in `<repo>/.worktrees/<session-id>` on branch `amp/<slug>/<timestamp>`
- **Deterministic, Atomic Commits**: Every Amp iteration creates a commit with `amp:` prefix  
- **Reviewable History**: Track all changes through desktop UI diff viewer and CLI
- **Safe Merge Workflow**: Squash → rebase → merge with conflict resolution
- **Parallel Execution**: Run multiple sessions simultaneously with file-system locks
- **Test Integration**: Run validation scripts per session with automatic gating
- **Batch Processing**: Execute hundreds of prompts across repositories from YAML configs
- **Real-time Streaming**: Live monitoring of Amp iterations with JSON-structured telemetry
- **Cost & Usage Tracking**: Monitor token usage, tool calls, and costs across all models
- **Rich Telemetry**: SQLite storage with NDJSON/CSV export for analytics
- **Smart Notifications**: Desktop, email, and webhook alerts for session events
- **Interactive Mode**: Threading support for multi-turn conversations with Amp
- **Timeline View**: Visual diff review with chronological change tracking
- **Benchmark Support**: SWE-bench integration for software engineering research

## Architecture

```
amp-session-manager/
├── apps/
│   └── desktop/          # Electron + React + TypeScript + Tailwind
├── packages/
│   ├── core/            # Session engine, Git ops, Amp adapter
│   ├── cli/             # @ampsm/cli -> amp-sessions command
│   └── types/           # Shared TypeScript contracts
└── docs/                # Documentation
```

## Tech Stack

- **Desktop UI**: Electron + React + TypeScript + Vite + Tailwind CSS
- **Backend**: Node.js (TypeScript) in Electron main process
- **CLI**: Node.js (TypeScript), published as `@ampsm/cli`
- **Storage**: SQLite via `better-sqlite3` for session metadata
- **Git Operations**: System `git` via child processes
- **Testing**: Vitest + ts-node
- **CI**: GitHub Actions (lint, typecheck, unit tests)

## Installation

### Prerequisites

- **Node.js**: >= 18.0.0 (LTS recommended)
- **pnpm**: >= 8.0.0 (`npm install -g pnpm`)
- **Git**: >= 2.38 (for improved worktree support)
- **Amp CLI**: Installed and authenticated (`npm install -g @amp/cli && amp auth`)

### Setup

```bash
# Clone repository
git clone https://github.com/sjarmak/amp-session-manager.git
cd amp-session-manager

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Verify Amp integration
pnpm cli verify-amp

# Start desktop application
pnpm dev
```

### Development

```bash
# Start the desktop app (Electron)
pnpm dev

# Run the CLI in watch mode  
pnpm cli

# Run tests across all packages
pnpm test

# Type checking across workspace
pnpm typecheck

# Code linting
pnpm lint
```

## Desktop Application

The desktop application provides a comprehensive GUI for managing Amp sessions:

### Main Features

- **Session Dashboard**: Visual overview of all sessions with real-time status indicators
- **Live Session Monitoring**: Real-time updates as Amp executes iterations with streaming telemetry
- **Diff Viewer**: Side-by-side comparison of changes with syntax highlighting and timeline view
- **Merge Wizard**: Guided workflow for squashing, rebasing, and merging sessions
- **Batch Run Management**: Visual interface for executing and monitoring batch operations
- **Metrics Dashboard**: Charts showing token usage, costs, and performance across sessions
- **Notification Center**: Cross-platform desktop notifications for session events
- **Thread Integration**: View and manage Amp conversation threads directly
- **Interactive Mode**: Multi-turn conversations with threading support

### Navigation

- **Sessions Tab**: Create, iterate, and manage individual sessions
- **Batches Tab**: Configure and monitor multi-session batch runs  
- **Metrics Tab**: Analyze performance and costs across all sessions
- **Settings Tab**: Configure notifications, Amp integration, and preferences

## CLI Interface

### Session Management

```bash
# Create new session
amp-sessions new --repo ./my-repo --name "feature-x" --prompt "Implement feature X"

# List all sessions with status
amp-sessions list

# Run Amp iteration with streaming
amp-sessions iterate <session-id> --stream

# View session changes and timeline
amp-sessions diff <session-id>

# Stream Amp logs in real-time
amp-sessions logs <session-id> --follow

# Interactive mode with threading
amp-sessions interactive <session-id>
```

### Git Workflow

```bash
# Squash all amp: commits into single commit
amp-sessions squash <session-id> --message "feat: implement feature X"

# Rebase onto target branch with conflict resolution
amp-sessions rebase <session-id> --onto main

# Complete merge workflow
amp-sessions merge <session-id>

# Pre-merge validation
amp-sessions preflight <session-id>
```

### Batch Processing

```bash
# Execute batch from YAML configuration
amp-sessions batch start --file ./batch-config.yaml

# Monitor batch execution
amp-sessions batch status <run-id>

# Export batch results
amp-sessions batch export <run-id> --format csv --out ./data

# Run SWE-bench benchmarks
amp-sessions bench <benchmark-suite>
```

### Analytics & Reporting

```bash
# Export all session data
amp-sessions export --format ndjson --out sessions.jsonl

# Generate comprehensive report
amp-sessions report --output report.md

# Show detailed session metrics
amp-sessions metrics <session-id>

# Stream JSON telemetry
amp-sessions iterate <session-id> --stream-json
```

## Session Workflow

1. **Create Session**: `amp-sessions new` creates isolated worktree and branch
2. **Iterate**: Amp makes changes, commits automatically with `amp:` prefix, runs optional tests
3. **Manual Edits**: Make changes anytime - they're tracked separately from Amp commits
4. **Review**: Desktop UI diff viewer or `amp-sessions diff` to examine all changes with timeline view
5. **Squash**: `amp-sessions squash` combines all `amp:` commits into single commit
6. **Rebase**: `amp-sessions rebase` safely rebases onto target branch with conflict handling
7. **Merge**: `amp-sessions merge` completes full workflow or creates PR

## Git Conventions

- **Worktrees**: `<repo>/.worktrees/<session-id>`
- **Branches**: `amp/<slug>/<timestamp>`
- **Commit Messages**: Amp commits start with `amp:`, manual commits are free-form
- **Squashing**: All `amp:` commits combined, manual commits preserved or included based on configuration

## Configuration

Sessions support flexible configuration through:

- **Test Scripts**: Custom validation commands per session
- **Model Override**: Specify different Amp models per session
- **Notification Settings**: Configure desktop, email, and webhook alerts
- **Telemetry Export**: Structured data export in NDJSON and CSV formats

## Telemetry & Metrics

The system captures comprehensive telemetry:

- **Token Usage**: Input/output tokens per model and session
- **Cost Tracking**: Real-time cost monitoring across all models
- **Performance Metrics**: Iteration timing and throughput
- **Git Operations**: Commit frequency, diff sizes, conflict rates
- **Test Results**: Validation script success rates and timing
- **Error Analysis**: Categorized failure modes and recovery patterns

## Troubleshooting

### Common Issues

**IPC Handler Errors**: If you see "No handler registered" errors, restart the desktop app. Handlers are registered immediately to prevent race conditions.

**Build Failures**: Ensure all dependencies are installed with `pnpm install` and run `pnpm build` to verify compilation.

**Git Worktree Issues**: Check that the target repository is clean and the base branch exists before creating sessions.

**Streaming Issues**: If `--stream-json` fails, ensure you're using `--execute` mode for JSON streaming.

### Verification Commands

```bash
# Verify installation
pnpm cli verify-amp

# Check system dependencies
pnpm cli doctor

# Test Git operations
pnpm cli test-git
```

## Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) - Detailed technical documentation
- [GIT-WORKTREES.md](./GIT-WORKTREES.md) - Git workflow specifications
- [AGENT.md](./AGENT.md) - Agent instruction guidelines

## License

MIT

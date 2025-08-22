# Amp Session Manager

A cross-platform desktop application and CLI that transforms Amp coding sessions into a disciplined, auditable Git workflow with isolated worktrees, atomic commits, and comprehensive telemetry.

## Overview

Amp Session Manager wraps the Amp coding agent in a reproducible Git workflow. Every time you ask Amp to change code, it works inside an **isolated worktree on its own branch**, commits after every iteration, and records rich telemetry. You can run many sessions in parallel, review diffs, and safely squash/rebase/merge changes back to your main branch.

## Core Capabilities

- 🔄 **Isolated Git Worktree Sessions**: Each session runs in `<repo>/.worktrees/<session-id>` on branch `amp/<slug>/<timestamp>`
- 📝 **Deterministic, Atomic Commits**: Every Amp iteration creates a commit with `amp:` prefix  
- 🔍 **Reviewable History**: Track all changes through desktop UI diff viewer and CLI
- 🧹 **Safe Merge Workflow**: Squash → rebase → merge with conflict resolution
- ⚡ **Parallel Execution**: Run multiple sessions simultaneously with file-system locks
- 🧪 **Test Integration**: Run validation scripts per session with automatic gating
- 📊 **Batch Processing**: Execute hundreds of prompts across repositories from YAML configs
- 💰 **Cost & Usage Tracking**: Monitor token usage, tool calls, and costs across all models
- 📈 **Rich Telemetry**: SQLite storage with NDJSON/CSV export for analytics
- 🔔 **Smart Notifications**: Desktop, email, and webhook alerts for session events
- 🎯 **Benchmark Support**: SWE-bench integration for software engineering research

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
- **CI**: GitHub Actions

## Quick Start

### Prerequisites

- **Node.js**: >= 18.0.0 (LTS recommended)
- **pnpm**: >= 8.0.0 (`npm install -g pnpm`)
- **Git**: >= 2.38 (for improved worktree support)
- **Amp CLI**: Installed and authenticated (`npm install -g @amp/cli && amp auth`)

### Installation

```bash
# Clone and install dependencies
git clone https://github.com/sjarmak/amp-session-manager.git
cd amp-session-manager
pnpm install

# Build all packages
pnpm build

# Verify Amp integration
pnpm cli verify-amp
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
```

### Desktop UI

The `pnpm dev` command launches an **Electron desktop application** with a React-based interface for managing sessions:

**Main Features:**
- **Session Dashboard**: Visual overview of all sessions with status indicators
- **Live Session Monitoring**: Real-time updates as Amp works on sessions
- **Diff Viewer**: Side-by-side comparison of changes with syntax highlighting  
- **Merge Wizard**: Guided workflow for squashing, rebasing, and merging sessions
- **Batch Run Management**: Visual interface for executing and monitoring batch operations
- **Metrics Dashboard**: Charts showing token usage, costs, and performance across sessions
- **Notification Center**: Desktop notifications for session completion and errors
- **Thread Integration**: View and manage Amp conversation threads directly

**Navigation:**
- Sessions tab: Create, iterate, and manage individual sessions
- Batches tab: Configure and monitor multi-session batch runs  
- Metrics tab: Analyze performance and costs across all sessions
- Settings: Configure notifications, Amp integration, and preferences

The desktop app provides a user-friendly alternative to the CLI, especially useful for reviewing diffs, managing multiple sessions, and monitoring long-running batch operations.

### CLI Usage

```bash
# Session Management
amp-sessions new --repo ./my-repo --name "feature-x" --prompt "Implement feature X"
amp-sessions list                                               # List all sessions with status
amp-sessions iterate <session-id>                              # Run Amp iteration  
amp-sessions diff <session-id>                                 # View session changes
amp-sessions logs <session-id> --follow                        # Stream Amp logs

# Git Workflow
amp-sessions squash <session-id> --message "feat: implement feature X"
amp-sessions rebase <session-id> --onto main                   # Rebase onto target branch
amp-sessions merge <session-id>                                # Complete merge workflow
amp-sessions preflight <session-id>                            # Pre-merge validation

# Batch Processing & Benchmarks
amp-sessions batch start --file ./batch-config.yaml           # Execute batch from config
amp-sessions batch export <run-id> --format csv --out ./data  # Export results
amp-sessions bench <benchmark-suite>                          # Run SWE-bench tests

# Analytics & Reporting
amp-sessions export --format ndjson --out sessions.jsonl      # Export all session data
amp-sessions report --output report.md                        # Generate comprehensive report
amp-sessions metrics <session-id>                             # Show session metrics
```

## Session Workflow

1. **Create Session**: `amp-sessions new` creates isolated worktree and branch
2. **Iterate**: Amp makes changes, commits automatically with `amp:` prefix, runs optional tests
3. **Manual Edits**: Make changes anytime - they're tracked separately from Amp commits
4. **Review**: Desktop UI diff viewer or `amp-sessions diff` to examine all changes  
5. **Squash**: `amp-sessions squash` combines all `amp:` commits into single commit
6. **Rebase**: `amp-sessions rebase` safely rebases onto target branch with conflict handling
7. **Merge**: `amp-sessions merge` completes full workflow or create PR

## Git Conventions

- **Worktrees**: `<repo>/.worktrees/<session-id>`
- **Branches**: `amp/<slug>/<timestamp>`
- **Commit Messages**: Amp commits start with `amp:`, manual commits are free-form
- **Squashing**: All `amp:` commits combined, manual commits preserved or included

## Troubleshooting

### Common Issues

**IPC Handler Errors**: If you see "No handler registered" errors, restart the desktop app. Handlers are now registered immediately to prevent race conditions.

**Build Failures**: Ensure all dependencies are installed with `pnpm install` and run `pnpm build` to verify everything compiles.

**Git Worktree Issues**: If sessions fail to create, check that the target repository is clean and the base branch exists.

### Development Commands

```bash
pnpm dev        # Start desktop app in development mode
pnpm test       # Run all tests
pnpm typecheck  # TypeScript type checking
pnpm lint       # Code linting
```

## Development

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed technical documentation and [GIT-WORKTREES.md](./GIT-WORKTREES.md) for Git workflow details.

## License

MIT

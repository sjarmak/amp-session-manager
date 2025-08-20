# Amp Session Manager

A cross-platform desktop application and CLI for managing isolated Git worktree sessions with the Amp coding agent.

## Overview

Amp Session Manager creates and manages **sessions from prompts**, each running in its own **Git worktree** on a dedicated branch. Every iteration with Amp ends with a commit, enabling reviewable diffs and safe squash/rebase operations back to the main branch.

## Features

- 🔄 **Isolated Sessions**: Each session runs in its own Git worktree
- 📝 **Deterministic Commits**: Every Amp iteration results in a commit
- 🔍 **Reviewable Diffs**: Track all changes through the UI and CLI
- 🧹 **Clean Integration**: Squash session commits and rebase onto base branch
- ⚡ **Parallel Sessions**: Run multiple sessions simultaneously
- 🔔 **Notifications**: Get notified when sessions need attention
- 🧪 **Test Integration**: Run test scripts per session
- 📊 **Batch Processing**: Run multiple prompts across different repositories
- 💾 **Export & Reporting**: Export session data and generate detailed reports

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

### Installation

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build
```

### Development

```bash
# Start the desktop app
pnpm dev

# Run the CLI in watch mode
pnpm cli

# Run tests
pnpm test

# Type checking
pnpm typecheck
```

### CLI Usage

```bash
# Session Management
amp-sessions list                                               # List all sessions
amp-sessions new --repo ./my-repo --name "feature-x" --prompt "Implement feature X"
amp-sessions iterate <session-id>                              # Run an iteration
amp-sessions squash <session-id> --message "feat: implement feature X"

# Batch Processing
amp-sessions batch start --file ./batch-config.json           # Start a batch run
amp-sessions batch list                                        # List batch runs
amp-sessions batch status <run-id>                            # Check batch status
amp-sessions batch abort <run-id>                             # Abort running batch
amp-sessions batch export <run-id> --format csv --out ./data  # Export batch results
```

## Session Workflow

1. **Create Session**: Specify repository, base branch, and initial prompt
2. **Iterate**: Amp makes changes and commits automatically with `amp:` prefix
3. **Manual Edits**: Make manual changes anytime - they're tracked separately
4. **Review**: Use the UI or CLI to review all diffs and changes
5. **Squash**: Combine all `amp:` commits into a single commit
6. **Rebase**: Clean rebase onto the base branch
7. **Merge**: Standard Git merge workflow

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

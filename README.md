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
# List all sessions
amp-sessions list

# Create a new session
amp-sessions new --repo ./my-repo --name "feature-x" --prompt "Implement feature X"

# Run an iteration
amp-sessions iterate <session-id>

# Squash and merge
amp-sessions squash <session-id> --message "feat: implement feature X"
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

## Development

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed technical documentation and [GIT-WORKTREES.md](./GIT-WORKTREES.md) for Git workflow details.

## License

MIT

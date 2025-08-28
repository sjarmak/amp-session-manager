# Amp Session Orchestrator

[![CI Status](https://github.com/sjarmak/amp-session-manager/workflows/ci/badge.svg)](https://github.com/sjarmak/amp-session-manager/actions) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A cross-platform desktop app and CLI that turns AI coding sessions into first-class, reviewable Git branches. It automates the iterate-commit-test loop with Amp, keeps history clean with worktrees and squash-rebases, and captures full audit logs – giving teams the speed of an AI pair-programmer without sacrificing code quality, security, or Git hygiene.

## Table of Contents

1. [TL;DR Quick-Start](#tldr-quick-start)
2. [Why Amp Session Orchestrator?](#why-amp-session-orchestrator)
3. [Key Use Cases](#key-use-cases)
4. [Features At-a-Glance](#features-at-a-glance)
5. [Installation](#installation)
6. [Desktop App vs. CLI - Which one do I need?](#desktop-app-vs-cli---which-one-do-i-need)
7. [Detailed Usage](#detailed-usage)
8. [Configuration](#configuration)
9. [Advanced Topics](#advanced-topics)
10. [Troubleshooting & FAQ](#troubleshooting--faq)
11. [Contributing](#contributing)
12. [Security](#security)
13. [License](#license)

## TL;DR Quick-Start

````bash
# Clone and build from source
git clone https://github.com/sjarmak/amp-session-manager.git
cd amp-session-manager
pnpm install && pnpm build

cd apps/desktop
pnpm dev

# If the desktop app doesn't launch:
pnpm store prune
rm -rf ~/.cache/electron
rm -rf node_modules
pnpm install

cd apps/desktop
pnpm dev

**Note**: You need Git ≥2.38, Node.js ≥18, pnpm ≥8, and authenticated Amp CLI installed first.

## Why Amp Session Orchestrator?

- **Keeps AI-generated code isolated until ready**: Every Amp session runs in its own Git worktree, preventing conflicts with your main branch and enabling parallel development
- **Makes every Amp iteration reviewable with deterministic commits**: Each iteration creates an atomic commit, making all changes traceable and reversible
- **Automates Git worktree/branch management**: No more manual branch creation, worktree setup, or merge conflicts from AI experiments
- **Provides rich audit logs and telemetry**: Comprehensive tracking of token usage, cost monitoring, and decision trails for teams and compliance
- **Supports quality gates through test scripts**: Built-in validation ensures AI changes meet your standards before merging
- **Works identically via CLI and desktop UI**: Full feature parity between command-line automation and visual session management

## Key Use Cases

- **AI feature branches**: Spin up isolated sessions for feature development, letting Amp iterate safely while you review each step
- **Bug-fix/debug loops with test validation**: Use test scripts as quality gates to ensure fixes don't break existing functionality
- **Batch refactors across multiple areas**: Process dozens of similar changes across repositories with full audit trails
- **Teaching/demos with visible timeline of changes**: Show exactly how AI approaches problems with reviewable commit history
- **CI automation for reviewable AI-generated changes**: Integrate into pipelines for automated code generation that still requires human approval

## Features At-a-Glance

**Session Management**: Isolated Git worktrees, atomic commits per iteration, parallel execution with file-system locks
**Desktop Application**: Electron GUI with real-time monitoring, diff viewer, batch management, and interactive chat
**CLI Interface**: Complete command-line control for automation, CI integration, and power users
**Git Integration**: Smart squash/rebase workflows, conflict resolution, and merge wizards
**Batch Processing**: Execute hundreds of prompts across repositories from YAML configurations
**Telemetry & Analytics**: SQLite storage, JSONL/CSV export, token usage tracking, and cost monitoring
**Interactive Mode**: Multi-turn conversations with Amp using thread continuity
**SWE-bench Support**: Automated benchmarking and software engineering research integration

## Installation

### Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| **Node.js** | ≥18.0.0 LTS | Runtime for all components |
| **pnpm** | ≥8.0.0 | Package manager and workspace orchestration |
| **Git** | ≥2.38 | Worktree operations and repository management |
| **Amp CLI** | Latest | AI coding agent integration |

**Platform-specific build tools**:
- **macOS**: Xcode Command Line Tools (`xcode-select --install`)
- **Windows**: Visual Studio Build Tools or Visual Studio with C++ workload
- **Linux**: `build-essential`, `libssl-dev`, `python3-dev`

### From Source (Recommended)

```bash
# Clone repository
git clone https://github.com/sjarmak/amp-session-manager.git
cd amp-session-manager

# Install dependencies (includes native compilation)
pnpm install

# Build all packages
pnpm build

# Verify Amp CLI integration
pnpm cli verify-amp

# Start desktop application (optional)
pnpm dev
````

**Native dependency troubleshooting**:

```bash
# If better-sqlite3 fails to compile
pnpm rebuild
# or manually
cd node_modules/better-sqlite3 && npm run build-release
```

### Amp CLI Setup

```bash
# Install Amp CLI globally
npm install -g @amp/cli

# Authenticate (required)
amp login
# Follow prompts to authenticate with your credentials

# Verify authentication
amp whoami
```

### Docker (Headless CLI Only)

```dockerfile
FROM node:18-alpine
RUN apk add --no-cache git python3 make g++
COPY . /app
WORKDIR /app
RUN pnpm install && pnpm build
ENTRYPOINT ["node", "packages/cli/dist/index.js"]
```

## Desktop App vs. CLI - Which one do I need?

**Choose Desktop App if you want**:

- Visual session management with real-time updates
- Interactive diff viewer with syntax highlighting
- Guided merge workflows and conflict resolution
- Batch monitoring with progress visualization
- Multi-turn conversations with Amp
- Notifications and alerts

**Choose CLI if you want**:

- Automation and CI/CD integration
- Script-driven batch processing
- Terminal-based workflows
- Minimal resource usage
- Remote server deployment
- Custom tooling integration

**Use both**: The desktop app and CLI share the same SQLite database and can be used interchangeably.

## Detailed Usage

### Session Lifecycle Walkthrough

**1. Create Session**

```bash
# Create isolated session in worktree
pnpm cli new --repo ./my-project \
              --name "feature-auth" \
              --prompt "Implement JWT authentication with refresh tokens" \
              --script "npm test" \
              --model gpt-5

# Output:
# Created session: sess-a1b2c3d4
# Worktree: ./my-project/.worktrees/sess-a1b2c3d4
# Branch: amp/feature-auth/20241201-143022
```

**2. Run Iterations**

```bash
# Execute Amp iteration with streaming output
pnpm cli iterate sess-a1b2c3d4 --stream

# Interactive mode for multi-turn conversation
pnpm cli interactive sess-a1b2c3d4

# Check status and view changes
pnpm cli status sess-a1b2c3d4
pnpm cli diff sess-a1b2c3d4 --staged
```

**3. Review and Merge**

```bash
# Squash all amp: commits into single commit
pnpm cli squash sess-a1b2c3d4 --message "feat: add JWT authentication system"

# Rebase onto main branch
pnpm cli rebase sess-a1b2c3d4 --onto main

# Complete merge workflow
pnpm cli merge sess-a1b2c3d4
```

### Batch Processing

**Create batch configuration**:

```yaml
# batch-auth-features.yaml
name: "Authentication Features Batch"
description: "Implement auth across multiple repositories"
repos:
  - path: "./frontend"
    baseBranch: "main"
  - path: "./backend"
    baseBranch: "develop"
items:
  - name: "jwt-auth"
    prompt: "Add JWT authentication middleware"
    script: "npm test"
    model: "gpt-5"
  - name: "refresh-tokens"
    prompt: "Implement refresh token rotation"
    script: "npm test"
concurrency: 3
notifications:
  webhook: "https://hooks.slack.com/services/..."
```

**Execute batch**:

```bash
# Start batch processing
pnpm cli batch start --file batch-auth-features.yaml

# Monitor progress
pnpm cli batch status batch-abc123 --follow

# Export results
pnpm cli batch export batch-abc123 --format csv --out ./results/
```

### Metrics & Telemetry

**View session metrics**:

```bash
# Detailed session analytics
pnpm cli metrics sess-a1b2c3d4

# Token usage across all sessions
pnpm cli usage --model gpt-5 --since "2024-11-01"

# Export telemetry data
pnpm cli export --format jsonl --out sessions.jsonl
```

**SQLite Database Schema**:
The system stores all data in `~/.ampsm/sessions.db` with tables for:

- `sessions` - Core session metadata and configuration
- `iterations` - Individual Amp execution records with metrics
- `tool_calls` - Detailed tool usage and performance data
- `threads` - Conversation history and threading information
- `batch_runs` - Batch execution tracking and results

**External Analysis**:

```bash
# Open database in SQLite CLI
sqlite3 ~/.ampsm/sessions.db

# Example queries
SELECT name, status, created_at FROM sessions ORDER BY created_at DESC;
SELECT SUM(input_tokens + output_tokens) FROM iterations WHERE model = 'gpt-5';
```

## Configuration

### Global Configuration

Location: `~/.ampsm/config.yaml`

```yaml
# Sample configuration with defaults
database:
  path: "~/.ampsm/sessions.db"
  backup_interval: "24h"

git:
  default_base_branch: "main"
  worktree_dir: ".worktrees"
  commit_prefix: "amp:"

amp:
  default_model: "gpt-4"
  timeout: "300s"
  retry_attempts: 3

notifications:
  desktop: true
  email:
    enabled: false
    smtp_host: ""
    from: ""
    to: []
  webhook:
    enabled: false
    url: ""

telemetry:
  enabled: true
  export_formats: ["jsonl", "csv"]
  retention_days: 365

ui:
  theme: "gruvbox"
  auto_update: true
  confirm_destructive: true
```

### Per-Session Overrides

```bash
# Override model for specific session
pnpm cli new --blend alloy-random --repo ./project --prompt "..."

# Set custom test script
pnpm cli new --script "pnpm test:integration" --repo ./project --prompt "..."

# Configure notifications per session
pnpm cli new --notify-webhook https://hooks.slack.com/... --repo ./project --prompt "..."
```

### Environment Variables

```bash
export AMP_API_KEY="your-amp-api-key"              # Required: Amp authentication
export AMPSM_DB_PATH="/custom/path/sessions.db"    # Optional: Custom database location
export AMPSM_CONFIG_DIR="/custom/config"           # Optional: Custom config directory
export AMPSM_LOG_LEVEL="debug"                     # Optional: Logging verbosity
export AMPSM_DISABLE_TELEMETRY="true"              # Optional: Disable usage tracking
```

## Advanced Topics

### Git Worktree Conventions

- **Worktree Location**: `<repo>/.worktrees/<session-id>/`
- **Branch Naming**: `amp/<slug>/<timestamp>` (e.g., `amp/auth-feature/20241201-143022`)
- **Commit Messages**: Amp commits prefixed with `amp:`, manual commits use free-form messages
- **Squashing Strategy**: All `amp:` commits combined; manual commits preserved or included based on configuration
- **Safety**: Repository-level locking prevents concurrent operations; orphaned worktrees auto-detected and cleaned

For complete Git workflow specifications, see [GIT-WORKTREES.md](./GIT-WORKTREES.md).

### Custom Test Hooks

```bash
# Session with validation script
pnpm cli new --script "make test-integration" --repo ./project --prompt "..."

# Complex test pipeline
pnpm cli new --script "./scripts/validate-feature.sh" --repo ./project --prompt "..."

# Test script with custom timeout
pnpm cli new --script "npm test" --timeout 600 --repo ./project --prompt "..."
```

Test scripts run after each iteration and gate session progression:

- **Exit Code 0**: Iteration succeeds, continue
- **Non-Zero Exit**: Mark session as `awaiting-input`, surface logs to user

### SWE-bench Integration

```bash
# Run SWE-bench evaluation
pnpm cli bench swe-bench-lite --dataset ./swe-bench.jsonl

# Custom benchmark configuration
pnpm cli bench custom --config ./custom-benchmark.yaml

# Export benchmark results
pnpm cli bench export bench-run-123 --format csv
```

SWE-bench integration supports:

- Official SWE-bench dataset mounting
- Custom problem definitions
- Parallel execution across repositories
- Automated result analysis and reporting

### Extending WorktreeManager Metrics

The core WorktreeManager emits events via MetricsEventBus for custom tracking:

```typescript
import { WorktreeManager } from "@ampsm/core";

const manager = new WorktreeManager();
manager.metricsEventBus.on("iteration.started", (event) => {
  console.log(`Session ${event.sessionId} iteration started`);
});

manager.metricsEventBus.on("git.conflict", (event) => {
  // Custom conflict handling
  notifyDevOpsTeam(event);
});
```

## Troubleshooting & FAQ

| Issue                     | Symptoms                                      | Solution                                                  |
| ------------------------- | --------------------------------------------- | --------------------------------------------------------- |
| **IPC Handler Errors**    | "No handler registered for..." in desktop app | Restart desktop app; handlers register at startup         |
| **Build Failures**        | Native module compilation errors              | Run `pnpm rebuild`; ensure platform build tools installed |
| **Git Worktree Issues**   | "fatal: invalid reference" errors             | Check target repo is clean and base branch exists         |
| **Streaming Failures**    | JSON parsing errors in `--stream-json`        | Use `--execute` mode; ensure Amp CLI ≥latest version      |
| **Authentication Errors** | "amp: not authenticated"                      | Run `amp login` and verify with `amp whoami`              |
| **Database Locks**        | SQLite busy/locked errors                     | Check no other instances running; restart if persistent   |

### Verification Commands

```bash
# Comprehensive system check
pnpm cli doctor

# Test Git operations
pnpm cli test-git --repo ./test-repo

# Verify Amp integration
pnpm cli verify-amp

# Check database integrity
pnpm cli db check

# Clean orphaned worktrees
pnpm cli clean-environment
```

### Common Error Codes

- **E001**: Git repository not found or invalid
- **E002**: Amp CLI authentication failure
- **E003**: SQLite database corruption
- **E004**: Worktree creation failed
- **E005**: Session iteration timeout
- **E006**: Test script validation failure

### Performance Tuning

```bash
# Increase SQLite performance
export AMPSM_SQLITE_CACHE_SIZE=10000
export AMPSM_SQLITE_JOURNAL_MODE=WAL

# Reduce memory usage for large batches
export AMPSM_BATCH_CONCURRENCY=2
export AMPSM_STREAM_BUFFER_SIZE=1024

# Enable debug logging
export AMPSM_LOG_LEVEL=debug
```

## Contributing

### Development Environment Setup

```bash
# Clone and setup development environment
git clone https://github.com/sjarmak/amp-session-manager.git
cd amp-session-manager
pnpm install

# Run tests across all packages
pnpm test

# Type checking
pnpm typecheck

# Start development servers
pnpm dev      # Desktop app with hot reload
pnpm cli      # CLI in watch mode
```

### Architecture Overview

The system uses a monorepo structure with clear separation of concerns:

- **packages/core**: Session engine, Git operations, Amp adapter, SQLite persistence
- **packages/cli**: Command-line interface with Commander.js
- **packages/types**: Shared TypeScript interfaces and data models
- **apps/desktop**: Electron + React desktop application

For detailed architectural documentation, see [ARCHITECTURE.md](./ARCHITECTURE.md).

### Commit Style

- **feat**: New features (`feat: add batch processing support`)
- **fix**: Bug fixes (`fix: handle Git worktree conflicts`)
- **docs**: Documentation changes (`docs: update CLI reference`)
- **perf**: Performance improvements (`perf: optimize SQLite queries`)
- **test**: Test additions/changes (`test: add WorktreeManager unit tests`)

### Code of Conduct

We follow the [Contributor Covenant](https://www.contributor-covenant.org/) code of conduct. Be respectful, inclusive, and constructive in all interactions.

## Security

### Token Handling

- **Storage**: Amp API keys stored in system keychain (macOS Keychain, Windows Credential Manager, Linux Secret Service)
- **Transmission**: All API communication uses TLS 1.3
- **Database**: SQLite database contains no API keys or sensitive data
- **Logs**: Logs are filtered to remove any potential secrets

### Data Privacy

- **Local First**: All source code and telemetry remain on your machine by default
- **Opt-in Sharing**: Webhook notifications and external exports require explicit configuration
- **Telemetry**: Usage analytics are anonymized and contain no source code or business logic

### File Permissions

- **Database**: `~/.ampsm/sessions.db` created with 0600 permissions (user read/write only)
- **Config**: `~/.ampsm/config.yaml` created with 0644 permissions
- **Worktrees**: Inherit permissions from parent repository

## License

MIT License - see [LICENSE](LICENSE) file for details.

---

**Questions or Issues?** Open a [GitHub issue](https://github.com/sjarmak/amp-session-manager/issues) or check the [Discussions](https://github.com/sjarmak/amp-session-manager/discussions) for community support.

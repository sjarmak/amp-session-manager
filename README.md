# Amp Session Orchestrator

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A cross-platform desktop app and CLI that turns AI coding sessions into first-class, reviewable Git branches. Create isolated sessions, chat with Amp interactively, track real-time metrics, and merge changes cleanly to your main branch.

**Key Features:**
- **Production & Development Support**: Switch between production Amp and local development environments
- **Live Mode Switching**: Change Amp configurations without restarting the application
- **Comprehensive Testing**: Run evaluations and benchmarks against both environments

## Quick Start

```bash
git clone https://github.com/sjarmak/amp-session-orchestrator.git
cd amp-session-orchestrator
pnpm install && pnpm build
cd apps/desktop && pnpm dev
```

**Prerequisites**: Git ≥2.38, Node.js ≥18, pnpm ≥8, authenticated Amp CLI

## Local Development Support

The Amp Session Orchestrator supports both production and local development Amp environments, allowing you to test changes and run evaluations against your development setup.

### Setup for Local Development

If you have a local Amp development environment:

1. **Configure Local Mode**: Click the settings icon (⚙️) in the desktop app header
2. **Select Amp Mode**:
   - **Production**: Use the standard Amp service (default)
   - **Local CLI**: Use a local Amp CLI binary for development
   - **Local Server**: Connect to your local Amp development server
3. **Set Paths**: Configure paths to your local Amp CLI and server URLs
4. **Authentication**: 
   - **Production**: Ensure `amp login` is authenticated in your terminal
   - **Local**: Set up your local development environment authentication

### Switching Between Modes

You can switch between production and local development modes at any time:

1. **Open Settings**: Click the lefthand grid icon in the app header
2. **Change Mode**: Select your desired Amp environment
3. **Update Paths**: Adjust CLI path to your local Amp CLI path (e.g, /Users/username/amp/cli/dist/main.js)
4. **Apply**: Settings take effect immediately without restarting and you can swap between production and development without restarting the app

### Development Workflow

**Testing Local Changes:**
- Switch to local mode to test your Amp modifications
- Run sessions and benchmarks against your development environment
- Switch back to production for normal usage

**Evaluation and Testing:**
- Use local mode for extensive testing without production usage limits
- Run benchmarks against your local development setup
- Compare results between local and production environments

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
# Execute batch (production)
pnpm cli batch start --file batch-config.yaml

# Execute batch (local development)
pnpm cli batch start --file batch-config.yaml --amp-server https://localhost:7002

# Monitor progress
pnpm cli batch status batch-123 --follow

# Export results
pnpm cli batch export batch-123 --format csv
```

#### Local Development CLI Support

All CLI commands support local Amp development environments:

```bash
# Session commands with local Amp
pnpm cli new --repo ./my-project --name "test" --prompt "Hello" --amp-server https://localhost:7002
pnpm cli iterate session-id --amp-cli /path/to/local/amp/cli/dist/main.js

# Benchmark commands with local Amp
pnpm cli benchmark eval.yaml --amp-server https://localhost:7002

# Use environment variables
export AMP_SERVER_URL="https://localhost:7002"
export AMP_CLI_PATH="/path/to/local/amp/cli/dist/main.js"
pnpm cli benchmark eval.yaml
```

#### Batch Configuration Schema

```yaml
# batch-config.yaml - Complete configuration example
runId: "custom-batch-id"                    # Optional: Custom batch identifier
concurrency: 3                             # Required: Max parallel sessions

# Default settings applied to all matrix items
defaults:
  baseBranch: "main"                        # Required: Default base branch
  scriptCommand: "npm test"                 # Optional: Default test/validation script
  model: "claude-3-5-sonnet"               # Optional: Default AI model
  jsonLogs: true                           # Optional: Enable structured logging
  timeoutSec: 600                          # Optional: Timeout per session (seconds)
  retries: 2                               # Optional: Retry attempts on failure
  mergeOnPass: false                       # Optional: Auto-merge successful sessions

# Matrix of batch items (required, minimum 1 item)
matrix:
  - repo: "./frontend"                      # Required: Repository path
    prompt: "Implement JWT authentication"  # Required: Task description
    baseBranch: "develop"                   # Optional: Override default branch
    scriptCommand: "pnpm test:auth"         # Optional: Override default script
    model: "gpt-5"                          # Optional: Override default model
    timeoutSec: 900                         # Optional: Override default timeout
    mergeOnPass: true                       # Optional: Override default merge behavior
  
  - repo: "./backend"
    prompt: "Add refresh token rotation"
    # Uses defaults for unspecified options
  
  - repo: "./mobile"
    prompt: "Update authentication flow"
    model: "alloy"                          # Use --blend alloy-random mode
    scriptCommand: "flutter test"
```

**Configuration Options:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `runId` | string | No | Custom batch identifier (auto-generated if omitted) |
| `concurrency` | number | Yes | Maximum parallel sessions to run |
| `defaults.baseBranch` | string | Yes | Default Git branch for all repositories |
| `defaults.scriptCommand` | string | No | Default test/validation command |
| `defaults.model` | string | No | Default AI model (`claude-3-5-sonnet`, `gpt-5`, `alloy`) |
| `defaults.jsonLogs` | boolean | No | Enable structured JSON logging for metrics |
| `defaults.timeoutSec` | number | No | Timeout per session in seconds |
| `defaults.retries` | number | No | Number of retry attempts on failure |
| `defaults.mergeOnPass` | boolean | No | Auto-merge sessions that pass validation |
| `matrix[].repo` | string | Yes | Path to repository for this item |
| `matrix[].prompt` | string | Yes | Task description for Amp |
| `matrix[].baseBranch` | string | No | Override default base branch |
| `matrix[].scriptCommand` | string | No | Override default validation script |
| `matrix[].model` | string | No | Override default AI model |
| `matrix[].timeoutSec` | number | No | Override default timeout |
| `matrix[].mergeOnPass` | boolean | No | Override default merge behavior |

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

#### Benchmark Configuration Schema

```yaml
# benchmark-config.yaml - Complete configuration example
version: 1                                  # Required: Configuration version
name: "Custom Benchmark"                    # Required: Benchmark name
description: "Evaluation of specific tasks" # Optional: Benchmark description

# Global defaults applied to all suites and cases
defaults:
  base_branch: "main"                       # Default Git branch
  parallel: 4                               # Parallel execution limit
  max_iterations: 10                        # Maximum iterations per case
  timeout_sec: 900                          # Timeout per case (15 minutes)
  json_logs: true                           # Enable structured logging
  merge_on_pass: false                      # Never auto-merge (measurement only)

# Model configurations for testing different AI models
models:
  default:
    name: "default"                         # Use Amp's default model
  gpt5:
    name: "gpt-5"
    amp_args: ["--try-gpt5"]               # CLI arguments for GPT-5
  alloy:
    name: "alloy"
    amp_args: ["--blend", "alloy-random"]   # CLI arguments for Alloy

# Metrics to collect and analyze
metrics:
  - success_rate                            # Pass rate percentage
  - avg_iterations                          # Average iterations to completion
  - avg_prompt_tokens                       # Average input tokens used
  - avg_completion_tokens                   # Average output tokens generated
  - avg_total_tokens                        # Average total tokens consumed
  - total_cost_usd                          # Total cost in USD
  - total_runtime_sec                       # Total execution time

# Test suites containing cases
suites:
  - id: "smoke_tests"                       # Required: Suite identifier
    description: "Quick validation tasks"   # Optional: Suite description
    max_iterations: 5                       # Optional: Override default max iterations
    cases:
      - id: "readme_creation"               # Required: Case identifier
        repo: "octocat/Hello-World"         # Required: Repository (GitHub slug or path)
        prompt: |                           # Required: Task description
          Create a README.md file explaining how to run the project
        script_command: "grep -q 'Hello' README.md"  # Optional: Validation script
        
      - id: "function_addition"
        repo: "scratch/math-lib"
        setup_script: |                     # Optional: Pre-execution setup
          echo 'def subtract(a,b): return a-b' > math.py
        prompt: |
          Add an add(a: int, b: int) -> int function and test file
        follow_up_prompts:                  # Optional: Multi-turn conversation
          - "Add type hints to all functions"
          - "Optimize for performance"
        script_command: "pytest -q"
        
  - id: "swe_bench_cases"                   # SWE-bench integration
    description: "Real bug fixing evaluation"
    swebench_cases_dir: "eval_data/swebench/easy"  # Directory with *.json case files
    max_iterations: 8
```

**Configuration Options:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | number | Yes | Configuration schema version (currently 1) |
| `name` | string | Yes | Benchmark name for identification |
| `description` | string | No | Detailed benchmark description |
| `defaults.base_branch` | string | No | Default Git branch for repositories |
| `defaults.parallel` | number | No | Maximum parallel case execution |
| `defaults.max_iterations` | number | No | Maximum iterations per case |
| `defaults.timeout_sec` | number | No | Timeout per case in seconds |
| `defaults.json_logs` | boolean | No | Enable structured logging |
| `defaults.merge_on_pass` | boolean | No | Auto-merge successful cases |
| `models` | object | No | AI model configurations to test |
| `models.*.name` | string | Yes | Model identifier |
| `models.*.amp_args` | array | No | Additional CLI arguments for model |
| `metrics` | array | No | List of metrics to collect |
| `suites[].id` | string | Yes | Unique suite identifier |
| `suites[].description` | string | No | Suite description |
| `suites[].max_iterations` | number | No | Override default max iterations |
| `suites[].cases` | array | No | List of test cases (if not using SWE-bench) |
| `suites[].cases[].id` | string | Yes | Unique case identifier |
| `suites[].cases[].repo` | string | Yes | Repository path or GitHub slug |
| `suites[].cases[].prompt` | string | Yes | Task description for Amp |
| `suites[].cases[].script_command` | string | No | Validation/test command |
| `suites[].cases[].setup_script` | string | No | Pre-execution setup commands |
| `suites[].cases[].follow_up_prompts` | array | No | Multi-turn conversation prompts |
| `suites[].swebench_cases_dir` | string | No | Path to SWE-bench case files directory |

**SWE-bench Integration:**
- Set `swebench_cases_dir` to directory containing `*.json` case files
- Each JSON file should contain `id`, `repo`, `bugCommit`, `fixCommit`, `testPath`, and `prompt`
- Cases automatically use repository setup and validation from SWE-bench format

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

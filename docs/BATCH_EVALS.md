# Batch Evaluations

The Amp Session Manager supports batch execution of multiple sessions for evaluation and testing purposes. This allows you to run the same or different prompts across multiple repositories with controlled concurrency and comprehensive reporting.

## Using the Desktop UI

The desktop app provides a user-friendly interface for creating, monitoring, and managing batch runs:

### Accessing Batches

1. Open the Amp Session Manager desktop app
2. Click on the **Batches** tab in the top navigation
3. You'll see a list of all batch runs with their status and progress

### Creating a New Batch

1. Click the **New Batch** button
2. In the plan editor, enter your batch configuration in YAML format
3. Use the runtime overrides panel to adjust settings without modifying the plan
4. Click **Validate Plan** to check for errors
5. Click **Start Batch** to begin execution

### Monitoring Progress

- The runs overview shows real-time status for all batches
- Click any run ID to view detailed progress
- Live progress bars show completion percentage
- Individual item status updates automatically
- Use filters to view specific status types or search by repository/prompt

### Exporting and Reporting

From any batch run detail view:
- **Export**: Choose JSON or CSV format, exports all data tables
- **Report**: Generate comprehensive analysis in Markdown or HTML format
- **Abort**: Stop running batches (confirmation required)

### Batch Actions

- **View**: Navigate to detailed run view with live progress
- **Abort**: Stop a running batch (queued items marked as error)
- **Export/Report**: Generate data exports and analysis reports

## Overview

Batch execution creates multiple isolated sessions, each running a single iteration with Amp. All telemetry, tool calls, and results are collected for analysis and export.

## Plan Schema

Batch execution is configured using a YAML plan file:

```yaml
runId: optional-string        # auto-generate if missing
concurrency: 2
defaults:
  baseBranch: main
  scriptCommand: "pnpm -w test"
  model: gpt-5                # maps to --try-gpt5 via AmpAdapter
  jsonLogs: true
  timeoutSec: 900
  retries: 1                  # not implemented yet
  mergeOnPass: false          # do NOT merge by default
matrix:
  - repo: /abs/path/repoA
    prompt: "Implement feature A"
  - repo: /abs/path/repoB
    prompt: "Refactor module B"
    baseBranch: develop       # override default
    scriptCommand: "npm test" # override default
    model: gpt-4o            # override default
    mergeOnPass: true        # override default
```

### Plan Fields

- **runId**: Optional identifier for the batch run. Auto-generated if not provided.
- **concurrency**: Number of sessions to run in parallel.
- **defaults**: Default settings applied to all matrix items unless overridden.
- **matrix**: Array of individual execution items.

### Per-Item Overrides

Each matrix item can override any default setting:
- `baseBranch`: Git branch to base the session on
- `scriptCommand`: Test command to run after iteration
- `model`: Amp model to use
- `timeoutSec`: Maximum execution time
- `mergeOnPass`: Whether to automatically merge if tests pass

## Commands

### Running Batches

```bash
# Dry run to validate plan
amp-sessions batch plan.yaml --dry-run

# Execute batch
amp-sessions batch plan.yaml

# Execute with JSON output
amp-sessions batch plan.yaml --json

# Abort running batch
amp-sessions abort-run <runId>
```

### Exporting Data

```bash
# Export all data for a batch run
amp-sessions export --run <runId> --out /path/to/output --format json

# Export specific tables as NDJSON
amp-sessions export --run <runId> --out /path/to/output --format ndjson --tables sessions,iterations

# Export CSV (iterations and tool_calls only)
amp-sessions export --run <runId> --out /path/to/output --format csv

# Export by session IDs
amp-sessions export --sessions sess1,sess2,sess3 --out /path/to/output --format json

# Export by date range
amp-sessions export --start-date 2024-01-01 --end-date 2024-01-31 --out /path/to/output
```

### Generating Reports

```bash
# Generate markdown report for batch run
amp-sessions report --run <runId>

# Generate HTML report and save to file
amp-sessions report --run <runId> --format html --out report.html

# Generate report for specific sessions
amp-sessions report --sessions sess1,sess2 --format md --out report.md

# Generate report for date range
amp-sessions report --start-date 2024-01-01 --end-date 2024-01-31
```

## Session Naming

Batch sessions are automatically named using the pattern:
```
batch/<slugified-prompt>/<yyyymmdd-HHMMss>/<item-id-prefix>
```

For example: `batch/implement-auth-feature/20241201-143022/a1b2c3d4`

## Data Model

### Batches Table
- `runId`: Unique identifier for the batch run
- `createdAt`: ISO timestamp of batch creation
- `defaultsJson`: JSON serialization of default settings

### Batch Items Table
- `id`: Unique identifier for the batch item
- `runId`: References the parent batch
- `sessionId`: References the created session (if successful)
- `repo`: Repository path
- `prompt`: Amp prompt
- `status`: Current status (queued/running/success/fail/timeout/error)
- `error`: Error message if failed
- `startedAt`/`finishedAt`: Execution timestamps
- `model`: Amp model used
- `iterSha`: Commit SHA from the iteration
- `tokensTotal`: Total tokens consumed
- `toolCalls`: Number of tool calls made

## Export Formats

### JSON Format
Single file containing all tables as nested objects:
```json
{
  "sessions": [...],
  "iterations": [...],
  "tool_calls": [...],
  "batches": [...],
  "batch_items": [...]
}
```

### NDJSON Format
One file per table, each line is a JSON object:
```
sessions-runId.ndjson
iterations-runId.ndjson
tool_calls-runId.ndjson
...
```

### CSV Format
Available for `iterations` and `tool_calls` tables only:
```
iterations-runId.csv
tool_calls-runId.csv
```

## Report Analysis

Reports include:
- **Summary**: Total sessions, iterations, batches
- **Model Usage**: Token consumption by model
- **Token Analysis**: Total and average token usage
- **Tool Usage**: Tool call frequency and success rates
- **Performance**: Slowest tool calls analysis
- **Batch Results**: Success/failure breakdown

## Safety Features

- **No Auto-Push**: Merged sessions are never pushed to remote by default
- **Isolation**: Each session runs in its own Git worktree
- **Abort Support**: Running batches can be safely aborted
- **Timeout Protection**: Long-running iterations are terminated
- **Error Recovery**: Failed items don't affect other items in the batch

## Concurrency Considerations

- Set `concurrency` based on available system resources
- Each session uses CPU for Amp iterations and I/O for Git operations
- Consider API rate limits when setting high concurrency
- Monitor memory usage with large batches

## Integration with Existing Features

Batch execution fully integrates with existing Amp Session Manager features:
- All telemetry collection (tokens, tool calls, timing)
- Git operations (squash, rebase, merge)
- Test script execution and result tracking
- Notification system for completion status
- Authentication and configuration management

## Example Workflows

### Evaluation Across Multiple Repos
```yaml
runId: multi-repo-eval
concurrency: 3
defaults:
  baseBranch: main
  scriptCommand: "npm test"
  model: gpt-4o
  timeoutSec: 600
matrix:
  - repo: /projects/frontend
    prompt: "Add responsive navigation component"
  - repo: /projects/backend
    prompt: "Implement user authentication API"
  - repo: /projects/mobile
    prompt: "Add offline data sync"
```

### Model Comparison
```yaml
runId: model-comparison
concurrency: 2
defaults:
  baseBranch: main
  scriptCommand: "python -m pytest"
  timeoutSec: 300
matrix:
  - repo: /projects/ml-service
    prompt: "Optimize data preprocessing pipeline"
    model: gpt-4o
  - repo: /projects/ml-service
    prompt: "Optimize data preprocessing pipeline"  
    model: gpt-5
```

### Auto-Merge Pipeline
```yaml
runId: auto-deploy
concurrency: 1
defaults:
  baseBranch: main
  scriptCommand: "npm run ci"
  mergeOnPass: true
  timeoutSec: 1200
matrix:
  - repo: /projects/service-a
    prompt: "Update dependencies to latest versions"
  - repo: /projects/service-b
    prompt: "Update dependencies to latest versions"
```

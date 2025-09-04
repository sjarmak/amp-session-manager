# Benchmark Specification v2

This document describes the unified benchmark specification format for the Amp Session Orchestrator.

## Overview

The v2 benchmark spec supports two types of evaluations:
- **QA**: Question/Answer evaluations using Amp's legacy eval system
- **Session**: Complex multi-iteration session-based benchmarks using git worktrees

## Specification Format

```yaml
version: 2
name: "My Benchmark"
description: "Optional description"

defaults:
  base_branch: main
  parallel: 4
  max_iterations: 10
  timeout_sec: 900
  json_logs: true
  merge_on_pass: false

models:
  default:
    name: default
  gpt5:
    name: gpt-5
    amp_args: ["--try-gpt5"]

metrics:
  - success_rate
  - avg_iterations
  - total_runtime_sec

suites:
  - id: my_suite
    description: "Test suite description"
    cases:
      - id: qa_test
        kind: qa
        eval_spec: "evals/my-test.yaml"
      - id: session_test
        kind: session
        repo: /path/to/repo
        prompt: "Do something"
        script_command: "test -f output.txt"
```

## Fields Reference

### Top Level

- `version`: Must be `2`
- `name`: Human-readable benchmark name
- `description`: Optional description
- `defaults`: Default settings for all cases
- `models`: Model configurations to test
- `metrics`: Metrics to track and report
- `suites`: List of test suites

### Defaults

- `base_branch`: Git branch to use as base (default: `main`)
- `parallel`: Number of parallel executions (default: `1`)
- `max_iterations`: Maximum iterations per case (default: `10`)
- `timeout_sec`: Timeout per case in seconds (default: `900`)
- `json_logs`: Enable JSON logging for telemetry (default: `true`)
- `merge_on_pass`: Whether to merge on success (default: `false`)

### Model Configuration

Each model has:
- `name`: Model identifier
- `amp_args`: Additional arguments for amp CLI (optional)
- `amp_cli_path`: Override amp CLI path (optional)

### Cases

Each case must specify:
- `id`: Unique identifier
- `kind`: Either `qa`, `session`, or `swebench`

#### QA Cases

For `kind: qa`:
- `eval_spec`: Path to legacy Amp eval YAML file
- `timeout_sec`: Override timeout (optional)

#### Session Cases

For `kind: session`:
- `repo`: Path to repository (local path or URL)
- `prompt`: Initial prompt for Amp
- `script_command`: Test command to validate success
- `setup_script`: Optional setup script to run before session
- `follow_up_prompts`: List of follow-up prompts (optional)

#### SWE-bench Cases

For `kind: swebench`:
- Uses `swebench_cases_dir` at suite level to load cases

## Legacy Eval Spec Format

QA cases reference legacy eval specs in this format:

```yaml
repo: my-repo
rev: main
cwd: optional/working/dir
questions:
  - input: "Question text"
    expectedOutput: "Expected answer"
  - input: "Multi-answer question"  
    expectedOutput: ["Answer 1", "Answer 2"]
```

## Metrics

Built-in metrics include:
- `success_rate`: Percentage of passed cases
- `avg_iterations`: Average iterations for session cases
- `total_runtime_sec`: Total execution time
- `avg_latency_ms`: Average latency for QA cases
- `total_tokens`: Total token usage
- `pass_rate`: Pass rate for QA cases
- `total_cost`: Total cost if available

## CLI Usage

Run benchmarks with the `amp-bench` CLI:

```bash
# Run all models
amp-bench run benchmarks/my-benchmark.yaml

# Run specific models
amp-bench run benchmarks/my-benchmark.yaml --models gpt5 alloy

# Parallel execution
amp-bench run benchmarks/my-benchmark.yaml --parallel 8

# Dry run
amp-bench run benchmarks/my-benchmark.yaml --dry-run

# Custom output directory
amp-bench run benchmarks/my-benchmark.yaml --output ./results

# Generate specific report formats
amp-bench run benchmarks/my-benchmark.yaml --formats json markdown html
```

## Report Formats

The system generates reports in multiple formats:

- **JSON**: Machine-readable detailed results
- **CSV**: Tabular data for analysis
- **Markdown**: Human-readable summary
- **HTML**: Interactive web report

## Directory Structure

Recommended project layout:

```
project/
├── benchmarks/          # v2 benchmark specs
├── evals/              # Legacy QA eval specs  
├── benchmark-results/   # Generated reports
└── packages/
    ├── bench-core/     # Core benchmark engine
    └── bench-cli/      # CLI tool
```

## Migration from v1

To migrate existing benchmarks:

1. Change `version: 1` to `version: 2`
2. Add `kind: session` to all existing cases
3. QA tests should use `kind: qa` with `eval_spec` field
4. Update any field names that have changed

## Examples

See `benchmarks/model-benchmark-v2.yaml` for a complete example combining QA and session evaluations.

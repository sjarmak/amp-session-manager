#!/usr/bin/env node

import { Command } from 'commander';
import { listCommand } from './commands/list.js';
import { newCommand } from './commands/new.js';
import { statusCommand } from './commands/status.js';
import { diffCommand } from './commands/diff.js';
import { iterateCommand } from './commands/iterate.js';
import { runCommand } from './commands/run.js';
import { squashCommand } from './commands/squash.js';
import { rebaseCommand } from './commands/rebase.js';
import { configSetCommand, configGetCommand, configListCommand } from './commands/config.js';
import { toolsCommand } from './commands/tools.js';
import { usageCommand } from './commands/usage.js';
import { logsCommand } from './commands/logs.js';
import { verifyAmpCommand } from './commands/verify-amp.js';
import { preflightCommand } from './commands/preflight.js';
import { mergeCommand } from './commands/merge.js';
import { continueMergeCommand } from './commands/continue-merge.js';
import { abortMergeCommand } from './commands/abort-merge.js';
import { cleanupCommand } from './commands/cleanup.js';
import { batchCommand, abortRunCommand } from './commands/batch.js';
import { exportCommand, exportSessionCommand } from './commands/export.js';
import { reportCommand } from './commands/report.js';
import { lockCommand } from './commands/lock.js';
import { repairCommand } from './commands/repair.js';
import { cleanupDanglingCommand } from './commands/cleanup-dangling.js';
import { cleanEnvironmentCommand } from './commands/clean-environment.js';
import { createMetricsCommand } from './commands/metrics.js';
import { addRepoInfoCommand } from './commands/repo-info.js';
import { benchCommand } from './commands/bench.js';
import { threads } from './commands/threads.js';
import { sweBenchCommand } from './commands/swebench.js';

import { benchmarkCommand } from './commands/benchmark.js';

const program = new Command();

program
  .name('amp-sessions')
  .description('Amp Session Orchestrator CLI')
  .version('0.1.0')
  .option('--amp-path <path>', 'Path to Amp CLI binary (defaults to "amp" from PATH)')
  .option('--amp-server <url>', 'URL to local Amp development server (e.g., http://localhost:7002)');

program
  .command('list')
  .description('List all sessions')
  .action(listCommand);

program
  .command('new')
  .description('Create a new session')
  .requiredOption('--repo <path>', 'Repository root path')
  .option('--base <branch>', 'Base branch', 'main')
  .requiredOption('--name <name>', 'Session name')
  .requiredOption('--prompt <prompt>', 'Initial Amp prompt')
  .option('--script <command>', 'Test script command')
  .option('--model <model>', 'Override Amp model')
  .option('--gpt5', 'Use GPT-5 model (equivalent to --model gpt-5)')
  .option('--blend <mode>', 'Use blended model mode (e.g., --blend alloy-random sets amp.internal.alloy.enable=true)')
  .option('--run', 'Automatically run first iteration after creating session')
  .action((options) => newCommand(options, program));

program
  .command('status <sessionId>')
  .description('Show session status and details')
  .action(statusCommand);

program
  .command('diff <sessionId>')
  .description('Show session diff')
  .option('--staged', 'Show only staged changes')
  .option('--name-only', 'Show only changed file names')
  .action(diffCommand);

program
  .command('iterate <sessionId>')
  .description('Run an iteration on a session')
  .option('--notes <notes>', 'Notes for this iteration')
  .option('--metrics-file <path>', 'Export detailed metrics to JSONL file')
  .action((sessionId, options) => iterateCommand(sessionId, options, program));

program
  .command('run <sessionId>')
  .description('Run the session script command')
  .action(runCommand);

program
  .command('squash <sessionId>')
  .description('Squash session commits')
  .option('--message <message>', 'Squash commit message')
  .action(squashCommand);

program
  .command('rebase <sessionId>')
  .description('Rebase session onto target branch')
  .option('--onto <branch>', 'Target branch to rebase onto')
  .action(rebaseCommand);

// Config commands
const configCmd = program
  .command('config')
  .description('Configure amp-sessions settings');

configCmd
  .command('set <key> <value>')
  .description('Set configuration value')
  .action(configSetCommand);

configCmd
  .command('get [key]')
  .description('Get configuration value(s)')
  .action(configGetCommand);

configCmd
  .command('list')
  .description('List all configuration values')
  .action(configListCommand);

// Telemetry commands
program
  .command('tools <sessionId>')
  .description('Show tool call history for session')
  .option('--last', 'Show tools from last iteration only')
  .option('--since <sha>', 'Show tools since specific commit')
  .option('--limit <n>', 'Limit number of results', parseInt)
  .option('--json', 'Output as JSON')
  .action(toolsCommand);

program
  .command('usage <sessionId>')
  .description('Show token usage statistics for session')
  .option('--last', 'Show usage from last iteration only')
  .option('--range <n>', 'Show usage from last N iterations', parseInt)
  .option('--json', 'Output as JSON')
  .action(usageCommand);

program
  .command('logs <sessionId>')
  .description('Show amp logs for session')
  .option('--follow', 'Follow logs in real-time')
  .option('--lines <n>', 'Show last N lines', parseInt)
  .action(logsCommand);

program
  .command('verify-amp')
  .description('Verify Amp setup and authentication')
  .action(verifyAmpCommand);

// Merge flow commands
program
  .command('preflight <sessionId>')
  .description('Run preflight checks before merge')
  .option('--json', 'Output as JSON')
  .action(preflightCommand);

program
  .command('merge <sessionId>')
  .description('Merge session to main (squash + rebase + merge)')
  .option('--message <message>', 'Squash commit message (required if not skipping squash)')
  .option('--skip-squash', 'Skip squashing and rebase, merge commits as-is')
  .option('--include-manual <mode>', 'Include manual commits: include|exclude', 'include')
  .option('--onto <branch>', 'Target branch to merge onto')
  .option('--no-ff', 'Use --no-ff merge instead of --ff-only')
  .option('--push', 'Push to remote after merge')
  .option('--remote <remote>', 'Remote to push to', 'origin')
  .option('--export-patch <file>', 'Export patch file before merge')
  .option('--pr', 'Create pull request using gh CLI')
  .option('--json', 'Output as JSON')
  .action(mergeCommand);

program
  .command('continue-merge <sessionId>')
  .description('Continue merge after resolving conflicts')
  .option('--json', 'Output as JSON')
  .action(continueMergeCommand);

program
  .command('abort-merge <sessionId>')
  .description('Abort merge and return to previous state')
  .option('--json', 'Output as JSON')
  .action(abortMergeCommand);

program
  .command('cleanup <sessionId>')
  .description('Safely remove session worktree and branch')
  .option('--yes', 'Skip confirmation prompt')
  .option('--json', 'Output as JSON')
  .action(cleanupCommand);

// Batch commands
program
  .command('batch <plan>')
  .description('Execute batch sessions from YAML plan')
  .option('--dry-run', 'Show what would be done without executing')
  .option('--json', 'Output as JSON')
  .action(batchCommand);

program
  .command('abort-run <runId>')
  .description('Abort a running batch execution')
  .option('--json', 'Output as JSON')
  .action(abortRunCommand);

// Export commands
program
  .command('export')
  .description('Export batch/multi-session data in various formats')
  .requiredOption('--out <path>', 'Output directory or file path')
  .option('--run <runId>', 'Export data for specific batch run')
  .option('--sessions <sessionIds>', 'Export data for specific sessions (comma-separated)')
  .option('--start-date <date>', 'Start date filter (ISO format)')
  .option('--end-date <date>', 'End date filter (ISO format)')
  .option('--tables <tables>', 'Tables to export (comma-separated)', 'sessions,iterations,tool_calls,merge_history,batches,batch_items')
  .option('--format <format>', 'Export format: json|ndjson|csv', 'json')
  .action(exportCommand);

program
  .command('export-session <sessionId>')
  .description('Export comprehensive single session data with conversation history')
  .requiredOption('--out <path>', 'Output directory')
  .option('--format <format>', 'Export format: json|markdown', 'markdown')
  .option('--no-conversation', 'Exclude conversation history from export')
  .action(exportSessionCommand);

// Report command
program
  .command('report')
  .description('Generate reports across sessions')
  .option('--run <runId>', 'Generate report for specific batch run')
  .option('--sessions <sessionIds>', 'Generate report for specific sessions (comma-separated)')
  .option('--start-date <date>', 'Start date filter (ISO format)')
  .option('--end-date <date>', 'End date filter (ISO format)')
  .option('--out <file>', 'Save report to file')
  .option('--format <format>', 'Report format: md|html', 'md')
  .action(reportCommand);

// Lock command
program
  .command('lock <sessionId>')
  .description('Manage advisory locks for sessions')
  .option('--command <command>', 'Run command while holding lock')
  .option('--unlock', 'Release lock for session')
  .option('--status', 'Check lock status for session')
  .option('--cleanup', 'Clean up all stale locks')
  .option('--json', 'Output as JSON')
  .action(lockCommand);

// Recovery commands
program
  .command('repair')
  .description('Fix hanging sessions (status stuck as "running")')
  .option('--yes', 'Skip confirmation prompt')
  .option('--json', 'Output as JSON')
  .action(repairCommand);

program
  .command('cleanup-dangling')
  .description('Clean up orphaned worktrees and branches')
  .option('--yes', 'Skip confirmation prompt')
  .option('--json', 'Output as JSON')
  .action(cleanupDanglingCommand);

program
  .command('clean-environment')
  .alias('clean-env')
  .description('Comprehensive cleanup of orphaned worktrees and sessions (recommended)')
  .option('--yes', 'Skip confirmation prompt')
  .option('--json', 'Output as JSON')
  .action(cleanEnvironmentCommand);

// Add metrics command
program.addCommand(createMetricsCommand());

// Add threads command
program.addCommand(threads);

// Add repo-info command
addRepoInfoCommand(program);

// Add SWE-bench command
program.addCommand(sweBenchCommand);

// Benchmark commands
program
  .command('bench <suite>')
  .description('Execute benchmark suite')
  .option('--dry-run', 'Show what would be executed without running')
  .option('--timeout <seconds>', 'Timeout per case in seconds', parseInt)
  .option('--output-dir <path>', 'Output directory for results')
  .option('--concurrent <n>', 'Number of concurrent executions', parseInt, 1)
  .option('--json', 'Output results as JSON')
  .action(benchCommand);

program
  .command('benchmark <config>')
  .description('Run model performance benchmarks from YAML config')
  .option('--output <file>', 'Output file for results')
  .option('--format <format>', 'Output format (json|markdown)', 'json')
  .option('--models <models>', 'Comma-separated list of models to test')
  .option('--suites <suites>', 'Comma-separated list of suites to run')
  .option('--amp <path>', 'Amp CLI path ("production" or absolute path)')
  .option('--amp-server <url>', 'Amp development server URL (e.g., http://localhost:7002)')
  .action((config, options) => benchmarkCommand({ config, ...options }, program));



program.parse();

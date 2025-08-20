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

const program = new Command();

program
  .name('amp-sessions')
  .description('Amp Session Manager CLI')
  .version('0.1.0');

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
  .action(newCommand);

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
  .action(iterateCommand);

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
  .requiredOption('--message <message>', 'Squash commit message')
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

program.parse();

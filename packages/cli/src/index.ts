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

program.parse();

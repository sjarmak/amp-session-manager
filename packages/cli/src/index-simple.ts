#!/usr/bin/env node

import { Command } from 'commander';

const program = new Command();

program
  .name('amp-sessions')
  .description('Amp Session Manager CLI')
  .version('0.1.0');

program
  .command('list')
  .description('List all sessions')
  .action(() => {
    console.log('No sessions found.');
    console.log('(Full database integration pending - scaffolding complete!)');
  });

program
  .command('new')
  .description('Create a new session')
  .requiredOption('--repo <path>', 'Repository root path')
  .option('--base <branch>', 'Base branch', 'main')
  .requiredOption('--name <name>', 'Session name')
  .requiredOption('--prompt <prompt>', 'Initial Amp prompt')
  .option('--script <command>', 'Test script command')
  .option('--model <model>', 'Override Amp model')
  .action(() => {
    console.log('Session creation not yet implemented');
  });

program
  .command('iterate <sessionId>')
  .description('Run an iteration on a session')
  .action((sessionId) => {
    console.log(`Iteration for session ${sessionId} not yet implemented`);
  });

program
  .command('squash <sessionId>')
  .description('Squash session commits')
  .option('--message <message>', 'Squash commit message')
  .action((sessionId) => {
    console.log(`Squash for session ${sessionId} not yet implemented`);
  });

program.parse();

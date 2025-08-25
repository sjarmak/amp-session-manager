#!/usr/bin/env node

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const migrationScript = path.join(__dirname, '../packages/core/src/migrations/run-migration.ts');
const args = process.argv.slice(2);

const child = spawn('npx', ['tsx', migrationScript, ...args], {
  stdio: 'inherit',
  cwd: path.join(__dirname, '..')
});

child.on('close', (code) => {
  process.exit(code);
});

child.on('error', (error) => {
  console.error('Failed to run migration:', error);
  process.exit(1);
});

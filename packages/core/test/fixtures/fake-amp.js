#!/usr/bin/env node

// Fake Amp CLI fixture for testing
// This simulates the behavior of the real Amp CLI for testing purposes

const { readFileSync, writeFileSync } = require('fs');
const path = require('path');

function log(event) {
  console.log(JSON.stringify(event));
}

function main() {
  const args = process.argv.slice(2);
  const isOracle = args.includes('--oracle');
  const isJSONL = args.includes('--jsonl-logs');
  const tryGPT5 = args.includes('--try-gpt5');
  const modelArg = args.findIndex(arg => arg === '--model');
  const model = modelArg !== -1 && args[modelArg + 1] ? args[modelArg + 1] : (tryGPT5 ? 'gpt-5' : 'gpt-4o');
  
  // Read prompt from stdin
  let stdinData = '';
  process.stdin.on('data', (data) => {
    stdinData += data;
  });
  
  process.stdin.on('end', () => {
    runFakeAmp();
  });
  
  // Start reading stdin
  process.stdin.resume();
  
  function runFakeAmp() {

  // Simulate processing delay
  setTimeout(() => {
    if (isJSONL) {
      // Output JSONL telemetry events
      log({ 
        timestamp: new Date().toISOString(),
        event: 'tool_start',
        tool: 'Read',
        args: { path: '/test/file.ts' }
      });
      
      log({
        timestamp: new Date().toISOString(),
        event: 'tool_finish', 
        tool: 'Read',
        success: true,
        duration: 150
      });

      log({
        timestamp: new Date().toISOString(),
        event: 'tool_start',
        tool: 'edit_file',
        args: { path: '/test/file.ts', old_str: 'old code', new_str: 'new code' }
      });

      log({
        timestamp: new Date().toISOString(),
        event: 'tool_finish',
        tool: 'edit_file', 
        success: true,
        duration: 300
      });

      log({
        timestamp: new Date().toISOString(),
        prompt: 1500,
        completion: 800, 
        total: 2300,
        model: model
      });
    } else {
      // Output text-based logs
      console.log('[2025-01-20T12:00:00.000Z] Using Read tool with args: {"path":"/test/file.ts"}');
      console.log('[2025-01-20T12:00:00.150Z] Read tool completed successfully in 150ms');
      console.log('[2025-01-20T12:00:01.000Z] Using edit_file tool with args: {"path":"/test/file.ts"}');
      console.log('[2025-01-20T12:00:01.300Z] edit_file tool completed successfully in 300ms');
      console.log(`Token usage - prompt: 1500, completion: 800, total: 2300`);
      console.log(`Model: ${model}`);
    }

    if (isOracle) {
      console.log('\n--- Oracle Analysis ---');
      console.log('Based on the code analysis, I recommend the following improvements:');
      console.log('1. Add proper error handling');
      console.log('2. Improve type definitions');
      console.log('3. Consider extracting reusable utilities');
    }

    // Create some fake file changes to demonstrate the workflow
    try {
      const demoFile = path.join(process.cwd(), 'demo-changes.txt');
      writeFileSync(demoFile, `Fake change generated at ${new Date().toISOString()}\n`);
    } catch (error) {
      // Ignore write errors
    }

    process.exit(0);
  }, 500);
  }
}

main();

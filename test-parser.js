import { EnhancedDebugParser } from './packages/core/dist/index.js';

// Test the plain-text parsing
const textOutput = `This is a simple Node.js project with a greeting function. Created [README.md](file:///Users/sjarmak/test-project/.worktrees/980ab6bb-f0d6-4b0e-ad23-507816f902f4/README.md) with installation and usage instructions.`;

console.log('Testing plain-text parsing with output:');
console.log(textOutput);
console.log();

// Test the text output parsing directly
const telemetry = EnhancedDebugParser.parseTextOutput(textOutput, 0);
console.log('Result:', telemetry);

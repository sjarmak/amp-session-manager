#!/usr/bin/env node

const { AmpAdapter } = require('./packages/core/dist/index.cjs');

async function testAuth() {
  console.log('Testing authentication fix...');
  console.log('Current environment AMP_API_KEY:', process.env.AMP_API_KEY ? 'exists' : 'missing');
  
  const ampAdapter = new AmpAdapter();
  
  // Test authentication
  console.log('Running auth validation...');
  const authResult = await ampAdapter.validateAuth();
  console.log('Auth result:', authResult);
  
  // Try running iteration regardless of auth result to see actual behavior
  console.log('Running test iteration with simple echo...');
  try {
    const result = await ampAdapter.runIteration(
      'echo "hello world"',
      process.cwd()
    );
    
    console.log('Iteration result:', {
      success: result.success,
      telemetryToolCalls: result.telemetry.toolCalls?.length || 0,
      awaitingInput: result.awaitingInput,
      outputLength: result.output.length
    });
    
    console.log('Tool calls found:', result.telemetry.toolCalls);
    
    if (result.success) {
      console.log('✅ Authentication working! Now testing web search...');
      const webResult = await ampAdapter.runIteration(
        'search the web for "TypeScript best practices" and give me 3 key points',
        process.cwd()
      );
      
      console.log('Web search result:', {
        success: webResult.success,
        telemetryToolCalls: webResult.telemetry.toolCalls?.length || 0,
        awaitingInput: webResult.awaitingInput,
        outputLength: webResult.output.length
      });
      
      console.log('Web search tool calls found:', webResult.telemetry.toolCalls);
    }
    
  } catch (error) {
    console.error('Error running iteration:', error);
  }
}

testAuth().catch(console.error);

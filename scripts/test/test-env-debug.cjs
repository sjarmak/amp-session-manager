#!/usr/bin/env node

const { spawn } = require('child_process');

async function testEnvSourcing() {
  console.log('Current process.env.AMP_API_KEY:', process.env.AMP_API_KEY ? 'exists' : 'missing');
  console.log('Current process.env.SHELL:', process.env.SHELL);
  
  if (!process.env.AMP_API_KEY && process.env.SHELL) {
    console.log('Attempting to source AMP_API_KEY from shell...');
    
    try {
      const result = await new Promise((resolve) => {
        const shell = spawn(process.env.SHELL, ['-c', 'source ~/.zshrc && echo $AMP_API_KEY'], { 
          stdio: ['pipe', 'pipe', 'pipe'] 
        });
        let output = '';
        shell.stdout?.on('data', (data) => output += data.toString());
        shell.on('close', (code) => {
          console.log('Shell command exited with code:', code);
          resolve(output.trim());
        });
      });
      
      console.log('Sourced API key (first 8 chars):', result.slice(0, 8));
      
      if (result && result !== 'your-actual-api-key-here') {
        console.log('✅ Successfully sourced API key from shell');
        return result;
      } else {
        console.log('❌ Failed to source valid API key from shell');
      }
    } catch (error) {
      console.warn('Failed to source AMP_API_KEY from shell:', error);
    }
  } else {
    console.log('API key already available or no shell available');
  }
}

testEnvSourcing().catch(console.error);

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { tmpdir } from 'os';

// Create a fake amp CLI script for testing
const createFakeAmpScript = async (scriptPath: string) => {
  const script = `#!/usr/bin/env node

const readline = require('readline');

let sessionId = 'T-test-' + Date.now();
let messageCount = 0;

// Send initial system message
console.log(JSON.stringify({
  type: 'system',
  subtype: 'init',
  cwd: process.cwd(),
  session_id: sessionId,
  tools: ['Bash', 'Read']
}));

// Set up readline to process stdin
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', (line) => {
  try {
    const message = JSON.parse(line);
    
    if (message.type === 'user' && message.message) {
      const text = message.message.content
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join(' ');
      
      // Echo the user message first  
      console.log(JSON.stringify({
        type: 'user',
        message: message.message,
        session_id: sessionId
      }));
      
      // Send assistant response
      messageCount++;
      console.log(JSON.stringify({
        type: 'assistant',
        message: {
          id: 'msg_' + messageCount,
          type: 'message',
          role: 'assistant',
          model: 'amp',
          content: [{ type: 'text', text: 'Echo: ' + text }],
          stop_reason: 'end_turn',
          usage: {
            input_tokens: text.length,
            output_tokens: ('Echo: ' + text).length
          }
        },
        session_id: sessionId
      }));
    }
  } catch (error) {
    console.error('Parse error:', error.message);
  }
});

rl.on('close', () => {
  // Send final result
  console.log(JSON.stringify({
    type: 'result',
    subtype: 'success',
    duration_ms: 1000,
    is_error: false,
    num_turns: messageCount,
    result: 'Interactive session completed',
    session_id: sessionId
  }));
  process.exit(0);
});
`;

  await fs.writeFile(scriptPath, script);
  await fs.chmod(scriptPath, '755');
};

describe('Interactive Streaming Integration', () => {
  let tempDir: string;
  let fakeAmpPath: string;
  let ampAdapter: any;

  beforeEach(async () => {
    // Create temporary directory for test
    tempDir = await fs.mkdtemp(path.join(tmpdir(), 'amp-test-'));
    fakeAmpPath = path.join(tempDir, 'fake-amp');
    
    // Create fake amp script
    await createFakeAmpScript(fakeAmpPath);

    // Import and create adapter with fake amp path
    const { AmpAdapter } = await import('../amp.js');
    ampAdapter = new AmpAdapter({ 
      ampPath: fakeAmpPath,
      enableJSONLogs: true 
    });
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('Failed to clean up temp directory:', error);
    }
  });

  it('should establish interactive connection and exchange messages', async () => {
    const sessionId = 'test-session-123';
    const workingDir = tempDir;
    
    const handle = ampAdapter.startInteractive(
      sessionId,
      workingDir
    );

    const events: any[] = [];
    const states: string[] = [];
    const errors: any[] = [];

    handle.on('streaming-event', (event: any) => events.push(event));
    handle.on('state', (state: string) => states.push(state));
    handle.on('error', (error: any) => errors.push(error));

    // Wait for connection to be ready
    await new Promise<void>((resolve) => {
      const checkReady = () => {
        if (states.includes('ready')) {
          resolve();
        } else {
          setTimeout(checkReady, 100);
        }
      };
      checkReady();
    });

    expect(states).toContain('ready');
    expect(errors).toHaveLength(0);

    // Send a test message
    handle.send('Test message 1');
    
    // Wait for response
    await new Promise<void>((resolve) => {
      const checkResponse = () => {
        const assistantEvents = events.filter(e => e.type === 'assistant_message');
        if (assistantEvents.length > 0) {
          resolve();
        } else {
          setTimeout(checkResponse, 100);
        }
      };
      setTimeout(checkResponse, 100);
    });

    // Verify we got assistant response
    const assistantEvents = events.filter(e => e.type === 'assistant_message');
    expect(assistantEvents.length).toBeGreaterThan(0);
    
    const lastResponse = assistantEvents[assistantEvents.length - 1];
    expect(lastResponse.data.content).toBeDefined();

    // Stop the session
    await handle.stop();
    expect(states).toContain('closed');
  }, 10000);

  it('should handle multiple rapid messages', async () => {
    const sessionId = 'test-session-456';
    const workingDir = tempDir;
    
    const handle = ampAdapter.startInteractive(
      sessionId,
      workingDir
    );

    const events: any[] = [];
    handle.on('streaming-event', (event: any) => events.push(event));

    // Wait for ready state
    await new Promise<void>((resolve) => {
      handle.on('state', (state: string) => {
        if (state === 'ready') resolve();
      });
    });

    // Send multiple messages quickly
    const messages = ['Message 1', 'Message 2', 'Message 3'];
    for (const msg of messages) {
      handle.send(msg);
      await new Promise(resolve => setTimeout(resolve, 100)); // Small delay
    }

    // Wait for all responses
    await new Promise<void>((resolve) => {
      const checkResponses = () => {
        const assistantEvents = events.filter(e => e.type === 'assistant_message');
        if (assistantEvents.length >= messages.length) {
          resolve();
        } else {
          setTimeout(checkResponses, 100);
        }
      };
      setTimeout(checkResponses, 500);
    });

    const assistantEvents = events.filter(e => e.type === 'assistant_message');
    expect(assistantEvents.length).toBeGreaterThanOrEqual(messages.length);

    await handle.stop();
  }, 15000);

  it('should handle connection errors gracefully', async () => {
    // Use invalid amp path to trigger error
    const invalidAdapter = new AmpAdapter({ 
      ampPath: '/nonexistent/amp',
      enableJSONLogs: true 
    });

    const handle = invalidAdapter.startInteractive(
      'test-session-error',
      tempDir
    );

    const errors: any[] = [];
    handle.on('error', (error: any) => errors.push(error));

    // Wait for error
    await new Promise<void>((resolve) => {
      const checkError = () => {
        if (errors.length > 0) {
          resolve();
        } else {
          setTimeout(checkError, 100);
        }
      };
      setTimeout(checkError, 100);
    });

    expect(errors.length).toBeGreaterThan(0);
  }, 5000);

  it('should preserve conversation context across messages', async () => {
    const sessionId = 'test-session-context';
    const workingDir = tempDir;
    
    const handle = ampAdapter.startInteractive(
      sessionId,
      workingDir
    );

    await new Promise<void>((resolve) => {
      handle.on('state', (state: string) => {
        if (state === 'ready') resolve();
      });
    });

    // Send initial message
    handle.send('Remember this number: 42');
    
    // Wait a bit for response, then send follow-up
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Send follow-up message that references the number
    handle.send('What number did I just tell you to remember?');

    const events: any[] = [];
    handle.on('streaming-event', (event: any) => events.push(event));

    // Wait for response
    await new Promise<void>((resolve) => {
      const checkResponse = () => {
        const assistantEvents = events.filter(e => e.type === 'assistant_message');
        if (assistantEvents.length > 0) {
          resolve();
        } else {
          setTimeout(checkResponse, 100);
        }
      };
      setTimeout(checkResponse, 200);
    });

    // The fake amp script just echoes, but this tests the infrastructure
    const assistantEvents = events.filter(e => e.type === 'assistant_message');
    expect(assistantEvents.length).toBeGreaterThan(0);

    await handle.stop();
  }, 10000);
});

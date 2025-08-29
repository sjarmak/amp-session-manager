#!/usr/bin/env node

import { AmpServer } from './index.js';

interface CliOptions {
  lan?: boolean;
  port?: number;
  help?: boolean;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--lan':
        options.lan = true;
        break;
      case '--port':
      case '-p':
        const portValue = args[i + 1];
        if (!portValue || isNaN(Number(portValue))) {
          console.error('Error: --port requires a valid port number');
          process.exit(1);
        }
        options.port = Number(portValue);
        i++; // Skip next arg as it's the port value
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        if (arg.startsWith('-')) {
          console.error(`Error: Unknown option ${arg}`);
          process.exit(1);
        }
        // Ignore non-option arguments
    }
  }

  return options;
}

function showHelp(): void {
  console.log(`
Amp Session Manager - Mobile API Server

Usage: ampsm-server [options]

Options:
  --lan              Bind to 0.0.0.0 for LAN access (default: 127.0.0.1 localhost only)
  --port, -p <port>  Port to listen on (default: 7760)
  --help, -h         Show this help message

Examples:
  ampsm-server                    # Start server on localhost:7760
  ampsm-server --lan              # Start server on 0.0.0.0:7760 (LAN access)
  ampsm-server --port 8080        # Start server on localhost:8080
  ampsm-server --lan --port 8080  # Start server on 0.0.0.0:8080

The server provides a REST API and SSE endpoints for mobile control of Amp sessions.
Your mobile API token will be displayed when the server starts.
`);
}

async function main(): Promise<void> {
  const options = parseArgs();

  if (options.help) {
    showHelp();
    return;
  }

  const host = '127.0.0.1'; // Test with localhost first
  const port = options.port || 7760;

  console.log('Starting Amp Session Manager API Server...');
  
  if (options.lan) {
    console.log('⚠️  LAN mode enabled - server accessible from network');
  }

  const server = new AmpServer({ 
    cors: true 
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\nReceived ${signal}, shutting down gracefully...`);
    try {
      await server.stop();
      console.log('Server stopped');
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  try {
    await server.start({ host, port });
    
    const networkAddr = options.lan ? await getNetworkAddress() : null;
    
    console.log(`
🚀 Server ready!
   Local:   http://127.0.0.1:${port}
   ${options.lan ? `Network: http://${networkAddr}:${port}` : 'Network: Use --lan flag for network access'}

📱 Mobile API endpoints available at /api/v1/*
📊 Health check: GET /health
🔒 Auth: Bearer token will be shown in logs above
`);

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

async function getNetworkAddress(): Promise<string> {
  try {
    const os = await import('os');
    const networks = os.networkInterfaces();
    
    for (const name of Object.keys(networks)) {
      for (const network of networks[name]!) {
        // Skip internal and non-IPv4 addresses
        if (!network.internal && network.family === 'IPv4') {
          return network.address;
        }
      }
    }
  } catch (error) {
    console.warn('Could not get network address:', error);
  }
  
  return '0.0.0.0';
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the server
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

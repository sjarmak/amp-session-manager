#!/usr/bin/env node

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { randomBytes } from 'crypto';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

const DEFAULT_PORT = 7760;

// Create a basic server without core dependencies for now
async function createSimpleServer(options: { lan?: boolean } = {}) {
  const app = Fastify({ logger: true });

  // CORS setup
  await app.register(cors, {
    origin: true,
    credentials: false
  });

  // Auth middleware
  const tokenPath = join(homedir(), '.config', 'amp-session-manager', 'mobile_api_token');
  let apiToken: string;

  try {
    // Ensure config directory exists
    const configDir = dirname(tokenPath);
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }

    // Read or create API token
    if (existsSync(tokenPath)) {
      apiToken = readFileSync(tokenPath, 'utf8').trim();
    } else {
      apiToken = randomBytes(32).toString('hex');
      writeFileSync(tokenPath, apiToken);
      console.log(`📝 Created new API token: ${tokenPath}`);
    }
  } catch (error) {
    console.error('Error setting up API token:', error);
    process.exit(1);
  }

  // Auth hook
  app.addHook('preHandler', async (request, reply) => {
    if (request.url === '/health' || request.url === '/' || request.url === '/login' || request.url === '/app') {
      return; // Skip auth for health check, login, and app pages
    }

    const auth = request.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Missing or invalid authorization header' });
    }

    const token = auth.substring(7);
    if (token !== apiToken) {
      return reply.code(401).send({ error: 'Invalid API token' });
    }
  });

  // Basic health check
  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Simple token input page
  app.get('/', async (request, reply) => {
    reply.type('text/html');
    return `<!DOCTYPE html>
<html>
<head>
  <title>Amp Session Manager - Mobile Access</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: system-ui; padding: 20px; max-width: 400px; margin: 0 auto; }
    input, button { width: 100%; padding: 12px; margin: 8px 0; font-size: 16px; }
    .token { font-family: monospace; background: #f5f5f5; padding: 8px; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>🔒 Mobile Access</h1>
  <p>Enter your API token to access the mobile control interface:</p>
  
  <input type="text" id="token" placeholder="Paste API token here..." />
  <button onclick="setToken()">Connect</button>
  
  <div id="status"></div>
  
  <h3>Your API Token:</h3>
  <div class="token">${apiToken}</div>
  
  <script>
    function setToken() {
      const token = document.getElementById('token').value;
      if (!token) return alert('Please enter a token');
      
      localStorage.setItem('apiToken', token);
      fetch('/api/v1/sessions', {
        headers: { 'Authorization': 'Bearer ' + token }
      }).then(r => r.json()).then(data => {
        if (data.error) {
          document.getElementById('status').innerHTML = '<p style="color:red">Invalid token</p>';
        } else {
          document.getElementById('status').innerHTML = '<p style="color:green">✅ Connected!</p>';
          setTimeout(() => {
            window.location.href = '/app';
          }, 1000);
        }
      }).catch(e => {
        document.getElementById('status').innerHTML = '<p style="color:red">Connection failed</p>';
      });
    }
  </script>
</body>
</html>`;
  });

  // Placeholder API endpoints - to be implemented with proper core integration later
  app.get('/api/v1/sessions', async () => {
    return { sessions: [] };
  });

  app.get('/api/v1/repos', async () => {
    return { repos: [] };
  });

  app.get('/api/v1/threads', async () => {
    return { threads: [] };
  });

  // Simple mobile app interface
  app.get('/app', async (request, reply) => {
    reply.type('text/html');
    return `<!DOCTYPE html>
<html>
<head>
  <title>Amp Sessions - Mobile</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { 
      font-family: system-ui; 
      margin: 0; 
      background: #f8f9fa; 
    }
    .header { 
      background: #2563eb; 
      color: white; 
      padding: 16px; 
      text-align: center; 
    }
    .container { 
      padding: 16px; 
    }
    .card { 
      background: white; 
      border-radius: 8px; 
      padding: 16px; 
      margin: 8px 0; 
      box-shadow: 0 2px 4px rgba(0,0,0,0.1); 
    }
    .btn { 
      background: #2563eb; 
      color: white; 
      border: none; 
      padding: 12px 16px; 
      border-radius: 6px; 
      font-size: 16px; 
      width: 100%; 
      margin: 8px 0; 
    }
    .status { 
      display: inline-block; 
      padding: 4px 8px; 
      border-radius: 12px; 
      font-size: 12px; 
      background: #e5e7eb; 
      color: #374151; 
    }
    .status.active { background: #10b981; color: white; }
    .status.idle { background: #6b7280; color: white; }
  </style>
</head>
<body>
  <div class="header">
    <h1>📱 Amp Sessions</h1>
  </div>
  
  <div class="container">
    <div class="card">
      <h3>🚀 Quick Start</h3>
      <button class="btn" onclick="createSession()">New Session</button>
      <button class="btn" onclick="loadSessions()">Refresh Sessions</button>
    </div>
    
    <div class="card">
      <h3>📋 Sessions</h3>
      <div id="sessions">
        <p>Tap "Refresh Sessions" to load your current sessions</p>
      </div>
    </div>
    
    <div class="card" id="newSession" style="display:none;">
      <h3>📝 New Session</h3>
      <input type="text" id="sessionName" placeholder="Session name..." style="width:100%; padding:8px; margin:4px 0; border:1px solid #ccc; border-radius:4px;">
      <textarea id="prompt" placeholder="Enter your initial prompt..." style="width:100%; height:80px; padding:8px; margin:4px 0; border:1px solid #ccc; border-radius:4px; resize:vertical;"></textarea>
      <button class="btn" onclick="submitSession()">Create & Start</button>
      <button class="btn" onclick="cancelSession()" style="background:#6b7280;">Cancel</button>
    </div>
  </div>

  <script>
    const apiToken = localStorage.getItem('apiToken');
    const apiHeaders = { 'Authorization': 'Bearer ' + apiToken };

    function loadSessions() {
      fetch('/api/v1/sessions', { headers: apiHeaders })
        .then(r => r.json())
        .then(data => {
          const html = data.sessions.length > 0 
            ? data.sessions.map(s => \`
              <div class="card" style="margin:8px 0;">
                <strong>\${s.name}</strong>
                <span class="status \${s.status}">\${s.status}</span>
                <br><small>\${s.repoPath || 'No repo'}</small>
              </div>
            \`).join('')
            : '<p>No sessions found. Create your first one!</p>';
          
          document.getElementById('sessions').innerHTML = html;
        })
        .catch(e => alert('Error loading sessions'));
    }

    function createSession() {
      document.getElementById('newSession').style.display = 'block';
    }

    function cancelSession() {
      document.getElementById('newSession').style.display = 'none';
    }

    function submitSession() {
      const name = document.getElementById('sessionName').value;
      const prompt = document.getElementById('prompt').value;
      
      if (!name || !prompt) {
        return alert('Please enter both name and prompt');
      }

      fetch('/api/v1/sessions', {
        method: 'POST',
        headers: { ...apiHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, prompt, repoPath: '/path/to/repo' })
      }).then(r => r.json()).then(data => {
        if (data.error) {
          alert('Error: ' + data.error.message);
        } else {
          alert('Session created successfully!');
          cancelSession();
          loadSessions();
        }
      }).catch(e => alert('Error creating session'));
    }

    // Auto-load sessions on page load
    loadSessions();
  </script>
</body>
</html>`;
  });

  console.log(`🔒 API Token: ${apiToken}`);
  console.log(`📁 Token file: ${tokenPath}`);

  return app;
}

async function getNetworkAddress(): Promise<string> {
  try {
    const os = await import('os');
    const networks = os.networkInterfaces();
    
    for (const name of Object.keys(networks)) {
      for (const network of networks[name]!) {
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

async function main() {
  const args = process.argv.slice(2);
  const lan = args.includes('--lan');
  const port = DEFAULT_PORT;

  console.log('Starting Amp Session Manager API Server...');
  
  if (lan) {
    console.log('⚠️  LAN mode enabled - server accessible from network');
  }

  const server = await createSimpleServer({ lan });
  const host = lan ? '0.0.0.0' : '127.0.0.1';

  try {
    await server.listen({ host, port });
    
    const networkAddr = lan ? await getNetworkAddress() : null;
    
    console.log(`
🚀 Server ready!
   Local:   http://127.0.0.1:${port}
   ${lan ? `Network: http://${networkAddr}:${port}` : 'Network: Use --lan flag for network access'}

📱 Mobile API endpoints available at /api/v1/*
📊 Health check: GET /health

To use from your phone:
1. Open the Network URL above on your phone
2. Use the API token shown above when prompted
`);

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

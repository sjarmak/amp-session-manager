import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { fileURLToPath } from 'url';

import { SessionStore, BenchmarkRunner } from '@ampsm/core';
import { AuthService } from './services/auth.js';
import { GitService } from './services/git.js';
import { AmpService } from './services/amp.js';
import { ThreadStoreService } from './services/threadStore.js';
import { 
  CreateSessionSchema, 
  IterateSessionSchema,
  ScanReposSchema,
  CloneRepoSchema,
  MergeSessionSchema,
  AddMessageSchema,
  SearchThreadsSchema,
  GetDiffSchema,
  ErrorResponseSchema,
  SuccessResponseSchema,
  type Config
} from './schemas.js';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

export interface ServerOptions {
  host?: string;
  port?: number;
  cors?: boolean;
}

export class AmpServer {
  private app: FastifyInstance;
  private store: SessionStore;
  private auth: AuthService;
  private git: GitService;
  private amp: AmpService;
  private threads: ThreadStoreService;
  private benchmark: BenchmarkRunner;
  private configs: Config[] = []; // Simple in-memory config store for demo

  constructor(options: ServerOptions = {}) {
    console.log('[DEBUG] Creating Fastify instance...');
    this.app = Fastify({ logger: false });
    
    console.log('[DEBUG] Initializing SessionStore...');
    this.store = new SessionStore();
    
    console.log('[DEBUG] Initializing AuthService...');
    this.auth = new AuthService();
    
    console.log('[DEBUG] Initializing GitService...');
    this.git = new GitService();
    
    console.log('[DEBUG] Initializing AmpService...');
    this.amp = new AmpService(this.store);
    
    console.log('[DEBUG] Initializing BenchmarkRunner...');
    this.benchmark = new BenchmarkRunner(this.store, this.store.dbPath);
    
    console.log('[DEBUG] Initializing ThreadStoreService...');
    this.threads = new ThreadStoreService({} as any);
    
    console.log('[DEBUG] Constructor complete - will setup async');
  }

  async initialize(options: ServerOptions = {}): Promise<void> {
    console.log('[DEBUG] Setting up middleware...');
    await this.setupMiddleware(options);
    
    console.log('[DEBUG] Setting up routes...');
    this.setupRoutes();
    
    console.log('[DEBUG] Setting up SSE...');
    this.setupSSE();
    
    console.log('[DEBUG] Server initialization complete');
  }

  private async setupMiddleware(options: ServerOptions): Promise<void> {
    console.log('[DEBUG] Setting up middleware...');
    
    // Simplified CORS setup
    if (options.cors !== false) {
      console.log('[DEBUG] Registering CORS...');
      await this.app.register(cors, {
        origin: true, // Allow all origins for now
        credentials: true
      });
      console.log('[DEBUG] CORS registered');
    }

    console.log('[DEBUG] Setting up auth middleware...');
    // Simplified auth middleware - skip for now
    this.app.addHook('onRequest', async (request, reply) => {
      // Skip all auth for debugging
      if (request.url.startsWith('/api/')) {
        console.log(`[DEBUG] API Request: ${request.method} ${request.url}`);
      }
    });

    console.log('[DEBUG] Setting up error handler...');
    // Simple error handler
    this.app.setErrorHandler((error, request, reply) => {
      console.error('[ERROR]', error);
      reply.code(500).send({ error: 'Internal Server Error', message: error.message });
    });
    
    console.log('[DEBUG] Middleware setup complete');
  }

  private async setupStatic(): Promise<void> {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    
    await this.app.register(fastifyStatic, {
      root: path.join(__dirname, 'static'),
      prefix: '/static/',
    });

    // Serve benchmark UI
    this.app.get('/benchmarks', async (request, reply) => {
      reply.type('text/html');
      const fs = await import('fs/promises');
      const content = await fs.readFile(path.join(__dirname, 'static', 'benchmark.html'), 'utf-8');
      return content;
    });
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

    // Mobile app route - serve React PWA or fallback HTML
    this.app.get('/app', async (request, reply) => {
      // For now, serve the basic HTML interface until React PWA is fully working
      reply.type('text/html');
      const fs = await import('fs/promises');
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const htmlPath = path.join(__dirname, 'static', 'mobile-app.html');
      
      try {
        const content = await fs.readFile(htmlPath, 'utf-8');
        return content;
      } catch {
        // Fallback basic mobile interface
        return await this.getBasicMobileHTML();
      }
    });

    // API routes
    this.setupRepoRoutes();
    this.setupSessionRoutes();
    this.setupBenchmarkRoutes();
    this.setupThreadRoutes();
    this.setupConfigRoutes();
  }

  private setupRepoRoutes(): void {
    // GET /api/v1/repos - scan local repos
    this.app.get('/api/v1/repos', async (request, reply) => {
      const query = request.query as { roots?: string; maxDepth?: string; includeHidden?: string };
      const roots = query.roots ? JSON.parse(query.roots) : ['/'];
      const maxDepth = query.maxDepth ? parseInt(query.maxDepth) : 2;
      const includeHidden = query.includeHidden === 'true';

      const repos = await this.git.scanLocalRepos(roots, { maxDepth, includeHidden });
      return { success: true, data: repos };
    });

    // POST /api/v1/repos/scan - index repos under roots
    this.app.post('/api/v1/repos/scan', {
      schema: { body: ScanReposSchema }
    }, async (request, reply) => {
      const { roots, maxDepth, includeHidden } = request.body as any;
      const repos = await this.git.scanLocalRepos(roots, { maxDepth, includeHidden });
      return { success: true, data: repos, message: `Scanned ${repos.length} repositories` };
    });

    // POST /api/v1/repos/clone - clone GitHub repos
    this.app.post('/api/v1/repos/clone', {
      schema: { body: CloneRepoSchema }
    }, async (request, reply) => {
      const { url, targetDir, branch } = request.body as any;
      await this.git.cloneRepo(url, targetDir, { branch });
      return { success: true, message: `Successfully cloned ${url} to ${targetDir}` };
    });
  }

  private setupSessionRoutes(): void {
    // GET /api/v1/sessions - list sessions  
    this.app.get('/api/v1/sessions', async (request, reply) => {
      const sessions = await this.amp.listSessions();
      return { success: true, data: sessions };
    });

    // POST /api/v1/sessions - create new session
    this.app.post('/api/v1/sessions', {
      schema: { body: CreateSessionSchema }
    }, async (request, reply) => {
      const session = await this.amp.createSession(request.body as any);
      return { success: true, data: session, message: 'Session created successfully' };
    });

    // GET /api/v1/sessions/:id - session details
    this.app.get('/api/v1/sessions/:id', async (request, reply) => {
      const { id } = request.params as { id: string };
      const session = await this.amp.getSession(id);
      
      if (!session) {
        reply.code(404).send({ error: 'Not Found', message: 'Session not found' });
        return;
      }

      const iterations = await this.amp.getSessionIterations(id);
      return { success: true, data: { ...session, iterations } };
    });

    // POST /api/v1/sessions/:id/iterate - start iteration
    this.app.post('/api/v1/sessions/:id/iterate', {
      schema: { body: IterateSessionSchema }
    }, async (request, reply) => {
      const { id } = request.params as { id: string };
      const options = { sessionId: id, ...request.body as any };
      
      const result = await this.amp.startIteration(options);
      return { success: true, message: result };
    });

    // POST /api/v1/sessions/:id/abort - stop iteration
    this.app.post('/api/v1/sessions/:id/abort', async (request, reply) => {
      const { id } = request.params as { id: string };
      await this.amp.abortIteration(id);
      return { success: true, message: 'Iteration aborted' };
    });

    // POST /api/v1/sessions/:id/merge - merge to base branch
    this.app.post('/api/v1/sessions/:id/merge', {
      schema: { body: MergeSessionSchema }
    }, async (request, reply) => {
      const { id } = request.params as { id: string };
      await this.amp.mergeSession(id, request.body as any);
      return { success: true, message: 'Session merged successfully' };
    });

    // GET /api/v1/sessions/:id/diff - text or HTML diff
    this.app.get('/api/v1/sessions/:id/diff', async (request, reply) => {
      const { id } = request.params as { id: string };
      const query = request.query as any;
      
      const session = await this.amp.getSession(id);
      if (!session) {
        reply.code(404).send({ error: 'Not Found', message: 'Session not found' });
        return;
      }

      const diff = await this.git.getDiff(session.worktreePath, query);
      
      if (query.format === 'json') {
        return { success: true, data: JSON.parse(diff) };
      }
      
      reply.type('text/plain').send(diff);
    });
  }

  private setupBenchmarkRoutes(): void {
    // POST /api/v1/benchmarks/run - start benchmark from YAML config
    this.app.post('/api/v1/benchmarks/run', async (request, reply) => {
      const { configPath } = request.body as { configPath: string };
      if (!configPath) {
        reply.code(400).send({ error: 'Bad Request', message: 'configPath is required' });
        return;
      }
      
      try {
        const result = await this.benchmark.runBenchmark(configPath);
        return { success: true, data: { id: result.id, status: result.status } };
      } catch (error) {
        reply.code(500).send({ error: 'Internal Error', message: error instanceof Error ? error.message : String(error) });
      }
    });

    // GET /api/v1/benchmarks/:id - get benchmark result
    this.app.get('/api/v1/benchmarks/:id', async (request, reply) => {
      const { id } = request.params as { id: string };
      // This would need to be implemented in BenchmarkRunner
      reply.code(501).send({ error: 'Not Implemented', message: 'Benchmark result retrieval not yet implemented' });
    });
  }

  private setupThreadRoutes(): void {
    // GET /api/v1/threads - list threads for session
    this.app.get('/api/v1/threads', async (request, reply) => {
      const query = request.query as { limit?: string };
      const limit = query.limit ? parseInt(query.limit) : undefined;
      
      const threads = await this.threads.getThreads({ limit });
      return { success: true, data: threads };
    });

    // GET /api/v1/threads/:id/messages - get thread messages
    this.app.get('/api/v1/threads/:id/messages', async (request, reply) => {
      const { id } = request.params as { id: string };
      const messages = await this.threads.getThreadMessages(id);
      return { success: true, data: messages };
    });

    // POST /api/v1/threads/:id/messages - continue thread
    this.app.post('/api/v1/threads/:id/messages', {
      schema: { body: AddMessageSchema }
    }, async (request, reply) => {
      const { id } = request.params as { id: string };
      await this.threads.addThreadMessage(id, request.body as any);
      return { success: true, message: 'Message added to thread' };
    });
  }

  private setupConfigRoutes(): void {
    // GET /api/v1/configs - saved configurations
    this.app.get('/api/v1/configs', async (request, reply) => {
      return { success: true, data: this.configs };
    });
  }

  private setupSSE(): void {
    // GET /api/v1/streams/threads/:id/logs - SSE for live logs
    this.app.get('/api/v1/streams/threads/:id/logs', (request, reply) => {
      const { id } = request.params as { id: string };
      
      // Set SSE headers
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
      });

      // Send initial connection message
      const welcomeEvent = JSON.stringify({ type: 'connected', sessionId: id, timestamp: new Date() });
      reply.raw.write(`data: ${welcomeEvent}\n\n`);

      // Set up cleanup on client disconnect
      request.socket.on('close', () => {
        reply.raw.end();
      });
    });

    // Handle amp service log events
    this.amp.on('log', (sessionId: string, logEvent: any) => {
      // In a real implementation, this would forward to active SSE connections
      this.app.log.info(`Session ${sessionId} log:`, logEvent);
    });
  }

  async start(options: { host?: string; port?: number; cors?: boolean } = {}): Promise<void> {
    const { host = '127.0.0.1', port = 7760 } = options;
    
    try {
      console.log(`[DEBUG] Initializing server first...`);
      await this.initialize({ cors: options.cors });
      
      console.log(`[DEBUG] Attempting to start server on ${host}:${port}`);
      await this.app.listen({ host, port });
      console.log(`[DEBUG] Server listen completed on ${host}:${port}`);
      
      // Get token after server is listening (non-blocking)
      setImmediate(async () => {
        try {
          const token = await this.auth.getOrCreateToken();
          console.log(`🔒 Mobile API Token: ${token}`);
          console.log(`📁 Token file: ${require('path').join(require('os').homedir(), '.config', 'amp-session-manager', 'mobile_api_token')}`);
        } catch (error) {
          console.error('Error getting API token:', error);
        }
      });
      
    } catch (error) {
      console.error(`[DEBUG] Server start error:`, error);
      this.app.log.error(error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    await this.app.close();
  }

  get fastify(): FastifyInstance {
    return this.app;
  }

  private async getBasicMobileHTML(): Promise<string> {
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
    .status.running { background: #10b981; color: white; }
    .status.idle { background: #6b7280; color: white; }
    .status.error { background: #ef4444; color: white; }
    .form-group {
      margin: 12px 0;
    }
    .form-group label {
      display: block;
      margin-bottom: 4px;
      font-weight: 500;
    }
    .form-group input, .form-group textarea, .form-group select {
      width: 100%;
      padding: 8px;
      border: 1px solid #ccc;
      border-radius: 4px;
      box-sizing: border-box;
    }
    .form-group textarea {
      height: 80px;
      resize: vertical;
    }
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
      <div class="form-group">
        <label for="sessionName">Session Name:</label>
        <input type="text" id="sessionName" placeholder="e.g. Fix login bug">
      </div>
      <div class="form-group">
        <label for="repoPath">Repository Path:</label>
        <input type="text" id="repoPath" placeholder="/path/to/your/repo" value="/Users/sjarmak">
      </div>
      <div class="form-group">
        <label for="prompt">Initial Prompt:</label>
        <textarea id="prompt" placeholder="Describe what you want Amp to do..."></textarea>
      </div>
      <button class="btn" onclick="submitSession()">Create & Start</button>
      <button class="btn" onclick="cancelSession()" style="background:#6b7280;">Cancel</button>
    </div>
  </div>

  <script>
    const apiToken = localStorage.getItem('apiToken') || '${await this.auth.getOrCreateToken()}'; // Embed token directly
    const apiHeaders = { 
      'Authorization': 'Bearer ' + apiToken,
      'Content-Type': 'application/json'
    };

    function loadSessions() {
      fetch('/api/v1/sessions', { headers: apiHeaders })
        .then(r => r.json())
        .then(data => {
          console.log('Sessions data:', data);
          const sessions = data.success ? data.data : data.sessions || [];
          const html = sessions.length > 0
            ? sessions.map(s => \`
              <div class="card" style="margin:8px 0;">
                <strong>\${s.name}</strong>
                <span class="status \${s.status}">\${s.status}</span>
                <br><small>\${s.repoRoot || 'No repo'}</small>
              </div>
            \`).join('')
            : '<p>No sessions found. Create your first one!</p>';

          document.getElementById('sessions').innerHTML = html;
        })
        .catch(e => {
          console.error('Error loading sessions:', e);
          document.getElementById('sessions').innerHTML = '<p style="color:red;">Error loading sessions</p>';
        });
    }

    function createSession() {
      document.getElementById('newSession').style.display = 'block';
    }

    function cancelSession() {
      document.getElementById('newSession').style.display = 'none';
    }

    function submitSession() {
      const name = document.getElementById('sessionName').value.trim();
      const repoPath = document.getElementById('repoPath').value.trim();
      const prompt = document.getElementById('prompt').value.trim();

      if (!name || !repoPath || !prompt) {
        return alert('Please fill in all fields');
      }

      const payload = {
        name,
        repoRoot: repoPath,
        ampPrompt: prompt,
        baseBranch: 'main'
      };

      console.log('Creating session with:', payload);

      fetch('/api/v1/sessions', {
        method: 'POST',
        headers: apiHeaders,
        body: JSON.stringify(payload)
      })
      .then(r => r.json())
      .then(data => {
        console.log('Session creation response:', data);
        if (data.success) {
          alert('Session created successfully!');
          cancelSession();
          loadSessions();
        } else {
          alert('Error: ' + (data.message || 'Failed to create session'));
        }
      })
      .catch(e => {
        console.error('Error creating session:', e);
        alert('Error creating session');
      });
    }

    // Auto-load sessions on page load
    loadSessions();
  </script>
</body>
</html>`;
  }
}

export * from './schemas.js';
export * from './services/auth.js';
export * from './services/git.js';
export * from './services/amp.js';
export * from './services/threadStore.js';

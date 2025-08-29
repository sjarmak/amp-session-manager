import { SessionStore } from '@ampsm/core';
import type { Session, SessionCreateOptions, IterationRecord } from '@ampsm/types';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';

export interface AmpIterationOptions {
  sessionId: string;
  prompt?: string;
  model?: string;
  timeout?: number;
}

export interface AmpLogEvent {
  type: 'stdout' | 'stderr' | 'status' | 'error' | 'complete';
  data: string;
  timestamp: Date;
}

export class AmpService extends EventEmitter {
  private store: SessionStore;
  private activeIterations = new Map<string, { process?: any; controller: AbortController }>();

  constructor(store: SessionStore) {
    super();
    this.store = store;
  }

  async createSession(options: SessionCreateOptions): Promise<Session> {
    return this.store.createSession(options);
  }

  async getSession(id: string): Promise<Session | null> {
    return this.store.getSession(id);
  }

  async listSessions(options: { limit?: number; status?: string } = {}): Promise<Session[]> {
    return this.store.getAllSessions();
  }

  async startIteration(options: AmpIterationOptions): Promise<string> {
    const { sessionId, prompt, model, timeout = 300000 } = options;
    
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (this.activeIterations.has(sessionId)) {
      throw new Error(`Session ${sessionId} already has an active iteration`);
    }

    const controller = new AbortController();
    this.activeIterations.set(sessionId, { controller });

    // Start the amp process
    const ampArgs = this.buildAmpArgs(session, prompt, model);
    const ampProcess = spawn('amp', ampArgs, {
      cwd: session.worktreePath,
      signal: controller.signal,
      env: { ...process.env, FORCE_COLOR: '0' }
    });

    this.activeIterations.set(sessionId, { process: ampProcess, controller });

    // Update session status
    this.store.updateSessionStatus(sessionId, 'running');

    // Handle process events
    this.setupProcessHandlers(sessionId, ampProcess, controller, timeout);

    return `Iteration started for session ${sessionId}`;
  }

  async abortIteration(sessionId: string): Promise<void> {
    const active = this.activeIterations.get(sessionId);
    if (!active) {
      throw new Error(`No active iteration for session ${sessionId}`);
    }

    active.controller.abort();
    if (active.process) {
      active.process.kill('SIGTERM');
    }

    this.activeIterations.delete(sessionId);
    this.store.updateSessionStatus(sessionId, 'idle');
  }

  async mergeSession(sessionId: string, options: { 
    message?: string; 
    squash?: boolean 
  } = {}): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // This would use GitOps to merge the session branch
    // Implementation depends on existing core merge functionality
    throw new Error('Merge functionality not yet implemented');
  }

  async getSessionIterations(sessionId: string): Promise<IterationRecord[]> {
    return this.store.getIterations(sessionId);
  }

  private buildAmpArgs(session: Session, prompt?: string, model?: string): string[] {
    const args: string[] = [];
    
    if (prompt) {
      args.push(prompt);
    } else if (session.ampPrompt) {
      args.push(session.ampPrompt);
    }

    if (model || session.modelOverride) {
      args.push('--model', model || session.modelOverride!);
    }

    return args;
  }

  private setupProcessHandlers(
    sessionId: string, 
    process: any, 
    controller: AbortController,
    timeout: number
  ): void {
    const timeoutId = setTimeout(() => {
      controller.abort();
      this.emit('log', sessionId, {
        type: 'error',
        data: 'Iteration timed out',
        timestamp: new Date()
      });
    }, timeout);

    process.stdout?.on('data', (data: Buffer) => {
      this.emit('log', sessionId, {
        type: 'stdout',
        data: data.toString(),
        timestamp: new Date()
      });
    });

    process.stderr?.on('data', (data: Buffer) => {
      this.emit('log', sessionId, {
        type: 'stderr', 
        data: data.toString(),
        timestamp: new Date()
      });
    });

    process.on('exit', (code: number) => {
      clearTimeout(timeoutId);
      this.activeIterations.delete(sessionId);

      const status = code === 0 ? 'idle' : 'error';
      this.store.updateSessionStatus(sessionId, status);

      this.emit('log', sessionId, {
        type: 'complete',
        data: `Process exited with code ${code}`,
        timestamp: new Date()
      });
    });

    process.on('error', (error: Error) => {
      clearTimeout(timeoutId);
      this.activeIterations.delete(sessionId);
      
      this.store.updateSessionStatus(sessionId, 'error');

      this.emit('log', sessionId, {
        type: 'error',
        data: error.message,
        timestamp: new Date()
      });
    });
  }

  isIterationActive(sessionId: string): boolean {
    return this.activeIterations.has(sessionId);
  }
}

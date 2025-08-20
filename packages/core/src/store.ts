import Database from 'better-sqlite3';
import type { Session, IterationRecord, ToolCall, SessionCreateOptions, AmpTelemetry } from '@ampsm/types';
import { randomUUID } from 'crypto';

export class SessionStore {
  private db: Database.Database;

  constructor(dbPath: string = './sessions.sqlite') {
    this.db = new Database(dbPath);
    this.initTables();
  }

  private initTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        ampPrompt TEXT NOT NULL,
        repoRoot TEXT NOT NULL,
        baseBranch TEXT NOT NULL,
        branchName TEXT NOT NULL,
        worktreePath TEXT NOT NULL,
        status TEXT NOT NULL,
        scriptCommand TEXT,
        modelOverride TEXT,
        createdAt TEXT NOT NULL,
        lastRun TEXT,
        notes TEXT
      );

      CREATE TABLE IF NOT EXISTS iterations (
        id TEXT PRIMARY KEY,
        sessionId TEXT NOT NULL,
        startTime TEXT NOT NULL,
        endTime TEXT,
        commitSha TEXT,
        changedFiles INTEGER NOT NULL DEFAULT 0,
        testResult TEXT,
        testExitCode INTEGER,
        tokenUsage INTEGER,
        promptTokens INTEGER,
        completionTokens INTEGER,
        totalTokens INTEGER,
        model TEXT,
        ampVersion TEXT,
        exitCode INTEGER,
        FOREIGN KEY(sessionId) REFERENCES sessions(id)
      );

      CREATE TABLE IF NOT EXISTS tool_calls (
        id TEXT PRIMARY KEY,
        sessionId TEXT NOT NULL,
        iterationId TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        toolName TEXT NOT NULL,
        argsJson TEXT NOT NULL,
        success BOOLEAN NOT NULL,
        durationMs INTEGER,
        rawJson TEXT,
        FOREIGN KEY(sessionId) REFERENCES sessions(id),
        FOREIGN KEY(iterationId) REFERENCES iterations(id)
      );

      CREATE TABLE IF NOT EXISTS merge_history (
        id TEXT PRIMARY KEY,
        sessionId TEXT NOT NULL,
        startedAt TEXT NOT NULL,
        finishedAt TEXT,
        baseBranch TEXT NOT NULL,
        mode TEXT NOT NULL,
        result TEXT NOT NULL,
        conflictFiles TEXT,
        squashMessage TEXT,
        FOREIGN KEY(sessionId) REFERENCES sessions(id)
      );
    `);
  }

  createSession(options: SessionCreateOptions): Session {
    const id = randomUUID();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const slug = options.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    
    const session: Session = {
      id,
      name: options.name,
      ampPrompt: options.ampPrompt,
      repoRoot: options.repoRoot,
      baseBranch: options.baseBranch || 'main',
      branchName: `amp/${slug}/${timestamp}`,
      worktreePath: `${options.repoRoot}/.worktrees/${id}`,
      status: 'idle',
      scriptCommand: options.scriptCommand,
      modelOverride: options.modelOverride,
      createdAt: new Date().toISOString()
    };

    const stmt = this.db.prepare(`
      INSERT INTO sessions (id, name, ampPrompt, repoRoot, baseBranch, branchName, 
        worktreePath, status, scriptCommand, modelOverride, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      session.id, session.name, session.ampPrompt, session.repoRoot,
      session.baseBranch, session.branchName, session.worktreePath,
      session.status, session.scriptCommand, session.modelOverride,
      session.createdAt
    );

    return session;
  }

  getSession(id: string): Session | null {
    const stmt = this.db.prepare('SELECT * FROM sessions WHERE id = ?');
    return stmt.get(id) as Session | null;
  }

  getAllSessions(): Session[] {
    const stmt = this.db.prepare('SELECT * FROM sessions ORDER BY createdAt DESC');
    return stmt.all() as Session[];
  }

  updateSessionStatus(id: string, status: Session['status']) {
    const stmt = this.db.prepare('UPDATE sessions SET status = ?, lastRun = ? WHERE id = ?');
    stmt.run(status, new Date().toISOString(), id);
  }

  deleteSession(id: string): void {
    // Delete in reverse order of foreign keys
    this.db.prepare('DELETE FROM tool_calls WHERE sessionId = ?').run(id);
    this.db.prepare('DELETE FROM iterations WHERE sessionId = ?').run(id);
    this.db.prepare('DELETE FROM merge_history WHERE sessionId = ?').run(id);
    this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
  }

  createIteration(sessionId: string): IterationRecord {
    const id = randomUUID();
    const iteration: IterationRecord = {
      id,
      sessionId,
      startTime: new Date().toISOString(),
      changedFiles: 0
    };

    const stmt = this.db.prepare(`
      INSERT INTO iterations (id, sessionId, startTime, changedFiles)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(iteration.id, iteration.sessionId, iteration.startTime, iteration.changedFiles);

    return iteration;
  }

  updateIteration(iterationId: string, updates: Partial<IterationRecord>) {
    const fields: string[] = [];
    const values: any[] = [];

    Object.entries(updates).forEach(([key, value]) => {
      if (key !== 'id' && key !== 'sessionId' && value !== undefined) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    });

    if (fields.length === 0) return;

    values.push(iterationId);
    const stmt = this.db.prepare(`UPDATE iterations SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);
  }

  finishIteration(iterationId: string, telemetry: AmpTelemetry, commitSha?: string, changedFiles?: number) {
    const updates: Partial<IterationRecord> = {
      endTime: new Date().toISOString(),
      exitCode: telemetry.exitCode,
      promptTokens: telemetry.promptTokens,
      completionTokens: telemetry.completionTokens,
      totalTokens: telemetry.totalTokens,
      model: telemetry.model,
      ampVersion: telemetry.ampVersion,
      commitSha,
      changedFiles: changedFiles || 0
    };

    this.updateIteration(iterationId, updates);

    // Note: Tool calls will be saved separately by the caller with the correct sessionId
  }

  saveToolCall(toolCall: Omit<ToolCall, 'sessionId'> & { sessionId: string }) {
    const stmt = this.db.prepare(`
      INSERT INTO tool_calls (id, sessionId, iterationId, timestamp, toolName, argsJson, success, durationMs, rawJson)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      toolCall.id,
      toolCall.sessionId,
      toolCall.iterationId,
      toolCall.timestamp,
      toolCall.toolName,
      toolCall.argsJson,
      toolCall.success,
      toolCall.durationMs,
      toolCall.rawJson
    );
  }

  getIterations(sessionId: string, limit?: number): IterationRecord[] {
    const sql = limit 
      ? 'SELECT * FROM iterations WHERE sessionId = ? ORDER BY startTime DESC LIMIT ?' 
      : 'SELECT * FROM iterations WHERE sessionId = ? ORDER BY startTime DESC';
    const stmt = this.db.prepare(sql);
    return limit ? stmt.all(sessionId, limit) as IterationRecord[] : stmt.all(sessionId) as IterationRecord[];
  }

  getToolCalls(sessionId: string, iterationId?: string, limit?: number): ToolCall[] {
    let sql = 'SELECT * FROM tool_calls WHERE sessionId = ?';
    const params: any[] = [sessionId];

    if (iterationId) {
      sql += ' AND iterationId = ?';
      params.push(iterationId);
    }

    sql += ' ORDER BY timestamp DESC';
    
    if (limit) {
      sql += ' LIMIT ?';
      params.push(limit);
    }

    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as ToolCall[];
  }

  getTokenUsageStats(sessionId: string, limit?: number): Array<{
    iterationId: string;
    startTime: string;
    model?: string;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  }> {
    const sql = limit
      ? 'SELECT id as iterationId, startTime, model, promptTokens, completionTokens, totalTokens FROM iterations WHERE sessionId = ? ORDER BY startTime DESC LIMIT ?'
      : 'SELECT id as iterationId, startTime, model, promptTokens, completionTokens, totalTokens FROM iterations WHERE sessionId = ? ORDER BY startTime DESC';
    const stmt = this.db.prepare(sql);
    const results = limit ? stmt.all(sessionId, limit) : stmt.all(sessionId);
    return results as Array<{
      iterationId: string;
      startTime: string;
      model?: string;
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
    }>;
  }

  saveMergeHistory(record: {
    id: string;
    sessionId: string;
    startedAt: string;
    finishedAt?: string;
    baseBranch: string;
    mode: string;
    result: string;
    conflictFiles?: string[];
    squashMessage?: string;
  }) {
    const stmt = this.db.prepare(`
      INSERT INTO merge_history (id, sessionId, startedAt, finishedAt, baseBranch, mode, result, conflictFiles, squashMessage)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      record.id,
      record.sessionId,
      record.startedAt,
      record.finishedAt,
      record.baseBranch,
      record.mode,
      record.result,
      record.conflictFiles ? JSON.stringify(record.conflictFiles) : null,
      record.squashMessage
    );
  }

  updateMergeHistory(id: string, updates: {
    finishedAt?: string;
    result?: string;
    conflictFiles?: string[];
  }) {
    const fields: string[] = [];
    const values: any[] = [];

    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) {
        fields.push(`${key} = ?`);
        if (key === 'conflictFiles' && Array.isArray(value)) {
          values.push(JSON.stringify(value));
        } else {
          values.push(value);
        }
      }
    });

    if (fields.length === 0) return;

    values.push(id);
    const stmt = this.db.prepare(`UPDATE merge_history SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);
  }

  getMergeHistory(sessionId: string): Array<{
    id: string;
    sessionId: string;
    startedAt: string;
    finishedAt?: string;
    baseBranch: string;
    mode: string;
    result: string;
    conflictFiles?: string[];
    squashMessage?: string;
  }> {
    const stmt = this.db.prepare('SELECT * FROM merge_history WHERE sessionId = ? ORDER BY startedAt DESC');
    const results = stmt.all(sessionId) as any[];
    return results.map(row => ({
      ...row,
      conflictFiles: row.conflictFiles ? JSON.parse(row.conflictFiles) : undefined
    }));
  }

  close() {
    this.db.close();
  }
}

import Database from 'better-sqlite3';
import type { Session, IterationRecord, ToolCall, SessionCreateOptions, AmpTelemetry, BatchRecord, BatchItem, ExportOptions, SweBenchRun, SweBenchCaseResult } from '@ampsm/types';
import { randomUUID } from 'crypto';
import { getDbPath } from './config.js';

export class SessionStore {
  private db: Database.Database;
  public readonly dbPath: string;

  constructor(dbPath?: string) {
    try {
      const finalDbPath = dbPath || getDbPath();
      this.dbPath = finalDbPath;
      this.db = new Database(finalDbPath);
      
      // Enable WAL mode for better concurrency and preventing reader/writer conflicts
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL');
      this.db.pragma('cache_size = 1000');
      this.db.pragma('temp_store = memory');
      
      this.initTables();
    } catch (error) {
      console.error('Failed to initialize SQLite database:', error);
      throw new Error(`Database initialization failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private initTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        ampPrompt TEXT NOT NULL,
        followUpPrompts TEXT,
        repoRoot TEXT NOT NULL,
        baseBranch TEXT NOT NULL,
        branchName TEXT NOT NULL,
        worktreePath TEXT NOT NULL,
        status TEXT NOT NULL,
        scriptCommand TEXT,
        modelOverride TEXT,
        threadId TEXT,
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
        ampArgs TEXT,
        output TEXT,
        cliToolUsageCount INTEGER,
        cliErrorCount INTEGER,
        cliLogDurationMs INTEGER,
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

      CREATE TABLE IF NOT EXISTS batches (
        runId TEXT PRIMARY KEY,
        createdAt TEXT NOT NULL,
        defaultsJson TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS batch_items (
        id TEXT PRIMARY KEY,
        runId TEXT NOT NULL,
        sessionId TEXT,
        repo TEXT NOT NULL,
        prompt TEXT NOT NULL,
        status TEXT NOT NULL,
        error TEXT,
        startedAt TEXT,
        finishedAt TEXT,
        model TEXT,
        iterSha TEXT,
        tokensTotal INTEGER,
        toolCalls INTEGER,
        FOREIGN KEY(runId) REFERENCES batches(runId),
        FOREIGN KEY(sessionId) REFERENCES sessions(id)
      );

      CREATE TABLE IF NOT EXISTS swebench_runs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        casesDir TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        total INTEGER NOT NULL DEFAULT 0,
        completed INTEGER NOT NULL DEFAULT 0,
        passed INTEGER NOT NULL DEFAULT 0,
        failed INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'running'
      );

      CREATE TABLE IF NOT EXISTS swebench_case_results (
        runId TEXT NOT NULL,
        caseId TEXT NOT NULL,
        sessionId TEXT NOT NULL,
        status TEXT NOT NULL,
        iterations INTEGER NOT NULL DEFAULT 0,
        wallTimeSec REAL NOT NULL DEFAULT 0,
        PRIMARY KEY(runId, caseId),
        FOREIGN KEY(runId) REFERENCES swebench_runs(id),
        FOREIGN KEY(sessionId) REFERENCES sessions(id)
      );
    `);
    
    // Migration: Add threadId column if it doesn't exist
    try {
      this.db.exec(`ALTER TABLE sessions ADD COLUMN threadId TEXT;`);
    } catch (error) {
      // Column already exists, ignore error
    }
    
    // Migration: Add ampArgs column if it doesn't exist
    try {
      this.db.exec(`ALTER TABLE iterations ADD COLUMN ampArgs TEXT;`);
    } catch (error) {
      // Column already exists, ignore error
    }
    
    // Migration: Add followUpPrompts column if it doesn't exist
    try {
      this.db.exec(`ALTER TABLE sessions ADD COLUMN followUpPrompts TEXT;`);
    } catch (error) {
      // Column already exists, ignore error
    }
    
    // Migration: Add output column to iterations if it doesn't exist
    try {
      this.db.exec(`ALTER TABLE iterations ADD COLUMN output TEXT;`);
    } catch (error) {
      // Column already exists, ignore error
    }
    
    // Migration: Add CLI metrics columns to iterations if they don't exist
    try {
      this.db.exec(`ALTER TABLE iterations ADD COLUMN cliToolUsageCount INTEGER;`);
    } catch (error) {
      // Column already exists, ignore error
    }
    try {
      this.db.exec(`ALTER TABLE iterations ADD COLUMN cliErrorCount INTEGER;`);
    } catch (error) {
      // Column already exists, ignore error
    }
    try {
      this.db.exec(`ALTER TABLE iterations ADD COLUMN cliLogDurationMs INTEGER;`);
    } catch (error) {
      // Column already exists, ignore error
    }
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
      threadId: options.threadId,
      createdAt: new Date().toISOString()
    };

    const stmt = this.db.prepare(`
      INSERT INTO sessions (id, name, ampPrompt, followUpPrompts, repoRoot, baseBranch, branchName, 
        worktreePath, status, scriptCommand, modelOverride, threadId, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      session.id, session.name, session.ampPrompt, null,
      session.repoRoot, session.baseBranch, session.branchName, session.worktreePath,
      session.status, session.scriptCommand ?? null, session.modelOverride ?? null,
      session.threadId ?? null, session.createdAt
    );

    return session;
  }

  getSession(id: string): Session | null {
    const stmt = this.db.prepare('SELECT * FROM sessions WHERE id = ?');
    const row = stmt.get(id) as any;
    if (!row) return null;
    
    return {
      ...row,
      followUpPrompts: row.followUpPrompts ? JSON.parse(row.followUpPrompts) : undefined
    } as Session;
  }

  getAllSessions(): Session[] {
    const stmt = this.db.prepare('SELECT * FROM sessions ORDER BY createdAt DESC');
    const rows = stmt.all() as any[];
    return rows.map(row => ({
      ...row,
      followUpPrompts: row.followUpPrompts ? JSON.parse(row.followUpPrompts) : undefined
    })) as Session[];
  }

  updateSessionStatus(id: string, status: Session['status']) {
    const stmt = this.db.prepare('UPDATE sessions SET status = ?, lastRun = ? WHERE id = ?');
    stmt.run(status, new Date().toISOString(), id);
  }

  updateSessionThreadId(id: string, threadId: string) {
    const stmt = this.db.prepare('UPDATE sessions SET threadId = ? WHERE id = ?');
    stmt.run(threadId, id);
  }

  addFollowUpPrompt(id: string, followUpPrompt: string) {
    const session = this.getSession(id);
    if (!session) throw new Error(`Session ${id} not found`);
    
    const currentPrompts = session.followUpPrompts || [];
    const updatedPrompts = [...currentPrompts, followUpPrompt];
    
    const stmt = this.db.prepare('UPDATE sessions SET followUpPrompts = ? WHERE id = ?');
    stmt.run(JSON.stringify(updatedPrompts), id);
  }

  deleteSession(id: string): void {
    // Delete in reverse order of foreign keys
    
    // First, get all metric iteration IDs for this session
    const metricIterations = this.db.prepare('SELECT id FROM metric_iterations WHERE session_id = ?').all(id) as Array<{ id: string }>;
    
    // Delete metrics data that references metric iterations
    for (const iteration of metricIterations) {
      this.db.prepare('DELETE FROM metric_tool_calls WHERE iteration_id = ?').run(iteration.id);
      this.db.prepare('DELETE FROM metric_llm_usage WHERE iteration_id = ?').run(iteration.id);
      this.db.prepare('DELETE FROM metric_git_operations WHERE iteration_id = ?').run(iteration.id);
      this.db.prepare('DELETE FROM metric_test_results WHERE iteration_id = ?').run(iteration.id);
      this.db.prepare('DELETE FROM metric_file_edits WHERE iteration_id = ?').run(iteration.id);
    }
    
    // Delete metric iterations
    this.db.prepare('DELETE FROM metric_iterations WHERE session_id = ?').run(id);
    
    // Delete original session-related data
    this.db.prepare('DELETE FROM tool_calls WHERE sessionId = ?').run(id);
    this.db.prepare('DELETE FROM iterations WHERE sessionId = ?').run(id);
    this.db.prepare('DELETE FROM merge_history WHERE sessionId = ?').run(id);
    this.db.prepare('DELETE FROM batch_items WHERE sessionId = ?').run(id);
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
    stmt.run(iteration.id, iteration.sessionId, iteration.startTime, iteration.changedFiles ?? null);

    return iteration;
  }

  updateIteration(iterationId: string, updates: Partial<IterationRecord>) {
    const fields: string[] = [];
    const values: any[] = [];

    Object.entries(updates).forEach(([key, value]) => {
      if (key !== 'id' && key !== 'sessionId' && value !== undefined) {
        fields.push(`${key} = ?`);
        values.push(value === undefined ? null : value);
      }
    });

    if (fields.length === 0) return;

    values.push(iterationId);
    const stmt = this.db.prepare(`UPDATE iterations SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);
  }

  finishIteration(iterationId: string, telemetry: AmpTelemetry, commitSha?: string, changedFiles?: number, ampArgs?: string, output?: string, cliMetrics?: { toolUsageCount: number; errorCount: number; durationMs: number }) {
    console.log('Finishing iteration:', {
      iterationId,
      outputLength: output?.length || 0,
      outputPreview: output?.slice(0, 100) || 'No output'
    });
    
    const updates = {
      endTime: new Date().toISOString(),
      exitCode: telemetry.exitCode,
      promptTokens: telemetry.promptTokens,
      completionTokens: telemetry.completionTokens,
      totalTokens: telemetry.totalTokens,
      model: telemetry.model,
      ampVersion: telemetry.ampVersion,
      commitSha,
      changedFiles: changedFiles || 0,
      output,
      cliToolUsageCount: cliMetrics?.toolUsageCount,
      cliErrorCount: cliMetrics?.errorCount,
      cliLogDurationMs: cliMetrics?.durationMs
    } as Partial<IterationRecord>;
    
    if (ampArgs) {
      (updates as any).ampArgs = ampArgs;
    }

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
      toolCall.argsJson ?? null,
      toolCall.success ? 1 : 0,
      toolCall.durationMs ?? null,
      toolCall.rawJson ?? null
    );
  }

  getIterations(sessionId: string, limit?: number): IterationRecord[] {
    const sql = limit 
      ? 'SELECT * FROM iterations WHERE sessionId = ? ORDER BY startTime ASC LIMIT ?' 
      : 'SELECT * FROM iterations WHERE sessionId = ? ORDER BY startTime ASC';
    const stmt = this.db.prepare(sql);
    const results = limit ? stmt.all(sessionId, limit) as IterationRecord[] : stmt.all(sessionId) as IterationRecord[];
    return results;
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
      ? 'SELECT id as iterationId, startTime, model, promptTokens, completionTokens, totalTokens FROM iterations WHERE sessionId = ? ORDER BY startTime ASC LIMIT ?'
      : 'SELECT id as iterationId, startTime, model, promptTokens, completionTokens, totalTokens FROM iterations WHERE sessionId = ? ORDER BY startTime ASC';
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
      record.finishedAt ?? null,
      record.baseBranch,
      record.mode,
      record.result,
      record.conflictFiles ? JSON.stringify(record.conflictFiles) : null,
      record.squashMessage ?? null
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
          values.push(value === undefined ? null : value);
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

  // Batch operations
  createBatch(runId: string, defaults: any): BatchRecord {
    const batch: BatchRecord = {
      runId,
      createdAt: new Date().toISOString(),
      defaultsJson: JSON.stringify(defaults)
    };

    const stmt = this.db.prepare(`
      INSERT INTO batches (runId, createdAt, defaultsJson)
      VALUES (?, ?, ?)
    `);
    stmt.run(batch.runId, batch.createdAt, batch.defaultsJson);

    return batch;
  }

  createBatchItem(batchItem: Omit<BatchItem, 'id'>): BatchItem {
    const item: BatchItem = {
      id: randomUUID(),
      ...batchItem
    };

    const stmt = this.db.prepare(`
      INSERT INTO batch_items (id, runId, sessionId, repo, prompt, status, error, 
        startedAt, finishedAt, model, iterSha, tokensTotal, toolCalls)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      item.id,
      item.runId,
      item.sessionId ?? null,
      item.repo,
      item.prompt,
      item.status,
      item.error ?? null,
      item.startedAt ?? null,
      item.finishedAt ?? null,
      item.model ?? null,
      item.iterSha ?? null,
      item.tokensTotal ?? null,
      item.toolCalls ?? null
    );

    return item;
  }

  updateBatchItem(id: string, updates: Partial<BatchItem>) {
    const fields: string[] = [];
    const values: any[] = [];

    Object.entries(updates).forEach(([key, value]) => {
      if (key !== 'id' && value !== undefined) {
        fields.push(`${key} = ?`);
        values.push(value === undefined ? null : value);
      }
    });

    if (fields.length === 0) return;

    values.push(id);
    const stmt = this.db.prepare(`UPDATE batch_items SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);
  }

  getBatch(runId: string): BatchRecord | undefined {
    const stmt = this.db.prepare('SELECT * FROM batches WHERE runId = ?');
    return stmt.get(runId) as BatchRecord | undefined;
  }

  getBatchItems(runId: string): BatchItem[] {
    const stmt = this.db.prepare('SELECT * FROM batch_items WHERE runId = ? ORDER BY startedAt ASC');
    return stmt.all(runId) as BatchItem[];
  }

  getAllBatches(): BatchRecord[] {
    const stmt = this.db.prepare('SELECT * FROM batches ORDER BY createdAt DESC');
    return stmt.all() as BatchRecord[];
  }

  deleteBatch(runId: string): void {
    // Get all session IDs associated with this batch before deletion
    const getSessionIdsStmt = this.db.prepare('SELECT sessionId FROM batch_items WHERE runId = ? AND sessionId IS NOT NULL');
    const sessionIds = (getSessionIdsStmt.all(runId) as Array<{ sessionId: string }>).map(row => row.sessionId);
    
    // Delete batch items first (foreign key relationship)
    const deleteItemsStmt = this.db.prepare('DELETE FROM batch_items WHERE runId = ?');
    deleteItemsStmt.run(runId);
    
    // Then delete the batch record
    const deleteBatchStmt = this.db.prepare('DELETE FROM batches WHERE runId = ?');
    deleteBatchStmt.run(runId);
    
    // Clean up any remaining sessions that weren't deleted by worktree cleanup
    for (const sessionId of sessionIds) {
      try {
        // Check if session still exists before trying to delete
        const session = this.getSession(sessionId);
        if (session) {
          this.deleteSession(sessionId);
          console.log(`✓ Cleaned up remaining session ${sessionId} from database`);
        }
      } catch (error) {
        // Session already deleted or doesn't exist, ignore
      }
    }
  }

  exportData(options: ExportOptions): any {
    const tables = options.tables;
    const result: Record<string, any[]> = {};

    for (const table of tables) {
      let sql = `SELECT * FROM ${table}`;
      const params: any[] = [];

      if (options.runId && (table === 'batches' || table === 'batch_items')) {
        sql += ' WHERE runId = ?';
        params.push(options.runId);
      } else if (options.sessionIds && options.sessionIds.length > 0) {
        const placeholders = options.sessionIds.map(() => '?').join(',');
        sql += ` WHERE sessionId IN (${placeholders})`;
        params.push(...options.sessionIds);
      }

      if (options.startDate || options.endDate) {
        const timeField = table === 'sessions' ? 'createdAt' : 
                          table === 'iterations' ? 'startTime' :
                          table === 'batches' ? 'createdAt' : 'timestamp';
        
        if (sql.includes('WHERE')) {
          sql += ' AND ';
        } else {
          sql += ' WHERE ';
        }

        if (options.startDate && options.endDate) {
          sql += `${timeField} BETWEEN ? AND ?`;
          params.push(options.startDate, options.endDate);
        } else if (options.startDate) {
          sql += `${timeField} >= ?`;
          params.push(options.startDate);
        } else if (options.endDate) {
          sql += `${timeField} <= ?`;
          params.push(options.endDate);
        }
      }

      const stmt = this.db.prepare(sql);
      result[table] = stmt.all(...params);
    }

    return result;
  }

  // Recovery operations
  getHangingSessions(): Session[] {
    const stmt = this.db.prepare('SELECT * FROM sessions WHERE status = "running" ORDER BY lastRun ASC');
    return stmt.all() as Session[];
  }

  repairHangingSessions(): number {
    const stmt = this.db.prepare('UPDATE sessions SET status = "idle" WHERE status = "running"');
    const result = stmt.run();
    return result.changes;
  }

  // SWE-bench operations
  createSweBenchRun(run: Omit<SweBenchRun, 'createdAt'> & { createdAt?: string }): SweBenchRun {
    const sweBenchRun: SweBenchRun = {
      ...run,
      createdAt: run.createdAt || new Date().toISOString()
    };

    const stmt = this.db.prepare(`
      INSERT INTO swebench_runs (id, name, casesDir, createdAt, total, completed, passed, failed, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      sweBenchRun.id,
      sweBenchRun.name,
      sweBenchRun.casesDir,
      sweBenchRun.createdAt,
      sweBenchRun.total,
      sweBenchRun.completed,
      sweBenchRun.passed,
      sweBenchRun.failed,
      sweBenchRun.status
    );

    return sweBenchRun;
  }

  updateSweBenchRun(id: string, updates: Partial<Omit<SweBenchRun, 'id' | 'createdAt'>>) {
    const fields: string[] = [];
    const values: any[] = [];

    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    });

    if (fields.length === 0) return;

    values.push(id);
    const stmt = this.db.prepare(`UPDATE swebench_runs SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);
  }

  getSweBenchRun(id: string): SweBenchRun | null {
    const stmt = this.db.prepare('SELECT * FROM swebench_runs WHERE id = ?');
    return stmt.get(id) as SweBenchRun | null;
  }

  getAllSweBenchRuns(): SweBenchRun[] {
    const stmt = this.db.prepare('SELECT * FROM swebench_runs ORDER BY createdAt DESC');
    return stmt.all() as SweBenchRun[];
  }

  saveSweBenchCaseResult(result: SweBenchCaseResult) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO swebench_case_results (runId, caseId, sessionId, status, iterations, wallTimeSec)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      result.runId,
      result.caseId,
      result.sessionId,
      result.status,
      result.iterations,
      result.wallTimeSec
    );
  }

  getSweBenchCaseResults(runId: string): SweBenchCaseResult[] {
    const stmt = this.db.prepare('SELECT * FROM swebench_case_results WHERE runId = ? ORDER BY caseId ASC');
    return stmt.all(runId) as SweBenchCaseResult[];
  }

  deleteSweBenchRun(id: string): void {
    // Delete case results first (foreign key relationship)
    this.db.prepare('DELETE FROM swebench_case_results WHERE runId = ?').run(id);
    
    // Then delete the run record
    this.db.prepare('DELETE FROM swebench_runs WHERE id = ?').run(id);
  }

  close() {
    this.db.close();
  }
}

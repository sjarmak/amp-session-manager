import Database from 'better-sqlite3';
import type { Session, IterationRecord, ToolCall, SessionCreateOptions, AmpTelemetry, BatchRecord, BatchItem, ExportOptions, SweBenchRun, SweBenchCaseResult } from '@ampsm/types';
import { randomUUID } from 'crypto';
import { join } from 'path';
import { getDbPath } from './config.js';
import { createTimestampId, getCurrentISOString } from './utils/date.js';
import { TelemetryPersistence } from './telemetry/persistence.js';

export class SessionStore {
  public readonly db: Database.Database;
  public readonly dbPath: string;
  public readonly telemetry: TelemetryPersistence;

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
      
      this.telemetry = new TelemetryPersistence(this.db);
      
      this.initTables();
      this.telemetry.initTables();
      this.migrateThreadIds();
      this.migrateAutoCommitDefault();
      this.migrateSessionThreads();
      this.migrateAmpMode();
      
      // Clean up legacy Chat-named threads
      const cleanedCount = this.cleanupLegacyChatThreads();
      if (cleanedCount > 0) {
        console.log(`[DEBUG] Cleaned up ${cleanedCount} legacy Chat-named threads`);
      }
    } catch (error) {
      console.error('Failed to initialize SQLite database:', error);
      throw new Error(`Database initialization failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private addColumn(table: string, column: string, definition: string = 'TEXT'): void {
    const columns = this.db.prepare(`PRAGMA table_info(${table})`).all();
    if (!columns.some((r: any) => r.name === column)) {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }

  private migrateAmpPromptNullable(): void {
    // Check if ampPrompt column is already nullable
    const columns = this.db.prepare(`PRAGMA table_info(sessions)`).all() as Array<{
      cid: number;
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
      pk: number;
    }>;
    const ampPromptCol = columns.find(c => c.name === 'ampPrompt');
    
    // If ampPrompt is already nullable (notnull = 0), migration already completed
    if (ampPromptCol && ampPromptCol.notnull === 0) {
      return;
    }

    try {
      // SQLite doesn't support modifying column constraints directly
      // We need to recreate the table with the new schema
      this.db.exec(`
        BEGIN TRANSACTION;
        
        -- Create new table with nullable ampPrompt
        CREATE TABLE sessions_new (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          ampPrompt TEXT,
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
          notes TEXT,
          contextIncluded BOOLEAN,
          mode TEXT DEFAULT 'async',
          autoCommit BOOLEAN DEFAULT 0
        );
        
        -- Copy existing data
        INSERT INTO sessions_new SELECT 
          id, name, ampPrompt, followUpPrompts, repoRoot, baseBranch, branchName, 
          worktreePath, status, scriptCommand, modelOverride, threadId, createdAt, 
          lastRun, notes, contextIncluded, mode,
          COALESCE(autoCommit, 0) as autoCommit
        FROM sessions;
        
        -- Drop old table and rename new one
        DROP TABLE sessions;
        ALTER TABLE sessions_new RENAME TO sessions;
        
        COMMIT;
      `);
    } catch (error) {
      // Migration failed, rollback and ignore
      try {
        this.db.exec('ROLLBACK;');
      } catch (rollbackError) {
        // Ignore rollback error
      }
      // Re-throw the original error for debugging
      console.error('AmpPrompt nullable migration failed:', error);
    }
  }

  private migrateAgentColumns() {
    // Check if agentId column already exists
    const columns = this.db.prepare(`PRAGMA table_info(sessions)`).all() as Array<{name: string}>;
    const hasAgentId = columns.some(col => col.name === 'agentId');
    
    if (hasAgentId) {
      return; // Migration already completed
    }

    try {
      this.db.exec(`
        BEGIN TRANSACTION;
        
        -- Add agent-related columns to existing sessions table
        ALTER TABLE sessions ADD COLUMN agentId TEXT;
        ALTER TABLE sessions ADD COLUMN agentMode TEXT DEFAULT 'auto';
        ALTER TABLE sessions ADD COLUMN multiProvider BOOLEAN DEFAULT 0;
        ALTER TABLE sessions ADD COLUMN alloyMode BOOLEAN DEFAULT 0;
        ALTER TABLE sessions ADD COLUMN autoRoute BOOLEAN DEFAULT 0;
        
        COMMIT;
      `);
    } catch (error) {
      try {
        this.db.exec('ROLLBACK;');
      } catch (rollbackError) {
        // Ignore rollback error
      }
      console.error('Agent columns migration failed:', error);
    }
  }

  private initTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        ampPrompt TEXT,
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
        notes TEXT,
        contextIncluded BOOLEAN,
        mode TEXT DEFAULT 'async',
        autoCommit BOOLEAN DEFAULT 0,
        ampMode TEXT DEFAULT 'production',
        agentId TEXT,
        agentMode TEXT DEFAULT 'auto',
        multiProvider BOOLEAN DEFAULT 0,
        alloyMode BOOLEAN DEFAULT 0,
        autoRoute BOOLEAN DEFAULT 0
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

      CREATE TABLE IF NOT EXISTS stream_events (
        id TEXT PRIMARY KEY,
        sessionId TEXT NOT NULL,
        type TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        data TEXT NOT NULL,
        FOREIGN KEY(sessionId) REFERENCES sessions(id)
      );

      -- New session-thread relationship tables
      CREATE TABLE IF NOT EXISTS threads (
        id TEXT PRIMARY KEY,
        sessionId TEXT NOT NULL,
        name TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        ampMode TEXT CHECK(ampMode IN ('production', 'local-cli')),
        FOREIGN KEY(sessionId) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS thread_messages (
        id TEXT PRIMARY KEY,
        threadId TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        idx INTEGER NOT NULL,
        FOREIGN KEY(threadId) REFERENCES threads(id) ON DELETE CASCADE,
        UNIQUE(threadId, idx)
      );
    `);
    
    // Apply column migrations using helper
    this.addColumn('sessions', 'threadId');
    this.addColumn('batch_items', 'threadId');
    this.addColumn('iterations', 'ampArgs');
    this.addColumn('sessions', 'followUpPrompts');
    this.addColumn('iterations', 'output');
    this.addColumn('iterations', 'cliToolUsageCount', 'INTEGER');
    this.addColumn('iterations', 'cliErrorCount', 'INTEGER');
    this.addColumn('iterations', 'cliLogDurationMs', 'INTEGER');
    this.addColumn('sessions', 'contextIncluded', 'BOOLEAN');
    this.addColumn('sessions', 'mode', "TEXT DEFAULT 'async'");
    this.addColumn('sessions', 'autoCommit', 'BOOLEAN DEFAULT 1');
    
    // Migration: Make ampPrompt nullable for interactive sessions
    this.migrateAmpPromptNullable();
    
    // Migration: Add SDLC agent columns
    this.migrateAgentColumns();
    
    // Add indexes for thread relationship tables
    this.db.exec(`
      -- Indexes for threads table
      CREATE INDEX IF NOT EXISTS idx_threads_session_id ON threads(sessionId);
      CREATE INDEX IF NOT EXISTS idx_threads_status ON threads(status);
      CREATE INDEX IF NOT EXISTS idx_threads_created_at ON threads(createdAt);
      CREATE INDEX IF NOT EXISTS idx_threads_updated_at ON threads(updatedAt);

      -- Indexes for thread_messages table
      CREATE INDEX IF NOT EXISTS idx_thread_messages_thread_id ON thread_messages(threadId);
      CREATE INDEX IF NOT EXISTS idx_thread_messages_created_at ON thread_messages(createdAt);
      CREATE INDEX IF NOT EXISTS idx_thread_messages_role ON thread_messages(role);
      CREATE INDEX IF NOT EXISTS idx_thread_messages_idx ON thread_messages(idx);
    `);
  }

  createSession(options: SessionCreateOptions): Session {
    const id = randomUUID();
    const timestamp = createTimestampId();
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
      createdAt: new Date().toISOString(),
      mode: options.mode || 'async',
      ampMode: options.ampMode || 'production',
      // SDLC Agent fields
      agentId: options.agentId,
      agentMode: options.agentMode || 'auto',
      multiProvider: options.multiProvider,
      alloyMode: options.alloyMode,
      autoRoute: options.autoRoute
    };

    const stmt = this.db.prepare(`
      INSERT INTO sessions (id, name, ampPrompt, followUpPrompts, repoRoot, baseBranch, branchName, 
        worktreePath, status, scriptCommand, modelOverride, threadId, createdAt, mode, autoCommit, ampMode,
        agentId, agentMode, multiProvider, alloyMode, autoRoute)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      session.id, session.name, session.ampPrompt ?? null, null,
      session.repoRoot, session.baseBranch, session.branchName, session.worktreePath,
      session.status, session.scriptCommand ?? null, session.modelOverride ?? null,
      session.threadId ?? null, session.createdAt, session.mode ?? 'async',
      options.autoCommit !== undefined ? (options.autoCommit ? 1 : 0) : null,
      session.ampMode ?? 'production',
      session.agentId ?? null, session.agentMode ?? 'auto',
      session.multiProvider ? 1 : 0, session.alloyMode ? 1 : 0, session.autoRoute ? 1 : 0
    );

    return session;
  }

  getSession(id: string): Session | null {
    const stmt = this.db.prepare('SELECT * FROM sessions WHERE id = ?');
    const row = stmt.get(id) as any;
    if (!row) return null;
    
    return {
      ...row,
      followUpPrompts: row.followUpPrompts ? JSON.parse(row.followUpPrompts) : undefined,
      autoCommit: row.autoCommit !== undefined ? Boolean(row.autoCommit) : true
    } as Session;
  }

  getAllSessions(): Session[] {
    // Sync thread IDs for sessions that don't have them
    this.syncAllSessionThreadIds().catch(err => 
      console.error('Error syncing thread IDs:', err)
    );
    
    const stmt = this.db.prepare('SELECT * FROM sessions ORDER BY createdAt DESC');
    const rows = stmt.all() as any[];
    return rows.map(row => ({
      ...row,
      followUpPrompts: row.followUpPrompts ? JSON.parse(row.followUpPrompts) : undefined,
      autoCommit: row.autoCommit !== undefined ? Boolean(row.autoCommit) : true
    })) as Session[];
  }

  updateSessionStatus(id: string, status: Session['status']) {
    const stmt = this.db.prepare('UPDATE sessions SET status = ?, lastRun = ? WHERE id = ?');
    stmt.run(status, new Date().toISOString(), id);
  }

  updateSessionThreadId(id: string, threadId: string) {
    const stmt = this.db.prepare('UPDATE sessions SET threadId = ? WHERE id = ?');
    stmt.run(threadId, id);
    
    // Also ensure thread record exists in threads table
    this.ensureThreadRecord(id, threadId);
  }

  // Ensure a thread record exists for a session's threadId
  private ensureThreadRecord(sessionId: string, threadId: string) {
    // Check if thread exists globally, not just for this session
    const existingThread = this.db.prepare('SELECT id, sessionId FROM threads WHERE id = ?').get(threadId) as { id: string; sessionId: string } | undefined;
    
    if (!existingThread) {
      // Create thread with the exact ID (this will be for migration of existing threadIds)
      const now = new Date().toISOString();
      const stmt = this.db.prepare(`
        INSERT INTO threads (id, sessionId, name, createdAt, updatedAt, status)
        VALUES (?, ?, ?, ?, ?, 'active')
      `);
      stmt.run(threadId, sessionId, `Thread ${threadId}`, now, now);
    } else if (existingThread.sessionId !== sessionId) {
      // Thread exists but belongs to different session - this is a data inconsistency
      console.warn(`Thread ${threadId} exists but belongs to session ${existingThread.sessionId}, not ${sessionId}. Skipping migration.`);
    }
    // If thread exists for this session, nothing to do
  }

  // Migrate existing sessions with threadIds to have proper thread records
  migrateSessionThreads() {
    const sessionsWithThreadIds = this.db.prepare(`
      SELECT id, threadId 
      FROM sessions 
      WHERE threadId IS NOT NULL AND threadId != ''
    `).all() as Array<{id: string; threadId: string}>;
    
    console.log(`Found ${sessionsWithThreadIds.length} sessions with threadIds to migrate`);
    
    for (const session of sessionsWithThreadIds) {
      this.ensureThreadRecord(session.id, session.threadId);
    }
    
    console.log('Thread migration completed');
  }

  private migrateAmpMode(): void {
    this.addColumn('sessions', 'ampMode', "TEXT DEFAULT 'production'");
    this.addColumn('threads', 'ampMode', "TEXT CHECK(ampMode IN ('production', 'local-cli'))");
  }

  async syncAllSessionThreadIds() {
    try {
      const { getCurrentAmpThreadId } = await import('./amp-utils.js');
      const currentThreadId = await getCurrentAmpThreadId();
      
      if (!currentThreadId) {
        return; // No current thread ID available
      }

      // Get sessions that don't have a threadId set
      const sessionsWithoutThreadId = this.db.prepare("SELECT id FROM sessions WHERE threadId IS NULL OR threadId = ''").all() as { id: string }[];
      
      if (sessionsWithoutThreadId.length === 0) {
        return; // No sessions to update
      }
      
      // Update them with the current thread ID
      const updateStmt = this.db.prepare('UPDATE sessions SET threadId = ? WHERE id = ?');
      for (const session of sessionsWithoutThreadId) {
        updateStmt.run(currentThreadId, session.id);
        // Also ensure thread record exists
        this.ensureThreadRecord(session.id, currentThreadId);
      }
      
      console.log(`Synced ${sessionsWithoutThreadId.length} sessions with thread ID: ${currentThreadId}`);
    } catch (error) {
      console.error('Error in syncAllSessionThreadIds:', error);
      // Don't throw the error to prevent app startup issues
    }
  }

  updateSessionAutoCommit(id: string, autoCommit: boolean) {
    const stmt = this.db.prepare('UPDATE sessions SET autoCommit = ? WHERE id = ?');
    stmt.run(autoCommit ? 1 : 0, id);
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
      this.db.prepare('DELETE FROM metric_user_messages WHERE iteration_id = ?').run(iteration.id);
    }
    
    // Delete metric iterations
    this.db.prepare('DELETE FROM metric_iterations WHERE session_id = ?').run(id);
    
    // Delete original session-related data
    this.db.prepare('DELETE FROM tool_calls WHERE sessionId = ?').run(id);
    this.db.prepare('DELETE FROM iterations WHERE sessionId = ?').run(id);
    this.db.prepare('DELETE FROM merge_history WHERE sessionId = ?').run(id);
    this.db.prepare('DELETE FROM batch_items WHERE sessionId = ?').run(id);
    this.db.prepare('DELETE FROM stream_events WHERE sessionId = ?').run(id);
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

  async exportSessionData(sessionId: string, includeConversation: boolean = true, metricsAPI?: any): Promise<any> {
    // Get base session data
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // For interactive sessions, get minimal iteration data (or none if truly interactive)
    let iterations: any[] = [];
    let toolCalls: any[] = [];
    
    // Only include legacy iteration data for non-interactive sessions
    if (session.mode !== 'interactive') {
      iterations = this.getIterations(sessionId);
      toolCalls = this.getToolCalls(sessionId);
    }
    
    // Get merge history
    const mergeHistoryStmt = this.db.prepare('SELECT * FROM merge_history WHERE sessionId = ? ORDER BY startedAt DESC');
    const mergeHistory = mergeHistoryStmt.all(sessionId);

    // Get threads for this session
    let threads: any[] = [];
    let threadMessages: Record<string, any[]> = {};
    
    try {
      // Get all threads for this session using the session store method
      const threadsResult = this.getSessionThreads(sessionId);
      if (threadsResult && threadsResult.length > 0) {
        // Filter and sort threads like the UI does
        const validThreads = threadsResult.filter((thread: any) => {
          const isValidId = thread.id.startsWith('T-');
          const isNotChatName = !thread.name.startsWith('Chat ');
          const hasMessages = thread.messageCount > 0;
          return isValidId && (isNotChatName || hasMessages);
        });
        
        threads = validThreads.sort((a: any, b: any) => 
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        
        // Get messages for each thread if conversation is requested
        if (includeConversation) {
          for (const thread of threads) {
            try {
              const messages = this.getThreadMessages(thread.id);
              if (messages && messages.length > 0) {
                threadMessages[thread.id] = messages;
              }
            } catch (error) {
              console.warn(`Could not load messages for thread ${thread.id}:`, error);
            }
          }
        }
      }
    } catch (error) {
      console.warn(`Could not load threads for session ${sessionId}:`, error);
    }

    // Get thread conversation for main thread if available and requested
    let conversation = null;
    if (includeConversation && session.threadId) {
      try {
        const { ThreadStore: ThreadStoreClass } = await import('./amp/threads/store.js');
        const { Logger } = await import('./utils/logger.js');
        const ts = new ThreadStoreClass(this, new Logger('ExportThread'));
        const thread = ts.getFullThread(session.threadId);
        conversation = thread;
      } catch (error) {
        // Thread loading failed (likely schema mismatch), skip conversation
        console.warn(`Could not load conversation for session ${sessionId}, skipping conversation history:`, error instanceof Error ? error.message : String(error));
        conversation = { error: 'Failed to load conversation due to database schema incompatibility' };
      }
    }

    // Get git information from the worktree if it exists
    let gitInfo = null;
    if (session.worktreePath) {
      try {
        const { execSync } = await import('child_process');
        const cwd = session.worktreePath;
        
        // Get current branch
        const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd, encoding: 'utf8' }).trim();
        
        // Get commit count on this branch compared to base
        let commitCount = 0;
        try {
          const commits = execSync(`git rev-list --count ${session.baseBranch}..HEAD`, { cwd, encoding: 'utf8' }).trim();
          commitCount = parseInt(commits) || 0;
        } catch {
          // Branch might not have commits yet
        }
        
        // Get latest commit info
        let latestCommit = null;
        try {
          const commitInfo = execSync('git log -1 --format="%H|%s|%an|%ad" --date=iso', { cwd, encoding: 'utf8' }).trim();
          const [sha, message, author, date] = commitInfo.split('|');
          latestCommit = { sha, message, author, date };
        } catch {
          // No commits yet
        }
        
        // Get file status
        let fileStats = { modified: 0, added: 0, deleted: 0 };
        try {
          const status = execSync('git diff --name-status HEAD~1 2>/dev/null || git diff --name-status --cached', { cwd, encoding: 'utf8' }).trim();
          if (status) {
            const lines = status.split('\n');
            for (const line of lines) {
              const [status] = line.split('\t');
              if (status === 'M') fileStats.modified++;
              else if (status === 'A') fileStats.added++;
              else if (status === 'D') fileStats.deleted++;
            }
          }
        } catch {
          // No changes to analyze
        }
        
        gitInfo = {
          currentBranch,
          commitCount,
          latestCommit,
          fileStats
        };
      } catch (error) {
        console.warn(`Could not get git info for session ${sessionId}:`, error);
      }
    }

    // Check if this session is part of a batch run
    const batchItemStmt = this.db.prepare('SELECT * FROM batch_items WHERE sessionId = ?');
    const batchItem = batchItemStmt.get(sessionId) as BatchItem | undefined;
    
    let batchInfo = null;
    if (batchItem) {
      const batch = this.getBatch(batchItem.runId);
      batchInfo = {
        runId: batchItem.runId,
        batchDefaults: batch ? JSON.parse(batch.defaultsJson) : null,
        batchItem
      };
    }

    // Calculate aggregate metrics - use metrics API if available for more accurate data
    let aggregateMetrics;
    if (metricsAPI) {
      try {
        const sessionSummary = await metricsAPI.getSessionSummary(sessionId);
        if (sessionSummary) {
          aggregateMetrics = {
            totalTokens: sessionSummary.tokenUsage.totalTokens,
            totalDurationMs: sessionSummary.totalDurationMs,
            filesModified: sessionSummary.fileEdits.filter((f: any) => f.operationType === 'modify').length,
            filesCreated: sessionSummary.fileEdits.filter((f: any) => f.operationType === 'create').length,
            iterationCount: sessionSummary.totalIterations,
            toolCallCount: sessionSummary.toolUsage.reduce((sum: number, tool: any) => sum + tool.callCount, 0),
            successfulToolCalls: sessionSummary.toolUsage.reduce((sum: number, tool: any) => sum + (tool.callCount - tool.failureCount), 0),
            failedToolCalls: sessionSummary.toolUsage.reduce((sum: number, tool: any) => sum + tool.failureCount, 0)
          };
        }
      } catch (error) {
        console.warn(`Could not get metrics from metrics API for session ${sessionId}:`, error);
      }
    }
    
    // Fallback to basic metrics calculation if metrics API unavailable or failed
    if (!aggregateMetrics) {
      const totalTokens = iterations.reduce((sum, iter) => sum + (iter.totalTokens || 0), 0);
      const totalDuration = iterations.length > 0 && iterations[iterations.length - 1].endTime && iterations[0].startTime
        ? new Date(iterations[iterations.length - 1].endTime!).getTime() - new Date(iterations[0].startTime).getTime()
        : 0;
      const filesModified = new Set(toolCalls.filter(tc => tc.toolName === 'edit_file' && tc.success).map(tc => {
        try {
          return JSON.parse(tc.argsJson).path;
        } catch { return null; }
      }).filter(Boolean)).size;
      const filesCreated = toolCalls.filter(tc => tc.toolName === 'create_file' && tc.success).length;

      aggregateMetrics = {
        totalTokens,
        totalDurationMs: totalDuration,
        filesModified,
        filesCreated,
        iterationCount: iterations.length,
        toolCallCount: toolCalls.length,
        successfulToolCalls: toolCalls.filter(tc => tc.success).length,
        failedToolCalls: toolCalls.filter(tc => !tc.success).length
      };
    }

    return {
      session,
      // Keep iterations for backward compatibility but mark as deprecated for interactive sessions
      iterations: session.mode === 'interactive' ? [] : iterations,
      toolCalls: session.mode === 'interactive' ? [] : toolCalls,
      // New thread-based data structure for interactive sessions
      threads,
      threadMessages: includeConversation ? threadMessages : {},
      // Git information
      gitInfo,
      mergeHistory,
      batchInfo,
      conversation,
      aggregateMetrics,
      exportedAt: new Date().toISOString()
    };
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
    console.log('🔍 Store: Getting SWE-bench case results for runId:', runId);
    const stmt = this.db.prepare('SELECT * FROM swebench_case_results WHERE runId = ? ORDER BY caseId ASC');
    const results = stmt.all(runId) as SweBenchCaseResult[];
    console.log('🔍 Store: Found', results.length, 'case results:', results);
    return results;
  }

  deleteSweBenchRun(id: string): void {
    // Delete case results first (foreign key relationship)
    this.db.prepare('DELETE FROM swebench_case_results WHERE runId = ?').run(id);
    
    // Then delete the run record
    this.db.prepare('DELETE FROM swebench_runs WHERE id = ?').run(id);
  }

  // Stream events methods
  addStreamEvent(sessionId: string, type: string, timestamp: string, data: any): void {
    const id = randomUUID();
    const stmt = this.db.prepare(`
      INSERT INTO stream_events (id, sessionId, type, timestamp, data)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(id, sessionId, type, timestamp, JSON.stringify(data));
  }

  getStreamEvents(sessionId: string): Array<{
    id: string;
    sessionId: string;
    type: string;
    timestamp: string;
    data: any;
  }> {
    const stmt = this.db.prepare('SELECT * FROM stream_events WHERE sessionId = ? ORDER BY timestamp ASC');
    const rows = stmt.all(sessionId) as any[];
    return rows.map(row => ({
      ...row,
      data: JSON.parse(row.data)
    }));
  }

  deleteStreamEvents(sessionId: string): void {
    const stmt = this.db.prepare('DELETE FROM stream_events WHERE sessionId = ?');
    stmt.run(sessionId);
  }

  // Thread relationship methods
  
  // Migrate existing thread IDs to use T- prefix format
  migrateThreadIds(): void {
    try {
      // Check if migration is needed by looking for threads without T- prefix
      const stmt = this.db.prepare("SELECT id FROM threads WHERE id NOT LIKE 'T-%'");
      const threadsToMigrate = stmt.all() as { id: string }[];
      
      if (threadsToMigrate.length === 0) {
        return; // No migration needed
      }
      
      console.log(`Migrating ${threadsToMigrate.length} thread IDs to T- format...`);
      
      // Begin transaction
      this.db.transaction(() => {
        for (const thread of threadsToMigrate) {
          const oldId = thread.id;
          const newId = `T-${oldId}`;
          
          // Update threads table
          this.db.prepare('UPDATE threads SET id = ? WHERE id = ?').run(newId, oldId);
          
          // Update thread_messages table
          this.db.prepare('UPDATE thread_messages SET threadId = ? WHERE threadId = ?').run(newId, oldId);
        }
      })();
      
      console.log(`Successfully migrated ${threadsToMigrate.length} thread IDs`);
    } catch (error) {
      console.error('Failed to migrate thread IDs:', error);
    }
  }

  migrateAutoCommitDefault(): void {
    console.log('Running autoCommit migration...');
    try {
      // First check current state
      const countStmt = this.db.prepare(`SELECT COUNT(*) as count FROM sessions WHERE mode = 'interactive' AND autoCommit = 1`);
      const beforeCount = countStmt.get() as { count: number };
      console.log(`Found ${beforeCount.count} interactive sessions with autoCommit=true`);
      
      // Update all sessions that have autoCommit = 1 (true) to 0 (false) for interactive sessions
      // This makes interactive sessions default to staging instead of auto-committing
      const updateStmt = this.db.prepare(`
        UPDATE sessions 
        SET autoCommit = 0 
        WHERE mode = 'interactive' AND autoCommit = 1
      `);
      
      const result = updateStmt.run();
      console.log(`Migration result: changed ${result.changes} rows`);
    } catch (error) {
      console.error('Failed to migrate autoCommit defaults:', error);
    }
  }

  createThread(sessionId: string, name: string, providedId?: string): string {
    const id = providedId || `T-${randomUUID()}`;
    const now = new Date().toISOString();
    
    // Get the session's ampMode to apply to the thread
    const session = this.getSession(sessionId);
    const ampMode = session?.ampMode || 'production';
    
    console.log(`[DEBUG] createThread - sessionId: ${sessionId}, name: "${name}", id: ${id}, ampMode: ${ampMode}`);
    
    const stmt = this.db.prepare(`
      INSERT INTO threads (id, sessionId, name, createdAt, updatedAt, status, ampMode)
      VALUES (?, ?, ?, ?, ?, 'active', ?)
    `);
    
    stmt.run(id, sessionId, name, now, now, ampMode);
    console.log(`[DEBUG] createThread - successfully created thread ${id} with name "${name}" in ${ampMode} mode`);
    return id;
  }

  getThread(threadId: string): { id: string; sessionId: string } | undefined {
    const stmt = this.db.prepare('SELECT id, sessionId FROM threads WHERE id = ?');
    return stmt.get(threadId) as { id: string; sessionId: string } | undefined;
  }

  getSessionThreads(sessionId: string): Array<{
    id: string;
    sessionId: string;
    name: string;
    createdAt: string;
    updatedAt: string;
    status: string;
    messageCount: number;
    ampMode?: string;
  }> {
    const stmt = this.db.prepare(`
      SELECT 
        t.id, t.sessionId, t.name, t.createdAt, t.updatedAt, t.status, t.ampMode,
        COUNT(tm.id) as messageCount
      FROM threads t
      LEFT JOIN thread_messages tm ON t.id = tm.threadId
      WHERE t.sessionId = ?
      GROUP BY t.id, t.sessionId, t.name, t.createdAt, t.updatedAt, t.status, t.ampMode
      ORDER BY t.updatedAt DESC
    `);
    
    const threads = stmt.all(sessionId) as Array<{
      id: string;
      sessionId: string;
      name: string;
      createdAt: string;
      updatedAt: string;
      status: string;
      messageCount: number;
      ampMode?: string;
    }>;
    
    console.log(`[DEBUG] getSessionThreads for ${sessionId}:`, threads);
    return threads;
  }

  addThreadMessage(threadId: string, role: 'user' | 'assistant' | 'system', content: string): string {
    const id = randomUUID();
    const now = new Date().toISOString();
    
    console.log(`[DEBUG] addThreadMessage - threadId: ${threadId}, role: ${role}, content: ${content.substring(0, 100)}...`);
    
    // Get next index for this thread
    const idxStmt = this.db.prepare('SELECT COALESCE(MAX(idx), -1) + 1 as nextIdx FROM thread_messages WHERE threadId = ?');
    const { nextIdx } = idxStmt.get(threadId) as { nextIdx: number };
    
    const stmt = this.db.prepare(`
      INSERT INTO thread_messages (id, threadId, role, content, createdAt, idx)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(id, threadId, role, content, now, nextIdx);
    
    // Update thread updated timestamp
    this.updateThreadTimestamp(threadId);
    
    console.log(`[DEBUG] addThreadMessage - successfully added message ${id} to thread ${threadId} at index ${nextIdx}`);
    
    return id;
  }

  getThreadMessages(threadId: string): Array<{
    id: string;
    threadId: string;
    role: string;
    content: string;
    createdAt: string;
    idx: number;
  }> {
    const stmt = this.db.prepare(`
      SELECT id, threadId, role, content, createdAt, idx
      FROM thread_messages
      WHERE threadId = ?
      ORDER BY idx ASC
    `);
    
    return stmt.all(threadId) as Array<{
      id: string;
      threadId: string;
      role: string;
      content: string;
      createdAt: string;
      idx: number;
    }>;
  }

  updateThreadTimestamp(threadId: string): void {
    const stmt = this.db.prepare('UPDATE threads SET updatedAt = ? WHERE id = ?');
    stmt.run(new Date().toISOString(), threadId);
  }

  updateThreadName(threadId: string, name: string): void {
    const stmt = this.db.prepare('UPDATE threads SET name = ?, updatedAt = ? WHERE id = ?');
    stmt.run(name, new Date().toISOString(), threadId);
  }

  findThreadByFirstUserMessage(content: string): Array<{
    id: string;
    sessionId: string;
    name: string;
    createdAt: string;
    updatedAt: string;
    status: string;
    messageCount: number;
  }> {
    const stmt = this.db.prepare(`
      SELECT DISTINCT t.id, t.sessionId, t.name, t.createdAt, t.updatedAt, t.status, 
        (SELECT COUNT(*) FROM thread_messages tm2 WHERE tm2.threadId = t.id) as messageCount
      FROM threads t
      JOIN thread_messages tm ON t.id = tm.threadId
      WHERE tm.role = 'user' 
        AND tm.idx = 0
        AND tm.content = ?
      ORDER BY t.updatedAt DESC
    `);
    
    return stmt.all(content) as Array<{
      id: string;
      sessionId: string;
      name: string;
      createdAt: string;
      updatedAt: string;
      status: string;
      messageCount: number;
    }>;
  }

  // Clean up legacy Chat-named threads
  cleanupLegacyChatThreads(): number {
    console.log('[DEBUG] Cleaning up legacy Chat-named threads...');
    const chatThreads = this.db.prepare('SELECT id, name FROM threads WHERE name LIKE ?').all('Chat %') as { id: string; name: string }[];
    console.log(`[DEBUG] Found ${chatThreads.length} legacy Chat threads:`, chatThreads);
    
    if (chatThreads.length > 0) {
      const updateStmt = this.db.prepare('UPDATE threads SET name = ? WHERE id = ?');
      
      for (const thread of chatThreads) {
        const newName = `Thread ${thread.id}`;
        updateStmt.run(newName, thread.id);
        console.log(`[DEBUG] Updated thread ${thread.id}: "${thread.name}" -> "${newName}"`);
      }
    }
    
    return chatThreads.length;
  }

  deleteThread(threadId: string): void {
    // Messages will be cascade deleted due to foreign key constraint
    const stmt = this.db.prepare('DELETE FROM threads WHERE id = ?');
    stmt.run(threadId);
  }

  /**
   * Migrate existing session threadId values to new threads table
   * This should only be called once during migration
   */
  migrateSessionThreadIds(): { migrated: number; skipped: number } {
    // Find sessions with threadId values that haven't been migrated yet
    const sessionsStmt = this.db.prepare(`
      SELECT s.id, s.name, s.threadId, s.createdAt 
      FROM sessions s
      LEFT JOIN threads t ON s.id = t.sessionId
      WHERE s.threadId IS NOT NULL 
        AND s.threadId != ''
        AND t.sessionId IS NULL
    `);
    
    const sessions = sessionsStmt.all() as Array<{
      id: string;
      name: string;
      threadId: string;
      createdAt: string;
    }>;

    if (sessions.length === 0) {
      return { migrated: 0, skipped: 0 };
    }

    let migrated = 0;
    const insertThreadStmt = this.db.prepare(`
      INSERT INTO threads (id, sessionId, name, createdAt, updatedAt, status)
      VALUES (?, ?, ?, ?, ?, 'active')
    `);

    const insertMessageStmt = this.db.prepare(`
      INSERT INTO thread_messages (id, threadId, role, content, createdAt, idx)
      VALUES (?, ?, 'system', ?, ?, 0)
    `);

    for (const session of sessions) {
      const threadId = randomUUID();
      const now = new Date().toISOString();
      
      try {
        // Create thread record
        insertThreadStmt.run(
          threadId,
          session.id,
          `Thread for ${session.name}`,
          session.createdAt,
          now
        );

        // Create initial system message
        insertMessageStmt.run(
          randomUUID(),
          threadId,
          `Thread migrated from legacy threadId: ${session.threadId}`,
          session.createdAt
        );

        migrated++;
      } catch (error) {
        console.warn(`Failed to migrate thread for session ${session.id}:`, error);
      }
    }

    return { migrated, skipped: sessions.length - migrated };
  }

  close() {
    this.db.close();
  }
}

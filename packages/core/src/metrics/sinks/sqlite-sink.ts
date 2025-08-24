import Database from 'better-sqlite3';
import { MetricsSink, MetricEventTypes } from '../event-bus';
import { Logger } from '../../utils/logger';

export class SQLiteMetricsSink implements MetricsSink {
  name = 'sqlite';
  private db: Database.Database;
  private logger: Logger;

  // Prepared statements for performance
  private insertIterationStmt!: Database.Statement;
  private insertToolCallStmt!: Database.Statement;
  private insertLLMUsageStmt!: Database.Statement;
  private insertGitOpStmt!: Database.Statement;
  private insertTestResultStmt!: Database.Statement;
  private insertFileEditStmt!: Database.Statement;
  private updateIterationStmt!: Database.Statement;

  constructor(dbPath: string, logger: Logger) {
    this.logger = logger;
    this.db = new Database(dbPath);
    this.initializeSchema();
    this.prepareStatements();
  }

  private initializeSchema(): void {
    // Create metrics tables if they don't exist
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS metric_iterations (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        iteration_number INTEGER NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        duration_ms INTEGER,
        status TEXT,
        exit_code INTEGER,
        git_sha_start TEXT,
        git_sha_end TEXT,
        files_changed INTEGER DEFAULT 0,
        loc_added INTEGER DEFAULT 0,
        loc_deleted INTEGER DEFAULT 0,
        total_cost_usd REAL DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      );

      CREATE TABLE IF NOT EXISTS metric_tool_calls (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        iteration_id TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        args_json TEXT,
        started_at TEXT NOT NULL,
        ended_at TEXT NOT NULL,
        duration_ms INTEGER NOT NULL,
        success BOOLEAN NOT NULL,
        error_message TEXT,
        cost_usd REAL DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (iteration_id) REFERENCES metric_iterations(id)
      );

      CREATE TABLE IF NOT EXISTS metric_llm_usage (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        iteration_id TEXT NOT NULL,
        model TEXT NOT NULL,
        prompt_tokens INTEGER NOT NULL,
        completion_tokens INTEGER NOT NULL,
        total_tokens INTEGER NOT NULL,
        cost_usd REAL NOT NULL,
        latency_ms INTEGER NOT NULL,
        temperature REAL,
        top_p REAL,
        timestamp TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (iteration_id) REFERENCES metric_iterations(id)
      );

      CREATE TABLE IF NOT EXISTS metric_git_operations (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        iteration_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        sha_before TEXT,
        sha_after TEXT,
        files_changed INTEGER NOT NULL,
        insertions INTEGER NOT NULL,
        deletions INTEGER NOT NULL,
        conflicted BOOLEAN NOT NULL,
        duration_ms INTEGER NOT NULL,
        timestamp TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (iteration_id) REFERENCES metric_iterations(id)
      );

      CREATE TABLE IF NOT EXISTS metric_test_results (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        iteration_id TEXT NOT NULL,
        framework TEXT NOT NULL,
        command TEXT NOT NULL,
        total_tests INTEGER NOT NULL,
        passed INTEGER NOT NULL,
        failed INTEGER NOT NULL,
        skipped INTEGER NOT NULL,
        coverage_percent REAL,
        duration_ms INTEGER NOT NULL,
        exit_code INTEGER NOT NULL,
        timestamp TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (iteration_id) REFERENCES metric_iterations(id)
      );

      CREATE TABLE IF NOT EXISTS metric_file_edits (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        iteration_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        operation_type TEXT NOT NULL,
        lines_added INTEGER DEFAULT 0,
        lines_deleted INTEGER DEFAULT 0,
        size_bytes INTEGER DEFAULT 0,
        timestamp TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (iteration_id) REFERENCES metric_iterations(id)
      );

      -- Create indexes for performance
      CREATE INDEX IF NOT EXISTS idx_metric_iterations_session_id ON metric_iterations(session_id);
      CREATE INDEX IF NOT EXISTS idx_metric_tool_calls_iteration_id ON metric_tool_calls(iteration_id);
      CREATE INDEX IF NOT EXISTS idx_metric_llm_usage_iteration_id ON metric_llm_usage(iteration_id);
      CREATE INDEX IF NOT EXISTS idx_metric_git_operations_iteration_id ON metric_git_operations(iteration_id);
      CREATE INDEX IF NOT EXISTS idx_metric_test_results_iteration_id ON metric_test_results(iteration_id);
      CREATE INDEX IF NOT EXISTS idx_metric_file_edits_iteration_id ON metric_file_edits(iteration_id);
      CREATE INDEX IF NOT EXISTS idx_metric_iterations_started_at ON metric_iterations(started_at);
    `);

    this.logger.debug('Initialized metrics schema');
  }

  private prepareStatements(): void {
    this.insertIterationStmt = this.db.prepare(`
      INSERT OR REPLACE INTO metric_iterations (
        id, session_id, iteration_number, started_at, git_sha_start
      ) VALUES (?, ?, ?, ?, ?)
    `);

    this.updateIterationStmt = this.db.prepare(`
      UPDATE metric_iterations SET
        ended_at = ?,
        duration_ms = ?,
        status = ?,
        exit_code = ?,
        git_sha_end = ?,
        files_changed = ?,
        loc_added = ?,
        loc_deleted = ?,
        total_cost_usd = ?
      WHERE id = ?
    `);

    this.insertToolCallStmt = this.db.prepare(`
      INSERT INTO metric_tool_calls (
        iteration_id, tool_name, args_json, started_at, ended_at, 
        duration_ms, success, error_message, cost_usd
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.insertLLMUsageStmt = this.db.prepare(`
      INSERT INTO metric_llm_usage (
        iteration_id, model, prompt_tokens, completion_tokens, total_tokens,
        cost_usd, latency_ms, temperature, top_p, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.insertGitOpStmt = this.db.prepare(`
      INSERT INTO metric_git_operations (
        iteration_id, operation, sha_before, sha_after, files_changed,
        insertions, deletions, conflicted, duration_ms, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.insertTestResultStmt = this.db.prepare(`
      INSERT INTO metric_test_results (
        iteration_id, framework, command, total_tests, passed, failed,
        skipped, coverage_percent, duration_ms, exit_code, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.insertFileEditStmt = this.db.prepare(`
      INSERT INTO metric_file_edits (
        iteration_id, file_path, operation_type, lines_added, lines_deleted, 
        size_bytes, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
  }

  async handle(event: MetricEventTypes): Promise<void> {
    try {
      switch (event.type) {
        case 'iteration_start':
          this.handleIterationStart(event);
          break;
        case 'iteration_end':
          await this.handleIterationEnd(event);
          break;
        case 'tool_call':
          this.handleToolCall(event);
          break;
        case 'llm_usage':
          this.handleLLMUsage(event);
          break;
        case 'git_operation':
          this.handleGitOperation(event);
          break;
        case 'test_result':
          this.handleTestResult(event);
          break;
        case 'file_edit':
          this.handleFileEdit(event);
          break;
        case 'streaming_tool_start':
          // Convert streaming tool start to regular tool_call format
          if ((event as any).data?.tool) {
            this.handleToolCall({
              type: 'tool_call',
              iterationId: (event as any).iterationId || 'unknown',
              sessionId: (event as any).sessionId || (event as any).data?.sessionId,
              timestamp: (event as any).timestamp || new Date().toISOString(),
              data: {
                toolName: (event as any).data.tool,
                args: (event as any).data.args || {},
                startTime: (event as any).timestamp || new Date().toISOString(),
                endTime: (event as any).timestamp || new Date().toISOString(),
                success: true,
                durationMs: 0
              }
            });
          }
          break;
        default:
          this.logger.warn(`Unknown metric event type: ${(event as any).type}`);
      }
    } catch (error) {
      this.logger.error(`Error handling metric event ${(event as any).type}:`, error);
      throw error;
    }
  }

  private handleIterationStart(event: MetricEventTypes): void {
    if (event.type !== 'iteration_start') return;
    
    this.insertIterationStmt.run(
      event.iterationId,
      event.sessionId,
      event.data.iterationNumber,
      event.timestamp,
      event.data.gitSha
    );
  }

  private async handleIterationEnd(event: MetricEventTypes): Promise<void> {
    if (event.type !== 'iteration_end') return;

    // Calculate total cost for this iteration
    const totalCost = this.calculateIterationCost(event.iterationId!);
    
    // Get git diff stats
    const gitStats = await this.getGitStats(event.iterationId!);

    this.updateIterationStmt.run(
      event.timestamp,
      event.data.durationMs,
      event.data.status,
      event.data.exitCode || null,
      gitStats.shaAfter,
      gitStats.filesChanged,
      gitStats.insertions,
      gitStats.deletions,
      totalCost,
      event.iterationId
    );
  }

  private handleToolCall(event: MetricEventTypes): void {
    if (event.type !== 'tool_call') return;

    this.insertToolCallStmt.run(
      event.iterationId,
      event.data.toolName,
      JSON.stringify(event.data.args),
      event.data.startTime,
      event.data.endTime,
      event.data.durationMs,
      event.data.success ? 1 : 0,
      event.data.errorMessage || null,
      event.data.costUsd || 0
    );
  }

  private handleLLMUsage(event: MetricEventTypes): void {
    if (event.type !== 'llm_usage') return;

    this.insertLLMUsageStmt.run(
      event.iterationId,
      event.data.model,
      event.data.promptTokens,
      event.data.completionTokens,
      event.data.totalTokens,
      event.data.costUsd,
      event.data.latencyMs,
      event.data.temperature || null,
      event.data.topP || null,
      event.timestamp
    );
  }

  private handleGitOperation(event: MetricEventTypes): void {
    if (event.type !== 'git_operation') return;

    this.insertGitOpStmt.run(
      event.iterationId,
      event.data.operation,
      event.data.shaBefore || null,
      event.data.shaAfter || null,
      event.data.filesChanged,
      event.data.insertions,
      event.data.deletions,
      event.data.conflicted ? 1 : 0,
      event.data.durationMs,
      event.timestamp
    );
  }

  private handleTestResult(event: MetricEventTypes): void {
    if (event.type !== 'test_result') return;

    this.insertTestResultStmt.run(
      event.iterationId,
      event.data.framework,
      event.data.command,
      event.data.total,
      event.data.passed,
      event.data.failed,
      event.data.skipped,
      event.data.coveragePercent || null,
      event.data.durationMs,
      event.data.exitCode,
      event.timestamp
    );
  }

  private handleFileEdit(event: MetricEventTypes): void {
    if (event.type !== 'file_edit') return;

    this.insertFileEditStmt.run(
      event.iterationId,
      event.data.path,
      event.data.operation,
      event.data.linesAdded || 0,
      event.data.linesDeleted || 0,
      0, // sizeBytes - not available in current event data
      event.timestamp
    );
  }

  private calculateIterationCost(iterationId: string): number {
    const result = this.db.prepare(`
      SELECT 
        COALESCE(SUM(cost_usd), 0) as llm_cost,
        (SELECT COALESCE(SUM(cost_usd), 0) FROM metric_tool_calls WHERE iteration_id = ?) as tool_cost
      FROM metric_llm_usage 
      WHERE iteration_id = ?
    `).get(iterationId, iterationId) as { llm_cost: number; tool_cost: number };

    return result.llm_cost + result.tool_cost;
  }

  private async getGitStats(iterationId: string): Promise<{
    shaAfter: string | null;
    filesChanged: number;
    insertions: number;
    deletions: number;
  }> {
    const result = this.db.prepare(`
      SELECT 
        sha_after,
        SUM(files_changed) as files_changed,
        SUM(insertions) as insertions,
        SUM(deletions) as deletions
      FROM metric_git_operations 
      WHERE iteration_id = ?
      GROUP BY iteration_id
    `).get(iterationId) as any;

    return {
      shaAfter: result?.sha_after || null,
      filesChanged: result?.files_changed || 0,
      insertions: result?.insertions || 0,
      deletions: result?.deletions || 0
    };
  }

  async flush(): Promise<void> {
    // SQLite writes are synchronous, no need to flush
  }

  async close(): Promise<void> {
    this.db.close();
  }

  // Query methods for metrics API
  getAllIterationMetrics(): any[] {
    return this.db.prepare(`
      SELECT 
        i.*,
        COUNT(tc.id) as tool_calls_count,
        AVG(tc.duration_ms) as avg_tool_duration,
        SUM(CASE WHEN tc.success = 0 THEN 1 ELSE 0 END) as tool_failures,
        0 as prompt_tokens,
        0 as completion_tokens,
        0 as total_tokens,
        0 as tests_passed,
        0 as tests_failed,
        0 as total_tests
      FROM metric_iterations i
      LEFT JOIN metric_tool_calls tc ON i.id = tc.iteration_id
      GROUP BY i.id
      ORDER BY i.created_at DESC
    `).all();
  }

  getIterationMetrics(sessionId: string): any[] {
    return this.db.prepare(`
      SELECT 
        i.*,
        COUNT(tc.id) as tool_calls_count,
        AVG(tc.duration_ms) as avg_tool_duration,
        SUM(CASE WHEN tc.success = 0 THEN 1 ELSE 0 END) as tool_failures,
        0 as prompt_tokens,
        0 as completion_tokens,
        0 as total_tokens,
        0 as tests_passed,
        0 as tests_failed,
        0 as total_tests
      FROM metric_iterations i
      LEFT JOIN metric_tool_calls tc ON i.id = tc.iteration_id
      WHERE i.session_id = ?
      GROUP BY i.id
      ORDER BY i.iteration_number
    `).all(sessionId);
  }

  getSessionSummary(sessionId: string): any {
    return this.db.prepare(`
      SELECT 
        COUNT(*) as total_iterations,
        SUM(duration_ms) as total_duration_ms,
        AVG(duration_ms) as avg_duration_ms,
        SUM(files_changed) as total_files_changed,
        SUM(loc_added) as total_loc_added,
        SUM(loc_deleted) as total_loc_deleted,
        SUM(total_cost_usd) as total_cost_usd,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful_iterations,
        MIN(started_at) as first_iteration,
        MAX(ended_at) as last_iteration
      FROM metric_iterations
      WHERE session_id = ?
    `).get(sessionId);
  }

  getToolUsageStats(sessionId: string): any[] {
    return this.db.prepare(`
      SELECT 
        tc.tool_name,
        COUNT(*) as call_count,
        AVG(tc.duration_ms) as avg_duration_ms,
        SUM(tc.duration_ms) as total_duration_ms,
        SUM(CASE WHEN tc.success = 0 THEN 1 ELSE 0 END) as failure_count,
        SUM(tc.cost_usd) as total_cost_usd
      FROM metric_tool_calls tc
      JOIN metric_iterations i ON tc.iteration_id = i.id
      WHERE i.session_id = ?
      GROUP BY tc.tool_name
      ORDER BY call_count DESC
    `).all(sessionId);
  }

  getFileEditStats(sessionId: string): any[] {
    return this.db.prepare(`
      SELECT 
        fe.file_path,
        COUNT(*) as edit_count,
        SUM(fe.lines_added) as total_lines_added,
        SUM(fe.lines_deleted) as total_lines_deleted,
        fe.operation_type,
        MAX(i.started_at) as last_modified
      FROM metric_file_edits fe
      JOIN metric_iterations i ON fe.iteration_id = i.id
      WHERE i.session_id = ?
      GROUP BY fe.file_path, fe.operation_type
      ORDER BY edit_count DESC, last_modified DESC
    `).all(sessionId);
  }
}

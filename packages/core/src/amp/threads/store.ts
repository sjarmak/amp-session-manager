import Database from 'better-sqlite3';
import { Logger } from '../../utils/logger';
import type { 
  NormalizedThread, 
  ThreadMessage, 
  ThreadToolCall, 
  ThreadDiff, 
  ThreadMetric,
  ThreadStore as IThreadStore 
} from '@ampsm/types';

export interface ThreadUpsertOptions {
  skipIfNewer?: boolean;
}

export class ThreadStore implements IThreadStore {
  private db: Database.Database;
  private logger: Logger;

  constructor(sessionStore: any, logger: Logger) {
    // Handle both SessionStore instances and raw Database instances
    this.db = sessionStore.db ? sessionStore.db : sessionStore;
    this.logger = logger;
    this.initTables();
  }

  private initTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS threads (
        id TEXT PRIMARY KEY,
        url TEXT UNIQUE NOT NULL,
        repo TEXT,
        branch TEXT,
        latest_commit_sha TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_sync_at TEXT,
        source TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL REFERENCES threads(id),
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        idx INTEGER NOT NULL,
        UNIQUE(thread_id, idx)
      );

      CREATE TABLE IF NOT EXISTS tool_calls (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL REFERENCES threads(id),
        message_id TEXT REFERENCES messages(id),
        tool_name TEXT NOT NULL,
        arguments_json TEXT NOT NULL,
        started_at TEXT,
        finished_at TEXT,
        status TEXT,
        result_json TEXT
      );

      CREATE TABLE IF NOT EXISTS diffs (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL REFERENCES threads(id),
        message_id TEXT REFERENCES messages(id),
        file_path TEXT NOT NULL,
        patch TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        thread_id TEXT NOT NULL REFERENCES threads(id),
        at TEXT NOT NULL,
        input_tokens INTEGER,
        output_tokens INTEGER,
        cache_creation_input_tokens INTEGER,
        cache_read_input_tokens INTEGER,
        inference_duration_ms INTEGER,
        tokens_per_second REAL,
        active_tool_count INTEGER,
        file_tracker_records INTEGER,
        service_tier TEXT,
        raw_event_json TEXT NOT NULL
      );

      -- Indexes for performance
      CREATE INDEX IF NOT EXISTS idx_threads_updated_at ON threads(updated_at);
      CREATE INDEX IF NOT EXISTS idx_threads_source ON threads(source);
      CREATE INDEX IF NOT EXISTS idx_messages_thread_id ON messages(thread_id);
      CREATE INDEX IF NOT EXISTS idx_messages_idx ON messages(idx);
      CREATE INDEX IF NOT EXISTS idx_tool_calls_thread_id ON tool_calls(thread_id);
      CREATE INDEX IF NOT EXISTS idx_diffs_thread_id ON diffs(thread_id);
      CREATE INDEX IF NOT EXISTS idx_metrics_thread_id ON metrics(thread_id);
      CREATE INDEX IF NOT EXISTS idx_metrics_at ON metrics(at);
    `);

    this.logger.debug('Thread database schema initialized');
  }

  async upsertThread(thread: Partial<NormalizedThread> & { id: string }, options: ThreadUpsertOptions = {}): Promise<void> {
    const { skipIfNewer = true } = options;
    
    // Check if thread exists and is newer
    if (skipIfNewer) {
      const existing = this.getThread(thread.id);
      if (existing && thread.updated_at && existing.updated_at > thread.updated_at) {
        this.logger.debug(`Skipping thread ${thread.id} - existing data is newer`);
        return;
      }
    }

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO threads (
        id, url, repo, branch, latest_commit_sha, created_at, updated_at, last_sync_at, source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = new Date().toISOString();
    stmt.run(
      thread.id,
      thread.url || `https://ampcode.com/threads/${thread.id}`,
      thread.repo || null,
      thread.branch || null,
      thread.latest_commit_sha || null,
      thread.created_at || now,
      thread.updated_at || now,
      now, // last_sync_at
      thread.source || 'web'
    );

    this.logger.debug(`Upserted thread ${thread.id}`);
  }

  async upsertMessage(message: ThreadMessage): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO messages (id, thread_id, role, content, created_at, idx)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      message.id,
      message.thread_id,
      message.role,
      message.content,
      message.created_at,
      message.idx
    );
  }

  async upsertMessages(messages: ThreadMessage[]): Promise<void> {
    const transaction = this.db.transaction((msgs: ThreadMessage[]) => {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO messages (id, thread_id, role, content, created_at, idx)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (const message of msgs) {
        stmt.run(
          message.id,
          message.thread_id,
          message.role,
          message.content,
          message.created_at,
          message.idx
        );
      }
    });

    transaction(messages);
    this.logger.debug(`Upserted ${messages.length} messages for thread ${messages[0]?.thread_id}`);
  }

  async upsertToolCall(toolCall: ThreadToolCall): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO tool_calls (
        id, thread_id, message_id, tool_name, arguments_json, started_at, finished_at, status, result_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      toolCall.id,
      toolCall.thread_id,
      toolCall.message_id || null,
      toolCall.tool_name,
      toolCall.arguments_json,
      toolCall.started_at || null,
      toolCall.finished_at || null,
      toolCall.status || null,
      toolCall.result_json || null
    );
  }

  async upsertToolCalls(toolCalls: ThreadToolCall[]): Promise<void> {
    if (toolCalls.length === 0) return;

    const transaction = this.db.transaction((calls: ThreadToolCall[]) => {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO tool_calls (
          id, thread_id, message_id, tool_name, arguments_json, started_at, finished_at, status, result_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const toolCall of calls) {
        stmt.run(
          toolCall.id,
          toolCall.thread_id,
          toolCall.message_id || null,
          toolCall.tool_name,
          toolCall.arguments_json,
          toolCall.started_at || null,
          toolCall.finished_at || null,
          toolCall.status || null,
          toolCall.result_json || null
        );
      }
    });

    transaction(toolCalls);
    this.logger.debug(`Upserted ${toolCalls.length} tool calls for thread ${toolCalls[0]?.thread_id}`);
  }

  async upsertDiff(diff: ThreadDiff): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO diffs (id, thread_id, message_id, file_path, patch, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      diff.id,
      diff.thread_id,
      diff.message_id || null,
      diff.file_path,
      diff.patch,
      diff.created_at
    );
  }

  async upsertDiffs(diffs: ThreadDiff[]): Promise<void> {
    if (diffs.length === 0) return;

    const transaction = this.db.transaction((diffList: ThreadDiff[]) => {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO diffs (id, thread_id, message_id, file_path, patch, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (const diff of diffList) {
        stmt.run(
          diff.id,
          diff.thread_id,
          diff.message_id || null,
          diff.file_path,
          diff.patch,
          diff.created_at
        );
      }
    });

    transaction(diffs);
    this.logger.debug(`Upserted ${diffs.length} diffs for thread ${diffs[0]?.thread_id}`);
  }

  async insertMetric(metric: Omit<ThreadMetric, 'id'>): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO metrics (
        thread_id, at, input_tokens, output_tokens, cache_creation_input_tokens,
        cache_read_input_tokens, inference_duration_ms, tokens_per_second,
        active_tool_count, file_tracker_records, service_tier, raw_event_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      metric.thread_id,
      metric.at,
      metric.input_tokens || null,
      metric.output_tokens || null,
      metric.cache_creation_input_tokens || null,
      metric.cache_read_input_tokens || null,
      metric.inference_duration_ms || null,
      metric.tokens_per_second || null,
      metric.active_tool_count || null,
      metric.file_tracker_records || null,
      metric.service_tier || null,
      metric.raw_event_json
    );
  }

  async insertMetrics(metrics: Array<Omit<ThreadMetric, 'id'>>): Promise<void> {
    if (metrics.length === 0) return;

    const transaction = this.db.transaction((metricsList: Array<Omit<ThreadMetric, 'id'>>) => {
      const stmt = this.db.prepare(`
        INSERT INTO metrics (
          thread_id, at, input_tokens, output_tokens, cache_creation_input_tokens,
          cache_read_input_tokens, inference_duration_ms, tokens_per_second,
          active_tool_count, file_tracker_records, service_tier, raw_event_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const metric of metricsList) {
        stmt.run(
          metric.thread_id,
          metric.at,
          metric.input_tokens || null,
          metric.output_tokens || null,
          metric.cache_creation_input_tokens || null,
          metric.cache_read_input_tokens || null,
          metric.inference_duration_ms || null,
          metric.tokens_per_second || null,
          metric.active_tool_count || null,
          metric.file_tracker_records || null,
          metric.service_tier || null,
          metric.raw_event_json
        );
      }
    });

    transaction(metrics);
    this.logger.debug(`Inserted ${metrics.length} metrics for thread ${metrics[0]?.thread_id}`);
  }

  getThread(id: string): NormalizedThread | null {
    const stmt = this.db.prepare('SELECT * FROM threads WHERE id = ?');
    const row = stmt.get(id) as any;
    if (!row) return null;

    return {
      id: row.id,
      url: row.url,
      repo: row.repo,
      branch: row.branch,
      latest_commit_sha: row.latest_commit_sha,
      created_at: row.created_at,
      updated_at: row.updated_at,
      last_sync_at: row.last_sync_at,
      source: row.source,
      messages: [],
      tool_calls: [],
      diffs: [],
      metrics: []
    };
  }

  getAllThreads(limit?: number): NormalizedThread[] {
    let sql = 'SELECT * FROM threads ORDER BY updated_at DESC';
    if (limit) sql += ' LIMIT ?';

    const stmt = this.db.prepare(sql);
    const rows = limit ? stmt.all(limit) : stmt.all();

    return (rows as any[]).map(row => ({
      id: row.id,
      url: row.url,
      repo: row.repo,
      branch: row.branch,
      latest_commit_sha: row.latest_commit_sha,
      created_at: row.created_at,
      updated_at: row.updated_at,
      last_sync_at: row.last_sync_at,
      source: row.source,
      messages: [],
      tool_calls: [],
      diffs: [],
      metrics: []
    }));
  }

  getThreadMessages(threadId: string): ThreadMessage[] {
    const stmt = this.db.prepare('SELECT * FROM messages WHERE thread_id = ? ORDER BY idx ASC');
    return stmt.all(threadId) as ThreadMessage[];
  }

  getThreadToolCalls(threadId: string): ThreadToolCall[] {
    const stmt = this.db.prepare('SELECT * FROM tool_calls WHERE thread_id = ? ORDER BY started_at ASC');
    return stmt.all(threadId) as ThreadToolCall[];
  }

  getThreadDiffs(threadId: string): ThreadDiff[] {
    const stmt = this.db.prepare('SELECT * FROM diffs WHERE thread_id = ? ORDER BY created_at ASC');
    return stmt.all(threadId) as ThreadDiff[];
  }

  getThreadMetrics(threadId: string): ThreadMetric[] {
    const stmt = this.db.prepare('SELECT * FROM metrics WHERE thread_id = ? ORDER BY at ASC');
    return stmt.all(threadId) as ThreadMetric[];
  }

  getFullThread(id: string): NormalizedThread | null {
    const thread = this.getThread(id);
    if (!thread) return null;

    thread.messages = this.getThreadMessages(id);
    thread.tool_calls = this.getThreadToolCalls(id);
    thread.diffs = this.getThreadDiffs(id);
    thread.metrics = this.getThreadMetrics(id);

    return thread;
  }

  searchThreads(query: string, limit = 50): Array<{
    id: string;
    url: string;
    repo: string | null;
    branch: string | null;
    updated_at: string;
    message_count: number;
    tool_call_count: number;
    diff_count: number;
  }> {
    const stmt = this.db.prepare(`
      SELECT 
        t.id, t.url, t.repo, t.branch, t.updated_at,
        COUNT(DISTINCT m.id) as message_count,
        COUNT(DISTINCT tc.id) as tool_call_count,
        COUNT(DISTINCT d.id) as diff_count
      FROM threads t
      LEFT JOIN messages m ON t.id = m.thread_id
      LEFT JOIN tool_calls tc ON t.id = tc.thread_id
      LEFT JOIN diffs d ON t.id = d.thread_id
      WHERE t.id LIKE ? OR t.repo LIKE ? OR t.branch LIKE ? OR m.content LIKE ?
      GROUP BY t.id
      ORDER BY t.updated_at DESC
      LIMIT ?
    `);

    const searchPattern = `%${query}%`;
    return stmt.all(searchPattern, searchPattern, searchPattern, searchPattern, limit) as any[];
  }

  getRecentThreads(hours = 24, limit = 20): NormalizedThread[] {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const stmt = this.db.prepare(`
      SELECT * FROM threads 
      WHERE updated_at > ? 
      ORDER BY updated_at DESC 
      LIMIT ?
    `);
    
    const rows = stmt.all(since, limit) as any[];
    return rows.map(row => ({
      id: row.id,
      url: row.url,
      repo: row.repo,
      branch: row.branch,
      latest_commit_sha: row.latest_commit_sha,
      created_at: row.created_at,
      updated_at: row.updated_at,
      last_sync_at: row.last_sync_at,
      source: row.source,
      messages: [],
      tool_calls: [],
      diffs: [],
      metrics: []
    }));
  }

  deleteThread(id: string): void {
    const transaction = this.db.transaction(() => {
      this.db.prepare('DELETE FROM metrics WHERE thread_id = ?').run(id);
      this.db.prepare('DELETE FROM diffs WHERE thread_id = ?').run(id);
      this.db.prepare('DELETE FROM tool_calls WHERE thread_id = ?').run(id);
      this.db.prepare('DELETE FROM messages WHERE thread_id = ?').run(id);
      this.db.prepare('DELETE FROM threads WHERE id = ?').run(id);
    });

    transaction();
    this.logger.debug(`Deleted thread ${id}`);
  }
}

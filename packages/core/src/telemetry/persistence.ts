import type Database from 'better-sqlite3';
import type { AmpTraceEvent, SessionMetrics, EvalResult } from './events.js';

export class TelemetryPersistence {
  constructor(private db: Database.Database) {}
  
  // Initialize telemetry tables
  initTables(): void {
    // Telemetry events table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS telemetry_events (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        parent_id TEXT,
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        ts_start INTEGER NOT NULL,
        ts_end INTEGER,
        status TEXT NOT NULL,
        attrs TEXT, -- JSON
        error_message TEXT,
        stack_trace TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
      );
    `);
    
    // Create indexes for performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_telemetry_session_id 
      ON telemetry_events(session_id);
      
      CREATE INDEX IF NOT EXISTS idx_telemetry_type 
      ON telemetry_events(type);
      
      CREATE INDEX IF NOT EXISTS idx_telemetry_ts_start 
      ON telemetry_events(ts_start);
    `);
    
    // Evaluation results table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS eval_results (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        iteration_id TEXT,
        name TEXT NOT NULL,
        score REAL NOT NULL,
        passed BOOLEAN NOT NULL,
        duration INTEGER,
        details TEXT, -- JSON
        error_message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
      );
    `);
    
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_eval_session_id 
      ON eval_results(session_id);
    `);
    
    // Session metrics cache table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS session_metrics (
        session_id TEXT PRIMARY KEY,
        total_cost REAL DEFAULT 0,
        total_tokens_in INTEGER DEFAULT 0,
        total_tokens_out INTEGER DEFAULT 0,
        iteration_count INTEGER DEFAULT 0,
        avg_iteration_cost REAL DEFAULT 0,
        avg_iteration_tokens REAL DEFAULT 0,
        duration INTEGER DEFAULT 0,
        success_rate REAL DEFAULT 0,
        error_count INTEGER DEFAULT 0,
        last_updated INTEGER,
        FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
      );
    `);
  }
  
  // Store telemetry event
  saveEvent(event: AmpTraceEvent): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO telemetry_events 
      (id, session_id, parent_id, type, name, ts_start, ts_end, status, attrs, error_message, stack_trace)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      event.id,
      event.sessionId,
      event.parentId || null,
      event.type,
      event.name,
      event.tsStart,
      event.tsEnd || null,
      event.status,
      JSON.stringify(event.attrs),
      event.errorMessage || null,
      event.stackTrace || null
    );
  }
  
  // Get events for a session
  getSessionEvents(sessionId: string): AmpTraceEvent[] {
    const stmt = this.db.prepare(`
      SELECT * FROM telemetry_events 
      WHERE session_id = ? 
      ORDER BY ts_start ASC
    `);
    
    const rows = stmt.all(sessionId) as any[];
    
    return rows.map(row => ({
      id: row.id,
      sessionId: row.session_id,
      parentId: row.parent_id,
      type: row.type,
      name: row.name,
      tsStart: row.ts_start,
      tsEnd: row.ts_end,
      status: row.status,
      attrs: JSON.parse(row.attrs || '{}'),
      errorMessage: row.error_message,
      stackTrace: row.stack_trace
    }));
  }
  
  // Save evaluation result
  saveEvalResult(result: EvalResult & { sessionId: string; iterationId?: string }): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO eval_results 
      (id, session_id, iteration_id, name, score, passed, duration, details, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      result.id,
      result.sessionId,
      result.iterationId || null,
      result.name,
      result.score,
      result.passed ? 1 : 0,
      result.duration,
      JSON.stringify(result.details || {}),
      result.error || null
    );
  }
  
  // Get evaluation results for a session
  getSessionEvals(sessionId: string): (EvalResult & { sessionId: string; iterationId?: string })[] {
    const stmt = this.db.prepare(`
      SELECT * FROM eval_results 
      WHERE session_id = ? 
      ORDER BY created_at DESC
    `);
    
    const rows = stmt.all(sessionId) as any[];
    
    return rows.map(row => ({
      id: row.id,
      sessionId: row.session_id,
      iterationId: row.iteration_id,
      name: row.name,
      score: row.score,
      passed: row.passed === 1,
      duration: row.duration,
      details: JSON.parse(row.details || '{}'),
      error: row.error_message
    }));
  }
  
  // Calculate and cache session metrics
  calculateSessionMetrics(sessionId: string): SessionMetrics {
    const events = this.getSessionEvents(sessionId);
    const evals = this.getSessionEvals(sessionId);
    
    let totalCost = 0;
    let totalTokensIn = 0;
    let totalTokensOut = 0;
    let errorCount = 0;
    let successCount = 0;
    
    const agentEvents = events.filter(e => e.type === 'agent');
    
    for (const event of agentEvents) {
      if (event.status === 'error') errorCount++;
      else if (event.status === 'success') successCount++;
      
      if (event.attrs.costUSD) totalCost += event.attrs.costUSD;
      if (event.attrs.tokensIn) totalTokensIn += event.attrs.tokensIn;
      if (event.attrs.tokensOut) totalTokensOut += event.attrs.tokensOut;
    }
    
    const totalEvents = agentEvents.length;
    const iterationCount = agentEvents.length; // Approximate
    const successRate = totalEvents > 0 ? successCount / totalEvents : 0;
    const avgIterationCost = iterationCount > 0 ? totalCost / iterationCount : 0;
    const avgIterationTokens = iterationCount > 0 ? (totalTokensIn + totalTokensOut) / iterationCount : 0;
    
    // Calculate duration from first to last event
    const firstEvent = events[0];
    const lastEvent = events[events.length - 1];
    const duration = firstEvent && lastEvent ? lastEvent.tsEnd || lastEvent.tsStart - firstEvent.tsStart : 0;
    
    const metrics: SessionMetrics = {
      sessionId,
      totalCost,
      totalTokensIn,
      totalTokensOut,
      iterationCount,
      avgIterationCost,
      avgIterationTokens,
      duration,
      successRate,
      errorCount,
      lastUpdated: Date.now()
    };
    
    // Cache the metrics
    this.saveSessionMetrics(metrics);
    
    return metrics;
  }
  
  // Save session metrics to cache
  private saveSessionMetrics(metrics: SessionMetrics): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO session_metrics 
      (session_id, total_cost, total_tokens_in, total_tokens_out, iteration_count,
       avg_iteration_cost, avg_iteration_tokens, duration, success_rate, error_count, last_updated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      metrics.sessionId,
      metrics.totalCost,
      metrics.totalTokensIn,
      metrics.totalTokensOut,
      metrics.iterationCount,
      metrics.avgIterationCost,
      metrics.avgIterationTokens,
      metrics.duration,
      metrics.successRate,
      metrics.errorCount,
      metrics.lastUpdated
    );
  }
  
  // Get cached session metrics
  getSessionMetrics(sessionId: string): SessionMetrics | null {
    const stmt = this.db.prepare(`
      SELECT * FROM session_metrics 
      WHERE session_id = ?
    `);
    
    const row = stmt.get(sessionId) as any;
    if (!row) return null;
    
    return {
      sessionId: row.session_id,
      totalCost: row.total_cost,
      totalTokensIn: row.total_tokens_in,
      totalTokensOut: row.total_tokens_out,
      iterationCount: row.iteration_count,
      avgIterationCost: row.avg_iteration_cost,
      avgIterationTokens: row.avg_iteration_tokens,
      duration: row.duration,
      successRate: row.success_rate,
      errorCount: row.error_count,
      lastUpdated: row.last_updated
    };
  }
  
  // Clean up old telemetry data (older than 30 days)
  cleanupOldData(): void {
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    
    this.db.prepare(`
      DELETE FROM telemetry_events 
      WHERE created_at < datetime(?, 'unixepoch', 'localtime')
    `).run(thirtyDaysAgo / 1000);
    
    this.db.prepare(`
      DELETE FROM eval_results 
      WHERE created_at < datetime(?, 'unixepoch', 'localtime')
    `).run(thirtyDaysAgo / 1000);
  }
}

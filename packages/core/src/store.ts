import Database from 'better-sqlite3';
import type { Session, IterationRecord, SessionCreateOptions } from '@ampsm/types';
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

  close() {
    this.db.close();
  }
}

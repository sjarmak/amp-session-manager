import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { Logger } from '../utils/logger';

export interface MigrationOptions {
  dryRun?: boolean;
  logger?: Logger;
}

export class SessionThreadRelationshipMigration {
  private db: Database.Database;
  private logger: Logger;

  constructor(database: Database.Database, logger?: Logger) {
    this.db = database;
    this.logger = logger || new Logger('migration');
  }

  /**
   * Execute the migration to create new session-thread relationship tables
   */
  async execute(options: MigrationOptions = {}): Promise<void> {
    const { dryRun = false } = options;
    
    this.logger.info('Starting session-thread relationship migration');

    if (dryRun) {
      this.logger.info('DRY RUN MODE - No changes will be made');
      await this.validateMigration();
      return;
    }

    // Begin transaction for atomic migration
    const transaction = this.db.transaction(() => {
      this.createNewTables();
      this.migrateExistingData();
      this.addIndexes();
      this.updateMigrationVersion();
    });

    try {
      transaction();
      this.logger.info('Migration completed successfully');
    } catch (error) {
      this.logger.error('Migration failed:', error);
      throw error;
    }
  }

  /**
   * Create the new threads and thread_messages tables
   */
  private createNewTables(): void {
    this.logger.info('Creating new tables: threads, thread_messages');

    this.db.exec(`
      -- New threads table for session-specific thread management
      CREATE TABLE IF NOT EXISTS threads (
        id TEXT PRIMARY KEY,
        sessionId TEXT NOT NULL,
        name TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        FOREIGN KEY(sessionId) REFERENCES sessions(id) ON DELETE CASCADE
      );

      -- New thread_messages table for structured message storage
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
  }

  /**
   * Migrate existing session.threadId values to new threads table
   */
  private migrateExistingData(): void {
    this.logger.info('Migrating existing session threadId data');

    // Find sessions with existing threadId values
    const sessionsWithThreadIds = this.db.prepare(`
      SELECT id, name, threadId, createdAt 
      FROM sessions 
      WHERE threadId IS NOT NULL AND threadId != ''
    `).all() as Array<{
      id: string;
      name: string;
      threadId: string;
      createdAt: string;
    }>;

    this.logger.info(`Found ${sessionsWithThreadIds.length} sessions with existing threadId values`);

    if (sessionsWithThreadIds.length === 0) {
      return;
    }

    // Insert statements for batch migration
    const insertThreadStmt = this.db.prepare(`
      INSERT OR IGNORE INTO threads (id, sessionId, name, createdAt, updatedAt, status)
      VALUES (?, ?, ?, ?, ?, 'active')
    `);

    const insertMessageStmt = this.db.prepare(`
      INSERT OR IGNORE INTO thread_messages (id, threadId, role, content, createdAt, idx)
      VALUES (?, ?, 'system', ?, ?, 0)
    `);

    // Migrate each session's thread data
    for (const session of sessionsWithThreadIds) {
      const threadId = randomUUID();
      const now = new Date().toISOString();
      
      // Create thread record
      insertThreadStmt.run(
        threadId,
        session.id,
        `Migrated Thread for ${session.name}`,
        session.createdAt,
        now
      );

      // Create initial system message indicating migration
      insertMessageStmt.run(
        randomUUID(),
        threadId,
        `Thread migrated from legacy threadId: ${session.threadId}`,
        session.createdAt
      );

      this.logger.debug(`Migrated thread for session ${session.id}: ${session.threadId} -> ${threadId}`);
    }

    this.logger.info(`Successfully migrated ${sessionsWithThreadIds.length} thread relationships`);
  }

  /**
   * Add performance indexes for the new tables
   */
  private addIndexes(): void {
    this.logger.info('Adding performance indexes');

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

  /**
   * Update migration version tracking
   */
  private updateMigrationVersion(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
      
      INSERT OR REPLACE INTO migrations (version, name, applied_at)
      VALUES (1, 'session-thread-relationship', datetime('now'));
    `);
  }

  /**
   * Validate migration can be executed safely
   */
  private async validateMigration(): Promise<void> {
    this.logger.info('Validating migration prerequisites');

    // Check if sessions table exists
    const sessionsTableExists = this.db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='sessions'
    `).get();

    if (!sessionsTableExists) {
      throw new Error('Sessions table does not exist - cannot proceed with migration');
    }

    // Check for any existing threads/thread_messages tables
    const threadsExists = this.db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='threads'
    `).get();

    const threadMessagesExists = this.db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='thread_messages'
    `).get();

    if (threadsExists || threadMessagesExists) {
      this.logger.warn('New tables already exist - migration may be partially applied');
    }

    // Count sessions to migrate
    const sessionsToMigrate = this.db.prepare(`
      SELECT COUNT(*) as count 
      FROM sessions 
      WHERE threadId IS NOT NULL AND threadId != ''
    `).get() as { count: number };

    this.logger.info(`Migration validation complete - ${sessionsToMigrate.count} sessions to migrate`);
  }

  /**
   * Rollback migration (for testing/emergency use)
   */
  async rollback(): Promise<void> {
    this.logger.warn('Rolling back session-thread relationship migration');

    const rollbackTransaction = this.db.transaction(() => {
      this.db.exec('DROP INDEX IF EXISTS idx_threads_session_id');
      this.db.exec('DROP INDEX IF EXISTS idx_threads_status');
      this.db.exec('DROP INDEX IF EXISTS idx_threads_created_at');
      this.db.exec('DROP INDEX IF EXISTS idx_threads_updated_at');
      this.db.exec('DROP INDEX IF EXISTS idx_thread_messages_thread_id');
      this.db.exec('DROP INDEX IF EXISTS idx_thread_messages_created_at');
      this.db.exec('DROP INDEX IF EXISTS idx_thread_messages_role');
      this.db.exec('DROP INDEX IF EXISTS idx_thread_messages_idx');
      
      this.db.exec('DROP TABLE IF EXISTS thread_messages');
      this.db.exec('DROP TABLE IF EXISTS threads');
      
      this.db.exec('DELETE FROM migrations WHERE version = 1 AND name = "session-thread-relationship"');
    });

    try {
      rollbackTransaction();
      this.logger.info('Migration rollback completed successfully');
    } catch (error) {
      this.logger.error('Rollback failed:', error);
      throw error;
    }
  }
}

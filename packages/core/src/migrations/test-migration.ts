import { SessionStore } from '../store';
import { SessionThreadRelationshipMigration } from './001-session-thread-relationship';
import { Logger } from '../utils/logger';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

export class MigrationTester {
  private logger: Logger;
  private testDbPath: string;
  private backupDbPath?: string;

  constructor() {
    this.logger = new Logger('migration-test');
    this.testDbPath = path.join(process.cwd(), 'test-migration.db');
  }

  /**
   * Create a test database with some sample data to test migration
   */
  async createTestData(): Promise<SessionStore> {
    // Remove existing test database
    if (fs.existsSync(this.testDbPath)) {
      fs.unlinkSync(this.testDbPath);
    }

    this.logger.info('Creating test database with sample data');
    
    const store = new SessionStore(this.testDbPath);
    
    // Create some test sessions with threadId values
    const testSessions = [
      {
        name: 'Test Session 1',
        ampPrompt: 'Implement feature A',
        repoRoot: '/tmp/test-repo-1',
        threadId: 'T-12345-abcd-ef01',
      },
      {
        name: 'Test Session 2',
        ampPrompt: 'Fix bug B',
        repoRoot: '/tmp/test-repo-2',
        threadId: 'T-67890-ghij-kl23',
      },
      {
        name: 'Test Session 3',
        ampPrompt: 'Refactor module C',
        repoRoot: '/tmp/test-repo-3',
        threadId: null, // No threadId to test handling of null values
      },
      {
        name: 'Test Session 4',
        ampPrompt: 'Add tests',
        repoRoot: '/tmp/test-repo-4',
        threadId: '', // Empty threadId to test handling of empty strings
      }
    ];

    for (const session of testSessions) {
      store.createSession({
        name: session.name,
        ampPrompt: session.ampPrompt,
        repoRoot: session.repoRoot,
        threadId: session.threadId ?? undefined,
      });
    }

    // Add some iterations and tool calls for completeness
    const sessions = store.getAllSessions();
    for (let i = 0; i < sessions.length; i++) {
      const session = sessions[i];
      
      // Add an iteration
      const iteration = store.createIteration(session.id);
      store.updateIteration(iteration.id, {
        commitSha: 'main-abc123',
        endTime: new Date().toISOString(),
        testResult: 'pass'
      });
      
      // Add some tool calls
      store.saveToolCall({
        id: randomUUID(),
        sessionId: session.id,
        iterationId: iteration.id,
        timestamp: new Date().toISOString(),
        toolName: 'edit_file',
        argsJson: JSON.stringify({ path: '/test/file.txt', content: 'test' }),
        success: true,
        durationMs: 100,
      });
    }

    this.logger.info(`Created ${sessions.length} test sessions`);
    return store;
  }

  /**
   * Test the migration on a copy of existing database
   */
  async testWithExistingDatabase(existingDbPath: string): Promise<void> {
    if (!fs.existsSync(existingDbPath)) {
      throw new Error(`Existing database not found: ${existingDbPath}`);
    }

    this.backupDbPath = `${existingDbPath}.backup-${Date.now()}`;
    
    this.logger.info(`Creating backup of existing database: ${this.backupDbPath}`);
    fs.copyFileSync(existingDbPath, this.backupDbPath);

    // Copy to test path for testing
    fs.copyFileSync(existingDbPath, this.testDbPath);
    
    this.logger.info('Testing migration on copy of existing database');
    await this.runMigrationTest();
  }

  /**
   * Run comprehensive migration test
   */
  async runMigrationTest(): Promise<void> {
    let store: SessionStore | null = null;

    try {
      store = new SessionStore(this.testDbPath);
      
      // Gather pre-migration state
      const preMigrationSessions = store.getAllSessions();
      const sessionsWithThreadIds = preMigrationSessions.filter(s => s.threadId && s.threadId !== '');
      
      this.logger.info(`Pre-migration state:`);
      this.logger.info(`- Total sessions: ${preMigrationSessions.length}`);
      this.logger.info(`- Sessions with threadId: ${sessionsWithThreadIds.length}`);

      // Validate tables exist
      this.validatePreMigrationState(store);

      // Run dry run first
      this.logger.info('Running dry run migration...');
      const migration = new SessionThreadRelationshipMigration(store.db, this.logger);
      await migration.execute({ dryRun: true });

      // Run actual migration
      this.logger.info('Running actual migration...');
      await migration.execute({ dryRun: false });

      // Validate post-migration state
      this.validatePostMigrationState(store);

      // Test new functionality
      this.testNewThreadRelationshipFunctionality(store);

      this.logger.info('✅ Migration test completed successfully!');

    } catch (error) {
      this.logger.error('❌ Migration test failed:', error);
      throw error;
    } finally {
      if (store) {
        store.close();
      }
    }
  }

  private validatePreMigrationState(store: SessionStore): void {
    const db = store.db;
    
    // Check that sessions table exists
    const sessionsTable = db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'
    `).get();
    
    if (!sessionsTable) {
      throw new Error('Sessions table does not exist');
    }

    this.logger.info('✅ Pre-migration validation passed');
  }

  private validatePostMigrationState(store: SessionStore): void {
    const db = store.db;

    // Check that new tables were created
    const threadsTable = db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='threads'
    `).get();

    const threadMessagesTable = db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='thread_messages'
    `).get();

    if (!threadsTable || !threadMessagesTable) {
      throw new Error('New thread tables were not created');
    }

    // Check that indexes were created
    const expectedIndexes = [
      'idx_threads_session_id',
      'idx_threads_status', 
      'idx_thread_messages_thread_id',
      'idx_thread_messages_role'
    ];

    for (const indexName of expectedIndexes) {
      const index = db.prepare(`
        SELECT name FROM sqlite_master WHERE type='index' AND name=?
      `).get(indexName);

      if (!index) {
        throw new Error(`Index ${indexName} was not created`);
      }
    }

    // Check migration was recorded
    const migration = db.prepare(`
      SELECT * FROM migrations WHERE version = 1 AND name = 'session-thread-relationship'
    `).get();

    if (!migration) {
      throw new Error('Migration was not recorded in migrations table');
    }

    // Validate migrated data
    const threadsCount = db.prepare('SELECT COUNT(*) as count FROM threads').get() as { count: number };
    const messagesCount = db.prepare('SELECT COUNT(*) as count FROM thread_messages').get() as { count: number };

    this.logger.info(`Post-migration state:`);
    this.logger.info(`- Threads created: ${threadsCount.count}`);
    this.logger.info(`- Thread messages created: ${messagesCount.count}`);

    this.logger.info('✅ Post-migration validation passed');
  }

  private testNewThreadRelationshipFunctionality(store: SessionStore): void {
    this.logger.info('Testing new thread relationship functionality...');

    const sessions = store.getAllSessions();
    if (sessions.length === 0) {
      this.logger.warn('No sessions found for testing');
      return;
    }

    const testSession = sessions[0];

    // Test creating a new thread
    const threadId = store.createThread(testSession.id, 'Test Thread');
    this.logger.info(`✅ Created new thread: ${threadId}`);

    // Test adding messages
    const userMessageId = store.addThreadMessage(threadId, 'user', 'Hello, how can you help?');
    const assistantMessageId = store.addThreadMessage(threadId, 'assistant', 'I can help you with coding tasks.');
    this.logger.info(`✅ Added messages: ${userMessageId}, ${assistantMessageId}`);

    // Test retrieving thread messages
    const messages = store.getThreadMessages(threadId);
    if (messages.length !== 2) {
      throw new Error(`Expected 2 messages, got ${messages.length}`);
    }
    this.logger.info(`✅ Retrieved ${messages.length} messages`);

    // Test getting session threads
    const sessionThreads = store.getSessionThreads(testSession.id);
    const hasNewThread = sessionThreads.some(t => t.id === threadId);
    if (!hasNewThread) {
      throw new Error('New thread not found in session threads');
    }
    this.logger.info(`✅ Retrieved ${sessionThreads.length} threads for session`);

    // Test thread deletion
    store.deleteThread(threadId);
    const remainingThreads = store.getSessionThreads(testSession.id);
    const threadStillExists = remainingThreads.some(t => t.id === threadId);
    if (threadStillExists) {
      throw new Error('Thread was not deleted properly');
    }
    this.logger.info('✅ Thread deletion successful');

    this.logger.info('✅ All thread relationship functionality tests passed');
  }

  /**
   * Clean up test files
   */
  cleanup(): void {
    if (fs.existsSync(this.testDbPath)) {
      fs.unlinkSync(this.testDbPath);
      this.logger.info('Cleaned up test database');
    }
  }

  /**
   * Restore backup if needed
   */
  restoreBackup(originalPath: string): void {
    if (this.backupDbPath && fs.existsSync(this.backupDbPath)) {
      fs.copyFileSync(this.backupDbPath, originalPath);
      fs.unlinkSync(this.backupDbPath);
      this.logger.info('Restored database from backup');
    }
  }
}

// CLI runner for testing
if (import.meta.url === `file://${process.argv[1]}`) {
  async function main() {
    const tester = new MigrationTester();
    
    try {
      const existingDbArg = process.argv[2];
      
      if (existingDbArg && existingDbArg !== '--create-test') {
        // Test with existing database
        await tester.testWithExistingDatabase(existingDbArg);
      } else {
        // Create test data and run migration
        await tester.createTestData();
        await tester.runMigrationTest();
      }
    } catch (error) {
      console.error('Migration test failed:', error);
      process.exit(1);
    } finally {
      tester.cleanup();
    }
  }

  main().catch(console.error);
}

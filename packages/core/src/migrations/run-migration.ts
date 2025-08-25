#!/usr/bin/env node

import { SessionStore } from '../store';
import { SessionThreadRelationshipMigration } from './001-session-thread-relationship';
import { MigrationTester } from './test-migration';
import { Logger } from '../utils/logger';
import { getDbPath } from '../config';
import fs from 'fs';

interface MigrationCliOptions {
  dryRun?: boolean;
  test?: boolean;
  backup?: boolean;
  dbPath?: string;
  verbose?: boolean;
}

class MigrationRunner {
  private logger: Logger;
  private options: MigrationCliOptions;

  constructor(options: MigrationCliOptions = {}) {
    this.options = options;
    this.logger = new Logger('migration-runner', options.verbose ? 'debug' : 'info');
  }

  async run(): Promise<void> {
    const dbPath = this.options.dbPath || getDbPath();
    
    this.logger.info(`Starting migration on database: ${dbPath}`);
    
    if (!fs.existsSync(dbPath)) {
      this.logger.warn(`Database file does not exist: ${dbPath}`);
      this.logger.info('A new database will be created with the latest schema');
    }

    if (this.options.test) {
      await this.runTest(dbPath);
      return;
    }

    if (this.options.backup && fs.existsSync(dbPath)) {
      await this.createBackup(dbPath);
    }

    await this.runMigration(dbPath);
  }

  private async createBackup(dbPath: string): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const backupPath = `${dbPath}.backup-${timestamp}`;
    
    this.logger.info(`Creating backup: ${backupPath}`);
    fs.copyFileSync(dbPath, backupPath);
    this.logger.info('Backup created successfully');
  }

  private async runMigration(dbPath: string): Promise<void> {
    let store: SessionStore | null = null;
    
    try {
      store = new SessionStore(dbPath);
      const migration = new SessionThreadRelationshipMigration(store.db, this.logger);

      if (this.options.dryRun) {
        this.logger.info('Running in DRY RUN mode - no changes will be made');
        await migration.execute({ dryRun: true });
        this.logger.info('Dry run completed successfully');
        return;
      }

      // Run the migration
      await migration.execute();
      
      // Run built-in data migration
      this.logger.info('Migrating existing session threadId values...');
      const result = store.migrateSessionThreadIds();
      this.logger.info(`Migration completed: ${result.migrated} sessions migrated, ${result.skipped} skipped`);
      
    } catch (error) {
      this.logger.error('Migration failed:', error);
      throw error;
    } finally {
      if (store) {
        store.close();
      }
    }
  }

  private async runTest(dbPath: string): Promise<void> {
    this.logger.info('Running migration test...');
    
    const tester = new MigrationTester();
    
    try {
      if (fs.existsSync(dbPath)) {
        await tester.testWithExistingDatabase(dbPath);
      } else {
        this.logger.info('No existing database found, creating test data...');
        await tester.createTestData();
        await tester.runMigrationTest();
      }
    } finally {
      tester.cleanup();
    }
  }
}

function printUsage(): void {
  console.log(`
Session-Thread Relationship Migration Tool

Usage:
  npm run migrate [options]
  
Options:
  --dry-run          Run migration in dry-run mode (no changes made)
  --test             Run migration test suite
  --backup           Create backup before migration
  --db-path <path>   Specify custom database path
  --verbose          Enable verbose logging
  --help             Show this help message

Examples:
  # Run dry-run to see what would be changed
  npm run migrate -- --dry-run
  
  # Run migration with backup
  npm run migrate -- --backup
  
  # Test migration on existing database
  npm run migrate -- --test --db-path ./my-database.db
  
  # Run migration on custom database
  npm run migrate -- --db-path ./custom.db --backup --verbose
`);
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  async function main() {
    const args = process.argv.slice(2);
    const options: MigrationCliOptions = {};
    
    for (let i = 0; i < args.length; i++) {
      switch (args[i]) {
        case '--dry-run':
          options.dryRun = true;
          break;
        case '--test':
          options.test = true;
          break;
        case '--backup':
          options.backup = true;
          break;
        case '--verbose':
          options.verbose = true;
          break;
        case '--db-path':
          if (i + 1 < args.length) {
            options.dbPath = args[++i];
          } else {
            console.error('Error: --db-path requires a value');
            process.exit(1);
          }
          break;
        case '--help':
        case '-h':
          printUsage();
          process.exit(0);
          break;
        default:
          if (args[i].startsWith('--')) {
            console.error(`Error: Unknown option ${args[i]}`);
            printUsage();
            process.exit(1);
          }
      }
    }

    try {
      const runner = new MigrationRunner(options);
      await runner.run();
      console.log('✅ Migration completed successfully');
    } catch (error) {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    }
  }

  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { MigrationRunner };

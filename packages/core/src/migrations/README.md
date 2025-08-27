# Database Migration: Session-Thread Relationship Model

This migration implements a new session-thread relationship model that provides structured thread management for the Amp Session Orchestrator.

## Overview

The migration creates a new database schema that replaces the simple `session.threadId` string reference with a fully structured relationship between sessions and threads, including:

- **Structured thread management**: Each session can have multiple threads
- **Message threading**: Each thread contains ordered messages with roles
- **Backward compatibility**: Existing `threadId` values are migrated to the new schema
- **Performance optimizations**: Proper indexes for fast queries

## Schema Changes

### New Tables

#### `threads` Table
```sql
CREATE TABLE threads (
  id TEXT PRIMARY KEY,
  sessionId TEXT NOT NULL,
  name TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  FOREIGN KEY(sessionId) REFERENCES sessions(id) ON DELETE CASCADE
);
```

#### `thread_messages` Table
```sql
CREATE TABLE thread_messages (
  id TEXT PRIMARY KEY,
  threadId TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  idx INTEGER NOT NULL,
  FOREIGN KEY(threadId) REFERENCES threads(id) ON DELETE CASCADE,
  UNIQUE(threadId, idx)
);
```

### New Indexes

Performance indexes are created for:
- `threads.sessionId` (for finding session threads)
- `threads.status`, `threads.createdAt`, `threads.updatedAt` (for filtering)
- `thread_messages.threadId` (for finding thread messages)
- `thread_messages.role`, `thread_messages.createdAt`, `thread_messages.idx` (for filtering and ordering)

## Migration Process

1. **Table Creation**: New `threads` and `thread_messages` tables are created
2. **Data Migration**: Existing `session.threadId` values are migrated:
   - Each session with a `threadId` gets a new thread record
   - A system message is created referencing the legacy `threadId`
3. **Index Creation**: Performance indexes are added
4. **Version Tracking**: Migration version is recorded in the `migrations` table

## Usage

### Command Line

```bash
# Run migration with backup
pnpm migrate --backup

# Dry run to see what would be changed
pnpm migrate:dry-run

# Test migration functionality
pnpm migrate:test

# Run on specific database
pnpm migrate --db-path ./custom.db --backup --verbose
```

### Programmatic

```typescript
import { SessionThreadRelationshipMigration } from './001-session-thread-relationship';
import { SessionStore } from '../store';

const store = new SessionStore();
const migration = new SessionThreadRelationshipMigration(store.db);

// Run migration
await migration.execute();

// Or dry run
await migration.execute({ dryRun: true });
```

## New API Methods

The `SessionStore` class now includes new methods for thread management:

### Thread Management
```typescript
// Create a new thread for a session
const threadId = store.createThread(sessionId, 'Thread Name');

// Get all threads for a session
const threads = store.getSessionThreads(sessionId);

// Delete a thread (and all its messages)
store.deleteThread(threadId);
```

### Message Management
```typescript
// Add a message to a thread
const messageId = store.addThreadMessage(threadId, 'user', 'Hello!');

// Get all messages for a thread (ordered by idx)
const messages = store.getThreadMessages(threadId);

// Update thread timestamp
store.updateThreadTimestamp(threadId);
```

### Data Migration
```typescript
// Migrate existing threadId values (called automatically during migration)
const result = store.migrateSessionThreadIds();
console.log(`Migrated: ${result.migrated}, Skipped: ${result.skipped}`);
```

## Backward Compatibility

- **Existing sessions**: All existing sessions continue to work unchanged
- **ThreadId migration**: Sessions with existing `threadId` values are automatically migrated
- **Legacy support**: The `session.threadId` column remains in the database but new thread relationships take precedence

## Migration Safety

### Built-in Safeguards
- **Atomic transactions**: All changes are wrapped in database transactions
- **Dry run mode**: Test migrations without making changes
- **Validation**: Pre-migration checks ensure database is ready
- **Rollback support**: Emergency rollback functionality available

### Backup Strategy
```bash
# Always create backup before production migration
pnpm migrate --backup

# Backup is created at: database-path.backup-YYYY-MM-DD-HHMMSS
```

### Rollback (Emergency Use Only)
```typescript
import { SessionThreadRelationshipMigration } from './001-session-thread-relationship';

const migration = new SessionThreadRelationshipMigration(db);
await migration.rollback(); // Removes new tables and indexes
```

## Testing

### Automated Tests
The migration includes comprehensive tests:

```bash
# Run full test suite on existing database
pnpm migrate:test

# Test with generated test data
cd packages/core && npx tsx src/migrations/test-migration.ts
```

### Test Coverage
- ✅ Table and index creation
- ✅ Data migration from existing `threadId` values
- ✅ New thread relationship functionality
- ✅ Foreign key constraints
- ✅ Cascade deletion
- ✅ Performance index validation
- ✅ Migration version tracking

## Performance Impact

### Query Performance
The new schema with proper indexes provides:
- **Fast session-thread lookups**: O(log n) via `sessionId` index
- **Ordered message retrieval**: Optimized via `threadId` and `idx` indexes
- **Status filtering**: Efficient thread status queries

### Storage Impact
- **Minimal overhead**: New tables add ~50 bytes per thread, ~200 bytes per message
- **Index overhead**: ~10% additional storage for performance indexes
- **Migration data**: Migrated threads include original `threadId` in system message

## Troubleshooting

### Common Issues

1. **"Database locked" error**
   ```bash
   # Stop all applications using the database, then retry
   pnpm migrate --verbose
   ```

2. **"Column already exists" warnings**
   ```bash
   # Normal during re-runs, migration is idempotent
   pnpm migrate:dry-run  # Check what would change
   ```

3. **Native module issues (better-sqlite3)**
   ```bash
   pnpm rebuild better-sqlite3
   # or
   pnpm install --force
   ```

### Validation
```bash
# Verify migration completed successfully
sqlite3 database.sqlite "SELECT * FROM migrations WHERE name = 'session-thread-relationship';"

# Check new tables exist
sqlite3 database.sqlite ".tables" | grep -E "threads|thread_messages"

# Verify indexes
sqlite3 database.sqlite ".schema" | grep "CREATE INDEX.*thread"
```

## Examples

### Creating a Complete Thread
```typescript
const store = new SessionStore();

// Create session
const session = store.createSession({
  name: 'My Project',
  ampPrompt: 'Implement feature X',
  repoRoot: '/path/to/repo'
});

// Create thread
const threadId = store.createThread(session.id, 'Feature Discussion');

// Add messages
store.addThreadMessage(threadId, 'user', 'How should we implement this?');
store.addThreadMessage(threadId, 'assistant', 'I suggest we start by...');
store.addThreadMessage(threadId, 'user', 'That sounds good, let\'s proceed');

// Retrieve conversation
const messages = store.getThreadMessages(threadId);
console.log(`Thread has ${messages.length} messages`);
```

### Working with Session Threads
```typescript
// Get all threads for a session with message counts
const threads = store.getSessionThreads(sessionId);

threads.forEach(thread => {
  console.log(`Thread: ${thread.name} (${thread.messageCount} messages)`);
  console.log(`Status: ${thread.status}, Updated: ${thread.updatedAt}`);
});
```

## Migration History

| Version | Name | Applied | Description |
|---------|------|---------|-------------|
| 1 | session-thread-relationship | 2025-08-25 | Implement structured session-thread relationship model |

## Contributing

When modifying the migration:

1. **Test thoroughly**: Always run `pnpm migrate:test` before committing
2. **Update documentation**: Keep this README current with schema changes  
3. **Version increment**: Create new migration files for additional changes
4. **Backward compatibility**: Never break existing functionality

For questions or issues, refer to the main project documentation or create an issue in the repository.

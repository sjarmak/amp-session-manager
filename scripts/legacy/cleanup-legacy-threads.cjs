const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

// Open the database
const dbPath = path.join(os.homedir(), '.amp-session-manager', 'sessions.db');
const db = new Database(dbPath);

try {
  console.log('=== LEGACY THREAD CLEANUP ===\n');

  // Get all threads that start with "Chat"
  const chatThreads = db.prepare('SELECT * FROM threads WHERE name LIKE "Chat %"').all();
  console.log(`Found ${chatThreads.length} legacy "Chat" threads:`);
  
  chatThreads.forEach(thread => {
    console.log(`- ${thread.id}: "${thread.name}" (Session: ${thread.sessionId})`);
  });

  if (chatThreads.length > 0) {
    console.log('\n=== UPDATING LEGACY THREAD NAMES ===\n');
    
    const updateStmt = db.prepare('UPDATE threads SET name = ? WHERE id = ?');
    
    chatThreads.forEach(thread => {
      const newName = `Thread ${thread.id}`;
      updateStmt.run(newName, thread.id);
      console.log(`Updated ${thread.id}: "${thread.name}" -> "${newName}"`);
    });
    
    console.log(`\n✅ Successfully updated ${chatThreads.length} legacy thread names.`);
  } else {
    console.log('✅ No legacy "Chat" threads found.');
  }

  // Also check for any threads that might have other naming issues
  const allThreads = db.prepare('SELECT id, name, messageCount FROM threads ORDER BY createdAt DESC LIMIT 10').all();
  console.log('\n=== RECENT THREADS ===');
  allThreads.forEach(thread => {
    console.log(`${thread.id}: "${thread.name}" (${thread.messageCount} messages)`);
  });

} catch (error) {
  console.error('Error:', error);
} finally {
  db.close();
}

const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

// Open the database
const dbPath = path.join(os.homedir(), '.amp-session-manager', 'sessions.db');
const db = new Database(dbPath);

try {
  console.log('=== THREAD DATA DEBUG ===\n');

  // Get all threads
  const threads = db.prepare('SELECT * FROM threads ORDER BY createdAt DESC').all();
  console.log('All threads:');
  threads.forEach(thread => {
    console.log(`- ID: ${thread.id}, Name: "${thread.name}", SessionId: ${thread.sessionId}, Messages: ${thread.messageCount || 0}`);
  });

  console.log('\n=== THREAD MESSAGES COUNT ===\n');
  
  // Get message counts per thread
  const messageCounts = db.prepare(`
    SELECT t.id, t.name, COUNT(tm.id) as actual_message_count
    FROM threads t
    LEFT JOIN thread_messages tm ON t.id = tm.threadId
    GROUP BY t.id, t.name
    ORDER BY t.createdAt DESC
  `).all();
  
  messageCounts.forEach(row => {
    console.log(`Thread "${row.name}" (${row.id}): ${row.actual_message_count} messages`);
  });

  console.log('\n=== SAMPLE THREAD MESSAGES ===\n');
  
  // Get sample messages for each thread
  const sampleMessages = db.prepare(`
    SELECT tm.threadId, tm.role, tm.content, t.name as thread_name
    FROM thread_messages tm
    JOIN threads t ON tm.threadId = t.id
    ORDER BY tm.idx ASC
    LIMIT 10
  `).all();
  
  sampleMessages.forEach(msg => {
    console.log(`Thread: ${msg.thread_name} | Role: ${msg.role} | Content: ${msg.content.substring(0, 100)}...`);
  });

  console.log('\n=== SESSIONS WITH THREADIDS ===\n');
  
  // Get sessions and their threadIds
  const sessions = db.prepare('SELECT id, name, threadId FROM sessions WHERE threadId IS NOT NULL').all();
  sessions.forEach(session => {
    console.log(`Session: ${session.name} (${session.id}) | ThreadId: ${session.threadId}`);
  });

} catch (error) {
  console.error('Error:', error);
} finally {
  db.close();
}

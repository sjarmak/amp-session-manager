import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Find the database
const dbPath = path.join(__dirname, 'apps/desktop/database.sqlite');
console.log('Looking for database at:', dbPath);

try {
  const db = new Database(dbPath, { readonly: true });
  
  // Get the most recent session
  const sessions = db.prepare('SELECT * FROM sessions ORDER BY created_at DESC LIMIT 1').all();
  if (sessions.length === 0) {
    console.log('No sessions found');
    process.exit(0);
  }
  
  const sessionId = sessions[0].id;
  console.log('Latest session:', sessionId);
  
  // Get all stream events for this session
  const events = db.prepare(`
    SELECT * FROM session_stream_events 
    WHERE session_id = ? 
    ORDER BY timestamp ASC
  `).all(sessionId);
  
  console.log('\nAll stream events:');
  events.forEach((event, i) => {
    console.log(`${i + 1}. [${event.event_type}] ${event.timestamp}`);
    if (event.data) {
      try {
        const data = JSON.parse(event.data);
        if (event.event_type === 'assistant_message' && data.tool_use) {
          console.log('   Tool use:', data.tool_use.map(t => `${t.name}(${JSON.stringify(t.input)})`));
        }
        if (event.event_type === 'tool_use' || event.event_type === 'tool_result') {
          console.log('   Tool:', data.tool_name || data.name, 'Args:', JSON.stringify(data.input || data.args || {}));
        }
        if (data.path) {
          console.log('   Path:', data.path);
        }
      } catch (e) {
        console.log('   Data (raw):', event.data.substring(0, 100));
      }
    }
  });
  
  db.close();
} catch (error) {
  console.error('Error:', error.message);
}

import { SessionStore } from '@ampsm/core';
import { readFile, stat } from 'fs/promises';
import { join } from 'path';
import { spawn } from 'child_process';

export async function logsCommand(sessionId: string, options: {
  follow?: boolean;
  lines?: number;
}) {
  const store = new SessionStore();
  
  try {
    const session = store.getSession(sessionId);
    if (!session) {
      console.error(`Session ${sessionId} not found`);
      process.exit(1);
    }

    // Try to find amp logs in the worktree
    const logPaths = [
      join(session.worktreePath, 'AGENT_CONTEXT', 'amp.log'),
      join(session.worktreePath, 'AGENT_CONTEXT', 'iteration.log'),
      join(session.worktreePath, '.amp', 'logs', 'latest.log')
    ];

    let logPath: string | null = null;
    for (const path of logPaths) {
      try {
        await stat(path);
        logPath = path;
        break;
      } catch {
        // File doesn't exist, continue
      }
    }

    if (!logPath) {
      console.log('No amp logs found for this session');
      console.log('Checked paths:');
      logPaths.forEach(path => console.log(`  ${path}`));
      return;
    }

    console.log(`Reading logs from: ${logPath}`);

    if (options.follow) {
      // Use tail -f to follow logs
      const tail = spawn('tail', ['-f', logPath], {
        stdio: 'inherit'
      });

      process.on('SIGINT', () => {
        tail.kill();
        process.exit(0);
      });

      await new Promise((resolve, reject) => {
        tail.on('close', resolve);
        tail.on('error', reject);
      });
    } else {
      // Read the log file
      try {
        const content = await readFile(logPath, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim());
        
        if (options.lines && lines.length > options.lines) {
          // Show last N lines
          console.log(lines.slice(-options.lines).join('\n'));
        } else {
          console.log(content);
        }
      } catch (error) {
        console.error(`Failed to read log file: ${error}`);
        process.exit(1);
      }
    }
  } finally {
    store.close();
  }
}

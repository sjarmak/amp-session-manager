import { SessionStore, WorktreeManager, getDbPath, acquireLock, releaseLock, isLocked, getLockInfo, cleanupStaleLocks } from '@ampsm/core';
import { spawn } from 'child_process';

export async function lockCommand(sessionId: string, options: { 
  command?: string; 
  unlock?: boolean; 
  status?: boolean; 
  cleanup?: boolean; 
  json?: boolean;
}) {
  const dbPath = process.env.AMPSM_DB_PATH || getDbPath();
  const store = new SessionStore(dbPath);

  try {
    // Handle cleanup of stale locks
    if (options.cleanup) {
      const cleaned = cleanupStaleLocks();
      
      if (options.json) {
        console.log(JSON.stringify({ 
          status: 'success', 
          cleaned, 
          message: `Cleaned up ${cleaned} stale lock(s)` 
        }));
      } else {
        console.log(`✓ Cleaned up ${cleaned} stale lock(s)`);
      }
      return;
    }

    // Validate session exists
    const session = store.getSession(sessionId);
    if (!session) {
      if (options.json) {
        console.log(JSON.stringify({ status: 'error', message: `Session ${sessionId} not found` }));
      } else {
        console.error(`Session ${sessionId} not found`);
      }
      process.exit(1);
    }

    // Handle status check
    if (options.status) {
      const locked = isLocked(sessionId);
      const lockInfo = getLockInfo(sessionId);
      
      if (options.json) {
        console.log(JSON.stringify({
          status: 'success',
          sessionId,
          locked,
          lockInfo
        }));
      } else {
        if (locked && lockInfo) {
          console.log(`🔒 Session ${sessionId} is locked`);
          console.log(`   PID: ${lockInfo.pid}`);
          console.log(`   Timestamp: ${new Date(lockInfo.timestamp).toISOString()}`);
          if (lockInfo.hostname) {
            console.log(`   Host: ${lockInfo.hostname}`);
          }
        } else {
          console.log(`🔓 Session ${sessionId} is not locked`);
        }
      }
      return;
    }

    // Handle unlock
    if (options.unlock) {
      releaseLock(sessionId);
      
      if (options.json) {
        console.log(JSON.stringify({ 
          status: 'success', 
          sessionId, 
          message: 'Lock released' 
        }));
      } else {
        console.log(`🔓 Released lock for session ${sessionId}`);
      }
      return;
    }

    // Handle lock acquisition
    try {
      acquireLock(sessionId);
      
      if (options.json && !options.command) {
        console.log(JSON.stringify({ 
          status: 'success', 
          sessionId, 
          message: 'Lock acquired' 
        }));
      } else if (!options.command) {
        console.log(`🔒 Acquired lock for session ${sessionId}`);
      }

      // If command is specified, run it while holding the lock
      if (options.command) {
        if (!options.json) {
          console.log(`🔒 Running command while holding lock for session ${sessionId}: ${options.command}`);
        }

        const exitCode = await runCommand(options.command);
        
        if (options.json) {
          console.log(JSON.stringify({ 
            status: exitCode === 0 ? 'success' : 'error',
            sessionId,
            command: options.command,
            exitCode,
            message: `Command ${exitCode === 0 ? 'completed' : 'failed'} with exit code ${exitCode}`
          }));
        } else {
          if (exitCode === 0) {
            console.log(`✓ Command completed successfully`);
          } else {
            console.log(`✗ Command failed with exit code ${exitCode}`);
          }
        }

        process.exit(exitCode);
      }
    } catch (error) {
      if (options.json) {
        console.log(JSON.stringify({ 
          status: 'error', 
          message: error instanceof Error ? error.message : String(error) 
        }));
      } else {
        console.error(`❌ ${error instanceof Error ? error.message : String(error)}`);
      }
      process.exit(1);
    } finally {
      // Always release lock when process exits, unless we're just checking status
      if (!options.status && !options.unlock) {
        releaseLock(sessionId);
      }
    }
  } finally {
    store.close();
  }
}

/**
 * Run a shell command and return its exit code
 */
function runCommand(command: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn('sh', ['-c', command], {
      stdio: 'inherit'
    });

    child.on('close', (code) => {
      resolve(code || 0);
    });

    child.on('error', (error) => {
      console.error(`Error running command: ${error}`);
      resolve(1);
    });
  });
}

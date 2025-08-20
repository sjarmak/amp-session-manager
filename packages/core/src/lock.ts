import { join, dirname } from 'path';
import { existsSync, writeFileSync, readFileSync, unlinkSync, mkdirSync, readdirSync } from 'fs';
import { hostname } from 'os';
import { getUserConfigDir } from './config.js';

export interface LockInfo {
  sessionId: string;
  pid: number;
  timestamp: number;
  hostname?: string;
}

/**
 * Get the path where lock files are stored
 */
function getLockDir(): string {
  return join(getUserConfigDir(), 'locks');
}

/**
 * Get the path to a specific session lock file
 */
function getLockPath(sessionId: string): string {
  return join(getLockDir(), `${sessionId}.lock`);
}

/**
 * Check if a process with the given PID is still running
 */
function isProcessRunning(pid: number): boolean {
  try {
    // On Unix-like systems, process.kill(pid, 0) doesn't send a signal
    // but checks if the process exists
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // If we get ESRCH, the process doesn't exist
    // If we get EPERM, the process exists but we don't have permission to signal it
    const err = error as NodeJS.ErrnoException;
    return err.code === 'EPERM';
  }
}

/**
 * Read and parse lock file contents
 */
function readLockFile(lockPath: string): LockInfo | null {
  try {
    const content = readFileSync(lockPath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    // If we can't read or parse the lock file, treat it as if it doesn't exist
    return null;
  }
}

/**
 * Check if a session is currently locked
 */
export function isLocked(sessionId: string): boolean {
  const lockPath = getLockPath(sessionId);
  
  if (!existsSync(lockPath)) {
    return false;
  }

  const lockInfo = readLockFile(lockPath);
  if (!lockInfo) {
    // Invalid lock file, remove it
    try {
      unlinkSync(lockPath);
    } catch {
      // Ignore errors when removing invalid lock file
    }
    return false;
  }

  // Check if the process is still running
  if (!isProcessRunning(lockInfo.pid)) {
    // Stale lock, remove it
    try {
      unlinkSync(lockPath);
    } catch {
      // Ignore errors when removing stale lock file
    }
    return false;
  }

  return true;
}

/**
 * Acquire a lock for a session
 * @throws Error if the session is already locked
 */
export function acquireLock(sessionId: string): void {
  if (isLocked(sessionId)) {
    throw new Error(`Session ${sessionId} is already locked by another process`);
  }

  const lockDir = getLockDir();
  
  // Ensure lock directory exists
  if (!existsSync(lockDir)) {
    try {
      mkdirSync(lockDir, { recursive: true });
    } catch (error) {
      throw new Error(`Failed to create lock directory: ${error}`);
    }
  }

  const lockPath = getLockPath(sessionId);
  const lockInfo: LockInfo = {
    sessionId,
    pid: process.pid,
    timestamp: Date.now(),
    hostname: hostname()
  };

  try {
    writeFileSync(lockPath, JSON.stringify(lockInfo, null, 2));
  } catch (error) {
    throw new Error(`Failed to create lock file: ${error}`);
  }
}

/**
 * Release a lock for a session
 */
export function releaseLock(sessionId: string): void {
  const lockPath = getLockPath(sessionId);
  
  if (existsSync(lockPath)) {
    const lockInfo = readLockFile(lockPath);
    
    // Only allow the same process to release the lock
    if (lockInfo && lockInfo.pid !== process.pid) {
      console.warn(`Warning: Attempting to release lock owned by different process (PID ${lockInfo.pid})`);
    }
    
    try {
      unlinkSync(lockPath);
    } catch (error) {
      console.warn(`Warning: Failed to remove lock file: ${error}`);
    }
  }
}

/**
 * Get lock information for a session
 */
export function getLockInfo(sessionId: string): LockInfo | null {
  const lockPath = getLockPath(sessionId);
  
  if (!existsSync(lockPath)) {
    return null;
  }

  return readLockFile(lockPath);
}

/**
 * Execute a function while holding a lock
 */
export async function withLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
  acquireLock(sessionId);
  
  try {
    return await fn();
  } finally {
    releaseLock(sessionId);
  }
}

/**
 * Clean up all stale locks (locks where the process is no longer running)
 */
export function cleanupStaleLocks(): number {
  const lockDir = getLockDir();
  
  if (!existsSync(lockDir)) {
    return 0;
  }

  let cleaned = 0;
  
  try {
    const lockFiles = readdirSync(lockDir);
    
    for (const file of lockFiles) {
      if (file.endsWith('.lock')) {
        const lockPath = join(lockDir, file);
        const lockInfo = readLockFile(lockPath);
        
        if (lockInfo && !isProcessRunning(lockInfo.pid)) {
          try {
            unlinkSync(lockPath);
            cleaned++;
          } catch {
            // Ignore errors when cleaning up stale locks
          }
        }
      }
    }
  } catch {
    // Ignore errors when reading lock directory
  }

  return cleaned;
}

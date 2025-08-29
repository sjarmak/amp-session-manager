import { createHash } from 'crypto';
import { existsSync, writeFileSync, unlinkSync, readFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// Global repository locks to prevent concurrent git operations on the same repo
class RepoLockManager {
  private locks = new Map<string, { pid: number; timestamp: number }>();
  private lockDir: string;

  constructor() {
    this.lockDir = join(homedir(), '.amp-sessions', 'repo-locks');
    // Ensure lock directory exists
    try {
      mkdirSync(this.lockDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
  }

  private getRepoKey(repoPath: string): string {
    // Create a consistent key for the repository path
    return createHash('sha256').update(repoPath).digest('hex').substring(0, 16);
  }

  private getLockFilePath(repoKey: string): string {
    return join(this.lockDir, `${repoKey}.lock`);
  }

  private isProcessRunning(pid: number): boolean {
    try {
      // On Unix-like systems, sending signal 0 checks if process exists
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return false;
    }
  }

  private cleanupStaleLock(lockFilePath: string, lockData: { pid: number; timestamp: number }): boolean {
    const now = Date.now();
    const maxAge = 30 * 60 * 1000; // 30 minutes
    
    // If lock is older than 30 minutes or process doesn't exist, consider it stale
    if (now - lockData.timestamp > maxAge || !this.isProcessRunning(lockData.pid)) {
      try {
        unlinkSync(lockFilePath);
        return true;
      } catch (error) {
        // Lock file might have been removed by another process
        return true;
      }
    }
    return false;
  }

  async acquireRepoLock(repoPath: string, maxWaitMs: number = 120000): Promise<string> {
    const repoKey = this.getRepoKey(repoPath);
    const lockFilePath = this.getLockFilePath(repoKey);
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitMs) {
      try {
        // Check if lock file exists
        if (existsSync(lockFilePath)) {
          const lockContent = readFileSync(lockFilePath, 'utf-8');
          const lockData = JSON.parse(lockContent);
          
          // Try to clean up stale lock
          if (this.cleanupStaleLock(lockFilePath, lockData)) {
            // Stale lock cleaned up, continue to acquire
          } else {
            // Active lock exists, wait and retry
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue;
          }
        }

        // Try to acquire lock
        const lockData = {
          pid: process.pid,
          timestamp: Date.now(),
          repoPath,
          lockId: repoKey
        };

        writeFileSync(lockFilePath, JSON.stringify(lockData), { flag: 'wx' });
        
        // Successfully acquired lock
        this.locks.set(repoKey, lockData);
        return repoKey;
        
      } catch (error: any) {
        if (error.code === 'EEXIST') {
          // Another process acquired the lock, wait and retry
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }
        throw error;
      }
    }
    
    throw new Error(`Failed to acquire repository lock for ${repoPath} after ${maxWaitMs}ms. Another session may be operating on this repository.`);
  }

  releaseRepoLock(lockId: string): void {
    try {
      const lockFilePath = this.getLockFilePath(lockId);
      unlinkSync(lockFilePath);
      this.locks.delete(lockId);
    } catch (error) {
      // Lock file might have been cleaned up already
    }
  }

  releaseAllLocks(): void {
    for (const lockId of this.locks.keys()) {
      this.releaseRepoLock(lockId);
    }
  }
}

// Global instance
const repoLockManager = new RepoLockManager();

export async function withRepoLock<T>(
  repoPath: string, 
  operation: () => Promise<T>,
  maxWaitMs: number = 120000
): Promise<T> {
  const lockId = await repoLockManager.acquireRepoLock(repoPath, maxWaitMs);
  
  try {
    return await operation();
  } finally {
    repoLockManager.releaseRepoLock(lockId);
  }
}

// Cleanup function for graceful shutdown
export function cleanupRepoLocks(): void {
  repoLockManager.releaseAllLocks();
}

// Handle process exit
process.on('exit', cleanupRepoLocks);
process.on('SIGINT', () => {
  cleanupRepoLocks();
  process.exit(0);
});
process.on('SIGTERM', () => {
  cleanupRepoLocks();
  process.exit(0);
});

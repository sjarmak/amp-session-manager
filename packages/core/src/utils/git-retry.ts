import { Logger } from './logger.js';

export interface GitRetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterMs?: number;
}

export interface GitRetryOptions {
  operation: string;
  config?: Partial<GitRetryConfig>;
  logger?: Logger;
}

export interface GitRetryResult<T> {
  result: T;
  attempts: number;
  totalDelayMs: number;
}

const DEFAULT_CONFIG: GitRetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  jitterMs: 200
};

/**
 * Determines if a git error is retryable based on common transient error patterns
 */
export function isRetryableGitError(error: Error): boolean {
  const errorMessage = error.message.toLowerCase();
  
  // Git lock file conflicts (most common retryable error)
  if (errorMessage.includes('index.lock') || 
      errorMessage.includes('another git process') ||
      errorMessage.includes('unable to create') && errorMessage.includes('lock')) {
    return true;
  }
  
  // Temporary network issues (for fetch/pull operations)
  if (errorMessage.includes('connection timed out') ||
      errorMessage.includes('connection refused') ||
      errorMessage.includes('network is unreachable') ||
      errorMessage.includes('temporary failure in name resolution')) {
    return true;
  }
  
  // Temporary file system issues
  if (errorMessage.includes('device or resource busy') ||
      errorMessage.includes('no space left on device') ||
      errorMessage.includes('operation not permitted') && errorMessage.includes('temporarily')) {
    return true;
  }
  
  // Git worktree specific temporary issues
  if (errorMessage.includes('worktree') && (
      errorMessage.includes('already exists') ||
      errorMessage.includes('is a missing worktree')
    )) {
    return true;
  }
  
  return false;
}

/**
 * Calculate exponential backoff delay with optional jitter
 */
function calculateDelay(attempt: number, config: GitRetryConfig): number {
  const exponentialDelay = Math.min(
    config.baseDelayMs * Math.pow(2, attempt - 1),
    config.maxDelayMs
  );
  
  // Add jitter to avoid thundering herd problem
  const jitter = config.jitterMs ? Math.random() * config.jitterMs : 0;
  
  return exponentialDelay + jitter;
}

/**
 * Sleep for the specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry wrapper for git operations with exponential backoff
 * 
 * @param operation The git operation to retry
 * @param options Retry configuration options
 * @returns Promise that resolves to the operation result with retry metadata
 */
export async function withGitRetry<T>(
  operation: () => Promise<T>,
  options: GitRetryOptions
): Promise<GitRetryResult<T>> {
  const config: GitRetryConfig = { ...DEFAULT_CONFIG, ...options.config };
  const logger = options.logger;
  
  let lastError: Error;
  let totalDelayMs = 0;
  
  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    try {
      logger?.debug(`[GitRetry] ${options.operation}: Attempt ${attempt}/${config.maxRetries}`);
      
      const result = await operation();
      
      if (attempt > 1) {
        logger?.info(`[GitRetry] ${options.operation}: Succeeded after ${attempt} attempts (total delay: ${totalDelayMs}ms)`);
      }
      
      return {
        result,
        attempts: attempt,
        totalDelayMs
      };
      
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Log the error for this attempt
      logger?.debug(`[GitRetry] ${options.operation}: Attempt ${attempt} failed:`, lastError.message);
      
      // Check if this is the last attempt or if the error is not retryable
      if (attempt === config.maxRetries || !isRetryableGitError(lastError)) {
        if (!isRetryableGitError(lastError)) {
          logger?.debug(`[GitRetry] ${options.operation}: Error not retryable, failing immediately`);
        } else {
          logger?.error(`[GitRetry] ${options.operation}: All ${config.maxRetries} attempts failed`);
        }
        throw lastError;
      }
      
      // Calculate delay for next attempt
      const delayMs = calculateDelay(attempt, config);
      totalDelayMs += delayMs;
      
      logger?.info(`[GitRetry] ${options.operation}: Attempt ${attempt}/${config.maxRetries} failed, retrying in ${delayMs}ms`);
      logger?.debug(`[GitRetry] ${options.operation}: Error was:`, lastError.message);
      
      await sleep(delayMs);
    }
  }
  
  // This should never be reached, but TypeScript requires it
  throw lastError!;
}

/**
 * Enhanced git lock cleanup with retry logic
 */
export async function cleanupGitLocksWithRetry(
  repoRoot: string,
  logger?: Logger
): Promise<{ cleaned: string[]; errors: string[] }> {
  const cleaned: string[] = [];
  const errors: string[] = [];
  
  try {
    const fs = require('fs');
    const path = require('path');
    
    // Common git lock files to clean up
    const lockFiles = [
      path.join(repoRoot, '.git', 'index.lock'),
      path.join(repoRoot, '.git', 'HEAD.lock'),
      path.join(repoRoot, '.git', 'config.lock'),
      path.join(repoRoot, '.git', 'refs', 'heads', 'main.lock'),
      path.join(repoRoot, '.git', 'refs', 'heads', 'master.lock')
    ];
    
    // Also check for worktree-specific locks
    try {
      const worktreesDir = path.join(repoRoot, '.git', 'worktrees');
      if (fs.existsSync(worktreesDir)) {
        const worktrees = fs.readdirSync(worktreesDir);
        for (const worktree of worktrees) {
          lockFiles.push(
            path.join(worktreesDir, worktree, 'HEAD.lock'),
            path.join(worktreesDir, worktree, 'index.lock')
          );
        }
      }
    } catch (error) {
      logger?.debug('[GitRetry] Could not scan worktree locks:', error);
    }
    
    for (const lockFile of lockFiles) {
      try {
        if (fs.existsSync(lockFile)) {
          // Check if lock file is stale (older than 5 minutes)
          const stats = fs.statSync(lockFile);
          const ageMs = Date.now() - stats.mtime.getTime();
          const staleThresholdMs = 5 * 60 * 1000; // 5 minutes
          
          if (ageMs > staleThresholdMs) {
            await withGitRetry(
              async () => {
                fs.unlinkSync(lockFile);
                return lockFile;
              },
              {
                operation: `cleanup lock file: ${path.basename(lockFile)}`,
                config: { maxRetries: 2, baseDelayMs: 100, maxDelayMs: 500 },
                logger
              }
            );
            
            cleaned.push(lockFile);
            logger?.debug(`[GitRetry] Cleaned up stale git lock: ${lockFile}`);
          } else {
            logger?.debug(`[GitRetry] Lock file ${lockFile} is recent (${Math.round(ageMs / 1000)}s old), not cleaning`);
          }
        }
      } catch (error) {
        const errorMsg = `Failed to cleanup ${lockFile}: ${error}`;
        errors.push(errorMsg);
        logger?.debug('[GitRetry]', errorMsg);
      }
    }
    
  } catch (error) {
    const errorMsg = `Git lock cleanup failed: ${error}`;
    errors.push(errorMsg);
    logger?.error('[GitRetry]', errorMsg);
  }
  
  return { cleaned, errors };
}

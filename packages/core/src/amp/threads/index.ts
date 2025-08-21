import { Logger } from '../../utils/logger';
import { SessionStore } from '../../store';
import { ThreadStore } from './store';
import { ThreadWebFetcher, WebFetcherConfig } from './webFetcher';
import { LogIngestor, LogIngestorOptions, LogIngestResult } from './logIngestor';
import { GitScanner, GitScanOptions, GitScanResult } from './gitScanner';
import type { NormalizedThread } from '@ampsm/types';
import { Readable } from 'stream';

export interface ThreadServiceConfig {
  ampBaseUrl?: string;
  ampSessionCookie?: string;
  ampCacheDir?: string;
  ampImportConcurrency?: number;
  ampRefreshIntervalMinutes?: number;
}

export interface ImportResult {
  success: boolean;
  thread?: NormalizedThread;
  error?: string;
  source: 'web' | 'cache' | 'git';
}

export interface RefreshResult {
  threadsProcessed: number;
  threadsUpdated: number;
  errors: string[];
}

export class ThreadService {
  private store: ThreadStore;
  private webFetcher: ThreadWebFetcher;
  private logIngestor: LogIngestor;
  private gitScanner: GitScanner;
  private logger: Logger;
  private config: Required<ThreadServiceConfig>;

  constructor(
    sessionStore: SessionStore,
    logger: Logger,
    repoRoot: string,
    config: ThreadServiceConfig = {}
  ) {
    this.logger = logger;
    this.config = {
      ampBaseUrl: 'https://ampcode.com',
      ampSessionCookie: '',
      ampCacheDir: '',
      ampImportConcurrency: 4,
      ampRefreshIntervalMinutes: 60,
      ...config
    };

    // Initialize components
    this.store = new ThreadStore(sessionStore, logger);
    
    const fetcherConfig: Partial<WebFetcherConfig> = {
      sessionCookie: this.config.ampSessionCookie
    };
    this.webFetcher = new ThreadWebFetcher(this.config.ampSessionCookie);
    
    this.logIngestor = new LogIngestor();
    this.gitScanner = new GitScanner(repoRoot);

    this.logger.info('Thread service initialized');
  }

  // Import a single thread by ID
  async importThread(threadId: string): Promise<ImportResult> {
    this.logger.info(`Importing thread ${threadId}`);

    try {
      // First try web fetch
      const thread = await this.webFetcher.fetchThread(threadId);
      
      // Store the thread and its components
      await this.store.upsertThread(thread);
      
      if (thread.messages && thread.messages.length > 0) {
        await this.store.upsertMessages(thread.messages);
      }
      
      if (thread.tool_calls && thread.tool_calls.length > 0) {
        await this.store.upsertToolCalls(thread.tool_calls);
      }
      
      if (thread.diffs && thread.diffs.length > 0) {
        await this.store.upsertDiffs(thread.diffs);
      }

      return {
        success: true,
        thread: thread,
        source: 'web'
      };

    } catch (error) {
      const errorMsg = `Failed to import thread ${threadId}: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(errorMsg, error);
      return {
        success: false,
        error: errorMsg,
        source: 'web'
      };
    }
  }

  // Refresh an existing thread
  async refreshThread(threadId: string): Promise<ImportResult> {
    this.logger.info(`Refreshing thread ${threadId}`);
    
    // Same as import for now - the store handles upserts with conflict resolution
    return this.importThread(threadId);
  }

  // Import threads discovered from git history
  async importFromGit(options: GitScanOptions = {}): Promise<{
    scanned: GitScanResult;
    imported: ImportResult[];
  }> {
    this.logger.info('Importing threads from git history');

    const scanResult = await this.gitScanner.scanForThreadIds(options);
    const imported: ImportResult[] = [];

    // Import each discovered thread
    for (const threadId of scanResult.threadIds) {
      try {
        const importResult = await this.importThread(threadId);
        imported.push(importResult);
        
        // Add git context to thread if import was successful
        if (importResult.success && importResult.thread) {
          await this.store.upsertThread({
            id: threadId,
            source: 'git',
            updated_at: new Date().toISOString()
          }, { skipIfNewer: false });
        }
        
        // Rate limiting - don't overwhelm the server
        await this.sleep(200);
        
      } catch (error) {
        this.logger.error(`Error importing thread ${threadId} from git:`, error);
        imported.push({
          success: false,
          error: error instanceof Error ? error.message : String(error),
          source: 'git'
        });
      }
    }

    this.logger.info(`Git import complete: ${scanResult.threadIds.length} threads found, ${imported.filter(r => r.success).length} imported successfully`);

    return {
      scanned: scanResult,
      imported
    };
  }

  // Ingest metrics from debug logs
  async ingestLogs(
    input: Readable | string,
    options: LogIngestorOptions = {}
  ): Promise<LogIngestResult> {
    this.logger.info('Ingesting metrics from debug logs');
    return this.logIngestor.ingestDebugLog(input as string);
  }

  // Ingest metrics from a file
  async ingestLogsFromFile(filePath: string, options: LogIngestorOptions = {}): Promise<LogIngestResult> {
    this.logger.info(`Ingesting metrics from file: ${filePath}`);
    return this.logIngestor.ingestFromFile(filePath);
  }

  // Ingest metrics from stdin
  async ingestLogsFromStdin(options: LogIngestorOptions = {}): Promise<LogIngestResult> {
    this.logger.info('Ingesting metrics from stdin');
    return this.logIngestor.ingestFromStdin();
  }

  // Get a thread with all its data
  getThread(threadId: string): NormalizedThread | null {
    return this.store.getFullThread(threadId);
  }

  // List all threads
  listThreads(limit?: number): NormalizedThread[] {
    return this.store.getAllThreads(limit);
  }

  // Search threads
  searchThreads(query: string, limit = 50) {
    return this.store.searchThreads(query, limit);
  }

  // Get recent threads that might need refreshing
  getRecentThreads(hours = 24, limit = 20): NormalizedThread[] {
    return this.store.getRecentThreads(hours, limit);
  }

  // Refresh recent threads in background
  async refreshRecentThreads(hours = 24, limit = 20): Promise<RefreshResult> {
    const recentThreads = this.getRecentThreads(hours, limit);
    const result: RefreshResult = {
      threadsProcessed: 0,
      threadsUpdated: 0,
      errors: []
    };

    this.logger.info(`Refreshing ${recentThreads.length} recent threads`);

    // Process threads with concurrency limit
    const concurrency = this.config.ampImportConcurrency;
    const batches = this.chunkArray(recentThreads, concurrency);

    for (const batch of batches) {
      const promises = batch.map(async (thread) => {
        result.threadsProcessed++;
        try {
          const refreshResult = await this.refreshThread(thread.id);
          if (refreshResult.success) {
            result.threadsUpdated++;
          } else {
            result.errors.push(`${thread.id}: ${refreshResult.error}`);
          }
        } catch (error) {
          result.errors.push(`${thread.id}: ${error instanceof Error ? error.message : String(error)}`);
        }
      });

      await Promise.all(promises);
      
      // Small delay between batches
      await this.sleep(100);
    }

    this.logger.info(`Refresh complete: ${result.threadsUpdated}/${result.threadsProcessed} threads updated`);
    return result;
  }

  // Delete a thread and all its data
  deleteThread(threadId: string): void {
    this.store.deleteThread(threadId);
    this.logger.info(`Deleted thread ${threadId}`);
  }

  // Update configuration
  updateConfig(updates: Partial<ThreadServiceConfig>) {
    Object.assign(this.config, updates);
    
    // Update web fetcher session cookie if provided
    if (updates.ampSessionCookie !== undefined) {
      // Re-create webFetcher with new session cookie
      this.webFetcher = new ThreadWebFetcher(updates.ampSessionCookie);
    }

    this.logger.info('Thread service configuration updated');
  }

  // Get current configuration (without sensitive data)
  getConfig(): Omit<ThreadServiceConfig, 'ampSessionCookie'> {
    const { ampSessionCookie, ...safeConfig } = this.config;
    return safeConfig;
  }

  // Background scheduler for automatic refresh (to be called by a scheduler)
  async scheduledRefresh(): Promise<RefreshResult> {
    this.logger.debug('Running scheduled thread refresh');
    return this.refreshRecentThreads(24, 50);
  }

  // Utility methods
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  // Export all components for advanced usage
  get components() {
    return {
      store: this.store,
      webFetcher: this.webFetcher,
      logIngestor: this.logIngestor,
      gitScanner: this.gitScanner
    };
  }
}

// Export all the components for direct usage
export { ThreadStore } from './store';
export { ThreadWebFetcher } from './webFetcher';
export { LogIngestor } from './logIngestor';
export { GitScanner } from './gitScanner';
export * from './store';
export * from './webFetcher';
export * from './logIngestor';
export * from './gitScanner';

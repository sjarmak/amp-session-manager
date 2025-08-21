import { GitOps } from '../../git.js';

export interface GitScanOptions {
  days?: number;
  branch?: string;
}

export interface GitScanResult {
  threadIds: string[];
  totalCommits: number;
}

export interface FindThreadIdsOptions {
  days?: number;
  branch?: string;
}

export class GitScanner {
  private repoRoot: string;
  private gitOps: GitOps;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
    this.gitOps = new GitOps(repoRoot);
  }

  async findThreadIds(options: FindThreadIdsOptions = {}): Promise<string[]> {
    const { days = 30, branch } = options;
    
    try {
      // Check if we're in a git repo
      const isRepo = await this.gitOps.isRepo();
      if (!isRepo) {
        return [];
      }

      // Build git log args
      const logArgs = [
        'log',
        '--pretty=format:%B', // Get full commit message body
        `--since=${days} days ago`
      ];

      if (branch) {
        logArgs.push(branch);
      }

      const result = await this.gitOps.exec(logArgs);
      
      // Extract thread IDs from commit messages
      const threadIds = this.extractThreadIds(result.stdout);
      
      return [...new Set(threadIds)]; // Remove duplicates
    } catch (error) {
      // If git command fails (e.g., no commits, invalid branch), return empty array
      return [];
    }
  }

  private extractThreadIds(text: string): string[] {
    const threadIds: string[] = [];
    
    // Pattern 1: Amp-Thread: trailer format
    const trailerRegex = /Amp-Thread:\s*([T-][a-f0-9-]+)/gi;
    const trailerMatches = [...text.matchAll(trailerRegex)];
    
    for (const match of trailerMatches) {
      const threadId = match[1];
      if (threadId && this.isValidThreadId(threadId)) {
        threadIds.push(threadId);
      }
    }

    // Pattern 2: Direct thread ID mentions in message body
    const directRegex = /\b(T-[a-f0-9-]+)\b/gi;
    const directMatches = [...text.matchAll(directRegex)];
    
    for (const match of directMatches) {
      const threadId = match[1];
      if (this.isValidThreadId(threadId)) {
        threadIds.push(threadId);
      }
    }

    return threadIds;
  }

  private isValidThreadId(threadId: string): boolean {
    // Simple validation - starts with T- and has reasonable format
    return /^T-[a-f0-9-]{6,}$/i.test(threadId);
  }

  async scanForThreadIds(options: GitScanOptions = {}): Promise<GitScanResult> {
    const threadIds = await this.findThreadIds(options);
    return {
      threadIds,
      totalCommits: 0 // TODO: Count commits if needed
    };
  }
}

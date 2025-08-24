import { execSync, spawn } from 'child_process';
import { Logger } from '../utils/logger';
import { MetricsEventBus } from './event-bus';

export interface GitDiffStats {
  filesChanged: number;
  insertions: number;
  deletions: number;
}

export interface GitOperationResult {
  success: boolean;
  durationMs: number;
  shaBefore?: string;
  shaAfter?: string;
  stats?: GitDiffStats;
  conflicted?: boolean;
  errorMessage?: string;
}

export class GitInstrumentation {
  private logger: Logger;
  private eventBus: MetricsEventBus;
  private cwd: string;

  constructor(logger: Logger, eventBus: MetricsEventBus, cwd: string) {
    this.logger = logger;
    this.eventBus = eventBus;
    this.cwd = cwd;
  }

  async commit(
    message: string,
    sessionId: string,
    iterationId: string,
    addAll: boolean = true
  ): Promise<GitOperationResult> {
    const startTime = Date.now();
    const shaBefore = this.getCurrentSha();

    try {
      if (addAll) {
        this.execGit(['add', '-A']);
      }

      // Check if there are changes to commit
      const hasChanges = this.hasChangesToCommit();
      if (!hasChanges) {
        this.logger.debug('No changes to commit');
        return {
          success: true,
          durationMs: Date.now() - startTime,
          shaBefore,
          shaAfter: shaBefore,
          stats: { filesChanged: 0, insertions: 0, deletions: 0 }
        };
      }

      this.execGit(['commit', '-m', message]);
      
      const shaAfter = this.getCurrentSha();
      this.logger.debug(`Commit completed: ${shaBefore} -> ${shaAfter}`);
      
      const stats = this.getDiffStats(shaBefore, shaAfter);
      const durationMs = Date.now() - startTime;

      const result: GitOperationResult = {
        success: true,
        durationMs,
        shaBefore,
        shaAfter,
        stats,
        conflicted: false
      };

      // Publish metrics event
      await this.eventBus.publishGitOperation(
        sessionId,
        iterationId,
        'commit',
        {
          shaBefore,
          shaAfter,
          filesChanged: stats.filesChanged,
          insertions: stats.insertions,
          deletions: stats.deletions,
          conflicted: false,
          durationMs
        }
      );

      this.logger.debug(`Git commit completed: ${shaAfter} (${stats.filesChanged} files, +${stats.insertions}/-${stats.deletions})`);
      
      return result;

    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.logger.error('Git commit failed:', error);
      
      const result: GitOperationResult = {
        success: false,
        durationMs,
        shaBefore,
        errorMessage,
        conflicted: false
      };

      // Still publish metrics for failed operations
      await this.eventBus.publishGitOperation(
        sessionId,
        iterationId,
        'commit',
        {
          shaBefore,
          filesChanged: 0,
          insertions: 0,
          deletions: 0,
          conflicted: false,
          durationMs
        }
      );

      return result;
    }
  }

  async merge(
    branchOrSha: string,
    sessionId: string,
    iterationId: string,
    strategy: 'ff-only' | 'no-ff' | 'squash' = 'no-ff'
  ): Promise<GitOperationResult> {
    const startTime = Date.now();
    const shaBefore = this.getCurrentSha();

    try {
      const args = ['merge'];
      
      switch (strategy) {
        case 'ff-only':
          args.push('--ff-only');
          break;
        case 'no-ff':
          args.push('--no-ff');
          break;
        case 'squash':
          args.push('--squash');
          break;
      }
      
      args.push(branchOrSha);

      this.execGit(args);
      
      const shaAfter = this.getCurrentSha();
      const stats = this.getDiffStats(shaBefore, shaAfter);
      const durationMs = Date.now() - startTime;

      const result: GitOperationResult = {
        success: true,
        durationMs,
        shaBefore,
        shaAfter,
        stats,
        conflicted: false
      };

      await this.eventBus.publishGitOperation(
        sessionId,
        iterationId,
        'merge',
        {
          shaBefore,
          shaAfter,
          filesChanged: stats.filesChanged,
          insertions: stats.insertions,
          deletions: stats.deletions,
          conflicted: false,
          durationMs
        }
      );

      this.logger.debug(`Git merge completed: ${shaBefore} -> ${shaAfter}`);
      
      return result;

    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isConflict = errorMessage.includes('CONFLICT') || errorMessage.includes('conflict');
      
      this.logger.error('Git merge failed:', error);
      
      const result: GitOperationResult = {
        success: false,
        durationMs,
        shaBefore,
        errorMessage,
        conflicted: isConflict
      };

      await this.eventBus.publishGitOperation(
        sessionId,
        iterationId,
        'merge',
        {
          shaBefore,
          filesChanged: 0,
          insertions: 0,
          deletions: 0,
          conflicted: isConflict,
          durationMs
        }
      );

      return result;
    }
  }

  async rebase(
    onto: string,
    sessionId: string,
    iterationId: string,
    interactive: boolean = false
  ): Promise<GitOperationResult> {
    const startTime = Date.now();
    const shaBefore = this.getCurrentSha();

    try {
      const args = ['rebase'];
      
      if (interactive) {
        args.push('-i');
      }
      
      args.push(onto);

      this.execGit(args);
      
      const shaAfter = this.getCurrentSha();
      const stats = this.getDiffStats(`${onto}..${shaAfter}`);
      const durationMs = Date.now() - startTime;

      const result: GitOperationResult = {
        success: true,
        durationMs,
        shaBefore,
        shaAfter,
        stats,
        conflicted: false
      };

      await this.eventBus.publishGitOperation(
        sessionId,
        iterationId,
        'rebase',
        {
          shaBefore,
          shaAfter,
          filesChanged: stats.filesChanged,
          insertions: stats.insertions,
          deletions: stats.deletions,
          conflicted: false,
          durationMs
        }
      );

      this.logger.debug(`Git rebase completed: ${shaBefore} -> ${shaAfter}`);
      
      return result;

    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isConflict = errorMessage.includes('CONFLICT') || errorMessage.includes('conflict');
      
      this.logger.error('Git rebase failed:', error);
      
      const result: GitOperationResult = {
        success: false,
        durationMs,
        shaBefore,
        errorMessage,
        conflicted: isConflict
      };

      await this.eventBus.publishGitOperation(
        sessionId,
        iterationId,
        'rebase',
        {
          shaBefore,
          filesChanged: 0,
          insertions: 0,
          deletions: 0,
          conflicted: isConflict,
          durationMs
        }
      );

      return result;
    }
  }

  async checkout(
    ref: string,
    sessionId: string,
    iterationId: string,
    createBranch: boolean = false
  ): Promise<GitOperationResult> {
    const startTime = Date.now();
    const shaBefore = this.getCurrentSha();

    try {
      const args = ['checkout'];
      
      if (createBranch) {
        args.push('-b');
      }
      
      args.push(ref);

      this.execGit(args);
      
      const shaAfter = this.getCurrentSha();
      const durationMs = Date.now() - startTime;

      const result: GitOperationResult = {
        success: true,
        durationMs,
        shaBefore,
        shaAfter,
        conflicted: false
      };

      await this.eventBus.publishGitOperation(
        sessionId,
        iterationId,
        'checkout',
        {
          shaBefore,
          shaAfter,
          filesChanged: 0,
          insertions: 0,
          deletions: 0,
          conflicted: false,
          durationMs
        }
      );

      this.logger.debug(`Git checkout completed: ${shaBefore} -> ${shaAfter}`);
      
      return result;

    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.logger.error('Git checkout failed:', error);
      
      const result: GitOperationResult = {
        success: false,
        durationMs,
        shaBefore,
        errorMessage,
        conflicted: false
      };

      await this.eventBus.publishGitOperation(
        sessionId,
        iterationId,
        'checkout',
        {
          shaBefore,
          filesChanged: 0,
          insertions: 0,
          deletions: 0,
          conflicted: false,
          durationMs
        }
      );

      return result;
    }
  }

  // Utility methods
  getCurrentSha(): string {
    try {
      return this.execGit(['rev-parse', 'HEAD']).toString().trim();
    } catch (error) {
      this.logger.warn('Could not get current SHA:', error);
      return '';
    }
  }

  getCurrentBranch(): string {
    try {
      return this.execGit(['rev-parse', '--abbrev-ref', 'HEAD']).toString().trim();
    } catch (error) {
      this.logger.warn('Could not get current branch:', error);
      return '';
    }
  }

  hasChangesToCommit(): boolean {
    try {
      const status = this.execGit(['status', '--porcelain']).toString().trim();
      return status.length > 0;
    } catch (error) {
      this.logger.warn('Could not check git status:', error);
      return false;
    }
  }

  getUncommittedChanges(): GitDiffStats {
    try {
      return this.getDiffStats('HEAD');
    } catch (error) {
      this.logger.warn('Could not get uncommitted changes:', error);
      return { filesChanged: 0, insertions: 0, deletions: 0 };
    }
  }

  getDiffStats(from?: string, to?: string): GitDiffStats {
    try {
      const args = ['diff', '--numstat'];
      
      if (from && to) {
        args.push(`${from}..${to}`);
      } else if (from) {
        args.push(from);
      }

      this.logger.debug(`Running git command: git ${args.join(' ')}`);
      const output = this.execGit(args).toString();
      this.logger.debug(`Git numstat output: ${JSON.stringify(output)}`);
      
      const lines = output.trim().split('\n').filter(line => line.length > 0);
      this.logger.debug(`Parsed ${lines.length} lines from numstat output`);
      
      let filesChanged = 0;
      let insertions = 0;
      let deletions = 0;

      for (const line of lines) {
        const parts = line.split('\t');
        if (parts.length >= 2) {
          // Handle cases where git shows '-' for binary files or special cases
          const addedStr = parts[0].trim();
          const deletedStr = parts[1].trim();
          
          const added = (addedStr === '-') ? 0 : parseInt(addedStr, 10) || 0;
          const deleted = (deletedStr === '-') ? 0 : parseInt(deletedStr, 10) || 0;
          
          this.logger.debug(`Git diff stats for ${parts[2] || 'file'}: +${added}/-${deleted} (raw: ${addedStr}/${deletedStr})`);
          
          filesChanged++;
          insertions += added;
          deletions += deleted;
        }
      }

      this.logger.debug(`Final diff stats: files=${filesChanged}, +${insertions}/-${deletions}`);
      return { filesChanged, insertions, deletions };

    } catch (error) {
      this.logger.warn('Could not get diff stats:', error);
      return { filesChanged: 0, insertions: 0, deletions: 0 };
    }
  }

  getCommitsBetween(from: string, to: string): string[] {
    try {
      const output = this.execGit(['rev-list', '--oneline', `${from}..${to}`]).toString();
      return output.trim().split('\n').filter(line => line.length > 0);
    } catch (error) {
      this.logger.warn('Could not get commits between refs:', error);
      return [];
    }
  }

  getManualCommitsSinceBase(baseBranch: string): number {
    try {
      const commits = this.getCommitsBetween(baseBranch, 'HEAD');
      // Count commits that don't start with "amp:"
      return commits.filter(commit => !commit.includes('amp:')).length;
    } catch (error) {
      this.logger.warn('Could not count manual commits:', error);
      return 0;
    }
  }

  isAheadOfBase(baseBranch: string): { ahead: number; behind: number } {
    try {
      const output = this.execGit(['rev-list', '--left-right', '--count', `${baseBranch}...HEAD`]).toString();
      const [behind, ahead] = output.trim().split('\t').map(n => parseInt(n, 10));
      return { ahead: ahead || 0, behind: behind || 0 };
    } catch (error) {
      this.logger.warn('Could not check if ahead of base:', error);
      return { ahead: 0, behind: 0 };
    }
  }

  private execGit(args: string[]): Buffer {
    try {
      return execSync(`git ${args.map(arg => `"${arg}"`).join(' ')}`, {
        cwd: this.cwd,
        stdio: 'pipe',
        encoding: 'buffer'
      });
    } catch (error) {
      this.logger.debug(`Git command failed: git ${args.join(' ')}`);
      throw error;
    }
  }
}

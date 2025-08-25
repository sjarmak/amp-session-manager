import { execSync } from 'child_process';
import { Logger } from '../utils/logger';

export interface FileDiff {
  path: string;
  linesAdded: number;
  linesDeleted: number;
  operation: 'create' | 'modify' | 'delete';
  diff?: string;
}

export class FileDiffTracker {
  private logger: Logger;
  private maxDiffLines: number;

  constructor(logger: Logger, maxDiffLines: number = 200) {
    this.logger = logger;
    this.maxDiffLines = maxDiffLines;
  }

  /**
   * Get file diffs since last commit
   */
  async getFileChanges(workingDir: string): Promise<FileDiff[]> {
    try {
      // Get git status to see what files have changed
      const statusOutput = this.executeGitCommand('git status --porcelain', workingDir);
      console.log(`[DIFF] Git status output: "${statusOutput}"`);
      this.logger.debug(`[DIFF] Git status output: "${statusOutput}"`);
      if (!statusOutput.trim()) {
        console.log(`[DIFF] No changes detected in status output`);
        this.logger.debug(`[DIFF] No changes detected in status output`);
        return []; // No changes
      }

      // Get detailed diff with stats - check both staged and unstaged
      const diffOutput = this.executeGitCommand('git diff --unified=0 --no-color', workingDir);
      const diffStatOutput = this.executeGitCommand('git diff --numstat', workingDir);
      this.logger.debug(`[DIFF] Unstaged diff stat output: "${diffStatOutput}"`);
      
      const stagedDiffOutput = this.executeGitCommand('git diff --cached --unified=0 --no-color', workingDir);
      const stagedDiffStatOutput = this.executeGitCommand('git diff --cached --numstat', workingDir);
      this.logger.debug(`[DIFF] Staged diff stat output: "${stagedDiffStatOutput}"`);

      // Parse both unstaged and staged changes
      const unstagedChanges = this.parseDiffOutput(diffOutput, diffStatOutput, statusOutput);
      const stagedChanges = this.parseDiffOutput(stagedDiffOutput, stagedDiffStatOutput, '');
      
      // Combine and deduplicate by path
      const allChanges = [...unstagedChanges];
      for (const stagedChange of stagedChanges) {
        const existingIndex = allChanges.findIndex(change => change.path === stagedChange.path);
        if (existingIndex >= 0) {
          // Merge the line counts for the same file
          allChanges[existingIndex].linesAdded += stagedChange.linesAdded;
          allChanges[existingIndex].linesDeleted += stagedChange.linesDeleted;
        } else {
          allChanges.push(stagedChange);
        }
      }
      
      return allChanges;
    } catch (error) {
      this.logger.error('Failed to get file changes:', error);
      return [];
    }
  }

  /**
   * Get file diffs between two commits
   */
  async getFileChangesBetweenCommits(
    workingDir: string, 
    fromCommit: string, 
    toCommit: string = 'HEAD'
  ): Promise<FileDiff[]> {
    try {
      const diffOutput = this.executeGitCommand(
        `git diff --unified=0 --no-color ${fromCommit}..${toCommit}`, 
        workingDir
      );
      const diffStatOutput = this.executeGitCommand(
        `git diff --numstat ${fromCommit}..${toCommit}`, 
        workingDir
      );
      const statusOutput = this.executeGitCommand(
        `git diff --name-status ${fromCommit}..${toCommit}`, 
        workingDir
      );

      return this.parseDiffOutput(diffOutput, diffStatOutput, statusOutput);
    } catch (error) {
      this.logger.error('Failed to get file changes between commits:', error);
      return [];
    }
  }

  private executeGitCommand(command: string, workingDir: string): string {
    try {
      return execSync(command, {
        cwd: workingDir,
        encoding: 'utf-8',
        timeout: 10000, // 10 second timeout
        stdio: 'pipe'
      });
    } catch (error: any) {
      if (error.status === 128 || error.stderr?.includes('not a git repository')) {
        this.logger.debug('Not a git repository or no changes:', workingDir);
        return '';
      }
      throw error;
    }
  }

  private parseDiffOutput(diffOutput: string, statOutput: string, statusOutput: string): FileDiff[] {
    const results: FileDiff[] = [];
    
    // Parse diff stats (lines added/deleted per file)
    const statLines = statOutput.trim().split('\n').filter(line => line.trim());
    const statusLines = statusOutput.trim().split('\n').filter(line => line.trim());
    
    const fileStats: Record<string, { added: number; deleted: number; operation: 'create' | 'modify' | 'delete' }> = {};
    
    // Parse numstat output: <added>\t<deleted>\t<filename>
    for (const line of statLines) {
      const parts = line.split('\t');
      if (parts.length >= 3) {
        const added = parts[0] === '-' ? 0 : parseInt(parts[0], 10) || 0;
        const deleted = parts[1] === '-' ? 0 : parseInt(parts[1], 10) || 0;
        const filename = parts[2];
        
        fileStats[filename] = {
          added,
          deleted,
          operation: 'modify' // default, will be overridden by status
        };
      }
    }
    
    // Parse status output to determine operation type
    for (const line of statusLines) {
      if (line.length >= 2) {
        const status = line.substring(0, 2);
        const filename = line.substring(3);
        
        if (fileStats[filename]) {
          if (status.includes('A') || status.includes('N')) {
            fileStats[filename].operation = 'create';
          } else if (status.includes('D')) {
            fileStats[filename].operation = 'delete';
          } else {
            fileStats[filename].operation = 'modify';
          }
        }
      }
    }
    
    // Extract diff content for each file
    const fileDiffs = this.extractFileDiffs(diffOutput);
    
    // Combine stats and diffs
    for (const [filename, stats] of Object.entries(fileStats)) {
      const diff = fileDiffs[filename] || '';
      const truncatedDiff = this.truncateDiff(diff);
      
      results.push({
        path: filename,
        linesAdded: stats.added,
        linesDeleted: stats.deleted,
        operation: stats.operation,
        diff: truncatedDiff
      });
    }
    
    return results;
  }

  private extractFileDiffs(diffOutput: string): Record<string, string> {
    const fileDiffs: Record<string, string> = {};
    const lines = diffOutput.split('\n');
    
    let currentFile: string | null = null;
    let currentDiff: string[] = [];
    
    for (const line of lines) {
      // Look for file headers: diff --git a/file b/file
      if (line.startsWith('diff --git ')) {
        // Save previous file if exists
        if (currentFile && currentDiff.length > 0) {
          fileDiffs[currentFile] = currentDiff.join('\n');
        }
        
        // Extract filename from diff header
        const match = line.match(/diff --git a\/(.+) b\/(.+)$/);
        if (match) {
          currentFile = match[2]; // Use the 'b' filename (destination)
          currentDiff = [line];
        }
      } else if (currentFile) {
        currentDiff.push(line);
      }
    }
    
    // Save the last file
    if (currentFile && currentDiff.length > 0) {
      fileDiffs[currentFile] = currentDiff.join('\n');
    }
    
    return fileDiffs;
  }

  private truncateDiff(diff: string): string {
    if (!diff) return '';
    
    const lines = diff.split('\n');
    if (lines.length <= this.maxDiffLines) {
      return diff;
    }
    
    const truncated = lines.slice(0, this.maxDiffLines).join('\n');
    const remaining = lines.length - this.maxDiffLines;
    
    return `${truncated}\n... (${remaining} more lines truncated)`;
  }

  /**
   * Check if there are any uncommitted changes
   */
  async hasUncommittedChanges(workingDir: string): Promise<boolean> {
    try {
      const status = this.executeGitCommand('git status --porcelain', workingDir);
      return status.trim().length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Get the current git commit SHA
   */
  async getCurrentCommit(workingDir: string): Promise<string | null> {
    try {
      const sha = this.executeGitCommand('git rev-parse HEAD', workingDir);
      return sha.trim();
    } catch {
      return null;
    }
  }
}

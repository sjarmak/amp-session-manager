import { spawn } from 'child_process';

export class GitOps {
  constructor(private repoRoot: string) {}

  async exec(args: string[], cwd?: string, timeoutMs?: number): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve, reject) => {
      const gitPath = process.env.GIT_PATH || 'git';
      const workingDir = cwd || this.repoRoot;
      const timeout = timeoutMs || 30000; // 30 second default timeout
      
      // Validate working directory exists
      try {
        const fs = require('fs');
        if (!fs.existsSync(workingDir)) {
          throw new Error(`Working directory does not exist: ${workingDir}`);
        }
      } catch (error) {
        reject(new Error(`Invalid working directory ${workingDir}: ${error instanceof Error ? error.message : String(error)}`));
        return;
      }
      
      const child = spawn(gitPath, args, { 
        cwd: workingDir,
        stdio: ['inherit', 'pipe', 'pipe'],
        env: { ...process.env, PATH: process.env.PATH || '' }
      });
      
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      
      // Add timeout to prevent hanging
      const timeoutHandle = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        
        // If SIGTERM doesn't work after 5 seconds, use SIGKILL
        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL');
          }
        }, 5000);
        
        reject(new Error(`Git command timed out after ${timeout}ms: git ${args.join(' ')}\nWorking directory: ${workingDir}`));
      }, timeout);
      
      child.stdout?.on('data', (data) => stdout += data.toString());
      child.stderr?.on('data', (data) => stderr += data.toString());
      
      child.on('error', (error) => {
        clearTimeout(timeoutHandle);
        if (!timedOut) {
          const errorMessage = (error as any).code === 'ENOENT' 
            ? `Git executable not found. Make sure git is installed and available in PATH.`
            : `Failed to spawn git process: ${error.message}`;
          reject(new Error(`${errorMessage}\nCommand: git ${args.join(' ')}\nWorking directory: ${workingDir}`));
        }
      });
      
      child.on('close', (exitCode) => {
        clearTimeout(timeoutHandle);
        if (!timedOut) {
          const result = { stdout, stderr, exitCode: exitCode || 0 };
          
          // Add context to common error scenarios
          if (result.exitCode !== 0) {
            const command = `git ${args.join(' ')}`;
            const context = `Command: ${command}\nWorking directory: ${workingDir}\nExit code: ${result.exitCode}`;
            
            // Common git error scenarios
            if (stderr.includes('not a git repository')) {
              result.stderr += `\n\nThis appears to not be a git repository. ${context}`;
            } else if (stderr.includes('could not read config file')) {
              result.stderr += `\n\nGit configuration issue. ${context}`;
            } else if (stderr.includes('Permission denied')) {
              result.stderr += `\n\nPermission denied. Check file permissions and access rights. ${context}`;
            } else if (stderr.includes('No such file or directory')) {
              result.stderr += `\n\nFile or directory not found. ${context}`;
            } else {
              result.stderr += `\n\n${context}`;
            }
          }
          
          resolve(result);
        }
      });
    });
  }

  async init(): Promise<void> {
    await this.exec(['init']);
  }

  async isRepo(): Promise<boolean> {
    const result = await this.exec(['rev-parse', '--is-inside-work-tree']);
    return result.exitCode === 0;
  }

  public async getDefaultBranch(): Promise<string> {
    // Try to get the default branch from remote HEAD
    const defaultBranchResult = await this.exec(['symbolic-ref', 'refs/remotes/origin/HEAD']);
    if (defaultBranchResult.exitCode === 0) {
      return defaultBranchResult.stdout.trim().replace('refs/remotes/origin/', '');
    }
    
    // Fallback: try to get current branch
    const currentBranchResult = await this.exec(['rev-parse', '--abbrev-ref', 'HEAD']);
    if (currentBranchResult.exitCode === 0) {
      return currentBranchResult.stdout.trim();
    }
    
    // Last fallback: return 'main'
    return 'main';
  }

  async createWorktree(branchName: string, worktreePath: string, baseBranch: string = 'main'): Promise<void> {
    const maxRetries = 3;
    let attempt = 0;
    
    while (attempt < maxRetries) {
      try {
        await this.createWorktreeInternal(branchName, worktreePath, baseBranch);
        return; // Success
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // Check if it's a git lock error
        if (errorMessage.includes('index.lock') || errorMessage.includes('Another git process')) {
          attempt++;
          if (attempt < maxRetries) {
            console.log(`Git lock conflict detected (attempt ${attempt}/${maxRetries}), retrying in ${attempt * 2} seconds...`);
            await new Promise(resolve => setTimeout(resolve, attempt * 2000));
            
            // Try to clean up stale lock files
            await this.cleanupGitLocks();
            continue;
          }
        }
        
        // Not a lock error or max retries reached
        throw error;
      }
    }
  }

  private async createWorktreeInternal(branchName: string, worktreePath: string, baseBranch: string): Promise<void> {
    try {
      // Check if repository has any commits
      const hasCommitsResult = await this.exec(['rev-list', '--count', 'HEAD']);
      if (hasCommitsResult.exitCode !== 0) {
        throw new Error(`Repository has no commits yet. Please make an initial commit before creating sessions.`);
      }
      
      // Check if baseBranch exists
      const branchExistsResult = await this.exec(['rev-parse', '--verify', baseBranch]);
      if (branchExistsResult.exitCode !== 0) {
        // Try to find the default branch
        const defaultBranchResult = await this.exec(['symbolic-ref', 'refs/remotes/origin/HEAD']);
        if (defaultBranchResult.exitCode === 0) {
          const defaultBranch = defaultBranchResult.stdout.trim().replace('refs/remotes/origin/', '');
          throw new Error(`Branch '${baseBranch}' does not exist. The repository's default branch appears to be '${defaultBranch}'. Please use --base ${defaultBranch} or create the '${baseBranch}' branch.`);
        } else {
          // List available branches
          const branchesResult = await this.exec(['branch', '-a']);
          const branches = branchesResult.stdout.split('\n')
            .map(line => line.trim().replace(/^\*\s*/, '').replace(/^remotes\/origin\//, ''))
            .filter(line => line && !line.includes('HEAD ->'))
            .slice(0, 5); // Show first 5 branches
          
          throw new Error(`Branch '${baseBranch}' does not exist. Available branches: ${branches.join(', ')}. Please use --base <branch-name> to specify an existing branch.`);
        }
      }
      
      // Check if we have any remotes
      const remotesResult = await this.exec(['remote']);
      const hasRemotes = remotesResult.exitCode === 0 && remotesResult.stdout.trim().length > 0;
      
      if (hasRemotes) {
        // Ensure clean base only if we have remotes
        const fetchResult = await this.exec(['fetch', '--all', '--prune']);
        if (fetchResult.exitCode !== 0) {
          throw new Error(`Failed to fetch: ${fetchResult.stderr}`);
        }
      }
      
      const checkoutResult = await this.exec(['checkout', baseBranch]);
      if (checkoutResult.exitCode !== 0) {
        throw new Error(`Failed to checkout ${baseBranch}: ${checkoutResult.stderr}`);
      }
      
      if (hasRemotes) {
        // Only try to pull if we have remotes
        const pullResult = await this.exec(['pull', '--ff-only']);
        if (pullResult.exitCode !== 0) {
          throw new Error(`Failed to pull ${baseBranch}: ${pullResult.stderr}`);
        }
      }
      
      // Create branch and worktree
      const branchResult = await this.exec(['branch', branchName, baseBranch]);
      if (branchResult.exitCode !== 0) {
        throw new Error(`Failed to create branch ${branchName}: ${branchResult.stderr}`);
      }
      
      const worktreeResult = await this.exec(['worktree', 'add', worktreePath, branchName]);
      if (worktreeResult.exitCode !== 0) {
        // Cleanup the branch if worktree creation failed
        await this.exec(['branch', '-D', branchName]).catch(() => {});
        throw new Error(`Failed to create worktree: ${worktreeResult.stderr}`);
      }
    } catch (error) {
      throw new Error(`Worktree creation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async removeWorktree(worktreePath: string, branchName: string): Promise<void> {
    await this.exec(['worktree', 'remove', worktreePath]);
    await this.exec(['branch', '-D', branchName]);
  }

  async getDiff(worktreePath: string): Promise<string> {
    const result = await this.exec(['diff', '--unified=0', '--no-color'], worktreePath);
    return result.stdout;
  }

  async commitChanges(message: string, worktreePath: string): Promise<string | null> {
    await this.exec(['add', '-A'], worktreePath);
    
    const statusResult = await this.exec(['diff', '--cached', '--quiet'], worktreePath);
    if (statusResult.exitCode === 0) {
      return null; // No changes to commit
    }
    
    const commitResult = await this.exec(['commit', '-m', message], worktreePath);
    if (commitResult.exitCode !== 0) {
      throw new Error(`Failed to commit: ${commitResult.stderr}`);
    }
    
    const shaResult = await this.exec(['rev-parse', 'HEAD'], worktreePath);
    return shaResult.stdout.trim();
  }

  async hasChanges(worktreePath: string): Promise<boolean> {
    const result = await this.exec(['status', '--porcelain'], worktreePath);
    return result.stdout.trim().length > 0;
  }

  async getChangedFiles(worktreePath: string): Promise<string[]> {
    const result = await this.exec(['status', '--porcelain'], worktreePath);
    if (!result.stdout.trim()) {
      return [];
    }
    
    return result.stdout
      .trim()
      .split('\n')
      .map(line => line.substring(3)) // Remove status codes (first 3 characters)
      .filter(filename => filename.length > 0);
  }

  async getBranchInfo(worktreePath: string, baseBranch: string): Promise<{
    aheadBy: number;
    behindBy: number;
    branchpointSha: string;
  }> {
    // Get ahead/behind count
    const countResult = await this.exec(['rev-list', '--left-right', '--count', `${baseBranch}...HEAD`], worktreePath);
    const [behindBy, aheadBy] = countResult.stdout.trim().split('\t').map(Number);
    
    // Get branchpoint (merge-base)
    const branchpointResult = await this.exec(['merge-base', baseBranch, 'HEAD'], worktreePath);
    const branchpointSha = branchpointResult.stdout.trim();
    
    return { aheadBy, behindBy, branchpointSha };
  }

  async getAmpCommitsCount(worktreePath: string, branchpointSha: string): Promise<number> {
    const result = await this.exec(['rev-list', '--count', '--grep=^amp:', `${branchpointSha}..HEAD`], worktreePath);
    return parseInt(result.stdout.trim()) || 0;
  }

  async isRepoClean(worktreePath: string): Promise<boolean> {
    const result = await this.exec(['status', '--porcelain'], worktreePath);
    return result.stdout.trim().length === 0;
  }

  async isBaseUpToDate(baseBranch: string): Promise<boolean> {
    // Check if we have any remotes
    const remotesResult = await this.exec(['remote']);
    const hasRemotes = remotesResult.exitCode === 0 && remotesResult.stdout.trim().length > 0;
    
    if (!hasRemotes) {
      // No remotes, consider base up to date
      return true;
    }
    
    // Check if origin exists specifically
    const originCheck = await this.exec(['remote', 'get-url', 'origin']);
    if (originCheck.exitCode !== 0) {
      // Origin doesn't exist, consider base up to date
      return true;
    }
    
    await this.exec(['fetch', '--all', '--prune']);
    const result = await this.exec(['rev-list', '--count', `${baseBranch}..origin/${baseBranch}`]);
    return parseInt(result.stdout.trim()) === 0;
  }

  async squashCommits(baseBranch: string, message: string, worktreePath: string, includeManual: 'include' | 'exclude' = 'include'): Promise<void> {
    if (includeManual === 'include') {
      // Squash all commits since base branch
      await this.exec(['reset', '--soft', baseBranch], worktreePath);
      await this.exec(['commit', '-m', message, '--date=now'], worktreePath);
    } else {
      // More complex logic to preserve manual commits - implement interactive rebase
      const branchInfo = await this.getBranchInfo(worktreePath, baseBranch);
      const commits = await this.exec(['rev-list', '--reverse', `${branchInfo.branchpointSha}..HEAD`], worktreePath);
      const commitShas = commits.stdout.trim().split('\n').filter(Boolean);
      
      // For now, implement simple approach - we can enhance this later
      await this.exec(['reset', '--soft', baseBranch], worktreePath);
      await this.exec(['commit', '-m', message, '--date=now'], worktreePath);
    }
  }

  async rebaseOntoBase(baseBranch: string, worktreePath: string): Promise<{ status: 'ok' | 'conflict'; files?: string[] }> {
    await this.exec(['fetch', '--all', '--prune'], worktreePath);
    const result = await this.exec(['rebase', baseBranch], worktreePath);
    
    if (result.exitCode !== 0) {
      // Get conflicted files
      const conflictResult = await this.exec(['diff', '--name-only', '--diff-filter=U'], worktreePath);
      const files = conflictResult.stdout.trim().split('\n').filter(Boolean);
      
      return { status: 'conflict', files };
    }
    
    return { status: 'ok' };
  }

  async continueRebase(worktreePath: string): Promise<{ status: 'ok' | 'conflict'; files?: string[] }> {
    const result = await this.exec(['rebase', '--continue'], worktreePath);
    
    if (result.exitCode !== 0) {
      // Get conflicted files
      const conflictResult = await this.exec(['diff', '--name-only', '--diff-filter=U'], worktreePath);
      const files = conflictResult.stdout.trim().split('\n').filter(Boolean);
      
      return { status: 'conflict', files };
    }
    
    return { status: 'ok' };
  }

  async abortRebase(worktreePath: string): Promise<void> {
    await this.exec(['rebase', '--abort'], worktreePath);
  }

  async fastForwardMerge(branchName: string, baseBranch: string, noFF?: boolean): Promise<void> {
    await this.exec(['checkout', baseBranch]);
    const mergeArgs = ['merge'];
    if (noFF) {
      mergeArgs.push('--no-ff');
    } else {
      mergeArgs.push('--ff-only');
    }
    mergeArgs.push(branchName);
    
    const result = await this.exec(mergeArgs);
    if (result.exitCode !== 0) {
      throw new Error(`Merge failed: ${result.stderr}`);
    }
  }

  async exportPatch(outPath: string, worktreePath: string): Promise<void> {
    const result = await this.exec(['format-patch', '-1', 'HEAD', '--stdout'], worktreePath);
    const fs = await import('fs/promises');
    await fs.writeFile(outPath, result.stdout);
  }

  async isCommitReachableFromBase(baseBranch: string, worktreePath: string): Promise<boolean> {
    // Check if HEAD is reachable from baseBranch (i.e., the session has been merged)
    const result = await this.exec(['merge-base', '--is-ancestor', 'HEAD', baseBranch], worktreePath);
    return result.exitCode === 0;
  }

  private async cleanupGitLocks(): Promise<void> {
    try {
      const fs = require('fs');
      const path = require('path');
      
      // Common git lock files to clean up
      const lockFiles = [
        path.join(this.repoRoot, '.git', 'index.lock'),
        path.join(this.repoRoot, '.git', 'HEAD.lock'),
        path.join(this.repoRoot, '.git', 'config.lock')
      ];
      
      for (const lockFile of lockFiles) {
        if (fs.existsSync(lockFile)) {
          try {
            // Check if lock file is stale (older than 5 minutes)
            const stats = fs.statSync(lockFile);
            const age = Date.now() - stats.mtime.getTime();
            if (age > 5 * 60 * 1000) { // 5 minutes
              fs.unlinkSync(lockFile);
              console.log(`Cleaned up stale git lock: ${lockFile}`);
            }
          } catch (error) {
            // Lock file might be in use or already removed
          }
        }
      }
    } catch (error) {
      // Non-fatal cleanup error
    }
  }

  async safeRemoveWorktreeAndBranch(worktreePath: string, branchName: string, baseBranch: string): Promise<void> {
    // Check if worktree exists
    const fs = await import('fs/promises');
    const worktreeExists = await fs.access(worktreePath).then(() => true).catch(() => false);
    
    if (worktreeExists) {
      // Verify the commit is reachable from base branch
      const isReachable = await this.isCommitReachableFromBase(baseBranch, worktreePath);
      if (!isReachable) {
        throw new Error('Session commit is not reachable from base branch. Cannot safely delete.');
      }
      
      await this.exec(['worktree', 'remove', worktreePath]);
    } else {
      // Worktree doesn't exist, just remove it from git's worktree list
      try {
        await this.exec(['worktree', 'remove', worktreePath]);
      } catch (error) {
        // Ignore error if worktree is already not in git's list
      }
    }
    
    // Always try to delete the branch
    try {
      await this.exec(['branch', '-D', branchName]);
    } catch (error) {
      // Branch might not exist, ignore error
    }
  }

  async forceRemoveWorktreeAndBranch(worktreePath: string, branchName: string): Promise<void> {
    // Force remove without safety checks
    try {
      await this.exec(['worktree', 'remove', '--force', worktreePath]);
    } catch (error) {
      // Worktree might not exist, ignore error
    }
    
    try {
      await this.exec(['branch', '-D', branchName]);
    } catch (error) {
      // Branch might not exist, ignore error
    }
    
    // Ensure physical directory is removed
    try {
      const { access, rm } = await import('fs/promises');
      await access(worktreePath); // Check if still exists
      await rm(worktreePath, { recursive: true, force: true });
      console.log(`✓ Removed residual directory ${worktreePath}`);
    } catch {
      // Directory already gone or never existed
    }
  }
}

import { spawn } from 'child_process';

export class GitOps {
  constructor(private repoRoot: string) {}

  async exec(args: string[], cwd?: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve) => {
      const gitPath = process.env.GIT_PATH || 'git';
      const child = spawn(gitPath, args, { 
        cwd: cwd || this.repoRoot,
        stdio: ['inherit', 'pipe', 'pipe'],
        env: { ...process.env, PATH: process.env.PATH || '' }
      });
      
      let stdout = '';
      let stderr = '';
      
      child.stdout?.on('data', (data) => stdout += data.toString());
      child.stderr?.on('data', (data) => stderr += data.toString());
      
      child.on('close', (exitCode) => {
        resolve({ stdout, stderr, exitCode: exitCode || 0 });
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

  async createWorktree(branchName: string, worktreePath: string, baseBranch: string = 'main'): Promise<void> {
    // Ensure clean base
    await this.exec(['fetch', '--all', '--prune']);
    await this.exec(['checkout', baseBranch]);
    await this.exec(['pull', '--ff-only']);
    
    // Create branch and worktree
    await this.exec(['branch', branchName, baseBranch]);
    await this.exec(['worktree', 'add', worktreePath, branchName]);
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
    const result = await this.exec(['merge-base', '--is-ancestor', baseBranch, 'HEAD'], worktreePath);
    return result.exitCode === 0;
  }

  async safeRemoveWorktreeAndBranch(worktreePath: string, branchName: string, baseBranch: string): Promise<void> {
    // Verify the commit is reachable from base branch
    const isReachable = await this.isCommitReachableFromBase(baseBranch, worktreePath);
    if (!isReachable) {
      throw new Error('Session commit is not reachable from base branch. Cannot safely delete.');
    }
    
    await this.exec(['worktree', 'remove', worktreePath]);
    await this.exec(['branch', '-D', branchName]);
  }

  async forceRemoveWorktreeAndBranch(worktreePath: string, branchName: string): Promise<void> {
    // Force remove without safety checks
    await this.exec(['worktree', 'remove', '--force', worktreePath]);
    await this.exec(['branch', '-D', branchName]);
  }
}

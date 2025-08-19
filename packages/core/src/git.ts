import { spawn } from 'child_process';

export class GitOps {
  constructor(private repoRoot: string) {}

  async exec(args: string[], cwd?: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve) => {
      const child = spawn('git', args, { 
        cwd: cwd || this.repoRoot,
        stdio: ['inherit', 'pipe', 'pipe']
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
}

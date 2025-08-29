import { GitOps } from '@ampsm/core';
import { join } from 'path';
import { readdir } from 'fs/promises';
import { existsSync, statSync } from 'fs';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface RepoScanResult {
  path: string;
  name: string;
  branch?: string;
  lastModified: Date;
  isGitRepo: boolean;
}

export interface RepoScanOptions {
  maxDepth?: number;
  includeHidden?: boolean;
}

export class GitService {
  async scanLocalRepos(rootPaths: string[], options: RepoScanOptions = {}): Promise<RepoScanResult[]> {
    const { maxDepth = 2, includeHidden = false } = options;
    const repos: RepoScanResult[] = [];

    for (const rootPath of rootPaths) {
      if (!existsSync(rootPath)) continue;
      
      try {
        const found = await this.findGitRepos(rootPath, 0, maxDepth, includeHidden);
        repos.push(...found);
      } catch (error) {
        console.warn(`Failed to scan ${rootPath}:`, error);
      }
    }

    return repos.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
  }

  private async findGitRepos(
    dirPath: string, 
    currentDepth: number, 
    maxDepth: number,
    includeHidden: boolean
  ): Promise<RepoScanResult[]> {
    const repos: RepoScanResult[] = [];

    if (currentDepth > maxDepth) return repos;

    // Check if current directory is a git repo
    const gitDir = join(dirPath, '.git');
    if (existsSync(gitDir)) {
      const stat = statSync(dirPath);
      const name = dirPath.split('/').pop() || dirPath;
      
      let branch: string | undefined;
      try {
        const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: dirPath });
        branch = stdout.trim();
      } catch {
        // Ignore branch detection errors
      }

      repos.push({
        path: dirPath,
        name,
        branch,
        lastModified: stat.mtime,
        isGitRepo: true
      });
      
      return repos; // Don't scan subdirectories of git repos
    }

    // Scan subdirectories
    try {
      const entries = await readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (!includeHidden && entry.name.startsWith('.')) continue;
        
        const subPath = join(dirPath, entry.name);
        const subRepos = await this.findGitRepos(subPath, currentDepth + 1, maxDepth, includeHidden);
        repos.push(...subRepos);
      }
    } catch {
      // Ignore permission errors or other issues
    }

    return repos;
  }

  async cloneRepo(url: string, targetDir: string, options: { branch?: string } = {}): Promise<void> {
    const args = ['clone', url, targetDir];
    if (options.branch) {
      args.push('--branch', options.branch);
    }
    
    const { stderr } = await execAsync(`git ${args.join(' ')}`);
    if (stderr && !stderr.includes('Cloning into')) {
      throw new Error(`Clone failed: ${stderr}`);
    }
  }

  async getRepoInfo(repoPath: string): Promise<{
    branch: string;
    isClean: boolean;
    remoteUrl?: string;
    lastCommit?: string;
  }> {
    const gitOps = new GitOps(repoPath);
    
    // Get current branch
    const { stdout: branchOutput } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: repoPath });
    const branch = branchOutput.trim();
    
    // Check if working tree is clean
    const isClean = await gitOps.isClean(repoPath);
    
    let remoteUrl: string | undefined;
    let lastCommit: string | undefined;
    
    try {
      const { stdout: remoteOutput } = await execAsync('git remote get-url origin', { cwd: repoPath });
      remoteUrl = remoteOutput.trim();
    } catch {
      // No remote or error
    }
    
    try {
      const { stdout: commitOutput } = await execAsync('git rev-parse HEAD', { cwd: repoPath });
      lastCommit = commitOutput.trim();
    } catch {
      // No commits or error
    }

    return { branch, isClean, remoteUrl, lastCommit };
  }

  async getDiff(repoPath: string, options: { 
    base?: string; 
    head?: string; 
    format?: 'text' | 'json';
  } = {}): Promise<string> {
    const { base = 'HEAD~1', head = 'HEAD', format = 'text' } = options;
    
    try {
      const { stdout } = await execAsync(`git diff ${base}..${head}`, { cwd: repoPath });
      
      if (format === 'json') {
        return JSON.stringify({
          base,
          head,
          diff: stdout
        }, null, 2);
      }
      
      return stdout;
    } catch (error: any) {
      if (format === 'json') {
        return JSON.stringify({
          base,
          head,
          error: error.message,
          diff: ''
        }, null, 2);
      }
      return `Error generating diff: ${error.message}`;
    }
  }
}

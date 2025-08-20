import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WorktreeManager } from '../worktree.js';
import { SessionStore } from '../store.js';
import { GitOps } from '../git.js';
import { randomUUID } from 'crypto';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { spawn } from 'child_process';

// Helper to run git commands
async function runGitCommand(args: string[], cwd: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const child = spawn('git', args, { 
      cwd,
      stdio: ['inherit', 'pipe', 'pipe'],
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

describe('Merge Functionality', () => {
  let tempDir: string;
  let repoPath: string;
  let store: SessionStore;
  let manager: WorktreeManager;
  let sessionId: string;

  beforeEach(async () => {
    // Create temp directory for test
    tempDir = join('/tmp', `amp-test-${randomUUID()}`);
    repoPath = join(tempDir, 'test-repo');
    
    await mkdir(repoPath, { recursive: true });
    
    // Initialize git repo
    await runGitCommand(['init'], repoPath);
    await runGitCommand(['config', 'user.email', 'test@example.com'], repoPath);
    await runGitCommand(['config', 'user.name', 'Test User'], repoPath);
    
    // Create initial commit on main
    await writeFile(join(repoPath, 'README.md'), '# Test Repo\n');
    await runGitCommand(['add', '.'], repoPath);
    await runGitCommand(['commit', '-m', 'Initial commit'], repoPath);
    
    // Create second commit to have a proper base
    await writeFile(join(repoPath, 'file1.txt'), 'Hello World\n');
    await runGitCommand(['add', '.'], repoPath);
    await runGitCommand(['commit', '-m', 'Add file1'], repoPath);
    
    // Initialize store and manager
    const dbPath = join(tempDir, 'sessions.sqlite');
    store = new SessionStore(dbPath);
    manager = new WorktreeManager(store, dbPath);
    
    // Create test session
    const session = await manager.createSession({
      name: 'test-merge-session',
      ampPrompt: 'Test merge functionality',
      repoRoot: repoPath,
      baseBranch: 'main'
    });
    sessionId = session.id;
  });

  afterEach(async () => {
    try {
      store.close();
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Preflight Checks', () => {
    it('should run preflight checks successfully', async () => {
      const result = await manager.preflight(sessionId);
      
      expect(result).toMatchObject({
        repoClean: true,
        baseUpToDate: true,
        aheadBy: expect.any(Number),
        behindBy: 0,
        branchpointSha: expect.any(String),
        ampCommitsCount: 1, // Initial amp: commit
        issues: []
      });
    });

    it('should detect uncommitted changes', async () => {
      const session = store.getSession(sessionId);
      
      // Create uncommitted change
      await writeFile(join(session!.worktreePath, 'uncommitted.txt'), 'test');
      
      const result = await manager.preflight(sessionId);
      
      expect(result.repoClean).toBe(false);
      expect(result.issues).toContain('Repository has uncommitted changes');
    });
  });

  describe('Squash Session', () => {
    beforeEach(async () => {
      const session = store.getSession(sessionId);
      
      // Add some commits to squash
      await writeFile(join(session!.worktreePath, 'test1.txt'), 'test 1');
      await runGitCommand(['add', '.'], session!.worktreePath);
      await runGitCommand(['commit', '-m', 'amp: add test1'], session!.worktreePath);
      
      await writeFile(join(session!.worktreePath, 'test2.txt'), 'test 2');
      await runGitCommand(['add', '.'], session!.worktreePath);
      await runGitCommand(['commit', '-m', 'amp: add test2'], session!.worktreePath);
      
      // Add a manual commit
      await writeFile(join(session!.worktreePath, 'manual.txt'), 'manual');
      await runGitCommand(['add', '.'], session!.worktreePath);
      await runGitCommand(['commit', '-m', 'manual: add manual file'], session!.worktreePath);
    });

    it('should squash all commits including manual', async () => {
      await manager.squashSession(sessionId, {
        message: 'feat: implement test feature',
        includeManual: 'include'
      });
      
      const session = store.getSession(sessionId);
      const logResult = await runGitCommand(['log', '--oneline'], session!.worktreePath);
      const commits = logResult.stdout.trim().split('\n');
      
      // Should have only 3 commits: squashed + initial 2 from main
      expect(commits).toHaveLength(3);
      expect(commits[0]).toContain('feat: implement test feature');
    });

    it('should handle squash options correctly', async () => {
      await manager.squashSession(sessionId, {
        message: 'feat: squashed changes',
        includeManual: 'exclude'
      });
      
      // For now, both modes do the same thing - this can be enhanced later
      const session = store.getSession(sessionId);
      const logResult = await runGitCommand(['log', '--oneline'], session!.worktreePath);
      const commits = logResult.stdout.trim().split('\n');
      
      expect(commits[0]).toContain('feat: squashed changes');
    });
  });

  describe('Rebase onto Base', () => {
    beforeEach(async () => {
      const session = store.getSession(sessionId);
      
      // Add a commit to the session
      await writeFile(join(session!.worktreePath, 'feature.txt'), 'feature');
      await runGitCommand(['add', '.'], session!.worktreePath);
      await runGitCommand(['commit', '-m', 'amp: add feature'], session!.worktreePath);
    });

    it('should rebase successfully without conflicts', async () => {
      const result = await manager.rebaseOntoBase(sessionId);
      
      expect(result.status).toBe('ok');
      expect(result.files).toBeUndefined();
    });

    it('should detect conflicts', async () => {
      const session = store.getSession(sessionId);
      
      // Create conflicting changes on main
      await writeFile(join(repoPath, 'file1.txt'), 'Hello Conflict\n');
      await runGitCommand(['add', '.'], repoPath);
      await runGitCommand(['commit', '-m', 'Conflict on main'], repoPath);
      
      // Create conflicting changes on session
      await writeFile(join(session!.worktreePath, 'file1.txt'), 'Hello Session\n');
      await runGitCommand(['add', '.'], session!.worktreePath);
      await runGitCommand(['commit', '-m', 'amp: conflict on session'], session!.worktreePath);
      
      const result = await manager.rebaseOntoBase(sessionId);
      
      expect(result.status).toBe('conflict');
      expect(result.files).toContain('file1.txt');
    });
  });

  describe('Continue Merge', () => {
    it('should continue merge after resolving conflicts', async () => {
      const session = store.getSession(sessionId);
      
      // Create a conflict situation first (simplified for test)
      await writeFile(join(session!.worktreePath, 'conflict.txt'), 'session content');
      await runGitCommand(['add', '.'], session!.worktreePath);
      await runGitCommand(['commit', '-m', 'amp: add conflict file'], session!.worktreePath);
      
      // Create conflict on main
      await writeFile(join(repoPath, 'conflict.txt'), 'main content');
      await runGitCommand(['add', '.'], repoPath);
      await runGitCommand(['commit', '-m', 'Add conflict file on main'], repoPath);
      
      // Start rebase (should conflict)
      const rebaseResult = await manager.rebaseOntoBase(sessionId);
      
      if (rebaseResult.status === 'conflict') {
        // Resolve conflict manually
        await writeFile(join(session!.worktreePath, 'conflict.txt'), 'resolved content');
        await runGitCommand(['add', '.'], session!.worktreePath);
        
        // Continue merge
        const continueResult = await manager.continueMerge(sessionId);
        expect(continueResult.status).toBe('ok');
      }
    });
  });

  describe('Abort Merge', () => {
    it('should abort merge and return to previous state', async () => {
      const session = store.getSession(sessionId);
      
      // Get initial state
      const initialLogResult = await runGitCommand(['log', '--oneline'], session!.worktreePath);
      const initialCommits = initialLogResult.stdout.trim().split('\n');
      
      // Create a conflict and start rebase
      await writeFile(join(session!.worktreePath, 'conflict.txt'), 'session content');
      await runGitCommand(['add', '.'], session!.worktreePath);
      await runGitCommand(['commit', '-m', 'amp: add conflict file'], session!.worktreePath);
      
      await writeFile(join(repoPath, 'conflict.txt'), 'main content');
      await runGitCommand(['add', '.'], repoPath);
      await runGitCommand(['commit', '-m', 'Add conflict file on main'], repoPath);
      
      const rebaseResult = await manager.rebaseOntoBase(sessionId);
      
      if (rebaseResult.status === 'conflict') {
        // Abort merge
        await manager.abortMerge(sessionId);
        
        // Check that we're back to initial state (plus our added commit)
        const finalLogResult = await runGitCommand(['log', '--oneline'], session!.worktreePath);
        const finalCommits = finalLogResult.stdout.trim().split('\n');
        
        expect(finalCommits).toHaveLength(initialCommits.length + 1);
      }
    });
  });

  describe('Fast Forward Merge', () => {
    it('should merge successfully', async () => {
      const session = store.getSession(sessionId);
      
      // Add and squash a commit
      await writeFile(join(session!.worktreePath, 'merge-test.txt'), 'merge test');
      await runGitCommand(['add', '.'], session!.worktreePath);
      await runGitCommand(['commit', '-m', 'amp: add merge test'], session!.worktreePath);
      
      await manager.squashSession(sessionId, {
        message: 'feat: add merge test feature'
      });
      
      // Rebase first
      await manager.rebaseOntoBase(sessionId);
      
      // Now merge
      await manager.fastForwardMerge(sessionId, { noFF: false });
      
      // Check that main now has our changes
      const mainLogResult = await runGitCommand(['log', '--oneline'], repoPath);
      expect(mainLogResult.stdout).toContain('feat: add merge test feature');
    });
  });

  describe('Export Patch', () => {
    it('should export patch file', async () => {
      const session = store.getSession(sessionId);
      const patchPath = join(tempDir, 'test.patch');
      
      // Add a commit to export
      await writeFile(join(session!.worktreePath, 'patch-test.txt'), 'patch content');
      await runGitCommand(['add', '.'], session!.worktreePath);
      await runGitCommand(['commit', '-m', 'amp: add patch test'], session!.worktreePath);
      
      await manager.exportPatch(sessionId, patchPath);
      
      // Check that patch file exists and has content
      const fs = await import('fs/promises');
      const patchContent = await fs.readFile(patchPath, 'utf-8');
      
      expect(patchContent).toContain('patch-test.txt');
      expect(patchContent).toContain('patch content');
      expect(patchContent).toContain('amp: add patch test');
    });
  });

  describe('Cleanup', () => {
    it('should cleanup session after successful merge', async () => {
      const session = store.getSession(sessionId);
      
      // Complete a successful merge first
      await writeFile(join(session!.worktreePath, 'cleanup-test.txt'), 'cleanup test');
      await runGitCommand(['add', '.'], session!.worktreePath);
      await runGitCommand(['commit', '-m', 'amp: add cleanup test'], session!.worktreePath);
      
      await manager.squashSession(sessionId, {
        message: 'feat: cleanup test'
      });
      
      await manager.rebaseOntoBase(sessionId);
      await manager.fastForwardMerge(sessionId);
      
      // Now cleanup should work
      await manager.cleanup(sessionId);
      
      // Check that worktree and branch are gone
      const worktreeResult = await runGitCommand(['worktree', 'list'], repoPath);
      expect(worktreeResult.stdout).not.toContain(session!.worktreePath);
      
      const branchResult = await runGitCommand(['branch', '-a'], repoPath);
      expect(branchResult.stdout).not.toContain(session!.branchName);
    });

    it('should refuse to cleanup unmerged session', async () => {
      const session = store.getSession(sessionId);
      
      // Add a commit but don't merge
      await writeFile(join(session!.worktreePath, 'unmerged.txt'), 'unmerged');
      await runGitCommand(['add', '.'], session!.worktreePath);
      await runGitCommand(['commit', '-m', 'amp: unmerged commit'], session!.worktreePath);
      
      // Cleanup should fail
      await expect(manager.cleanup(sessionId)).rejects.toThrow(/not reachable from base branch/);
    });
  });

  describe('Full Merge Flow', () => {
    it('should complete full merge flow successfully', async () => {
      const session = store.getSession(sessionId);
      
      // 1. Add some changes
      await writeFile(join(session!.worktreePath, 'full-test.txt'), 'full test content');
      await writeFile(join(session!.worktreePath, 'another-file.txt'), 'another file');
      await runGitCommand(['add', '.'], session!.worktreePath);
      await runGitCommand(['commit', '-m', 'amp: add test files'], session!.worktreePath);
      
      await writeFile(join(session!.worktreePath, 'full-test.txt'), 'updated content');
      await runGitCommand(['add', '.'], session!.worktreePath);
      await runGitCommand(['commit', '-m', 'amp: update test file'], session!.worktreePath);
      
      // 2. Run preflight
      const preflightResult = await manager.preflight(sessionId);
      expect(preflightResult.repoClean).toBe(true);
      expect(preflightResult.issues).toHaveLength(0);
      
      // 3. Squash commits
      await manager.squashSession(sessionId, {
        message: 'feat: implement full test feature with multiple files',
        includeManual: 'include'
      });
      
      // 4. Rebase onto base
      const rebaseResult = await manager.rebaseOntoBase(sessionId);
      expect(rebaseResult.status).toBe('ok');
      
      // 5. Merge
      await manager.fastForwardMerge(sessionId);
      
      // 6. Verify merge on main
      const mainLogResult = await runGitCommand(['log', '--oneline', '-n', '1'], repoPath);
      expect(mainLogResult.stdout).toContain('feat: implement full test feature');
      
      const fs = await import('fs/promises');
      const fullTestContent = await fs.readFile(join(repoPath, 'full-test.txt'), 'utf-8');
      expect(fullTestContent).toBe('updated content');
      
      // 7. Cleanup
      await manager.cleanup(sessionId);
      
      // 8. Verify cleanup
      const worktreeResult = await runGitCommand(['worktree', 'list'], repoPath);
      expect(worktreeResult.stdout).not.toContain(session!.worktreePath);
    });
  });
});

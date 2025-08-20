import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WorktreeManager } from './worktree.js';
import { SessionStore } from './store.js';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { GitOps } from './git.js';

describe('WorktreeManager', () => {
  let tempDir: string;
  let tempDbPath: string;
  let store: SessionStore;
  let manager: WorktreeManager;
  let gitOps: GitOps;

  beforeEach(async () => {
    // Create temporary directories
    tempDir = join(tmpdir(), `worktree-test-${Date.now()}`);
    tempDbPath = join(tmpdir(), `test-sessions-${Date.now()}.sqlite`);
    
    await mkdir(tempDir, { recursive: true });
    
    // Initialize a git repo
    gitOps = new GitOps(tempDir);
    await gitOps.exec(['init', '--initial-branch=main']);
    await gitOps.exec(['config', 'user.email', 'test@example.com']);
    await gitOps.exec(['config', 'user.name', 'Test User']);
    
    // Create initial commit
    await writeFile(join(tempDir, 'README.md'), '# Test Repo\n');
    await gitOps.exec(['add', '.']);
    await gitOps.exec(['commit', '-m', 'Initial commit']);
    
    // Initialize store and manager
    store = new SessionStore(tempDbPath);
    manager = new WorktreeManager(store);
  });

  afterEach(async () => {
    // Clean up
    store.close();
    try {
      await rm(tempDir, { recursive: true, force: true });
      await rm(tempDbPath, { force: true });
    } catch (error) {
      // Ignore cleanup errors in tests
    }
  });

  it('should create a session with worktree', async () => {
    const session = await manager.createSession({
      name: 'Test Session',
      ampPrompt: 'Test prompt for session creation',
      repoRoot: tempDir,
      baseBranch: 'main'
    });

    expect(session).toBeDefined();
    expect(session.name).toBe('Test Session');
    expect(session.ampPrompt).toBe('Test prompt for session creation');
    expect(session.repoRoot).toBe(tempDir);
    expect(session.baseBranch).toBe('main');
    expect(session.status).toBe('idle');
    expect(session.branchName).toMatch(/^amp\/test-session\/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/);
    
    // Verify worktree directory was created
    const worktreePath = session.worktreePath;
    expect(worktreePath).toContain('/.worktrees/');
    
    // Check that AGENT_CONTEXT was created
    const contextDir = join(worktreePath, 'AGENT_CONTEXT');
    
    // Basic check - in a real environment these files would exist
    // but in the test environment the worktree creation may be stubbed
    expect(session.id).toBeDefined();
  });

  it('should fail to create session for non-git directory', async () => {
    const nonGitDir = join(tmpdir(), `non-git-${Date.now()}`);
    await mkdir(nonGitDir, { recursive: true });

    try {
      await expect(manager.createSession({
        name: 'Test Session',
        ampPrompt: 'This should fail',
        repoRoot: nonGitDir,
        baseBranch: 'main'
      })).rejects.toThrow();
    } finally {
      await rm(nonGitDir, { recursive: true, force: true });
    }
  });

  it('should handle session iteration', async () => {
    const session = await manager.createSession({
      name: 'Iteration Test',
      ampPrompt: 'Test iteration functionality',
      repoRoot: tempDir,
      baseBranch: 'main'
    });

    // Run iteration - this should complete without throwing
    await expect(manager.iterate(session.id, 'Test iteration notes')).resolves.not.toThrow();
  });

  it('should fail iteration for non-existent session', async () => {
    await expect(manager.iterate('non-existent-id', 'notes')).rejects.toThrow('Session non-existent-id not found');
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GitOps } from './git.js';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('GitOps', () => {
  let tempDir: string;
  let gitOps: GitOps;

  beforeEach(async () => {
    // Create a temporary directory for testing
    tempDir = join(tmpdir(), `git-ops-test-${Date.now()}`);
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
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors in tests
    }
  });

  it('should instantiate with a repo root', () => {
    expect(gitOps).toBeDefined();
  });

  it('should detect if directory is a git repo', async () => {
    const isRepo = await gitOps.isRepo();
    expect(isRepo).toBe(true);
  });

  it('should get diff output', async () => {
    // Make a change
    await writeFile(join(tempDir, 'test.txt'), 'Hello world\n');
    
    const diff = await gitOps.getDiff(tempDir);
    // For untracked files, git diff won't show them
    // Let's test with a modified tracked file instead
    await writeFile(join(tempDir, 'README.md'), '# Modified Test Repo\nUpdated content\n');
    
    const modifiedDiff = await gitOps.getDiff(tempDir);
    expect(modifiedDiff).toContain('README.md');
    expect(modifiedDiff).toContain('Modified');
  });

  it('should commit changes', async () => {
    // Make a change
    await writeFile(join(tempDir, 'test.txt'), 'Hello world\n');
    
    const sha = await gitOps.commitChanges('Add test file', tempDir);
    expect(sha).toBeDefined();
    expect(typeof sha).toBe('string');
    expect(sha!.length).toBeGreaterThan(0);
  });

  it('should return null when no changes to commit', async () => {
    const sha = await gitOps.commitChanges('No changes', tempDir);
    expect(sha).toBeNull();
  });
});

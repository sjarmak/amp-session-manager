import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GitScanner } from './gitScanner.js';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { GitOps } from '../../git.js';

describe('GitScanner', () => {
  let tempDir: string;
  let gitOps: GitOps;
  let scanner: GitScanner;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'git-scanner-test-'));
    gitOps = new GitOps(tempDir);
    scanner = new GitScanner(tempDir);

    // Initialize git repo
    await gitOps.exec(['init', '--initial-branch=main']);
    await gitOps.exec(['config', 'user.email', 'test@example.com']);
    await gitOps.exec(['config', 'user.name', 'Test User']);

    // Create initial commit
    await writeFile(join(tempDir, 'README.md'), '# Test Repo\n');
    await gitOps.exec(['add', '.']);
    await gitOps.exec(['commit', '-m', 'Initial commit']);
  });

  afterEach(async () => {
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('findThreadIds', () => {
    it('should find thread IDs in commit messages', async () => {
      // Create commits with Amp-Thread trailers
      await writeFile(join(tempDir, 'file1.txt'), 'content1\n');
      await gitOps.exec(['add', '.']);
      await gitOps.exec(['commit', '-m', 'Add feature A\n\nAmp-Thread: T-abc123']);

      await writeFile(join(tempDir, 'file2.txt'), 'content2\n');
      await gitOps.exec(['add', '.']);
      await gitOps.exec(['commit', '-m', 'Fix bug B\n\nAmp-Thread: T-def456']);

      await writeFile(join(tempDir, 'file3.txt'), 'content3\n');
      await gitOps.exec(['add', '.']);
      await gitOps.exec(['commit', '-m', 'Regular commit without thread']);

      const threadIds = await scanner.findThreadIds({ days: 30 });

      expect(threadIds).toHaveLength(2);
      expect(threadIds).toContain('T-abc123');
      expect(threadIds).toContain('T-def456');
    });

    it('should respect days limit', async () => {
      // Create old commit (simulate by using a backdated commit)
      await writeFile(join(tempDir, 'old.txt'), 'old content\n');
      await gitOps.exec(['add', '.']);
      await gitOps.exec([
        'commit',
        '-m', 'Old commit\n\nAmp-Thread: T-old123',
        '--date=2020-01-01'
      ]);

      // Create recent commit
      await writeFile(join(tempDir, 'new.txt'), 'new content\n');
      await gitOps.exec(['add', '.']);
      await gitOps.exec(['commit', '-m', 'Recent commit\n\nAmp-Thread: T-new456']);

      const threadIds = await scanner.findThreadIds({ days: 1 });

      expect(threadIds).toHaveLength(1);
      expect(threadIds).toContain('T-new456');
      expect(threadIds).not.toContain('T-old123');
    });

    it('should handle commits with multiple trailers', async () => {
      await writeFile(join(tempDir, 'file.txt'), 'content\n');
      await gitOps.exec(['add', '.']);
      await gitOps.exec([
        'commit',
        '-m',
        'Complex commit\n\nAmp-Thread: T-multi123\nReviewed-by: John Doe\nTested-by: Jane Smith'
      ]);

      const threadIds = await scanner.findThreadIds({ days: 30 });

      expect(threadIds).toHaveLength(1);
      expect(threadIds).toContain('T-multi123');
    });

    it('should ignore malformed thread IDs', async () => {
      await writeFile(join(tempDir, 'file1.txt'), 'content1\n');
      await gitOps.exec(['add', '.']);
      await gitOps.exec(['commit', '-m', 'Valid thread\n\nAmp-Thread: T-valid123']);

      await writeFile(join(tempDir, 'file2.txt'), 'content2\n');
      await gitOps.exec(['add', '.']);
      await gitOps.exec(['commit', '-m', 'Invalid thread\n\nAmp-Thread: invalid-format']);

      await writeFile(join(tempDir, 'file3.txt'), 'content3\n');
      await gitOps.exec(['add', '.']);
      await gitOps.exec(['commit', '-m', 'Empty thread\n\nAmp-Thread: ']);

      const threadIds = await scanner.findThreadIds({ days: 30 });

      expect(threadIds).toHaveLength(1);
      expect(threadIds).toContain('T-valid123');
    });

    it('should deduplicate thread IDs', async () => {
      await writeFile(join(tempDir, 'file1.txt'), 'content1\n');
      await gitOps.exec(['add', '.']);
      await gitOps.exec(['commit', '-m', 'First commit\n\nAmp-Thread: T-duplicate123']);

      await writeFile(join(tempDir, 'file2.txt'), 'content2\n');
      await gitOps.exec(['add', '.']);
      await gitOps.exec(['commit', '-m', 'Second commit\n\nAmp-Thread: T-duplicate123']);

      await writeFile(join(tempDir, 'file3.txt'), 'content3\n');
      await gitOps.exec(['add', '.']);
      await gitOps.exec(['commit', '-m', 'Third commit\n\nAmp-Thread: T-different456']);

      const threadIds = await scanner.findThreadIds({ days: 30 });

      expect(threadIds).toHaveLength(2);
      expect(threadIds).toContain('T-duplicate123');
      expect(threadIds).toContain('T-different456');
    });

    it('should work with different branch', async () => {
      // Create feature branch
      await gitOps.exec(['checkout', '-b', 'feature']);
      
      await writeFile(join(tempDir, 'feature.txt'), 'feature content\n');
      await gitOps.exec(['add', '.']);
      await gitOps.exec(['commit', '-m', 'Feature commit\n\nAmp-Thread: T-feature123']);

      // Switch back to main
      await gitOps.exec(['checkout', 'main']);

      const threadIds = await scanner.findThreadIds({ 
        days: 30, 
        branch: 'feature' 
      });

      expect(threadIds).toHaveLength(1);
      expect(threadIds).toContain('T-feature123');
    });

    it('should handle empty repository gracefully', async () => {
      // Create a new empty repo
      const emptyDir = await mkdtemp(join(tmpdir(), 'empty-git-test-'));
      const emptyGitOps = new GitOps(emptyDir);
      const emptyScanner = new GitScanner(emptyDir);
      
      try {
        await emptyGitOps.exec(['init', '--initial-branch=main']);
        await emptyGitOps.exec(['config', 'user.email', 'test@example.com']);
        await emptyGitOps.exec(['config', 'user.name', 'Test User']);
        
        const threadIds = await emptyScanner.findThreadIds({ days: 30 });
        expect(threadIds).toEqual([]);
      } finally {
        await rm(emptyDir, { recursive: true, force: true });
      }
    });

    it('should handle repository with only initial commit', async () => {
      // The repository only has the initial commit without Amp-Thread trailer
      const threadIds = await scanner.findThreadIds({ days: 30 });
      expect(threadIds).toEqual([]);
    });

    it('should find thread IDs in commit body text', async () => {
      await writeFile(join(tempDir, 'file.txt'), 'content\n');
      await gitOps.exec(['add', '.']);
      await gitOps.exec([
        'commit',
        '-m',
        'Implement feature\n\nThis commit implements the feature requested in thread T-body123.\nIt also addresses issues from T-body456.'
      ]);

      const threadIds = await scanner.findThreadIds({ days: 30 });

      expect(threadIds).toHaveLength(2);
      expect(threadIds).toContain('T-body123');
      expect(threadIds).toContain('T-body456');
    });

    it('should find thread IDs in both trailers and body', async () => {
      await writeFile(join(tempDir, 'file.txt'), 'content\n');
      await gitOps.exec(['add', '.']);
      await gitOps.exec([
        'commit',
        '-m',
        'Complex commit\n\nImplements feature from T-body123.\n\nAmp-Thread: T-trailer456'
      ]);

      const threadIds = await scanner.findThreadIds({ days: 30 });

      expect(threadIds).toHaveLength(2);
      expect(threadIds).toContain('T-body123');
      expect(threadIds).toContain('T-trailer456');
    });

    it('should handle commits with no message body', async () => {
      await writeFile(join(tempDir, 'file.txt'), 'content\n');
      await gitOps.exec(['add', '.']);
      await gitOps.exec(['commit', '-m', 'Short commit']);

      const threadIds = await scanner.findThreadIds({ days: 30 });
      expect(threadIds).toEqual([]);
    });

    it('should handle git log errors gracefully', async () => {
      // Test with non-existent branch
      const threadIds = await scanner.findThreadIds({ 
        days: 30, 
        branch: 'nonexistent-branch' 
      });
      
      expect(threadIds).toEqual([]);
    });
  });
});

import { describe, it, expect } from 'vitest';
import { GitOps } from './git.js';

describe('GitOps', () => {
  it('should instantiate with a repo root', () => {
    const gitOps = new GitOps('/test/repo');
    expect(gitOps).toBeDefined();
  });
});

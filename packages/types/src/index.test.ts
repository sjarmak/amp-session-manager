import { describe, it, expect } from 'vitest';
import type { Session, IterationRecord, SessionCreateOptions } from './index.js';

describe('Types', () => {
  it('should validate Session interface', () => {
    const session: Session = {
      id: 'test-id',
      name: 'Test Session',
      ampPrompt: 'Test prompt',
      repoRoot: '/test/repo',
      baseBranch: 'main',
      branchName: 'amp/test/20240101-120000',
      worktreePath: '/test/repo/.worktrees/test-id',
      status: 'idle',
      createdAt: '2024-01-01T12:00:00.000Z'
    };

    expect(session.id).toBe('test-id');
    expect(session.status).toBe('idle');
  });

  it('should validate IterationRecord interface', () => {
    const iteration: IterationRecord = {
      id: 'iter-id',
      sessionId: 'session-id',
      startTime: '2024-01-01T12:00:00.000Z',
      changedFiles: 3
    };

    expect(iteration.changedFiles).toBe(3);
  });

  it('should validate SessionCreateOptions interface', () => {
    const options: SessionCreateOptions = {
      name: 'Test',
      ampPrompt: 'Test prompt',
      repoRoot: '/test/repo'
    };

    expect(options.name).toBe('Test');
  });
});

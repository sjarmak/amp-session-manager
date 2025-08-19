import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionStore } from './store.js';
import { unlink } from 'fs/promises';

describe('SessionStore', () => {
  let store: SessionStore;
  const testDb = './test-sessions.sqlite';

  beforeEach(() => {
    store = new SessionStore(testDb);
  });

  afterEach(async () => {
    store.close();
    try {
      await unlink(testDb);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  it('should create a session', () => {
    const session = store.createSession({
      name: 'Test Session',
      ampPrompt: 'Test prompt',
      repoRoot: '/test/repo'
    });

    expect(session.id).toBeDefined();
    expect(session.name).toBe('Test Session');
    expect(session.status).toBe('idle');
    expect(session.baseBranch).toBe('main');
  });

  it('should retrieve a session by id', () => {
    const created = store.createSession({
      name: 'Test Session',
      ampPrompt: 'Test prompt',
      repoRoot: '/test/repo'
    });

    const retrieved = store.getSession(created.id);
    expect(retrieved).toEqual(created);
  });

  it('should list all sessions', () => {
    store.createSession({
      name: 'Session 1',
      ampPrompt: 'Prompt 1',
      repoRoot: '/test/repo1'
    });

    store.createSession({
      name: 'Session 2',
      ampPrompt: 'Prompt 2',
      repoRoot: '/test/repo2'
    });

    const sessions = store.getAllSessions();
    expect(sessions).toHaveLength(2);
  });

  it('should update session status', () => {
    const session = store.createSession({
      name: 'Test Session',
      ampPrompt: 'Test prompt',
      repoRoot: '/test/repo'
    });

    store.updateSessionStatus(session.id, 'running');
    const updated = store.getSession(session.id);
    expect(updated?.status).toBe('running');
    expect(updated?.lastRun).toBeDefined();
  });
});

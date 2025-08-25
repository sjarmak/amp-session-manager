import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { AmpAdapter } from '../amp.js';

// Mock child_process spawn
vi.mock('child_process', () => ({
  spawn: vi.fn()
}));

describe('AmpAdapter Interactive Mode', () => {
  let ampAdapter: AmpAdapter;
  let mockStore: any;
  let mockChild: any;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Mock store
    mockStore = {
      getSession: vi.fn(),
      addStreamEvent: vi.fn()
    };

    // Mock child process
    mockChild = new EventEmitter();
    mockChild.stdin = {
      write: vi.fn(),
      end: vi.fn()
    };
    mockChild.stdout = new EventEmitter();
    mockChild.stderr = new EventEmitter();
    mockChild.kill = vi.fn();
    mockChild.killed = false;

    // Mock spawn to return our mock child
    const { spawn } = require('child_process');
    spawn.mockReturnValue(mockChild);

    ampAdapter = new AmpAdapter({
      ampPath: 'amp',
      enableJSONLogs: true
    }, mockStore);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('startInteractive', () => {
    it('should create interactive handle with correct arguments', () => {
      const handle = ampAdapter.startInteractive(
        'session-123',
        'Hello, world!',
        '/tmp/worktree',
        'gpt-5'
      );

      expect(handle).toBeDefined();
      expect(typeof handle.send).toBe('function');
      expect(typeof handle.stop).toBe('function');
    });

    it('should spawn amp with correct streaming arguments', () => {
      const { spawn } = require('child_process');
      
      ampAdapter.startInteractive(
        'session-123',
        'Test message',
        '/tmp/worktree'
      );

      expect(spawn).toHaveBeenCalledWith(
        'amp',
        ['--execute', '--stream-json', '--stream-json-input'],
        expect.objectContaining({
          cwd: '/tmp/worktree',
          stdio: ['pipe', 'pipe', 'pipe']
        })
      );
    });

    it('should add threads continue args for existing sessions', () => {
      const { spawn } = require('child_process');
      
      mockStore.getSession.mockReturnValue({
        threadId: 'T-abc123',
        lastRun: '2024-01-01T00:00:00Z'
      });

      ampAdapter.startInteractive(
        'session-123',
        'Test message',
        '/tmp/worktree'
      );

      expect(spawn).toHaveBeenCalledWith(
        'amp',
        ['threads', 'continue', '--execute', '--stream-json', '--stream-json-input'],
        expect.any(Object)
      );
    });

    it('should add model override arguments correctly', () => {
      const { spawn } = require('child_process');
      
      ampAdapter.startInteractive(
        'session-123',
        'Test message',
        '/tmp/worktree',
        'gpt-5'
      );

      expect(spawn).toHaveBeenCalledWith(
        'amp',
        ['--execute', '--stream-json', '--stream-json-input', '--try-gpt5'],
        expect.any(Object)
      );
    });
  });

  describe('InteractiveHandle', () => {
    let handle: any;

    beforeEach(() => {
      handle = ampAdapter.startInteractive(
        'session-123',
        'Initial message',
        '/tmp/worktree'
      );
    });

    it('should send messages in correct JSON format', () => {
      // Simulate ready state
      setTimeout(() => handle.emit('state', 'ready'), 10);
      
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          handle.send('Test message');
          
          expect(mockChild.stdin.write).toHaveBeenCalledWith(
            JSON.stringify({
              type: 'user',
              message: {
                role: 'user',
                content: [{ type: 'text', text: 'Test message' }]
              }
            }) + '\n'
          );
          resolve();
        }, 20);
      });
    });

    it('should process streaming JSON responses', () => {
      const streamingEventSpy = vi.fn();
      handle.on('streaming-event', streamingEventSpy);

      // Simulate assistant response
      const assistantResponse = JSON.stringify({
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'Hello back!' }],
          usage: { input_tokens: 10, output_tokens: 5 }
        },
        session_id: 'T-abc123'
      });

      mockChild.stdout.emit('data', Buffer.from(assistantResponse + '\n'));

      expect(streamingEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'assistant_message',
          data: expect.objectContaining({
            content: [{ type: 'text', text: 'Hello back!' }]
          })
        })
      );
    });

    it('should handle connection state changes', () => {
      const stateSpy = vi.fn();
      handle.on('state', stateSpy);

      // Simulate connection establishment
      setTimeout(() => {
        expect(stateSpy).toHaveBeenCalledWith('ready');
      }, 1100); // After the 1000ms delay in initializeConnection
    });

    it('should store stream events in database', () => {
      const streamData = JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Response' }] },
        session_id: 'T-abc123'
      });

      mockChild.stdout.emit('data', Buffer.from(streamData + '\n'));

      expect(mockStore.addStreamEvent).toHaveBeenCalledWith(
        'session-123',
        expect.objectContaining({
          type: 'assistant',
          message: expect.objectContaining({
            content: [{ type: 'text', text: 'Response' }]
          })
        })
      );
    });

    it('should gracefully stop connection', async () => {
      const promise = handle.stop();
      
      // Simulate process closing
      setTimeout(() => {
        mockChild.emit('close', 0);
      }, 10);

      await promise;
      
      expect(mockChild.stdin.end).toHaveBeenCalled();
    });

    it('should force kill after timeout', async () => {
      const promise = handle.stop();
      
      // Don't emit close event to simulate hanging process
      
      await promise;
      
      // Should have called kill after timeout
      expect(mockChild.kill).toHaveBeenCalled();
    });
  });

  describe('JSON processing', () => {
    let handle: any;

    beforeEach(() => {
      handle = ampAdapter.startInteractive(
        'session-123',
        'Initial message',
        '/tmp/worktree'
      );
    });

    it('should handle partial JSON objects', () => {
      const streamingEventSpy = vi.fn();
      handle.on('streaming-event', streamingEventSpy);

      // Send partial JSON
      mockChild.stdout.emit('data', Buffer.from('{"type":"assistant","mes'));
      expect(streamingEventSpy).not.toHaveBeenCalled();

      // Complete the JSON
      mockChild.stdout.emit('data', Buffer.from('sage":{"content":[{"type":"text","text":"Hello"}]}}\n'));
      
      expect(streamingEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'assistant_message'
        })
      );
    });

    it('should handle multiple JSON objects in single chunk', () => {
      const streamingEventSpy = vi.fn();
      handle.on('streaming-event', streamingEventSpy);

      const multipleObjects = [
        '{"type":"assistant","message":{"content":[{"type":"text","text":"First"}]}}',
        '{"type":"assistant","message":{"content":[{"type":"text","text":"Second"}]}}'
      ].join('\n') + '\n';

      mockChild.stdout.emit('data', Buffer.from(multipleObjects));

      expect(streamingEventSpy).toHaveBeenCalledTimes(2);
    });

    it('should handle malformed JSON gracefully', () => {
      const streamingEventSpy = vi.fn();
      handle.on('streaming-event', streamingEventSpy);

      // Send invalid JSON
      mockChild.stdout.emit('data', Buffer.from('{"invalid": json}\n'));
      
      // Should not crash or emit event for invalid JSON
      expect(streamingEventSpy).not.toHaveBeenCalled();
    });
  });
});

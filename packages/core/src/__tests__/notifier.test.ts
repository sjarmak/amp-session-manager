import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Notifier } from '../notifier.js';
import type { NotificationOptions } from '../notifier.js';

describe('Notifier', () => {
  let notifier: Notifier;
  let mockCallback: (options: NotificationOptions) => Promise<void>;
  let receivedNotifications: NotificationOptions[];

  beforeEach(() => {
    receivedNotifications = [];
    mockCallback = vi.fn(async (options: NotificationOptions) => {
      receivedNotifications.push(options);
    });
    
    notifier = new Notifier();
    notifier.setCallback(mockCallback);
  });

  describe('basic functionality', () => {
    it('should send notifications through callback', async () => {
      await notifier.notify('Test Title', 'Test message', 'info');
      
      expect(receivedNotifications).toHaveLength(1);
      expect(receivedNotifications[0]).toEqual({
        title: 'Test Title',
        message: 'Test message',
        type: 'info'
      });
    });

    it('should not send notifications when disabled globally', async () => {
      notifier.setSettings({ enabled: false });
      
      await notifier.notify('Test Title', 'Test message', 'info');
      
      expect(receivedNotifications).toHaveLength(0);
    });

    it('should respect type-specific settings', async () => {
      notifier.setSettings({
        types: {
          sessionComplete: false,
          awaitingInput: true,
          conflict: true,
          testResults: true,
          statusChange: true,
        }
      });

      await notifier.notifySessionComplete('test-session');
      expect(receivedNotifications).toHaveLength(0);

      await notifier.notifyAwaitingInput('test-session');
      expect(receivedNotifications).toHaveLength(1);
    });
  });

  describe('notification types', () => {
    it('should send session complete notifications', async () => {
      await notifier.notifySessionComplete('my-session');
      
      expect(receivedNotifications).toHaveLength(1);
      expect(receivedNotifications[0]).toEqual({
        title: 'Session Complete',
        message: 'Session "my-session" has finished successfully.',
        type: 'success',
        actions: [{ label: 'View Session', action: 'view:my-session' }]
      });
    });

    it('should send awaiting input notifications as urgent', async () => {
      await notifier.notifyAwaitingInput('urgent-session');
      
      expect(receivedNotifications).toHaveLength(1);
      expect(receivedNotifications[0]).toEqual({
        title: 'Awaiting Input',
        message: 'Session "urgent-session" needs your attention.',
        type: 'warning',
        urgent: true,
        actions: [{ label: 'View Session', action: 'view:urgent-session' }]
      });
    });

    it('should send conflict notifications with multiple actions', async () => {
      await notifier.notifyConflict('conflict-session');
      
      expect(receivedNotifications).toHaveLength(1);
      expect(receivedNotifications[0]).toEqual({
        title: 'Rebase Conflict',
        message: 'Session "conflict-session" has merge conflicts that require resolution.',
        type: 'error',
        urgent: true,
        actions: [
          { label: 'Resolve Conflicts', action: 'conflicts:conflict-session' },
          { label: 'Abort Merge', action: 'abort:conflict-session' }
        ]
      });
    });

    it('should send test result notifications', async () => {
      // Passing tests
      await notifier.notifyTestResults('test-session', true, 'All good');
      expect(receivedNotifications).toHaveLength(1);
      expect(receivedNotifications[0].type).toBe('success');
      expect(receivedNotifications[0].urgent).toBe(false);

      // Failing tests
      receivedNotifications.length = 0;
      await notifier.notifyTestResults('test-session', false, 'Some failed');
      expect(receivedNotifications).toHaveLength(1);
      expect(receivedNotifications[0].type).toBe('error');
      expect(receivedNotifications[0].urgent).toBe(true);
    });

    it('should send status change notifications with appropriate types', async () => {
      const statusTests = [
        { status: 'running', expectedType: 'info' },
        { status: 'completed', expectedType: 'success' },
        { status: 'failed', expectedType: 'error' },
        { status: 'awaiting', expectedType: 'warning' },
        { status: 'unknown', expectedType: 'info' }
      ];

      for (const { status, expectedType } of statusTests) {
        receivedNotifications.length = 0;
        await notifier.notifyStatusChange('test-session', status);
        
        expect(receivedNotifications).toHaveLength(1);
        expect(receivedNotifications[0].type).toBe(expectedType);
      }
    });
  });

  describe('settings management', () => {
    it('should return current settings', () => {
      const settings = notifier.getSettings();
      
      expect(settings).toEqual({
        enabled: true,
        types: {
          sessionComplete: true,
          awaitingInput: true,
          conflict: true,
          testResults: true,
          statusChange: true,
        },
        sound: true,
        duration: 5000,
      });
    });

    it('should update settings partially', () => {
      notifier.setSettings({ 
        sound: false,
        duration: 10000 
      });
      
      const settings = notifier.getSettings();
      expect(settings.sound).toBe(false);
      expect(settings.duration).toBe(10000);
      expect(settings.enabled).toBe(true); // unchanged
    });

    it('should update nested type settings', () => {
      const originalSettings = notifier.getSettings();
      notifier.setSettings({
        types: {
          ...originalSettings.types,
          sessionComplete: false,
          conflict: false
        }
      });
      
      const settings = notifier.getSettings();
      expect(settings.types.sessionComplete).toBe(false);
      expect(settings.types.conflict).toBe(false);
      expect(settings.types.awaitingInput).toBe(true); // unchanged
    });
  });

  describe('fallback behavior', () => {
    it('should log to console when no callback is set', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      const fallbackNotifier = new Notifier();
      await fallbackNotifier.notify('Test', 'Message', 'info');
      
      expect(consoleSpy).toHaveBeenCalledWith('NOTIFICATION [INFO]: Test - Message');
      
      consoleSpy.mockRestore();
    });
  });
});

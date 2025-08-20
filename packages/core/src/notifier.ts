export interface NotificationOptions {
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  urgent?: boolean;
  actions?: Array<{ label: string; action: string }>;
}

export interface NotificationSettings {
  enabled: boolean;
  types: {
    sessionComplete: boolean;
    awaitingInput: boolean;
    conflict: boolean;
    testResults: boolean;
    statusChange: boolean;
  };
  sound: boolean;
  duration: number; // ms, 0 = persistent
}

export type NotificationCallback = (options: NotificationOptions) => Promise<void>;

export class Notifier {
  private callback?: NotificationCallback;
  private settings: NotificationSettings = {
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
  };

  setCallback(callback: NotificationCallback): void {
    this.callback = callback;
  }

  setSettings(settings: Partial<NotificationSettings>): void {
    this.settings = { ...this.settings, ...settings };
  }

  getSettings(): NotificationSettings {
    return { ...this.settings };
  }

  private async sendNotification(options: NotificationOptions, typeKey: keyof NotificationSettings['types']): Promise<void> {
    if (!this.settings.enabled || !this.settings.types[typeKey]) {
      return;
    }

    if (this.callback) {
      await this.callback(options);
    } else {
      console.log(`NOTIFICATION [${options.type.toUpperCase()}]: ${options.title} - ${options.message}`);
    }
  }

  async notify(title: string, message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info'): Promise<void> {
    await this.sendNotification({ title, message, type }, 'statusChange');
  }
  
  async notifySessionComplete(sessionName: string): Promise<void> {
    await this.sendNotification({
      title: 'Session Complete',
      message: `Session "${sessionName}" has finished successfully.`,
      type: 'success',
      actions: [{ label: 'View Session', action: `view:${sessionName}` }]
    }, 'sessionComplete');
  }
  
  async notifyAwaitingInput(sessionName: string): Promise<void> {
    await this.sendNotification({
      title: 'Awaiting Input',
      message: `Session "${sessionName}" needs your attention.`,
      type: 'warning',
      urgent: true,
      actions: [{ label: 'View Session', action: `view:${sessionName}` }]
    }, 'awaitingInput');
  }
  
  async notifyConflict(sessionName: string): Promise<void> {
    await this.sendNotification({
      title: 'Rebase Conflict',
      message: `Session "${sessionName}" has merge conflicts that require resolution.`,
      type: 'error',
      urgent: true,
      actions: [
        { label: 'Resolve Conflicts', action: `conflicts:${sessionName}` },
        { label: 'Abort Merge', action: `abort:${sessionName}` }
      ]
    }, 'conflict');
  }

  async notifyTestResults(sessionName: string, passed: boolean, details?: string): Promise<void> {
    await this.sendNotification({
      title: passed ? 'Tests Passed' : 'Tests Failed',
      message: `Session "${sessionName}" tests ${passed ? 'completed successfully' : 'failed'}${details ? ': ' + details : '.'}`,
      type: passed ? 'success' : 'error',
      urgent: !passed,
      actions: [{ label: 'View Details', action: `tests:${sessionName}` }]
    }, 'testResults');
  }

  async notifyStatusChange(sessionName: string, status: string, details?: string): Promise<void> {
    const statusTypes: Record<string, 'info' | 'success' | 'warning' | 'error'> = {
      running: 'info',
      completed: 'success',
      failed: 'error',
      awaiting: 'warning',
    };

    await this.sendNotification({
      title: 'Session Status Changed',
      message: `Session "${sessionName}" is now ${status}${details ? ': ' + details : '.'}`,
      type: statusTypes[status] || 'info',
      actions: [{ label: 'View Session', action: `view:${sessionName}` }]
    }, 'statusChange');
  }
}

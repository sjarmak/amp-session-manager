const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { join } = require('path');
const { SessionStore, WorktreeManager, BatchController, getCurrentAmpThreadId, getDbPath, Notifier } = require('@ampsm/core');

let mainWindow: any;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, 'preload.js')
    },
    titleBarStyle: 'hiddenInset',
    show: false
  });

  if (app.isPackaged) {
    mainWindow.loadFile(join(__dirname, '../dist-renderer/index.html'));
  } else {
    mainWindow.loadURL('http://localhost:3000');
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Initialize services
let store: any;
let worktreeManager: any;
let batchController: any;
let notifier: any;

async function initializeServices() {
  try {
    const dbPath = getDbPath();
    store = new SessionStore(dbPath);
    worktreeManager = new WorktreeManager(store);
    batchController = new BatchController(store, worktreeManager);
    notifier = new Notifier();

    notifier.setCallback(async (options: any) => {
      console.log('Notification:', options.title, '-', options.message);
      // Native notifications will be added later when Electron issues are resolved
    });

    console.log('Services initialized successfully');
  } catch (error) {
    console.error('Failed to initialize services:', error);
  }
}

app.whenReady().then(initializeServices);

// IPC handlers
ipcMain.handle('sessions:list', async () => {
  try {
    return store.getAllSessions();
  } catch (error) {
    console.error('Failed to get sessions:', error);
    return [];
  }
});

// Dialog handlers
ipcMain.handle('dialog:selectDirectory', async () => {
  const { dialog } = require('electron');
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  return result;
});

ipcMain.handle('get-session', async (_, sessionId: string) => {
  try {
    return store.getSession(sessionId);
  } catch (error) {
    console.error('Failed to get session:', error);
    return null;
  }
});

ipcMain.handle('sessions:create', async (_, options: any) => {
  try {
    const session = await worktreeManager.createSession(options);
    return { success: true, session };
  } catch (error) {
    console.error('Failed to create session:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to create session' };
  }
});

ipcMain.handle('iterate-session', async (_, sessionId: string) => {
  try {
    return await worktreeManager.iterate(sessionId);
  } catch (error) {
    console.error('Failed to iterate session:', error);
    throw error;
  }
});

ipcMain.handle('get-session-diff', async (_, sessionId: string) => {
  try {
    const session = store.getSession(sessionId);
    if (!session) throw new Error('Session not found');
    
    return worktreeManager.getDiff(sessionId);
  } catch (error) {
    console.error('Failed to get session diff:', error);
    return '';
  }
});

ipcMain.handle('squash-session', async (_, sessionId: string, options: any) => {
  try {
    return await worktreeManager.squashCommits(sessionId, options);
  } catch (error) {
    console.error('Failed to squash session:', error);
    throw error;
  }
});

ipcMain.handle('rebase-session', async (_, sessionId: string, options: any) => {
  try {
    return await worktreeManager.rebase(sessionId, options);
  } catch (error) {
    console.error('Failed to rebase session:', error);
    throw error;
  }
});

ipcMain.handle('cleanup-session', async (_, sessionId: string) => {
  try {
    return await worktreeManager.cleanup(sessionId);
  } catch (error) {
    console.error('Failed to cleanup session:', error);
    throw error;
  }
});

ipcMain.handle('get-batches', async () => {
  try {
    return store.getAllBatches();
  } catch (error) {
    console.error('Failed to get batches:', error);
    return [];
  }
});

ipcMain.handle('get-batch', async (_, batchId: string) => {
  try {
    return store.getBatch(batchId);
  } catch (error) {
    console.error('Failed to get batch:', error);
    return null;
  }
});

ipcMain.handle('create-batch', async (_, options: any) => {
  try {
    return await batchController.createBatch(options);
  } catch (error) {
    console.error('Failed to create batch:', error);
    throw error;
  }
});

ipcMain.handle('run-batch', async (_, batchId: string) => {
  try {
    return await batchController.runBatch(batchId);
  } catch (error) {
    console.error('Failed to run batch:', error);
    throw error;
  }
});

ipcMain.handle('get-amp-thread-id', async () => {
  try {
    return getCurrentAmpThreadId();
  } catch (error) {
    console.error('Failed to get Amp thread ID:', error);
    return null;
  }
});

ipcMain.handle('show-notification', async (_, options: any) => {
  try {
    notifier.notify(options);
    return true;
  } catch (error) {
    console.error('Failed to show notification:', error);
    return false;
  }
});

ipcMain.handle('get-notification-settings', async () => {
  try {
    return notifier.getSettings();
  } catch (error) {
    console.error('Failed to get notification settings:', error);
    return {};
  }
});

ipcMain.handle('update-notification-settings', async (_, settings: any) => {
  try {
    notifier.updateSettings(settings);
    return true;
  } catch (error) {
    console.error('Failed to update notification settings:', error);
    return false;
  }
});

ipcMain.handle('test-notification', async (_, type: string) => {
  try {
    const testNotifications = {
      sessionComplete: { type: 'success', title: 'Session Complete', message: 'Session "test-session" completed successfully' },
      sessionFailed: { type: 'error', title: 'Session Failed', message: 'Session "test-session" failed with error' },
      awaitingInput: { type: 'warning', title: 'Awaiting Input', message: 'Session "test-session" needs manual intervention' },
      testPassed: { type: 'success', title: 'Tests Passed', message: 'All tests passed for session "test-session"' },
      testFailed: { type: 'error', title: 'Tests Failed', message: 'Tests failed for session "test-session"' }
    };
    
    const notification = testNotifications[type as keyof typeof testNotifications];
    if (notification) {
      notifier.notify(notification);
    }
    return true;
  } catch (error) {
    console.error('Failed to test notification:', error);
    return false;
  }
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  app.quit();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  app.quit();
});

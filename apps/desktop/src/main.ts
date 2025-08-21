const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { join } = require('path');
const { SessionStore, WorktreeManager, BatchController, getCurrentAmpThreadId, getDbPath, Notifier, MetricsAPI, SQLiteMetricsSink, costCalculator, Logger } = require('@ampsm/core');

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
    movable: true,
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
let metricsAPI: any;

async function initializeServices() {
  try {
    const dbPath = getDbPath();
    store = new SessionStore(dbPath);
    worktreeManager = new WorktreeManager(store, dbPath);
    batchController = new BatchController(store, dbPath);
    notifier = new Notifier();

    // Initialize metrics system
    const logger = new Logger('Desktop');
    const sqliteSink = new SQLiteMetricsSink(dbPath, logger);
    metricsAPI = new MetricsAPI(sqliteSink, costCalculator, logger);

    notifier.setCallback(async (options: any) => {
      console.log('Notification:', options.title, '-', options.message);
      // Native notifications will be added later when Electron issues are resolved
    });

    // Forward batch events to frontend
    batchController.on('event', (event: any) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('batch:event', event);
      }
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

ipcMain.handle('sessions:get', async (_, sessionId: string) => {
  try {
    return store.getSession(sessionId);
  } catch (error) {
    console.error('Failed to get session:', error);
    return null;
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

ipcMain.handle('dialog:selectFile', async () => {
  const { dialog } = require('electron');
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'YAML Files', extensions: ['yaml', 'yml'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  return result;
});

ipcMain.handle('fs:readFile', async (_, filePath: string) => {
  const fs = require('fs').promises;
  try {
    console.log('Reading file from main process:', filePath);
    const content = await fs.readFile(filePath, 'utf8');
    console.log('File read successfully, length:', content.length);
    return { success: true, content };
  } catch (error) {
    console.error('File read error in main process:', error);
    return { success: false, error: error.message };
  }
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

ipcMain.handle('sessions:iterate', async (_, sessionId: string, notes?: string) => {
  try {
    const result = await worktreeManager.iterate(sessionId, notes);
    return { success: true, result };
  } catch (error) {
    console.error('Failed to iterate session:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to iterate session' };
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

ipcMain.handle('sessions:diff', async (_, sessionId: string) => {
  try {
    const session = store.getSession(sessionId);
    if (!session) throw new Error('Session not found');
    
    const diff = await worktreeManager.getDiff(sessionId);
    return { success: true, diff };
  } catch (error) {
    console.error('Failed to get session diff:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to get diff' };
  }
});

ipcMain.handle('sessions:cleanup', async (_, sessionId: string, force?: boolean) => {
  try {
    await worktreeManager.cleanup(sessionId, force);
    return { success: true };
  } catch (error) {
    console.error('Failed to cleanup session:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to cleanup session' };
  }
});

ipcMain.handle('sessions:thread', async (_, sessionId: string) => {
  try {
    const threadConversation = await worktreeManager.getThreadConversation(sessionId);
    return { success: true, threadConversation };
  } catch (error) {
    console.error('Failed to get thread conversation:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to get thread conversation' };
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

// New batch API handlers
ipcMain.handle('batch:listRuns', async () => {
  try {
    return await batchController.listRuns();
  } catch (error) {
    console.error('Failed to list batch runs:', error);
    return [];
  }
});

ipcMain.handle('batch:getRun', async (_, runId: string) => {
  try {
    return await batchController.getRun(runId);
  } catch (error) {
    console.error('Failed to get batch run:', error);
    return null;
  }
});

ipcMain.handle('batch:listItems', async (_, options: any) => {
  try {
    return await batchController.listItems(options);
  } catch (error) {
    console.error('Failed to list batch items:', error);
    return { items: [], total: 0 };
  }
});

ipcMain.handle('batch:start', async (_, options: any) => {
  try {
    const result = await batchController.start(options);
    return { success: true, runId: result.runId };
  } catch (error) {
    console.error('Failed to start batch:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('batch:abort', async (_, runId: string) => {
  try {
    await batchController.abort(runId);
    return { success: true };
  } catch (error) {
    console.error('Failed to abort batch:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('batch:export', async (_, options: any) => {
  try {
    const filePaths = await batchController.export(options);
    return { success: true, filePaths };
  } catch (error) {
    console.error('Failed to export batch:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('batch:report', async (_, options: any) => {
  try {
    const outputPath = await batchController.report(options);
    return { success: true, outputPath };
  } catch (error) {
    console.error('Failed to generate batch report:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('batch:delete', async (_, runId: string) => {
  try {
    await batchController.delete(runId);
    return { success: true };
  } catch (error) {
    console.error('Failed to delete batch:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('batch:cleanEnvironment', async () => {
  try {
    return await batchController.cleanWorktreeEnvironment();
  } catch (error) {
    console.error('Failed to clean environment:', error);
    throw error;
  }
});

ipcMain.handle('auth:validate', async () => {
  try {
    const { AmpAdapter } = require('@ampsm/core');
    const ampAdapter = new AmpAdapter({}, store);
    return await ampAdapter.validateAuth();
  } catch (error) {
    console.error('Failed to validate auth:', error);
    return {
      isAuthenticated: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
});

ipcMain.handle('shell:openExternal', async (_, url: string) => {
  const { shell } = require('electron');
  return await shell.openExternal(url);
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

// Metrics IPC handlers
ipcMain.handle('metrics:getSessionSummary', async (_, sessionId: string) => {
  try {
    if (!metricsAPI) {
      throw new Error('Metrics API not initialized');
    }
    const summary = await metricsAPI.getSessionSummary(sessionId);
    return { success: true, summary };
  } catch (error) {
    console.error('Failed to get session metrics summary:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('metrics:getIterationMetrics', async (_, sessionId: string) => {
  try {
    if (!metricsAPI) {
      throw new Error('Metrics API not initialized');
    }
    const iterations = await metricsAPI.getIterationMetrics(sessionId);
    return { success: true, iterations };
  } catch (error) {
    console.error('Failed to get iteration metrics:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('metrics:getRealtimeMetrics', async (_, sessionId: string) => {
  try {
    if (!metricsAPI) {
      throw new Error('Metrics API not initialized');
    }
    const metrics = await metricsAPI.getRealtimeMetrics(sessionId);
    return { success: true, metrics };
  } catch (error) {
    console.error('Failed to get realtime metrics:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('metrics:getSessionProgress', async (_, sessionId: string) => {
  try {
    if (!metricsAPI) {
      throw new Error('Metrics API not initialized');
    }
    const progress = await metricsAPI.getSessionProgress(sessionId);
    return { success: true, progress };
  } catch (error) {
    console.error('Failed to get session progress:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('metrics:exportMetrics', async (_, sessionId: string, options: any) => {
  try {
    if (!metricsAPI) {
      throw new Error('Metrics API not initialized');
    }
    const result = await metricsAPI.exportMetrics(sessionId, options);
    return { success: true, result };
  } catch (error) {
    console.error('Failed to export metrics:', error);
    return { success: false, error: error.message };
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

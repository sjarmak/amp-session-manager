const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { join } = require('path');
const { SessionStore, WorktreeManager, BatchController, SweBenchRunner, getCurrentAmpThreadId, getDbPath, Notifier, MetricsAPI, SQLiteMetricsSink, MetricsEventBus, costCalculator, Logger } = require('@ampsm/core');

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
let sweBenchRunner: any;
let notifier: any;
let metricsAPI: any;
let servicesReady = false;

async function initializeServices() {
  try {
    const dbPath = getDbPath();
    store = new SessionStore(dbPath);
    
    // Initialize shared metrics system first
    const logger = new Logger('Desktop');
    const metricsEventBus = new MetricsEventBus(logger);
    const sqliteSink = new SQLiteMetricsSink(dbPath, logger);
    metricsEventBus.addSink(sqliteSink);
    metricsAPI = new MetricsAPI(sqliteSink, store, logger);
    
    // Pass shared metrics bus to WorktreeManager and BatchController
    worktreeManager = new WorktreeManager(store, dbPath, metricsEventBus);
    batchController = new BatchController(store, dbPath, metricsEventBus);
    sweBenchRunner = new SweBenchRunner(store, dbPath);
    notifier = new Notifier();

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

    servicesReady = true;
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

ipcMain.handle('sessions:iterate', async (_, sessionId: string, notes?: string, includeContext?: boolean) => {
  try {
    const result = await worktreeManager.iterate(sessionId, notes, includeContext);
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

ipcMain.handle('sessions:getIterations', async (_, sessionId: string) => {
  try {
    const iterations = store.getIterations(sessionId);
    return { success: true, iterations };
  } catch (error) {
    console.error('Failed to get iterations:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to get iterations' };
  }
});

ipcMain.handle('sessions:getToolCalls', async (_, sessionId: string) => {
  try {
    const toolCalls = store.getToolCalls(sessionId);
    return { success: true, toolCalls };
  } catch (error) {
    console.error('Failed to get tool calls:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to get tool calls' };
  }
});

// Legacy handlers (keep for compatibility)
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

// New session handlers
ipcMain.handle('sessions:squash', async (_, sessionId: string, message: string) => {
  try {
    return await worktreeManager.squashCommits(sessionId, { message });
  } catch (error) {
    console.error('Failed to squash session:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to squash session' };
  }
});

ipcMain.handle('sessions:rebase', async (_, sessionId: string, onto: string) => {
  try {
    const result = await worktreeManager.rebase(sessionId, onto);
    return { success: true, result };
  } catch (error) {
    console.error('Failed to rebase session:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to rebase session' };
  }
});

ipcMain.handle('sessions:preflight', async (_, sessionId: string) => {
  try {
    const result = await worktreeManager.preflight(sessionId);
    return { success: true, result };
  } catch (error) {
    console.error('Failed to run preflight:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to run preflight' };
  }
});

ipcMain.handle('sessions:squash-session', async (_, sessionId: string, message: string) => {
  try {
    return await worktreeManager.squashCommits(sessionId, { message });
  } catch (error) {
    console.error('Failed to squash session:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to squash session' };
  }
});

ipcMain.handle('sessions:rebase-onto-base', async (_, sessionId: string) => {
  try {
    const result = await worktreeManager.rebaseOntoBase(sessionId);
    return { success: true, result };
  } catch (error) {
    console.error('Failed to rebase onto base:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to rebase onto base' };
  }
});

ipcMain.handle('sessions:continue-merge', async (_, sessionId: string) => {
  try {
    const result = await worktreeManager.continueMerge(sessionId);
    return { success: true, result };
  } catch (error) {
    console.error('Failed to continue merge:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to continue merge' };
  }
});

ipcMain.handle('sessions:abort-merge', async (_, sessionId: string) => {
  try {
    const result = await worktreeManager.abortMerge(sessionId);
    return { success: true, result };
  } catch (error) {
    console.error('Failed to abort merge:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to abort merge' };
  }
});

ipcMain.handle('sessions:fast-forward-merge', async (_, sessionId: string) => {
  try {
    const result = await worktreeManager.fastForwardMerge(sessionId);
    return { success: true, result };
  } catch (error) {
    console.error('Failed to fast-forward merge:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to fast-forward merge' };
  }
});

ipcMain.handle('sessions:export-patch', async (_, sessionId: string, outputPath: string) => {
  try {
    const result = await worktreeManager.exportPatch(sessionId, outputPath);
    return { success: true, result };
  } catch (error) {
    console.error('Failed to export patch:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to export patch' };
  }
});

// Deprecated - use 'sessions:cleanup' instead
// ipcMain.handle('cleanup-session', async (_, sessionId: string) => {
//   try {
//     return await worktreeManager.cleanup(sessionId);
//   } catch (error) {
//     console.error('Failed to cleanup session:', error);
//     throw error;
//   }
// });

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

// Notification IPC handlers
ipcMain.handle('notifications:getSettings', async () => {
  try {
    return notifier.getSettings();
  } catch (error) {
    console.error('Failed to get notification settings:', error);
    return null;
  }
});

ipcMain.handle('notifications:updateSettings', async (_, settings: any) => {
  try {
    notifier.setSettings(settings);
    return true;
  } catch (error) {
    console.error('Failed to update notification settings:', error);
    return false;
  }
});

ipcMain.handle('notifications:test', async (_, type: string) => {
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

// Benchmark IPC handlers
ipcMain.handle('benchmarks:listRuns', async () => {
  try {
    console.log('📊 benchmarks:listRuns called, servicesReady:', servicesReady);
    if (!servicesReady || !sweBenchRunner) {
      console.error('❌ Services not ready or SweBenchRunner not initialized');
      return [];
    }
    if (!store) {
      console.error('❌ Store not initialized');
      return [];
    }
    console.log('📊 Calling sweBenchRunner.listRuns()');
    const sweBenchRuns = await sweBenchRunner.listRuns();
    console.log('📊 Got sweBenchRuns:', sweBenchRuns?.length || 0, 'runs');
    
    // Transform to generic benchmark format
    const benchmarkRuns = sweBenchRuns.map((run: any) => ({
      runId: run.id, // Fix: use 'id' instead of 'runId'
      type: 'swebench' as const,
      createdAt: run.createdAt,
      casesDir: run.casesDir,
      totalCases: run.total, // Fix: use 'total' instead of 'totalCases'
      completedCases: run.completed, // Fix: use 'completed' instead of 'completedCases'
      passedCases: run.passed, // Fix: use 'passed' instead of 'passedCases'
      failedCases: run.failed, // Fix: use 'failed' instead of 'failedCases'
      status: run.status
    }));
    console.log('📊 Transformed benchmarkRuns:', benchmarkRuns);
    return benchmarkRuns;
  } catch (error) {
    console.error('❌ Failed to list benchmark runs:', error);
    return [];
  }
});

ipcMain.handle('benchmarks:getRun', async (_, runId: string) => {
  try {
    console.log('📊 benchmarks:getRun called for runId:', runId);
    const result = await sweBenchRunner.getRun(runId);
    console.log('📊 benchmarks:getRun result:', result);
    return result;
  } catch (error) {
    console.error('❌ Failed to get benchmark run:', error);
    return null;
  }
});

ipcMain.handle('benchmarks:getResults', async (_, runId: string) => {
  try {
    console.log('📊 benchmarks:getResults called for runId:', runId);
    const result = await sweBenchRunner.getResults(runId);
    console.log('📊 benchmarks:getResults result:', result?.length || 0, 'results');
    
    // Transform database results to UI format
    const transformed = result.map(r => ({
      instanceId: r.caseId,
      sessionId: r.sessionId,
      passed: r.status === 'pass',
      completedAt: null, // Could add this if needed
      error: r.status === 'fail' ? 'Test failed' : null
    }));
    
    return transformed;
  } catch (error) {
    console.error('❌ Failed to get benchmark results:', error);
    return [];
  }
});

ipcMain.handle('benchmarks:start', async (_, options: any) => {
  try {
    if (options.type === 'swebench') {
      const runnerOptions = {
        casesDir: options.casesDir,
        name: `SWE-bench Run ${new Date().toISOString().slice(0, 19)}`,
        parallel: options.parallel || 1,
        maxIterations: options.maxIterations || 10,
        timeoutSec: options.timeoutSec || 300,
        filter: options.filter
      };
      const result = await sweBenchRunner.run(runnerOptions);
      return { success: true, runId: result.runId };
    } else {
      // For custom benchmarks, we could extend this later
      throw new Error('Custom benchmarks not yet implemented');
    }
  } catch (error) {
    console.error('Failed to start benchmark:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('benchmarks:abort', async (_, runId: string) => {
  try {
    console.log('📊 benchmarks:abort called for runId:', runId);
    await sweBenchRunner.abortRun(runId);
    return { success: true };
  } catch (error) {
    console.error('❌ Failed to abort benchmark run:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

ipcMain.handle('benchmarks:delete', async (_, runId: string) => {
  try {
    await sweBenchRunner.deleteRun(runId);
    return { success: true };
  } catch (error) {
    console.error('Failed to delete benchmark run:', error);
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

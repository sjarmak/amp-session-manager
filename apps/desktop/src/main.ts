import { app, BrowserWindow, ipcMain, dialog, Notification } from 'electron';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { SessionStore, WorktreeManager, BatchController } from '@ampsm/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let mainWindow: BrowserWindow;

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

// Initialize session store
let store: SessionStore;
let manager: WorktreeManager;
let batchController: BatchController;

// Register IPC handlers immediately to avoid race conditions
ipcMain.handle('sessions:list', async () => {
  try {
    if (!store) {
      console.error('SessionStore not initialized');
      return [];
    }
    return store.getAllSessions();
  } catch (error) {
    console.error('Error getting sessions:', error);
    return [];
  }
});

ipcMain.handle('sessions:get', async (_, sessionId: string) => {
  if (!store) {
    console.error('SessionStore not initialized');
    return null;
  }
  return store.getSession(sessionId);
});

ipcMain.handle('sessions:diff', async (_, sessionId: string) => {
  try {
    if (!manager) {
      return { success: false, error: 'WorktreeManager not initialized' };
    }
    const diff = await manager.getDiff(sessionId);
    return { success: true, diff };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to get diff' };
  }
});

ipcMain.handle('sessions:create', async (_, options) => {
  try {
    if (!manager) {
      return { success: false, error: 'WorktreeManager not initialized' };
    }
    const session = await manager.createSession(options);
    new Notification({
      title: 'Session Created',
      body: `Session "${session.name}" created successfully`,
    }).show();
    return { success: true, session };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

ipcMain.handle('sessions:iterate', async (_, sessionId: string, notes?: string) => {
  try {
    if (!manager) {
      return { success: false, error: 'WorktreeManager not initialized' };
    }
    await manager.iterate(sessionId, notes);
    new Notification({
      title: 'Iteration Complete',
      body: 'Session iteration completed successfully',
    }).show();
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

ipcMain.handle('sessions:squash', async (_, sessionId: string, message: string) => {
  try {
    if (!manager) {
      return { success: false, error: 'WorktreeManager not initialized' };
    }
    await manager.squash(sessionId, message);
    new Notification({
      title: 'Commits Squashed',
      body: 'Session commits squashed successfully',
    }).show();
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

ipcMain.handle('sessions:rebase', async (_, sessionId: string, onto: string) => {
  try {
    if (!manager) {
      return { success: false, error: 'WorktreeManager not initialized' };
    }
    await manager.rebase(sessionId, onto);
    new Notification({
      title: 'Rebase Complete',
      body: 'Session rebased successfully',
    }).show();
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

// New merge flow handlers
ipcMain.handle('sessions:preflight', async (_, sessionId: string) => {
  try {
    if (!manager) {
      return { success: false, error: 'WorktreeManager not initialized' };
    }
    const result = await manager.preflight(sessionId);
    return { success: true, result };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

ipcMain.handle('sessions:squash-session', async (_, sessionId: string, mergeMessage: string, preserveManual: boolean = false) => {
  try {
    if (!manager) {
      return { success: false, error: 'WorktreeManager not initialized' };
    }
    const result = await manager.squashSession(sessionId, {
      message: mergeMessage,
      includeManual: preserveManual ? 'include' : 'exclude'
    });
    return { success: true, result };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

ipcMain.handle('sessions:rebase-onto-base', async (_, sessionId: string) => {
  try {
    if (!manager) {
      return { success: false, error: 'WorktreeManager not initialized' };
    }
    const result = await manager.rebaseOntoBase(sessionId);
    return { success: true, result };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

ipcMain.handle('sessions:continue-merge', async (_, sessionId: string) => {
  try {
    if (!manager) {
      return { success: false, error: 'WorktreeManager not initialized' };
    }
    const result = await manager.continueMerge(sessionId);
    return { success: true, result };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

ipcMain.handle('sessions:abort-merge', async (_, sessionId: string) => {
  try {
    if (!manager) {
      return { success: false, error: 'WorktreeManager not initialized' };
    }
    const result = await manager.abortMerge(sessionId);
    return { success: true, result };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

ipcMain.handle('sessions:fast-forward-merge', async (_, sessionId: string) => {
  try {
    if (!manager) {
      return { success: false, error: 'WorktreeManager not initialized' };
    }
    const result = await manager.fastForwardMerge(sessionId);
    return { success: true, result };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

ipcMain.handle('sessions:export-patch', async (_, sessionId: string, outputPath: string) => {
  try {
    if (!manager) {
      return { success: false, error: 'WorktreeManager not initialized' };
    }
    await manager.exportPatch(sessionId, outputPath);
    new Notification({
      title: 'Patch Exported',
      body: `Patch exported to ${outputPath}`,
    }).show();
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

ipcMain.handle('sessions:cleanup', async (_, sessionId: string) => {
  try {
    if (!manager) {
      return { success: false, error: 'WorktreeManager not initialized' };
    }
    await manager.cleanup(sessionId);
    new Notification({
      title: 'Session Cleaned Up',
      body: 'Worktree and branch removed successfully',
    }).show();
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

ipcMain.handle('dialog:selectDirectory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Repository Directory'
  });
  return result;
});

// Batch IPC handlers
ipcMain.handle('batch:listRuns', async () => {
  try {
    if (!batchController) {
      console.error('BatchController not initialized');
      return [];
    }
    return await batchController.listRuns();
  } catch (error) {
    console.error('Error listing batch runs:', error);
    return [];
  }
});

ipcMain.handle('batch:getRun', async (_, runId: string) => {
  try {
    if (!batchController) {
      console.error('BatchController not initialized');
      return null;
    }
    return await batchController.getRun(runId);
  } catch (error) {
    console.error('Error getting batch run:', error);
    return null;
  }
});

ipcMain.handle('batch:listItems', async (_, options) => {
  try {
    if (!batchController) {
      console.error('BatchController not initialized');
      return { items: [], total: 0 };
    }
    return await batchController.listItems(options);
  } catch (error) {
    console.error('Error listing batch items:', error);
    return { items: [], total: 0 };
  }
});

ipcMain.handle('batch:start', async (_, options) => {
  try {
    if (!batchController) {
      return { success: false, error: 'BatchController not initialized' };
    }
    const runId = await batchController.start(options);
    new Notification({
      title: 'Batch Started',
      body: `Batch run ${runId.slice(0, 8)} started`,
    }).show();
    return { success: true, runId };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

ipcMain.handle('batch:abort', async (_, runId: string) => {
  try {
    if (!batchController) {
      return { success: false, error: 'BatchController not initialized' };
    }
    await batchController.abort(runId);
    new Notification({
      title: 'Batch Aborted',
      body: `Batch run ${runId.slice(0, 8)} aborted`,
    }).show();
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

ipcMain.handle('batch:export', async (_, options) => {
  try {
    if (!batchController) {
      return { success: false, error: 'BatchController not initialized' };
    }
    const filePaths = await batchController.export(options);
    new Notification({
      title: 'Export Complete',
      body: `Data exported to ${options.outDir}`,
    }).show();
    return { success: true, filePaths };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

ipcMain.handle('batch:report', async (_, options) => {
  try {
    if (!batchController) {
      return { success: false, error: 'BatchController not initialized' };
    }
    const outputPath = await batchController.report(options);
    new Notification({
      title: 'Report Generated',
      body: `Report saved to ${outputPath}`,
    }).show();
    return { success: true, outputPath };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

// Initialize core components when app is ready
app.whenReady().then(() => {
  store = new SessionStore();
  manager = new WorktreeManager(store);
  batchController = new BatchController(store);
  
  // Setup batch event forwarding after initialization
  batchController.on('run-started', (data: any) => {
    mainWindow?.webContents.send('batch:event', { type: 'run-started', ...data });
  });

  batchController.on('run-updated', (data: any) => {
    mainWindow?.webContents.send('batch:event', { type: 'run-updated', ...data });
  });

  batchController.on('run-finished', (data: any) => {
    mainWindow?.webContents.send('batch:event', { type: 'run-finished', ...data });
  });

  batchController.on('run-aborted', (data: any) => {
    mainWindow?.webContents.send('batch:event', { type: 'run-aborted', ...data });
  });
});

app.on('before-quit', () => {
  if (store) {
    store.close();
  }
});

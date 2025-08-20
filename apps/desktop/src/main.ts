import { app, BrowserWindow, ipcMain, dialog, Notification } from 'electron';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { SessionStore, WorktreeManager } from '@ampsm/core';

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

app.whenReady().then(() => {
  store = new SessionStore();
  manager = new WorktreeManager(store);
  
  // IPC handlers
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
      const result = await manager.preflight(sessionId);
      return { success: true, result };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  ipcMain.handle('sessions:squash-session', async (_, sessionId: string, options) => {
    try {
      await manager.squashSession(sessionId, options);
      new Notification({
        title: 'Session Squashed',
        body: 'Session commits squashed successfully',
      }).show();
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  ipcMain.handle('sessions:rebase-onto-base', async (_, sessionId: string) => {
    try {
      const result = await manager.rebaseOntoBase(sessionId);
      if (result.status === 'conflict') {
        new Notification({
          title: 'Rebase Conflicts',
          body: `Conflicts detected in ${result.files?.length} files`,
        }).show();
      } else {
        new Notification({
          title: 'Rebase Complete',
          body: 'Session rebased successfully',
        }).show();
      }
      return { success: true, result };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  ipcMain.handle('sessions:continue-merge', async (_, sessionId: string) => {
    try {
      const result = await manager.continueMerge(sessionId);
      if (result.status === 'ok') {
        new Notification({
          title: 'Merge Continued',
          body: 'Rebase completed successfully',
        }).show();
      } else {
        new Notification({
          title: 'More Conflicts',
          body: `Additional conflicts in ${result.files?.length} files`,
        }).show();
      }
      return { success: true, result };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  ipcMain.handle('sessions:abort-merge', async (_, sessionId: string) => {
    try {
      await manager.abortMerge(sessionId);
      new Notification({
        title: 'Merge Aborted',
        body: 'Session returned to previous state',
      }).show();
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  ipcMain.handle('sessions:fast-forward-merge', async (_, sessionId: string, options) => {
    try {
      await manager.fastForwardMerge(sessionId, options || {});
      new Notification({
        title: 'Merge Complete',
        body: 'Session merged into base branch successfully',
      }).show();
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  ipcMain.handle('sessions:export-patch', async (_, sessionId: string, outPath: string) => {
    try {
      await manager.exportPatch(sessionId, outPath);
      new Notification({
        title: 'Patch Exported',
        body: `Patch saved to ${outPath}`,
      }).show();
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  ipcMain.handle('sessions:cleanup', async (_, sessionId: string, force: boolean = true) => {
    try {
      await manager.cleanup(sessionId, force);
      new Notification({
        title: 'Session Cleaned Up',
        body: 'Worktree and branch removed',
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
});

app.on('before-quit', () => {
  if (store) {
    store.close();
  }
});

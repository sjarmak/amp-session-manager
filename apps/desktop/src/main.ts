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
    mainWindow.loadURL('http://localhost:5173');
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
    return store.getAllSessions();
  });

  ipcMain.handle('sessions:get', async (_, sessionId: string) => {
    return store.getSession(sessionId);
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

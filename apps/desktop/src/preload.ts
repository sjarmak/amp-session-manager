import { contextBridge, ipcRenderer } from 'electron';
import type { Session, SessionCreateOptions } from '@ampsm/types';

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  versions: process.versions,
  
  sessions: {
    list: () => ipcRenderer.invoke('sessions:list') as Promise<Session[]>,
    get: (sessionId: string) => ipcRenderer.invoke('sessions:get', sessionId) as Promise<Session | null>,
    create: (options: SessionCreateOptions) => ipcRenderer.invoke('sessions:create', options) as Promise<{ success: boolean; session?: Session; error?: string }>,
    iterate: (sessionId: string, notes?: string) => ipcRenderer.invoke('sessions:iterate', sessionId, notes) as Promise<{ success: boolean; error?: string }>,
    squash: (sessionId: string, message: string) => ipcRenderer.invoke('sessions:squash', sessionId, message) as Promise<{ success: boolean; error?: string }>,
    rebase: (sessionId: string, onto: string) => ipcRenderer.invoke('sessions:rebase', sessionId, onto) as Promise<{ success: boolean; error?: string }>
  },
  
  dialog: {
    selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory') as Promise<Electron.OpenDialogReturnValue>
  }
});

declare global {
  interface Window {
    electronAPI: {
      platform: string;
      versions: NodeJS.ProcessVersions;
      sessions: {
        list: () => Promise<Session[]>;
        get: (sessionId: string) => Promise<Session | null>;
        create: (options: SessionCreateOptions) => Promise<{ success: boolean; session?: Session; error?: string }>;
        iterate: (sessionId: string, notes?: string) => Promise<{ success: boolean; error?: string }>;
        squash: (sessionId: string, message: string) => Promise<{ success: boolean; error?: string }>;
        rebase: (sessionId: string, onto: string) => Promise<{ success: boolean; error?: string }>;
      };
      dialog: {
        selectDirectory: () => Promise<Electron.OpenDialogReturnValue>;
      };
    };
  }
}

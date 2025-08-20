import { contextBridge, ipcRenderer } from 'electron';
import type { Session, SessionCreateOptions, PreflightResult, SquashOptions, RebaseResult, MergeOptions } from '@ampsm/types';

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  versions: process.versions,
  
  sessions: {
    list: () => ipcRenderer.invoke('sessions:list') as Promise<Session[]>,
    get: (sessionId: string) => ipcRenderer.invoke('sessions:get', sessionId) as Promise<Session | null>,
    create: (options: SessionCreateOptions) => ipcRenderer.invoke('sessions:create', options) as Promise<{ success: boolean; session?: Session; error?: string }>,
    iterate: (sessionId: string, notes?: string) => ipcRenderer.invoke('sessions:iterate', sessionId, notes) as Promise<{ success: boolean; error?: string }>,
    squash: (sessionId: string, message: string) => ipcRenderer.invoke('sessions:squash', sessionId, message) as Promise<{ success: boolean; error?: string }>,
    rebase: (sessionId: string, onto: string) => ipcRenderer.invoke('sessions:rebase', sessionId, onto) as Promise<{ success: boolean; error?: string }>,
    
    // New merge flow methods
    preflight: (sessionId: string) => ipcRenderer.invoke('sessions:preflight', sessionId) as Promise<{ success: boolean; result?: PreflightResult; error?: string }>,
    squashSession: (sessionId: string, options: SquashOptions) => ipcRenderer.invoke('sessions:squash-session', sessionId, options) as Promise<{ success: boolean; error?: string }>,
    rebaseOntoBase: (sessionId: string) => ipcRenderer.invoke('sessions:rebase-onto-base', sessionId) as Promise<{ success: boolean; result?: RebaseResult; error?: string }>,
    continueMerge: (sessionId: string) => ipcRenderer.invoke('sessions:continue-merge', sessionId) as Promise<{ success: boolean; result?: RebaseResult; error?: string }>,
    abortMerge: (sessionId: string) => ipcRenderer.invoke('sessions:abort-merge', sessionId) as Promise<{ success: boolean; error?: string }>,
    fastForwardMerge: (sessionId: string, options?: MergeOptions) => ipcRenderer.invoke('sessions:fast-forward-merge', sessionId, options) as Promise<{ success: boolean; error?: string }>,
    exportPatch: (sessionId: string, outPath: string) => ipcRenderer.invoke('sessions:export-patch', sessionId, outPath) as Promise<{ success: boolean; error?: string }>,
    cleanup: (sessionId: string) => ipcRenderer.invoke('sessions:cleanup', sessionId) as Promise<{ success: boolean; error?: string }>,
    diff: (sessionId: string) => ipcRenderer.invoke('sessions:diff', sessionId) as Promise<{ success: boolean; diff?: string; error?: string }>,
    thread: (sessionId: string) => ipcRenderer.invoke('sessions:thread', sessionId) as Promise<{ success: boolean; threadConversation?: string; error?: string }>
  },
  
  dialog: {
    selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory') as Promise<Electron.OpenDialogReturnValue>
  },

  batch: {
    listRuns: () => ipcRenderer.invoke('batch:listRuns'),
    getRun: (runId: string) => ipcRenderer.invoke('batch:getRun', runId),
    listItems: (options: any) => ipcRenderer.invoke('batch:listItems', options),
    start: (options: any) => ipcRenderer.invoke('batch:start', options),
    abort: (runId: string) => ipcRenderer.invoke('batch:abort', runId),
    export: (options: any) => ipcRenderer.invoke('batch:export', options),
    report: (options: any) => ipcRenderer.invoke('batch:report', options),
    onEvent: (callback: (event: any) => void) => {
      ipcRenderer.on('batch:event', (_, event) => callback(event));
    },
    offEvent: (callback: (event: any) => void) => {
      ipcRenderer.removeListener('batch:event', callback);
    }
  },

  notifications: {
    getSettings: () => ipcRenderer.invoke('notifications:getSettings'),
    updateSettings: (settings: any) => ipcRenderer.invoke('notifications:updateSettings', settings),
    test: (type: string) => ipcRenderer.invoke('notifications:test', type),
    onAction: (callback: (action: string) => void) => {
      const handler = (_: any, action: string) => callback(action);
      ipcRenderer.on('notification:action', handler);
    },
    offAction: (callback: (action: string) => void) => {
      const handler = (_: any, action: string) => callback(action);
      ipcRenderer.removeListener('notification:action', handler);
    }
  }
});

export {};

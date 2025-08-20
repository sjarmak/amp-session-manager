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
    diff: (sessionId: string) => ipcRenderer.invoke('sessions:diff', sessionId) as Promise<{ success: boolean; diff?: string; error?: string }>
  },
  
  dialog: {
    selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory') as Promise<Electron.OpenDialogReturnValue>
  }
});

export {};

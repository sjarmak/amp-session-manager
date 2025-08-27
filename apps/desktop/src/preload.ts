import { contextBridge, ipcRenderer } from 'electron';
import type { Session, SessionCreateOptions, PreflightResult, SquashOptions, RebaseResult, MergeOptions } from '@ampsm/types';

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  versions: process.versions,
  
  sessions: {
    list: () => ipcRenderer.invoke('sessions:list') as Promise<Session[]>,
    get: (sessionId: string) => ipcRenderer.invoke('sessions:get', sessionId) as Promise<Session | null>,
    create: (options: SessionCreateOptions) => ipcRenderer.invoke('sessions:create', options) as Promise<{ success: boolean; session?: Session; error?: string }>,
    iterate: (sessionId: string, notes?: string, includeContext?: boolean) => ipcRenderer.invoke('sessions:iterate', sessionId, notes, includeContext) as Promise<{ success: boolean; error?: string }>,
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
    cleanup: (sessionId: string, force?: boolean) => ipcRenderer.invoke('sessions:cleanup', sessionId, force) as Promise<{ success: boolean; error?: string }>,
    diff: (sessionId: string) => ipcRenderer.invoke('sessions:diff', sessionId) as Promise<{ success: boolean; diff?: string; error?: string }>,
    thread: (sessionId: string) => ipcRenderer.invoke('sessions:thread', sessionId) as Promise<{ success: boolean; threadConversation?: string; error?: string }>,
    getThreads: (sessionId: string) => ipcRenderer.invoke('sessions:getThreads', sessionId) as Promise<{ success: boolean; threads?: any[]; error?: string }>,
    getThreadMessages: (threadId: string) => ipcRenderer.invoke('sessions:getThreadMessages', threadId) as Promise<{ success: boolean; messages?: any[]; error?: string }>,
    syncThreadIds: () => ipcRenderer.invoke('sessions:syncThreadIds') as Promise<{ success: boolean; error?: string }>,
    getIterations: (sessionId: string) => ipcRenderer.invoke('sessions:getIterations', sessionId) as Promise<{ success: boolean; iterations?: any[]; error?: string }>,
    getToolCalls: (sessionId: string) => ipcRenderer.invoke('sessions:getToolCalls', sessionId) as Promise<{ success: boolean; toolCalls?: any[]; error?: string }>,
    getStreamEvents: (sessionId: string) => ipcRenderer.invoke('sessions:getStreamEvents', sessionId) as Promise<{ success: boolean; streamEvents?: any[]; error?: string }>,
    
    // Git Actions methods
    getGitStatus: (sessionId: string) => ipcRenderer.invoke('sessions:getGitStatus', sessionId) as Promise<{ success: boolean; result?: any; error?: string }>,
    stageAllChanges: (sessionId: string) => ipcRenderer.invoke('sessions:stageAllChanges', sessionId) as Promise<{ success: boolean; error?: string }>,
    unstageAllChanges: (sessionId: string) => ipcRenderer.invoke('sessions:unstageAllChanges', sessionId) as Promise<{ success: boolean; error?: string }>,
    commitStagedChanges: (sessionId: string, message: string) => ipcRenderer.invoke('sessions:commitStagedChanges', sessionId, message) as Promise<{ success: boolean; result?: { commitSha: string }; error?: string }>,
    rollbackLastCommit: (sessionId: string) => ipcRenderer.invoke('sessions:rollbackLastCommit', sessionId) as Promise<{ success: boolean; error?: string }>,
    rollbackToCommit: (sessionId: string, commitSha: string) => ipcRenderer.invoke('sessions:rollbackToCommit', sessionId, commitSha) as Promise<{ success: boolean; error?: string }>,
    squashCommits: (sessionId: string, options: any) => ipcRenderer.invoke('sessions:squashCommits', sessionId, options) as Promise<{ success: boolean; error?: string }>,
    openInEditor: (sessionId: string) => ipcRenderer.invoke('sessions:openInEditor', sessionId) as Promise<{ success: boolean; error?: string }>,
    setAutoCommit: (sessionId: string, autoCommit: boolean) => ipcRenderer.invoke('sessions:setAutoCommit', sessionId, autoCommit) as Promise<{ success: boolean; error?: string }>,
    
    // Enhanced Git Actions
    stageFiles: (sessionId: string, files: string[]) => ipcRenderer.invoke('sessions:stageFiles', sessionId, files) as Promise<{ success: boolean; error?: string }>,
    unstageFiles: (sessionId: string, files: string[]) => ipcRenderer.invoke('sessions:unstageFiles', sessionId, files) as Promise<{ success: boolean; error?: string }>,
    commitAmend: (sessionId: string, message: string) => ipcRenderer.invoke('sessions:commitAmend', sessionId, message) as Promise<{ success: boolean; result?: { commitSha: string }; error?: string }>,
    resetToCommit: (sessionId: string, commitRef: string, soft?: boolean) => ipcRenderer.invoke('sessions:resetToCommit', sessionId, commitRef, soft) as Promise<{ success: boolean; error?: string }>,
    cherryPick: (sessionId: string, shas: string[]) => ipcRenderer.invoke('sessions:cherryPick', sessionId, shas) as Promise<{ success: boolean; error?: string }>,
    getDiff: (sessionId: string, filePath?: string) => ipcRenderer.invoke('sessions:getDiff', sessionId, filePath) as Promise<{ success: boolean; result?: { diff: string }; error?: string }>
  },

  // Main repository git operations
  main: {
    getGitStatus: (repoPath: string) => ipcRenderer.invoke('main:getGitStatus', repoPath) as Promise<{ success: boolean; result?: any; error?: string }>,
    stageAllChanges: (repoPath: string) => ipcRenderer.invoke('main:stageAllChanges', repoPath) as Promise<{ success: boolean; error?: string }>,
    unstageAllChanges: (repoPath: string) => ipcRenderer.invoke('main:unstageAllChanges', repoPath) as Promise<{ success: boolean; error?: string }>,
    commitStagedChanges: (repoPath: string, message: string) => ipcRenderer.invoke('main:commitStagedChanges', repoPath, message) as Promise<{ success: boolean; result?: { commitSha: string }; error?: string }>
  },

  interactive: {
    start: (sessionId: string, threadId?: string) => ipcRenderer.invoke('interactive:start', sessionId, threadId) as Promise<{ success: boolean; handleId?: string; error?: string }>,
    send: (sessionId: string, handleId: string, message: string) => ipcRenderer.invoke('interactive:send', sessionId, handleId, message) as Promise<{ success: boolean; error?: string }>,
    stop: (sessionId: string, handleId: string) => ipcRenderer.invoke('interactive:stop', sessionId, handleId) as Promise<{ success: boolean; error?: string }>,
    getHistory: (sessionId: string) => ipcRenderer.invoke('interactive:getHistory', sessionId) as Promise<{ success: boolean; events?: any[]; error?: string }>,
    
    onEvent: (callback: (sessionId: string, handleId: string, event: any) => void) => {
      const handler = (_: any, sessionId: string, handleId: string, event: any) => callback(sessionId, handleId, event);
      ipcRenderer.on('interactive:event', handler);
      return () => ipcRenderer.removeListener('interactive:event', handler);
    },
    
    onState: (callback: (sessionId: string, handleId: string, state: string) => void) => {
      const handler = (_: any, sessionId: string, handleId: string, state: string) => callback(sessionId, handleId, state);
      ipcRenderer.on('interactive:state', handler);
      return () => ipcRenderer.removeListener('interactive:state', handler);
    },
    
    onError: (callback: (sessionId: string, handleId: string, error: string) => void) => {
      const handler = (_: any, sessionId: string, handleId: string, error: string) => callback(sessionId, handleId, error);
      ipcRenderer.on('interactive:error', handler);
      return () => ipcRenderer.removeListener('interactive:error', handler);
    }
  },
  
  dialog: {
    selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory') as Promise<Electron.OpenDialogReturnValue>,
    selectFile: () => ipcRenderer.invoke('dialog:selectFile') as Promise<Electron.OpenDialogReturnValue>
  },

  fs: {
    readFile: (filePath: string) => ipcRenderer.invoke('fs:readFile', filePath) as Promise<{ success: boolean; content?: string; error?: string }>
  },

  batch: {
    listRuns: () => ipcRenderer.invoke('batch:listRuns'),
    getRun: (runId: string) => ipcRenderer.invoke('batch:getRun', runId),
    listItems: (options: any) => ipcRenderer.invoke('batch:listItems', options),
    start: (options: any) => ipcRenderer.invoke('batch:start', options),
    abort: (runId: string) => ipcRenderer.invoke('batch:abort', runId),
    delete: (runId: string) => ipcRenderer.invoke('batch:delete', runId),
    export: (options: any) => ipcRenderer.invoke('batch:export', options),
    report: (options: any) => ipcRenderer.invoke('batch:report', options),
    cleanEnvironment: () => ipcRenderer.invoke('batch:cleanEnvironment'),
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
  },

  metrics: {
    getSessionSummary: (sessionId: string) => ipcRenderer.invoke('metrics:getSessionSummary', sessionId),
    getIterationMetrics: (sessionId: string) => ipcRenderer.invoke('metrics:getIterationMetrics', sessionId),
    getRealtimeMetrics: (sessionId: string) => ipcRenderer.invoke('metrics:getRealtimeMetrics', sessionId),
    getSessionProgress: (sessionId: string) => ipcRenderer.invoke('metrics:getSessionProgress', sessionId),
    exportMetrics: (sessionId: string, options: any) => ipcRenderer.invoke('metrics:exportMetrics', sessionId, options)
  },

  benchmarks: {
    listRuns: () => ipcRenderer.invoke('benchmarks:listRuns'),
    getRun: (runId: string) => ipcRenderer.invoke('benchmarks:getRun', runId),
    getResults: (runId: string) => ipcRenderer.invoke('benchmarks:getResults', runId),
    start: (options: any) => ipcRenderer.invoke('benchmarks:start', options),
    abort: (runId: string) => ipcRenderer.invoke('benchmarks:abort', runId),
    delete: (runId: string) => ipcRenderer.invoke('benchmarks:delete', runId)
  },

  // Auth and external links
  validateAuth: () => ipcRenderer.invoke('auth:validate') as Promise<{
    isAuthenticated: boolean;
    error?: string;
    suggestion?: string;
    hasCredits?: boolean;
  }>,
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url) as Promise<void>,
  
  shell: {
    openPath: (path: string) => ipcRenderer.invoke('shell:openPath', path) as Promise<string>
  },

  // Event listeners for interactive changes
  onInteractiveChangesStaged: (callback: (event: any, sessionId: string, data: any) => void) => {
    ipcRenderer.on('interactive:changes-staged', callback);
  },
  
  offInteractiveChangesStaged: (callback: (event: any, sessionId: string, data: any) => void) => {
    ipcRenderer.removeListener('interactive:changes-staged', callback);
  }
});

export {};

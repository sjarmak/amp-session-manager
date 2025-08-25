import type { Session, SessionCreateOptions, PreflightResult, SquashOptions, RebaseResult, MergeOptions, Plan } from '@ampsm/types';

declare global {
  interface Window {
    electronAPI: {
      platform: string;
      versions: NodeJS.ProcessVersions;
      sessions: {
        list: () => Promise<Session[]>;
        get: (sessionId: string) => Promise<Session | null>;
        create: (options: SessionCreateOptions) => Promise<{ success: boolean; session?: Session; error?: string }>;
        iterate: (sessionId: string, notes?: string, includeContext?: boolean) => Promise<{ success: boolean; error?: string }>;
        squash: (sessionId: string, message: string) => Promise<{ success: boolean; error?: string }>;
        rebase: (sessionId: string, onto: string) => Promise<{ success: boolean; error?: string }>;
        
        // New merge flow methods
        preflight: (sessionId: string) => Promise<{ success: boolean; result?: PreflightResult; error?: string }>;
        squashSession: (sessionId: string, options: SquashOptions) => Promise<{ success: boolean; error?: string }>;
        rebaseOntoBase: (sessionId: string) => Promise<{ success: boolean; result?: RebaseResult; error?: string }>;
        continueMerge: (sessionId: string) => Promise<{ success: boolean; result?: RebaseResult; error?: string }>;
        abortMerge: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
        fastForwardMerge: (sessionId: string, options?: MergeOptions) => Promise<{ success: boolean; error?: string }>;
        exportPatch: (sessionId: string, outPath: string) => Promise<{ success: boolean; error?: string }>;
        cleanup: (sessionId: string, force?: boolean) => Promise<{ success: boolean; error?: string }>;
        diff: (sessionId: string) => Promise<{ success: boolean; diff?: string; error?: string }>;
        thread: (sessionId: string) => Promise<{ success: boolean; threadConversation?: string; error?: string }>;
        getThreads: (sessionId: string) => Promise<{ success: boolean; threads?: any[]; error?: string }>;
        getThreadMessages: (threadId: string) => Promise<{ success: boolean; messages?: any[]; error?: string }>;
        getIterations: (sessionId: string) => Promise<{ success: boolean; iterations?: any[]; error?: string }>;
        getToolCalls: (sessionId: string) => Promise<{ success: boolean; toolCalls?: any[]; error?: string }>;
        getStreamEvents: (sessionId: string) => Promise<{ success: boolean; streamEvents?: any[]; error?: string }>;
      };
      interactive: {
        start: (sessionId: string, threadId?: string) => Promise<{ success: boolean; error?: string }>;
        send: (sessionId: string, message: string) => Promise<{ success: boolean; error?: string }>;
        stop: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
        getHistory: (sessionId: string) => Promise<{ success: boolean; events?: any[]; error?: string }>;
        onEvent: (callback: (sessionId: string, event: any) => void) => () => void;
        onState: (callback: (sessionId: string, state: string) => void) => () => void;
        onError: (callback: (sessionId: string, error: string) => void) => () => void;
      };
      dialog: {
        selectDirectory: () => Promise<Electron.OpenDialogReturnValue>;
        selectFile: () => Promise<Electron.OpenDialogReturnValue>;
      };
      fs: {
        readFile: (filePath: string) => Promise<{ success: boolean; content?: string; error?: string }>;
      };
      batch: {
        listRuns: () => Promise<any[]>;
        getRun: (runId: string) => Promise<any>;
        listItems: (options: any) => Promise<{ items: any[]; total: number }>;
        start: (options: any) => Promise<{ success: boolean; runId?: string; error?: string }>;
        abort: (runId: string) => Promise<{ success: boolean; error?: string }>;
        delete: (runId: string) => Promise<{ success: boolean; error?: string }>;
        export: (options: any) => Promise<{ success: boolean; filePaths?: string[]; error?: string }>;
        report: (options: any) => Promise<{ success: boolean; outputPath?: string; error?: string }>;
        cleanEnvironment: () => Promise<{ [repoRoot: string]: { removedDirs: number; removedSessions: number } }>;
        onEvent: (callback: (event: any) => void) => void;
        offEvent: (callback: (event: any) => void) => void;
      };
      notifications: {
        getSettings: () => Promise<any>;
        updateSettings: (settings: any) => Promise<{ success: boolean; error?: string }>;
        test: (type: string) => Promise<{ success: boolean; error?: string }>;
        onAction: (callback: (action: string) => void) => void;
        offAction: (callback: (action: string) => void) => void;
      };
      metrics: {
        getSessionSummary: (sessionId: string) => Promise<{ success: boolean; summary?: any; error?: string }>;
        getIterationMetrics: (sessionId: string) => Promise<{ success: boolean; iterations?: any[]; error?: string }>;
        getRealtimeMetrics: (sessionId: string) => Promise<{ success: boolean; metrics?: any; error?: string }>;
        getSessionProgress: (sessionId: string) => Promise<{ success: boolean; progress?: any; error?: string }>;
        exportMetrics: (sessionId: string, options: any) => Promise<{ success: boolean; result?: any; error?: string }>;
      };
      benchmarks: {
        listRuns: () => Promise<any[]>;
        getRun: (runId: string) => Promise<any>;
        getResults: (runId: string) => Promise<any[]>;
        start: (options: any) => Promise<{ success: boolean; runId?: string; error?: string }>;
        abort: (runId: string) => Promise<{ success: boolean; error?: string }>;
        delete: (runId: string) => Promise<{ success: boolean; error?: string }>;
      };
      
      // Auth and external links
      validateAuth: () => Promise<{
        isAuthenticated: boolean;
        error?: string;
        suggestion?: string;
        hasCredits?: boolean;
      }>;
      openExternal: (url: string) => Promise<void>;
    };
  }
}

import type { Session, SessionCreateOptions, PreflightResult, SquashOptions, RebaseResult, MergeOptions } from '@ampsm/types';

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
        
        // New merge flow methods
        preflight: (sessionId: string) => Promise<{ success: boolean; result?: PreflightResult; error?: string }>;
        squashSession: (sessionId: string, options: SquashOptions) => Promise<{ success: boolean; error?: string }>;
        rebaseOntoBase: (sessionId: string) => Promise<{ success: boolean; result?: RebaseResult; error?: string }>;
        continueMerge: (sessionId: string) => Promise<{ success: boolean; result?: RebaseResult; error?: string }>;
        abortMerge: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
        fastForwardMerge: (sessionId: string, options?: MergeOptions) => Promise<{ success: boolean; error?: string }>;
        exportPatch: (sessionId: string, outPath: string) => Promise<{ success: boolean; error?: string }>;
        cleanup: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
        diff: (sessionId: string) => Promise<{ success: boolean; diff?: string; error?: string }>;
      };
      dialog: {
        selectDirectory: () => Promise<Electron.OpenDialogReturnValue>;
      };
    };
  }
}

export interface CommitMeta {
  sha: string;
  message: string;
  author: string;
  timestamp: number;
}

export interface GitFileInfo {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'copied' | 'untracked';
}

export interface GitState {
  unstaged: GitFileInfo[];
  staged: GitFileInfo[];
  commits: CommitMeta[];
  selectedCommits: string[]; // commit SHAs
  squash: boolean;
  preserveManualCommits: boolean;
  isDirty: boolean; // any pending filesystem changes
  step: WizardStep;
  loading: boolean;
  error?: string;
}

export type WizardStep = 
  | 'preflight'
  | 'stage'
  | 'commit'
  | 'plan'
  | 'rebase'
  | 'merge'
  | 'cleanup'
  | 'done';

export type GitAction = 
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'SET_ERROR'; error?: string }
  | { type: 'SET_STEP'; step: WizardStep }
  | { type: 'REFRESH_STATE'; payload: Partial<GitState> }
  | { type: 'SET_STAGED_FILES'; files: GitFileInfo[] }
  | { type: 'SET_UNSTAGED_FILES'; files: GitFileInfo[] }
  | { type: 'SET_COMMITS'; commits: CommitMeta[] }
  | { type: 'TOGGLE_COMMIT_SELECTION'; sha: string }
  | { type: 'SET_SQUASH'; squash: boolean }
  | { type: 'SET_PRESERVE_MANUAL_COMMITS'; preserve: boolean }
  | { type: 'SET_IS_DIRTY'; isDirty: boolean };

export const initialGitState: GitState = {
  unstaged: [],
  staged: [],
  commits: [],
  selectedCommits: [],
  squash: true,
  preserveManualCommits: false,
  isDirty: false,
  step: 'preflight',
  loading: false,
  error: undefined,
};

export function gitStateReducer(state: GitState, action: GitAction): GitState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: action.loading };
    
    case 'SET_ERROR':
      return { ...state, error: action.error, loading: false };
    
    case 'SET_STEP':
      return { ...state, step: action.step };
    
    case 'REFRESH_STATE':
      return { ...state, ...action.payload, loading: false };
    
    case 'SET_STAGED_FILES':
      return { ...state, staged: action.files };
    
    case 'SET_UNSTAGED_FILES':
      return { ...state, unstaged: action.files };
    
    case 'SET_COMMITS':
      // Auto-select all commits by default
      const selectedCommits = action.commits.map(c => c.sha);
      return { ...state, commits: action.commits, selectedCommits };
    
    case 'TOGGLE_COMMIT_SELECTION':
      const isSelected = state.selectedCommits.includes(action.sha);
      const newSelection = isSelected 
        ? state.selectedCommits.filter(sha => sha !== action.sha)
        : [...state.selectedCommits, action.sha];
      return { ...state, selectedCommits: newSelection };
    
    case 'SET_SQUASH':
      return { ...state, squash: action.squash };
    
    case 'SET_PRESERVE_MANUAL_COMMITS':
      return { ...state, preserveManualCommits: action.preserve };
    
    case 'SET_IS_DIRTY':
      return { ...state, isDirty: action.isDirty };
    
    default:
      return state;
  }
}

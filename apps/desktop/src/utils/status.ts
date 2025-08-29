/**
 * Shared status styling utilities
 */

export type StatusType = 'idle' | 'running' | 'awaiting-input' | 'error' | 'done' | 'completed' | 'failed' | 'success' | 'conflicts' | 'dirty' | 'clean' | 'staged' | 'unstaged' | 'aborted';

export function getStatusColor(status: StatusType): string {
  switch (status?.toLowerCase()) {
    case 'running':
      return 'text-gruvbox-blue';
    case 'awaiting-input':
      return 'text-gruvbox-orange';
    case 'error':
    case 'failed':
      return 'text-gruvbox-red';
    case 'done':
    case 'completed':
    case 'success':
      return 'text-gruvbox-green';
    case 'conflicts':
      return 'text-gruvbox-yellow';
    case 'dirty':
      return 'text-gruvbox-red';
    case 'clean':
      return 'text-gruvbox-green';
    case 'staged':
      return 'text-gruvbox-aqua';
    case 'unstaged':
      return 'text-gruvbox-orange';
    case 'aborted':
      return 'text-gruvbox-yellow';
    case 'idle':
    default:
      return 'text-gruvbox-light3';
  }
}

export function getStatusBgColor(status: StatusType): string {
  switch (status?.toLowerCase()) {
    case 'running':
      return 'bg-gruvbox-blue/20';
    case 'awaiting-input':
      return 'bg-gruvbox-orange/20';
    case 'error':
    case 'failed':
      return 'bg-gruvbox-red/20';
    case 'done':
    case 'completed':
    case 'success':
      return 'bg-gruvbox-green/20';
    case 'conflicts':
      return 'bg-gruvbox-yellow/20';
    case 'dirty':
      return 'bg-gruvbox-red/20';
    case 'clean':
      return 'bg-gruvbox-green/20';
    case 'staged':
      return 'bg-gruvbox-aqua/20';
    case 'unstaged':
      return 'bg-gruvbox-orange/20';
    case 'aborted':
      return 'bg-gruvbox-yellow/20';
    case 'idle':
    default:
      return 'bg-gruvbox-dark2';
  }
}

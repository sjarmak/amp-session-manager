/**
 * Shared date and time utility functions for core package
 */

export function createTimestampId(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
}

export function getCurrentISOString(): string {
  return new Date().toISOString();
}

import type { AmpRuntimeConfig } from '@ampsm/types';

export function getAmpCliPath(cfg: AmpRuntimeConfig = {}): string {
  // If server URL is configured, use 'amp' with --server flag
  if (cfg.ampServerUrl) {
    return 'amp';
  }
  
  return (
    cfg.ampCliPath ||
    process.env.AMP_CLI_PATH ||
    process.env.AMP_BIN ||
    'amp'
  );
}

export function getAmpExtraArgs(cfg: AmpRuntimeConfig = {}): string[] {
  // Local amp CLI uses AMP_URL environment variable, not --server flag
  return [];
}

export function getAmpEnvironment(cfg: AmpRuntimeConfig = {}): Record<string, string> {
  const env: Record<string, string> = {};
  if (cfg.ampServerUrl) {
    env.AMP_URL = cfg.ampServerUrl;
    // Disable TLS verification for local development servers
    if (cfg.ampServerUrl.includes('localhost')) {
      env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    }
  } else if (cfg.ampCliPath && cfg.ampCliPath.includes('/Users/sjarmak/amp/')) {
    // Local CLI binary should also use local server settings
    env.AMP_URL = 'https://localhost:7002';
    env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  }
  return env;
}

export function validateAmpPath(path: string): boolean {
  try {
    const fs = require('fs');
    return fs.existsSync(path) && fs.constants && 
           (fs.accessSync(path, fs.constants.F_OK | fs.constants.X_OK), true);
  } catch {
    return false;
  }
}

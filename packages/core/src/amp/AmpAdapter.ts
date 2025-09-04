import type { AmpRuntimeConfig } from '@ampsm/types';

export function getAmpCliPath(cfg: AmpRuntimeConfig = {}): string {
  // Explicit "production" CLI path always takes precedence
  if (cfg.ampCliPath === 'production') {
    return 'amp';
  }
  
  // Prefer explicit ampCliPath setting if configured
  if (cfg.ampCliPath) {
    return cfg.ampCliPath;
  }
  
  // If server URL is configured but no explicit CLI path, use global amp
  if (cfg.ampServerUrl) {
    return 'amp';
  }
  
  return (
    process.env.AMP_CLI_PATH ||
    process.env.AMP_BIN ||
    'amp'
  );
}

export function getAmpExtraArgs(cfg: AmpRuntimeConfig = {}): string[] {
  // Local amp CLI uses AMP_URL environment variable, not --server flag
  return [];
}

export function getAmpEnvironment(cfg: AmpRuntimeConfig = {}, ampSettings?: { mode?: string }): Record<string, string> {
  const env: Record<string, string> = {};
  
  // Explicit "production" CLI path should use default production server
  if (cfg.ampCliPath === 'production') {
    // Don't set AMP_URL - let production amp use its default server
    return env;
  }
  
  // In production mode, don't set any environment overrides
  if (ampSettings?.mode === 'production') {
    return env;
  }
  
  // Local server mode: use configured server URL
  if (cfg.ampServerUrl) {
    env.AMP_URL = cfg.ampServerUrl;
    // Disable TLS verification for local development servers
    if (cfg.ampServerUrl.includes('localhost')) {
      env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    }
  }
  
  // Local CLI mode: always set local server URL when using local CLI
  if (ampSettings?.mode === 'local-cli' && cfg.ampCliPath && cfg.ampCliPath.includes('/Users/sjarmak/amp/')) {
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

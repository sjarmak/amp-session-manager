import { homedir } from 'os';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

/**
 * Returns the appropriate user configuration directory for the current platform
 * 
 * @returns Absolute path to user config directory
 */
export function getUserConfigDir(): string {
  const platform = process.platform;
  
  switch (platform) {
    case 'darwin': // macOS
      return join(homedir(), 'Library', 'Application Support', 'ampsm');
    case 'win32': // Windows
      return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'ampsm');
    default: // Linux and other Unix-like systems
      return join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'ampsm');
  }
}

/**
 * Returns the SQLite database path, checking for environment override
 * Creates the config directory if it doesn't exist
 * 
 * @returns Absolute path to SQLite database file
 */
export function getDbPath(): string {
  // Check for environment variable override first
  const envDbPath = process.env.AMPSM_DB_PATH;
  if (envDbPath) {
    return envDbPath;
  }

  // Use user config directory
  const configDir = getUserConfigDir();
  
  // Ensure the config directory exists
  if (!existsSync(configDir)) {
    try {
      mkdirSync(configDir, { recursive: true });
    } catch (error) {
      console.error(`Failed to create config directory ${configDir}:`, error);
      // Fall back to current directory if we can't create the config directory
      return './sessions.sqlite';
    }
  }

  return join(configDir, 'sessions.sqlite');
}

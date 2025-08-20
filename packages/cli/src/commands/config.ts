import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

interface Config {
  ampPath?: string;
  ampArgs?: string;
  enableJSONLogs?: boolean;
  ampEnv?: {
    AMP_BIN?: string;
    AMP_ARGS?: string;
    AMP_ENABLE_JSONL?: boolean;
    AMP_AUTH_CMD?: string;
    AMP_TOKEN?: string;
    [key: string]: any;
  };
}

const CONFIG_DIR = join(homedir(), '.amp-session-manager');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

async function loadConfig(): Promise<Config> {
  try {
    const content = await readFile(CONFIG_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

async function saveConfig(config: Config): Promise<void> {
  try {
    await mkdir(CONFIG_DIR, { recursive: true });
    await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error('Failed to save config:', error);
    process.exit(1);
  }
}

/**
 * Redacts secrets from configuration display
 */
function redactConfigSecrets(config: Config): Config {
  const redacted = JSON.parse(JSON.stringify(config)); // Deep clone
  
  if (redacted.ampEnv) {
    Object.keys(redacted.ampEnv).forEach(key => {
      if (/TOKEN|KEY|SECRET/i.test(key) && redacted.ampEnv![key]) {
        redacted.ampEnv![key] = '[REDACTED]';
      }
    });
  }
  
  return redacted;
}

export async function configSetCommand(key: string, value: string) {
  const validKeys = [
    'ampPath', 'ampArgs', 'enableJSONLogs',
    'ampEnv.AMP_BIN', 'ampEnv.AMP_ARGS', 'ampEnv.AMP_ENABLE_JSONL',
    'ampEnv.AMP_AUTH_CMD', 'ampEnv.AMP_TOKEN'
  ];
  
  if (!validKeys.includes(key)) {
    console.error(`Invalid config key: ${key}`);
    console.error(`Valid keys: ${validKeys.join(', ')}`);
    process.exit(1);
  }

  const config = await loadConfig();
  
  // Handle nested ampEnv keys
  if (key.startsWith('ampEnv.')) {
    if (!config.ampEnv) {
      config.ampEnv = {};
    }
    const envKey = key.replace('ampEnv.', '');
    
    if (envKey === 'AMP_ENABLE_JSONL') {
      config.ampEnv[envKey] = value.toLowerCase() === 'true';
    } else {
      config.ampEnv[envKey] = value;
    }
  } else if (key === 'enableJSONLogs') {
    config[key] = value.toLowerCase() === 'true';
  } else {
    (config as any)[key] = value;
  }

  await saveConfig(config);
  
  // Redact the value in output if it's a secret
  const displayValue = /TOKEN|KEY|SECRET/i.test(key) ? '[REDACTED]' : value;
  console.log(`Set ${key} = ${displayValue}`);
}

export async function configGetCommand(key?: string) {
  const config = await loadConfig();
  const redacted = redactConfigSecrets(config);
  
  if (key) {
    let value: any;
    
    // Handle nested ampEnv keys
    if (key.startsWith('ampEnv.')) {
      const envKey = key.replace('ampEnv.', '');
      value = redacted.ampEnv?.[envKey];
    } else {
      value = (redacted as any)[key];
    }
    
    if (value !== undefined) {
      console.log(value);
    } else {
      console.log('(not set)');
    }
  } else {
    console.log(JSON.stringify(redacted, null, 2));
  }
}

export async function configListCommand() {
  await configGetCommand();
}

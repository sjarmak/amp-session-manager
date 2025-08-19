import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

interface Config {
  ampPath?: string;
  ampArgs?: string;
  enableJSONLogs?: boolean;
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

export async function configSetCommand(key: string, value: string) {
  const validKeys = ['ampPath', 'ampArgs', 'enableJSONLogs'];
  
  if (!validKeys.includes(key)) {
    console.error(`Invalid config key: ${key}`);
    console.error(`Valid keys: ${validKeys.join(', ')}`);
    process.exit(1);
  }

  const config = await loadConfig();
  
  if (key === 'enableJSONLogs') {
    config[key] = value.toLowerCase() === 'true';
  } else {
    (config as any)[key] = value;
  }

  await saveConfig(config);
  console.log(`Set ${key} = ${value}`);
}

export async function configGetCommand(key?: string) {
  const config = await loadConfig();
  
  if (key) {
    const value = (config as any)[key];
    if (value !== undefined) {
      console.log(value);
    } else {
      console.log('(not set)');
    }
  } else {
    console.log(JSON.stringify(config, null, 2));
  }
}

export async function configListCommand() {
  await configGetCommand();
}

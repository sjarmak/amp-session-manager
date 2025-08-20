import { spawn } from 'child_process';

export interface AmpAuthConfig {
  ampBin?: string;
  ampArgs?: string;
  ampAuthCmd?: string;
  ampToken?: string;
  enableJsonL?: boolean;
}

export interface AmpVersionInfo {
  version: string;
  success: boolean;
  error?: string;
}

/**
 * Redacts secrets from environment variables and command outputs
 */
function redactSecrets(text: string, env?: Record<string, string>): string {
  let redacted = text;
  
  if (env) {
    Object.entries(env).forEach(([key, value]) => {
      if (/TOKEN|KEY|SECRET/i.test(key) && value) {
        // Replace all occurrences of the secret value with [REDACTED]
        redacted = redacted.split(value).join('[REDACTED]');
      }
    });
  }
  
  return redacted;
}

/**
 * Runs a shell command and returns the result
 */
async function runCommand(
  command: string, 
  options: { cwd?: string; env?: Record<string, string> } = {}
): Promise<{ success: boolean; output: string; exitCode: number }> {
  return new Promise((resolve) => {
    const child = spawn('sh', ['-c', command], {
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, ...options.env },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => stdout += data.toString());
    child.stderr?.on('data', (data) => stderr += data.toString());

    child.on('close', (exitCode) => {
      const output = stdout + stderr;
      resolve({
        success: exitCode === 0,
        output: redactSecrets(output, options.env),
        exitCode: exitCode || 0
      });
    });

    child.on('error', (error) => {
      resolve({
        success: false,
        output: redactSecrets(`Command failed: ${error.message}`, options.env),
        exitCode: -1
      });
    });
  });
}

/**
 * Loads Amp configuration from environment variables
 */
export function loadAmpAuthConfig(): AmpAuthConfig {
  return {
    ampBin: process.env.AMP_BIN || 'amp',
    ampArgs: process.env.AMP_ARGS,
    ampAuthCmd: process.env.AMP_AUTH_CMD,
    ampToken: process.env.AMP_TOKEN,
    enableJsonL: process.env.AMP_ENABLE_JSONL === 'true'
  };
}

/**
 * Checks if authentication environment is available
 */
export function hasAuthEnvironment(): boolean {
  const config = loadAmpAuthConfig();
  return !!(config.ampBin && (config.ampAuthCmd || config.ampToken));
}

/**
 * Authenticates with Amp CLI using environment configuration
 */
export async function ensureAmpAuth(): Promise<{ success: boolean; message: string }> {
  const config = loadAmpAuthConfig();

  if (!config.ampBin) {
    return { success: false, message: 'AMP_BIN not configured' };
  }

  if (!config.ampAuthCmd && !config.ampToken) {
    return { success: false, message: 'Neither AMP_AUTH_CMD nor AMP_TOKEN configured' };
  }

  // Run authentication command if provided
  if (config.ampAuthCmd) {
    const authEnv: Record<string, string> = config.ampToken ? { AMP_TOKEN: config.ampToken } : {};
    const result = await runCommand(config.ampAuthCmd, { env: authEnv });
    
    if (!result.success) {
      return { 
        success: false, 
        message: `Authentication failed: ${result.output}` 
      };
    }
  }

  // Verify amp is working by getting version
  const versionInfo = await getAmpVersion(config);
  if (!versionInfo.success) {
    return {
      success: false,
      message: `Amp version check failed: ${versionInfo.error}`
    };
  }

  return {
    success: true,
    message: `Authenticated successfully. Amp version: ${versionInfo.version}`
  };
}

/**
 * Gets Amp version information
 */
export async function getAmpVersion(config?: AmpAuthConfig): Promise<AmpVersionInfo> {
  const authConfig = config || loadAmpAuthConfig();
  const result = await runCommand(`${authConfig.ampBin} --version`);

  if (!result.success) {
    return {
      success: false,
      version: '',
      error: result.output
    };
  }

  // Extract version from output (format may vary)
  const versionMatch = result.output.match(/amp\s+v?(\d+\.\d+\.\d+[^\s]*)/i) ||
                      result.output.match(/version\s+v?(\d+\.\d+\.\d+[^\s]*)/i) ||
                      result.output.match(/(\d+\.\d+\.\d+[^\s]*)/);

  const version = versionMatch ? versionMatch[1] : result.output.trim();

  return {
    success: true,
    version
  };
}

/**
 * Builds amp CLI arguments from environment configuration
 */
export function ampArgsFromEnv(): string[] {
  const config = loadAmpAuthConfig();
  const args: string[] = [];

  // Add extra args from AMP_ARGS
  if (config.ampArgs) {
    args.push(...config.ampArgs.split(/\s+/).filter(Boolean));
  }

  // Add JSON logs if enabled
  if (config.enableJsonL) {
    args.push('--json-logs');
  }

  return args;
}

/**
 * Test helper that runs a function only if real Amp authentication is available
 */
export function testIfRealAmp(testName: string, testFn: () => void | Promise<void>) {
  if (hasAuthEnvironment()) {
    return testFn;
  } else {
    return () => {
      console.log(`Skipping ${testName}: AMP_BIN and auth environment not configured`);
    };
  }
}

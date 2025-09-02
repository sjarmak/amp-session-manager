const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { join } = require('path');
const { homedir } = require('os');
const { readFileSync } = require('fs');
const { SessionStore, WorktreeManager, BatchController, SweBenchRunner, BenchmarkRunner, getCurrentAmpThreadId, getDbPath, Notifier, MetricsAPI, SQLiteMetricsSink, MetricsEventBus, costCalculator, Logger } = require('@ampsm/core');

let mainWindow: any;

// Load amp runtime configuration for version selection
function loadAmpRuntimeConfig() {
  try {
    const configPath = join(homedir(), '.amp-session-manager', 'amp-settings.json');
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    
    console.log(`🔧 [AMP CONFIG] Loaded settings from ${configPath}:`, config);
    
    const runtimeConfig: any = {};
    if (config.mode === 'local-cli' && config.localCliPath) {
      runtimeConfig.ampCliPath = config.localCliPath;
      console.log(`🔧 [AMP CONFIG] Using local CLI path: ${config.localCliPath}`);
    } else if (config.mode === 'local-server' && config.localServerUrl) {
      runtimeConfig.ampServerUrl = config.localServerUrl;
      console.log(`🔧 [AMP CONFIG] Using local server URL: ${config.localServerUrl}`);
    } else {
      console.log(`🔧 [AMP CONFIG] Using production mode (default)`);
    }
    
    return Object.keys(runtimeConfig).length > 0 ? runtimeConfig : undefined;
  } catch (error) {
    console.log(`🔧 [AMP CONFIG] No config file found or error loading, using production:`, error.message);
    return undefined;
  }
}

// Load amp configuration - same logic as in worktree.ts
function loadAmpConfig() {
  try {
    const configPath = join(homedir(), '.amp-session-manager', 'config.json');
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    
    // Merge process env with config, giving priority to process env
    const env = config.ampEnv ? { ...config.ampEnv } : {};
    
    // Always inherit AMP_API_KEY from process environment if available
    if (process.env.AMP_API_KEY) {
      env.AMP_API_KEY = process.env.AMP_API_KEY;
    }
    
    // Load Amp settings for runtime configuration
    const ampSettings = loadAmpSettings();
    const runtimeConfig = convertSettingsToRuntimeConfig(ampSettings);
    
    return {
      ampPath: config.ampPath,
      ampArgs: config.ampArgs ? config.ampArgs.split(' ') : undefined,
      enableJSONLogs: config.enableJSONLogs !== false,
      env: Object.keys(env).length > 0 ? env : undefined,
      extraArgs: config.ampEnv?.AMP_ARGS ? config.ampEnv.AMP_ARGS.split(/\s+/).filter(Boolean) : undefined,
      runtimeConfig
    };
  } catch {
    // If no config file, still pass through AMP_API_KEY and load Amp settings
    const env: Record<string, string> = {};
    if (process.env.AMP_API_KEY) {
      env.AMP_API_KEY = process.env.AMP_API_KEY;
    }
    
    // Load Amp settings for runtime configuration
    const ampSettings = loadAmpSettings();
    const runtimeConfig = convertSettingsToRuntimeConfig(ampSettings);
    
    return {
      env: Object.keys(env).length > 0 ? env : undefined,
      runtimeConfig
    };
  }
}

function loadAmpSettings() {
  try {
    const ampConfigPath = join(homedir(), '.amp-session-manager', 'amp-settings.json');
    return JSON.parse(readFileSync(ampConfigPath, 'utf-8'));
  } catch {
    return {
      mode: 'production',
      localCliPath: '/Users/sjarmak/amp/cli/dist/main.js',
      localServerUrl: 'https://localhost:7002'
    };
  }
}

function convertSettingsToRuntimeConfig(settings: any) {
  if (settings.mode === 'local-cli' && settings.localCliPath) {
    return {
      ampCliPath: settings.localCliPath
    };
  } else if (settings.mode === 'local-server' && settings.localServerUrl) {
    return {
      ampServerUrl: settings.localServerUrl
    };
  }
  return {};
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 1000,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, 'preload.js')
    },
    titleBarStyle: 'hiddenInset',
    movable: true,
    show: false
  });

  if (app.isPackaged) {
    mainWindow.loadFile(join(__dirname, '../dist-renderer/index.html'));
  } else {
    mainWindow.loadURL('http://localhost:3000');
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });
}

async function runStartupCleanup() {
  console.log('🧹 Running startup cleanup...');
  const startTime = Date.now();
  
  try {
    // Initialize services first if not already done
    if (!servicesReady || !store || !worktreeManager) {
      console.log('⚙️ Services not ready, initializing...');
      await initializeServices();
      
      // Wait a moment for services to be fully ready
      if (!servicesReady || !store || !worktreeManager) {
        console.warn('⚠️ Services still not ready after initialization, skipping cleanup');
        return;
      }
    }

    console.log('📊 Checking for orphaned worktrees...');
    
    // Get all unique repository roots from sessions
    const sessions = store.getAllSessions();
    console.log(`Found ${sessions.length} sessions in database`);
    
    const repoRoots = new Set(sessions.map(s => s.repoRoot));
    console.log(`Scanning ${repoRoots.size} repositories for orphaned worktrees`);

    let totalRemovedDirs = 0;
    let totalRemovedSessions = 0;

    // Run cleanup for each repository
    for (const repoRoot of repoRoots) {
      try {
        console.log(`🔍 Scanning repository: ${repoRoot}`);
        const result = await worktreeManager.pruneOrphans(repoRoot, true); // DRY RUN by default for safety
        totalRemovedDirs += result.removedDirs;
        totalRemovedSessions += result.removedSessions;
        
        if (result.removedDirs > 0 || result.removedSessions > 0) {
          console.log(`  - Cleaned up ${result.removedDirs} directories, ${result.removedSessions} sessions`);
        } else {
          console.log(`  - No orphans found`);
        }
      } catch (error) {
        console.warn(`⚠️ Failed to cleanup repository ${repoRoot}:`, error.message || error);
      }
    }

    const duration = Date.now() - startTime;
    if (totalRemovedDirs > 0 || totalRemovedSessions > 0) {
      console.log(`✅ Startup cleanup complete (${duration}ms): removed ${totalRemovedDirs} orphaned directories, ${totalRemovedSessions} orphaned sessions`);
    } else {
      console.log(`✅ Startup cleanup complete (${duration}ms): no orphaned worktrees found`);
    }

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ Startup cleanup failed after ${duration}ms:`, error);
    console.error('This is non-fatal - the app will continue to start');
    // Don't throw error - we want the app to start even if cleanup fails
  }
}

app.whenReady().then(async () => {
  // Setup signal handlers for graceful shutdown
  setupSignalHandlers();
  
  // TEMPORARILY DISABLED: Run startup cleanup before UI loads
  // await runStartupCleanup();
  
  // Initialize services without cleanup for safety
  await initializeServices();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Initialize services
let store: any;
let worktreeManager: any;
let batchController: any;
let sweBenchRunner: any;
let benchmarkRunner: any;
let notifier: any;
let metricsAPI: any;
let metricsEventBus: any;
let servicesReady = false;

async function initializeServices() {
  try {
    const dbPath = getDbPath();
    store = new SessionStore(dbPath);
    
    // Initialize shared metrics system first
    const logger = new Logger('Desktop');
    metricsEventBus = new MetricsEventBus(logger);
    const sqliteSink = new SQLiteMetricsSink(dbPath, logger);
    metricsEventBus.addSink(sqliteSink);
    metricsAPI = new MetricsAPI(sqliteSink, store, logger);
    
    // Load runtime config for Amp version selection
    const runtimeConfig = loadAmpRuntimeConfig();
    const ampSettings = loadAmpSettings();
    
    // Pass shared metrics bus and runtime config to WorktreeManager and BatchController
    worktreeManager = new WorktreeManager(store, dbPath, metricsEventBus, undefined, runtimeConfig, ampSettings);
    batchController = new BatchController(store, dbPath, metricsEventBus, ampSettings);
    sweBenchRunner = new SweBenchRunner(store, dbPath);
    benchmarkRunner = new BenchmarkRunner(store, dbPath, runtimeConfig, ampSettings);
    notifier = new Notifier();

    notifier.setCallback(async (options: any) => {
      console.log('Notification:', options.title, '-', options.message);
      // Native notifications will be added later when Electron issues are resolved
    });

    // Forward batch events to frontend
    const forward = (type: string) => (payload: any) =>
      mainWindow && !mainWindow.isDestroyed() &&
      mainWindow.webContents.send('batch:event', { type, ...payload });

    batchController.on('run-started', forward('run-started'));
    batchController.on('run-updated', forward('run-updated'));
    batchController.on('run-finished', forward('run-finished'));
    batchController.on('run-aborted', forward('run-aborted'));

    // Forward benchmark events to frontend
    const forwardBenchmark = (type: string) => (payload: any) => {
      console.log(`🔄 Main: Forwarding benchmark event ${type}:`, payload);
      return mainWindow && !mainWindow.isDestroyed() &&
        mainWindow.webContents.send('benchmark-event', { type, ...payload });
    };

    sweBenchRunner.on('run-started', forwardBenchmark('run-started'));
    sweBenchRunner.on('run-updated', forwardBenchmark('run-updated'));
    sweBenchRunner.on('run-finished', forwardBenchmark('run-finished'));
    sweBenchRunner.on('run-aborted', forwardBenchmark('run-aborted'));
    
    benchmarkRunner.on('benchmark-started', forwardBenchmark('run-started'));
    benchmarkRunner.on('benchmark-finished', forwardBenchmark('run-finished'));
    benchmarkRunner.on('case-finished', forwardBenchmark('case-finished'));

    servicesReady = true;
    console.log('Services initialized successfully');
  } catch (error) {
    console.error('Failed to initialize services:', error);
  }
}

// Process signal handlers for emergency cleanup
function setupSignalHandlers() {
  const emergencyCleanup = async () => {
    console.log('🚨 Emergency cleanup triggered...');
    
    try {
      // Stop any running interactive sessions
      for (const [sessionId, handle] of interactiveHandles) {
        try {
          console.log(`Stopping interactive session ${sessionId}...`);
          await handle.stop();
        } catch (error) {
          console.warn(`Failed to stop interactive session ${sessionId}:`, error);
        }
      }
      interactiveHandles.clear();
      
      console.log('✅ Emergency cleanup completed');
    } catch (error) {
      console.error('❌ Emergency cleanup failed:', error);
    }
    
    // Exit gracefully
    process.exit(0);
  };

  // Handle process termination signals
  process.on('SIGINT', () => {
    console.log('\n🛑 Received SIGINT, initiating graceful shutdown...');
    emergencyCleanup();
  });

  process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM, initiating graceful shutdown...');
    emergencyCleanup();
  });

  // Handle app quit events
  app.on('before-quit', () => {
    console.log('🚪 App quitting, cleaning up...');
    // This is handled by the existing before-quit handler below
  });
}

app.whenReady().then(initializeServices);

// IPC handlers
ipcMain.handle('sessions:list', async () => {
  try {
    return store.getAllSessions();
  } catch (error) {
    console.error('Failed to get sessions:', error);
    return [];
  }
});

ipcMain.handle('sessions:get', async (_, sessionId: string) => {
  try {
    return store.getSession(sessionId);
  } catch (error) {
    console.error('Failed to get session:', error);
    return null;
  }
});

// Dialog handlers
ipcMain.handle('dialog:selectDirectory', async () => {
  const { dialog, app } = require('electron');
  const os = require('os');
  
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    defaultPath: os.homedir(), // Start in user's home directory
    title: 'Select Repository Directory',
    buttonLabel: 'Select Directory'
  });
  return result;
});

ipcMain.handle('dialog:selectFile', async (_, options?: { filters?: { name: string; extensions: string[] }[] }) => {
  const { dialog } = require('electron');
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: options?.filters || [
      { name: 'YAML Files', extensions: ['yaml', 'yml'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  return result;
});

ipcMain.handle('fs:readFile', async (_, filePath: string) => {
  const fs = require('fs').promises;
  try {
    console.log('Reading file from main process:', filePath);
    const content = await fs.readFile(filePath, 'utf8');
    console.log('File read successfully, length:', content.length);
    return { success: true, content };
  } catch (error) {
    console.error('File read error in main process:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-session', async (_, sessionId: string) => {
  try {
    return store.getSession(sessionId);
  } catch (error) {
    console.error('Failed to get session:', error);
    return null;
  }
});

ipcMain.handle('sessions:create', async (_, options: any) => {
  try {
    // Include current amp mode setting if not explicitly provided
    const ampSettings = loadAmpSettings();
    const sessionOptions = {
      ...options,
      ampMode: options.ampMode || ampSettings.mode
    };
    
    const session = await worktreeManager.createSession(sessionOptions);
    
    // Interactive sessions will be started manually when user clicks "start chat"
    // Removed auto-start to prevent double session creation
    
    return { success: true, session };
  } catch (error) {
    console.error('Failed to create session:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to create session' };
  }
});

ipcMain.handle('sessions:iterate', async (_, sessionId: string, notes?: string, includeContext?: boolean) => {
  try {
    const result = await worktreeManager.iterate(sessionId, notes, includeContext);
    return { success: true, result };
  } catch (error) {
    console.error('Failed to iterate session:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to iterate session' };
  }
});

ipcMain.handle('iterate-session', async (_, sessionId: string) => {
  try {
    return await worktreeManager.iterate(sessionId);
  } catch (error) {
    console.error('Failed to iterate session:', error);
    throw error;
  }
});

ipcMain.handle('sessions:diff', async (_, sessionId: string) => {
  try {
    const session = store.getSession(sessionId);
    if (!session) throw new Error('Session not found');
    
    const diff = await worktreeManager.getDiff(sessionId);
    return { success: true, diff };
  } catch (error) {
    console.error('Failed to get session diff:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to get diff' };
  }
});

ipcMain.handle('sessions:cleanup', async (_, sessionId: string, force?: boolean) => {
  try {
    await worktreeManager.cleanup(sessionId, force);
    // Delete session record from database after successful worktree cleanup
    store.deleteSession(sessionId);
    return { success: true };
  } catch (error) {
    console.error('Failed to cleanup session:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to cleanup session' };
  }
});

ipcMain.handle('sessions:thread', async (_, sessionId: string) => {
  try {
    const threadConversation = await worktreeManager.getThreadConversation(sessionId);
    return { success: true, threadConversation };
  } catch (error) {
    console.error('Failed to get thread conversation:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to get thread conversation' };
  }
});

ipcMain.handle('sessions:getThreads', async (_, sessionId: string) => {
  try {
    const threads = store.getSessionThreads(sessionId);
    return { success: true, threads };
  } catch (error) {
    console.error('Failed to get session threads:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to get session threads' };
  }
});

ipcMain.handle('sessions:getThreadMessages', async (_, threadId: string) => {
  try {
    const messages = store.getThreadMessages(threadId);
    return { success: true, messages };
  } catch (error) {
    console.error('Failed to get thread messages:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to get thread messages' };
  }
});

ipcMain.handle('sessions:syncThreadIds', async () => {
  try {
    await store.syncAllSessionThreadIds();
    return { success: true };
  } catch (error) {
    console.error('Failed to sync session thread IDs:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to sync thread IDs' };
  }
});

ipcMain.handle('sessions:getIterations', async (_, sessionId: string) => {
  try {
    const iterations = store.getIterations(sessionId);
    return { success: true, iterations };
  } catch (error) {
    console.error('Failed to get iterations:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to get iterations' };
  }
});

ipcMain.handle('sessions:getToolCalls', async (_, sessionId: string) => {
  try {
    const toolCalls = store.getToolCalls(sessionId);
    return { success: true, toolCalls };
  } catch (error) {
    console.error('Failed to get tool calls:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to get tool calls' };
  }
});

ipcMain.handle('sessions:getStreamEvents', async (_, sessionId: string) => {
  try {
    const streamEvents = store.getStreamEvents(sessionId);
    return { success: true, streamEvents };
  } catch (error) {
    console.error('Failed to get stream events:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to get stream events' };
  }
});

// Legacy handlers (keep for compatibility)
ipcMain.handle('squash-session', async (_, sessionId: string, options: any) => {
  try {
    return await worktreeManager.squashSession(sessionId, options);
  } catch (error) {
    console.error('Failed to squash session:', error);
    throw error;
  }
});

ipcMain.handle('rebase-session', async (_, sessionId: string, options: any) => {
  try {
    return await worktreeManager.rebase(sessionId, options);
  } catch (error) {
    console.error('Failed to rebase session:', error);
    throw error;
  }
});

// New session handlers
ipcMain.handle('sessions:squash', async (_, sessionId: string, message: string) => {
  try {
    await worktreeManager.squashSession(sessionId, { message });
    return { success: true };
  } catch (error) {
    console.error('Failed to squash session:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to squash session' };
  }
});

ipcMain.handle('sessions:rebase', async (_, sessionId: string, onto: string) => {
  try {
    const result = await worktreeManager.rebase(sessionId, onto);
    return { success: true, result };
  } catch (error) {
    console.error('Failed to rebase session:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to rebase session' };
  }
});

ipcMain.handle('sessions:preflight', async (_, sessionId: string) => {
  try {
    const result = await worktreeManager.preflight(sessionId);
    return { success: true, result };
  } catch (error) {
    console.error('Failed to run preflight:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to run preflight' };
  }
});

ipcMain.handle('sessions:squash-session', async (_, sessionId: string, options: any) => {
  try {
    await worktreeManager.squashSession(sessionId, options);
    return { success: true };
  } catch (error) {
    console.error('Failed to squash session:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to squash session' };
  }
});

ipcMain.handle('sessions:rebase-onto-base', async (_, sessionId: string) => {
  try {
    const result = await worktreeManager.rebaseOntoBase(sessionId);
    return { success: true, result };
  } catch (error) {
    console.error('Failed to rebase onto base:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to rebase onto base' };
  }
});

ipcMain.handle('sessions:continue-merge', async (_, sessionId: string) => {
  try {
    const result = await worktreeManager.continueMerge(sessionId);
    return { success: true, result };
  } catch (error) {
    console.error('Failed to continue merge:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to continue merge' };
  }
});

ipcMain.handle('sessions:abort-merge', async (_, sessionId: string) => {
  try {
    const result = await worktreeManager.abortMerge(sessionId);
    return { success: true, result };
  } catch (error) {
    console.error('Failed to abort merge:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to abort merge' };
  }
});

ipcMain.handle('sessions:fast-forward-merge', async (_, sessionId: string) => {
  try {
    const result = await worktreeManager.fastForwardMerge(sessionId);
    return { success: true, result };
  } catch (error) {
    console.error('Failed to fast-forward merge:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to fast-forward merge' };
  }
});

ipcMain.handle('sessions:export-patch', async (_, sessionId: string, outputPath: string) => {
  try {
    const result = await worktreeManager.exportPatch(sessionId, outputPath);
    return { success: true, result };
  } catch (error) {
    console.error('Failed to export patch:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to export patch' };
  }
});

ipcMain.handle('sessions:exportSession', async (_, options: {
  sessionId: string;
  format: 'markdown' | 'json';
  outputDir: string;
  includeConversation: boolean;
}) => {
  try {
    const { Exporter } = require('@ampsm/core');
    const exporter = new Exporter(store, store.dbPath);
    
    const filePath = await exporter.exportSession(
      options.sessionId,
      options.format,
      options.outputDir,
      options.includeConversation
    );
    
    return { success: true, filePath };
  } catch (error) {
    console.error('Failed to export session:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to export session' };
  }
});

// New Git Actions handlers
ipcMain.handle('sessions:getGitStatus', async (_, sessionId: string) => {
  try {
    const session = store.getSession(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    const { GitOps } = require('@ampsm/core');
    const git = new GitOps(session.repoRoot);
    
    const [hasUnstagedChanges, hasStagedChanges, unstagedFiles, stagedFiles, isClean] = await Promise.all([
      git.hasUnstagedChanges(session.worktreePath),
      git.hasStagedChanges(session.worktreePath),
      git.getUnstagedFiles(session.worktreePath),
      git.getStagedFiles(session.worktreePath),
      git.isClean(session.worktreePath)
    ]);

    // Get commit history
    const commitHistory = await git.getCommitHistory(session.worktreePath, 20);

    const result = {
      hasUnstagedChanges,
      hasStagedChanges,
      unstagedFiles,
      stagedFiles,
      commitHistory,
      isClean
    };

    return { success: true, result };
  } catch (error: any) {
    console.error('Failed to get git status:', error);
    return { success: false, error: error.message };
  }
});

// Main repository git status handler
ipcMain.handle('main:getGitStatus', async (_, repoPath: string) => {
  try {
    const { GitOps } = require('@ampsm/core');
    const git = new GitOps(repoPath);
    
    const [hasUnstagedChanges, hasStagedChanges, unstagedFiles, stagedFiles, isClean] = await Promise.all([
      git.hasUnstagedChanges(),
      git.hasStagedChanges(),
      git.getUnstagedFiles(),
      git.getStagedFiles(),
      git.isClean()
    ]);

    // Get commit history for main branch
    const commitHistory = await git.getCommitHistory(repoPath, 20);

    const result = {
      hasUnstagedChanges,
      hasStagedChanges,
      unstagedFiles,
      stagedFiles,
      commitHistory,
      isClean
    };

    return { success: true, result };
  } catch (error) {
    console.error('Failed to get git status:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to get git status' };
  }
});

// Main repository staging operations
ipcMain.handle('main:stageAllChanges', async (_, repoPath: string) => {
  try {
    const { GitOps } = require('@ampsm/core');
    const git = new GitOps(repoPath);
    await git.stageAllChanges();
    return { success: true };
  } catch (error) {
    console.error('Failed to stage all changes in main repo:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to stage all changes' };
  }
});

ipcMain.handle('main:unstageAllChanges', async (_, repoPath: string) => {
  try {
    const { GitOps } = require('@ampsm/core');
    const git = new GitOps(repoPath);
    await git.unstageAllChanges();
    return { success: true };
  } catch (error) {
    console.error('Failed to unstage all changes in main repo:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to unstage all changes' };
  }
});

ipcMain.handle('main:commitStagedChanges', async (_, repoPath: string, message: string) => {
  try {
    const { GitOps } = require('@ampsm/core');
    const git = new GitOps(repoPath);
    const commitSha = await git.commitStagedChanges(repoPath, message);
    return { success: true, result: { commitSha } };
  } catch (error) {
    console.error('Failed to commit staged changes in main repo:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to commit staged changes' };
  }
});

ipcMain.handle('sessions:stageAllChanges', async (_, sessionId: string) => {
  try {
    const session = store.getSession(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    const { GitOps } = require('@ampsm/core');
    const git = new GitOps(session.repoRoot);
    await git.stageAllChanges(session.worktreePath);
    return { success: true };
  } catch (error) {
    console.error('Failed to stage all changes:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to stage all changes' };
  }
});

ipcMain.handle('sessions:unstageAllChanges', async (_, sessionId: string) => {
  try {
    const session = store.getSession(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    const { GitOps } = require('@ampsm/core');
    const git = new GitOps(session.repoRoot);
    await git.unstageAllChanges(session.worktreePath);
    return { success: true };
  } catch (error) {
    console.error('Failed to unstage all changes:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to unstage all changes' };
  }
});

ipcMain.handle('sessions:commitStagedChanges', async (_, sessionId: string, message: string) => {
  try {
    const session = store.getSession(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    const { GitOps } = require('@ampsm/core');
    const git = new GitOps(session.repoRoot);
    const commitSha = await git.commitStagedChanges(session.worktreePath, message);
    return { success: true, result: { commitSha } };
  } catch (error) {
    console.error('Failed to commit staged changes:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to commit staged changes' };
  }
});

// Enhanced Git Actions handlers
ipcMain.handle('sessions:stageFiles', async (_, sessionId: string, files: string[]) => {
  try {
    const session = store.getSession(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    const { GitOps } = require('@ampsm/core');
    const git = new GitOps(session.repoRoot);
    await git.stageFiles(files, session.worktreePath);
    return { success: true };
  } catch (error) {
    console.error('Failed to stage files:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to stage files' };
  }
});

ipcMain.handle('sessions:unstageFiles', async (_, sessionId: string, files: string[]) => {
  try {
    const session = store.getSession(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    const { GitOps } = require('@ampsm/core');
    const git = new GitOps(session.repoRoot);
    await git.unstageFiles(files, session.worktreePath);
    return { success: true };
  } catch (error) {
    console.error('Failed to unstage files:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to unstage files' };
  }
});

ipcMain.handle('sessions:commitAmend', async (_, sessionId: string, message: string) => {
  try {
    const session = store.getSession(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    const { GitOps } = require('@ampsm/core');
    const git = new GitOps(session.repoRoot);
    const commitSha = await git.commitAmend(message, session.worktreePath);
    return { success: true, result: { commitSha } };
  } catch (error) {
    console.error('Failed to amend commit:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to amend commit' };
  }
});

ipcMain.handle('sessions:resetToCommit', async (_, sessionId: string, commitRef: string, soft: boolean = false) => {
  try {
    const session = store.getSession(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    const { GitOps } = require('@ampsm/core');
    const git = new GitOps(session.repoRoot);
    await git.resetToCommit(session.worktreePath, commitRef, { hard: !soft });
    return { success: true };
  } catch (error) {
    console.error('Failed to reset to commit:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to reset to commit' };
  }
});

ipcMain.handle('sessions:cherryPick', async (_, sessionId: string, shas: string[]) => {
  try {
    const session = store.getSession(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    const { GitOps } = require('@ampsm/core');
    const git = new GitOps(session.repoRoot);
    await git.cherryPick(shas, session.worktreePath);
    return { success: true };
  } catch (error) {
    console.error('Failed to cherry-pick commits:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to cherry-pick commits' };
  }
});

ipcMain.handle('sessions:getDiff', async (_, sessionId: string, filePath?: string) => {
  try {
    const session = store.getSession(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    const { GitOps } = require('@ampsm/core');
    const git = new GitOps(session.repoRoot);
    
    let result;
    if (filePath) {
      // Get diff for specific file
      result = await git.exec(['diff', '--', filePath], session.worktreePath);
      if (result.exitCode !== 0) {
        // Try staged diff
        result = await git.exec(['diff', '--cached', '--', filePath], session.worktreePath);
      }
    } else {
      // Get all diffs
      result = await git.exec(['diff'], session.worktreePath);
    }
    
    return { success: true, result: { diff: result.stdout } };
  } catch (error) {
    console.error('Failed to get diff:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to get diff' };
  }
});

ipcMain.handle('sessions:rollbackLastCommit', async (_, sessionId: string) => {
  try {
    const session = store.getSession(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    const { GitOps } = require('@ampsm/core');
    const git = new GitOps(session.repoRoot);
    
    // Check for unstaged changes - staged changes will be preserved with --soft reset
    const hasUnstagedChanges = await git.hasUnstagedChanges(session.worktreePath);
    if (hasUnstagedChanges) {
      return { success: false, error: 'Repository has unstaged changes. Please commit or stash them first.' };
    }
    
    await git.resetToCommit(session.worktreePath, 'HEAD~1', { hard: false });
    return { success: true };
  } catch (error) {
    console.error('Failed to rollback last commit:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to rollback last commit' };
  }
});

ipcMain.handle('sessions:rollbackToCommit', async (_, sessionId: string, commitSha: string) => {
  try {
    const session = store.getSession(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    const { GitOps } = require('@ampsm/core');
    const git = new GitOps(session.repoRoot);
    
    // Check for unstaged changes - staged changes will be preserved with --soft reset
    const hasUnstagedChanges = await git.hasUnstagedChanges(session.worktreePath);
    if (hasUnstagedChanges) {
      return { success: false, error: 'Repository has unstaged changes. Please commit or stash them first.' };
    }
    
    await git.resetToCommit(session.worktreePath, commitSha, { hard: false });
    return { success: true };
  } catch (error) {
    console.error('Failed to rollback to commit:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to rollback to commit' };
  }
});

ipcMain.handle('sessions:squashCommits', async (_, sessionId: string, options: any) => {
  try {
    const session = store.getSession(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    // Use existing worktree manager squash functionality
    await worktreeManager.squashSession(sessionId, options);
    return { success: true };
  } catch (error) {
    console.error('Failed to squash commits:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to squash commits' };
  }
});

ipcMain.handle('sessions:openInEditor', async (_, sessionId: string) => {
  try {
    const session = store.getSession(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    const { spawn } = require('child_process');
    // Try to open in VS Code, fallback to system default
    try {
      spawn('code', [session.worktreePath], { detached: true, stdio: 'ignore' });
    } catch {
      // Fallback to system open command
      const openCmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
      spawn(openCmd, [session.worktreePath], { detached: true, stdio: 'ignore' });
    }
    
    return { success: true };
  } catch (error) {
    console.error('Failed to open in editor:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to open in editor' };
  }
});

ipcMain.handle('sessions:setAutoCommit', async (_, sessionId: string, autoCommit: boolean) => {
  try {
    store.updateSessionAutoCommit(sessionId, autoCommit);
    return { success: true };
  } catch (error) {
    console.error('Failed to update session autoCommit:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update autoCommit setting' };
  }
});

// Deprecated - use 'sessions:cleanup' instead
// ipcMain.handle('cleanup-session', async (_, sessionId: string) => {
//   try {
//     return await worktreeManager.cleanup(sessionId);
//   } catch (error) {
//     console.error('Failed to cleanup session:', error);
//     throw error;
//   }
// });

ipcMain.handle('get-batches', async () => {
  try {
    return store.getAllBatches();
  } catch (error) {
    console.error('Failed to get batches:', error);
    return [];
  }
});

ipcMain.handle('get-batch', async (_, batchId: string) => {
  try {
    return store.getBatch(batchId);
  } catch (error) {
    console.error('Failed to get batch:', error);
    return null;
  }
});

ipcMain.handle('create-batch', async (_, options: any) => {
  try {
    return await batchController.createBatch(options);
  } catch (error) {
    console.error('Failed to create batch:', error);
    throw error;
  }
});

ipcMain.handle('run-batch', async (_, batchId: string) => {
  try {
    return await batchController.runBatch(batchId);
  } catch (error) {
    console.error('Failed to run batch:', error);
    throw error;
  }
});

// New batch API handlers
ipcMain.handle('batch:listRuns', async () => {
  try {
    return await batchController.listRuns();
  } catch (error) {
    console.error('Failed to list batch runs:', error);
    return [];
  }
});

ipcMain.handle('batch:getRun', async (_, runId: string) => {
  try {
    return await batchController.getRun(runId);
  } catch (error) {
    console.error('Failed to get batch run:', error);
    return null;
  }
});

ipcMain.handle('batch:listItems', async (_, options: any) => {
  try {
    return await batchController.listItems(options);
  } catch (error) {
    console.error('Failed to list batch items:', error);
    return { items: [], total: 0 };
  }
});

ipcMain.handle('batch:start', async (_, options: any) => {
  try {
    const runId = await batchController.start(options);
    return { success: true, runId };
  } catch (error) {
    console.error('Failed to start batch:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('batch:abort', async (_, runId: string) => {
  try {
    await batchController.abort(runId);
    return { success: true };
  } catch (error) {
    console.error('Failed to abort batch:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('batch:export', async (_, options: any) => {
  try {
    const filePaths = await batchController.export(options);
    return { success: true, filePaths };
  } catch (error) {
    console.error('Failed to export batch:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('batch:report', async (_, options: any) => {
  try {
    const outputPath = await batchController.report(options);
    return { success: true, outputPath };
  } catch (error) {
    console.error('Failed to generate batch report:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('batch:delete', async (_, runId: string) => {
  try {
    await batchController.delete(runId);
    return { success: true };
  } catch (error) {
    console.error('Failed to delete batch:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('batch:cleanEnvironment', async () => {
  try {
    return await batchController.cleanWorktreeEnvironment();
  } catch (error) {
    console.error('Failed to clean environment:', error);
    throw error;
  }
});

ipcMain.handle('auth:validate', async () => {
  try {
    const { AmpAdapter } = require('@ampsm/core');
    const ampAdapter = new AmpAdapter(loadAmpConfig(), store, metricsEventBus);
    return await ampAdapter.validateAuth();
  } catch (error) {
    console.error('Failed to validate auth:', error);
    return {
      isAuthenticated: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
});

ipcMain.handle('shell:openExternal', async (_, url: string) => {
  const { shell } = require('electron');
  return await shell.openExternal(url);
});

ipcMain.handle('shell:openPath', async (_, path: string) => {
  const { shell } = require('electron');
  return await shell.openPath(path);
});

// Amp settings handlers
ipcMain.handle('amp:getSettings', async () => {
  try {
    const { writeFileSync, existsSync, mkdirSync } = require('fs');
    const configPath = join(homedir(), '.amp-session-manager', 'amp-settings.json');
    const configDir = join(homedir(), '.amp-session-manager');
    
    if (!existsSync(configPath)) {
      if (!existsSync(configDir)) {
        mkdirSync(configDir, { recursive: true });
      }
      const defaultSettings = {
        mode: 'production',
        localCliPath: '/Users/sjarmak/amp/cli/dist/main.js',
        localServerUrl: 'https://localhost:7002'
      };
      writeFileSync(configPath, JSON.stringify(defaultSettings, null, 2));
      return defaultSettings;
    }
    
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    return config;
  } catch (error) {
    console.error('Failed to get Amp settings:', error);
    return {
      mode: 'production',
      localCliPath: '/Users/sjarmak/amp/cli/dist/main.js',
      localServerUrl: 'https://localhost:7002'
    };
  }
});

ipcMain.handle('amp:updateSettings', async (_, settings: any) => {
  try {
    const { writeFileSync, existsSync, mkdirSync } = require('fs');
    const configPath = join(homedir(), '.amp-session-manager', 'amp-settings.json');
    const configDir = join(homedir(), '.amp-session-manager');
    
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }
    
    writeFileSync(configPath, JSON.stringify(settings, null, 2));
    console.log('🔄 [AMP CONFIG] Settings updated, reinitializing services...');
    
    // Reinitialize services with new settings
    await initializeServices();
    
    // Update amp settings on existing controllers
    const newAmpSettings = loadAmpSettings();
    batchController?.updateAmpSettings(newAmpSettings);
    benchmarkRunner?.updateAmpSettings(newAmpSettings);
    
    console.log('✅ [AMP CONFIG] Services reinitialized with new settings');
    
    // Test authentication with new settings
    try {
      const { AmpAdapter } = require('@ampsm/core');
      const testConfig = loadAmpConfig();
      console.log('🔍 [AMP CONFIG] Testing authentication with new config:', {
        ampPath: testConfig.ampPath,
        runtimeConfig: testConfig.runtimeConfig
      });
      
      const testAdapter = new AmpAdapter(testConfig);
      const isAuth = await testAdapter.checkAuthentication();
      console.log(`🔍 [AMP CONFIG] Authentication test result: ${isAuth}`);
      
      if (!isAuth) {
        console.warn('⚠️  [AMP CONFIG] Authentication failed after switching modes - may need to run "amp login"');
      }
    } catch (error) {
      console.error('❌ [AMP CONFIG] Error testing authentication:', error);
    }
    
    return { success: true };
  } catch (error) {
    console.error('❌ [AMP CONFIG] Failed to update Amp settings:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update Amp settings' };
  }
});

ipcMain.handle('get-amp-thread-id', async () => {
  try {
    return getCurrentAmpThreadId();
  } catch (error) {
    console.error('Failed to get Amp thread ID:', error);
    return null;
  }
});

ipcMain.handle('show-notification', async (_, options: any) => {
  try {
    notifier.notify(options);
    return true;
  } catch (error) {
    console.error('Failed to show notification:', error);
    return false;
  }
});

ipcMain.handle('get-notification-settings', async () => {
  try {
    return notifier.getSettings();
  } catch (error) {
    console.error('Failed to get notification settings:', error);
    return {};
  }
});

ipcMain.handle('update-notification-settings', async (_, settings: any) => {
  try {
    notifier.updateSettings(settings);
    return true;
  } catch (error) {
    console.error('Failed to update notification settings:', error);
    return false;
  }
});

ipcMain.handle('test-notification', async (_, type: string) => {
  try {
    const testNotifications = {
      sessionComplete: { type: 'success', title: 'Session Complete', message: 'Session "test-session" completed successfully' },
      sessionFailed: { type: 'error', title: 'Session Failed', message: 'Session "test-session" failed with error' },
      awaitingInput: { type: 'warning', title: 'Awaiting Input', message: 'Session "test-session" needs manual intervention' },
      testPassed: { type: 'success', title: 'Tests Passed', message: 'All tests passed for session "test-session"' },
      testFailed: { type: 'error', title: 'Tests Failed', message: 'Tests failed for session "test-session"' }
    };
    
    const notification = testNotifications[type as keyof typeof testNotifications];
    if (notification) {
      notifier.notify(notification);
    }
    return true;
  } catch (error) {
    console.error('Failed to test notification:', error);
    return false;
  }
});

// Notification IPC handlers
ipcMain.handle('notifications:getSettings', async () => {
  try {
    return notifier.getSettings();
  } catch (error) {
    console.error('Failed to get notification settings:', error);
    return null;
  }
});

ipcMain.handle('notifications:updateSettings', async (_, settings: any) => {
  try {
    notifier.setSettings(settings);
    return true;
  } catch (error) {
    console.error('Failed to update notification settings:', error);
    return false;
  }
});

ipcMain.handle('notifications:test', async (_, type: string) => {
  try {
    const testNotifications = {
      sessionComplete: { type: 'success', title: 'Session Complete', message: 'Session "test-session" completed successfully' },
      sessionFailed: { type: 'error', title: 'Session Failed', message: 'Session "test-session" failed with error' },
      awaitingInput: { type: 'warning', title: 'Awaiting Input', message: 'Session "test-session" needs manual intervention' },
      testPassed: { type: 'success', title: 'Tests Passed', message: 'All tests passed for session "test-session"' },
      testFailed: { type: 'error', title: 'Tests Failed', message: 'Tests failed for session "test-session"' }
    };
    
    const notification = testNotifications[type as keyof typeof testNotifications];
    if (notification) {
      notifier.notify(notification);
    }
    return true;
  } catch (error) {
    console.error('Failed to test notification:', error);
    return false;
  }
});

// Metrics IPC handlers
ipcMain.handle('metrics:getSessionSummary', async (_, sessionId: string) => {
  try {
    if (!metricsAPI) {
      throw new Error('Metrics API not initialized');
    }
    const summary = await metricsAPI.getSessionSummary(sessionId);
    console.log(`[METRICS API] Session summary for ${sessionId}:`, {
      totalLocAdded: summary?.totalLocAdded,
      totalLocDeleted: summary?.totalLocDeleted,
      linesChanged: summary?.linesChanged
    });
    return { success: true, summary };
  } catch (error) {
    console.error('Failed to get session metrics summary:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('metrics:getIterationMetrics', async (_, sessionId: string) => {
  try {
    if (!metricsAPI) {
      throw new Error('Metrics API not initialized');
    }
    const iterations = await metricsAPI.getIterationMetrics(sessionId);
    return { success: true, iterations };
  } catch (error) {
    console.error('Failed to get iteration metrics:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('metrics:getRealtimeMetrics', async (_, sessionId: string) => {
  try {
    if (!metricsAPI) {
      throw new Error('Metrics API not initialized');
    }
    // Aggregate data from all sessions if specific session has no data
    const sessionMetrics = await metricsAPI.getRealtimeMetrics(sessionId);
    
    // If session-specific data is empty, fallback to all sessions data
    if (sessionMetrics.currentTokens === 0 && sessionMetrics.currentCost === 0) {
      const allMetrics = await metricsAPI.getRealtimeMetrics();
      return { success: true, metrics: allMetrics };
    }
    
    return { success: true, metrics: sessionMetrics };
  } catch (error) {
    console.error('Failed to get realtime metrics:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('metrics:getSessionProgress', async (_, sessionId: string) => {
  try {
    if (!metricsAPI) {
      throw new Error('Metrics API not initialized');
    }
    const progress = await metricsAPI.getSessionProgress(sessionId);
    return { success: true, progress };
  } catch (error) {
    console.error('Failed to get session progress:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('metrics:exportMetrics', async (_, sessionId: string, options: any) => {
  try {
    if (!metricsAPI) {
      throw new Error('Metrics API not initialized');
    }
    const result = await metricsAPI.exportMetrics(sessionId, options);
    return { success: true, result };
  } catch (error) {
    console.error('Failed to export metrics:', error);
    return { success: false, error: error.message };
  }
});



process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  app.quit();
});

// Benchmark IPC handlers
ipcMain.handle('benchmarks:listRuns', async () => {
  try {
    console.log('📊 benchmarks:listRuns called, servicesReady:', servicesReady);
    if (!servicesReady || !sweBenchRunner) {
      console.error('❌ Services not ready or SweBenchRunner not initialized');
      return [];
    }
    if (!store) {
      console.error('❌ Store not initialized');
      return [];
    }
    console.log('📊 Calling sweBenchRunner.listRuns()');
    const sweBenchRuns = await sweBenchRunner.listRuns();
    console.log('📊 Got sweBenchRuns:', sweBenchRuns?.length || 0, 'runs');
    
    // Transform to generic benchmark format
    const allRuns = sweBenchRuns.map((run: any) => ({
      runId: run.id, // Fix: use 'id' instead of 'runId'
      type: 'swebench' as const,
      createdAt: run.createdAt,
      casesDir: run.casesDir,
      totalCases: run.total, // Fix: use 'total' instead of 'totalCases'
      completedCases: run.completed, // Fix: use 'completed' instead of 'completedCases'
      passedCases: run.passed, // Fix: use 'passed' instead of 'passedCases'
      failedCases: run.failed, // Fix: use 'failed' instead of 'failedCases'
      status: run.status
    }));
    
    // Add YAML benchmark runs (stored separately - we'll need to implement this)
    // For now, just return SWE-bench runs
    console.log('📊 Transformed benchmarkRuns:', allRuns);
    return allRuns;
  } catch (error) {
    console.error('❌ Failed to list benchmark runs:', error);
    return [];
  }
});

ipcMain.handle('benchmarks:getRun', async (_, runId: string) => {
  try {
    console.log('📊 benchmarks:getRun called for runId:', runId);
    const result = await sweBenchRunner.getRun(runId);
    console.log('📊 benchmarks:getRun result:', result);
    return result;
  } catch (error) {
    console.error('❌ Failed to get benchmark run:', error);
    return null;
  }
});

ipcMain.handle('benchmarks:getResults', async (_, runId: string) => {
  try {
    console.log('📊 benchmarks:getResults called for runId:', runId);
    const result = await sweBenchRunner.getResults(runId);
    console.log('📊 benchmarks:getResults result:', result?.length || 0, 'results');
    
    // Transform database results to UI format
    const transformed = result.map(r => {
      const session = store.getSession(r.sessionId);
      return {
        instanceId: r.caseId,
        sessionId: r.sessionId,
        passed: r.status === 'pass',
        completedAt: null, // Could add this if needed
        error: r.status === 'fail' ? 'Test failed' : null,
        ampMode: session?.ampMode || 'production'
      };
    });
    
    return transformed;
  } catch (error) {
    console.error('❌ Failed to get benchmark results:', error);
    return [];
  }
});

ipcMain.handle('benchmarks:start', async (_, options: any) => {
  try {
    if (options.type === 'swebench') {
      const runnerOptions = {
        casesDir: options.casesDir,
        name: `SWE-bench Run ${new Date().toISOString().slice(0, 19)}`,
        parallel: options.parallel || 1,
        maxIterations: options.maxIterations || 10,
        timeoutSec: options.timeoutSec || 300,
        filter: options.filter
      };
      const result = await sweBenchRunner.run(runnerOptions);
      return { success: true, runId: result.id };
    } else if (options.type === 'yaml') {
      if (!options.yamlConfigPath) {
        throw new Error('YAML config path is required');
      }
      const result = await benchmarkRunner.runBenchmark(options.yamlConfigPath);
      return { success: true, runId: result.id };
    } else if (options.type === 'custom') {
      // For custom benchmarks, we could extend this later
      throw new Error('Custom benchmarks not yet implemented');
    } else {
      throw new Error(`Unknown benchmark type: ${options.type}`);
    }
  } catch (error) {
    console.error('Failed to start benchmark:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('benchmarks:abort', async (_, runId: string) => {
  try {
    console.log('📊 benchmarks:abort called for runId:', runId);
    await sweBenchRunner.abortRun(runId);
    return { success: true };
  } catch (error) {
    console.error('❌ Failed to abort benchmark run:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

ipcMain.handle('benchmarks:delete', async (_, runId: string) => {
  try {
    await sweBenchRunner.deleteRun(runId);
    return { success: true };
  } catch (error) {
    console.error('Failed to delete benchmark run:', error);
    return { success: false, error: error.message };
  }
});

// Interactive streaming handlers
const { randomUUID } = require('crypto');
const interactiveHandles = new Map(); // sessionId -> { handleId, threadId, ampHandle }

ipcMain.handle('interactive:start', async (_, sessionId: string, threadId?: string) => {
  try {
    console.log(`[DEBUG] IPC interactive:start called with sessionId: ${sessionId}, threadId: ${threadId}`);
    const session = store.getSession(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    // Reset session status if it's in error state - allow recovery via interactive chat
    if (session.status === 'error') {
      console.log(`[DEBUG] Session ${sessionId} is in error state, resetting to idle for interactive recovery`);
      store.updateSessionStatus(sessionId, 'idle');
    }

    // Stop existing interactive session if any
    if (interactiveHandles.has(sessionId)) {
      const existing = interactiveHandles.get(sessionId);
      await existing.ampHandle.stop();
      interactiveHandles.delete(sessionId);
    }

    const { AmpAdapter } = require('@ampsm/core');
    const ampConfig = {
      ...loadAmpConfig(),
      // Add agent configuration from session
      agentId: session.agentId,
      autoRoute: session.autoRoute,
      alloyMode: session.alloyMode,
      multiProvider: session.multiProvider
    };
    console.log(`[DEBUG] Interactive session using config:`, {
      ampPath: ampConfig.ampPath,
      runtimeConfig: ampConfig.runtimeConfig,
      agentConfig: {
        agentId: ampConfig.agentId,
        autoRoute: ampConfig.autoRoute,
        alloyMode: ampConfig.alloyMode,
        multiProvider: ampConfig.multiProvider
      }
    });
    
    const ampAdapter = new AmpAdapter(ampConfig, store, metricsEventBus);
    
    // Check authentication first
    console.log(`[DEBUG] Checking authentication for interactive session...`);
    const isAuthenticated = await ampAdapter.checkAuthentication();
    console.log(`[DEBUG] Authentication result: ${isAuthenticated}`);
    
    if (!isAuthenticated) {
      return { 
        success: false, 
        error: 'Amp CLI authentication required. Please run "amp login" in terminal to authenticate.' 
      };
    }
    
    const ampHandle = ampAdapter.startInteractive(
      sessionId,
      session.worktreePath,
      session.modelOverride,
      threadId,
      session.autoCommit
    );

    // Generate unique handleId for this session
    const handleId = randomUUID();
    
    // Forward events to renderer with handleId
    ampHandle.on('streaming-event', (event) => {
      mainWindow?.webContents.send('interactive:event', sessionId, handleId, event);
    });

    ampHandle.on('state', (state) => {
      mainWindow?.webContents.send('interactive:state', sessionId, handleId, state);
    });

    ampHandle.on('error', (error) => {
      mainWindow?.webContents.send('interactive:error', sessionId, handleId, error.message || String(error));
    });

    ampHandle.on('files-changed', (data) => {
      // Notify renderer that files have changed
      mainWindow?.webContents.send('interactive:files-changed', sessionId, handleId, data);
    });

    ampHandle.on('changes-staged', (data) => {
      // Notify renderer that changes have been staged
      mainWindow?.webContents.send('interactive:changes-staged', sessionId, handleId, data);
    });

    interactiveHandles.set(sessionId, { handleId, threadId, ampHandle });
    return { success: true, handleId };

  } catch (error) {
    console.error('Failed to start interactive session:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to start interactive session' };
  }
});

ipcMain.handle('interactive:send', async (_, sessionId: string, handleId: string, message: string) => {
  try {
    const entry = interactiveHandles.get(sessionId);
    if (!entry || entry.handleId !== handleId) {
      return { success: false, error: 'Interactive session not found or handleId mismatch' };
    }

    entry.ampHandle.send(message);
    return { success: true };

  } catch (error) {
    console.error('Failed to send interactive message:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to send message' };
  }
});

ipcMain.handle('interactive:stop', async (_, sessionId: string, handleId: string) => {
  try {
    const entry = interactiveHandles.get(sessionId);
    if (!entry) {
      return { success: true }; // Already stopped
    }
    
    // Verify handleId matches to prevent stopping wrong session
    if (entry.handleId !== handleId) {
      return { success: false, error: 'HandleId mismatch - session may have already changed' };
    }

    await entry.ampHandle.stop();
    interactiveHandles.delete(sessionId);
    return { success: true };

  } catch (error) {
    console.error('Failed to stop interactive session:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to stop session' };
  }
});

ipcMain.handle('interactive:getHistory', async (_, sessionId: string) => {
  try {
    const events = store.getStreamEvents(sessionId);
    return { success: true, events };
  } catch (error) {
    console.error('Failed to get interactive history:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to get history' };
  }
});

// Clean up interactive handles when app is closing
app.on('before-quit', async () => {
  console.log('Cleaning up interactive sessions...');
  for (const [sessionId, entry] of interactiveHandles) {
    try {
      await entry.ampHandle.stop();
    } catch (error) {
      console.error(`Failed to stop interactive session ${sessionId}:`, error);
    }
  }
  interactiveHandles.clear();
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  app.quit();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  app.quit();
});

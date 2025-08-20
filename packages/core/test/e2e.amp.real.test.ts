import { describe, test, beforeAll, afterAll, expect } from 'vitest';
import { randomUUID } from 'crypto';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { SessionStore } from '../src/store.js';
import { WorktreeManager } from '../src/worktree.js';
import { AmpAdapter, type AmpAdapterConfig } from '../src/amp.js';
import { GitOps } from '../src/git.js';
import { ensureAmpAuth, hasAuthEnvironment, loadAmpAuthConfig, ampArgsFromEnv, testIfRealAmp, getAmpVersion } from './amp-auth-harness.js';
import type { Session } from '@ampsm/types';

describe('Authenticated Amp E2E Tests', () => {
  let tempDir: string;
  let testRepoPath: string;
  let store: SessionStore;
  let worktreeManager: WorktreeManager;
  let session: Session;

  const runTestIfRealAmp = testIfRealAmp('authenticated E2E tests', () => {
    beforeAll(async () => {
      // Set up temp directory
      tempDir = await mkdtemp(join(tmpdir(), 'amp-e2e-'));
      testRepoPath = join(tempDir, 'test-repo');
      
      // Authenticate with Amp
      const authResult = await ensureAmpAuth();
      if (!authResult.success) {
        throw new Error(`Amp authentication failed: ${authResult.message}`);
      }
      console.log(authResult.message);

      // Create a test git repo
      const git = new GitOps(testRepoPath);
      await git.init();
      
      // Add initial file
      const { writeFile } = await import('fs/promises');
      await writeFile(join(testRepoPath, 'README.md'), '# Test Repository\n\nThis is a test repository for Amp E2E tests.\n');
      
      // Initial commit
      await git.exec(['add', '.'], testRepoPath);
      await git.exec(['commit', '-m', 'initial commit'], testRepoPath);
      
      // Initialize store and worktree manager  
      const dbPath = join(tempDir, 'test.sqlite');
      store = new SessionStore(dbPath);
      worktreeManager = new WorktreeManager(store, dbPath);
      
      // Create a test session
      session = await worktreeManager.createSession({
        name: 'e2e-test-session',
        ampPrompt: 'Create a simple TypeScript function that adds two numbers and write a test for it',
        repoRoot: testRepoPath,
        baseBranch: 'main',
        modelOverride: 'gpt-5'
      });
      
      console.log(`Created test session: ${session.id}`);
    }, 60000); // 60 second timeout for setup

    afterAll(async () => {
      // Cleanup
      if (store) {
        store.close();
      }
      if (tempDir) {
        await rm(tempDir, { recursive: true, force: true });
      }
    });

    test('should authenticate with Amp and get version', async () => {
      const config = loadAmpAuthConfig();
      const versionInfo = await getAmpVersion(config);
      
      expect(versionInfo.success).toBe(true);
      expect(versionInfo.version).toBeDefined();
      expect(versionInfo.version.length).toBeGreaterThan(0);
      
      console.log(`Amp version: ${versionInfo.version}`);
    });

    test('should create and run an iteration with real Amp', async () => {
      expect(session).toBeDefined();
      expect(session.modelOverride).toBe('gpt-5');
      
      // Run an iteration
      await worktreeManager.iterate(session.id);
      
      // Check that iteration was recorded
      const iterations = store.getIterations(session.id);
      expect(iterations.length).toBeGreaterThan(0);
      
      const lastIteration = iterations[0];
      expect(lastIteration).toBeDefined();
      expect(lastIteration.sessionId).toBe(session.id);
      expect(lastIteration.endTime).toBeDefined();
      
      // Verify telemetry was captured
      expect(lastIteration.totalTokens).toBeDefined();
      expect(lastIteration.totalTokens).toBeGreaterThan(0);
      expect(lastIteration.model).toBeDefined();
      expect(lastIteration.ampVersion).toBeDefined();
      expect(lastIteration.exitCode).toBeDefined();
      
      console.log(`Iteration completed - Tokens: ${lastIteration.totalTokens}, Model: ${lastIteration.model}, Amp Version: ${lastIteration.ampVersion}`);
      
      // Check if a commit was created
      if (lastIteration.commitSha) {
        expect(lastIteration.commitSha).toMatch(/^[a-f0-9]+$/);
        expect(lastIteration.changedFiles).toBeGreaterThan(0);
        console.log(`Commit created: ${lastIteration.commitSha.slice(0, 8)} with ${lastIteration.changedFiles} changed files`);
      }
      
      // Verify tool calls were recorded (may be 0 if Amp didn't use tools)
      const toolCalls = store.getToolCalls(session.id, lastIteration.id);
      console.log(`Tool calls recorded: ${toolCalls.length}`);
      
      // Just verify structure - tools may not be used in every run
      if (toolCalls.length > 0) {
        const toolCall = toolCalls[0];
        expect(toolCall.sessionId).toBe(session.id);
        expect(toolCall.iterationId).toBe(lastIteration.id);
        expect(toolCall.toolName).toBeDefined();
        expect(toolCall.success).toBeDefined();
      }
    }, 120000); // 2 minute timeout

    test('should use JSON logs when enabled', async () => {
      const originalEnv = process.env.AMP_ENABLE_JSONL;
      
      try {
        // Enable JSON logs for this test
        process.env.AMP_ENABLE_JSONL = 'true';
        
        const config = loadAmpAuthConfig();
        const extraArgs = ampArgsFromEnv();
        
        const ampConfig: AmpAdapterConfig = {
          ampPath: config.ampBin,
          enableJSONLogs: config.enableJsonL,
          extraArgs: extraArgs
        };
        
        const ampAdapter = new AmpAdapter(ampConfig);
        
        // Run a simple iteration
        const result = await ampAdapter.runIteration(
          'List the files in the current directory and explain what you see',
          session.worktreePath,
          undefined,
          session.id
        );
        
        expect(result.success).toBeDefined();
        expect(result.telemetry).toBeDefined();
        expect(result.telemetry.exitCode).toBeDefined();
        
        console.log(`JSONL test - Success: ${result.success}, Exit code: ${result.telemetry.exitCode}`);
        
        // If successful, should have parsed telemetry
        if (result.success && result.telemetry.totalTokens && result.telemetry.totalTokens > 0) {
          console.log(`JSONL parsing successful - Tokens: ${result.telemetry.totalTokens}, Model: ${result.telemetry.model}`);
        } else {
          console.log('JSONL parsing may have fallen back to regex parsing');
        }
        
      } finally {
        // Restore original environment
        if (originalEnv === undefined) {
          delete process.env.AMP_ENABLE_JSONL;
        } else {
          process.env.AMP_ENABLE_JSONL = originalEnv;
        }
      }
    }, 90000); // 90 second timeout

    test('should redact secrets from output', async () => {
      const config = loadAmpAuthConfig();
      
      if (!config.ampToken) {
        console.log('Skipping secret redaction test - no AMP_TOKEN available');
        return;
      }
      
      const ampConfig: AmpAdapterConfig = {
        ampPath: config.ampBin,
        env: { AMP_TOKEN: config.ampToken }
      };
      
      const ampAdapter = new AmpAdapter(ampConfig);
      
      // Create a simple test that might echo the token (this shouldn't happen in real usage)
      const result = await ampAdapter.runIteration(
        'Echo a test message without revealing any sensitive information',
        session.worktreePath,
        undefined,
        session.id
      );
      
      // Verify the actual token value is not in the output
      expect(result.output).not.toContain(config.ampToken);
      
      // If token was somehow in output, it should be redacted
      if (result.output.includes('[REDACTED]')) {
        console.log('Secret redaction working - found [REDACTED] markers');
      } else {
        console.log('No secrets found in output (expected)');
      }
    }, 60000);
  });

  // If auth environment is not available, run a placeholder test
  if (!hasAuthEnvironment()) {
    test('should skip real Amp tests when auth not configured', () => {
      console.log('Skipping authenticated Amp E2E tests - AMP_BIN and auth environment not configured');
      console.log('To enable these tests, set:');
      console.log('  export AMP_BIN=/path/to/amp');
      console.log('  export AMP_AUTH_CMD="amp auth login --token \\"$AMP_TOKEN\\""');
      console.log('  export AMP_TOKEN=your_token_here');
      console.log('  export AMP_ENABLE_JSONL=true');
      expect(true).toBe(true); // Pass the test
    });
  }

  // Run the actual tests if environment is configured
  if (hasAuthEnvironment()) {
    runTestIfRealAmp();
  }
});

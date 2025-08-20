import { tmpdir } from 'os';
import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { SessionStore } from '@ampsm/core';
import { WorktreeManager } from '@ampsm/core';
import { AmpAdapter } from '@ampsm/core';
import { GitOps } from '@ampsm/core';
import { ensureAmpAuth, loadAmpAuthConfig, ampArgsFromEnv, getAmpVersion, hasAuthEnvironment } from '../utils/amp-auth.js';

export async function verifyAmpCommand() {
  console.log('🔍 Amp Session Manager - Verification Check\n');

  let tempDir: string | null = null;
  let success = true;

  try {
    // 1. Check if authentication environment is configured
    console.log('1. Checking authentication environment...');
    
    if (!hasAuthEnvironment()) {
      console.log('   ❌ Authentication not configured');
      console.log('   Required environment variables:');
      console.log('     - AMP_BIN (path to amp binary)');
      console.log('     - AMP_AUTH_CMD or AMP_TOKEN (authentication)');
      console.log('   Optional:');
      console.log('     - AMP_ARGS (extra arguments)');
      console.log('     - AMP_ENABLE_JSONL=true (enable JSON logs)');
      success = false;
    } else {
      console.log('   ✅ Authentication environment configured');
    }

    // 2. Load configuration and show paths
    console.log('\n2. Checking Amp configuration...');
    const config = loadAmpAuthConfig();
    
    console.log(`   Amp binary: ${config.ampBin || '(not set)'}`);
    if (config.ampArgs) {
      console.log(`   Extra args: ${config.ampArgs}`);
    }
    if (config.enableJsonL) {
      console.log('   JSON logs: enabled');
    }
    
    const extraArgs = ampArgsFromEnv();
    if (extraArgs.length > 0) {
      console.log(`   Computed args: ${extraArgs.join(' ')}`);
    }

    // 3. Test authentication
    console.log('\n3. Testing authentication...');
    
    if (hasAuthEnvironment()) {
      const authResult = await ensureAmpAuth();
      if (authResult.success) {
        console.log(`   ✅ ${authResult.message}`);
      } else {
        console.log(`   ❌ Authentication failed: ${authResult.message}`);
        success = false;
      }
    } else {
      console.log('   ⏭️  Skipping (authentication not configured)');
    }

    // 4. Test version detection
    console.log('\n4. Testing version detection...');
    
    if (config.ampBin) {
      const versionInfo = await getAmpVersion(config);
      if (versionInfo.success) {
        console.log(`   ✅ Amp version: ${versionInfo.version}`);
      } else {
        console.log(`   ❌ Version check failed: ${versionInfo.error}`);
        success = false;
      }
    } else {
      console.log('   ⏭️  Skipping (AMP_BIN not set)');
    }

    // 5. Test basic iteration (only if everything else is working)
    if (success && hasAuthEnvironment()) {
      console.log('\n5. Testing basic iteration in temporary repository...');
      
      try {
        // Check if git is available before proceeding
        try {
          const { spawn } = await import('child_process');
          const gitTest = spawn('git', ['--version'], { stdio: 'pipe' });
          await new Promise((resolve, reject) => {
            gitTest.on('close', (code) => code === 0 ? resolve(null) : reject(new Error('git not found')));
            gitTest.on('error', reject);
          });
        } catch (gitError) {
          console.log('   ⏭️  Skipping iteration test (git not found in PATH)');
          console.log('   ℹ️  Tip: Ensure git is in your PATH or run: export PATH="/opt/homebrew/bin:$PATH"');
          console.log('   ✅ Authentication is working - you can run E2E tests with: pnpm test:e2e-amp');
          return;
        }
        
        // Create temp directory and test repo
        tempDir = await mkdtemp(join(tmpdir(), 'amp-verify-'));
        const testRepoPath = join(tempDir, 'test-repo');
        
        // Initialize git repo
        const git = new GitOps(testRepoPath);
        await git.exec(['init'], testRepoPath);
        
        // Add initial file
        const { writeFile } = await import('fs/promises');
        await writeFile(join(testRepoPath, 'README.md'), '# Verification Test\n\nThis is a temporary test repository.\n');
        
        // Initial commit
        await git.exec(['add', '.'], testRepoPath);
        await git.exec(['commit', '-m', 'initial commit'], testRepoPath);
        
        // Create session store and manager
        const dbPath = join(tempDir, 'verify.sqlite');
        const store = new SessionStore(dbPath);
        const worktreeManager = new WorktreeManager(store, dbPath);
        
        // Create session
        const session = await worktreeManager.createSession({
          name: 'verification-test',
          ampPrompt: 'List the files in the current directory using the Read tool',
          repoRoot: testRepoPath,
          baseBranch: 'main',
          modelOverride: 'gpt-5'
        });
        
        console.log(`   Created test session: ${session.id}`);
        
        // Run iteration
        await worktreeManager.iterate(session.id);
        
        // Check results
        const iterations = store.getIterations(session.id);
        const lastIteration = iterations[0];
        
        if (lastIteration) {
          console.log('   ✅ Iteration completed successfully');
          
          if (lastIteration.ampVersion) {
            console.log(`   📊 Detected Amp version: ${lastIteration.ampVersion}`);
          }
          
          if (lastIteration.model) {
            console.log(`   🤖 Model used: ${lastIteration.model}`);
          }
          
          if (lastIteration.totalTokens !== undefined && lastIteration.totalTokens > 0) {
            console.log(`   🔢 Tokens used: ${lastIteration.totalTokens}`);
            console.log('   ✅ Token telemetry captured');
          } else {
            console.log('   ⚠️  No token telemetry captured (may indicate JSONL parsing issue)');
          }
          
          const toolCalls = store.getToolCalls(session.id, lastIteration.id);
          if (toolCalls.length > 0) {
            console.log(`   🔧 Tool calls captured: ${toolCalls.length}`);
            const uniqueTools = [...new Set(toolCalls.map((tc: any) => tc.toolName))];
            console.log(`   📚 Tools used: ${uniqueTools.join(', ')}`);
            console.log('   ✅ Tool call telemetry captured');
          } else {
            console.log('   ℹ️  No tool calls recorded (Amp may not have used tools)');
          }
          
          if (lastIteration.exitCode !== undefined) {
            console.log(`   🚪 Exit code: ${lastIteration.exitCode}`);
            if (lastIteration.exitCode === 0) {
              console.log('   ✅ Amp execution successful');
            } else {
              console.log('   ⚠️  Amp reported non-zero exit code');
            }
          }
          
          // Check if JSON logs were detected
          if (config.enableJsonL && lastIteration.totalTokens && lastIteration.totalTokens > 0) {
            console.log('   ✅ JSON logs parsing appears to be working');
          } else if (config.enableJsonL) {
            console.log('   ⚠️  JSON logs enabled but parsing may have fallen back to regex');
          }
          
        } else {
          console.log('   ❌ No iteration results found');
          success = false;
        }
        
        store.close();
        
      } catch (error) {
        console.log(`   ❌ Iteration test failed: ${error instanceof Error ? error.message : error}`);
        success = false;
      }
    } else {
      console.log('\n5. Skipping iteration test (authentication issues or not configured)');
    }

    // Final summary
    console.log('\n' + '='.repeat(50));
    if (success) {
      console.log('✅ VERIFICATION PASSED');
      console.log('   Your Amp setup is working correctly');
      
      if (hasAuthEnvironment()) {
        console.log('   You can run authenticated E2E tests with:');
        console.log('     pnpm test:e2e-amp');
      } else {
        console.log('   To run authenticated E2E tests, configure:');
        console.log('     export AMP_BIN=/path/to/amp');
        console.log('     export AMP_AUTH_CMD="amp auth login --token \\"$AMP_TOKEN\\""'); 
        console.log('     export AMP_TOKEN=your_token_here');
        console.log('     export AMP_ENABLE_JSONL=true');
      }
    } else {
      console.log('❌ VERIFICATION FAILED');
      console.log('   Please check the issues above and reconfigure');
      console.log('   Common solutions:');
      console.log('   - Ensure AMP_BIN points to a valid amp binary');
      console.log('   - Set up authentication with AMP_TOKEN and AMP_AUTH_CMD');
      console.log('   - Verify amp is properly installed and authenticated');
    }

  } catch (error) {
    console.log(`\n❌ Verification failed with error: ${error instanceof Error ? error.message : error}`);
    success = false;
  } finally {
    // Cleanup temp directory
    if (tempDir) {
      try {
        await rm(tempDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.warn(`Warning: Failed to cleanup temp directory: ${cleanupError}`);
      }
    }
  }

  process.exit(success ? 0 : 1);
}

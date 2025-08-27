import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn, execSync } from 'child_process';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('CLI E2E Tests', () => {
  let tempDir: string;
  let tempDbPath: string;
  let cliPath: string;

  beforeEach(async () => {
    // Create temporary directories
    tempDir = join(tmpdir(), `cli-e2e-test-${Date.now()}`);
    tempDbPath = join(tmpdir(), `cli-test-sessions-${Date.now()}.sqlite`);
    cliPath = join(__dirname, '../dist/index.js');
    
    await mkdir(tempDir, { recursive: true });
    
    // Initialize a git repo
    execSync('git init --initial-branch=main', { cwd: tempDir });
    execSync('git config user.email "test@example.com"', { cwd: tempDir });
    execSync('git config user.name "Test User"', { cwd: tempDir });
    
    // Create initial commit
    await writeFile(join(tempDir, 'README.md'), '# Test Repo\nInitial content\n');
    execSync('git add .', { cwd: tempDir });
    execSync('git commit -m "Initial commit"', { cwd: tempDir });
  });

  afterEach(async () => {
    // Clean up temp directories
    try {
      await rm(tempDir, { recursive: true, force: true });
      await rm(tempDbPath, { force: true });
    } catch (error) {
      // Ignore cleanup errors in tests
    }
  });

  const runCLI = async (args: string[]): Promise<{ 
    stdout: string; 
    stderr: string; 
    exitCode: number 
  }> => {
    return new Promise((resolve) => {
      const child = spawn('node', [cliPath, ...args], {
        stdio: ['inherit', 'pipe', 'pipe'],
        env: { ...process.env, SESSIONS_DB_PATH: tempDbPath }
      });
      
      let stdout = '';
      let stderr = '';
      
      child.stdout?.on('data', (data) => stdout += data.toString());
      child.stderr?.on('data', (data) => stderr += data.toString());
      
      child.on('close', (exitCode) => {
        resolve({ stdout, stderr, exitCode: exitCode || 0 });
      });
    });
  };

  it('should show help information', async () => {
    const result = await runCLI(['--help']);
    
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Amp Session Orchestrator CLI');
    expect(result.stdout).toContain('Commands:');
    expect(result.stdout).toContain('list');
    expect(result.stdout).toContain('new');
  });

  it('should list empty sessions initially', async () => {
    const result = await runCLI(['list']);
    
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('No sessions found');
  });

  it('should create a new session', async () => {
    const result = await runCLI([
      'new',
      '--repo', tempDir,
      '--name', 'Test Session',
      '--prompt', 'This is a test session for e2e testing',
      '--base', 'main'
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Creating session "Test Session"');
    expect(result.stdout).toContain('✓ Session created:');
    expect(result.stdout).toContain('Branch: amp/test-session/');
    expect(result.stdout).toContain('Worktree:');
  });

  it('should list sessions after creation', async () => {
    // First create a session
    await runCLI([
      'new',
      '--repo', tempDir,
      '--name', 'Test Session',
      '--prompt', 'Test prompt',
      '--base', 'main'
    ]);

    // Then list sessions
    const result = await runCLI(['list']);
    
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Found 1 session(s)');
    expect(result.stdout).toContain('Test Session');
    expect(result.stdout).toContain('Status: idle');
    expect(result.stdout).toContain('Branch: amp/test-session/');
  });

  it('should show session status', async () => {
    // Create a session first
    const createResult = await runCLI([
      'new',
      '--repo', tempDir,
      '--name', 'Status Test Session',
      '--prompt', 'Test prompt for status',
      '--script', 'echo "test passed"'
    ]);
    
    // Extract session ID from create output
    const sessionIdMatch = createResult.stdout.match(/Session created: ([a-f0-9-]+)/);
    expect(sessionIdMatch).toBeTruthy();
    const sessionId = sessionIdMatch![1];

    // Get status
    const result = await runCLI(['status', sessionId]);
    
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Session: Status Test Session');
    expect(result.stdout).toContain('Status: idle');
    expect(result.stdout).toContain('Repository:');
    expect(result.stdout).toContain('Base Branch: main');
    expect(result.stdout).toContain('Test Command: echo "test passed"');
    expect(result.stdout).toContain('Prompt:');
    expect(result.stdout).toContain('Test prompt for status');
  });

  it('should handle session iteration', async () => {
    // Create a session first
    const createResult = await runCLI([
      'new',
      '--repo', tempDir,
      '--name', 'Iteration Test',
      '--prompt', 'Test iteration functionality'
    ]);
    
    const sessionIdMatch = createResult.stdout.match(/Session created: ([a-f0-9-]+)/);
    const sessionId = sessionIdMatch![1];

    // Run iteration
    const result = await runCLI(['iterate', sessionId, '--notes', 'Test iteration notes']);
    
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Running iteration for session: Iteration Test');
    expect(result.stdout).toContain('✓ Iteration completed');
  });

  it('should show session diff', async () => {
    // Create a session first
    const createResult = await runCLI([
      'new',
      '--repo', tempDir,
      '--name', 'Diff Test',
      '--prompt', 'Test diff functionality'
    ]);
    
    const sessionIdMatch = createResult.stdout.match(/Session created: ([a-f0-9-]+)/);
    const sessionId = sessionIdMatch![1];

    // Run iteration to create changes
    await runCLI(['iterate', sessionId]);

    // Check diff
    const result = await runCLI(['diff', sessionId]);
    
    expect(result.exitCode).toBe(0);
    // The diff might be empty or show changes depending on the stub implementation
    // At minimum, it should not error
  });

  it('should run test script when configured', async () => {
    // Create a session with a test script
    const createResult = await runCLI([
      'new',
      '--repo', tempDir,
      '--name', 'Script Test',
      '--prompt', 'Test script execution',
      '--script', 'echo "Test script executed successfully"'
    ]);
    
    const sessionIdMatch = createResult.stdout.match(/Session created: ([a-f0-9-]+)/);
    const sessionId = sessionIdMatch![1];

    // Run the script
    const result = await runCLI(['run', sessionId]);
    
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Running: echo "Test script executed successfully"');
    expect(result.stdout).toContain('Test script executed successfully');
    expect(result.stdout).toContain('✓ Script completed successfully');
  });

  it('should squash session commits', async () => {
    // Create a session and run iteration to have commits
    const createResult = await runCLI([
      'new',
      '--repo', tempDir,
      '--name', 'Squash Test',
      '--prompt', 'Test squash functionality'
    ]);
    
    const sessionIdMatch = createResult.stdout.match(/Session created: ([a-f0-9-]+)/);
    const sessionId = sessionIdMatch![1];

    // Run iteration to create commits
    await runCLI(['iterate', sessionId]);

    // Squash commits
    const result = await runCLI(['squash', sessionId, '--message', 'feat: implement squash test feature']);
    
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Squashing commits for session: Squash Test');
    expect(result.stdout).toContain('Commit message: feat: implement squash test feature');
    expect(result.stdout).toContain('✓ Session commits squashed successfully');
  });

  it('should rebase session onto target branch', async () => {
    // Create a session and run iteration
    const createResult = await runCLI([
      'new',
      '--repo', tempDir,
      '--name', 'Rebase Test',
      '--prompt', 'Test rebase functionality'
    ]);
    
    const sessionIdMatch = createResult.stdout.match(/Session created: ([a-f0-9-]+)/);
    const sessionId = sessionIdMatch![1];

    // Run iteration to create commits
    await runCLI(['iterate', sessionId]);

    // Rebase onto main
    const result = await runCLI(['rebase', sessionId, '--onto', 'main']);
    
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Rebasing session onto: main');
    expect(result.stdout).toContain('✓ Session rebased successfully');
  });

  it('should handle non-existent session gracefully', async () => {
    const fakeSessionId = '00000000-0000-0000-0000-000000000000';
    
    const result = await runCLI(['status', fakeSessionId]);
    
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(`Session ${fakeSessionId} not found`);
  });

  it('should handle invalid repository path', async () => {
    const invalidPath = '/path/that/does/not/exist';
    
    const result = await runCLI([
      'new',
      '--repo', invalidPath,
      '--name', 'Invalid Repo Test',
      '--prompt', 'This should fail'
    ]);
    
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Error creating session');
  });

  it('should require mandatory options for new command', async () => {
    const result = await runCLI(['new']);
    
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('required option');
  });

  it('should handle session workflow end-to-end', async () => {
    // 1. Create session
    const createResult = await runCLI([
      'new',
      '--repo', tempDir,
      '--name', 'E2E Workflow Test',
      '--prompt', 'Complete end-to-end workflow test',
      '--script', 'echo "All tests pass"'
    ]);
    
    expect(createResult.exitCode).toBe(0);
    const sessionIdMatch = createResult.stdout.match(/Session created: ([a-f0-9-]+)/);
    const sessionId = sessionIdMatch![1];

    // 2. List and verify session appears
    const listResult = await runCLI(['list']);
    expect(listResult.exitCode).toBe(0);
    expect(listResult.stdout).toContain('E2E Workflow Test');

    // 3. Check initial status
    const statusResult = await runCLI(['status', sessionId]);
    expect(statusResult.exitCode).toBe(0);
    expect(statusResult.stdout).toContain('Status: idle');

    // 4. Run iteration
    const iterateResult = await runCLI(['iterate', sessionId, '--notes', 'E2E test iteration']);
    expect(iterateResult.exitCode).toBe(0);
    expect(iterateResult.stdout).toContain('✓ Iteration completed');

    // 5. Run test script
    const runResult = await runCLI(['run', sessionId]);
    expect(runResult.exitCode).toBe(0);
    expect(runResult.stdout).toContain('All tests pass');

    // 6. Check diff
    const diffResult = await runCLI(['diff', sessionId, '--name-only']);
    expect(diffResult.exitCode).toBe(0);

    // 7. Squash commits
    const squashResult = await runCLI(['squash', sessionId, '--message', 'feat: complete e2e workflow']);
    expect(squashResult.exitCode).toBe(0);
    expect(squashResult.stdout).toContain('✓ Session commits squashed successfully');

    // 8. Rebase onto main
    const rebaseResult = await runCLI(['rebase', sessionId, '--onto', 'main']);
    expect(rebaseResult.exitCode).toBe(0);
    expect(rebaseResult.stdout).toContain('✓ Session rebased successfully');
  });
});

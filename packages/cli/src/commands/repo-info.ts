import { Command } from 'commander';
import { GitOps } from '@ampsm/core';
import chalk from 'chalk';

export async function repoInfoCommand(repoPath: string): Promise<void> {
  try {
    const git = new GitOps(repoPath);
    
    console.log(chalk.blue.bold(`Repository Information: ${repoPath}`));
    console.log();
    
    // Check if it's a git repo
    const isRepo = await git.isRepo();
    if (!isRepo) {
      console.log(chalk.red('❌ Not a git repository'));
      return;
    }
    console.log(chalk.green('✓ Valid git repository'));
    
    // Check for commits
    const hasCommitsResult = await git.exec(['rev-list', '--count', 'HEAD']);
    if (hasCommitsResult.exitCode !== 0) {
      console.log(chalk.red('❌ No commits found'));
      console.log(chalk.yellow('💡 Run "git commit" to create an initial commit before using sessions'));
      return;
    }
    console.log(chalk.green(`✓ Has commits (${hasCommitsResult.stdout.trim()} total)`));
    
    // Get current branch
    const currentBranchResult = await git.exec(['rev-parse', '--abbrev-ref', 'HEAD']);
    if (currentBranchResult.exitCode === 0) {
      console.log(chalk.cyan(`📍 Current branch: ${currentBranchResult.stdout.trim()}`));
    }
    
    // Get default branch
    const defaultBranch = await git.getDefaultBranch();
    console.log(chalk.cyan(`🌟 Default branch: ${defaultBranch}`));
    
    // Check if main exists
    const mainExistsResult = await git.exec(['rev-parse', '--verify', 'main']);
    const masterExistsResult = await git.exec(['rev-parse', '--verify', 'master']);
    
    console.log();
    console.log(chalk.blue.bold('Available branches:'));
    
    if (mainExistsResult.exitCode === 0) {
      console.log(chalk.green('✓ main'));
    } else {
      console.log(chalk.gray('✗ main (not found)'));
    }
    
    if (masterExistsResult.exitCode === 0) {
      console.log(chalk.green('✓ master'));
    } else {
      console.log(chalk.gray('✗ master (not found)'));
    }
    
    // List other branches
    const branchesResult = await git.exec(['branch', '-a']);
    if (branchesResult.exitCode === 0) {
      const branches = branchesResult.stdout.split('\n')
        .map(line => line.trim().replace(/^\*\s*/, '').replace(/^remotes\/origin\//, ''))
        .filter(line => line && !line.includes('HEAD ->') && line !== 'main' && line !== 'master')
        .slice(0, 5);
      
      branches.forEach(branch => {
        console.log(chalk.green(`✓ ${branch}`));
      });
    }
    
    console.log();
    
    // Recommendations
    console.log(chalk.blue.bold('Recommendations:'));
    if (defaultBranch === 'main') {
      console.log(chalk.green('✓ Use --base main (default)'));
    } else if (defaultBranch === 'master') {
      console.log(chalk.yellow('💡 Use --base master'));
    } else {
      console.log(chalk.yellow(`💡 Use --base ${defaultBranch}`));
    }
    
    // Check remotes
    const remotesResult = await git.exec(['remote']);
    if (remotesResult.exitCode === 0 && remotesResult.stdout.trim()) {
      console.log(chalk.green('✓ Has remotes configured'));
    } else {
      console.log(chalk.yellow('⚠️  No remotes configured (local repo only)'));
    }
    
  } catch (error) {
    console.error(chalk.red('Error checking repository:'), error);
    process.exit(1);
  }
}

export function addRepoInfoCommand(program: Command): void {
  program
    .command('repo-info <repo-path>')
    .description('Check repository status and get branch recommendations')
    .action(repoInfoCommand);
}

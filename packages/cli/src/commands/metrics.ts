import { Command } from 'commander';
import { getSessionManager } from '../utils/session-manager';
import chalk from 'chalk';

interface MetricsOptions {
  session?: string;
  iteration?: string;
  format?: 'table' | 'json' | 'csv';
  details?: boolean;
}

export function createMetricsCommand(): Command {
  const cmd = new Command('metrics')
    .description('Display session metrics and tool call information')
    .option('-s, --session <id>', 'Session ID to analyze')
    .option('-i, --iteration <id>', 'Specific iteration ID')
    .option('-f, --format <format>', 'Output format (table|json|csv)', 'table')
    .option('-d, --details', 'Show detailed tool call information', false)
    .action(async (options: MetricsOptions) => {
      try {
        const sessionManager = await getSessionManager();
        const metricsAPI = sessionManager.getMetricsAPI();
        
        if (!options.session) {
          // List recent sessions with basic metrics
          await showRecentSessions(sessionManager);
          return;
        }
        
        // Show metrics for specific session
        await showSessionMetrics(metricsAPI, options);
        
      } catch (error) {
        console.error(chalk.red('Error displaying metrics:'), error);
        process.exit(1);
      }
    });

  // Add subcommands
  cmd.addCommand(createToolCallsCommand());
  cmd.addCommand(createCostsCommand());
  cmd.addCommand(createLineChangesCommand());
  
  return cmd;
}

function createToolCallsCommand(): Command {
  return new Command('tools')
    .description('Display tool call statistics')
    .option('-s, --session <id>', 'Session ID', true)
    .option('-i, --iteration <id>', 'Specific iteration ID')
    .option('--sort <field>', 'Sort by field (name|count|duration|success)', 'count')
    .action(async (options) => {
      try {
        const sessionManager = await getSessionManager();
        const metricsAPI = sessionManager.getMetricsAPI();
        
        if (!options.session) {
          console.error(chalk.red('Session ID is required'));
          process.exit(1);
        }
        
        await showToolCalls(metricsAPI, options);
        
      } catch (error) {
        console.error(chalk.red('Error displaying tool calls:'), error);
        process.exit(1);
      }
    });
}

function createCostsCommand(): Command {
  return new Command('costs')
    .description('Display cost breakdown')
    .option('-s, --session <id>', 'Session ID', true)
    .action(async (options) => {
      try {
        const sessionManager = await getSessionManager();
        const metricsAPI = sessionManager.getMetricsAPI();
        
        if (!options.session) {
          console.error(chalk.red('Session ID is required'));
          process.exit(1);
        }
        
        await showCosts(metricsAPI, options);
        
      } catch (error) {
        console.error(chalk.red('Error displaying costs:'), error);
        process.exit(1);
      }
    });
}

function createLineChangesCommand(): Command {
  return new Command('changes')
    .description('Display line change statistics')
    .option('-s, --session <id>', 'Session ID', true)
    .action(async (options) => {
      try {
        const sessionManager = await getSessionManager();
        const metricsAPI = sessionManager.getMetricsAPI();
        
        if (!options.session) {
          console.error(chalk.red('Session ID is required'));
          process.exit(1);
        }
        
        await showLineChanges(metricsAPI, options);
        
      } catch (error) {
        console.error(chalk.red('Error displaying line changes:'), error);
        process.exit(1);
      }
    });
}

async function showRecentSessions(sessionManager: any): Promise<void> {
  const sessions = sessionManager.store.getSessions().slice(0, 10);
  
  if (sessions.length === 0) {
    console.log(chalk.yellow('No sessions found'));
    return;
  }
  
  console.log(chalk.blue.bold('Recent Sessions:'));
  console.log();
  
  const table = sessions.map((session: any) => [
    session.id.substring(0, 8),
    session.name || 'Unnamed',
    session.status,
    session.createdAt.substring(0, 10),
    session.branchName || 'N/A'
  ]);
  
  console.table(table, ['ID', 'Name', 'Status', 'Created', 'Branch']);
  
  console.log();
  console.log(chalk.gray('Use --session <id> to see detailed metrics for a specific session'));
}

async function showSessionMetrics(metricsAPI: any, options: MetricsOptions): Promise<void> {
  const summary = await metricsAPI.getSessionSummary(options.session!);
  
  if (!summary) {
    console.error(chalk.red(`Session not found: ${options.session}`));
    process.exit(1);
  }
  
  console.log(chalk.blue.bold(`Session Metrics: ${summary.sessionId.substring(0, 8)}`));
  console.log();
  
  // Basic metrics
  console.log(chalk.cyan('Overview:'));
  console.log(`  Iterations: ${summary.totalIterations}`);
  console.log(`  Success Rate: ${(summary.successRate * 100).toFixed(1)}%`);
  console.log(`  Total Duration: ${formatDuration(summary.totalDurationMs)}`);
  console.log(`  Average Duration: ${formatDuration(summary.avgDurationMs)}`);
  console.log();
  
  // Token usage
  console.log(chalk.cyan('Token Usage:'));
  console.log(`  Total Tokens: ${summary.tokenUsage.totalTokens.toLocaleString()}`);
  console.log(`  Prompt Tokens: ${summary.tokenUsage.totalPromptTokens.toLocaleString()}`);
  console.log(`  Completion Tokens: ${summary.tokenUsage.totalCompletionTokens.toLocaleString()}`);
  console.log();
  
  // Cost breakdown
  const costBreakdown = metricsAPI.getCostBreakdown(options.session!);
  console.log(chalk.cyan('Costs:'));
  console.log(`  Total Cost: ${costBreakdown.totalCost}`);
  console.log(`  Average per Iteration: ${costBreakdown.averageCostPerIteration}`);
  
  if (costBreakdown.costByModel.length > 0) {
    console.log('  By Model:');
    costBreakdown.costByModel.forEach(({ model, cost, percentage }: any) => {
      console.log(`    ${model}: ${cost} (${percentage.toFixed(1)}%)`);
    });
  }
  console.log();
  
  // File changes
  console.log(chalk.cyan('File Changes:'));
  console.log(`  Files Changed: ${summary.totalFilesChanged}`);
  console.log(`  Lines Added: ${summary.totalLocAdded}`);
  console.log(`  Lines Deleted: ${summary.totalLocDeleted}`);
  console.log(`  Net Change: ${summary.totalLocAdded - summary.totalLocDeleted}`);
  console.log();
  
  // Tool usage summary
  if (summary.toolUsage.length > 0) {
    console.log(chalk.cyan('Top Tools:'));
    summary.toolUsage.slice(0, 5).forEach((tool: any) => {
      const successRate = (tool.successRate * 100).toFixed(1);
      console.log(`  ${tool.toolName}: ${tool.callCount} calls, ${successRate}% success`);
    });
    console.log();
  }
  
  if (options.details) {
    await showDetailedMetrics(metricsAPI, options.session!);
  }
}

async function showToolCalls(metricsAPI: any, options: any): Promise<void> {
  const toolCalls = metricsAPI.getToolCallDetails(options.session, options.iteration);
  
  if (toolCalls.length === 0) {
    console.log(chalk.yellow('No tool calls found'));
    return;
  }
  
  console.log(chalk.blue.bold(`Tool Calls (${toolCalls.length} total)`));
  console.log();
  
  // Group by tool name for summary
  const toolSummary = toolCalls.reduce((acc: any, call: any) => {
    if (!acc[call.toolName]) {
      acc[call.toolName] = { count: 0, success: 0, totalDuration: 0 };
    }
    acc[call.toolName].count++;
    if (call.success) acc[call.toolName].success++;
    if (call.durationMs) acc[call.toolName].totalDuration += call.durationMs;
    return acc;
  }, {} as Record<string, { count: number; success: number; totalDuration: number }>);
  
  console.log(chalk.cyan('Summary by Tool:'));
  Object.entries(toolSummary).forEach(([tool, stats]: any) => {
    const successRate = (stats.success / stats.count * 100).toFixed(1);
    const avgDuration = stats.totalDuration > 0 ? Math.round(stats.totalDuration / stats.count) : 0;
    console.log(`  ${tool}: ${stats.count} calls, ${successRate}% success, ${avgDuration}ms avg`);
  });
  console.log();
  
  // Recent tool calls
  console.log(chalk.cyan('Recent Tool Calls:'));
  toolCalls.slice(0, 20).forEach((call: any) => {
    const status = call.success ? chalk.green('✓') : chalk.red('✗');
    const time = new Date(call.timestamp).toLocaleTimeString();
    console.log(`  ${status} ${call.toolName} (${call.formattedDuration}) at ${time}`);
    if (call.formattedArgs !== '{}') {
      console.log(`    ${chalk.gray(call.formattedArgs.substring(0, 80))}`);
    }
  });
}

async function showCosts(metricsAPI: any, options: any): Promise<void> {
  const costBreakdown = metricsAPI.getCostBreakdown(options.session);
  const summary = await metricsAPI.getSessionSummary(options.session);
  
  console.log(chalk.blue.bold('Cost Analysis'));
  console.log();
  
  console.log(chalk.cyan('Total Costs:'));
  console.log(`  Session Total: ${costBreakdown.totalCost}`);
  console.log(`  Total Tokens: ${costBreakdown.totalTokens}`);
  console.log(`  Average per Iteration: ${costBreakdown.averageCostPerIteration}`);
  console.log();
  
  if (costBreakdown.costByModel.length > 0) {
    console.log(chalk.cyan('Cost by Model:'));
    costBreakdown.costByModel.forEach(({ model, cost, percentage }: any) => {
      const bar = '█'.repeat(Math.round(percentage / 5)); // Simple ASCII bar
      console.log(`  ${model.padEnd(20)} ${cost.padStart(8)} (${percentage.toFixed(1)}%) ${chalk.blue(bar)}`);
    });
    console.log();
  }
  
  if (summary) {
    console.log(chalk.cyan('Cost Efficiency:'));
    const costPerSuccess = summary.successfulIterations > 0 
      ? parseFloat(costBreakdown.totalCost.replace(/[$‰]/, '')) / summary.successfulIterations
      : 0;
    console.log(`  Cost per Successful Iteration: $${costPerSuccess.toFixed(4)}`);
    console.log(`  Success Rate: ${(summary.successRate * 100).toFixed(1)}%`);
  }
}

async function showLineChanges(metricsAPI: any, options: any): Promise<void> {
  const lineStats = metricsAPI.getLineChangeStats(options.session);
  
  if (lineStats.length === 0) {
    console.log(chalk.yellow('No line change data found'));
    return;
  }
  
  console.log(chalk.blue.bold('Line Change Statistics'));
  console.log();
  
  const totalAdded = lineStats.reduce((sum: any, stat: any) => sum + stat.linesAdded, 0);
  const totalDeleted = lineStats.reduce((sum: any, stat: any) => sum + stat.linesDeleted, 0);
  const totalFiles = lineStats.reduce((sum: any, stat: any) => sum + stat.filesChanged, 0);
  
  console.log(chalk.cyan('Summary:'));
  console.log(`  Total Lines Added: ${totalAdded.toLocaleString()}`);
  console.log(`  Total Lines Deleted: ${totalDeleted.toLocaleString()}`);
  console.log(`  Net Change: ${(totalAdded - totalDeleted).toLocaleString()}`);
  console.log(`  Files Changed: ${totalFiles.toLocaleString()}`);
  console.log();
  
  console.log(chalk.cyan('By Iteration:'));
  lineStats.forEach((stat: any) => {
    const netChange = stat.netChange;
    const changeColor = netChange > 0 ? chalk.green : netChange < 0 ? chalk.red : chalk.gray;
    const changeSymbol = netChange > 0 ? '+' : '';
    console.log(`  Iteration ${stat.iterationNumber}: ${stat.filesChanged} files, ${changeColor(changeSymbol + netChange)} lines`);
  });
}

async function showDetailedMetrics(metricsAPI: any, sessionId: string): Promise<void> {
  console.log(chalk.cyan('Detailed Tool Call History:'));
  await showToolCalls(metricsAPI, { session: sessionId });
  console.log();
  
  console.log(chalk.cyan('Line Changes by Iteration:'));
  await showLineChanges(metricsAPI, { session: sessionId });
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
  return `${Math.round(ms / 3600000)}h ${Math.round((ms % 3600000) / 60000)}m`;
}

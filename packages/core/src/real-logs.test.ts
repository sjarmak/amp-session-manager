import { describe, it, expect } from 'vitest';
import { AmpLogParser } from './amp-log-parser.js';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

describe('Real CLI Logs Integration', () => {
  const logPath = join(homedir(), '.cache', 'amp', 'logs', 'cli.log');

  it('should parse real CLI logs when available', () => {
    if (!existsSync(logPath)) {
      console.log('No real CLI logs found, skipping test');
      return;
    }

    // Parse the real log file
    const entries = AmpLogParser.parseLog();
    
    console.log(`Parsed ${entries.length} log entries from real CLI logs`);
    
    // Should have some entries
    expect(entries.length).toBeGreaterThan(0);
    
    // Each entry should have the expected structure
    entries.slice(0, 5).forEach(entry => {
      expect(entry).toHaveProperty('level');
      expect(entry).toHaveProperty('message');
      expect(entry).toHaveProperty('timestamp');
      expect(['info', 'error']).toContain(entry.level);
    });
    
    // Extract tool usages from real logs
    const toolUsages = AmpLogParser.extractToolUsages(entries);
    console.log(`Found ${toolUsages.length} tool usages in real logs`);
    
    if (toolUsages.length > 0) {
      console.log('Tool usage breakdown:');
      const stats = AmpLogParser.getToolUsageStats(toolUsages);
      Object.entries(stats).forEach(([tool, count]) => {
        console.log(`  ${tool}: ${count} times`);
      });
      
      // Each tool usage should have expected structure
      toolUsages.slice(0, 3).forEach(usage => {
        expect(usage).toHaveProperty('toolName');
        expect(usage).toHaveProperty('timestamp');
        expect(usage).toHaveProperty('permitted');
        expect(usage.permitted).toBe(true); // Only permitted tools are returned
      });
    }
  });

  it('should extract iteration metrics from recent real logs', () => {
    if (!existsSync(logPath)) {
      console.log('No real CLI logs found, skipping test');
      return;
    }

    // Use a timestamp from 1 hour ago to capture recent activity
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    
    const metrics = AmpLogParser.extractIterationMetrics(oneHourAgo);
    
    console.log(`Recent iteration metrics (last hour):`);
    console.log(`  Tool usages: ${metrics.toolUsages.length}`);
    console.log(`  Errors: ${metrics.errors.length}`);
    console.log(`  Duration: ${metrics.duration}ms`);
    
    if (metrics.toolUsages.length > 0) {
      console.log('  Recent tools used:');
      metrics.toolUsages.forEach(usage => {
        console.log(`    - ${usage.toolName} at ${usage.timestamp}`);
      });
    }

    // Verify structure
    expect(metrics).toHaveProperty('toolUsages');
    expect(metrics).toHaveProperty('errors');
    expect(metrics).toHaveProperty('duration');
    expect(metrics.duration).toBeGreaterThanOrEqual(0);
  });

  it('should get activity summary from real logs', () => {
    if (!existsSync(logPath)) {
      console.log('No real CLI logs found, skipping test');
      return;
    }

    const summary = AmpLogParser.getActivitySummary(24); // Last 24 hours
    
    console.log('Activity summary (last 24 hours):');
    console.log(`  Total sessions: ${summary.totalSessions}`);
    console.log(`  Total tool usages: ${summary.totalToolUsages}`);
    console.log(`  Error count: ${summary.errorCount}`);
    console.log('  Tool breakdown:', summary.toolStats);
    
    // Verify structure
    expect(summary).toHaveProperty('totalSessions');
    expect(summary).toHaveProperty('totalToolUsages');
    expect(summary).toHaveProperty('toolStats');
    expect(summary).toHaveProperty('errorCount');
    expect(summary).toHaveProperty('timeRange');
    
    expect(summary.totalSessions).toBeGreaterThanOrEqual(0);
    expect(summary.totalToolUsages).toBeGreaterThanOrEqual(0);
    expect(summary.errorCount).toBeGreaterThanOrEqual(0);
  });
});

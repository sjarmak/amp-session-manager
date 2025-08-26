/**
 * Amp CLI Log Parser
 * 
 * Parses ~/.cache/amp/logs/cli.log to extract tool usage, timestamps, and session information
 * for telemetry and session tracking in the Amp Session Conductor.
 */

import { readFileSync, statSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export interface AmpLogEntry {
  level: 'info' | 'error';
  message: string;
  timestamp: string;
  permissions?: Array<{ action: string; tool: string }>;
  settingsPath?: string;
  name?: string;
  stack?: string;
}

export interface ToolUsage {
  toolName: string;
  timestamp: string;
  permitted: boolean;
}

export interface SessionInfo {
  startTime: string;
  endTime?: string;
  toolUsages: ToolUsage[];
  errors: AmpLogEntry[];
}

export class AmpLogParser {
  private static readonly LOG_PATH = join(homedir(), '.cache', 'amp', 'logs', 'cli.log');

  /**
   * Parse the entire Amp CLI log file
   */
  static parseLog(customLogPath?: string): AmpLogEntry[] {
    const logPath = customLogPath || this.LOG_PATH;
    try {
      const content = readFileSync(logPath, 'utf8');
      const lines = content.trim().split('\n');
      
      return lines
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(line => {
          // Remove line number prefix (e.g., "123: ")
          const jsonStart = line.indexOf('{');
          if (jsonStart === -1) return null;
          
          const jsonStr = line.substring(jsonStart);
          
          try {
            return JSON.parse(jsonStr) as AmpLogEntry;
          } catch (parseError) {
            console.warn('Failed to parse log line:', line, parseError);
            return null;
          }
        })
        .filter((entry): entry is AmpLogEntry => entry !== null);
    } catch (error) {
      console.error('Failed to read Amp CLI log:', error);
      return [];
    }
  }

  /**
   * Extract tool usage information from log entries
   */
  static extractToolUsages(entries: AmpLogEntry[]): ToolUsage[] {
    const toolUsages: ToolUsage[] = [];
    
    for (const entry of entries) {
      const { message, timestamp } = entry;
      
      // Pattern: "Tool {toolName} - checking permissions"
      const checkingMatch = message.match(/^Tool (\w+) - checking permissions$/);
      if (checkingMatch) {
        const toolName = checkingMatch[1];
        toolUsages.push({
          toolName,
          timestamp,
          permitted: false, // Will be updated if we find a permitted message
        });
        continue;
      }
      
      // Pattern: "Tool {toolName} permitted - action: allow"
      const permittedMatch = message.match(/^Tool (\w+) permitted - action: allow$/);
      if (permittedMatch) {
        const toolName = permittedMatch[1];
        // Find the most recent checking entry for this tool and mark as permitted
        for (let i = toolUsages.length - 1; i >= 0; i--) {
          if (toolUsages[i].toolName === toolName && !toolUsages[i].permitted) {
            toolUsages[i].permitted = true;
            break;
          }
        }
        continue;
      }
      
      // Pattern: "Tool {toolName} - no permissions configured, forwarding to base service"
      const forwardingMatch = message.match(/^Tool (\w+) - no permissions configured, forwarding to base service$/);
      if (forwardingMatch) {
        const toolName = forwardingMatch[1];
        toolUsages.push({
          toolName,
          timestamp,
          permitted: true, // Tools forwarded to base service are implicitly permitted
        });
        continue;
      }
    }
    
    // Also check for invokeTool entries in named entries (newer format)
    for (const entry of entries) {
      if (entry.name === 'invokeTool' && entry.message) {
        // Extract tool name from invokeTool entries
        // Format: "toolu_xxxxx, done" or "toolu_xxxxx, in-progress"
        const match = entry.message.match(/^toolu_[^,]+, (done|in-progress)$/);
        if (match && match[1] === 'done') {
          toolUsages.push({
            toolName: 'tool_execution', // Generic name since we don't have specific tool name
            timestamp: entry.timestamp,
            permitted: true
          });
        }
      }
    }
    
    return toolUsages.filter(usage => usage.permitted);
  }

  /**
   * Detect session boundaries based on "Starting Amp CLI" messages
   */
  static extractSessions(entries: AmpLogEntry[]): SessionInfo[] {
    const sessions: SessionInfo[] = [];
    let currentSession: SessionInfo | null = null;
    
    for (const entry of entries) {
      const { message, timestamp, level } = entry;
      
      // New session starts
      if (message === 'Starting Amp CLI.') {
        // Close previous session if exists
        if (currentSession) {
          currentSession.endTime = timestamp;
          sessions.push(currentSession);
        }
        
        // Start new session
        currentSession = {
          startTime: timestamp,
          toolUsages: [],
          errors: [],
        };
        continue;
      }
      
      // Add to current session if exists
      if (currentSession) {
        if (level === 'error') {
          currentSession.errors.push(entry);
        }
        
        // Extract tool usage for this session
        const toolUsages = this.extractToolUsages([entry]);
        currentSession.toolUsages.push(...toolUsages);
      }
    }
    
    // Close final session
    if (currentSession) {
      sessions.push(currentSession);
    }
    
    return sessions;
  }

  /**
   * Get log entries since a specific timestamp
   */
  static getEntriesSince(sinceTimestamp: string): AmpLogEntry[] {
    const allEntries = this.parseLog();
    const sinceDate = new Date(sinceTimestamp);
    
    return allEntries.filter(entry => {
      const entryDate = new Date(entry.timestamp);
      return entryDate > sinceDate;
    });
  }

  /**
   * Get the last modification time of the log file
   */
  static getLogFileModTime(): Date | null {
    try {
      const stats = statSync(this.LOG_PATH);
      return stats.mtime;
    } catch (error) {
      console.error('Failed to get log file stats:', error);
      return null;
    }
  }

  /**
   * Extract session metrics for the current thread/iteration
   * This correlates with session iteration by checking what changed after a specific timestamp
   */
  static extractIterationMetrics(beforeTimestamp: string): {
    toolUsages: ToolUsage[];
    errors: AmpLogEntry[];
    duration: number;
  } {
    const entries = this.getEntriesSince(beforeTimestamp);
    const toolUsages = this.extractToolUsages(entries);
    const errors = entries.filter(entry => entry.level === 'error');
    
    const startTime = new Date(beforeTimestamp);
    const endTime = entries.length > 0 
      ? new Date(entries[entries.length - 1].timestamp)
      : new Date();
    
    const duration = endTime.getTime() - startTime.getTime();
    
    return {
      toolUsages,
      errors,
      duration,
    };
  }

  /**
   * Extract session-specific metrics from a custom log file
   * This provides isolated metrics for a specific session
   */
  static extractSessionMetrics(sessionLogPath: string, beforeTimestamp: string): {
    toolUsages: ToolUsage[];
    errors: AmpLogEntry[];
    duration: number;
  } {
    try {
      const entries = this.parseLog(sessionLogPath);
      const filteredEntries = entries.filter(entry => 
        new Date(entry.timestamp) > new Date(beforeTimestamp)
      );
      const toolUsages = this.extractToolUsages(filteredEntries);
      const errors = filteredEntries.filter(entry => entry.level === 'error');
      
      const startTime = new Date(beforeTimestamp);
      const endTime = filteredEntries.length > 0 
        ? new Date(filteredEntries[filteredEntries.length - 1].timestamp)
        : startTime; // Use start time if no entries found, so duration = 0
      
      const duration = endTime.getTime() - startTime.getTime();
      
      return {
        toolUsages,
        errors,
        duration,
      };
    } catch (error) {
      console.warn(`Failed to parse session log ${sessionLogPath}:`, error);
      return {
        toolUsages: [],
        errors: [],
        duration: 0,
      };
    }
  }

  /**
   * Count tool usage by type for analytics
   */
  static getToolUsageStats(toolUsages: ToolUsage[]): Record<string, number> {
    const stats: Record<string, number> = {};
    
    for (const usage of toolUsages) {
      stats[usage.toolName] = (stats[usage.toolName] || 0) + 1;
    }
    
    return stats;
  }

  /**
   * Get a summary of recent Amp CLI activity
   */
  static getActivitySummary(hoursBack: number = 24): {
    totalSessions: number;
    totalToolUsages: number;
    toolStats: Record<string, number>;
    errorCount: number;
    timeRange: { start: string; end: string };
  } {
    const cutoffTime = new Date(Date.now() - (hoursBack * 60 * 60 * 1000));
    const entries = this.parseLog().filter(entry => 
      new Date(entry.timestamp) > cutoffTime
    );
    
    if (entries.length === 0) {
      return {
        totalSessions: 0,
        totalToolUsages: 0,
        toolStats: {},
        errorCount: 0,
        timeRange: { start: '', end: '' },
      };
    }
    
    const sessions = this.extractSessions(entries);
    const toolUsages = this.extractToolUsages(entries);
    const errors = entries.filter(entry => entry.level === 'error');
    
    return {
      totalSessions: sessions.length,
      totalToolUsages: toolUsages.length,
      toolStats: this.getToolUsageStats(toolUsages),
      errorCount: errors.length,
      timeRange: {
        start: entries[0].timestamp,
        end: entries[entries.length - 1].timestamp,
      },
    };
  }
}

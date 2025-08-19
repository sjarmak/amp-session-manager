import { SessionStore } from '@ampsm/core';
import type { ToolCall } from '@ampsm/types';

export async function toolsCommand(sessionId: string, options: {
  last?: boolean;
  since?: string;
  limit?: number;
  json?: boolean;
}) {
  const store = new SessionStore();
  
  try {
    const session = store.getSession(sessionId);
    if (!session) {
      console.error(`Session ${sessionId} not found`);
      process.exit(1);
    }

    let toolCalls: ToolCall[];
    
    if (options.last) {
      // Get tools from last iteration only
      const iterations = store.getIterations(sessionId, 1);
      if (iterations.length === 0) {
        console.log('No iterations found');
        return;
      }
      toolCalls = store.getToolCalls(sessionId, iterations[0].id);
    } else if (options.since) {
      // Get tools since a specific commit SHA
      const iterations = store.getIterations(sessionId);
      const sinceIteration = iterations.find(it => it.commitSha?.startsWith(options.since!));
      if (!sinceIteration) {
        console.error(`Commit ${options.since} not found in session history`);
        process.exit(1);
      }
      
      // Get all iterations since the specified one
      const sinceIndex = iterations.indexOf(sinceIteration);
      const recentIterations = iterations.slice(0, sinceIndex);
      
      toolCalls = [];
      for (const iteration of recentIterations) {
        toolCalls.push(...store.getToolCalls(sessionId, iteration.id));
      }
    } else {
      // Get all tool calls for the session
      toolCalls = store.getToolCalls(sessionId, undefined, options.limit);
    }

    if (options.json) {
      console.log(JSON.stringify(toolCalls, null, 2));
      return;
    }

    if (toolCalls.length === 0) {
      console.log('No tool calls found');
      return;
    }

    // Format as table
    console.log(`\nTool Calls for Session: ${session.name}`);
    console.log('─'.repeat(80));
    console.log('Timestamp                Tool Name      Duration  Success  Args Preview');
    console.log('─'.repeat(80));

    toolCalls.forEach(call => {
      const timestamp = new Date(call.timestamp).toLocaleString();
      const duration = call.durationMs ? `${call.durationMs}ms` : '-';
      const success = call.success ? '✓' : '✗';
      const args = JSON.parse(call.argsJson);
      const argsPreview = Object.keys(args).length > 0 
        ? Object.keys(args).slice(0, 2).join(', ') + (Object.keys(args).length > 2 ? '...' : '')
        : '(none)';

      console.log(
        `${timestamp.padEnd(24)} ${call.toolName.padEnd(14)} ${duration.padEnd(9)} ${success.padEnd(8)} ${argsPreview}`
      );
    });

    console.log('─'.repeat(80));
    console.log(`Total: ${toolCalls.length} tool calls`);
  } finally {
    store.close();
  }
}

import type { AmpTelemetry } from '@ampsm/types';

export interface LogEvent {
  timestamp: string;
  tool?: string;
  args?: Record<string, any>;
  duration?: number;
  success?: boolean;
  tokens?: {
    prompt?: number;
    completion?: number;
    total?: number;
  };
  model?: string;
  type: 'tool_start' | 'tool_finish' | 'token_usage' | 'model_info' | 'unknown';
}

export class TelemetryParser {
  private toolCalls: Map<string, {
    toolName: string;
    args: Record<string, any>;
    timestamp: string;
  }> = new Map();

  parseOutput(output: string): AmpTelemetry {
    const lines = output.split('\n');
    const events: LogEvent[] = [];
    
    // Try to parse as JSONL first
    const jsonlEvents = this.parseJSONL(lines);
    events.push(...jsonlEvents);
    
    // Always also try regex parsing for mixed logs
    const textEvents = this.parseTextLogs(lines);
    events.push(...textEvents);

    return this.buildTelemetry(events, output);
  }

  private parseJSONL(lines: string[]): LogEvent[] {
    const events: LogEvent[] = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('{')) continue;
      
      try {
        const parsed = JSON.parse(trimmed);
        const event = this.parseJSONEvent(parsed);
        if (event) {
          events.push(event);
        }
      } catch {
        // Not valid JSON, continue
      }
    }
    
    return events;
  }

  private parseJSONEvent(json: any): LogEvent | null {
    if (!json.timestamp) {
      json.timestamp = new Date().toISOString();
    }

    // Tool call events
    if (json.tool) {
      if (json.event === 'tool_start' || json.action === 'start') {
        return {
          timestamp: json.timestamp,
          tool: json.tool,
          args: json.args || {},
          type: 'tool_start'
        };
      } else if (json.event === 'tool_finish' || json.action === 'finish') {
        return {
          timestamp: json.timestamp,
          tool: json.tool,
          duration: json.duration || json.durationMs,
          success: json.success !== false,
          type: 'tool_finish'
        };
      }
    }

    // Token usage (either dedicated tokens field or inline) - also extract model if present
    if (json.tokens || json.token_usage || (json.prompt && json.completion)) {
      const tokens = json.tokens || json.token_usage || json;
      return {
        timestamp: json.timestamp,
        tokens: {
          prompt: tokens.prompt || tokens.prompt_tokens,
          completion: tokens.completion || tokens.completion_tokens,
          total: tokens.total || tokens.total_tokens
        },
        model: json.model, // Extract model from same event
        type: 'token_usage'
      };
    }

    // Model info (standalone model events)
    if (json.model && !json.tokens && !json.prompt && !json.completion) {
      return {
        timestamp: json.timestamp,
        model: json.model,
        type: 'model_info'
      };
    }

    return null;
  }

  private parseTextLogs(lines: string[]): LogEvent[] {
    const events: LogEvent[] = [];
    const timestamp = new Date().toISOString();

    for (const line of lines) {
      // Enhanced tool usage patterns (based on amp-eval patterns)
      const toolStartMatch = line.match(/^\[(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\].*?Using (\w+) tool.*?({.*})/i);
      if (toolStartMatch) {
        events.push({
          timestamp: toolStartMatch[1],
          tool: toolStartMatch[2],
          args: this.safeParseJSON(toolStartMatch[3]),
          type: 'tool_start'
        });
        continue;
      }

      // Plain tool start patterns (no timestamp prefix)
      const plainStartMatch = line.match(/Tool\s+(\w+)\s+(?:started|begin|initiated)/i);
      if (plainStartMatch) {
        events.push({
          timestamp,
          tool: plainStartMatch[1],
          type: 'tool_start'
        });
        continue;
      }

      // Function call patterns (Amp often uses this format for tools like web_search)
      const functionCallMatch = line.match(/<function_calls>.*?<invoke name="([^"]+)">/i);
      if (functionCallMatch) {
        events.push({
          timestamp,
          tool: functionCallMatch[1],
          type: 'tool_start'
        });
        continue;
      }

      // Alternative function patterns
      const altFunctionMatch = line.match(/(?:Invoking|Calling)\s+(\w+)\s+(?:function|tool)/i);
      if (altFunctionMatch) {
        events.push({
          timestamp,
          tool: altFunctionMatch[1],
          type: 'tool_start'
        });
        continue;
      }

      const toolFinishMatch = line.match(/^\[(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\].*?(\w+) tool.*?(completed|finished|failed).*?(\d+)ms/i);
      if (toolFinishMatch) {
        events.push({
          timestamp: toolFinishMatch[1],
          tool: toolFinishMatch[2],
          success: toolFinishMatch[3].toLowerCase() !== 'failed',
          duration: parseInt(toolFinishMatch[4], 10),
          type: 'tool_finish'
        });
        continue;
      }

      // Plain tool finish patterns (no timestamp prefix)
      const plainFinishMatch = line.match(/Tool\s+(\w+)\s+(?:done|finished|completed).*?(\d+)ms/i);
      if (plainFinishMatch) {
        events.push({
          timestamp,
          tool: plainFinishMatch[1],
          success: true,
          duration: parseInt(plainFinishMatch[2], 10),
          type: 'tool_finish'
        });
        continue;
      }

      // Function call completion patterns
      const functionCompleteMatch = line.match(/<\/function_calls>/);
      if (functionCompleteMatch) {
        // Look for the most recent tool start to pair it with
        const recentStarts = events.filter(e => e.type === 'tool_start').slice(-1);
        if (recentStarts.length > 0) {
          const recentStart = recentStarts[0];
          events.push({
            timestamp,
            tool: recentStart.tool,
            success: true,
            type: 'tool_finish'
          });
        }
        continue;
      }

      // Result patterns (often used after function calls)
      const resultMatch = line.match(/(?:Result|Output|Response).*?(?:from|for)\s+(\w+)/i);
      if (resultMatch) {
        events.push({
          timestamp,
          tool: resultMatch[1],
          success: true,
          type: 'tool_finish'
        });
        continue;
      }

      // Enhanced token usage patterns
      const tokenMatch = line.match(/(?:tokens?[:\s]*)?prompt[:\s]*(\d+).*?completion[:\s]*(\d+).*?total[:\s]*(\d+)/i);
      if (tokenMatch) {
        events.push({
          timestamp,
          tokens: {
            prompt: parseInt(tokenMatch[1], 10),
            completion: parseInt(tokenMatch[2], 10),
            total: parseInt(tokenMatch[3], 10)
          },
          type: 'token_usage'
        });
        continue;
      }

      // Alternative token format "Prompt tokens: N, Completion tokens: M, Total: T"
      const altTokenMatch = line.match(/Prompt\s+tokens:\s*(\d+),?\s*Completion\s+tokens:\s*(\d+),?\s*Total:\s*(\d+)/i);
      if (altTokenMatch) {
        events.push({
          timestamp,
          tokens: {
            prompt: parseInt(altTokenMatch[1], 10),
            completion: parseInt(altTokenMatch[2], 10),
            total: parseInt(altTokenMatch[3], 10)
          },
          type: 'token_usage'
        });
        continue;
      }

      // Partial token information (just total)
      const partialTokenMatch = line.match(/tokens?[:\s]*total[:\s]*(\d+)/i);
      if (partialTokenMatch) {
        events.push({
          timestamp,
          tokens: {
            total: parseInt(partialTokenMatch[1], 10)
          },
          type: 'token_usage'
        });
        continue;
      }

      // Input/output token format (amp-eval style)
      const ioTokenMatch = line.match(/(?:input_tokens|input):\s*(\d+).*?(?:output_tokens|output):\s*(\d+)/i);
      if (ioTokenMatch) {
        const inputTokens = parseInt(ioTokenMatch[1], 10);
        const outputTokens = parseInt(ioTokenMatch[2], 10);
        events.push({
          timestamp,
          tokens: {
            prompt: inputTokens,
            completion: outputTokens,
            total: inputTokens + outputTokens
          },
          type: 'token_usage'
        });
        continue;
      }

      // Model info
      const modelMatch = line.match(/model:\s*([^\s,]+)/i);
      if (modelMatch) {
        events.push({
          timestamp,
          model: modelMatch[1],
          type: 'model_info'
        });
      }
    }

    return events;
  }

  private buildTelemetry(events: LogEvent[], rawOutput: string): AmpTelemetry {
    const telemetry: AmpTelemetry = {
      exitCode: 0, // Will be set by caller
      toolCalls: []
    };

    // Extract token usage and model info (prefer the last/most complete entry)
    for (const event of events.reverse()) {
      if (event.type === 'token_usage' && event.tokens) {
        telemetry.promptTokens = event.tokens.prompt;
        telemetry.completionTokens = event.tokens.completion;
        telemetry.totalTokens = event.tokens.total;
        // Also extract model if it's in the same event
        if (event.model) {
          telemetry.model = event.model;
        }
        break;
      }
    }
    events.reverse(); // Restore original order

    // Extract model info from any event that has it (if not already set)
    if (!telemetry.model) {
      const modelEvent = events.find(e => e.model);
      if (modelEvent) {
        telemetry.model = modelEvent.model;
      }
    }

    // Build tool calls by matching start/finish events
    const toolStarts = new Map<string, LogEvent>();
    
    for (const event of events) {
      if (event.type === 'tool_start' && event.tool) {
        const key = `${event.tool}_${event.timestamp}`;
        toolStarts.set(key, event);
      } else if (event.type === 'tool_finish' && event.tool) {
        // Find matching start event (by tool name and reasonably close timestamp)
        const matchingStart = Array.from(toolStarts.entries())
          .find(([_, startEvent]) => 
            startEvent.tool === event.tool && 
            Math.abs(new Date(event.timestamp).getTime() - new Date(startEvent.timestamp).getTime()) < 300000 // 5 min window
          );

        if (matchingStart) {
          const [key, startEvent] = matchingStart;
          telemetry.toolCalls.push({
            toolName: event.tool,
            args: startEvent.args || {},
            success: event.success !== false,
            durationMs: event.duration,
            timestamp: startEvent.timestamp
          });
          toolStarts.delete(key);
        } else {
          // Orphaned finish event - still record it
          telemetry.toolCalls.push({
            toolName: event.tool,
            args: {},
            success: event.success !== false,
            durationMs: event.duration,
            timestamp: event.timestamp
          });
        }
      }
    }

    // Add any unmatched start events
    for (const startEvent of toolStarts.values()) {
      if (startEvent.tool) {
        telemetry.toolCalls.push({
          toolName: startEvent.tool,
          args: startEvent.args || {},
          success: false, // Assume failed since no finish event
          timestamp: startEvent.timestamp
        });
      }
    }

    // Extract Amp version from output if possible
    const versionMatch = rawOutput.match(/amp\s+(?:version\s+)?v?(\d+\.\d+\.\d+)/i);
    if (versionMatch) {
      telemetry.ampVersion = versionMatch[1];
    }

    return telemetry;
  }

  private safeParseJSON(str: string): Record<string, any> {
    try {
      return JSON.parse(str);
    } catch {
      return {};
    }
  }
}

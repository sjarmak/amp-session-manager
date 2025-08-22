/**
 * Enhanced Amp Debug Log Parser
 *
 * Based on the proven parsing logic from amp_runner.py, this parser
 * extracts tool calls, token usage, and performance metrics from
 * Amp CLI debug logs with higher accuracy.
 */

import type { AmpTelemetry } from "@ampsm/types";
import { readFileSync } from "fs";

export interface ParsedDebugLogs {
  tool_calls: Array<{
    tool_id?: string;
    name?: string;
    arguments?: Record<string, any>;
  }>;
  token_usage: {
    input_tokens?: number;
    output_tokens?: number;
  };
  perf: {
    inferenceDuration?: number;
    tokensPerSecond?: number;
    outputTokens?: number;
  };
}

export interface ThreadToolMapping {
  [toolId: string]: string;
}

export class EnhancedDebugParser {
  /**
   * Parse Amp debug logs to extract structured data.
   * This matches the proven logic from amp_runner.py.
   */
  static parseAmpDebugLogs(logPath: string): ParsedDebugLogs {
    const tool_calls: Array<{
      tool_id?: string;
      name?: string;
      arguments?: Record<string, any>;
    }> = [];

    // Aggregate token usage across all ChatCompletion responses
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let perf: {
      inferenceDuration?: number;
      tokensPerSecond?: number;
      outputTokens?: number;
    } = {};

    // Maps internal toolId → {name, args}
    const pending: Record<string, { tool_id: string; name?: string; arguments?: any; completed?: boolean }> = {};
    
    // Track the most recent tool name from permission events
    let lastToolName: string | null = null;

    // Helper function to normalize log lines into kind and payload
    const normalise = (line: any) => {
      const kind = line.name || line.event || line.type || 
                   (line.role === "tool" ? "tool_result" : "") || "";
      const msg = typeof line.message === "string" ? this.safeParseJSON(line.message) : line.message;
      return { kind, msg };
    };

    try {
      const content = readFileSync(logPath, "utf8");
      const lines = content.split("\n");
      console.log(`[EnhancedDebugParser] Processing ${lines.length} lines from debug log`);

      for (const raw of lines) {
        if (!raw.trim()) continue;

        try {
          const j = JSON.parse(raw.trim());
          const { kind, msg } = normalise(j);
          
          // Debug logging for tool-related events
          if (j.name && (j.name.includes('tool') || j.name.includes('Tool') || j.name.includes('invoke') || j.name.includes('Invoke'))) {
            console.log(`[EnhancedDebugParser] DEBUG: Found tool-related event:`, { name: j.name, kind, hasMessage: !!j.message, messagePreview: typeof j.message === 'string' ? j.message.substring(0, 100) : typeof j.message });
          }
          
          // Look for events that might contain actual tool names (Read, Grep, create_file, etc.)
          if (j.message && typeof j.message === 'string' && (j.message.includes('Read') || j.message.includes('Grep') || j.message.includes('create_file') || j.message.includes('edit_file') || j.message.includes('list_directory'))) {
            console.log(`[EnhancedDebugParser] DEBUG: Found event with tool name in message:`, { name: j.name, messagePreview: j.message.substring(0, 150) });
            
            // Extract tool name from permission check messages
            const toolCheckMatch = j.message.match(/Tool (\w+) - checking permissions/);
            if (toolCheckMatch) {
              lastToolName = toolCheckMatch[1];
              console.log(`[EnhancedDebugParser] Captured tool name: ${lastToolName}`);
            }
          }

          // --- token usage aggregation (sum all ChatCompletion responses) ---
          if ("input_tokens" in j && "output_tokens" in j) {
            // Add to running totals instead of replacing
            totalInputTokens += j.input_tokens || 0;
            totalOutputTokens += j.output_tokens || 0;
          }

          // Look for usage field in ChatCompletion responses
          if (j.usage && (j.usage.prompt_tokens || j.usage.completion_tokens)) {
            totalInputTokens += j.usage.prompt_tokens || 0;
            totalOutputTokens += j.usage.completion_tokens || 0;
          }

          // Look for OpenAI-style token usage anywhere in the log
          if (j.prompt_tokens && j.completion_tokens) {
            totalInputTokens += j.prompt_tokens;
            totalOutputTokens += j.completion_tokens;
          }

          // --- inference metrics -------------------------------
          if ("inferenceDuration" in j) {
            perf = {
              inferenceDuration: j.inferenceDuration,
              tokensPerSecond: j.tokensPerSecond,
              outputTokens: j.outputTokens,
            };
          }

          // --- tool invocation flow ----------------------------
          // 1. LLM decides to call a tool → "invokeTool" line (matches amp_runner.py logic)
          if (j.name === "invokeTool") {
            const message = j.message || "";
            const tool_id = message.split(",")[0].trim();
            pending[tool_id] = { 
              tool_id,
              name: lastToolName || undefined // Use the most recent tool name from permission events
            };
            console.log(`[EnhancedDebugParser] Found invokeTool with ID: ${tool_id}, assigned tool name: ${lastToolName}`);
            // Reset lastToolName after use
            lastToolName = null;
          }

          // 2. Handle ChatML-delta single-line tool call format
          if (j.name && j.arguments && !j.tool && !j.function_call && !j.tool_calls) {
            const toolData = {
              tool_id: j.id || `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              name: j.name,
              arguments: j.arguments
            };
            console.log(`[EnhancedDebugParser] Found tool via ChatML format: ${j.name}`);
            tool_calls.push(toolData);
          }

          // 3. Handle new tool_calls format (post-2024-02-15)
          if (j.tool_calls && Array.isArray(j.tool_calls)) {
            for (const toolCall of j.tool_calls) {
              if (toolCall.type === "function" && toolCall.function) {
                const toolData = {
                  tool_id: toolCall.id || `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                  name: toolCall.function.name || "unknown",
                  arguments: typeof toolCall.function.arguments === 'string' 
                    ? this.safeParseJSON(toolCall.function.arguments)
                    : (toolCall.function.arguments || {}),
                };
                console.log(`[EnhancedDebugParser] Found tool via tool_calls format: ${toolCall.function.name}`);
                tool_calls.push(toolData);
              }
            }
          }

          // 4. Handle modern tool call completion - both amp_runner.py format and new format
          if (j.name === "toolCall" || j.name === "toolCallCompleted") {
            try {
              const payload = JSON.parse(j.message);
              const t_id = payload.toolId || payload.id;
              if (t_id && t_id in pending) {
                // Update the pending tool call with name and arguments (matches amp_runner.py line 237-239)
                pending[t_id].name = payload.name || "unknown";
                pending[t_id].arguments = payload.arguments || {};
                console.log(`[EnhancedDebugParser] Completed pending tool call: ${payload.name} (ID: ${t_id})`);
                tool_calls.push(pending[t_id]);
                delete pending[t_id];
              }
            } catch (parseError) {
              // Skip if message can't be parsed as JSON
            }
          }

          // 5. Handle new tool completion format: handleThreadDelta(tool:data, TOOL_ID, done)
          if (j.name && j.name.includes('handleThreadDelta(tool:data,') && j.name.includes(', done)')) {
            // Extract tool ID from name like "handleThreadDelta(tool:data, toolu_01XXX, done)"
            const toolIdMatch = j.name.match(/handleThreadDelta\(tool:data,\s*([^,]+),\s*done\)/);
            if (toolIdMatch) {
              const t_id = toolIdMatch[1].trim();
              if (t_id && t_id in pending) {
                // We need to look at the message to get the actual tool info
                // For now, let's see if we can extract tool name from some other event
                console.log(`[EnhancedDebugParser] Found tool completion for ${t_id}, message:`, j.message);
                
                // Mark this tool as completed but we still need to find the tool name
                // This might come from a different event, so let's keep the pending entry but mark it as completed
                pending[t_id].completed = true;
              }
            }
          }

          // 5. Detect file operations directly
          if (["create_file", "edit_file", "delete_file"].includes(kind)) {
            const toolCall = {
              tool_id: `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              name: kind,
              arguments: { path: j.path, ...(j.content ? { content: j.content } : {}) }
            };
            console.log(`[EnhancedDebugParser] Found file operation: ${kind} (${j.path})`);
            tool_calls.push(toolCall);
          }
        } catch {
          // Check for plain-text file operations in Amp output
          if (/^created\s+\[.*\]|^Created\s+\[.*\]/i.test(raw)) {
            // Extract filename from markdown link like "Created [README.md](file://...)"
            const fileMatch = raw.match(/\[([^\]]+)\]/);
            const filename = fileMatch ? fileMatch[1] : 'unknown';
            const toolCall = {
              tool_id: `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              name: "create_file",
              arguments: { path: filename, line: raw.trim() }
            };
            console.log(`[EnhancedDebugParser] Found plain-text file creation: ${filename} (${raw.trim().substring(0, 100)}...)`);
            tool_calls.push(toolCall);
          } else if (/^edited\s+\[.*\]|^Edited\s+\[.*\]/i.test(raw)) {
            // Extract filename from markdown link like "Edited [file.js](file://...)"
            const fileMatch = raw.match(/\[([^\]]+)\]/);
            const filename = fileMatch ? fileMatch[1] : 'unknown';
            const toolCall = {
              tool_id: `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              name: "edit_file",
              arguments: { path: filename, line: raw.trim() }
            };
            console.log(`[EnhancedDebugParser] Found plain-text file edit: ${filename} (${raw.trim().substring(0, 100)}...)`);
            tool_calls.push(toolCall);
          }
        }
      }

      // Flush any remaining pending calls (like amp_runner.py line 247)
      console.log(`[EnhancedDebugParser] Flushing ${Object.keys(pending).length} pending calls`);
      tool_calls.push(...Object.values(pending));
      
      console.log(`[EnhancedDebugParser] Total tool calls found: ${tool_calls.length}`);
      if (tool_calls.length > 0) {
        console.log(`[EnhancedDebugParser] Tool names: ${tool_calls.map(t => t.name || 'unnamed').join(', ')}`);
      }
    } catch (error) {
      console.warn("Failed to parse debug log:", error);
    }

    return {
      tool_calls,
      token_usage: {
        input_tokens: totalInputTokens,
        output_tokens: totalOutputTokens,
      },
      perf,
    };
  }

  private static safeParseJSON(str: string): Record<string, any> {
    try {
      return JSON.parse(str);
    } catch {
      return {};
    }
  }

  /**
   * Extract thread ID from Amp debug logs
   */
  static extractThreadId(logPath: string): string | null {
    try {
      const content = readFileSync(logPath, "utf8");
      const lines = content.split("\n");

      for (const raw of lines) {
        if (!raw.trim()) continue;

        try {
          const j = JSON.parse(raw.trim());

          // Look for thread ID in various log formats
          if (j.threadId) {
            return j.threadId;
          }
          if (j.thread_id) {
            return j.thread_id;
          }

          // Sometimes it's in the message
          const message = j.message || "";
          if (message.toLowerCase().includes("thread")) {
            // Extract thread ID from message like "Thread T-abc123"
            const match = message.match(/T-[a-f0-9-]+/);
            if (match) {
              return match[0];
            }
          }
        } catch {
          continue;
        }
      }
    } catch (error) {
      console.warn("Failed to extract thread ID:", error);
    }

    return null;
  }

  /**
   * Convert parsed debug logs to AmpTelemetry format
   */
  static convertToTelemetry(
    parsed: ParsedDebugLogs,
    exitCode: number = 0
  ): AmpTelemetry {
    // Convert tool calls to expected format
    const toolCalls = parsed.tool_calls.map((toolCall) => {
      const toolName = toolCall.name || "unknown";
      if (toolName === "unknown") {
        console.warn(`[EnhancedDebugParser] Tool call with unknown name found:`, {
          toolCall,
          id: toolCall.tool_id
        });
      }
      return {
        toolName,
        timestamp: new Date().toISOString(),
        args: toolCall.arguments || {},
        durationMs: 0, // Not available in debug logs
        success: true, // Assume success unless we detect failure
      };
    });

    // Calculate total tokens
    const inputTokens = parsed.token_usage.input_tokens || 0;
    const outputTokens =
      parsed.token_usage.output_tokens || parsed.perf.outputTokens || 0;
    const totalTokens = inputTokens + outputTokens;

    return {
      exitCode,
      promptTokens: inputTokens,
      completionTokens: outputTokens,
      totalTokens,
      model: "anthropic/claude-sonnet-4-20250514", // Default, could be extracted from logs
      ampVersion: "1.0.0", // Could be extracted from logs
      toolCalls,
    };
  }

  /**
   * Enhanced parsing that combines debug logs with fallback to text parsing
   */
  static parseWithFallback(
    debugLogPath: string | null,
    textOutput: string,
    exitCode: number = 0
  ): AmpTelemetry {
    // Try debug log parsing first
    if (debugLogPath) {
      try {
        const parsed = this.parseAmpDebugLogs(debugLogPath);

        // If we got good data from debug logs, use it
        if (
          parsed.tool_calls.length > 0 ||
          parsed.token_usage.input_tokens ||
          parsed.token_usage.output_tokens
        ) {
          const telemetry = this.convertToTelemetry(parsed, exitCode);
          
          // Also check text output for file operations that might have been missed
          console.log(`[EnhancedDebugParser] Checking text output for file operations:`, textOutput.substring(0, 200));
          const textFileCalls = this.extractFileOperationsFromText(textOutput);
          if (textFileCalls.length > 0) {
            console.log(`[EnhancedDebugParser] Adding ${textFileCalls.length} file operations from text output`);
            telemetry.toolCalls.push(...textFileCalls);
          } else {
            console.log(`[EnhancedDebugParser] No file operations found in text output`);
          }
          
          console.log("Successfully parsed telemetry from debug logs:", {
            toolCalls: telemetry.toolCalls.length,
            tokens: telemetry.totalTokens,
            inputTokens: telemetry.promptTokens,
            outputTokens: telemetry.completionTokens,
          });
          return telemetry;
        }
      } catch (error) {
        console.warn(
          "Debug log parsing failed, falling back to text parsing:",
          error
        );
      }
    }

    // Fallback to pattern matching on text output
    return this.parseTextOutput(textOutput, exitCode);
  }

  /**
   * Extract file operations from plain text output
   */
  private static extractFileOperationsFromText(output: string): Array<{
    toolName: string;
    timestamp: string;
    args: Record<string, any>;
    durationMs: number;
    success: boolean;
  }> {
    const toolCalls: Array<{
      toolName: string;
      timestamp: string;
      args: Record<string, any>;
      durationMs: number;
      success: boolean;
    }> = [];

    const lines = output.split('\n');
    for (const line of lines) {
      // Match both "Created [file]" and "Created a README" patterns
      if (/^created\s+(\[.*\]|a?\s*\w+)|^Created\s+(\[.*\]|a?\s*\w+)/i.test(line)) {
        // Try to extract filename from markdown link first: "Created [README.md](file://...)"
        const markdownMatch = line.match(/\[([^\]]+)\]/);
        let filename = 'unknown';
        
        if (markdownMatch) {
          filename = markdownMatch[1];
        } else {
          // Extract from patterns like "Created a README" or "Created README.md"
          const textMatch = line.match(/^Created\s+(?:a\s+)?(\w+(?:\.\w+)?)/i);
          if (textMatch) {
            filename = textMatch[1];
          }
        }
        
        toolCalls.push({
          toolName: "create_file",
          timestamp: new Date().toISOString(),
          args: { path: filename, line: line.trim() },
          durationMs: 0,
          success: true,
        });
        console.log(`[EnhancedDebugParser] Found plain-text file creation: ${filename}`);
      } else if (/^edited\s+(\[.*\]|a?\s*\w+)|^Edited\s+(\[.*\]|a?\s*\w+)/i.test(line)) {
        // Similar logic for edits
        const markdownMatch = line.match(/\[([^\]]+)\]/);
        let filename = 'unknown';
        
        if (markdownMatch) {
          filename = markdownMatch[1];
        } else {
          const textMatch = line.match(/^Edited\s+(?:a\s+)?(\w+(?:\.\w+)?)/i);
          if (textMatch) {
            filename = textMatch[1];
          }
        }
        
        toolCalls.push({
          toolName: "edit_file",
          timestamp: new Date().toISOString(),
          args: { path: filename, line: line.trim() },
          durationMs: 0,
          success: true,
        });
        console.log(`[EnhancedDebugParser] Found plain-text file edit: ${filename}`);
      }
    }

    return toolCalls;
  }

  /**
   * Fallback text parsing using regex patterns (similar to existing TelemetryParser)
   */
  private static parseTextOutput(
    output: string,
    exitCode: number
  ): AmpTelemetry {
    const toolCalls: any[] = [];
    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;

    // Extract token usage using patterns
    const tokenPatterns = [
      /(\d+) prompt \+ (\d+) completion = (\d+) tokens/,
      /Input tokens: (\d+), Output tokens: (\d+)/,
      /Tokens: (\d+)/,
    ];

    for (const pattern of tokenPatterns) {
      const match = output.match(pattern);
      if (match) {
        if (pattern.source.includes("prompt")) {
          promptTokens = parseInt(match[1], 10);
          completionTokens = parseInt(match[2], 10);
          totalTokens = parseInt(match[3], 10);
        } else if (pattern.source.includes("Input")) {
          promptTokens = parseInt(match[1], 10);
          completionTokens = parseInt(match[2], 10);
          totalTokens = promptTokens + completionTokens;
        } else {
          totalTokens = parseInt(match[1], 10);
        }
        break;
      }
    }

    // Basic tool detection from text patterns
    const toolPatterns = [
      { pattern: /reading.*file/i, tool: "Read" },
      { pattern: /searching.*for/i, tool: "Grep" },
      { pattern: /found.*files/i, tool: "glob" },
      { pattern: /creating.*file/i, tool: "create_file" },
      { pattern: /editing.*file/i, tool: "edit_file" },
    ];

    for (const { pattern, tool } of toolPatterns) {
      if (pattern.test(output)) {
        toolCalls.push({
          toolName: tool,
          timestamp: new Date().toISOString(),
          args: {},
          durationMs: 0,
          success: true,
        });
      }
    }

    console.log("Fallback text parsing extracted:", {
      toolCalls: toolCalls.length,
      tokens: totalTokens,
      inputTokens: promptTokens,
      outputTokens: completionTokens,
    });

    return {
      exitCode,
      promptTokens,
      completionTokens,
      totalTokens,
      model: "anthropic/claude-sonnet-4-20250514",
      ampVersion: "1.0.0",
      toolCalls,
    };
  }
}

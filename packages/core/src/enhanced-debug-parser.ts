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
    const pending: Record<string, { tool_id: string }> = {};

    try {
      const content = readFileSync(logPath, "utf8");
      const lines = content.split("\n");

      for (const raw of lines) {
        if (!raw.trim()) continue;

        try {
          const j = JSON.parse(raw.trim());

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
            pending[tool_id] = { tool_id };
            console.log(`[EnhancedDebugParser] Found invokeTool with ID: ${tool_id}`);
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

          // 4. Handle legacy toolCall messages (matches amp_runner.py exactly)
          if (j.name === "toolCall" || j.name === "toolCallCompleted") {
            try {
              const payload = JSON.parse(j.message);
              const t_id = payload.toolId || payload.id;
              if (t_id && t_id in pending) {
                // Complete the pending tool call
                const completedCall = {
                  tool_id: t_id,
                  name: payload.name || "unknown",
                  arguments: payload.arguments || {},
                };
                console.log(`[EnhancedDebugParser] Completed pending tool call: ${payload.name} (ID: ${t_id})`);
                tool_calls.push(completedCall);
                delete pending[t_id];
              } else if (payload.name) {
                // Handle case where we don't have pending toolId but have a tool name
                const toolCall = {
                  tool_id: t_id || `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                  name: payload.name,
                  arguments: payload.arguments || {},
                };
                console.log(`[EnhancedDebugParser] Found direct tool call: ${payload.name}`);
                tool_calls.push(toolCall);
              }
            } catch (error) {
              console.log(`[EnhancedDebugParser] Failed to parse toolCall message: ${error}`);
            }
          }
        } catch {
          // Skip non-JSON lines
          continue;
        }
      }

      // Flush any partially-filled calls (matches amp_runner.py line 247)
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

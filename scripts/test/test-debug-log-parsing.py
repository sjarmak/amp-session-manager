#!/usr/bin/env python3
"""
Test the debug log parsing logic with mock data to verify it works correctly.
"""

import json
import tempfile
import os
from pathlib import Path


def create_mock_debug_log():
    """Create a mock debug log file that simulates real Amp output."""
    mock_log_entries = [
        {
            "level": "info",
            "message": "Starting Amp CLI.",
            "timestamp": "2025-08-22T11:24:34.950Z"
        },
        {
            "level": "debug",
            "message": "Selected primary model",
            "model": "anthropic/claude-sonnet-4-20250514",
            "timestamp": "2025-08-22T11:24:34.987Z"
        },
        {
            "level": "debug",
            "threadId": "T-abc123-def456-ghi789",
            "message": "Thread created",
            "timestamp": "2025-08-22T11:24:35.100Z"
        },
        {
            "level": "debug",
            "name": "invokeTool",
            "message": "toolu_abc123, invoking tool",
            "timestamp": "2025-08-22T11:24:35.200Z"
        },
        {
            "level": "debug",
            "name": "toolCall",
            "message": '{"name":"glob","arguments":{"filePattern":"**/*.py"},"toolId":"toolu_abc123"}',
            "timestamp": "2025-08-22T11:24:35.300Z"
        },
        {
            "level": "debug",
            "name": "invokeTool", 
            "message": "toolu_def456, invoking tool",
            "timestamp": "2025-08-22T11:24:35.400Z"
        },
        {
            "level": "debug",
            "name": "toolCall",
            "message": '{"name":"Read","arguments":{"path":"/Users/test/README.md"},"toolId":"toolu_def456"}',
            "timestamp": "2025-08-22T11:24:35.500Z"
        },
        {
            "level": "debug",
            "input_tokens": 1500,
            "output_tokens": 800,
            "message": "Token usage recorded",
            "timestamp": "2025-08-22T11:24:36.000Z"
        },
        {
            "level": "debug",
            "inferenceDuration": 2.5,
            "tokensPerSecond": 320,
            "outputTokens": 800,
            "message": "Performance metrics",
            "timestamp": "2025-08-22T11:24:36.100Z"
        }
    ]
    
    # Write to temporary file
    log_file = tempfile.mktemp(suffix='.log', prefix='mock_amp_')
    with open(log_file, 'w') as f:
        for entry in mock_log_entries:
            f.write(json.dumps(entry) + '\n')
    
    return log_file


def parse_amp_debug_logs(log_path: str):
    """Parse Amp debug logs to extract structured data."""
    tool_calls = []
    token_usage = {}
    perf = {}
    
    # Maps internal toolId → {name, args}
    pending = {}
    
    try:
        with open(log_path, 'r') as fp:
            for raw in fp:
                try:
                    j = json.loads(raw.strip())
                except json.JSONDecodeError:
                    continue
                
                # --- token usage --------------------------------------
                if "input_tokens" in j and "output_tokens" in j:
                    token_usage = {
                        "input_tokens": j["input_tokens"],
                        "output_tokens": j["output_tokens"]
                    }
                
                # --- inference metrics -------------------------------
                if "inferenceDuration" in j:
                    perf = {k: j[k] for k in
                            ("inferenceDuration", "tokensPerSecond", "outputTokens")
                            if k in j}
                
                # --- tool invocation flow ----------------------------
                # 1. LLM decides to call a tool → "invokeTool" line
                if j.get("name") == "invokeTool":
                    message = j.get("message", "")
                    tool_id = message.split(",")[0].strip()
                    pending[tool_id] = {"tool_id": tool_id}
                
                # 2. A later log entry contains the concrete call:
                #    {"name":"toolCall", "message":"{\"name\":\"Grep\", \"arguments\":{...}, \"toolId\":\"toolu_abc\"}"}
                if j.get("name") in ("toolCall", "toolCallCompleted"):
                    try:
                        payload = json.loads(j["message"])
                        t_id = payload.get("toolId") or payload.get("id")
                        if t_id and t_id in pending:
                            pending[t_id]["name"] = payload.get("name", "unknown")
                            pending[t_id]["arguments"] = payload.get("arguments", {})
                            tool_calls.append(pending.pop(t_id))
                    except Exception:
                        pass
    except Exception as e:
        print(f"Error reading log file: {e}")
    
    # Flush any partially-filled calls
    tool_calls.extend(pending.values())
    
    return {
        "tool_calls": tool_calls,
        "token_usage": token_usage,
        "perf": perf
    }


def extract_thread_id(log_path: str):
    """Extract thread ID from Amp debug logs."""
    try:
        with open(log_path, 'r') as fp:
            for raw in fp:
                try:
                    j = json.loads(raw.strip())
                    # Look for thread ID in various log formats
                    if "threadId" in j:
                        return j["threadId"]
                    if "thread_id" in j:
                        return j["thread_id"]
                    # Sometimes it's in the message
                    message = j.get("message", "")
                    if "thread" in message.lower():
                        # Extract thread ID from message like "Thread T-abc123"
                        import re
                        match = re.search(r'T-[a-f0-9-]+', message)
                        if match:
                            return match.group(0)
                except json.JSONDecodeError:
                    continue
    except Exception:
        pass
    return None


def main():
    """Test the debug log parsing with mock data."""
    print("Testing Amp debug log parsing with mock data...")
    
    # Create mock debug log
    log_file = create_mock_debug_log()
    print(f"Created mock log file: {log_file}")
    
    try:
        # Test parsing
        parsed = parse_amp_debug_logs(log_file)
        thread_id = extract_thread_id(log_file)
        
        # Display results
        print(f"\n=== PARSING RESULTS ===")
        print(f"Thread ID: {thread_id}")
        print(f"Tool calls found: {len(parsed['tool_calls'])}")
        
        for i, tool_call in enumerate(parsed['tool_calls']):
            print(f"  Tool {i+1}:")
            print(f"    - Name: {tool_call.get('name', 'unknown')}")
            print(f"    - Tool ID: {tool_call.get('tool_id', 'N/A')}")
            print(f"    - Arguments: {tool_call.get('arguments', {})}")
        
        print(f"\nToken usage: {parsed['token_usage']}")
        print(f"Performance metrics: {parsed['perf']}")
        
        # Show raw log content for verification
        print(f"\n=== RAW LOG CONTENT ===")
        with open(log_file, 'r') as f:
            for i, line in enumerate(f.readlines(), 1):
                print(f"{i:2d}: {line.strip()}")
        
        # Test success criteria
        success = (
            thread_id is not None and
            len(parsed['tool_calls']) >= 2 and
            parsed['token_usage'] and
            parsed['perf']
        )
        
        print(f"\n=== TEST RESULT ===")
        print(f"✓ Test {'PASSED' if success else 'FAILED'}")
        
        if success:
            print("✓ Successfully extracted thread ID, tool calls, token usage, and performance metrics")
        else:
            print("✗ Some components were not extracted correctly")
            
    finally:
        # Clean up
        try:
            os.unlink(log_file)
        except:
            pass


if __name__ == "__main__":
    main()

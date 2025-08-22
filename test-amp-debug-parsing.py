#!/usr/bin/env python3
"""
Test script to verify Amp debug log parsing functionality.
Tests the logic from amp_runner.py to extract tool calls, token usage, and file modifications.
"""

import os
import json
import time
import tempfile
import subprocess
from pathlib import Path
from typing import Dict, Any, List, TypedDict


class ParsedLogs(TypedDict):
    """Structure for parsed Amp debug logs."""
    tool_calls: List[Dict[str, Any]]
    token_usage: Dict[str, int]
    perf: Dict[str, Any]


def parse_amp_debug_logs(log_path: str) -> ParsedLogs:
    """Parse Amp debug logs to extract structured data."""
    tool_calls: List[Dict[str, Any]] = []
    token_usage: Dict[str, int] = {}
    perf: Dict[str, Any] = {}
    
    # Maps internal toolId → {name, args}
    pending: Dict[str, Dict[str, Any]] = {}
    
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
    
    return ParsedLogs(
        tool_calls=tool_calls,
        token_usage=token_usage,
        perf=perf
    )


def extract_thread_id(log_path: str) -> str:
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


def run_test_amp_command(prompt: str) -> Dict[str, Any]:
    """Run an Amp command with debug logging and parse results."""
    print(f"\nTesting prompt: '{prompt[:50]}...'")
    
    # Create temporary log file
    log_file = tempfile.mktemp(suffix='.log', prefix='amp_test_')
    print(f"Debug log file: {log_file}")
    
    # Build amp command with maximum logging
    cmd = ["amp", "--dangerously-allow-all", "-x", "--log-level", "debug", "--log-file", log_file]
    
    start_time = time.time()
    
    try:
        # Execute amp command
        result = subprocess.run(
            cmd,
            input=prompt,
            capture_output=True, 
            text=True, 
            timeout=120,  # 2 minute timeout
            cwd="."
        )
        
        latency = time.time() - start_time
        print(f"Command completed in {latency:.2f}s, return code: {result.returncode}")
        
        # Parse the debug logs
        parsed = parse_amp_debug_logs(log_file)
        thread_id = extract_thread_id(log_file)
        
        # Read raw log for debugging
        raw_log = ""
        try:
            with open(log_file, 'r') as f:
                raw_log = f.read()
        except:
            raw_log = "Could not read log file"
        
        # Clean up
        try:
            os.unlink(log_file)
        except:
            pass
        
        return {
            "prompt": prompt,
            "success": result.returncode == 0,
            "latency_s": round(latency, 2),
            "stdout": result.stdout,
            "stderr": result.stderr,
            "thread_id": thread_id,
            "parsed_logs": parsed,
            "raw_log_sample": raw_log[:2000] + "..." if len(raw_log) > 2000 else raw_log
        }
        
    except subprocess.TimeoutExpired:
        print("Command timed out")
        return {"error": "timeout"}
    except Exception as e:
        print(f"Error running command: {e}")
        return {"error": str(e)}


def main():
    """Run test cases to verify debug log parsing."""
    print("Testing Amp debug log parsing functionality...")
    
    # Test cases with different types of expected tool usage
    test_prompts = [
        "List all Python files in the current directory",
        "Search for the word 'TODO' in all files",
        "Read the README.md file",
        "What is the current directory structure?",
        "Check if there are any TypeScript files"
    ]
    
    results = []
    
    for prompt in test_prompts:
        result = run_test_amp_command(prompt)
        results.append(result)
        
        # Print summary
        if "parsed_logs" in result:
            logs = result["parsed_logs"]
            print(f"✓ Tool calls found: {len(logs['tool_calls'])}")
            for tool_call in logs['tool_calls']:
                print(f"  - {tool_call.get('name', 'unknown')} with args: {list(tool_call.get('arguments', {}).keys())}")
            
            if logs['token_usage']:
                print(f"✓ Token usage: {logs['token_usage']}")
            else:
                print("✗ No token usage found")
                
            if logs['perf']:
                print(f"✓ Performance metrics: {logs['perf']}")
            else:
                print("✗ No performance metrics found")
                
            if result['thread_id']:
                print(f"✓ Thread ID: {result['thread_id']}")
            else:
                print("✗ No thread ID found")
        else:
            print(f"✗ Failed to parse logs: {result.get('error', 'unknown error')}")
        
        print("-" * 50)
    
    # Summary
    successful_tests = len([r for r in results if r.get('success', False)])
    tool_calls_detected = len([r for r in results if r.get('parsed_logs', {}).get('tool_calls')])
    token_usage_detected = len([r for r in results if r.get('parsed_logs', {}).get('token_usage')])
    
    print(f"\nTest Summary:")
    print(f"✓ Successful commands: {successful_tests}/{len(test_prompts)}")
    print(f"✓ Tool calls detected: {tool_calls_detected}/{len(test_prompts)}")
    print(f"✓ Token usage detected: {token_usage_detected}/{len(test_prompts)}")
    
    # Save detailed results
    with open('amp-debug-test-results.json', 'w') as f:
        json.dump(results, f, indent=2)
    print(f"\nDetailed results saved to: amp-debug-test-results.json")


if __name__ == "__main__":
    main()

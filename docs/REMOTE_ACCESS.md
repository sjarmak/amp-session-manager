# Remote Access for Amp Session Manager

The Amp Session Manager supports remote access through SSH tunneling and a web interface, allowing you to run benchmarks and manage sessions from anywhere with proper authentication.

## Quick Start

### 1. Start the Server (on remote machine)

```bash
# Start server with remote access enabled
amp-sessions server --host 0.0.0.0 --port 7760

# Server will display an authentication token - save this!
# Example output:
# ✅ Server running at http://0.0.0.0:7760
# 🔑 Mobile API Token: abc123def456...
```

### 2. Create SSH Tunnel (from local machine)

```bash
# Forward remote port 7760 to local port 7760
ssh -L 7760:localhost:7760 user@remote-machine-ip

# For persistent connection:
ssh -N -L 7760:localhost:7760 user@remote-machine-ip
```

### 3. Access Web Interface

Open http://localhost:7760/benchmarks in your local browser and enter the API token.

## Remote Benchmark Workflows

### Running YAML Benchmarks

1. **Upload Config**: Place your benchmark YAML config on the remote machine
2. **Start via Web UI**: Navigate to `/benchmarks` and enter the full path
3. **Monitor Progress**: Results update automatically via the web interface

### Example YAML Config Path

```yaml
# On remote machine: /home/user/evals/my-benchmark.yaml
version: 1
name: "Remote Model Comparison"
models:
  default: { name: default }
  gpt5: { name: gpt-5, amp_args: ["--try-gpt5"] }
  alloy: { name: alloy, env: { AMP_ALLOY_MODE: "on" } }
suites:
  - id: smoke
    description: "Quick validation tests"
    cases:
      - id: test_readme
        repo: octocat/Hello-World
        prompt: "Add a comprehensive README.md"
        script_command: "test -f README.md"
```

## API Endpoints

### Benchmark Operations

- **POST** `/api/v1/benchmarks/run` - Start benchmark from YAML config
  ```json
  { "configPath": "/path/to/config.yaml" }
  ```

- **GET** `/api/v1/benchmarks/{id}` - Get benchmark status and results

### Session Operations

- **GET** `/api/v1/sessions` - List all sessions
- **POST** `/api/v1/sessions` - Create new session
- **POST** `/api/v1/sessions/{id}/iterate` - Run iteration
- **GET** `/api/v1/sessions/{id}/diff` - Get session diff

## Authentication

### Token Management

The server generates a token on first start, stored in:
```
~/.config/amp-session-manager/mobile_api_token
```

Use this token in API requests:
```bash
curl -H "Authorization: Bearer your-token-here" \
     http://localhost:7760/api/v1/sessions
```

## Security Considerations

### SSH Tunnel Security

- **Always use SSH tunnels** for remote access - never expose the server directly
- Use key-based SSH authentication
- Consider restricting SSH access with `authorized_keys` options

### Network Configuration

```bash
# Secure SSH tunnel with key auth
ssh -i ~/.ssh/amp-session-key \
    -L 7760:localhost:7760 \
    -o ServerAliveInterval=60 \
    user@remote-machine

# Mosh for unstable connections  
mosh --ssh="ssh -L 7760:localhost:7760" user@remote-machine
```

### Firewall Setup

Ensure the remote machine allows SSH (port 22) but does NOT expose port 7760 directly:

```bash
# Allow SSH only
sudo ufw allow ssh
sudo ufw deny 7760
```

## Advanced Usage

### Multiple Models in Parallel

The YAML config supports testing multiple models concurrently:

```yaml
models:
  claude: { name: claude-3.5-sonnet, amp_args: ["--model", "claude-3.5-sonnet"] }
  gpt4: { name: gpt-4, amp_args: ["--model", "gpt-4"] }
  alloy: { name: alloy, env: { AMP_ALLOY_MODE: "on" } }
```

### Remote SWE-bench Evaluation

```yaml
suites:
  - id: swebench_evaluation
    description: "Full SWE-bench evaluation"
    swebench_cases_dir: "/home/user/swebench-cases"
    max_iterations: 10
```

### Custom Test Cases

```yaml
suites:
  - id: custom_tests
    cases:
      - id: refactor_task
        repo: company/private-repo
        prompt: "Refactor the authentication system"
        follow_up_prompts:
          - "Add comprehensive error handling"
          - "Write integration tests"
        script_command: "npm test"
```

## Monitoring and Logs

### Real-time Logs

Access live session logs via SSE:
```bash
curl -H "Authorization: Bearer your-token" \
     "http://localhost:7760/api/v1/streams/sessions/session-id/logs"
```

### Results Export

Download benchmark results as JSON:
```bash
curl -H "Authorization: Bearer your-token" \
     "http://localhost:7760/api/v1/benchmarks/benchmark-id" > results.json
```

## Troubleshooting

### Connection Issues

1. **SSH tunnel disconnects**: Use `autossh` or mosh for persistent connections
2. **Authentication fails**: Regenerate token with `amp-sessions server --new-token`
3. **Port conflicts**: Change server port with `--port 8000`

### Performance

- **High latency**: Use compression in SSH tunnel: `ssh -C -L ...`
- **Large repositories**: Consider using local mirrors or shallow clones
- **Memory usage**: Monitor with `amp-sessions status --detailed`

# Using Local Amp Development Version

This document explains how to use a local development version of Amp instead of the production version for testing and development.

## Electron Desktop App

The easiest way to switch Amp versions is through the desktop app UI:

1. **Open Amp Settings**: Click the "Amp Configuration" button (grid icon) in the top-right corner of the desktop app
2. **Choose your mode**:
   - **Production**: Use the standard Amp from ampcode.com (default)
   - **Local Development Server**: Connect to your local Amp server at localhost:7002
   - **Local CLI Binary**: Use a locally built Amp CLI binary

3. **Configure paths**: 
   - For server mode: Enter server URL (default: `https://localhost:7002`)
   - For CLI mode: Enter path to binary (default: `/Users/sjarmak/amp/cli/dist/main.js`)

4. **Save settings**: Click "Save" to apply - the app will restart services automatically

## Quick Start

### Option 1: Local Development Server (Recommended)

1. **Start your local Amp development server**:
   ```bash
   cd /Users/sjarmak/amp
   pnpm dev  # Starts HTTPS server at localhost:7002
   ```

2. **Use with commands**:
   ```bash
   # Via global flag
   amp-sessions iterate <sessionId> --amp-server https://localhost:7002
   
   # For benchmarks
   amp-sessions benchmark config.yaml --amp-server https://localhost:7002
   ```

### Option 2: Local CLI Binary

1. **Build your local Amp CLI**:
   ```bash
   cd /Users/sjarmak/amp/cli
   pnpm build          # produces dist/main.js
   ```

2. **Set environment variable** (optional):
   ```bash
   export AMP_CLI_PATH=/Users/sjarmak/amp/cli/dist/main.js
   ```

3. **Use with commands**:
   ```bash
   # Via global flag
   amp-sessions iterate <sessionId> --amp-path /Users/sjarmak/amp/cli/dist/main.js
   
   # Via environment variable (if set above)
   amp-sessions iterate <sessionId>
   
   # For benchmarks
   amp-sessions benchmark config.yaml --amp /Users/sjarmak/amp/cli/dist/main.js
   ```

## Configuration Options

### CLI Commands

All CLI commands support global `--amp-path` and `--amp-server` flags:

```bash
# Local server (recommended for development)
amp-sessions iterate <sessionId> --amp-server https://localhost:7002

# Local CLI binary
amp-sessions iterate <sessionId> --amp-path /Users/sjarmak/amp/cli/dist/main.js

# Creating sessions
amp-sessions new --repo . --name test --prompt "Hello" --amp-server https://localhost:7002
amp-sessions benchmark config.yaml --amp-server https://localhost:7002
```

### Environment Variable

Set `AMP_CLI_PATH` to avoid repeating the path:

```bash
export AMP_CLI_PATH=/Users/sjarmak/amp/cli/dist/main.js
amp-sessions iterate <sessionId>  # Uses local CLI version automatically
```

### Evaluation YAML Files

Configure amp_cli_path or amp_server_url in your evaluation YAML files:

```yaml
defaults:
  # Option 1: Use local development server (recommended)
  amp_server_url: "https://localhost:7002"
  
  # Option 2: Use local CLI binary
  # amp_cli_path: "/Users/sjarmak/amp/cli/dist/main.js"
  
  # Option 3: Use production (default)
  # amp_cli_path: "production"

suites:
  - id: test_suite
    amp_server_url: "https://localhost:7002"  # Suite-level override
    cases:
      - id: test_case
        amp_cli_path: "/Users/sjarmak/amp/cli/dist/main.js"  # Case-level override
        repo: /path/to/repo
        prompt: "Test prompt"
```

## Priority Order

The system resolves the Amp configuration in this order (highest to lowest priority):

**Server URL (takes precedence over CLI path):**
1. Case-level `amp_server_url` in YAML
2. Suite-level `amp_server_url` in YAML
3. Defaults `amp_server_url` in YAML
4. `--amp-server` CLI flag

**CLI Path (used when no server URL is configured):**
1. Case-level `amp_cli_path` in YAML
2. Suite-level `amp_cli_path` in YAML  
3. Defaults `amp_cli_path` in YAML
4. `--amp-path` CLI flag
5. `AMP_CLI_PATH` environment variable
6. `AMP_BIN` environment variable (legacy)
7. `"amp"` (system PATH lookup)

## A/B Testing Example

Compare production vs development versions:

```bash
# Run with production
amp-sessions benchmark eval.yaml --amp production --output results-prod.json

# Run with local dev server
amp-sessions benchmark eval.yaml --amp-server https://localhost:7002 --output results-dev.json

# Run with local CLI binary
amp-sessions benchmark eval.yaml --amp /Users/sjarmak/amp/cli/dist/main.js --output results-cli.json

# Compare results
diff results-prod.json results-dev.json
```

## Troubleshooting

- **Permission denied**: Ensure the amp binary is executable: `chmod +x /Users/sjarmak/amp/cli/dist/main.js`
- **File not found**: Verify the path exists and build was successful
- **Wrong version**: Check which amp is being used: `which amp` vs your custom path

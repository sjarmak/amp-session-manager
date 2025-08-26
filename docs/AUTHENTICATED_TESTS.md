# Authenticated Amp E2E Tests

This document explains how to set up and run end-to-end tests with real, authenticated Amp CLI instances.

## Overview

The Amp Session Conductor includes comprehensive E2E tests that can run against real Amp CLI instances with proper authentication. These tests verify:

- Authentication flow with real Amp CLI
- Full iteration execution with telemetry capture  
- Token usage and model detection
- JSON logs parsing vs regex fallback
- Secret redaction in output
- Tool call recording

## Environment Configuration

### Required Environment Variables

1. **AMP_BIN** - Path to the Amp binary
   ```bash
   export AMP_BIN=/usr/local/bin/amp
   # or
   export AMP_BIN=/path/to/your/amp/binary
   ```

2. **Authentication** - Choose one approach:
   
   **Option A: Full auth command (preferred)**
   ```bash
   export AMP_AUTH_CMD='amp auth login --token "$AMP_TOKEN"'
   export AMP_TOKEN=your_actual_amp_token_here
   ```
   
   **Option B: Token only**
   ```bash
   export AMP_TOKEN=your_actual_amp_token_here
   ```

### Optional Environment Variables

3. **AMP_ARGS** - Extra arguments to pass to Amp CLI
   ```bash
   export AMP_ARGS="--verbose --timeout 300"
   ```

4. **AMP_ENABLE_JSONL** - Enable JSON logs parsing
   ```bash
   export AMP_ENABLE_JSONL=true
   ```

## Configuration via CLI

You can also configure these settings using the amp-sessions config command:

```bash
# Set Amp binary path
amp-sessions config set ampEnv.AMP_BIN /usr/local/bin/amp

# Set authentication command template
amp-sessions config set ampEnv.AMP_AUTH_CMD 'amp auth login --token "$AMP_TOKEN"'

# Set your token (will be redacted in display)
amp-sessions config set ampEnv.AMP_TOKEN your_token_here

# Enable JSON logs
amp-sessions config set ampEnv.AMP_ENABLE_JSONL true

# Set extra arguments
amp-sessions config set ampEnv.AMP_ARGS "--verbose --timeout 300"
```

View your configuration (secrets will be redacted):
```bash
amp-sessions config get
```

## Running Tests

### Quick Setup Verification

Before running tests, verify your setup:

```bash
amp-sessions verify-amp
```

This command will:
- Check if authentication environment is configured
- Test authentication with Amp CLI
- Verify version detection
- Run a quick smoke test iteration
- Show detailed diagnostics

### Running E2E Tests

Once your environment is configured:

```bash
# Run authenticated E2E tests
pnpm test:e2e-amp

# Or run from core package directly
pnpm --filter @ampsm/core test:e2e-amp
```

### Test Behavior

**When authentication is configured:**
- Tests authenticate with Amp CLI
- Create temporary git repository
- Run real Amp iterations with telemetry capture
- Verify token usage, model detection, tool calls
- Test secret redaction
- Clean up temporary resources

**When authentication is NOT configured:**
- Tests are automatically skipped with informative messages
- Regular unit tests still run normally
- No errors or failures reported

## Test Structure

### Main Test File
- `packages/core/test/e2e.amp.real.test.ts` - Main E2E test suite

### Supporting Files  
- `packages/core/test/amp-auth-harness.ts` - Authentication and configuration helpers

### Test Cases

1. **Authentication Test**
   - Verifies Amp CLI can be authenticated
   - Captures and displays Amp version

2. **Real Iteration Test**
   - Creates temporary git repo with worktree
   - Runs actual Amp iteration with model override (gpt-5)
   - Verifies commit creation, telemetry capture, token usage
   - Records tool calls and validates structure

3. **JSON Logs Test**
   - Tests both enabled and regex fallback parsing
   - Verifies telemetry extraction from different output formats

4. **Secret Redaction Test**
   - Ensures sensitive tokens never appear in outputs
   - Validates [REDACTED] markers are working

## Troubleshooting

### Common Issues

**"Authentication not configured"**
- Ensure AMP_BIN and either AMP_AUTH_CMD or AMP_TOKEN are set
- Run `amp-sessions verify-amp` for detailed diagnostics

**"Authentication failed"**
- Verify your AMP_TOKEN is valid and not expired
- Check that AMP_AUTH_CMD template is correct
- Try authenticating manually: `amp auth login --token "your_token"`

**"Version check failed"**
- Verify AMP_BIN points to valid executable
- Check PATH if using relative path
- Try running `$AMP_BIN --version` manually

**"No token telemetry captured"**
- Enable JSON logs: `export AMP_ENABLE_JSONL=true`
- Check if your Amp version supports `--jsonl-logs`
- Tests will still pass with regex parsing fallback

### Debug Output

The tests provide verbose output showing:
- Authentication status and Amp version
- Iteration results with token/model info
- Tool calls and their success/failure
- Commit information and changed files

### Manual Testing

You can also test authentication manually:

```bash
# Test basic auth
export AMP_BIN=/path/to/amp
export AMP_TOKEN=your_token
export AMP_AUTH_CMD='amp auth login --token "$AMP_TOKEN"'

# Run verification
amp-sessions verify-amp

# Test specific operations
$AMP_BIN --version
$AMP_TOKEN=$AMP_TOKEN amp auth login --token "$AMP_TOKEN"
```

## CI/CD Integration

### GitHub Actions (Optional)

Add a separate workflow for authenticated tests:

```yaml
name: Authenticated E2E Tests
on: 
  push:
    branches: [main]
  pull_request:

jobs:
  e2e-amp:
    runs-on: ubuntu-latest
    if: ${{ secrets.AMP_TOKEN != '' }}
    
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'pnpm'
      
      - name: Install dependencies  
        run: pnpm install
      
      - name: Run authenticated E2E tests
        env:
          AMP_BIN: amp
          AMP_AUTH_CMD: 'amp auth login --token "$AMP_TOKEN"'
          AMP_TOKEN: ${{ secrets.AMP_TOKEN }}
          AMP_ENABLE_JSONL: 'true'
        run: pnpm test:e2e-amp
```

### Local CI

For local development without secrets:

```bash
# Regular tests (no authentication required)
pnpm test

# Full build verification  
pnpm build && pnpm typecheck && pnpm test
```

## Security Notes

- **Never commit tokens** to git repositories
- Environment variables containing TOKEN, KEY, or SECRET are automatically redacted
- Config file storage also redacts secrets in display output
- Test outputs are scrubbed of sensitive information

## Contributing

When contributing authenticated test changes:

1. Ensure tests gracefully skip when environment not configured
2. Add appropriate timeout values for network operations  
3. Clean up temporary resources in afterAll hooks
4. Provide informative console output for debugging
5. Test both authenticated and non-authenticated scenarios

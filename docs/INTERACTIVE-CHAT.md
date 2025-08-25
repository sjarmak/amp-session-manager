# Interactive Chat Feature

The Interactive Chat feature enables real-time conversation with Amp within any session, providing a ChatGPT-like interface while preserving all session context and metrics.

## Overview

This feature adds an "Interactive" tab to the session detail view that allows users to:

1. **Start real-time chat sessions** with Amp using the session's worktree context
2. **Send and receive messages** in real-time with conversation continuity
3. **Preserve metrics tracking** - all tool calls, token usage, and streaming events are captured
4. **Maintain session context** - the chat operates within the session's Git worktree and thread history

## Architecture

### Backend Components

#### AmpAdapter Extensions (`packages/core/src/amp.ts`)

- **`startInteractive()`** - Creates long-lived streaming connection to amp CLI
- **`InteractiveHandle`** - Manages the connection with methods:
  - `send(message)` - Send message to Amp
  - `stop()` - Gracefully close connection
  - Event emitter for `streaming-event`, `state`, `error`

#### IPC Handlers (`apps/desktop/src/main.ts`)

- **`interactive:start`** - Start interactive session
- **`interactive:send`** - Send message to session
- **`interactive:stop`** - Stop interactive session
- **`interactive:getHistory`** - Retrieve message history

### Frontend Components

#### InteractiveTab (`apps/desktop/src/components/InteractiveTab.tsx`)

- Real-time chat interface with message bubbles
- Connection state indicator (connecting/ready/closed/error)
- Auto-scrolling message history
- Input handling with Enter to send, Shift+Enter for new line

#### SessionView Integration

- Added "Interactive" tab alongside "Overview" and "Actions"
- Preserves existing session management functionality
- Clean tab-based navigation

## Usage

### Starting an Interactive Session

1. Open any existing session in the desktop app
2. Click the "Interactive" tab
3. Click "Start Chat" to establish the connection
4. Wait for the "ready" status indicator
5. Type messages and press Enter to send

### Message Flow

1. **User types message** → sent via IPC to main process
2. **Main process** → forwards to amp CLI via stdin (JSON Lines format)
3. **Amp CLI** → processes message and responds via stdout (JSON format)
4. **Main process** → parses response and forwards to renderer via IPC
5. **UI updates** → new message appears in chat interface

### Metrics Integration

All interactive chat activity is captured in the existing metrics system:

- **Tool calls** made by Amp are tracked and stored
- **Token usage** from conversations is measured and aggregated
- **Stream events** are persisted to SQLite for analysis
- **Session metrics** update in real-time on the Overview tab

## Technical Details

### JSON Message Format

Input messages to amp CLI:
```json
{
  "type": "user",
  "message": {
    "role": "user", 
    "content": [{"type": "text", "text": "Your message here"}]
  }
}
```

Output messages from amp CLI:
```json
{
  "type": "assistant",
  "message": {
    "content": [{"type": "text", "text": "Amp's response"}],
    "usage": {"input_tokens": 10, "output_tokens": 20}
  },
  "session_id": "T-abc123"
}
```

### Connection States

- **`connecting`** - Establishing connection to amp CLI
- **`ready`** - Connected and ready to send/receive messages  
- **`closed`** - Connection gracefully closed
- **`error`** - Connection failed or encountered error

### Error Handling

- **Connection failures** - Graceful fallback with retry option
- **JSON parsing errors** - Logged but don't crash the session
- **CLI process errors** - Captured and displayed to user
- **Network issues** - Handled with appropriate error messages

## CLI Integration

The feature uses amp CLI's streaming capabilities:

```bash
# The backend spawns processes like this:
amp --execute --stream-json --stream-json-input

# For sessions with existing threads:
amp threads continue --execute --stream-json --stream-json-input

# With model overrides:
amp --execute --stream-json --stream-json-input --try-gpt5
```

## Testing

### Unit Tests (`packages/core/src/__tests__/amp-interactive.test.ts`)

- Tests `startInteractive()` method creation
- Validates JSON message formatting
- Tests streaming JSON processing 
- Verifies connection state management
- Tests graceful shutdown and error handling

### Integration Tests

- End-to-end streaming with fake amp CLI process
- Multi-message conversation flows
- Error recovery and reconnection scenarios

### Manual Testing

Use the test script to verify the implementation:

```bash
node test-interactive-feature.cjs
```

Then test in the desktop app:

```bash
pnpm run dev
# Open session → Interactive tab → Start Chat
```

## Future Enhancements

Potential improvements for future versions:

1. **Message persistence** - Save chat history across app restarts
2. **File attachments** - Send code files or images to Amp
3. **Voice input** - Speech-to-text for hands-free interaction
4. **Session branching** - Create new sessions from chat conversations
5. **Multi-session chat** - Switch between multiple active chats
6. **Export conversations** - Save chat history as markdown or JSON

## Troubleshooting

### Connection Issues

- Verify amp CLI is installed and authenticated
- Check session has valid worktree path
- Ensure no other amp processes are using the session

### Message Not Sending

- Verify connection state is "ready"
- Check for error messages in the UI
- Restart the chat session if needed

### Performance Issues

- Large message history may slow initial load
- Consider pagination for sessions with many messages
- Monitor memory usage with long-running sessions

## Security Considerations

- All messages go through amp CLI's existing security model
- No additional authentication required beyond amp setup
- Session isolation maintained via Git worktrees
- No message content logged outside existing amp telemetry

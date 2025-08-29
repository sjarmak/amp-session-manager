# Mobile Control Surface Setup

This guide explains how to use the Amp Session Manager from your phone after installing on your Mac.

## One-Time Mac Setup

1. Install and build everything:
```bash
pnpm install
pnpm build
```

2. Start the mobile control surface:
```bash
# Local only (loopback)
pnpm start:local

# LAN access (for phone on same WiFi/Tailscale)  
pnpm start:local:lan
```

The server will print:
- Local URL: `http://127.0.0.1:7760`
- LAN URL: `http://192.168.1.42:7760` (your Mac's IP)
- API token path: `~/.config/amp-session-manager/mobile_api_token`

## One-Time Phone Setup (30 seconds)

1. On your iPhone/Android, open the LAN URL from above
2. Paste the API token when prompted (from the token file)
3. Tap **Share → Add to Home Screen** to install the PWA
4. Now you can launch it like a native app

## Daily Workflow from Phone

### Start a New Session
1. Open the Amp Mobile app 
2. Tap **New Session**
3. **Pick Repo**: Local (scanned) or GitHub URL
4. **Choose Config**: Select saved configuration and base branch
5. **Add Prompt**: Enter initial instruction + toggle merge options
6. Tap **Create & Start**

### Continue an Existing Thread
1. From **Home**, tap any session card
2. Tap **"Open Thread"** to see conversation history
3. Scroll up to review recent context and changes
4. Type follow-up: *"Also add error handling"*
5. Tap **Send** and watch live response
6. Review in **Diff** tab, iterate again or **Merge**

### Monitor Progress
- **Live tab**: Streaming logs and status updates
- **Diff tab**: Touch-friendly HTML diff viewer  
- **Metrics tab**: Token usage, cost, timing per run
- **History tab**: Previous iterations and reports

### Quick Actions
- **Pull down** on Home to refresh sessions
- **Long press** session card for quick actions
- **Swipe** between tabs for navigation
- **Merge** from session header when satisfied

## Settings & Configuration

### Repo Access
- **Local repos**: Auto-scanned from your configured roots (~/code, ~/work, etc.)
- **GitHub repos**: Clone via your Mac's SSH keys/PAT to chosen directory
- **Add repo roots**: Settings → Repo Roots → Add folder path

### Network & Security  
- **LAN Mode**: Toggle to allow phone access (requires restart)
- **Token**: Rotate API token if needed
- **QR Code**: Generate QR for easy access on other devices

## Coexistence with Desktop

- **Shared state**: Mobile and desktop use the same database
- **Conflict prevention**: Can't start iteration if one is already running
- **Presence**: Shows "📱 Mobile active" / "🖥️ Desktop active" indicators
- **Real-time sync**: Changes appear immediately on both interfaces

## Troubleshooting

**Can't connect from phone**:
- Ensure Mac is awake and server running with `--lan` 
- Both devices on same WiFi or connected via Tailscale
- Check firewall settings on Mac

**No repos showing**:
- Go to Settings → Repo Roots → Add your code directory
- Tap Scan to refresh the repository list

**Thread out of sync**:
- Both mobile and desktop work from same SQLite database
- Refresh the page to sync latest state

## Commands Quick Reference

```bash
# Start for local use only
pnpm start:local

# Start with LAN access for phone
pnpm start:local:lan  

# Development mode (with hot reload)
pnpm server:dev  # Terminal 1
pnpm mobile      # Terminal 2

# Build for production
pnpm build
```

The mobile interface gives you full control over your Amp sessions from anywhere - perfect for starting work on the go, checking session status, continuing conversations, and staying connected to your coding workflows.

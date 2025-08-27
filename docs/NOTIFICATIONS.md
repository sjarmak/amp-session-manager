# Notification System

The Amp Session Orchestrator includes a comprehensive native notification system that keeps users informed about session status changes, test results, and important events that require attention.

## Features

### 🔔 Native Desktop Notifications
- **Cross-platform support**: Works on macOS, Windows, and Linux using Electron's Notification API
- **Click-to-focus**: Clicking notifications brings the app to the foreground
- **Action support**: Notifications can include actionable buttons (View Session, Resolve Conflicts, etc.)
- **Urgency levels**: Critical notifications (conflicts, failures) are marked as urgent

### ⚙️ Granular Settings Control
- **Master toggle**: Enable/disable all notifications globally
- **Per-type settings**: Control individual notification categories
- **Sound control**: Toggle notification sounds on/off
- **Auto-hide duration**: Customize how long notifications stay visible (3s, 5s, 10s, or persistent)

### 📱 Notification Types

| Type | When Triggered | Urgency | Actions |
|------|---------------|---------|---------|
| **Session Complete** | Session iteration finishes successfully | Normal | View Session |
| **Awaiting Input** | Session paused waiting for user attention | Urgent | View Session |
| **Merge Conflicts** | Git rebase/merge conflicts detected | Urgent | Resolve Conflicts, Abort Merge |
| **Test Results** | Test script execution completes | Normal/Urgent* | View Details |
| **Status Changes** | General session status updates | Normal | View Session |

*Test failures are marked as urgent

## Usage

### In the Desktop App

1. **Access Settings**: Click the gear icon in the top-right corner of the app
2. **Configure Preferences**: Toggle notification types, sound, and duration settings
3. **Test Notifications**: Use the "Test" buttons to preview each notification type

### Notification Actions

When notifications appear:
- **Click anywhere** on the notification to focus the app
- **Action buttons** (where available) perform specific actions:
  - "View Session" → Navigate to the session detail page
  - "Resolve Conflicts" → Open session in conflicts resolution mode
  - "View Details" → Show detailed information about test results

### Settings Reference

```typescript
interface NotificationSettings {
  enabled: boolean;          // Master enable/disable
  types: {
    sessionComplete: boolean;  // Session completion notifications
    awaitingInput: boolean;   // User attention required
    conflict: boolean;        // Merge/rebase conflicts
    testResults: boolean;     // Test script results
    statusChange: boolean;    // General status updates
  };
  sound: boolean;            // Play notification sound
  duration: number;          // Auto-hide after N milliseconds (0 = never)
}
```

## Implementation Details

### Architecture

The notification system consists of three main components:

1. **Core Notifier** (`packages/core/src/notifier.ts`)
   - Type-safe notification API
   - Settings management
   - Platform-agnostic notification dispatch

2. **Electron Integration** (`apps/desktop/src/main.ts`)
   - Native OS notification handling
   - Click event processing
   - Window focus management

3. **UI Settings** (`apps/desktop/src/components/NotificationSettingsModal.tsx`)
   - User-friendly settings interface
   - Real-time test functionality
   - Settings persistence

### API Reference

#### Core Notifier Methods

```typescript
// Basic notification
await notifier.notify(title: string, message: string, type?: 'info' | 'success' | 'warning' | 'error');

// Specialized notifications
await notifier.notifySessionComplete(sessionName: string);
await notifier.notifyAwaitingInput(sessionName: string);
await notifier.notifyConflict(sessionName: string);
await notifier.notifyTestResults(sessionName: string, passed: boolean, details?: string);
await notifier.notifyStatusChange(sessionName: string, status: string, details?: string);

// Settings management
notifier.setSettings(settings: Partial<NotificationSettings>);
const currentSettings = notifier.getSettings();

// Callback registration (Electron main process)
notifier.setCallback(async (options: NotificationOptions) => {
  // Handle notification display
});
```

#### Electron API (Renderer Process)

```typescript
// Get current settings
const settings = await window.electronAPI.notifications.getSettings();

// Update settings
await window.electronAPI.notifications.updateSettings(newSettings);

// Test notification
await window.electronAPI.notifications.test('sessionComplete');

// Listen for notification actions
window.electronAPI.notifications.onAction((action: string) => {
  // Handle action (e.g., 'view:session-name')
});
```

### Notification Flow

1. **Session Event** → Core component (WorktreeManager, etc.) detects event
2. **Notifier Call** → Event handler calls appropriate notifier method
3. **Settings Check** → Notifier validates settings and filters notification
4. **Callback Execution** → Electron main process receives notification
5. **OS Display** → Native notification appears with system styling
6. **User Interaction** → Click/action triggers IPC message to renderer
7. **App Response** → UI navigates or performs requested action

### Customization

#### Adding New Notification Types

1. **Extend NotificationSettings interface** in `notifier.ts`
2. **Add new method** to Notifier class
3. **Update settings UI** in NotificationSettingsModal.tsx
4. **Add test case** in `__tests__/notifier.test.ts`

#### Platform-Specific Behavior

- **macOS**: Notifications appear in Notification Center
- **Windows**: Notifications use Windows 10/11 toast system
- **Linux**: Uses libnotify or similar desktop notification system

### Testing

Run the notification test suite:

```bash
cd packages/core
pnpm test src/__tests__/notifier.test.ts
```

The tests cover:
- Basic notification functionality
- Settings management
- Type-specific filtering
- Callback integration
- Fallback behavior

### Troubleshooting

#### Notifications Not Appearing
1. Check system notification permissions for the app
2. Verify notification settings in the app (gear icon → notification settings)
3. Test notifications using the "Test" buttons in settings

#### Sound Not Playing
1. Ensure "Sound" toggle is enabled in notification settings
2. Check system volume and notification sound settings
3. Verify your OS allows notification sounds for the app

#### Settings Not Persisting
1. Settings are stored in memory during app runtime
2. For persistent settings, consider implementing storage to SQLite database
3. Settings reset on app restart (by design for current implementation)

## Future Enhancements

Potential improvements to consider:
- **Persistent settings storage** in SQLite database
- **Custom sound selection** for different notification types
- **Do Not Disturb mode** with time-based rules
- **Notification history** within the app
- **Email/webhook integration** for remote notifications
- **Notification grouping** to avoid spam during batch operations

# Amp Session Manager Mobile

A touch-friendly Progressive Web App (PWA) for managing Amp coding sessions and continuing threads from mobile devices.

## Features

### 📱 Mobile-First Design
- Touch-optimized interface with 44px minimum touch targets
- Pull-to-refresh functionality on all list views
- Swipe-friendly navigation between tabs
- Bottom navigation bar for easy thumb access
- Responsive design that works on all screen sizes

### ⚡ PWA Capabilities
- Add to Home Screen support for iOS and Android
- Offline capability with intelligent caching
- Service Worker for fast loading and offline access
- Native app-like experience
- iOS/Android app icon and splash screen support

### 🔄 Real-time Features
- Live session monitoring with Server-Sent Events (SSE)
- Optimistic UI updates for immediate feedback
- Automatic reconnection when connection is lost
- Real-time status updates for running sessions

### 🎨 User Experience
- Dark mode support with system preference detection
- Loading states and error boundaries
- Toast notifications for user feedback
- Smooth animations and transitions
- Keyboard-friendly for external keyboards

## Pages & Features

### Home (`/`)
- **Session List**: Cards showing session status, repository, and last activity
- **Status Indicators**: Color-coded chips for idle, running, awaiting-input, error, and done states  
- **Pull-to-Refresh**: Swipe down to refresh session data
- **Quick Actions**: Navigate to session details or create new sessions

### New Session (`/sessions/new`)
- **3-Step Wizard**: Repository picker → Configuration → Prompt
- **Repository Browser**: Browse local repositories or clone from GitHub
- **Configuration Presets**: Use saved configurations or create custom ones
- **Smart Defaults**: Intelligent form filling based on repository type

### Session Detail (`/sessions/[id]`)
- **Tabbed Interface**: Live, Diff, Metrics, and History tabs
- **Live Tab**: Real-time session activity and streaming logs
- **Diff Tab**: File-by-file diff viewer with syntax highlighting
- **Metrics Tab**: Token usage, cost tracking, and performance stats
- **History Tab**: Complete session iteration history

### Threads (`/threads`)
- **Thread List**: All conversation threads with Amp
- **Status Tracking**: Active, completed, and error states
- **Message Counts**: See conversation length at a glance
- **Model Information**: Which AI model was used for each thread

### Settings (`/settings`)
- **Theme Control**: Light, dark, or system preference
- **Server Configuration**: API endpoint and authentication
- **Repository Management**: Scan and manage repository roots
- **App Information**: Version, features, and installation guide

## API Integration

### Server Communication
- **Type-Safe API Client**: Full TypeScript support for all endpoints
- **React Query Integration**: Optimistic updates and intelligent caching
- **Error Handling**: Graceful degradation and retry logic
- **Offline Support**: Queue requests when offline, sync when online

### Supported Endpoints
```typescript
// Sessions
GET /api/v1/sessions           // List all sessions
POST /api/v1/sessions          // Create new session
GET /api/v1/sessions/:id       // Get session details
POST /api/v1/sessions/:id/iterate // Start iteration
POST /api/v1/sessions/:id/abort   // Stop session
POST /api/v1/sessions/:id/merge   // Merge to base branch
GET /api/v1/sessions/:id/diff     // Get session changes

// Threads  
GET /api/v1/threads            // List threads
GET /api/v1/threads/:id/messages // Get thread messages
POST /api/v1/threads/:id/messages // Add message

// Repositories
GET /api/v1/repos              // List repositories
POST /api/v1/repos/scan        // Scan for new repos
POST /api/v1/repos/clone       // Clone from GitHub

// Real-time
GET /api/v1/streams/threads/:id/logs // SSE stream
```

## Technology Stack

- **Framework**: Next.js 14 with App Router
- **Styling**: Tailwind CSS with mobile-first responsive design
- **State Management**: TanStack React Query for server state
- **PWA**: next-pwa with Workbox for service worker management
- **UI Components**: Custom components optimized for touch
- **Icons**: Lucide React for consistent iconography
- **Validation**: Zod for runtime type checking
- **Forms**: React Hook Form with resolver integration

## Installation & Development

### Prerequisites
- Node.js 18+ and pnpm
- Running Amp Session Manager server

### Development Setup
```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Start production server  
pnpm start
```

### Environment Configuration
Create `.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:3000
```

### PWA Installation
1. Open the app in a mobile browser
2. Look for "Add to Home Screen" in the browser menu
3. Follow the prompts to install
4. Access from your home screen like a native app

## Mobile-Specific Optimizations

### Touch Interface
- Minimum 44px touch targets for accessibility
- Visual feedback on touch interactions
- Swipe gestures for natural navigation
- Haptic feedback support (where available)

### Performance
- Aggressive caching strategy for static assets
- Lazy loading for non-critical components
- Optimized images and icons
- Minimal JavaScript bundle size

### Connectivity
- Graceful handling of poor network conditions
- Background sync when connection returns
- Clear offline/online status indicators
- Smart retry mechanisms

### Battery Life
- Efficient polling strategies
- Minimal background activity
- Optimized animations and transitions
- CPU-friendly operations

## Browser Support

- **iOS**: Safari 14+, Chrome 90+
- **Android**: Chrome 90+, Edge 90+, Firefox 88+
- **Desktop**: All modern browsers for development/testing

## Contributing

1. Follow the existing code style and patterns
2. Test on both iOS and Android devices
3. Ensure PWA features work correctly
4. Add proper TypeScript types
5. Include responsive design considerations

## Troubleshooting

### PWA Installation Issues
- Clear browser cache and cookies
- Ensure HTTPS (required for PWA features)
- Check that manifest.json is accessible
- Verify service worker registration

### Connection Problems
- Check API server is running and accessible
- Verify API_URL environment variable
- Check network connectivity
- Look for CORS issues in browser console

### Performance Issues
- Check React Query DevTools for excessive requests
- Monitor bundle size with webpack-bundle-analyzer
- Profile with React DevTools
- Test on slower devices and networks

## Architecture Notes

The mobile app is designed as a companion to the desktop application, not a replacement. It focuses on:

- **Monitoring**: Check session status and progress
- **Quick Actions**: Start new sessions, continue conversations
- **Review**: Examine diffs, metrics, and history
- **Mobility**: Access from anywhere with internet connection

For complex development tasks, the desktop application remains the primary interface.

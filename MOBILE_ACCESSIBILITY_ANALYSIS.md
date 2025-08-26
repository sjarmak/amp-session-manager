# Mobile Accessibility Analysis for Amp Session Manager

## Executive Summary

This analysis examines strategies for making the Amp Session Manager accessible on mobile devices while preserving full Git worktree and Amp CLI capabilities. After comprehensive evaluation of the current architecture and consultation with technical experts, the recommended approach is to evolve the existing desktop application into a **server-centric architecture with Progressive Web App (PWA) mobile access**.

## Current Architecture Assessment

### Strengths for Mobile Adaptation

The existing codebase is well-positioned for mobile accessibility:

- **Decoupled Core Engine**: `@ampsm/core` package has no Electron dependencies
- **Real-time Streaming**: AmpAdapter already emits streaming events via EventEmitter
- **Type Safety**: Shared TypeScript types across packages enable end-to-end type safety
- **Modular Design**: Clear separation between UI, business logic, and CLI interfaces
- **Streaming Telemetry**: Existing WebSocket-like capabilities through JSON streaming
- **Git Abstraction**: GitOps class encapsulates all Git operations

### Current Capabilities Analysis

**Desktop Application Features:**
- Electron + React UI with real-time session monitoring
- SQLite-based persistence for sessions and iterations
- Git worktree isolation for session management
- Interactive Amp streaming with telemetry parsing
- Visual diff review and timeline view
- Session squash/rebase workflows
- Cross-platform notifications
- Batch operations support

**CLI Interface Features:**
- Complete session CRUD operations
- Direct iteration management
- Automated squash and rebase workflows
- Batch processing capabilities
- Script integration for testing

## Mobile Access Requirements Analysis

### Essential Mobile Capabilities

Mobile users need access to:

1. **Session Monitoring**: View active sessions, status, and progress
2. **Iteration Control**: Trigger new iterations, respond to "awaiting input" prompts
3. **Real-time Streaming**: Live token usage, console output, and telemetry
4. **Diff Review**: Visual code changes with approval/rejection capability
5. **Session Lifecycle**: Squash, rebase, and merge operations
6. **Notifications**: Push alerts for session status changes
7. **Repository Access**: Work with both local and remote repositories

### Constraints and Limitations

Mobile platforms cannot directly support:
- Git binary execution and worktree creation
- Amp CLI process spawning
- File system access to local repositories
- SSH key management for Git operations
- Heavy computational tasks (large diff processing)

## Architecture Options Evaluation

### Option 1: Pure Mobile App (Not Recommended)
**Approach**: Native mobile app with embedded Git and Amp functionality
- ❌ Git binaries not available on mobile platforms
- ❌ SSH key restrictions in app sandboxes
- ❌ Limited file system access
- ❌ App store restrictions on binary execution
- ❌ High development complexity for minimal benefit

### Option 2: Desktop Remote Control (Quick Hack)
**Approach**: VNC/Tailscale GUI sharing of desktop application
- ⚠️ Poor mobile UX with desktop UI not optimized for touch
- ❌ Requires desktop to remain powered and connected
- ❌ Network dependency with high latency
- ❌ Limited offline capability

### Option 3: LAN-Only HTTP Server (Limited Scope)
**Approach**: Expose desktop app as local HTTP server
- ⚠️ Only works on same network as desktop
- ❌ Fails when traveling or working remotely
- ❌ Complex security and authentication setup
- ❌ Still requires desktop to be running

### Option 4: Server-Centric Architecture (Recommended)
**Approach**: Promote core engine to headless service with web/mobile clients
- ✅ Full Git and Amp capabilities preserved on server
- ✅ Mobile-optimized UI with responsive design
- ✅ Real-time streaming maintained via WebSocket
- ✅ 95% code reuse from existing TypeScript codebase
- ✅ Supports both local and remote Git workflows
- ✅ Scalable to multi-user scenarios
- ✅ Progressive enhancement path

## Recommended Solution: Server-Centric with PWA

### Architecture Overview

The recommended architecture separates execution (server) from presentation (mobile clients) while maintaining all existing functionality. See [Mobile Architecture Diagram](diagrams/mobile-architecture.mmd) for visual representation.

**Core Principles:**
- Keep execution engine where it can run Node + Git + Amp CLI
- Expose functionality through network API
- Mobile clients act as intelligent remote controls
- Maintain real-time streaming capabilities
- Preserve type safety across client-server boundary

### Technical Implementation Strategy

**API Layer Design:**
- REST endpoints for CRUD operations
- WebSocket streams for real-time telemetry
- tRPC for end-to-end type safety
- JWT-based authentication with GitHub OAuth
- Rate limiting and security middleware

**Mobile Client Options:**
1. **Progressive Web App (PWA)**: Installable web app with offline capabilities
2. **Native Wrappers**: Capacitor-based iOS/Android apps for app store distribution
3. **Responsive Web**: Mobile-optimized browser experience

**Data Flow:**
1. Mobile client sends session operation request
2. Server executes Git/Amp operations in worktree
3. Real-time progress streamed back via WebSocket
4. Client updates UI with live telemetry and results

### Git Repository Integration Strategies

#### Strategy 1: Server-Side Operations (Primary)
- Server clones repositories using deploy keys or GitHub App tokens
- Full Git worktree capabilities maintained
- Mobile clients trigger operations via API
- Supports complex merge/rebase scenarios
- Better security with tokens isolated on server

#### Strategy 2: Hybrid Local/Remote Support
- Local repositories: Server accesses filesystem directly (current behavior)
- Remote repositories: Server clones via HTTPS/SSH for operations
- Configuration flag: `provider=local|github|gitlab`
- Automatic PR creation for remote workflows

## Implementation Roadmap

### Phase 1: API Server Foundation (2-3 weeks)
**Objective**: Extract server package while maintaining desktop compatibility

**Key Deliverables:**
- `@ampsm/server` package with REST API + WebSocket
- Desktop app migration to use API instead of direct core access
- Backward compatibility maintained for CLI
- Core streaming telemetry forwarded to WebSocket clients

**Technical Details:**
```typescript
// API Endpoints
GET /api/sessions           // List sessions
POST /api/sessions          // Create session
GET /api/sessions/:id       // Get session details
POST /api/sessions/:id/iterate  // Run iteration
GET /api/sessions/:id/diff  // Get diff summary
POST /api/sessions/:id/squash   // Squash and rebase
WebSocket /api/stream/:id   // Real-time telemetry
```

### Phase 2: Mobile Web Interface (3-4 weeks)
**Objective**: Responsive web UI accessible on mobile browsers

**Key Deliverables:**
- `apps/web` package with React + Tailwind
- Mobile-first responsive design
- PWA capabilities (service worker, manifest)
- Real-time session monitoring via WebSocket
- Touch-optimized controls and gestures

### Phase 3: Authentication & Security (2 weeks)
**Objective**: Secure multi-user access with proper authorization

**Key Deliverables:**
- GitHub OAuth integration
- JWT-based authentication
- User-specific session filtering
- Repository access permission validation
- Rate limiting and audit logging

### Phase 4: Enhanced Git Integration (3 weeks)
**Objective**: Support for remote repository workflows

**Key Deliverables:**
- GitHub API integration for remote operations
- Automatic PR creation on session completion
- Repository provider abstraction
- Branch protection and merge policies
- Deploy key management

### Phase 5: Native App Distribution (2 weeks)
**Objective**: App store presence with native features

**Key Deliverables:**
- Capacitor wrapper for iOS/Android
- Native push notifications via FCM/APNs
- Biometric authentication
- App store deployment pipeline
- Deep linking for session sharing

## Security and Performance Considerations

### Security Measures
- **Authentication**: GitHub OAuth with fine-grained repository permissions
- **Authorization**: JWT tokens with session-specific scopes
- **Data Protection**: Repository tokens encrypted at rest
- **Network Security**: HTTPS/WSS only, CORS policies, input validation
- **Audit Trail**: Complete logging of Git operations and access patterns

### Performance Optimizations
- **Mobile**: Lazy loading, incremental diff updates, offline caching
- **Server**: Connection pooling, Git worktree cleanup, telemetry aggregation
- **Network**: Message batching, compression, delta updates for large diffs

### Scalability Planning
- **Database**: Migration path from SQLite to Postgres for multi-user
- **Infrastructure**: Docker containerization with volume persistence
- **Monitoring**: Health checks, performance metrics, error tracking

## Migration and Deployment Strategy

### Backward Compatibility
- Desktop application continues functioning unchanged
- CLI maintains direct core access for power users
- Optional server mode deployment
- Configuration-driven provider selection

### Deployment Options
1. **Self-Hosted**: Docker container with SQLite for individual use
2. **Team Server**: Shared Postgres instance for collaborative workflows
3. **Cloud Service**: Managed hosting option (future consideration)
4. **Hybrid Mode**: Local execution with cloud synchronization

### Risk Mitigation
- **Technical Risks**: Comprehensive integration testing, feature flags for rollout
- **User Experience**: Progressive enhancement, fallback modes
- **Performance**: Load testing, monitoring, gradual scaling
- **Security**: Penetration testing, secret management audit

## Success Metrics and Validation

### User Experience Targets
- Session creation time: < 30 seconds
- Real-time update latency: < 200ms
- Offline capability duration: 24+ hours
- Feature parity with desktop: 90%+
- Mobile Lighthouse PWA score: 90+

### Technical Performance Goals
- API response times: < 500ms (95th percentile)
- WebSocket connection stability: > 99%
- Mobile bundle size: < 2MB
- Database query performance: < 100ms average

## Conclusion and Next Steps

The server-centric architecture with PWA mobile access provides the optimal balance of functionality, user experience, and implementation complexity. This approach:

1. **Preserves Core Value**: All Git worktree and Amp CLI capabilities remain intact
2. **Enables Mobile Access**: Full-featured mobile experience without platform limitations
3. **Maximizes Code Reuse**: 95% of existing TypeScript codebase is reusable
4. **Provides Growth Path**: Natural evolution toward multi-user collaborative platform
5. **Maintains Flexibility**: Support for both local and remote repository workflows

**Immediate Action Items:**
1. Begin Phase 1 implementation with `@ampsm/server` package extraction
2. Set up development environment for API testing
3. Design responsive UI component library for mobile
4. Plan authentication integration with GitHub OAuth
5. Establish CI/CD pipeline for multi-platform deployment

The detailed implementation plan is available in [MOBILE_ROADMAP.md](MOBILE_ROADMAP.md) with specific tasks, timelines, and technical specifications for each phase.

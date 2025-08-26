# Mobile Access Roadmap

## Overview

This document outlines the plan to make Amp Session Manager accessible on mobile devices while maintaining full Git worktree and Amp CLI capabilities. The recommended approach is to evolve the current desktop application into a server-centric architecture with mobile web access.

## Current Architecture Analysis

**Strengths for Mobile Adaptation:**
- `@ampsm/core` package is already decoupled from Electron
- Real-time streaming telemetry via EventEmitter
- SQLite persistence with clear data models
- TypeScript types shared across packages
- Git operations abstracted in GitOps class
- AmpAdapter with streaming JSON support

**Mobile Access Requirements:**
- Session monitoring and control
- Real-time iteration streaming
- Diff review and approval
- Session lifecycle management (squash/rebase/merge)
- Push notifications for status changes

## Recommended Architecture: Server-Centric with PWA

```mermaid
graph TB
    subgraph "Mobile Clients"
        PWA[Progressive Web App]
        iOS[iOS Capacitor App]
        Android[Android Capacitor App]
    end
    
    subgraph "API Layer"
        Gateway[API Gateway]
        Auth[Authentication]
        WS[WebSocket Server]
    end
    
    subgraph "Existing Desktop"
        Electron[Electron App]
        CLI[amp-sessions CLI]
    end
    
    subgraph "Core Services"
        Server[@ampsm/server]
        Core[@ampsm/core]
        Store[SessionStore]
        Git[GitOps]
        Amp[AmpAdapter]
    end
    
    subgraph "Storage & Execution"
        DB[(SQLite/Postgres)]
        Worktrees[Git Worktrees]
        AmpCLI[Amp CLI]
    end
    
    PWA --> Gateway
    iOS --> Gateway
    Android --> Gateway
    Electron --> Gateway
    CLI --> Core
    
    Gateway --> Auth
    Gateway --> WS
    Gateway --> Server
    Server --> Core
    Core --> Store
    Core --> Git
    Core --> Amp
    
    Store --> DB
    Git --> Worktrees
    Amp --> AmpCLI
```

## Implementation Phases

### Phase 1: API Server Foundation (2-3 weeks)

**Goal:** Extract server package and maintain desktop app compatibility

**Tasks:**
- Create `@ampsm/server` package
- Implement REST API with tRPC for type safety:
  - `GET /api/sessions` - List all sessions
  - `POST /api/sessions` - Create new session
  - `GET /api/sessions/:id` - Get session details
  - `POST /api/sessions/:id/iterate` - Run iteration
  - `GET /api/sessions/:id/diff` - Get diff summary
  - `POST /api/sessions/:id/squash` - Squash and rebase
- Add WebSocket streaming for real-time telemetry
- Update Electron app to use API instead of direct core access
- Maintain CLI direct access for backwards compatibility

**New Packages:**
```
packages/
├── server/
│   ├── src/
│   │   ├── api/
│   │   │   ├── sessions.ts
│   │   │   ├── iterations.ts
│   │   │   └── streaming.ts
│   │   ├── auth/
│   │   │   ├── jwt.ts
│   │   │   └── github-oauth.ts
│   │   ├── server.ts
│   │   └── index.ts
│   └── package.json
```

### Phase 2: Mobile Web Interface (3-4 weeks)

**Goal:** Responsive web UI accessible on mobile browsers

**Tasks:**
- Create `apps/web` package with React + Tailwind
- Reuse existing UI components from desktop app
- Implement responsive design patterns:
  - Mobile-first navigation
  - Touch-friendly controls
  - Collapsible diff views
  - Swipe gestures for timeline
- Add PWA capabilities:
  - Service worker for offline caching
  - Web app manifest
  - Background sync for status updates
- Real-time session monitoring via WebSocket

**New Structure:**
```
apps/
├── web/
│   ├── src/
│   │   ├── components/ (shared with desktop)
│   │   ├── pages/
│   │   │   ├── SessionList.tsx
│   │   │   ├── SessionDetail.tsx
│   │   │   ├── DiffView.tsx
│   │   │   └── Timeline.tsx
│   │   ├── hooks/
│   │   │   ├── useWebSocket.ts
│   │   │   └── useOfflineSync.ts
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── public/
│   │   ├── manifest.json
│   │   └── sw.js
│   └── vite.config.ts
```

### Phase 3: Authentication & Multi-User (2 weeks)

**Goal:** Secure access with user-specific sessions

**Tasks:**
- Implement GitHub OAuth integration
- Add JWT-based authentication
- Session ownership and sharing permissions
- User management in database schema
- Rate limiting and security middleware

**Database Updates:**
```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  github_id INTEGER UNIQUE,
  username TEXT NOT NULL,
  email TEXT,
  avatar_url TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE session_permissions (
  session_id TEXT,
  user_id TEXT,
  permission TEXT, -- 'owner', 'collaborator', 'viewer'
  granted_at TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES sessions(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);
```

### Phase 4: Git Repository Integration (3 weeks)

**Goal:** Support both local and remote repository workflows

**Tasks:**
- Implement `RemoteGitOps` class for GitHub integration
- Support repository providers:
  - Local filesystem (current behavior)
  - GitHub (clone, fork, PR creation)
  - GitLab (future)
- Repository access token management
- Automatic PR creation on session completion
- Branch protection and merge policies

**Git Provider Interface:**
```typescript
interface GitProvider {
  clone(repoUrl: string, targetDir: string): Promise<void>;
  createBranch(branch: string, base: string): Promise<void>;
  createPullRequest(title: string, body: string, base: string, head: string): Promise<string>;
  mergePullRequest(prId: string): Promise<void>;
  getRepository(owner: string, name: string): Promise<Repository>;
}

class GitHubProvider implements GitProvider {
  // Implementation using GitHub API
}
```

### Phase 5: Native App Distribution (2 weeks)

**Goal:** App store presence with native features

**Tasks:**
- Wrap PWA with Capacitor
- Add native push notifications via FCM/APNs
- Implement biometric authentication
- App store deployment pipeline
- Deep linking for session sharing

### Phase 6: Advanced Mobile Features (Ongoing)

**Goal:** Mobile-optimized workflows

**Tasks:**
- Voice commands for common operations
- Gesture-based navigation
- Offline session creation and sync
- Mobile-specific notification preferences
- Integration with mobile Git clients

## Git Repository Access Strategies

### Strategy 1: Server-Side Git Operations (Recommended)

**Pros:**
- Full Git capabilities on server
- Consistent behavior across clients
- Better security (tokens on server only)
- Support for complex worktree operations

**Cons:**
- Requires server infrastructure
- Network dependency for Git operations

**Implementation:**
- Server clones repos using deploy keys or GitHub App tokens
- Mobile clients trigger operations via API
- Real-time progress streaming via WebSocket

### Strategy 2: Hybrid Approach

**Pros:**
- Local repos work offline
- Remote repos accessible anywhere
- Flexible deployment options

**Implementation:**
```typescript
interface SessionCreateOptions {
  name: string;
  prompt: string;
  repository: {
    type: 'local' | 'github' | 'gitlab';
    url?: string;
    path?: string;
    branch?: string;
  };
  script?: string;
  modelOverride?: string;
}
```

## Security Considerations

### Authentication Flow
1. GitHub OAuth with fine-grained permissions
2. JWT tokens with session-specific scopes
3. Repository access validation per operation
4. Rate limiting per user/session

### Data Protection
- Repository tokens stored encrypted
- Session data isolated by user
- Audit logging for all Git operations
- Secrets redaction in logs and telemetry

### Network Security
- HTTPS/WSS only in production
- CORS policies for web clients
- API versioning for compatibility
- Input validation and sanitization

## Migration Strategy

### Maintaining Backward Compatibility
- Desktop app continues working unchanged
- CLI maintains direct core access
- Configuration migration for server mode
- Optional server deployment for teams

### Deployment Options
1. **Self-Hosted:** Docker container with SQLite
2. **Team Server:** Shared instance with Postgres
3. **Cloud Service:** Managed hosting (future)
4. **Hybrid:** Local + cloud sync (future)

## Performance Considerations

### Mobile Optimizations
- Lazy loading for session lists
- Incremental diff loading
- WebSocket message batching
- Offline caching strategy
- Background sync queues

### Server Optimizations
- Connection pooling
- Session cleanup policies
- Git worktree pruning
- Telemetry aggregation
- Database indexing strategy

## Success Metrics

### User Experience
- Session creation time < 30s
- Real-time updates latency < 200ms
- Offline capability for 24h
- 90% feature parity with desktop

### Technical Metrics
- API response times < 500ms
- WebSocket connection stability > 99%
- Mobile bundle size < 2MB
- PWA lighthouse score > 90

## Risk Assessment

### High Risk
- Git worktree complexity on different platforms
- Real-time streaming performance at scale
- Mobile browser compatibility variations

### Medium Risk
- Authentication token management
- Database migration complexity
- API versioning challenges

### Mitigation Strategies
- Comprehensive integration testing
- Progressive rollout with feature flags
- Fallback modes for critical operations
- User feedback collection and iteration

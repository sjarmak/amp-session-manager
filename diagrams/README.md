# Architecture Diagrams

This directory contains Mermaid diagrams supporting the mobile accessibility analysis and implementation roadmap.

## Diagram Files

### [mobile-architecture.mmd](mobile-architecture.mmd)
**Purpose**: Overall system architecture showing the relationship between mobile clients, API gateway, existing desktop/CLI clients, and core services.

**Key Components**:
- Mobile clients (PWA, iOS, Android)
- API gateway layer with authentication
- Existing desktop and CLI clients
- Core services (@ampsm/server, @ampsm/core)
- Git providers (local, GitHub, GitLab)
- Execution environment (worktrees, Amp CLI)

### [implementation-phases.mmd](implementation-phases.mmd)
**Purpose**: Timeline visualization of the mobile implementation roadmap with task dependencies and milestones.

**Phases Covered**:
1. API Foundation (2-3 weeks)
2. Mobile Web UI (3-4 weeks) 
3. Authentication & Security (2 weeks)
4. Git Integration (3 weeks)
5. Native Apps (2 weeks)

### [data-flow-sequence.mmd](data-flow-sequence.mmd)
**Purpose**: Detailed sequence diagram showing how mobile clients interact with the server for session creation, real-time iterations, and squash/merge operations.

**Flows Illustrated**:
- Mobile session creation with Git worktree setup
- Real-time iteration streaming with telemetry
- Session squash and merge workflow

### [git-provider-strategy.mmd](git-provider-strategy.mmd)
**Purpose**: Architecture diagram showing the git provider abstraction layer and how different repository sources (local, GitHub, GitLab) are handled through a unified interface.

**Strategy Components**:
- Repository sources and authentication methods
- Git provider interface abstraction
- Mobile workflow integration
- Support for both local and remote repositories

## Viewing Diagrams

These Mermaid diagrams can be viewed using:

1. **GitHub/GitLab**: Native Mermaid rendering in markdown files
2. **VS Code**: Mermaid Preview extension
3. **Mermaid Live Editor**: https://mermaid.live/
4. **Local Tools**: Any Mermaid-compatible viewer or CLI tool

## Usage in Documentation

Reference these diagrams in documentation using:

```markdown
![Mobile Architecture](diagrams/mobile-architecture.mmd)
```

Or for inline rendering:
```mermaid
graph TB
    %% Include diagram content directly
```

## Maintenance

Keep these diagrams updated as the implementation progresses:
- Update architecture diagram when new services are added
- Modify timeline when phases are adjusted
- Enhance sequence diagrams as API endpoints evolve
- Expand git provider strategy as new providers are supported

# Setup Instructions

This scaffolding is complete and ready for development. Here's how to get everything running:

## Installation

```bash
pnpm install
```

Note: Native dependencies like `better-sqlite3` and `electron` require compilation. If you see binding errors, run:

```bash
pnpm rebuild
# or
cd node_modules/better-sqlite3 && npm run build-release
```

## Development Commands

```bash
# Type checking (works now)
pnpm typecheck

# Unit tests (types package works, core needs SQLite bindings)
pnpm --filter @ampsm/types test

# Build all packages
pnpm build

# Development mode
pnpm dev  # (starts Electron app - needs native deps)
pnpm cli  # (runs CLI in watch mode)
```

## CLI Testing

After building packages:

```bash
node packages/cli/dist/index.js --help
node packages/cli/dist/index.js list
```

## What Works Now

✅ **Monorepo Structure**: Complete pnpm workspace setup  
✅ **TypeScript**: All packages compile without errors  
✅ **Types Package**: Shared interfaces with tests  
✅ **Core Package**: Session management logic (needs SQLite build)  
✅ **CLI Package**: Commander.js setup with all commands stubbed  
✅ **Desktop App**: Electron + React + Tailwind scaffolding  
✅ **Documentation**: Architecture, Git strategy, README  
✅ **CI**: GitHub Actions workflow  

## Next Steps

1. Build native dependencies: `pnpm rebuild`
2. Implement session creation in CLI
3. Connect desktop UI to core package
4. Add real-time notifications
5. Implement Git worktree operations
6. Add Amp CLI integration

The foundation is solid and ready for feature development!

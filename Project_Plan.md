You are a senior engineer. Build a cross-platform desktop app and CLI that orchestrates Amp sessions in isolated Git worktrees, supports parallel work, and provides tight Git integration, change tracking, and test-run scripts.

Guardrails

Do not modify Amp’s source. Interact via the amp CLI and (if present) the VS Code extension APIs/commands.

Assume Git is installed. Prefer shelling out to git for worktrees, rebase, squash.

Keep secrets out of logs. Never read .env files unless invoked by the user explicitly.

Target macOS first; keep Linux and Windows paths abstracted.

Tech stack

Desktop UI: Electron + React + TypeScript + Vite + Tailwind.

Backend / Orchestrator: Node.js (TypeScript) process spawned by Electron.

CLI: A companion Node.js CLI (amp-sessions) that talks to the same core library.

Git ops: Spawn git subprocesses. Parse output robustly.

Notifications: Native desktop notifications (Electron).

Diff/patch: Use git diff --patch for display; render in UI with syntax highlighting.

Persistence: SQLite via better-sqlite3 for small metadata; no server required.

Core concepts

Session = { id, name, ampPrompt, createdAt, repoRoot, worktreePath, branchName, status, lastRun, scriptCommand?, modelOverride?, notes }.

Session lifecycle:

Create session from a prompt → create branch amp/<slug>/<timestamp> off a chosen base (main by default).

Create git worktree at .worktrees/<sessionId>, set as session workspace.

Iterate: Each Amp cycle (generate → apply edits) must end with git add -A && git commit -m "amp: <short summary>".

Allow manual edits in the worktree; surface diffs live in UI.

Squash & rebase: On user command, squash all amp: commits into one with a custom message; rebase onto main (configurable).

Merge back: Optional fast-forward or PR creation script stub (no external API by default).

Parallel sessions: No global locks; each session uses its own worktree/branch. Concurrency must be safe.

Required features

Create sessions from prompts
UI: modal to pick repo path + base branch + optional scriptCommand to run after each iteration (e.g., npm test).
CLI: amp-sessions new --repo <path> --base main --name "<name>" --prompt "<prompt>" [--script "<cmd>"].

Iterate with Amp

Button/CLI: “Run Amp iteration”.

Flow: write/update an AGENT.md in the worktree that includes session goal + constraints + recent diffs summary. Invoke amp with the prompt and AGENT.md context. Apply suggested edits to files; commit with amp: prefix.

Store iteration logs and token usage (if available from Amp’s CLI output) in SQLite.

Review diffs & manual edits

UI diff viewer per file; staged vs unstaged.

Button: “Open in editor” (launch VS Code in worktree).

Button: “Commit manual changes” with message.

Squash & rebase to main

UI/CLI command: “Squash session commits” → single commit message provided by user.

Rebase onto base branch; handle conflicts with a guided UI (show files, open editor, continue/abort).

Change tracking dashboard

Per session timeline of commits (subject, short hash, changed files).

Token usage and iteration duration charts (simple).

Notifications

Desktop alerts when Amp awaits input, when tests finish, or when conflicts need resolution.

Run scripts

“Run test script” action with live stdout/stderr pane.

Auto-run after each iteration if scriptCommand configured.

Mark iteration as pass/fail based on exit code.

Resume sessions

On app start, scan SQLite and validate worktrees; offer “Reattach” or “Clean up” for missing paths.

Nice-to-have (time-boxed)

Save/load session templates (pre-filled prompts, repo paths, base branches).

Per-session model override flag (e.g., try gpt-5).

Export a patch (.patch) of the squashed commit.

Deliverables

A single repo amp-session-manager/ with:

apps/desktop/ Electron+React TS app.

packages/core/ core orchestration library (sessions, git, amp adapter).

packages/cli/ amp-sessions CLI using packages/core.

packages/types/ shared TypeScript types.

Scripts:

pnpm dev (desktop), pnpm build (all), pnpm cli (watch CLI).

VS Code tasks & launch configs for Electron debug and CLI debug.

docs/ with:

README.md (install, run, examples)

ARCHITECTURE.md (flow diagrams, data model)

GIT-WORKTREES.md (gotchas, cleanup)

OPERATIONS.md (common commands, recovering from conflicts)

Tests:

Unit tests for core git ops and session lifecycle (Vitest).

E2E happy-path: create → iterate → manual edit → squash → rebase.

CI:

GitHub Actions: lint, type-check, unit tests on push/PR.

UX details

Home: list sessions; filter by repo, status.

Session view: left sidebar = files changed; main = diff; right = timeline + controls.

Buttons: New Iteration, Run Tests, Commit Manual Changes, Squash & Rebase, Open in VS Code, Open Terminal.

Show current branch/worktree path at top with copy-to-clipboard.

CLI commands (spec)
amp-sessions new --repo <path> --base <branch> --name "<name>" --prompt "<prompt>" [--script "<cmd>"] [--model "<id>"]
amp-sessions iterate <sessionId> [--notes "<text>"] [--no-commit=false]
amp-sessions diff <sessionId> [--staged] [--name-only]
amp-sessions commit <sessionId> --message "<msg>"
amp-sessions run <sessionId> # runs scriptCommand
amp-sessions squash <sessionId> --message "<msg>"
amp-sessions rebase <sessionId> --onto <branch>
amp-sessions open <sessionId> [--editor code]
amp-sessions list [--repo <path>]
amp-sessions status <sessionId>
amp-sessions cleanup <sessionId> # remove worktree safely after merged

Implementation notes

Worktree layout: <repo>/.worktrees/<sessionId>; branch amp/<slug>/<timestamp>.

Squash: interactive rebase onto base; or git reset --soft <base> then single commit; prefer rebase for history safety.

Conflict handling: detect non-zero exit on rebase; show conflicted paths; provide “Continue rebase” and “Abort rebase” actions.

Amp adapter:

Input: session.ampPrompt, AGENT.md context, recent git diff -U0 summary.

Output: file edits (use patch apply) or run Amp in “edit in place” mode if available; then stage & commit.

Telemetry (local only): iteration duration, token usage if parsable, script exit code.

Acceptance criteria (must pass)

Create a session on a real Git repo; worktree + branch created; SQLite row exists.

Running “Iterate” produces at least one file edit and a amp: commit.

Manual edit → “Commit manual changes” creates commit and appears in timeline.

“Run tests” executes the configured script and displays logs; fail exit code marks iteration failed.

“Squash & Rebase” results in a single commit on top of main with user message; no worktree corruption.

Parallel: two sessions on the same repo can iterate independently without file collisions.

Notifications fire on: Amp waiting for input, tests finished, rebase conflicts.

CLI mirrors UI flows; docs include end-to-end example.

Bootstrap tasks

Scaffold monorepo with pnpm workspaces; set up Electron + React + TS in apps/desktop.

Implement packages/core: session store, git wrapper, amp adapter, notifier.

Implement CLI using packages/core.

Wire UI to core via IPC; build session list and session view; add diff renderer.

Implement run-script panel and notifications.

Author docs and create sample repo for demo; add E2E script.

Deliver the complete repo with instructions to pnpm install && pnpm dev to launch the desktop app, and pnpm --filter @ampsm/cli build && ampsm --help to use the CLI.

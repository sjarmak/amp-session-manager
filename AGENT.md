# AGENT.md — Amp Session Conductor

This document instructs a coding agent (Amp) how to work inside this repository to create and iterate on **isolated Git worktree sessions**, with deterministic commits, reviewable diffs, and safe squash/rebase back to the main branch.

Note: DO NOT RUN SERVERS DIRECTLY WHILE TESTING IMPLEMENTATION, IF YOU WANT TO RUN THE SERVER TO TEST TELL THE USER TO RUN THE COMMAND TO START UP THE SERVER.

DO NOT EVER RUN pnpm dev!!!

---

## Mission

Build and maintain a cross-platform desktop app (Electron + React + TypeScript) and a companion CLI that:

- Creates **sessions from prompts**, each in its own **Git worktree** on a dedicated branch.
- **Iterates** with Amp inside each session; **every iteration ends with a commit**.
- Enables **manual edits** at any time; diffs are reviewable in the UI and via CLI.
- **Squashes** session commits and **rebases** cleanly onto the base branch (default `main`).
- Supports **parallel sessions**, **notifications**, and **run scripts** (tests) per session.

Non-goals: modifying Amp source, introducing external services, or leaking secrets.

---

## Guardrails and Principles

- **Do not edit Amp’s code**; interact via the `amp` CLI and editor commands only.
- **Atomic, reversible steps**. Every automated change must be committed or rolled back.
- **Idempotence**. Commands may be re-run without corrupting state.
- **Plain Git first**. Prefer `git` subcommands over custom logic.
- **Security**. Never read `.env` without explicit user instruction. Do not log secrets.
- **Transparency**. Summarize diffs and decisions in commit messages and logs.

---

## Tech Stack (authoritative)

- Desktop UI: Electron + React + TypeScript + Vite + Tailwind
- Orchestrator: Node.js (TypeScript) in Electron main process
- CLI: Node.js (TypeScript), package name `@ampsm/cli`, bin `amp-sessions`
- Storage: SQLite via `better-sqlite3` for metadata (sessions, iterations, token usage)
- Git: system `git` via child processes
- Tests: Vitest + ts-node
- CI: GitHub Actions (lint, typecheck, unit tests)

---

## Directory Layout

amp-session-manager/
apps/
desktop/ # Electron + React app
packages/
core/ # Session engine: git ops, amp adapter, persistence, notifier
cli/ # @ampsm/cli -> amp-sessions
types/ # shared contracts
docs/
README.md
ARCHITECTURE.md
GIT-WORKTREES.md
OPERATIONS.md
.worktrees/ # (generated) session worktree roots

yaml
Copy
Edit

---

## Session Model

A **session** is stored in SQLite with fields:

id: string (uuid)
name: string
ampPrompt: string
repoRoot: string # absolute path to target repo
baseBranch: string # e.g., "main"
branchName: string # e.g., "amp/<slug>/<timestamp>"
worktreePath: string # "<repoRoot>/.worktrees/<id>"
status: "idle" | "running" | "awaiting-input" | "error" | "done"
scriptCommand?: string # optional test command, e.g., "pnpm test"
modelOverride?: string # optional, e.g., "gpt-5"
createdAt: ISO string
lastRun?: ISO string
notes?: string

yaml
Copy
Edit

---

## Git Conventions

- Worktrees live at `<repoRoot>/.worktrees/<sessionId>`.
- Branch naming: `amp/<kebab-slug>/<yyyymmdd-HHMMss>`.
- Commit messages produced by Amp must start with `amp:`.
  Example: `amp: implement session creation flow (worktree + branch)`
- Manual commits: free-form, but avoid `amp:` prefix.
- Squash policy: squash **all `amp:` commits** in the session into a single commit with a user-provided message; preserve manual commits if requested, otherwise include them in the squash.
- Rebase policy: rebase the squashed commit(s) onto `baseBranch`. Abort on conflict and prompt the user to resolve.

---

## Required External Tools

- `git` (>= 2.38 recommended for worktree improvements)
- `node` (LTS), `pnpm`
- Optional editor integration: VS Code (`code`) for “open here” commands

---

## Standard Commands (for the agent)

> Always run commands from the **session worktree directory** unless otherwise stated.

### Create a session (scaffold only; the CLI will front this)

1. Validate repo: `git -C "<repoRoot>" rev-parse --is-inside-work-tree`
2. Ensure clean base:
   git -C "<repoRoot>" fetch --all --prune
   git -C "<repoRoot>" checkout "<baseBranch>"
   git -C "<repoRoot>" pull --ff-only

markdown
Copy
Edit 3. Create branch:
`git -C "<repoRoot>" branch "<branchName>" "<baseBranch>"` 4. Create worktree folder:
`mkdir -p "<repoRoot>/.worktrees/<sessionId>"` 5. Add worktree:
`git -C "<repoRoot>" worktree add "<repoRoot>/.worktrees/<sessionId>" "<branchName>"` 6. Initialize `AGENT_CONTEXT/` in the worktree:

- `AGENT_CONTEXT/SESSION.md` (rendered instructions and goals)
- `AGENT_CONTEXT/DIFF_SUMMARY.md` (autofilled per iteration)
- `AGENT_CONTEXT/ITERATION_LOG.md` (append-only)
- `AGENT_CONTEXT/LAST_STATUS.json`

7. Stage context files:
   # Stage context files (no initial commit - branch starts at base tip)
git add AGENT_CONTEXT

markdown
Copy
Edit

### Iteration loop

Each Amp iteration must follow this strict protocol:

1. **Sync context files**

- Generate a **diff summary** against `HEAD`:
  ```
  git diff --unified=0 --no-color > AGENT_CONTEXT/DIFF_SUMMARY.md
  ```
  If no diffs, write: “No changes since last iteration.”
- Update `AGENT_CONTEXT/SESSION.md` with the active goal and constraints (see Prompt Template).

2. **Prompt Amp** using the **Iteration Prompt** (below). The agent may modify any files in the worktree except `.git/`.
3. **Stage and commit** all changes if any files changed:
   git add -A
   git diff --cached --quiet || git commit -m "amp: <concise summary of changes>"

markdown
Copy
Edit 4. **Optionally run tests** if `scriptCommand` is set:
<scriptCommand> ```- If exit code != 0, write failure summary to`AGENT_CONTEXT/ITERATION_LOG.md`and set status`awaiting-input`. 5. **Append iteration record** to `AGENT_CONTEXT/ITERATION_LOG.md`: - Start/End timestamp, commit SHA (if any), changed paths count, test result, token usage (if available). 6. **Persist status** to `AGENT_CONTEXT/LAST_STATUS.json`.
Manual edits are welcome
If the user edits files manually:

The UI/CLI surfaces diffs.

To record them: git add -A && git commit -m "<your message>".

Squash & rebase
Ensure worktree is clean: git status --porcelain → empty.

Identify the session’s first commit on the branch (the one after the branchpoint).

Interactive rebase, squashing all amp: commits into one. Preferred approach:

pgsql
Copy
Edit
git reset --soft <baseBranch>
git commit -m "<user-provided squash message>"
or:

css
Copy
Edit
git rebase -i --rebase-merges <baseBranch>

# mark amp: commits as 'squash'/'fixup' as appropriate

Rebase onto base:

css
Copy
Edit
git fetch --all --prune
git rebase <baseBranch>
On conflicts: write a short guide to AGENT_CONTEXT/REBASE_HELP.md, stop, and surface conflicted files.

Cleanup (after merge)
Remove worktree safely:

mathematica
Copy
Edit
git -C "<repoRoot>" worktree remove "<repoRoot>/.worktrees/<sessionId>"
git -C "<repoRoot>" branch -D "<branchName>" # only after it’s merged
Iteration Prompt (to pass to Amp)
The orchestrator composes this prompt for each iteration. Keep it short, specific, and reproducible.

diff
Copy
Edit
You are improving the Amp Session Conductor in this worktree.

Goal:

- {active_goal_one_line}

Context:

- Tech: Electron + React + TypeScript + Vite + Tailwind; Node TypeScript backend; SQLite via better-sqlite3.
- This worktree represents a single user session branch: {branchName} based on {baseBranch}.
- You must end with a deterministic commit if any file changes were made.

Constraints:

- Do not modify Amp’s source or global environment.
- Prefer standard git, node, pnpm commands.
- Do not read .env or log secrets.
- Keep changes focused; avoid broad refactors unless explicitly requested.

Available references:

- AGENT_CONTEXT/SESSION.md (session briefing)
- AGENT_CONTEXT/DIFF_SUMMARY.md (recent diffs)
- packages/core (session engine, git ops, amp adapter)
- packages/cli (amp-sessions CLI)
- apps/desktop (Electron+React UI)

Definition of done for this iteration:

- Implement the requested change(s).
- All TypeScript compiles; unit tests pass locally.
- If scriptCommand is configured, it exits with code 0.
- Commit message begins with 'amp:' and concisely summarizes what changed.

Now:

- Explain your plan in 3–6 bullet points.
- Make the minimal necessary code changes.
- Update or add tests.
- Run quick self-checks and finalize.
  Typical Tasks for the Agent
  Feature slice (e.g., “Add session timeline view”)

Implement UI component in apps/desktop

Add selectors and queries to packages/core

Update types in packages/types

Unit tests in packages/core for store and git ops

Git operation (e.g., “Implement squash & rebase command in CLI”)

Add command in packages/cli/src/commands/squash.ts

Wrap safe git sequences with robust error handling and clear messages

Tests: simulate repo with tmp fixture; verify commit graph shape

Notifications

Electron: use new Notification() with fallbacks

Trigger on: awaiting input, tests finished, conflicts detected

Run script wiring

Add per-session scriptCommand

Stream stdout/stderr to desktop pane with exit code capture

Commit Message Rules
Start with amp: for automated commits, e.g.:

amp: add session list view with sorting

amp: implement git worktree creation flow and error handling

Keep the subject ≤ 72 chars.

Body (optional): short rationale, risks, follow-ups.

Quality Gates (agent self-checks)
Before committing:

pnpm -w typecheck passes

pnpm -w -r test passes for touched packages

Lint (if configured) passes or non-blocking warnings are noted

If any gate fails:

Revert the change or fix it; do not leave the tree red.

If external input is required, stop and set status to awaiting-input.

Telemetry (local only)
For each iteration, append to AGENT_CONTEXT/ITERATION_LOG.md:

Timestamp start/end

Commit SHA (if any)

Changed file count

Script result (pass/fail, exit code)

Token usage parsed from Amp CLI output (if available)

No PII; no secrets.

Error Handling
Git conflict: stop, write a brief conflict report, surface via UI/CLI.

Dirty worktree at start: prompt to commit/stash; do not proceed automatically.

Missing worktree path: offer reattach or cleanup.

Command not found: record actionable instructions in OPERATIONS.md.

Safe Defaults
Base branch is main unless specified.

Worktree root is <repo>/.worktrees/<sessionId>.

Never force-push by default.

Never delete branches automatically unless explicitly confirmed after merge.

Operator Notes (for humans)
Use the CLI for reproducible flows:

amp-sessions new --repo <path> --base main --name "X" --prompt "Y" --script "pnpm -w -r test"

amp-sessions iterate <sessionId>

amp-sessions squash <sessionId> --message "feat: integrate session into main"

amp-sessions rebase <sessionId> --onto main

Parallel sessions are safe as long as they touch different files or repos; Git will enforce isolation at branch/worktree level.

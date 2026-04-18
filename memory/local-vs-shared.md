---
source: archive
plan: local-vs-shared
distilledAt: 2026-04-17T00:00:00.000Z
---

# Separate Local Work Artifacts from Shared Repository

## What Was Built

`missions/`, `memory/`, `.cosmonauts/`, and `.claude/` are now gitignored — they are personal work artifacts that belong only to the local developer. `ensureForgeDirectory` was extended to scaffold the full local directory tree on first run (`cosmonauts scaffold missions`). Built-in default workflows were removed from `lib/workflows/defaults.ts`; workflows are now defined exclusively in the project-local `.cosmonauts/config.json`, with `.cosmonauts/config.example.json` tracked in git as the canonical template.

## Key Decisions

- **Local-vs-shared boundary**: `missions/`, `memory/`, `.cosmonauts/`, `.claude/` → gitignored. `lib/`, `domains/`, `bundled/`, `cli/`, `ROADMAP.md`, `AGENTS.md` → tracked. `ROADMAP.md` and `AGENTS.md` are framework documentation, not personal work history, so they stay tracked.
- **No built-in workflow defaults**: `DEFAULT_WORKFLOWS` is `[]`. The framework ships opinion-free on workflow names; each project defines its own via `.cosmonauts/config.json`. The existing `lib/config/defaults.ts` workflow definitions were moved to `.cosmonauts/config.example.json` as a user-copyable template.
- **No runtime changes needed**: All file-system operations already used `projectRoot` as a parameter with `mkdir({ recursive: true })`. The separation was a git-layer change only — agent path resolution was already correct.

## Patterns Established

- **Scaffold entrypoint**: `cosmonauts scaffold missions` → `TaskManager.init()` → `ensureForgeDirectory`. This is the single command new users run after cloning. Must remain idempotent — re-running on an existing project is safe and never overwrites `missions/tasks/config.json`.
- **Full scaffold tree**: `missions/tasks/`, `missions/plans/`, `missions/archive/tasks/`, `missions/archive/plans/`, `missions/reviews/`, `memory/` — all created via `Promise.all` with `mkdir({ recursive: true })`.
- **Example config pattern**: `.cosmonauts/config.example.json` is tracked via a `.gitignore` exception (`!.cosmonauts/config.example.json`). It is the single source of truth for named workflow definitions. Users copy it to `.cosmonauts/config.json` and customize — the copy is gitignored.
- **Three-layer directory model**: `bundled/` = installable domain packages (git-tracked, shipped with framework); `missions/` = local active work artifacts (gitignored); `memory/` = distilled knowledge (gitignored). These are distinct layers with different tracking status and different lifecycles.

## Files Changed

- `.gitignore` — added `missions/`, `memory/`, `.cosmonauts/*` (with `!.cosmonauts/config.example.json` exception), `.claude/`
- `lib/tasks/file-system.ts` — extended `ensureForgeDirectory` to create full scaffold via `Promise.all` + `mkdir({ recursive: true })`
- `lib/tasks/task-manager.ts` — `init()` now triggers full scaffold
- `cli/tasks/commands/init.ts` — updated output messaging to list all 6 created directories
- `lib/workflows/defaults.ts` — `DEFAULT_WORKFLOWS` set to `[]`
- `.cosmonauts/config.example.json` — new tracked file; canonical workflow template (plan-and-build, implement, verify)
- `tests/workflows/workflow-loader.test.ts` — rewritten for empty-defaults behavior
- `tests/plans/archive.test.ts` — removed stale precondition assertions (see Gotchas)
- `README.md`, `AGENTS.md` — documented local-vs-shared separation and init flow

## Gotchas & Lessons

- **Archive test preconditions broke**: Extending `ensureForgeDirectory` to pre-create `memory/` and `missions/archive/` caused tests in `tests/plans/archive.test.ts` to fail — they asserted those directories didn't exist before `archivePlan()` was called. Fix: remove precondition directory-absence assertions; instead assert the specific plan is not present in the archive directory.
- **`git rm --cached` surprises collaborators**: After adding paths to `.gitignore`, you must run `git rm --cached -r missions/ memory/ .claude/` to remove them from the git index. Existing clones will see these paths as deleted files on the next `git pull`. This is correct behavior — document it in the commit message.
- **`resolveWorkflow()` now throws without config**: With `DEFAULT_WORKFLOWS = []`, any call to `resolveWorkflow()` on a project without `.cosmonauts/config.json` will throw. This is intentional but affects tooling or tests that assume built-in workflows always exist.

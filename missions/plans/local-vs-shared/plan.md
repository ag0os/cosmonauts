---
title: Separate Local Work Artifacts from Shared Repository
status: completed
createdAt: '2026-03-06T14:29:58.283Z'
updatedAt: '2026-03-18T20:45:34.195Z'
---

## Summary

Make the Cosmonauts repository clone-ready for new users by gitignoring personal work artifacts (`missions/`, `memory/`), enhancing project initialization to scaffold local directories, and providing example configurations so users can start using the system immediately without inheriting the author's tasks, plans, and archives.

## Scope

**Included:**
- Gitignore `missions/` and `memory/` (personal work artifacts)
- Enhance initialization to bootstrap the full local directory structure
- Create example/template configuration files users can copy
- Update documentation (README, AGENTS.md) to reflect the setup flow
- Clean separation: framework code stays in repo, user work artifacts are local

**Excluded:**
- Migrating existing tasks/plans to a different format
- Changes to the core task/plan library APIs (they already use `projectRoot` properly)
- Any changes to how agents resolve paths at runtime (already project-root-relative)

**Assumptions:**
- The current content in `missions/` and `memory/` is the author's work history and can be removed from the repo (it will exist locally but not be tracked)
- `.claude/settings.local.json` is already intended to be local (the "local" in the name) and should also be gitignored
- `ROADMAP.md` and `AGENTS.md` are project-level documentation that should remain tracked — they describe the framework, not a user's personal work

## Approach

The architecture already does the right thing internally — all file system operations take `projectRoot` as a parameter, task/plan managers create directories on demand, and `cosmonauts-tasks init` bootstraps `missions/tasks/`. The gap is purely at the git/distribution layer: personal artifacts are tracked, there's no full scaffold command, and there's no guidance for new users.

### 1. Gitignore work artifacts

Add `missions/`, `memory/`, and `.cosmonauts/` to `.gitignore`. These directories contain:
- `missions/tasks/` — user's active task files and config (prefix, counter)
- `missions/plans/` — user's active plans
- `missions/archive/` — user's archived work
- `missions/reviews/` — user's review artifacts
- `memory/` — distilled knowledge from user's completed work
- `.cosmonauts/` — project-level config for the user's workflows/skills (already designed as a local config dir per `lib/config/loader.ts`)

The `.claude/` directory should also be gitignored — it contains Pi's local settings.

### 2. Remove tracked work artifacts from git history

After updating `.gitignore`, the existing files need to be removed from git tracking (but preserved locally) via `git rm --cached`. This applies to:
- All files in `missions/`
- All files in `memory/`
- `.claude/settings.local.json`

### 3. Enhance initialization

Currently, two init paths exist:
- `cosmonauts init` — agent-driven, creates `AGENTS.md` (for target projects)
- `cosmonauts-tasks init` — creates `missions/tasks/` and `config.json`

Neither creates the full directory scaffold. Enhance `cosmonauts-tasks init` (or add a broader init) to create:
```
missions/
  tasks/
    config.json
  plans/
  archive/
    tasks/
    plans/
  reviews/
memory/
```

This should be idempotent — safe to run on an existing project. The existing `ensureForgeDirectory` and `ensurePlansDirectory` functions already use `mkdir({ recursive: true })`, so extending them is straightforward.

### 4. Create example configuration

Add a `.cosmonauts/config.example.json` (tracked in repo) that demonstrates the configuration format:
```json
{
  "skills": ["typescript"],
  "workflows": {
    "my-workflow": {
      "description": "Custom workflow for this project",
      "chain": "planner -> task-manager -> coordinator"
    }
  }
}
```

This lives in the repo root as documentation. Users copy it to `.cosmonauts/config.json` and customize.

### 5. Update documentation

- **README.md** — Add a "Getting Started" section after Installation that walks through `cosmonauts-tasks init`, config setup, and first workflow
- **AGENTS.md** — Update "Key Directories" to note that `missions/` and `memory/` are local (gitignored) work directories created by init

## Files to Change

- `.gitignore` — add `missions/`, `memory/`, `.cosmonauts/`, `.claude/`
- `lib/tasks/file-system.ts` — extend `ensureForgeDirectory` to optionally create the full scaffold (plans, archive, reviews, memory)
- `lib/tasks/task-manager.ts` — extend `init()` to call the full scaffold
- `cli/tasks/commands/init.ts` — update output messaging to reflect full scaffold
- `.cosmonauts/config.example.json` — new file, example project configuration
- `README.md` — add Getting Started section, update directory structure docs
- `AGENTS.md` — update Key Directories section to note local vs shared

## Risks

- **Git history rewrite feel**: Running `git rm --cached` on `missions/` and `memory/` removes them from tracking. Anyone who has cloned the repo will see these as deleted files on next pull. This is expected and correct — the files shouldn't have been tracked. Worth noting in a commit message.
- **Existing workflows that reference missions/**: All code already resolves paths from `projectRoot`, so runtime behavior is unchanged. The directories are created on demand by the existing `mkdir({ recursive: true })` calls.
- **Init idempotency**: The scaffold must not overwrite `config.json` if it exists (would reset the counter). The existing `loadConfig` + merge pattern in `TaskManager.init()` already handles this correctly.

## Implementation Order

1. **Update `.gitignore` and untrack work artifacts** — Add the gitignore entries. Run `git rm --cached -r missions/ memory/ .claude/` to stop tracking existing files without deleting them locally. This is the foundational change.

2. **Extend initialization to scaffold full directory structure** — Modify `ensureForgeDirectory` in `lib/tasks/file-system.ts` to create the complete `missions/` tree (plans, archive/tasks, archive/plans, reviews) and `memory/`. Update `TaskManager.init()` to call it. Update `cli/tasks/commands/init.ts` messaging.

3. **Create example configuration** — Add `.cosmonauts/config.example.json` with annotated example showing skills and workflow customization.

4. **Update documentation** — Update README.md with a Getting Started flow and AGENTS.md to clarify which directories are local vs tracked.

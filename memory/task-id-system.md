---
source: archive
plan: task-id-system
distilledAt: '2026-06-30'
---

# Task ID allocation — derive from active∪archive, drop the counter

## What Was Built

Task IDs are now allocated by deriving the next sequential number from the union
of **active** task IDs (`missions/tasks/`, read from frontmatter) and **archived**
task IDs (`missions/archive/tasks/`, read from filenames). The persisted
`lastIdNumber` counter in `missions/tasks/config.json` is gone, and `task create`
no longer writes `config.json` at all. IDs stay human-readable and sequential
(`TASK-<n>`). With the churn source removed, the blanket `!missions` Biome
exclusion was deleted, so tracked `missions/` markdown/JSON is now linted.

## Key Decisions

- **Derive-from-union over keeping a counter (Option A).** The counter existed
  only to keep IDs climbing after high-numbered tasks were archived out of the
  active dir. Deriving from active∪archive meets that need without a mutable
  tracked file — eliminating per-create churn and merge-conflict bait.
- **Active stays content-based, archive stays filename-based.** Active IDs come
  from parsed frontmatter (`loadAllTasks()`) so non-standard filenames don't drop
  live IDs; archived IDs come from filenames (`parseTaskIdFromFilename`) because
  archive files aren't live records and filenames are the existing index — this
  also tolerates a malformed archived body.
- **Cross-branch collision accepted as a documented caveat.** Sequential
  client-side allocation can still mint duplicate `TASK-N` on two branches; a
  `task renumber` reconciliation is noted as *future only* and was deliberately
  NOT built. Duplicate-ID detection/warnings were also left out of scope.
- **`lastIdNumber` tolerated, not rejected.** Legacy config files keep working —
  the field is stripped on load/save, not treated as an error.

## Patterns Established

- **Create uses a no-write config path.** `TaskManager.ensureCreateConfig()`
  returns cached/sanitized config, loads+sanitizes `config.json` when present,
  falls back to an in-memory sanitized `DEFAULT_CONFIG` when absent, and **never
  calls `init()` or `saveConfig()`**. This is the seam that guarantees no config
  churn / no config creation on first task.
- **Archive scanning is create-only.** A private `loadCreateAllocatedTaskIds()`
  helper reads the archive; `loadAllTasks()`/`findTaskFilenameById()` were NOT
  broadened. list/search/get/update/delete remain strictly active-only — archived
  tasks influence allocation and nothing else.
- **All allocation reads stay inside `withTaskCreateLock`** so concurrent creates
  still get distinct IDs.
- **Shared `listMarkdownFiles` helper** backs both `listTaskFiles` and the new
  `listArchivedTaskFiles` (sorted `.md`, `[]` when dir missing) — no divergent IO.
- **`id-generator.ts` is pure** and ID-string based (`generateNextId(config,
  readonly string[])`); no filesystem/parser/CLI imports. CLI create has zero
  allocation logic — it delegates to `TaskManager`.

## Files Changed

- `lib/tasks/id-generator.ts` — `Task[]` → `readonly string[]` input; no counter.
- `lib/tasks/file-system.ts` — added `listArchivedTaskFiles` + `listMarkdownFiles`;
  strip legacy `lastIdNumber` on load/save (boundary ~line 109).
- `lib/tasks/task-manager.ts` — `ensureCreateConfig` (no-write), archive-aware
  create inside the lock, `init()` sanitizes cached/returned config (strip boundary
  ~line 434).
- `lib/tasks/task-types.ts` — `lastIdNumber` removed from `ForgeTasksConfig`.
- `biome.json` — removed the blanket `files.includes: ["**", "!missions"]`.
- `missions/tasks/config.json` — `lastIdNumber` removed, tab-formatted.
- Docs: `domains/shared/skills/task/SKILL.md`, `domains/shared/capabilities/tasks.md`.
- Tests: new `tests/config/biome.test.ts`; allocation/archive/legacy coverage across
  `tests/tasks/*`. Behavior markers `B-001..B-012`.

## Gotchas & Lessons

- **Drive excludes `missions/tasks/` from per-task source commits.** The TASK-437
  worker's legitimate `config.json` cleanup was left *uncommitted* after Drive
  finished — Drive treats `missions/tasks/` as task-state and only rewrites task
  `.md` status files in its final state commit. After any Drive run that edits
  files under `missions/tasks/`, check `git status` and commit the intended
  end-state yourself.
- **Removing `!missions` makes lint cover all tracked `missions/` artifacts.** It
  came up clean here, but it means `config.json` had to be tab-formatted and any
  future malformed tracked missions JSON/markdown will now fail `lint`. Session
  transcripts stay excluded via `.gitignore` (`vcs.useIgnoreFile`), not Biome.
- **This is the regression the counter was hiding:** archive a plan so the active
  dir has no high IDs, then create — old counter-less logic would re-mint `TASK-1`.
  Verified in production right after archiving this very plan: active max was
  *none*, next create correctly yielded `TASK-439` from the archived `TASK-438`.
- **Self-referential change.** This plan edits the task system the repo dogfoods;
  Drive marks task status through the same create/config code under test, so a
  break would surface as a stalled run. It didn't, but re-run the gates after any
  change here before trusting Drive.

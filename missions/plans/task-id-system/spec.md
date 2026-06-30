## Purpose

Task IDs are allocated from a persisted counter (`lastIdNumber`) in
`missions/tasks/config.json`. On **every** `task create`, the framework bumps that
counter and rewrites `config.json` with `JSON.stringify(config, null, 2)`. Two
problems follow:

1. **Churn + merge-conflict bait.** A tracked config file is rewritten on every
   task creation. To stop the resulting lint noise, all of `missions/` is currently
   excluded from Biome (`"!missions"`) — a band-aid this work removes.
2. **Cross-branch ID collisions.** Client-side sequential allocation can't
   coordinate across branches: two branches each mint `TASK-N`, and the merge
   produces duplicate IDs.

The counter exists for exactly one reason: to keep IDs climbing after tasks are
archived out of `missions/tasks/`. That need can be met without a counter by
deriving the next number from the union of **active and archived** task IDs.

This change drops the counter and derives the next ID from
`missions/tasks/ ∪ missions/archive/tasks/`, so `config.json` is no longer touched
on create. Sequential, human-readable `TASK-N` IDs are preserved (the whole
project — plans, tasks, behavior markers, sessions — references them).

## Users

- **Framework maintainer** — wants a task system that doesn't spam diffs with
  config rewrites, doesn't bait merge conflicts on a shared tracked file, and
  doesn't need a blanket lint exclusion to stay quiet.
- **Agents/humans creating tasks** (CLI `task create`, the `/skill:task` flow, and
  drive/QM agents that mint tasks mid-run) — want a stable, readable, collision-free
  ID within a given tree, with no surprising config side effects on create.
- **Anyone reading task history** — keeps scannable, ordered `TASK-N` identifiers
  rather than opaque hashes.

## User Experience

### Creating a task no longer churns config

Running `task create` writes only the new task file under `missions/tasks/`.
`missions/tasks/config.json` is **not** modified — `git status` after a create shows
exactly one new file, not a config edit. The allocated ID is the next sequential
number above every ID currently present in the active **and** archived task sets.

### IDs keep climbing across archiving

When tasks are archived (moved to `missions/archive/tasks/`), later creates still
allocate above the archived maximum — a freshly created task never reuses an ID
that an archived task already holds. This holds even though the active directory
no longer contains the high-numbered tasks. (Concretely: with the live max at
`TASK-428` and the active directory holding only lower IDs, the next create is
`TASK-429`, not a re-mint of a mid-range number.)

### Sequential readability is preserved

IDs remain `TASK-<n>` with the configured prefix and zero-padding. No existing IDs
change; nothing that references `TASK-N` (plans, markers, sessions, archives) breaks.

### Failure and edge flows

- **Empty project** — first task in a project with no active or archived tasks is
  `TASK-1` (respecting prefix/zero-padding config).
- **Cross-branch collision (known, accepted limitation)** — if two branches each
  create tasks from the same base, both may mint the same next `TASK-N`; merging
  produces duplicate IDs. This is inherent to sequential client-side allocation and
  is **documented as a caveat** for this wave. A post-merge reconciliation command
  (e.g. `cosmonauts task renumber`) is noted as a future option, not built here.
- **Archive directory absent** — derivation treats a missing/empty archive set as
  contributing no IDs, and still succeeds (does not error).
- **Config still drives prefix/zero-padding** — `config.json` remains the home for
  `prefix` and `zeroPadding`; only the mutable `lastIdNumber` counter is removed, so
  config is read on create but never written.

## Acceptance Criteria

- `task create` does **not** modify `missions/tasks/config.json`; after a create,
  the only change in the working tree is the new task file. (User-verifiable via
  `git status`.)
- The next ID is derived from the union of active (`missions/tasks/`) and archived
  (`missions/archive/tasks/`) task IDs for the configured prefix: it is one greater
  than the highest existing numeric ID across both sets.
- A create performed when the highest ID lives only in the **archive** still
  allocates above it (no reuse of an archived ID).
- `lastIdNumber` is removed from the config contract; an existing `config.json` that
  still contains `lastIdNumber` is tolerated (ignored, not an error) so existing
  projects don't break.
- Existing task IDs are unchanged; `prefix` and `zeroPadding` behavior is unchanged;
  the first task in an empty project is `TASK-1` (with configured padding).
- The cross-branch collision limitation is documented where task-ID behavior is
  described (the relevant skill/doc), including the `task renumber` reconciliation
  as a noted future option.
- The Biome `missions/` exclusion is revisited: narrowed or removed once the
  per-create config churn is gone, and the project's lint gate stays green.
- Full project gates (type-check, lint, test suite) pass; `generateNextId`
  (or its replacement) keeps direct test coverage, including an archive-aware case.

## Scope

Included:
- Derive the next task ID from `missions/tasks/ ∪ missions/archive/tasks/` and stop
  persisting/writing a counter.
- Remove `lastIdNumber` from the config contract and from the create path so
  `config.json` is no longer written on create (while still tolerating its presence
  in existing files).
- Update the task ID/allocation code and the task CLI create path accordingly, with
  test coverage for the archive-aware derivation and the empty-project case.
- Document the cross-branch collision caveat (and the future `task renumber` option).
- Revisit the Biome `missions/` exclusion now that the churn source is gone.

Excluded:
- Non-sequential IDs (nanoid/ULID/hash) — explicitly not chosen; readability kept.
- Building the `cosmonauts task renumber` reconciliation command — noted as a future
  option only.
- Any change to ID **format** (prefix, zero-padding, `TASK-` shape) or to existing
  IDs.
- Broader task-system redesign (schema, storage, dependency model).

## Assumptions

- Archived tasks live under `missions/archive/tasks/` and their filenames/contents
  expose parseable `TASK-<n>` IDs that the derivation can read (consistent with the
  current archive layout).
- Sequential, human-readable IDs are worth keeping despite not being fully
  collision-proof across branches; the documented caveat is an acceptable trade for
  this wave (decision confirmed: Option A).
- `config.json` remains the right home for `prefix`/`zeroPadding`; only the mutable
  counter is the problem.
- Removing the blanket `missions/` Biome exclusion will not surface a large backlog
  of unrelated lint violations in tracked `missions/` markdown/JSON; if it does, the
  planner decides between narrowing the exclusion vs. a follow-up cleanup.

## Open Questions

- Should the next-ID derivation scan archived task **filenames** only (cheap) or
  also parse file contents (authoritative but heavier)? Filenames appear sufficient
  given `getTaskFilename`/`parseTaskIdFromFilename`, but the planner should confirm
  no ID-bearing case is missed.
- After dropping the blanket exclusion, is the right end state "no `missions/`
  exclusion at all" or "exclude only high-volume generated subtrees" (e.g.
  session/transcript artifacts)? Depends on what lint surfaces.
- Should `task create` proactively **detect** an existing duplicate ID in the tree
  (e.g. warn if the computed ID already exists after a messy merge), or stay silent
  and leave that to the future `renumber` tool?

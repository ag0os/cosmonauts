---
source: archive
plan: code-structure-map
distilledAt: '2026-07-06'
---

# Derived code-structure map (architectural-memory W1)

## What Was Built

The first facet of **architectural memory**: a derived, always-fresh TypeScript
code-structure map plus its two bundled riders. New `lib/architecture-map/` core
generates an OKF markdown **index + per-module shards** under tracked
`memory/architecture/` — a mechanical spine (dependency tree + public interfaces)
with a lazily-generated "what this module does" narrative per module. Shipped
with it: the `analysis-tools` **audit** (a spike artifact, not a build) and the
`artifact-viewer` (`cosmonauts serve`, a dependency-free HTML view of the map +
plans). This is W1 of the track; W2–W4 (architecture-of-record, drift signal,
reuse-scan, embeddings, health metrics) stayed explicitly out.

Surfaces:
- `cosmonauts architecture generate` (alias `arch`) `[--no-narrative] [--json] [--plain]`
- `cosmonauts serve [--host --port --open|--no-open]` — live local viewer only
- `domains/shared/extensions/architecture-memory/` — injects the compact index +
  freshness banner for exactly five consuming agents and registers an
  `architecture_map_read` shard-loading tool.

## Key Decisions

- **Analysis substrate audit-gated (B-001), then TypeScript compiler API.** The
  bundled audit (`analysis-tools-audit.md`) was implemented *first* and its
  substrate recommendation gated all analyzer-adapter work; it selected the TS
  compiler API (already in-repo, deterministic import/export parsing). The
  analyzer contract (`SourceAnalyzer` → `ModuleSkeleton`) is fixed so only
  `analyzer.ts` changes if the substrate is ever swapped. `typescript` stays a
  devDependency unless the CLI ships the analyzer to consumers (then promote to
  `dependencies` + update lockfile).
- **Two-tier freshness — content hash at generate time, stat fingerprint on
  turns.** `projectHash` = full content hash over included source + analyzer
  config + canonicalized `architectureMap` config (generate-time truth, CLI).
  `statFingerprint` = sha256 over path/size/mtimeMs of the same files **plus** the
  canonicalized config section (turn-time, extension + viewer). Full-tree content
  hashing **never** runs on agent turns — the extension runs `before_agent_start`
  every turn. Stat tier may false-`stale` on touch-without-change (accepted: errs
  toward honesty), never false-`current` on real content change.
- **Narrative invalidation keyed on `skeletonHash`, not `sourceHash`.**
  `skeletonHash` covers resource/files/public-interface/deps only; body-only edits
  keep it stable → narrative reused, provider not called. Interface changes bump
  it → that module's narrative regenerates. `pending` is a **transient** state
  (from `--no-narrative`, budget exhaustion, or provider failure); a later refresh
  completes it even on an otherwise-unchanged tree (a legitimate `written`, not
  `unchanged`).
- **Timestamp inheritance makes byte-idempotence non-circular.** Rendered records
  inherit the prior record's `timestamp`/`generatedAt` when their content
  (excluding volatile keys) is unchanged. Without this, fresh timestamps would
  make every refresh look changed and AC-003/B-004 (no-change refresh rewrites
  nothing) would be unimplementable.
- **No shared memory-interface extraction in W1.** Map read/write stays in
  `lib/architecture-map`; the `write`/`retrieve`/`consolidate` ancestor lands with
  `agent-memory` W1 (premature-abstraction guard — extract when the second
  implementation exists).
- **Markdown is the source of truth; the viewer is read-only.** No parallel state,
  no editing, no scaffolding as a side effect of viewing.
- **No OKF `log.md` for generated maps** — a regenerated log would churn tracked
  derived files; logs are reserved for curated W2+ records.
- **Extension gates on agent identity.** Because `package.json` advertises
  `./domains/shared/extensions` as a pi-package extension dir, an external Pi host
  could auto-load architecture-memory for *every* agent. It must be **inert**
  unless the runtime agent is one of the five consumers (planner, plan-reviewer,
  coordinator, worker, quality-manager). Covered by an explicit
  inert-for-other-agents test.
- **Viewer stays dependency-free and bounded** — minimal escaped-markdown subset
  (headings, paragraphs, lists, links, inline/fenced code, best-effort tables;
  everything else → escaped preformatted), deterministic layered/grid SVG graph,
  no markdown/HTML/graph library.

## Patterns Established

- **Contract-first, two record shapes.** `ModuleSkeleton` is analyzer output;
  `ModuleRecord extends ModuleSkeleton` is generator output (adds reversed
  `dependents`, narrative state, `shardPath`). One result union
  `GenerateArchitectureMapResult` (`written|unchanged|unsupported|failed`) is the
  single thing CLI/tests/store consume.
- **Narrative seam in core, provider at the edge.** `narrative.ts` defines only
  the `NarrativeProvider` interface + pending helpers (no Pi imports). The concrete
  Pi-backed provider lives at `cli/architecture/narrative-provider.ts`, injected
  by the subcommand. **Tests always inject a fake provider → the suite never makes
  model calls.**
- **Boundary direction is enforced.** `lib/architecture-map/*` imports nothing
  from CLI / domains / extensions / `lib/artifact-viewer` / plans / tasks /
  orchestration / Pi runtime. CLI, the extension, and the viewer are edges that
  may import the core; `lib/config` carries the optional config shape but never
  imports map code.
- **Atomic bundle replacement.** `store.ts` renders the whole map in temp space,
  content-compares before writing (no-op → `unchanged`), writes to a fixed sibling
  temp dir, validates, then rename-swaps via a backup sibling
  (`memory/.architecture.tmp/`, `memory/.architecture.bak/`); restores the backup
  on failure. Every generate first recovers crash leftovers. Single-writer is
  assumed and documented (no lock).
- **Read-only task listing for the viewer.** `TaskManager.listTasksReadOnly()`
  mirrors `listTasks()` but skips `ensureInitialized()`, so a viewer request can
  never scaffold `missions/tasks/config.json` or directories.

## Files Changed

- Core (new): `lib/architecture-map/{types,config,freshness,analyzer,narrative,okf,render,store,generator,index}.ts`.
- CLI (new): `cli/architecture/{subcommand,narrative-provider}.ts`, `cli/serve/subcommand.ts`; dispatch in `cli/main.ts` (`architecture`/`arch`/`serve`).
- Extension (new): `domains/shared/extensions/architecture-memory/index.ts`; added to the five agent defs (`planner`, `plan-reviewer`, `coordinator`, `worker`, `quality-manager`).
- Viewer (new): `lib/artifact-viewer/{types,loaders,renderer,server,index}.ts`; `lib/tasks/task-manager.ts` gained `listTasksReadOnly()`.
- Config: `lib/config/{types,loader}.ts` parse a safe primitive `architectureMap` section.
- Docs/audit: `docs/architecture-map.md`, `missions/archive/plans/code-structure-map/analysis-tools-audit.md`; `fallow.toml` lists the two new public entry points.
- Tests across `tests/architecture-map/*`, `tests/artifact-viewer/*`, `tests/extensions/architecture-memory.test.ts`, `tests/cli/{architecture,serve}/*`, `tests/domains/coding-agents.test.ts`. Behavior markers `B-001..B-021`.

## Gotchas & Lessons

- **Detached Drive died twice when its launching background job was killed.** The
  `run drive --mode detached` launcher, the `cosmonauts-drive-step` orchestrator,
  and the `codex exec` child shared one process group / session, so a
  group-directed kill (the agent harness periodically killing background shell
  jobs — or a stray `kill %1`) took the whole tree down mid-task: no `task_done`,
  no terminal event, and the run record stuck at `status: running` forever (there
  is no `run abort` subcommand). Operational fix that worked: launch Drive as a
  **`setsid` double-fork daemon** so the orchestrator reparents to PID 1 in its own
  session, immune to the harness. The framework-side fix landed separately as
  `Separate detached launch from result waiting`. See
  `memory/drive-resilience-state-model.md`.
- **Recovering a dead mid-task run.** The interrupted task is left `In Progress`
  and its worktree is either *complete-but-uncommitted* (Drive died before its
  finalize/commit step) or *empty*. Verify the partial work green, then either
  finalize it yourself (commit + `task update --status Done`) or reset it to `To
  Do`; a fresh `run drive --plan <slug>` re-resolves ready tasks from **task
  status** (so it resumes at the next undone task).
- **Drive excludes `missions/` from per-task source commits.** TASK-439's
  deliverable — the plan-local `analysis-tools-audit.md` (B-001's evidence) — was
  left **untracked** after the worker wrote it; committed manually. Same class of
  boundary artifact as the `missions/tasks/config.json` note in
  `memory/task-id-system.md`. Always `git status` after a Drive run.
- **The quality-manager under-remediated.** It found and fixed real issues
  (typecheck, config-in-fingerprint, fallow public surface) across REVIEW-FIX
  commits, but signed off **merge-ready** while its own round-2 review had flagged
  a genuine bug it never fixed: `generate` ignored `.cosmonauts/config.json`
  architectureMap settings, because `resolveArchitectureMapConfig` only read
  project config when a caller pre-supplied it and the generator never did — so a
  configured project generated the *wrong* map, which the config-aware freshness
  check then immediately reported `stale`. Fix: load the project config from disk
  when not supplied. Reinforces the standing note — **QM verdicts need
  independent verification; fix its unremediated findings yourself.**
- **The independent codex post-review earned its keep (DO-NOT-SHIP → SHIP).** Two
  real gaps the gates + QM missed: (1) freshness `collectTsconfigInputs` parsed
  tsconfig with `JSON.parse`, so a JSONC/commented tsconfig silently dropped its
  `extends` base from freshness inputs (a B-007 hole) — switched to
  `ts.parseConfigFileTextToJson`; (2) the viewer documented inline links but the
  renderer never rendered them — added escaped `[text](url)` with an unsafe-scheme
  (`javascript:`/`data:`) allowlist. Both got regression tests.
- **New tests referencing bundled coding must be classified in the
  coding-decoupling ledger.** `tests/extensions/architecture-memory.test.ts` had
  to be added to `missions/archive/plans/coding-agnostic-framework/test-decoupling-ledger.md`
  (consumed by `tests/coding-agnostic-fixtures.test.ts`) or that suite fails — a
  cross-plan tracked artifact that looks like scope creep but is required.

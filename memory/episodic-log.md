---
source: archive
plan: episodic-log
distilledAt: '2026-07-21'
---

# Agent-memory W3 — episodic log

## What Was Built

A **config-gated, off-by-default episodic log** over the shipped markdown
`MemoryStore`: consequential run/lifecycle events (chain/Drive run start+end,
plan/task create + real status transitions, successful authored saves, and
caller-owned `autonomy.wake`) become file-per-episode OKF records under
`memory/agent/episodes/*.md`. Episodes are **recall-only** — reachable through
an explicit `recordTypes: ["episode"]` query, never injected and never in
`index.md`. Flag off ⇒ byte-identical behavior, zero new files. This is the
third proof of the W1/W2 "the seams absorb a new record type with
`lib/memory/types.ts` essentially untouched" bet; it holds — the only interface
change is optional `RetrievedMemoryRecord.source`.

## Key Decisions

- **Gate = project-only `.cosmonauts/config.json` `episodicLog.enabled`** (+
  `warningThreshold`, default 500 per scope). No user-level config loader exists;
  a user gate was deferred. Parsed like `architectureMap`, following the existing
  `[warning] Skipping malformed …` loader convention exactly.
- **File-per-episode, not `log.md`** — prunable at record granularity, no
  whole-file rewrite contention, reuses atomic temp+rename + `listMarkdownFiles`.
- **Injection-exclusion and recall-inclusion are ONE seam**: retrieval walks
  `episodes/` only when `query.recordTypes` includes `"episode"`. Injection asks
  for exactly `note|profile|playbook`, so it never scans episodes → zero added
  per-turn cost, byte-identical injected index. (Verified live: an
  injection-shaped query reports `filesScanned: 0` for the episodes dir.)
- **`writer:cosmonauts` is honest PROVENANCE, not a trust proof.** No SHA-256
  integrity / safe-prune verifier — a human can trivially edit an episode and
  reproduce any digest, so a content digest can't be a sound safe-prune
  predicate. The filename content-hash is uniqueness/dedupe only. The
  machine-vs-human trust predicate belongs to the `memory-consolidation` sibling.
- **Fail-soft capture is never load-bearing**: `recordEpisode` catches config/
  construction/write/reporter failures, returns `disabled|recorded|warning`,
  awaits one warning reporter, falls back to bounded stderr.
- **Drive terminal-episode identity is CONTENT-derived** (in-content
  `completedAt` + run id + `episodeAttemptId` + outcome), never completion-file
  mtime — `run.completion.json` is atomically rewritten 2–3× in detached Drive,
  so only content-derived identity dedupes to one terminal across all writers.
- **Drive-internal task/plan status transitions are suppressed BY
  CONSTRUCTION**: Drive builds its `TaskManager`/`PlanManager` *without* episode
  context, so run-internal transitions emit nothing — subsumed by the
  `drive.run` start/terminal pair (OQ1 noise budget).

## Patterns Established

- **One pure record contract** (`lib/memory/episodic-records.ts`, imports only
  `types.ts`) shared by both the retrieval metadata parser and the store's OKF
  parse arm via the extracted `parseEpisodeTagEnvelope` — a malformed tag
  envelope is rejected+warned at the store level, matching the public parser.
- **One framework capture helper** (`lib/memory/episode.ts` `recordEpisode`);
  callers supply events + a warning reporter, nobody builds a parallel serializer.
- **Threshold is a fresh-store factory option** (`MarkdownMemoryStoreOptions.
  episodeWarningThreshold`), bound by every configured constructor; the store
  itself stays config-free (disk is truth, full rescan, no cache).
- **Qualified actor flow**: authored saves = `main/cosmo`; CLI = `cosmonauts/cli`;
  chains = first executable stage's resolved id; Drive freezes the
  execution-resolved worker id it actually launches with (NOT
  `resolveReference("worker", domainContext)`, which mis-resolves under
  default/`main` context).

## Files Changed

- **New**: `lib/memory/episodic-records.ts` (vocabulary/tags/wake payload/
  provenance + `parseEpisodeTagEnvelope`), `lib/memory/episode.ts` (fail-soft
  helper), `lib/driver/episode-identity.ts` (frozen worker resolution).
- `lib/memory/{types,okf,paths,markdown-store,index}.ts` — optional retrieved
  `source`, episode parse/write/scan/threshold, direct-child guard.
- `lib/config/{types,loader}.ts` — `episodicLog` parsing.
- `domains/shared/extensions/agent-memory/index.ts` — recall+episode list,
  successful-save capture, unchanged injection.
- `lib/plans/plan-manager.ts`, `lib/tasks/task-manager.ts`,
  `lib/orchestration/{chain-runner,durable-chain-runner}.ts`, and
  `lib/driver/{drive-graph-runner,driver,run-step,event-stream,types}.ts` +
  their extensions/CLI edges — gated capture wiring.
- `docs/memory.md` — full W3 contract.

## Gotchas & Lessons

- **The three terminal-ordering wants are mutually unsatisfiable with one
  completion write** (learned by reverting a fix): D-009 wants completion→capture;
  B-026-detached wants the capture-failure diagnostic *before* the terminal
  event (the parent bridge stops on the terminal event); inline consumers rely on
  the terminal event being emitted *before* the completion file is observable
  (`waitForCompletion`+`watch_events`). Reordering to satisfy the first two broke
  the third (a real happy-path event-ordering regression, caught only under
  full-suite load, not in isolation). Fixing this properly needs a separate
  diagnostic channel or two-phase completion — deferred to
  `episodic-log-detached-hardening`.
- **A qualified worker id must never become the spawner `role`** —
  `session-factory` bakes `role` into the session file path
  (`${role}-<uuid>.jsonl`), so freezing `coding/worker` as the role forked Drive
  session/manifest layout when the log was *enabled* (a codex-caught P1). Worker
  *selection* rides `agentReference` (which `resolveSpawnAgent` prioritizes);
  keep `role = "worker"`.
- **`writeEpisode` must dedupe on the lost EEXIST race**, not just on an
  identical pre-read — concurrent identical completion writers otherwise create
  `base.md` + `base-2.md` (a P1 idempotence gap). Reread the candidate after
  losing exclusive-create and return the identical winner.
- **The coding-agnostic ledger test greps test files for `/coding/`** — a new
  test using `source: "coding/worker"` trips
  `tests/coding-agnostic-fixtures.test.ts`. Use `"example/worker"` (or obfuscate)
  in memory-store tests.
- **Drive strands `missions/**` and `memory/**`** — the Pi-first audit, task
  status files, and docs land uncommitted; `git status` + commit by hand after a
  run.
- **Live E2E is mandatory** (W1 shipped dead with 2543 green tests): the CLI is
  `bun link`ed to the repo, so `cosmonauts task create` in a scratch project with
  `episodicLog.enabled` exercises the real branch code end to end.
- **7 enabled-only detached-terminal/resume edge cases deferred** — see
  `missions/plans/episodic-log-detached-hardening/spec.md`; concrete file:line
  evidence in the archived `missions/archive/plans/episodic-log/qm-review.md`.

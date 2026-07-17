---
title: 'Agent-memory W3: episodic log'
status: active
createdAt: '2026-07-17T13:42:05.969Z'
updatedAt: '2026-07-17T22:41:00.000Z'
behaviorsReviewPending: false
---

## Overview

Implement agent-memory W3 as a project-config-gated episodic log over the
shipped markdown `MemoryStore`. Consequential run and lifecycle events become
file-per-episode OKF records; episodes remain absent from both injected context
and `index.md`; enabled explicit recall and direct consumers request them with
`recordTypes: ["episode"]`.

`missions/plans/episodic-log/spec.md` is authoritative, including every
2026-07-17 resolution and correction. This plan does not reopen OQ1/OQ2/OQ3 or
the three corrections. It also honors the consumer contracts in
`missions/plans/memory-consolidation/spec.md` and
`missions/plans/autonomy-host/spec.md`: consolidation receives raw, prunable
episode records carrying machine-writer provenance; the safe-prune trust
predicate is memory-consolidation's to design. The host receives a stable wake
envelope it can reconstruct from a fresh process. Neither sibling is
implemented here.

`spec.md` now carries native `AC-001`..`AC-008` labels (added 2026-07-17), so
behavior `Source` fields link to real spec criteria rather than plan-local
aliases. The requested deliverable is `plan.md` only. For reference, the
spec-native criteria are:

| ID | Authoritative criterion text (abridged) |
|---|---|
| AC-001 | “With the flag off (default), no episodic file is ever created and … injected context and tool behavior are identical to today.” |
| AC-002 | “With the flag on … human-readable episode records in the correct scope store … timestamp, actor, action, and outcome.” |
| AC-003 | “Enabling the log does not change the injected memory index.” |
| AC-004 | “An explicit recall query can return episodes.” |
| AC-005 | “Hand-deleting … or a store containing only malformed episodes, never breaks a session … warnings surfacing.” |
| AC-006 | “A failed episode write leaves the triggering action successful … with a visible warning.” |
| AC-007 | “The scan-cost `stats` seam reports episodic scanning ….” |
| AC-008 | “The flag and the event vocabulary are documented in `docs/memory.md`.” |

**Review revision (2026-07-17):** this plan addresses every finding in
`missions/plans/episodic-log/review.md`: plan-local AC aliases are made explicit
(PR-001); the genuinely required optional retrieved `source` seam is authorized
(PR-002); off-state tests cover each modified lifecycle owner (PR-003); warning
reporters are awaitable and chain/Drive transports are concrete (PR-004);
parent-side detached abort owns reconciliation (PR-005); enabled Drive launch
now specifies exact worker resolution, fallback, binding, and resume rules
(PR-006); provenance and wake payload contracts are explicit (PR-007); broad
behaviors are split to one executable marker owner (PR-008); and the threshold
is a fresh-store factory option bound by every configured constructor (PR-009).

**Second-channel review revision (2026-07-17, after second-channel review):** a
second review channel (plan-reviewer PR-010..PR-016 plus an adversarial
Workflow) converged and its consolidated resolutions are applied: spec.md gained
native `AC-001`..`AC-008` (PR-010); the Drive actor is the execution-resolved
worker id, correct under default/`main`/`coding`-bound contexts (PR-011);
terminal-episode identity is deterministic and content-`completedAt`-derived, not
mtime-derived (PR-012); terminal-only CLI resume reconciles a prior attempt and
the fire-and-forget `launchDetached` residual is documented and scoped (PR-013);
`driver_diagnostic` is bridged to the session bus and its reporter surfaces emit
failure (PR-014); the SHA-256 integrity/safe-prune verifier is cut in favor of a
`writer:cosmonauts` provenance tag, deferring the trust predicate to
`memory-consolidation` (PR-015); and Drive-internal task-status transitions are
deterministically suppressed by constructing context-free managers (PR-016).

No implementation tasks are created by this plan. Task decomposition follows
plan approval.

## Architecture Context

Sources of truth and shipped constraints:

- `missions/architecture/agent-memory.md`: one memory interface, plain-text OKF,
  scope-first retrieval, compact index plus pull recall, Pi state for session
  scope, and the infrastructure-first/adoption-later gate.
- `missions/architecture/autonomy.md`: the episodic store is memory, audit trail,
  and durable wake-state; no second host-state store is allowed.
- `memory/memory-interface.md`: roots bind at construction, disk is truth,
  malformed files become path warnings, and no session markdown store exists.
- `memory/profile-playbooks.md`: `note | profile | playbook` use the existing
  string type/query seams; remember is explicit and sequential; injection is a
  bounded authored-memory context.
- `memory/memory-hardening.md`: model-actionable warnings require visible text,
  `retrieve().stats` measures full scans, and no correctness cache is allowed.
- `docs/memory.md`: the W2 contract to extend without changing authored-save
  consent, profile/playbook identity, or human ownership.

Boundary rules:

1. `MemoryStore.write/retrieve/consolidate`, `MemoryRecordDraft`, `MemoryQuery`,
   and result unions remain unchanged. Review established one genuine additive
   need in `lib/memory/types.ts`: `RetrievedMemoryRecord.source?: string`, because
   `parseAuthoredRecord()` currently reads `source` but `toRetrievedRecord()`
   discards it. Optionality preserves architecture-map compatibility. No action,
   outcome, payload, integrity, delete, or cache field is added to the interface.
2. `lib/memory/episodic-records.ts` is a new pure record-contract module:
   vocabulary, reserved tags (including the `writer:cosmonauts` provenance tag),
   and metadata parsing. It imports no config, filesystem, Pi, domains, or
   lifecycle modules.
3. `lib/memory/markdown-store.ts`, `okf.ts`, `paths.ts`, and record modules are
   config-free storage/serialization. They never import Pi, domains, tasks,
   plans, orchestration, Drive, consolidation, or autonomy.
4. `lib/memory/episode.ts` is the sole framework capture helper. It may load
   project config and construct the markdown store; callers supply events and
   warning reporters, but no caller builds a parallel serializer.
5. Current disk is reconstructed on every episode-touching retrieve. No count,
   dedupe map, latest-wake map, or fabricated default decides recall, pruning
   eligibility, or wake-state after restart.
6. Chain/Drive/plan/task project work is project-scoped. An authored-memory save
   uses the authored record's scope. A future host may explicitly write user
   scope from an enabled project.
7. Raw Pi sessions, turns, tool calls, chain stages, Drive task chatter, and
   non-status CRUD edits are not episodes. Volume remains
   `O(runs + lifecycle transitions)` per OQ1.

## Decision Log

- **D-001 — Project gate and threshold**
  - Decision: `.cosmonauts/config.json` uses `episodicLog.enabled`; absence is false. The same object has positive-integer `warningThreshold`, default 500 per scope.
  - Alternatives: user config; separate top-level keys; default-on capture.
  - Why: the ratified correction permits only today's project loader. One object mirrors `architectureMap` and supports OQ3's required override.
  - Decided by: user-directed for project-only/off-by-default; planner-proposed for key/default.

- **D-002 — File-per-episode through the existing store**
  - Decision: write `type: episode`, `kind: episodic` under `memory/agent/episodes/*.md` with timestamp + action slug + content-hash uniqueness suffix naming (the same role as notes' 8-char sha — naming/dedupe, not a trust digest) and existing atomic temp/rename machinery; never regenerate `index.md` for an episode.
  - Alternatives: `log.md`; a database/event store; a second interface.
  - Why: this is the ratified mechanism and permits record-granular pruning and concurrent independent writers.
  - Decided by: user-directed.

- **D-003 — Existing fields plus optional retrieved provenance**
  - Decision: timestamp is `timestamp`; actor is `source`; reserved tags are `action:`, `outcome:`, `subject:`, optional `payload:`, and `writer:cosmonauts`. Add only optional `RetrievedMemoryRecord.source` so fresh consumers receive parsed provenance.
  - Alternatives: new draft/query fields; prose-only metadata; undeclared runtime properties.
  - Why: review proved the existing retrieved shape drops actor identity. The optional source field is the narrow additive change explicitly allowed by the hard constraint; all other data fits tags/body.
  - Decided by: user-directed actor rule; planner-proposed encoding; review-required source correction.

- **D-004 — Machine-writer provenance tag (not a trust proof)** (revised 2026-07-17 after second-channel review)
  - Decision: `writeEpisode` stamps a `writer:cosmonauts` provenance tag on machine-written episodes — honest provenance, not a trust or edit-detection proof. W3 exposes no machine-vs-human trust predicate and makes NO safe-prune or edit-detection guarantee. The consolidation sibling's planner owns the machine-vs-human trust predicate, filtering on this tag plus its own consumed-watermark.
  - Alternatives: a SHA-256 integrity envelope (rejected — `parseAuthoredRecord()` discards unknown frontmatter and `trim()`s the body, so a human edit can reproduce the same envelope+digest → a broken safe-prune predicate); trust `source`; require a new provenance field; let consolidation infer from filenames.
  - Why: a content digest cannot be a sound safe-prune predicate here, and deletion authority belongs to the `memory-consolidation` spec. A cheap provenance tag gives consolidation an honest filter without W3 overclaiming trust or pre-empting the sibling's reserved decision.
  - Decided by: second-channel review (PR-015 + Workflow spec-fidelity).

- **D-005 — Conditional retrieval and configured construction**
  - Decision: scan `episodes/` only when `query.recordTypes` includes `episode`. `MarkdownMemoryStoreOptions` gains `episodeWarningThreshold?: number` (default 500). Configured callers load/resolve project settings and pass the effective value into every fresh store; the store itself remains config-free.
  - Alternatives: unconditional scan; query-field threshold; config import inside the store; retained in-memory setting.
  - Why: this preserves zero per-turn episode I/O, unchanged interface signatures, fresh-process overrides, and disk-as-truth.
  - Decided by: user-directed scan rule; review-corrected factory binding.

- **D-006 — Capture after primary persistence**
  - Decision: managers capture create/real status transitions after primary files land; authored memory captures only `written`; chain/Drive own start/terminal run boundaries. Rejected/failed authored saves, same-status updates, stages, and task chatter produce none. Drive-internal task/plan status transitions are DELIBERATELY suppressed and this is enforced by construction: Drive builds its `TaskManager`/`PlanManager` WITHOUT episode context (no `episodeSource`/`reportEpisodeWarning`), so run-internal transitions emit no episode — they are subsumed by the `drive.run` start/terminal pair (boundary rule 7 / OQ1 noise budget). This is a valid, capture-suppressed construction by design, not an accidental gap; a context-free manager is not a type error.
  - Alternatives: instrument every event renderer; Pi session hooks; derive later from transcripts; let Drive-path managers capture per-task transitions (rejected — double-counts the run and blows the noise budget).
  - Why: these are shared seams covering tools, CLI, inline, durable, detached, and resume without duplicate paths; capture applies only to manager calls that CARRY episode context (interactive Pi/CLI tools).
  - Decided by: planner-proposed from OQ1; suppression-by-construction clarified 2026-07-17 after second-channel review (PR-016 + Workflow design-attack).

- **D-007 — Qualified actor flow, including detached Drive** (revised 2026-07-17 after second-channel review)
  - Decision: authored saves use `main/cosmo`; Pi plan/task tools pass their runtime identity; CLI uses `cosmonauts/cli`; chains resolve the first executable stage. When a chain's first executable step is a PARALLEL GROUP, the recorded chain actor is the first member stage's resolved id (via the existing `getFirstExecutableStages()[0]`), falling back to the raw stage name — so the actor is deterministic for group-first chains. When enabled, both Drive launch surfaces freeze in optional `DriverRunSpec.episodeSource` the SAME resolved qualified worker id the Drive run ACTUALLY EXECUTES with — the id the launch path already resolves to spawn the worker, honoring project/live domain bindings exactly as the execution path does. A separate `resolveReference("worker", runtime.domainContext)` contract is NOT introduced (it mis-resolves: undefined/default `domainContext` → unbound scan-all that ignores a `coding` role binding; `main` context → not-found `main/worker`). If the execution-resolved id is not available at freeze time without duplicating resolution, that is a stop-and-revise condition. Resume preserves an existing frozen source; an older source-less run resolves once when capture is newly enabled. A resume that merely completes a PRIOR attempt's finalization RECONCILES that prior attempt's terminal episode using the already-frozen `episodeAttemptId`/run id and content-derived identity (D-009), NOT a new run pair; if the prior attempt's start was never captured (log was off then), it records only the terminal for that attempt. Resolution failure warns and skips capture without failing Drive—no dishonest fallback actor.
  - Alternatives: backend name; generic system actor; resolve in the detached child; a separate `resolveReference("worker", domainContext)` freeze (rejected — wrong actor under default/main context and bound projects).
  - Why: external detached children have no runtime today. Freezing the execution-resolved worker id is the only way to satisfy OQ2 with the correct actor under all bindings while leaving disabled spec bytes unchanged.
  - Decided by: user-directed qualified actor; review-corrected mechanism (PR-011 + PR-013 resume ownership).

- **D-008 — Awaitable, edge-owned warning transport**
  - Decision: `recordEpisode` accepts `reportWarning?: (warning) => void | Promise<void>`, awaits it, falls back to bounded stderr if absent/rejected, and always resolves `disabled | recorded | warning`. Plan/task/authored tools append collected warnings to final visible text; `ChainConfig` gets an optional reporter and `chain-tool.ts` includes warnings in final content; Drive awaits the helper with a reporter that emits/persists `driver_diagnostic` warnings. That Drive reporter SURFACES (rejects/throws on) emit/append failure rather than swallowing it, so `recordEpisode`'s own fail-soft (await reporter → on reject → bounded stderr) provides the fallback. `driver_diagnostic` is added to `BRIDGED_EVENT_TYPES` so the warning also reaches the session bus.
  - Alternatives: details-only; synchronous callback; stderr-only session warnings; global queue; a reporter that swallows emit failure (rejected — it would report success and defeat the stderr fallback).
  - Why: model-visible session warnings and asynchronous diagnostics are real edge contracts. Awaiting prevents unhandled rejection while keeping capture non-load-bearing; surfacing emit failure keeps the fallback honest.
  - Decided by: user-directed behavior; review-corrected transport (PR-014).

- **D-009 — Deterministic content-derived terminal identity and abort reconciliation** (revised 2026-07-17 after second-channel review)
  - Decision: terminal-episode identity is DETERMINISTIC and CONTENT-derived, never filesystem-mtime-derived. Add a deterministic `completedAt` timestamp into `DriverResult`/completion CONTENT, stamped once when the primary result is computed. The terminal episode's `timestamp` (and thus its filename/dedupe hash) derives from that in-content `completedAt` plus the frozen durable run id, `episodeAttemptId`, and `DriverResult.outcome` — NOT from the completion file's mtime. Enabled specs also freeze an `episodeAttemptId`. `runDriveOnGraph` writes the primary completion file before terminal capture. `startDetached().abort()` waits for child exit, reads or writes the authoritative completion, then calls the same terminal-event builder. Because the completion CONTENT is byte-identical across the redundant rewrites (`runDriveOnGraph`, `run-step.ts`, the Pi driver-tool settle path, and parent abort all replace identical bytes — only mtime differs), every completion writer derives the SAME episode path and write-if-changed dedupes to exactly one terminal episode. OPTIONAL secondary hardening: removing the redundant `run-step.ts:86` completion write is viable but NOT required once identity is content-derived.
  - Alternatives: mtime-derived terminal timestamp (rejected — `run.completion.json` is atomically replaced up to three times in detached Drive with no write-if-unchanged guard, so each rewrite changes mtime and the child vs. a later parent-abort reconciliation would render DIFFERENT episode paths → a duplicate terminal pair defeating idempotence); child `finally`; signal handler only; accept start-only records; second abort ledger.
  - Why: SIGTERM can prevent child cleanup. Content-derived identity plus parent reconciliation covers the real exit idempotently across ALL completion writers without a second state store or duplicate terminal record.
  - Decided by: review-required lifecycle correction (PR-012 + Workflow-major).

- **D-010 — Append forever and measure**
  - Decision: no pruning, decay, hard cap, or cache. Episode-touching retrieval reports stats and warns per scope strictly above the threshold.
  - Alternatives: rolling retention; write cap; automatic consolidation; cache.
  - Why: this is ratified OQ3; performance data informs adoption/reassessment.
  - Decided by: user-directed.

## Behaviors

### B-001 - Project config is safely off by default

- Source: AC-001; OQ3 threshold resolution
- Context: project config is absent, omits `episodicLog`, or contains malformed settings
- Action: `loadProjectConfig()` parses it
- Expected: only literal `enabled: true` enables capture; valid positive-integer thresholds survive; malformed object/fields warn and are ignored without disturbing unrelated config; default settings are disabled with threshold 500
- Seam: `lib/config/loader.ts`
- Test: `tests/config/loader.test.ts` > `parses episodicLog as an off-by-default project gate with a positive threshold`
- Marker: `@cosmo-behavior plan:episodic-log#B-001`

### B-002 - Disabled helper capture is inert

- Source: AC-001
- Context: the gate is absent or false
- Action: `recordEpisode()` receives a valid event
- Expected: it returns `disabled`, constructs/calls no store, emits no warning, and creates no project or user memory/index/episode file
- Seam: `lib/memory/episode.ts`
- Test: `tests/memory/interface.test.ts` > `recordEpisode creates and warns nothing when episodicLog is disabled`
- Marker: `@cosmo-behavior plan:episodic-log#B-002`

### B-003 - Fresh retrieval preserves the complete episode envelope

- Source: AC-002; OQ2 actor resolution
- Context: enabled project and user events are written through the helper
- Action: a fresh store retrieves `recordTypes: ["episode"]`
- Expected: records expose `type: episode`, `kind: episodic`, correct physical scope, timestamp, optional-interface `source` with the qualified actor, action/outcome/subject tags, human-readable body, resource, and absolute path; architecture-map records remain type-compatible with `source` absent
- Seam: `lib/memory/types.ts` and `lib/memory/markdown-store.ts`
- Test: `tests/memory/interface.test.ts` > `retrieves episode actor and envelope through the narrowly extended MemoryStore result`
- Marker: `@cosmo-behavior plan:episodic-log#B-003`

### B-004 - Machine-written episodes carry a provenance tag consolidation can filter

- Source: AC-002; `memory-consolidation` provenance filter
- Context: a fresh store contains a helper-written episode and a human-created episode
- Action: episodes are parsed/retrieved
- Expected: the helper-written episode carries the `writer:cosmonauts` provenance tag and it is parsed/exposed; the human-created episode lacks the tag; both remain recallable. W3 provides NO safe-prune or edit-detection predicate — the machine-vs-human trust predicate is `memory-consolidation`'s (its planner owns it, filtering on this tag plus its own consumed-watermark). No digest is computed or checked.
- Seam: `lib/memory/episodic-records.ts`
- Test: `tests/memory/interface.test.ts` > `stamps and parses the writer:cosmonauts provenance tag and leaves human episodes untagged`
- Marker: `@cosmo-behavior plan:episodic-log#B-004`

### B-005 - Wake records reconstruct trigger payload and outcome after restart

- Source: AC-002, AC-004; `autonomy-host` restart/wake-state criteria
- Context: multiple `autonomy.wake` events exist for one trigger and payload, plus another trigger
- Action: a fresh process retrieves and parses episode tags ordered by persisted timestamp/path
- Expected: each wake has qualified host `source`, trigger subject, required stable payload tag, outcome, timestamp, and attempt details; filtering exact tags yields the latest relevant wake without an in-memory default or parallel state file
- Seam: `lib/memory/episodic-records.ts` metadata parser over `MemoryStore.retrieve()`
- Test: `tests/memory/interface.test.ts` > `reconstructs latest wake state from stable trigger payload outcome and timestamp fields`
- Marker: `@cosmo-behavior plan:episodic-log#B-005`

### B-006 - Episode writes are append-only and absent from index.md

- Source: AC-002, AC-003; file-per-episode directive
- Context: authored records/index and episode files coexist
- Action: an episode is written and a later authored save regenerates the index
- Expected: direct-child timestamp/action/hash files use atomic persistence; identical rendering is idempotent; a non-identical occupant is preserved with a safe suffix/failure; episode write does not create/rewrite `index.md`; later index regeneration never scans or lists episodes
- Seam: `lib/memory/markdown-store.ts`
- Test: `tests/memory/markdown-store.test.ts` > `writes append-only episode files without creating rewriting or entering index.md`
- Marker: `@cosmo-behavior plan:episodic-log#B-006`

### B-007 - Only explicit episode queries scan episodes

- Source: AC-003; conditional-scan directive
- Context: valid and malformed episodes coexist with authored records
- Action: retrieve runs without and then with `episode` in `recordTypes`
- Expected: the first path has authored-only records/warnings/stats and never walks episodes; the second scans/parses episodes, returns healthy matches, and names malformed paths
- Seam: `lib/memory/markdown-store.ts` retrieval dispatch
- Test: `tests/memory/markdown-store.test.ts` > `scans episodes only when recordTypes explicitly includes episode`
- Marker: `@cosmo-behavior plan:episodic-log#B-007`

### B-008 - Fresh stores honor default and configured large-log thresholds

- Source: AC-007; OQ3 resolution
- Context: project/user scopes contain valid and malformed episodes around default and overridden thresholds
- Action: configured and direct fresh stores perform episode-touching retrieval
- Expected: `filesScanned`/`bytesRead` include every episode file read; warnings occur per scope only when count is greater than the effective threshold and use “episode log large — N records; run consolidation”; configured constructors preserve overrides after restart; authored-only retrieval never warns
- Seam: `MarkdownMemoryStoreOptions.episodeWarningThreshold`
- Test: `tests/memory/markdown-store.test.ts` > `binds default and overridden episode thresholds into fresh-store stats and warnings`
- Marker: `@cosmo-behavior plan:episodic-log#B-008`

### B-009 - Enabled recall returns episodes through the existing tool shape

- Source: AC-004; recall-inclusion directive
- Context: authorized Cosmo runs in an enabled project with matching authored and episode records
- Action: it calls existing `recall(query)`
- Expected: recall requests authored types plus `episode`, returns full episode bodies/source/stats in visible text/details, preserves profile pinning and the 5/20 non-profile bound, and adds neither a type parameter nor an episode arm to `remember`
- Seam: `domains/shared/extensions/agent-memory/index.ts`
- Test: `tests/extensions/agent-memory.test.ts` > `recalls enabled episodes through the existing bounded recall tool`
- Marker: `@cosmo-behavior plan:episodic-log#B-009`

### B-010 - Deleted and malformed episodes are recall-only warnings

- Source: AC-005; malformed-warning correction
- Context: one episode is deleted and the rest are malformed
- Action: a fresh session injects authored context and then performs enabled recall
- Expected: session start succeeds with no episode warning; recall returns no episodes, names malformed paths/reasons through bounded visible warning text/details, reflects deletion as absence, and creates no file
- Seam: `domains/shared/extensions/agent-memory/index.ts`
- Test: `tests/extensions/agent-memory.test.ts` > `surfaces malformed episode warnings only on episode-touching recall and tolerates deletion`
- Marker: `@cosmo-behavior plan:episodic-log#B-010`

### B-011 - Every capture setup/write/reporter failure is non-fatal

- Source: AC-006; fail-soft directive
- Context: config load, store construction, store write, or awaitable reporter throws/rejects, or write returns failed/unsupported
- Action: `recordEpisode()` attempts capture
- Expected: it never rejects; returns one bounded `warning` with path/reason when available; awaits a reporter at most once and falls back to stderr if unusable; leaves no partial episode; primary callers retain their prior result
- Seam: `lib/memory/episode.ts`
- Test: `tests/memory/interface.test.ts` > `converts setup write and awaitable warning-reporter failures into one non-fatal result`
- Marker: `@cosmo-behavior plan:episodic-log#B-011`

### B-012 - Authored saves log only successful writes

- Source: AC-002, AC-006; OQ1 authored-save vocabulary
- Context: enabled Cosmo creates/updates notes, profile, and playbooks, with one episode failure
- Action: `remember` receives its primary store result
- Expected: each `written` result yields one same-scope `memory.saved` episode sourced `main/cosmo` and subject-tagged by resource; confirmation-required, unsupported, failed, declined, or unanswered saves yield none; episode failure leaves authored bytes/result successful and appends a visible warning
- Seam: `domains/shared/extensions/agent-memory/index.ts` post-write boundary
- Test: `tests/extensions/agent-memory.test.ts` > `records only successful authored saves and keeps remember successful on episode failure`
- Marker: `@cosmo-behavior plan:episodic-log#B-012`

### B-013 - Plan lifecycle capture is additive and gated

- Source: AC-001, AC-002, AC-006; OQ1 plan vocabulary
- Context: absent/false and enabled managers create plans, edit body/title, repeat status, and change status with a fault-injected capture
- Action: `PlanManager.createPlan/updatePlan` persist operations
- Expected: disabled return/files remain baseline-identical with no memory paths; enabled persistence yields exactly `plan.created` and actual `plan.status-changed` events using slug and old/new state; non-status/same-status edits yield none; capture failure cannot reject/rollback or change `createdAt`
- Seam: `lib/plans/plan-manager.ts`
- Test: `tests/plans/plan-manager.test.ts` > `adds gated fail-soft episodes only for plan creation and real status transitions`
- Marker: `@cosmo-behavior plan:episodic-log#B-013`

### B-014 - Task lifecycle capture is additive and gated

- Source: AC-001, AC-002, AC-006; OQ1 task vocabulary
- Context: absent/false and enabled managers create tasks, edit fields, repeat status, and transition status with a fault-injected capture
- Action: `TaskManager.createTask/updateTask` persist operations
- Expected: capture applies only to manager calls that CARRY episode context (interactive Pi/CLI tools); a manager constructed WITHOUT episode context (e.g. the Drive path) is a valid, capture-suppressed construction (no type error) and intentionally captures nothing; disabled ID/file/return behavior remains baseline-identical with no memory paths; enabled context-carrying persistence yields `task.created` after lock release and one event per actual status transition; non-status/same-status edits yield none; capture cannot alter locking, allocation, filename, or success
- Seam: `lib/tasks/task-manager.ts`
- Test: `tests/tasks/task-manager.test.ts` > `adds gated fail-soft episodes only for task creation and real status transitions`
- Marker: `@cosmo-behavior plan:episodic-log#B-014`

### B-015 - Inline chains record one complete run lifecycle

- Source: AC-002, AC-006; OQ1/OQ2 run resolutions
- Context: enabled inline chains succeed, fail, abort, or throw with one/many stages
- Action: `runChain()` crosses start and terminal paths
- Expected: one start and one terminal `chain.run` episode share a private subject id and resolved first-stage actor; when the first executable step is a parallel group the actor is the first member stage's resolved id (via `getFirstExecutableStages()[0]`), falling back to the raw stage name; stages/turns/tools add none; capture failures leave ChainResult, errors, event order, and thrown behavior unchanged
- Seam: `lib/orchestration/chain-runner.ts`
- Test: `tests/orchestration/chain-runner.test.ts` > `records exactly one fail-soft inline chain start and terminal episode across exit paths`
- Marker: `@cosmo-behavior plan:episodic-log#B-015`

### B-016 - Durable chains reuse their persisted run identity

- Source: AC-002, AC-006; OQ1/OQ2 run resolutions
- Context: enabled durable chains reach success or failure
- Action: `runDurableChain()` runs/reconstructs durable state
- Expected: start/terminal episodes use returned durable `chain-*` id and resolved actor (for a group-first chain, the first member stage's resolved id via `getFirstExecutableStages()[0]`, falling back to the raw stage name); primary graph/events/steps/ChainResult remain unchanged; capture warning reaches the supplied reporter without changing durable outcome
- Seam: `lib/orchestration/durable-chain-runner.ts`
- Test: `tests/orchestration/run-start-chain-characterization.test.ts` > `records durable chain episodes with the persisted run id and unchanged reconstruction`
- Marker: `@cosmo-behavior plan:episodic-log#B-016`

### B-017 - Common Drive results produce one terminal episode

- Source: AC-002, AC-006; OQ1 run resolution
- Context: enabled inline Drive completes, blocks, aborts, or finalization-fails, including resume attempts; a multi-task run flips several task statuses; worker resolves under default/undefined, `main`, and `coding`-bound contexts
- Action: `runDriveOnGraph()` writes its primary completion and terminal capture
- Expected: each attempt has one `drive.run` start/terminal pair, stable run subject plus attempt tag, frozen source, and exact `DriverResult.outcome`; the terminal episode's identity (timestamp/filename/dedupe hash) is CONTENT-derived from the in-content `completedAt` plus run id, attempt id, and outcome — NOT the completion-file mtime — so it is idempotent across all completion writers (runDriveOnGraph, run-step, driver-tool settle, parent abort). The frozen source EQUALS the actually-executed worker id under (a) undefined/default domain context, (b) `main` context, and (c) project and live `coding`-role bindings. Drive constructs its `TaskManager`/`PlanManager` without episode context, so the enabled multi-task run produces ZERO `task.status-changed` episodes — only the `drive.run` pair. A resume that merely completes a PRIOR attempt's finalization reconciles that prior attempt's terminal episode using the frozen `episodeAttemptId`/run id and content-derived identity, NOT a new run pair; if the prior attempt's start was never captured, it records only the terminal. Completion bytes/events remain authoritative and episode failure cannot replace result
- Seam: `lib/driver/drive-graph-runner.ts`
- Test: `tests/driver/drive-on-graph-acceptance.test.ts` > `records one terminal episode for every Drive result outcome after completion persistence`; resume-path coverage in `tests/cli/drive/graph-resume.test.ts` no-backend terminal-result path
- Marker: `@cosmo-behavior plan:episodic-log#B-017`

### B-018 - The compiled detached child uses frozen episode identity

- Source: AC-002, AC-006; OQ2 resolution
- Context: enabled Codex/Claude detached specs carry source and attempt id into compiled `run-step`
- Action: the child executes `runDriveOnGraph()`
- Expected: its episode pair uses frozen qualified source/run/attempt identity and exact result; the frozen source equals the worker the run actually executes with under (a) undefined/default domain context, (b) `main` context, and (c) project and live `coding`-role bindings; no runtime resolution occurs in the child; terminal identity remains content-derived from the frozen ids plus the in-content `completedAt`; normal completion/spec/graph/event artifacts remain unchanged
- Seam: `lib/driver/run-step.ts`
- Test: `tests/driver/run-step.test.ts` > `uses frozen episode actor and attempt identity in the detached runner`
- Marker: `@cosmo-behavior plan:episodic-log#B-018`

### B-019 - Parent abort reconciles exactly one detached terminal episode

- Source: AC-002, AC-006; lifecycle exit invariant
- Context: an enabled detached child has written its start episode and is then aborted before or around completion
- Action: `DriverHandle.abort()` terminates/waits for the child, resolves the completion, and invokes the shared terminal builder
- Expected: authoritative completion remains existing behavior (`completed` if already landed, otherwise parent-written `aborted`); its terminal event is CONTENT-derived from the in-content `completedAt` plus run/attempt/outcome (NOT the completion-file mtime) and renders idempotently across all completion writers (runDriveOnGraph, run-step, driver-tool settle, parent abort); exactly one terminal episode exists for the attempt over a reconcilable surface, never a permanent start-only or duplicate pair — EXCEPT an externally hard-killed fire-and-forget `launchDetached` child, which may leave a start-only record (a documented residual of any unreconciled detached surface, not a duplicate)
- Seam: `lib/driver/driver.ts`
- Test: `tests/driver/driver-detached.test.ts` > `reconciles one terminal episode when the parent aborts after detached start`
- Marker: `@cosmo-behavior plan:episodic-log#B-019`

### B-020 - The finite v1 vocabulary enforces the noise budget

- Source: AC-002; OQ1 resolution and raw-session correction
- Context: events include ratified actions plus raw sessions, turns, stages, task chatter, and arbitrary edits
- Action: pure event validation and integrated call sites run
- Expected: only chain/Drive lifecycle, plan/task create/status, successful authored saves, and caller-owned `autonomy.wake` are accepted/captured; volume tracks runs/transitions, not sessions/turns/tasks
- Seam: `lib/memory/episodic-records.ts`
- Test: `tests/memory/interface.test.ts` > `accepts only the ratified consequential event vocabulary and rejects chatter`
- Marker: `@cosmo-behavior plan:episodic-log#B-020`

### B-021 - Disabled Cosmo memory remains byte-identical to W2

- Source: AC-001
- Context: gate absent/false with the shipped W2 authored fixtures
- Action: session injection, `remember`, and `recall` run
- Expected: tool schemas/descriptions, outputs/details, consent/collision behavior, injected bytes, and file set match W2 exactly; no episode path or episode-induced index appears
- Seam: `domains/shared/extensions/agent-memory/index.ts`
- Test: `tests/extensions/agent-memory.test.ts` > `keeps disabled remember recall injection and files byte-identical to W2`
- Marker: `@cosmo-behavior plan:episodic-log#B-021`

### B-022 - Enabled episode stores do not affect injection

- Source: AC-003; injection-exclusion directive
- Context: identical authored stores differ only by valid, malformed, and over-threshold episodes
- Action: `before_agent_start` builds context
- Expected: hidden context bytes and authored scan stats are equal; query types are exactly note/profile/playbook; no episode body/title/size/malformed warning appears
- Seam: `domains/shared/extensions/agent-memory/index.ts`
- Test: `tests/extensions/agent-memory.test.ts` > `keeps enabled injected context byte-identical when episodes exist`
- Marker: `@cosmo-behavior plan:episodic-log#B-022`

### B-023 - Plan tools supply actor and visible warning transport

- Source: AC-002, AC-006; OQ2 source rule
- Context: qualified Pi plan create/edit succeeds while enabled capture succeeds or fails
- Action: plans extension invokes its manager with source and awaitable reporter
- Expected: successful episodes carry qualified source; failure leaves original plan tool text/details successful and appends a bounded model-visible warning; disabled tool output remains existing text
- Seam: `domains/shared/extensions/plans/index.ts`
- Test: `tests/extensions/plans.test.ts` > `preserves plan tool results while supplying episode actor and visible failure warning`
- Marker: `@cosmo-behavior plan:episodic-log#B-023`

### B-024 - Task tools supply actor and visible warning transport

- Source: AC-002, AC-006; OQ2 source rule
- Context: qualified Pi task create/edit succeeds while enabled capture succeeds or fails
- Action: tasks extension invokes its manager with source and awaitable reporter
- Expected: successful episodes carry qualified source; failure leaves original task tool text/details successful and appends a bounded model-visible warning; disabled tool output remains existing text
- Seam: `domains/shared/extensions/tasks/index.ts`
- Test: `tests/extensions/task-tools.test.ts` > `preserves task tool results while supplying episode actor and visible failure warning`
- Marker: `@cosmo-behavior plan:episodic-log#B-024`

### B-025 - Chain tool returns capture warnings in final model-visible text

- Source: AC-006; fail-soft warning directive
- Context: chain work succeeds but start or terminal episode capture fails
- Action: `chain_run` passes an awaitable reporter to the runner
- Expected: ChainResult and progress semantics remain successful; final tool content (not details alone) names the non-fatal episode warning exactly once; CLI runner without session reporter uses stderr
- Seam: `domains/shared/extensions/orchestration/chain-tool.ts`
- Test: `tests/extensions/orchestration-chain-tool-observation.test.ts` > `includes fail-soft episode warnings in final chain tool content`
- Marker: `@cosmo-behavior plan:episodic-log#B-025`

### B-026 - Drive capture warnings persist as non-fatal diagnostics

- Source: AC-006; fail-soft warning directive
- Context: Drive primary work succeeds/returns but episode capture fails
- Action: the runner awaits a reporter that emits `driver_diagnostic`
- Expected: the warning is present in the legacy JSONL, the normalized durable events, AND the session bus (because `driver_diagnostic` is added to `BRIDGED_EVENT_TYPES`), each with path/reason; Drive result/completion remain unchanged; on reporter/emit/append failure the reporter SURFACES (rejects) the failure so `recordEpisode`'s own fail-soft falls back to bounded stderr without rejecting — the reporter never swallows failure and reports false success
- Seam: `lib/driver/drive-graph-runner.ts` diagnostic reporter and `lib/driver/event-stream.ts` (`BRIDGED_EVENT_TYPES`)
- Test: `tests/driver/drive-on-graph-recovery.test.ts` > `persists episode capture failure as a non-fatal Drive diagnostic`
- Marker: `@cosmo-behavior plan:episodic-log#B-026`

### B-027 - Disabled inline and durable chains preserve all baselines

- Source: AC-001
- Context: gate absent/false for inline and durable chains
- Action: both runners execute
- Expected: results, errors, callbacks/event ordering, durable graphs/steps/events, and created files match frozen pre-W3 baselines; neither project nor user episode/index path is created
- Seam: `lib/orchestration/chain-runner.ts` and `durable-chain-runner.ts`
- Test: `tests/orchestration/chain-runner.test.ts` > `keeps disabled inline and durable chain outputs events and files unchanged`
- Marker: `@cosmo-behavior plan:episodic-log#B-027`

### B-028 - Disabled Drive specs and execution preserve all baselines

- Source: AC-001
- Context: gate absent/false across Pi/CLI inline and detached launch
- Action: specs are created and Drive executes/aborts
- Expected: no episode source/attempt field is serialized, detached launch still avoids runtime resolution, result/completion/events/spec bytes match baselines, and no project/user episode/index path appears
- Seam: Drive launch and `runDriveOnGraph()` disabled branches
- Test: `tests/driver/drive-on-graph-routing.test.ts` > `keeps disabled Drive specs results events and files byte-identical`
- Marker: `@cosmo-behavior plan:episodic-log#B-028`

### B-029 - Documentation states the full W3 contract

- Source: AC-008; OQ1/OQ2/OQ3 and corrections
- Context: a human evaluates enablement and downstream use
- Action: they read `docs/memory.md`
- Expected: it documents gate/threshold, layout/example/reserved tags (including the `writer:cosmonauts` provenance tag), exact vocabulary, scope/actors, payload/subject conventions, recall versus injection/index, append-forever/full-rescan stats, warning channels, no raw sessions, W2 preservation, the machine-writer provenance tag with the explicit statement that the safe-prune predicate belongs to `memory-consolidation`, and the fresh-process wake-state contract
- Seam: `docs/memory.md`
- Test: `tests/memory/interface.test.ts` > `documents the episodic gate vocabulary cost and consumer contracts`
- Marker: `@cosmo-behavior plan:episodic-log#B-029`

## Design

### 1. Pure episode contract

Create `lib/memory/episodic-records.ts` for:

```ts
interface EpisodeEvent {
  readonly scope: "project" | "user";
  readonly source: string;
  readonly action:
    | "chain.run" | "drive.run"
    | "plan.created" | "plan.status-changed"
    | "task.created" | "task.status-changed"
    | "memory.saved" | "autonomy.wake";
  readonly outcome: string; // normalized non-empty token
  readonly subject: { readonly kind: string; readonly id: string };
  readonly payload?: { readonly kind: string; readonly id: string };
  readonly summary: string;
  readonly details?: string;
  readonly tags?: readonly string[];
  readonly timestamp?: string;
}
```

It generates/parses exact reserved tags and rejects caller attempts to replace
them. `autonomy.wake` requires `payload`; other actions may omit it. The rendered
body starts with Timestamp, Actor, Action, Outcome, Subject, and optional Payload
before concise details.

`writeEpisode` stamps the canonical `writer:cosmonauts` provenance tag (replacing
any caller-supplied writer tag), and returns a retrieved record containing
optional `source`. The episode FILENAME keeps a content-hash suffix for
uniqueness/dedupe ONLY — the same role as notes' 8-char sha; it is naming, not a
trust digest. W3 computes no integrity digest and exposes no
edit-detection/safe-prune predicate: the provenance tag is honest provenance, not a
trust proof, and the machine-vs-human trust predicate belongs to
`memory-consolidation`'s planner (which filters on this tag plus its own
consumed-watermark).

### 2. Store and retrieval

`lib/memory/okf.ts` adds an episode input/`expectedType` arm requiring durable
scope, episodic kind, non-empty source, and one valid action/outcome/subject tag
(and payload for wakes). A human-edited episode remains fully readable and
recallable; W3 asserts no edit-detection over it.

`lib/memory/paths.ts` adds `episodesDir` and `episodeResource`. The
`markdown-store.ts` write switch adds `writeEpisode`; it reuses atomic
write-if-changed, never calls index regeneration, preserves non-identical
occupants, and keeps episode files direct children. Retrieval computes
`includeEpisodes` only from explicit `recordTypes`. Index regeneration passes
`includeEpisodes: false` and also filters episode defensively.

Add optional `source?: string` to `RetrievedMemoryRecord` and thread it from OKF
parse through `toRetrievedRecord`. Re-pin the intentional interface hash and
prove the architecture adapter remains unchanged/compatible. This is the only
`lib/memory/types.ts` change.

Add `episodeWarningThreshold?: number` to
`MarkdownMemoryStoreOptions`/extension factory options, defaulting to 500. The
store counts files per physical scope, includes valid/malformed reads in stats,
and emits the exact OQ3 warning only when count is greater than threshold.
It imports no config.

### 3. Configured capture helper

Create `lib/memory/episode.ts`:

```ts
type EpisodeCaptureResult =
  | { readonly kind: "disabled" }
  | { readonly kind: "recorded"; readonly path: string }
  | { readonly kind: "warning"; readonly warning: MemoryWarning };

type EpisodeWarningReporter =
  (warning: MemoryWarning) => void | Promise<void>;

recordEpisode(options: {
  readonly projectRoot: string;
  readonly event: EpisodeEvent;
  readonly userCosmonautsRoot?: string;
  readonly reportWarning?: EpisodeWarningReporter;
}): Promise<EpisodeCaptureResult>;
```

It loads config first and returns disabled before store construction unless
`enabled === true`. A pure resolver maps missing/malformed threshold to 500;
helper and agent-memory recall pass the effective value into fresh store
construction. Future consolidation/autonomy consumers use the same resolver
when constructing direct stores, even if they are only reading historical
records. Config, construction, write, and reporter failures are caught. The
helper awaits one reporter; absent/rejected reporters fall back to bounded
stderr. It never imports a caller module or Pi.

### 4. Capture ownership

- Plan/task managers accept optional `{ episodeSource, reportEpisodeWarning }`
  constructor context. They call the helper after successful primary persistence
  and compare old/new status. Task create captures after releasing the ID/file
  lock. Pi tools derive qualified runtime identity; CLI create/edit passes
  `cosmonauts/cli`. Existing output modes stay unchanged when disabled.
- Agent-memory uses `main/cosmo`, same scope, and authored resource subject only
  after `written`. Its visible result collects an awaited warning. Recall loads
  settings and builds a threshold-bound store; injection continues to construct
  its authored-only store/query and never reads episodes.
- Inline chain allocates a private subject id; durable chain uses its returned
  run id. Both resolve the first executable stage and accept optional
  `ChainConfig.reportEpisodeWarning`. `chain-tool.ts` collects warnings and
  includes them in final model-visible content; CLI omits reporter and gets
  stderr. `ChainResult` remains unchanged.

### 5. Drive identity, completion ordering, and abort exit

Enabled Pi and CLI launch first load only project config. Disabled detached Pi
preserves today's `getRuntime`-not-called path. If enabled, launch freezes the
SAME resolved qualified worker id the Drive run ACTUALLY EXECUTES with — the id
the launch path already resolves to spawn the worker, honoring project/live
domain bindings exactly as the execution path does. It does NOT introduce a
separate `resolveReference("worker", runtime.domainContext)` contract, which
mis-resolves under undefined/default `domainContext` (unbound scan-all that
ignores a `coding` role binding) and under `main` context (not-found
`main/worker`). If the execution-resolved id is not available at freeze time
without duplicating resolution, that is a stop-and-revise condition. It
conditionally freezes:

```ts
readonly episodeSource?: string;
readonly episodeAttemptId?: string;
```

in `DriverRunSpec`; disabled specs omit both. New enabled runs generate an
attempt id. Resume preserves `episodeSource` from the frozen original and creates
a new attempt id; a legacy source-less enabled resume resolves once. Because the
CLI resume path calls `prepareResume()` BEFORE `createRunSpec()`/runtime
resolution/`runDriveOnGraph()`, a resume that merely completes a PRIOR attempt's
finalization (finishes, prints a completed result, and returns without reaching
the mint seam) must RECONCILE that prior attempt's terminal episode using the
already-frozen `episodeAttemptId`/run id and the content-derived identity below —
NOT mint a new run pair. If the prior attempt's start was never captured (the log
was off then), it records only the terminal for that attempt. Resolution failure
is a visible warning and skips run capture, never a generic actor. The detached
child performs no runtime/config actor resolution.

`runDriveOnGraph` records start, computes its primary `DriverResult` (stamping a
deterministic `completedAt` into `DriverResult`/completion CONTENT once, when the
primary result is computed), writes `run.completion.json`, then calls an exported
shared terminal event builder using that in-content `completedAt` plus run id,
attempt id, source, and outcome — the terminal `timestamp`, filename, and dedupe
hash are CONTENT-derived, never from the completion file's mtime. On thrown paths
without completion it records a failed terminal event in catch and rethrows
unchanged. Its awaitable warning reporter emits the existing `driver_diagnostic`,
which reaches legacy JSONL, normalized durable events, and — via
`BRIDGED_EVENT_TYPES` — the session bus.

`DriverHandle.abort()` in `lib/driver/driver.ts` stops the bridge, sends SIGTERM,
waits for child exit, then reads an existing completion or writes the existing
aborted completion shape. It invokes the same terminal builder. Because the
completion CONTENT is byte-identical across the redundant rewrites
(`runDriveOnGraph`, `run-step.ts`, the Pi driver-tool settle path, and this
parent abort all replace identical bytes — only mtime differs), every writer
derives the SAME content-`completedAt`-derived timestamp/action/hash path and
write-if-changed dedupes to exactly one terminal episode. This ordering covers
child death between completion and capture without a second ledger. (Removing the
redundant `run-step.ts:86` completion write is an OPTIONAL secondary hardening,
not required once identity is content-derived.)

### 6. Recall/injection and consumers

The agent-memory extension uses three explicit lists:

- injection: note/profile/playbook exactly;
- disabled recall: W2 list exactly;
- enabled recall: W2 list plus episode.

No tool schema parameter changes. Profile pinning and 5/20 non-profile bounds
apply. Episode rendering conditionally adds actor/payload without changing
authored-only output. Malformed/large warnings use existing visible bounded
formatting only on episode-touching recall.

Consolidation later retrieves episodes and identifies machine-written ones via
the `writer:cosmonauts` provenance tag plus its own consumed-watermark (its
planner's decision); W3 exposes no safe-prune predicate and makes no
edit-detection guarantee. Autonomy later writes `autonomy.wake` through
`recordEpisode`, then reconstructs latest state from source/subject/payload/
outcome/timestamp tags on a fresh retrieve. No delete API, consolidation logic,
trigger, scheduler, or host is built here.

## Files to Change

- **New:** `missions/plans/episodic-log/pi-first-audit.md` — supplementary Pi 0.80.6 evidence; no behavior marker duplication.
- **New:** `lib/memory/episodic-records.ts` ↔ `tests/memory/interface.test.ts` — event vocabulary, tags, wake payload, provenance tag, metadata parser.
- **New:** `lib/memory/episode.ts` ↔ `tests/memory/interface.test.ts` — config-gated fail-soft capture and awaitable warnings.
- `lib/memory/types.ts`, `authored-records.ts`, `okf.ts`, `paths.ts`, `markdown-store.ts`, and `index.ts` ↔ `tests/memory/interface.test.ts` and `tests/memory/markdown-store.test.ts` — optional retrieved source, episode parse/write/layout/scan/index/stats/threshold/public exports.
- `lib/config/types.ts` and `lib/config/loader.ts` ↔ `tests/config/loader.test.ts` — additive `episodicLog` parsing. Preserve the unrelated existing doc-comment edit.
- `domains/shared/extensions/agent-memory/index.ts` ↔ `tests/extensions/agent-memory.test.ts` — successful-save capture, configured recall, unchanged injection, conditional rendering/warnings.
- `lib/plans/plan-manager.ts`, `domains/shared/extensions/plans/index.ts`, `cli/plans/commands/create.ts`, and `cli/plans/commands/edit.ts` ↔ `tests/plans/plan-manager.test.ts`, `tests/extensions/plans.test.ts`, and existing `tests/cli/plans/commands/{create,edit}.test.ts` — gated lifecycle ownership, actor, visible warning, CLI provenance/parity.
- `lib/tasks/task-manager.ts`, `domains/shared/extensions/tasks/index.ts`, `cli/tasks/commands/create.ts`, and `cli/tasks/commands/edit.ts` ↔ `tests/tasks/task-manager.test.ts`, `tests/extensions/task-tools.test.ts`, and existing `tests/cli/tasks/commands/{create,edit}.test.ts` — gated lifecycle ownership, lock-safe capture, actor, warnings, CLI/batch parity.
- `lib/orchestration/types.ts`, `chain-runner.ts`, `durable-chain-runner.ts`, and `domains/shared/extensions/orchestration/chain-tool.ts` ↔ `tests/orchestration/chain-runner.test.ts`, `tests/orchestration/run-start-chain-characterization.test.ts`, and `tests/extensions/orchestration-chain-tool-observation.test.ts` — split inline/durable ownership and final visible warnings.
- `lib/driver/types.ts` (adds `DriverResult.completedAt`), `drive-graph-runner.ts`, `driver.ts`, `run-step.ts`, and `event-stream.ts` (adds `driver_diagnostic` to `BRIDGED_EVENT_TYPES`) ↔ `tests/driver/{drive-on-graph-acceptance,drive-on-graph-recovery,drive-on-graph-routing,driver-detached,run-step,event-stream}.test.ts` — conditional source/attempt, deterministic content-`completedAt`-derived terminal identity, completion-first terminal capture, `driver_diagnostic` bus bridging, parent abort reconciliation.
- `domains/shared/extensions/orchestration/driver-tool.ts` and `cli/drive/subcommand.ts` ↔ `tests/extensions/{orchestration-driver-tool,orchestration-driver-detached}.test.ts` and `tests/cli/drive/{run,graph-run,graph-resume}.test.ts` — enabled-only execution-resolved worker id frozen as actor, with coverage that the frozen actor equals the actually-executed worker under (a) undefined/default domain context, (b) `main` context, and (c) project and live `coding`-role bindings; frozen identity, prior-attempt resume reconciliation (graph-resume no-backend terminal-result path), disabled spec parity.
- `docs/memory.md` ↔ `tests/memory/interface.test.ts` — full W3 operating and consumer contract.
- `missions/plans/episodic-log/review.md` — retained review evidence; not implementation code.

## Risks

- **Off-state drift:** every modified owner has a named disabled characterization
  plus existing CLI/tool regressions. If enabled-only runtime/spec data cannot be
  omitted while off, move derivation later rather than weaken AC-001.
- **Cross-process terminal race:** completion must precede child terminal capture;
  parent must wait for exit and reuse the shared content-derived terminal builder.
  Because `run.completion.json` is atomically rewritten multiple times (mtime
  changes each time), terminal identity is derived from the in-content
  `completedAt` plus run/attempt/outcome, never mtime, so every writer dedupes to
  one terminal. If tests cannot prove idempotence, stop and redesign before
  shipping start records.
- **Provenance not authentication:** the `writer:cosmonauts` tag is honest
  provenance a human can trivially add or remove — not a trust proof, edit
  detector, or authentication. Documentation and naming must not present it as
  security or a safe-prune guarantee (that predicate is `memory-consolidation`'s).
- **Fire-and-forget residual:** a hard-killed (external SIGKILL) fire-and-forget
  `launchDetached` child — which has no reconciling parent `abort()` — may leave a
  start-only episode. This is a documented residual inherent to any unreconciled
  detached surface, off by default and not a duplicate; terminal-evidence
  guarantees are scoped to reconcilable surfaces (inline, `startDetached` +
  `abort()`, resume).
- **Warning invisibility/duplication:** one reporter owns each session edge.
  Details-only, partial-only, and double stderr+tool warnings fail B-023–B-026.
- **Actor ambiguity:** enabling detached capture may require runtime creation that
  disabled detached mode intentionally avoids. Resolution failure warns/skips;
  it never fails Drive or fabricates a source.
- **Scan growth:** only stats/threshold are allowed. A cache, write cap, retention,
  or pruning policy requires reassessment/new plan.
- **Interface blast radius:** optional retrieved `source` must leave architecture
  adapter behavior and all W2 output unchanged. Any further types change is a
  stop-and-revise condition.
- **Artifact stranding:** Drive excludes `missions/**` and `memory/**`; manually
  include audit/review/docs artifacts and remove scratch episodes/generated maps.

## Quality Contract

| Order | Gate kind | Tier | Binding state | Threshold | Protocol | Degradation / notes |
|---:|---|---|---|---|---|---|
| 1 | `correctness` | universal | bound | Project-native tests/static/type checks pass; B-001–B-029 evidence is green | project-discovered | hard fail |
| 2 | `artifact-conformance` | universal | bound | Required fields, root-relative existing evidence files, and exactly one executable owner for each exact marker pass | artifact evidence | hard fail |
| 3 | `mutation` | bindable | unbound | Negative tests kill unconditional scans/indexing, dropped source, dropped `writer:cosmonauts` provenance tag on a real writeEpisode→retrieve, missing payload, thrown warnings, mtime-derived terminal identity, duplicate/missing terminals, same-status capture, Drive-path per-task capture, disabled diagnostic-bus drift on a pre-existing `driver_diagnostic`, and disabled metadata drift | pending | unbound; automated targeted tests plus reviewer judgment required |
| 4 | `duplication` | bindable | unbound | One serializer/capture helper, one manager owner per lifecycle, one chain/Drive run owner, one wake store | pending | unbound; boundary review required |
| 5 | `boundary-conformance` | bindable | bound | Only optional retrieved `source` and factory/spec options are additive; store core is config/Pi/lifecycle-free; disabled specs omit episode fields | project-discovered | hard fail through contract/source tests |
| 6 | `dead-code` | bindable | unbound | Every exported vocabulary/parser/result arm is exercised; no cache/pruner/registry/host scaffolding | pending | unbound; reviewer judgment required |

Plan-specific evidence:

1. Absent/false gate preserves W2 tools/injection, plan/task APIs/tools/CLI,
   inline/durable chain results/events/files, and inline/detached Drive specs/
   results/files; no project/user episode or induced index exists.
2. Fresh retrieval exposes source and exact envelope while architecture adapter
   remains compatible.
3. Human-created episodes are recallable and lack the machine-writer provenance
   tag; W3 asserts no safe-prune predicate. Wake state reconstructs
   trigger+payload+outcome without memory defaults.
4. Episode directories are absent from injection/index and scanned only by
   explicit episode queries with accurate stats/thresholds.
5. Fault-injected capture/reporter failures cannot change authored, plan/task,
   chain, or Drive primary outcomes and are visible exactly once at each edge.
6. Every started run path over a RECONCILABLE surface — inline, `startDetached`
   with `abort()`, and resume — has terminal evidence, including SIGTERM parent
   abort; a hard-killed fire-and-forget `launchDetached` child may leave a
   start-only record (a documented residual, not a duplicate). Multi-stage/task
   chatter adds no extra episode.
7. W2 remember remains explicit/sequential; rejected/declined/failed authored
   operations do not become `memory.saved` episodes.

## Implementation Order

1. **Pi-First and baseline gate.** Re-confirm pinned Pi 0.80.6 and write the
   supplementary audit (no session store/hooks). Freeze representative W2,
   plan/task, chain, and Drive disabled outputs/specs. If Pi now supplies durable
   project/user event storage, revise before code.
2. **RED: contracts first.** Add B-001–B-005, B-011, and B-020 tests/markers.
   Implement config parsing, pure episode tags/payload/provenance-tag utilities,
   optional retrieved `source`, and fail-soft helper against injected deps. Re-pin
   `types.ts` deliberately and prove architecture-adapter compatibility. B-003 is
   authored RED here but its GREEN lands in step 3 with the markdown-store episode
   arm; B-003 (and B-005 to the extent it exercises the real store) depend on step
   3. The store-round-trip checkpoint therefore spans **steps 2+3**, the shared
   checkpoint before parallel wiring.
3. **RED → GREEN → REFACTOR: store.** Add B-006–B-008 tests and bring B-003 (and
   any real-store part of B-005) to GREEN with the store arm. Implement OKF
   episode arm, paths, atomic append/idempotence, index exclusion, conditional
   scans, source threading, stats, and factory-bound threshold. Do not import
   config into the store.
4. **RED → GREEN → REFACTOR: Cosmo.** Add B-009, B-010, B-012, B-021, B-022.
   Split recall/injection lists, bind configured threshold only for enabled
   recall, capture successful authored writes, and route visible warnings.
   Re-run composed context and real-Pi contract tests.
5. **RED → GREEN → REFACTOR: plan/task owners.** Add B-013, B-014, B-023,
   B-024. Capture after persistence (task create after lock release), wire actor
   and reporters in Pi/CLI, and run existing manager/tool/CLI parity suites.
   Plan and task work may parallelize only after step 2 with disjoint ownership.
6. **RED → GREEN → REFACTOR: chains.** Add B-015, B-016, B-025, B-027. Implement
   private/durable identities, resolved actors, awaitable reporter, and final
   chain-tool warning text. Exercise success/failure/abort/throw and assert
   disabled durable bytes/events.
7. **RED → GREEN → REFACTOR: Drive identity and normal exits.** Add B-017,
   B-018, B-026, B-028. Implement enabled-only Pi/CLI runtime resolution with
   project/live binding tests, frozen source/attempt/resume rules, completion-
   first terminal capture, compiled child behavior, diagnostics, and disabled
   spec parity.
8. **RED → GREEN → REFACTOR: detached abort checkpoint.** Add B-019 before
   changing `driver.ts`. Make parent abort wait/reconcile and reuse the shared
   content-`completedAt`-derived terminal event. Fault-inject abort before completion, between
   completion/capture, and after normal terminal capture; require exactly one
   terminal and unchanged completion semantics. If idempotence fails, stop and
   revise rather than accept a start-only/duplicate log.
9. **Docs and integration.** Add B-029 and update `docs/memory.md`. In isolated
   project/user roots exercise every vocabulary action, configured threshold,
   recall/injection byte comparison, deletion/malformed files, human-edited
   episode recallability (no edit-detection), fresh wake reconstruction,
   binding-aware detached actor, and capture failures. Clean scratch memory.
10. **Final gates/artifact hygiene.** Run project-native test, lint, and type
    checks plus artifact conformance for 29 unique markers. Review targeted
    mutants. Inspect git status for stranded `missions/**`, `memory/**`, temp
    files, generated maps, and the unrelated `lib/config/types.ts` edit. Any
    cache, user-config loader, session hook, second wake store, delete API, or
    further MemoryStore widening requires plan revision.

---
id: TASK-696
title: Implement resumable D-016 profile work units and epoch freshness
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:test-health-audit'
dependencies:
  - TASK-695
createdAt: '2026-09-16T18:35:54.817Z'
updatedAt: '2026-09-17T19:49:30.775Z'
---

## Description

Stage 6 — Profile-unit substrate and queue initialization.

Owned behavior: **B-004** (sole owner).

Implement epoch/profile artifact validation and initialize the census-derived assessment queue. This task does **not** turn 267 test files into one worker session: the persisted mechanism issues bounded, disjoint work units to assessing-agent sessions as one OS process per unit at the D-030 bound of eight concurrent, reconstructs progress after interruption, and lets P-final verify queue exhaustion. INV-001/INV-005/INV-008, AC-004/AC-005/AC-006/AC-016, and D-013/D-015/D-016/D-020/D-027/D-030 are settled ground; stale, omitted, missing, or malformed evidence cannot become clean. A ratified **contract** collision halts and escalates; a **shipped-authority** collision that is absent or self-contradicting is recorded `unresolved` with a drafted question and the run continues, batching into the D-029 ratification packet (D-021/D-028/D-034).

<!-- AC:BEGIN -->
- [ ] #1 B-004 is proved at current-epoch `profiles/*.ndjson` and `manifest.json` seams by `tests/scripts/test-health-audit/artifacts.test.ts` > `requires one fresh complete profile per identity and safely subdivides oversized files across resumable units`, carrying exact marker `@cosmo-behavior plan:test-health-audit#B-004` near the executable test.
- [ ] #2 Quality Contract assertion 5 is enforced: aggregation requires exactly one current profile per auditable identity and rejects stale, duplicate, missing, malformed, or carried-without-complete-input-proof records.
- [ ] #3 Deterministic work units cap at 50 profile identities, 2,500 relevant source lines, and eight source files, except one indivisible test; oversized files split at suite/declaration boundaries and retain shared file-context/import/helper digests.
- [ ] #4 Each profile contains source/runtime/case counts; agent-assessed role, claim status and authority, chain, non-Execution conclusions, reasons, portfolio contributions, and disposition; all seven dimension conclusions/bases; evidence/counterevidence/uncertainty; field provenance (lane, basis, assessor identity, model identifier/version, time, consulted authorities) and override history; and material-input digests using the plan’s exact vocabularies.
- [ ] #5 Progress is reconstructed solely from validated, atomically published current-epoch shards; one assessing agent owns one disjoint unit, each unit runs as its own OS process at the D-030 bound of eight concurrent through a driver process backend rather than as an in-process `spawn_agent` child, and an interrupted or OOM-killed unit loses at most itself.
- [ ] #6 Carry-forward succeeds only after rehashing unchanged inputs at the pinned granularity — declaration span for the test declaration and for `production-function` SUT refs, whole-file content for contract authority, method/schema, inventory row, runner/config/setup, and command inputs — and records `carriedFrom`; a digest whose `scope` does not match its input kind fails carry-forward; any material change opens a successor epoch and refreshes runtime observations. Negative cases are proved in both directions: a profile carried across a changed `vitest.config.ts` or `tests/setup.ts` is rejected, and a profile is not invalidated by an unrelated edit elsewhere in a file whose cited declaration span is unchanged.
- [ ] #7 The current census deterministically initializes a persisted queue, and assessing-agent sessions consume it until no pending unit remains in the epoch P-final evaluates — each session publishing one validated disjoint shard, at the D-030 bound of eight concurrent, controls re-sampled between waves; no file-count shortcut or assumed unit count can satisfy completion.
- [ ] #8 Work-unit preparation runs only against a current, valid census: the `prepare-units` command blocks queue initialization and unit issuance on a missing, malformed, or stale census digest at the explicit audit root, names the failing input, and never leaves a partially prepared queue.
- [ ] #9 `scripts/test-health-audit/artifacts.ts` imports only `schema.ts` and Node standard-library IO — no product modules (`lib/`, `cli/`, `domains/`) — so epoch IO, freshness rehashing, and canonical digesting do not depend on the code the audit assesses.
- [ ] #10 Validation rejects a missing, malformed, or non-advancing `<audit-root>/index.json`, so the current-epoch pointer is mechanically checkable rather than assumed.
- [ ] #11 Every published unit records its wall-clock duration and peak RSS in the epoch, so the D-030 concurrency bound can be retuned from recorded cost rather than re-argued; a unit published without those fields fails validation. **The dispatcher measures both from the process it owns — the assessing agent never self-reports its own cost** — and a recorded duration that is not bounded by the observed process lifetime fails validation rather than being published. Run 10 published shards claiming 20ms-540ms for sessions that ran minutes, because the prompt asked the agent to supply the numbers (D-039).
- [ ] #12 A shipped, resumable dispatch command at the explicit audit root issues every pending current-epoch work unit to an assessing-agent session and drives them to completion: one OS process per unit through a driver process backend (`lib/driver/backends/cli-process.ts` or `cosmonauts-subagent.ts`), never an in-process `spawn_agent` child, at the D-030 bound of eight concurrent. Each session receives its unit's identities and file-context/import/helper evidence, and publishes exactly one validated NDJSON shard by temporary-sibling write and atomic rename. Pending work is recomputed solely from published shards, so re-invocation after interruption resumes without duplicating, skipping, or re-assessing a published unit, and a killed unit loses at most itself. The command refuses to dispatch against a missing, malformed, or stale queue or census and names the failing input. Preparation primitives alone do not satisfy this criterion: the absence of this command is what blocked P-final in run 9 (D-038).
- [ ] #13 Controls are re-sampled between waves as AC #7 requires: the dispatcher runs the predeclared calibration controls between concurrency waves, records the per-wave result in the epoch, and stops issuing further units when a control regresses — so assessor drift across 70 sessions is caught by evidence rather than assumed absent. A dispatch implementation with no control-resampling step does not satisfy AC #7 (D-039).
- [ ] #14 Units whose published shard carries agent-supplied rather than dispatcher-measured cost are re-dispatched rather than accepted, so every unit in the epoch P-final certifies carries trustworthy cost evidence; the eight shards published by run 10 fall in this class.
<!-- AC:END -->

---
id: TASK-771
title: 'Stage 4: Extract extension and harness clones'
status: Done
priority: medium
assignee: worker
labels:
  - backend
  - testing
  - 'plan:project-health-audit'
dependencies:
  - TASK-768
createdAt: '2026-09-28T15:23:08.691Z'
updatedAt: '2026-09-28T18:55:00.661Z'
---

## Description

Eliminate the extensions, harness, and validation one-/two-file clone families independently of stage 3. This task verifies B-004 and B-010 and depends only on stage 1 as specified.

<!-- AC:BEGIN -->
- [x] #1 Behavior verification: B-004 is verified for the owned extension/harness/validation families through the committed project-health record—owned reproduced one-/two-file families disappear while surface state and diagnostic evidence remain distinct—and B-010 is verified through the stage gate, freeze check, and unchanged shipped behavior.
- [x] #2 Owned clone families are agent-memory/architecture-memory rendering and byte helpers; agent-memory/knowledge-tool limit normalization; harness-render same-file writes; render/sync path checks; sync-transaction same-file blocks; sync/validation-script durable file operations; and harness-export validation same-file command probes. Owned Files to Change entries are `lib/extensions/agent-memory/index.ts`, `lib/extensions/architecture-memory/index.ts`, `lib/extensions/knowledge-surface/knowledge-tools.ts`, `lib/harness-adapters/render.ts`, `lib/harness-adapters/sync.ts`, applicable `lib/harness-adapters/{inventory,provenance,registry,target-registry,types}.ts`, `scripts/validate-harness-exports.ts`, focused internal helpers under plan-approved directories, and new focused tests where needed.
- [x] #3 D-008/D-009 govern the extraction: every fresh clone range is compared with fresh partial/none/missing-tier critical ranges before edit and any overlap moves to its owning critical stage. Same-file families become private helpers; same-subsystem sharing stays internal; cross-file sharing is the smallest identical primitive; transaction boundaries, durable-write behavior, no-follow/consistency rules, filesystem errors, and validation ownership remain at their current subsystem. No global utility or broader dependency is introduced.
- [x] #4 Ratified constraints apply verbatim and are stop-and-escalate ground: refactors are behavior-preserving (INV-002); no new lint or fallow suppressions, no threshold, ignore, entry, or fallow.toml changes (INV-004); a finding is traced through the analysis surface immediately before the edit and a non-reproducing finding is reported unresolved, never fixed (INV-003); any test expectation change hard-stops for human review (Q-002). A below-high critical overlap requires a separate prior green characterization commit (D-009). D-013 requires reproduced-but-untraceable findings to record failed/narrow successful traces plus repository-wide search and escalate without edit. Before every edit the Pi-hosted worker runs `analysis_status`, traces a current location for every owned group through the analysis surface, and stops and reports if the tools are unavailable (D-017).
- [x] #5 For each owned group, the post-edit diagnostic inventory and exact-location trace prove absence; any surviving group fails the stage. D-012 pairing records project-scope duplication’s completed surface outcome and direct diagnostic `fallow ["dupes", "--format", "json", "--quiet", "--no-cache"]` separately. Boundary zones, dependencies, public entries, `fallow.toml`, `missions/architecture/staged-code.toml`, `.cosmonauts/config.json`, `qualityReview`, and execution-liveness artifacts remain unchanged.
- [x] #6 D-015 freeze check. The base is the slice-start commit `S`, the HEAD the worker started from. Under driver-commits HEAD does not include the worker's edits, so the worker's in-session check compares the working tree with the base and records the base SHA and the exact outputs of `git diff --name-status --diff-filter=MDR S -- tests/`, `git status --porcelain -- tests/`, and `git diff -U0 S -- tests/ | grep -E '^\+.*\.(skip|only|todo)\('`. Allowed without a human stop: (a) newly added test files; (b) pre-declared mechanical reference updates in existing tests for a symbol this task renames or moves, where every changed hunk contains only that identifier change and no assertion, fixture, or expectation change, named in this task before editing and reviewed and recorded by the coordinator. Anything else blocks for human review. The freeze verdict comes from the coordinator, not the worker: after Drive commits this task, the coordinator confirms the base (`S` is the parent of this task's Drive commit), re-runs the same diff commands from that base to this task's Drive commit, and records its output and both SHAs under `## Implementation Notes` beside the worker's. Finding citations go in this task's notes, not in a commit message. Any disagreement, wrong base, or undeclared modified/deleted/renamed test or added skip/only/todo leaves the task `blocked` and the next slice is not dispatched. Worker-recorded output alone never satisfies this AC. Rows are copied to `## Implementation Notes`; the worker performs no git operation on `missions/reviews/`, and the coordinator owns record-only custody.
- [x] #7 Stage gate: `bun run test`, `bun run lint`, `bun run typecheck`, `bun run check:reachability`, and `bun run check:suppressions -- --base main` all exit 0; project-scope duplication is re-run through the surface with its actual outcome and D-012 diagnostic pair, and neither evidence surface contains an owned family. The post-edit surface duplication outcome is completed with `verdict: "fail"`; any other state is recorded as it is and fails this stage (Design §3).
<!-- AC:END -->

## Implementation Notes

### Worker attempt (2026-09-28)

Slice-start commit `S`: `e73e65102cdae7b569c9d7409febc3ec5c0639b3` (recorded before source edits). Drive owns commits; worker left source changes uncommitted.

### Pre-edit analysis and overlap disposition

- `analysis_status` was run immediately before the edit phase: Fallow 2.54.2 had duplication, complexity, trace, dead-code, and changed-scope audit bound; boundary conformance was unbound as configured.
- Fresh project duplication reproduced all owned families and returned `completed` / `verdict: fail`. Exact-location traces succeeded for the owned pre-edit groups at agent-memory 1229/1265/1282/1290, render 525/601, sync 1210/2287/3126/3144, and validation script 2001.
- Fresh cyclomatic, cognitive, and CRAP inventories were compared to every owned range. None of the owned ranges intersected a partial/none/missing-tier critical range. The two ranges inside large sync routines (`runClaudeCommandPairBootstrap` and `applySyncPlanInTransaction`) were high-coverage ranges, so D-009 did not move them to a critical stage. Unrelated script clone groups inside critical validation routines were not edited.

### Implementation

- Added extension-internal primitives for context values/UTF-8 byte length and recall limit normalization.
- Added harness-internal primitives for containment checks and durable file/directory synchronization.
- Added private same-file helpers for rendered-node writes, installed command evidence continuation, transaction target revalidation, and harness command probes.
- Preserved caller-owned error messages, validation, transaction cleanup points, durable write ordering/modes, and public entry points. No tests, configs, dependencies, suppressions, thresholds, boundary records, qualityReview, or execution-liveness artifacts changed.

### Post-edit duplication evidence (D-012)

- Project-scope `analysis_duplication` completed with actual `verdict: fail` (37 unrelated project-wide groups). It contained none of the owned Stage 4 families.
- Direct diagnostic invocation was `fallow ["dupes", "--format", "json", "--quiet", "--no-cache"]`; exit 0; 37 clone groups / 76 instances / 1.1755910460051575% duplication. The only groups touching an owned path were eight pre-existing, out-of-scope validation-script groups at 370-384/702-716, 401-416/733-748, 446-465/790-808, 462-489/805-832, 573-592/914-932, 589-617/929-953, 830-848/964-979, and 1176-1186/1650-1660. No owned command-probe, durable-write, transaction, render, path, limit, or extension-context family survived.
- Post-edit exact-location duplicate traces at each replacement seam exited Fallow code 2 with blank stderr because no duplicate instance matched. The completed project inventory and direct no-cache diagnostic independently establish absence; the pre-edit traces above establish identity.
- Path-scoped `analysis_dead_code` over all 10 changed/new source files passed with zero findings.
- Changed-scope `analysis_audit` against literal base `e73e65102cdae7b569c9d7409febc3ec5c0639b3` passed with zero dead-code, duplication, or complexity findings.

### Verification

- Focused regression suite: 5 files, 73 tests passed (`agent-memory`, `architecture-memory`, harness render/sync, validation script).
- `bun run test`: exit 0; 266 files and 3475 tests passed.
- `bun run lint`: exit 0.
- `bun run typecheck`: exit 0.
- `bun run check:reachability`: exit 0; 207/207 runtime lib modules reached, 13 type-only exempt, 0 staged.
- `bun run check:suppressions -- --base main`: exit 0.

### Worker D-015 freeze evidence

Base `S`: `e73e65102cdae7b569c9d7409febc3ec5c0639b3`.

- `git diff --name-status --diff-filter=MDR e73e65102cdae7b569c9d7409febc3ec5c0639b3 -- tests/` → no output.
- `git status --porcelain -- tests/` → no output.
- `git diff -U0 e73e65102cdae7b569c9d7409febc3ec5c0639b3 -- tests/ | grep -E '^\+.*\.(skip|only|todo)\('` → no output; grep exit 1 (no match).

Coordinator must still perform and record the post-Drive-commit freeze verdict using this task commit and its parent.

### Coordinator D-015 verdict (2026-09-28, after Drive commit)

- Drive commit `ac8dbc11190731885d9d5271fcec1b2cc9abbd52` (run `run-b142cc7c-f842-4e44-8aad-c5ef9299470b`, attempt 1), parent `e73e6510` = slice-start `S`. State commit `c359aa6f`.
- `git diff --name-status --diff-filter=MDR e73e6510 ac8dbc11 -- tests/` → empty; no added test files; `git status --porcelain -- tests/` → empty; skip/only/todo grep → none. Non-test changes confined to `lib/extensions/**`, `lib/harness-adapters/**`, `scripts/validate-harness-exports.ts` (owned files) plus four new helper modules. **Verdict: freeze check clean; not blocked.**
- Postflight (`verify` phase `post`): all five gates `passed`. Task-close `analysis_audit` completed `pass`. Worker used `analysis_status`, `analysis_trace` (66), `analysis_duplication`, `analysis_dead_code`, `analysis_complexity`, `analysis_audit` (INV-003).

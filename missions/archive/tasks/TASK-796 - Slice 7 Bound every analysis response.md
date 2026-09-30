---
id: TASK-796
title: 'Slice 7: Bound every analysis response'
status: Done
priority: high
assignee: worker
labels:
  - backend
  - testing
  - 'plan:driver-hardening'
dependencies:
  - TASK-795
createdAt: '2026-09-29T16:45:54.644Z'
updatedAt: '2026-09-29T18:54:01.339Z'
---

## Description

Implementation Order slice 7. Owns B-014 from AC-009. Design ownership: §5 shared bounded analysis presentation and metric promotion. Governed by D-001, D-003, D-008, D-012, D-015, D-016, D-024, D-027, D-028, and D-030.

Files to Change owned by this slice: `lib/analysis/types.ts` for finding metric values, `domains/shared/extensions/project-tools/analysis-provider-error.ts`, `domains/shared/extensions/project-tools/fallow-provider.ts`, `domains/shared/extensions/project-tools/index.ts`, `domains/shared/skills/analysis/SKILL.md`, `docs/analysis-capabilities.md`, `docs/analysis-provider-validation.md`, and `docs/fallow.md` for the bounded-text contract.

**Standing worker rule until TASK-801 aligns the persona (D-028):** write every implementation note, including the D-030 red/green rows, with `task_edit` `implementationNotesMode: "append"`; never replace notes; if you stop blocked, set status Blocked and end the report with `outcome: blocked`.

## Implementation Plan

Follow Design §5: promote cyclomatic/cognitive/CRAP values into provider-neutral findings; route findings, trace, fix-preview, status, non-ready, and provider-error responses through one 32,768-byte UTF-8 renderer; place the fixed never-truncated capability/provider/scope/verdict/coverage/metric header before compact variant rows and deterministic omission text; preserve complete typed/native details without rerunning the provider. Update only pinned text-equals-details expectations that represent the AC-009 defect, citing AC-009 and D-024.

<!-- AC:BEGIN -->
- [x] #1 B-014 (source AC-009): every `analysis_*` response, including provider failures, exposes model-facing text of at most 32,768 UTF-8 bytes with a never-truncated capability/provider/scope/verdict/coverage/metric header, compact variant-appropriate rows, no native payload, and deterministic omission or truncation text, while complete typed and native data remain in details without another provider run.
- [x] #2 The slice’s Prove clause is satisfied: the header is always present; required finding columns and equivalent trace/fix-preview/status/non-ready rows appear; native text is absent; details stay complete; oversized rows and provider errors remain bounded; no code point is split; omission output is deterministic; and a paths-scoped `analysis_duplication` residue result is rendered within the bound and still names every surviving owned group or states none.
- [x] #3 The owned Files to Change (`lib/analysis/types.ts`, `domains/shared/extensions/project-tools/analysis-provider-error.ts`, `domains/shared/extensions/project-tools/fallow-provider.ts`, `domains/shared/extensions/project-tools/index.ts`, `domains/shared/skills/analysis/SKILL.md`, `docs/analysis-capabilities.md`, `docs/analysis-provider-validation.md`, `docs/fallow.md`) deliver Design §5’s metric-neutral complete details and one shared bounded renderer.
- [x] #4 Ratified ground binds exactly: “INV-005 - Analysis results fit their consumer. A capability result honors the requested scope or reports the scope unsupported; it never silently widens. The text a tool returns to the model is bounded in size, with the full provider payload reachable without re-running the provider.” “Ranking. INV-005 wins over completeness: a bounded, scoped result beats a complete one; the complete inventory stays available through the result's details or a paths-scoped follow-up call.” A collision is stop-and-escalate ground under the deviation protocol.
- [x] #5 No `lib/durable-runtime/` change; no `drive-envelope` or `execution-liveness` work; no suppression, threshold, baseline, ignore-pattern, or configuration change to clear a finding. Under AC-020 and D-024, no test expectation changes except text-equals-details expectations that pinned the AC-009 defect, and each such change cites AC-009.
- [x] #6 D-028: this slice is implemented in a single Drive run on the `cosmonauts-subagent` inline backend from a print-mode cosmo session.
- [x] #7 D-030: for B-014, implementation notes record one failing run before the change and one passing run after it; each row includes the test name and commit, the failing row includes a one-line failure, and the passing row records the successful result.
<!-- AC:END -->

## Implementation Notes

Task-start audit base: 34ae869bbfbde6329c3f076d910a6479176fe1aa.

D-030 B-014 RED | test: Fallow capability execution > leaves the entire worktree unchanged across status and every capability | commit: 34ae869bbfbde6329c3f076d910a6479176fe1aa | `bun run test -- tests/extensions/project-tools-fallow.test.ts -t 'leaves the entire worktree unchanged'` failed: analysis_dead_code text did not contain `capability: dead-code` (native JSON exposed).

HALT-AND-ESCALATE (ratified AC-009 versus AC-020 / task #5). Draft decision: AC-009/D-008/D-024 require the fixed capability/provider/scope/verdict/coverage/metric header even on thrown provider errors. AC-020 and task #5 forbid changing existing expectations except text-equals-details tests. `tests/pi-contract/pi-behavior-contract.test.ts` hardcodes and checks the *exact* legacy provider-error message (lines 260-269, 315-320), without the scope/verdict/coverage/metric header. Both cannot be true. Options for human: (a) authorize one narrowly scoped exception to AC-020/#5 for this pinned provider-error error-transport test (recommended; preserve Pi transport assertion while updating the AC-009 output contract); (b) explicitly exempt provider-error messages from AC-009's fixed header (weakens INV-005's universal analysis presentation), or (c) leave task blocked. No test expectation was changed at that seam. Partial work is uncommitted; Drive owns commits. Required `bun run test` failed: `pi contract: thrown analysis provider errors > preserves serialized capability failure in Pi error content` expected `Analysis failed to run.\nCapability: ...`, received `capability: dead-code\nprovider: fallow@2.54.2\nscope: not-executed\nverdict: provider-error ...`. An unrelated detached-driver timing test also failed in that full-suite run: `startDetached > escalates an ignored SIGTERM to SIGKILL so abort settles on a bounded deadline`: `promise rejected "Error: Detached driver start aborted" instead of resolving` (lib/driver/driver.ts:712). Targeted analysis suite earlier passed (73 tests). D-030 B-014 GREEN | test: Fallow capability execution > leaves the entire worktree unchanged across status and every capability | commit: 34ae869bbfbde6329c3f076d910a6479176fe1aa (working-tree change) | `bun run test -- tests/extensions/project-tools-fallow.test.ts -t 'leaves the entire worktree unchanged'` passed (1 test). Mutation check temporarily set rendered capability to `wrong`; same test failed with expected `capability: dead-code`, received `capability: wrong`; restored. `bun run lint`, `bun run typecheck`, `bun run check:reachability`, `bun run check:suppressions -- --base main` were not run after discovering the ratified collision; no source commit made.

### Drive — outcome blocked — attempt 1 — run run-ea89294e-6763-4515-9820-3a03e10912f2

{
  "outcome": "blocked",
  "notes": "Human decision needed: AC-009 requires a fixed header on provider-error text, but AC-020 forbids changing the existing exact-message test in tests/pi-contract/pi-behavior-contract.test.ts. `bun run test` failed there: expected `Analysis failed to run.\\nCapability: ...`, received `capability: dead-code\\nprovider: fallow@2.54.2\\nscope: not-executed\\nverdict: provider-error ...`. Partial changes are uncommitted; the decision options and red/green evidence are appended to TASK-796. The same run also had an unrelated detached-driver timing failure."
}
outcome: blocked

Dirty paths:
 M docs/analysis-capabilities.md
 M docs/analysis-provider-validation.md
 M docs/fallow.md
 M domains/shared/extensions/project-tools/analysis-provider-error.ts
 M domains/shared/extensions/project-tools/fallow-provider.ts
 M domains/shared/extensions/project-tools/index.ts
 M domains/shared/skills/analysis/SKILL.md
 M lib/analysis/types.ts
 M "missions/tasks/TASK-796 - Slice 7 Bound every analysis response.md"
 M tests/extensions/project-tools-fallow.test.ts
?? domains/shared/extensions/project-tools/bounded-presentation.ts

### Coordinator note before attempt 2 (2026-09-29, derived ruling D-032)

Not a human decision. Ratified AC-009 bounds the text of *findings results*; the header on a thrown provider error came only from derived ground (D-008 asks for a cap on error messages; D-024's header is for returned results). The pi-contract test `preserves serialized capability failure in Pi error content` pins Pi's error transport of the exact legacy message, not a defect, so AC-020 forbids changing it and nothing requires it to change. Ruling (plan D-032, coordinator, amend-on-record): keep `AnalysisProviderError`'s message format exactly as before and apply only the 32,768-byte cap to it (via the shared bound, without the header); the fixed header applies to every text the analysis tools *return* (findings, trace, fix-preview, status, non-ready). Do not edit `tests/pi-contract/`. Your attempt-1 work is uncommitted in the worktree and also snapshotted at `refs/cosmonauts/coordinator/TASK-796-attempt-1`; continue from it (revert only the header-on-error part of `analysis-provider-error.ts` and any test that asserted a header on errors), then run all five gates and report. The detached-driver SIGTERM test failure you saw is a known flake unrelated to this slice; rerun the suite once if it recurs and record the rerun.

D-032 amendment on record (attempt 2): thrown provider errors retain exact legacy message for ordinary evidence and use the shared 32,768-byte UTF-8 cap for oversized messages; completed/non-ready/status results retain the six-field header. `tests/pi-contract/pi-behavior-contract.test.ts` unchanged and passing. D-030 B-014 RED (legacy error) | test: keeps the legacy provider error message for ordinary process evidence | commit: 34ae869bbfbde6329c3f076d910a6479176fe1aa (uncommitted slice) | `bun run test -- tests/extensions/project-tools-fallow.test.ts -t 'keeps the legacy provider error message'` failed: received six-field header before legacy error text. D-030 B-014 GREEN (legacy error) | test: keeps the legacy provider error message for ordinary process evidence | commit: 34ae869bbfbde6329c3f076d910a6479176fe1aa (working tree; Drive commits) | `bun run test -- tests/extensions/project-tools-fallow.test.ts tests/pi-contract/pi-behavior-contract.test.ts` passed 55/55. D-030 B-014 RED (omission accounting) | test: omits overflowing scoped clone groups deterministically while retaining all details | commit: 34ae869bbfbde6329c3f076d910a6479176fe1aa (uncommitted slice) | `bun run test -- tests/extensions/project-tools-fallow.test.ts -t 'omits overflowing scoped clone groups deterministically'` failed: displayed + omitted was 501 instead of 500. D-030 B-014 GREEN (omission accounting) | same test | commit: 34ae869bbfbde6329c3f076d910a6479176fe1aa (working tree; Drive commits) | same command passed 1/1. All five required gates passed: `bun run test` (3984 tests), `bun run lint`, `bun run typecheck`, `bun run check:reachability`, `bun run check:suppressions -- --base main`. Changed-scope audit base 34ae869bbfbde6329c3f076d910a6479176fe1aa: unbound (execution-not-consented), no audit evidence available. Drive owns commits; no git add/commit performed.

Attempt 2 completed under coordinator D-032: no provider-error header, byte-capped legacy transport text; full suite and all four other required gates passed. The already-uncommitted attempt-1 implementation was finished and verified in this inline cosmonauts-subagent Drive run; Drive owns the source commit.
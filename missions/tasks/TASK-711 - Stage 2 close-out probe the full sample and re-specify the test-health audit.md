---
id: TASK-711
title: 'Stage 2 close-out: probe the full sample and re-specify the test-health audit'
status: Done
priority: high
labels:
  - 'plan:framework-health'
  - testing
dependencies: []
createdAt: '2026-09-22T20:31:18.515Z'
updatedAt: '2026-09-23T13:42:26.046Z'
---

## Description

Framework-health Stage 2, remaining work, executed by the paired sessions per D-023 and recorded here so Stage 3 waits for it (D-033). (1) Run the mutation probe over the D-021/D-030/D-032/D-034 sample in a throwaway worktree; record the census (population count, each stratum incl. (root) with size and stride, the commit) and every declaration killed/survived; re-probe each strengthened or replaced survivor until killed, or delete it (B-008). Per D-036, a declaration admitted through a helper or a bin/ subprocess is probed against a production target, never test code; where scripts/test-health-audit/probe.ts cannot express the route, probe it by hand in the same worktree and record target, mutant and red/green. Add the B-007 "tool name that code resolves" case to the probe table. (2) Rewrite missions/plans/test-health-audit/spec.md to the new method and mark that plan superseded by framework-health; decide per script under scripts/test-health-audit/ whether it serves the new method or goes with its suite. validateCalibrationRecord (artifacts.ts), which accepts a calibration source that does not exist, is fixed or deleted with its callers, not merely given a fate (D-036). (3) Update ROADMAP.md.

<!-- AC:BEGIN -->
- [x] #1 stage2-probes.md carries the census and a killed/survived row per sampled declaration, with every survivor either re-probed to killed or deleted (B-008).
- [x] #2 missions/plans/test-health-audit/spec.md describes the sampled-probe method and names framework-health as its successor; no script under scripts/test-health-audit/ remains without a stated fate.
- [x] #3 Every sampled row names a mutation target in shipped code or shipped content, or, for a pin of an exact-pinned runtime dependency's contract, in that dependency's code; never test code (D-038; helper- and subprocess-admitted declarations included, hand-probed where no tool can route them), and the probe table carries a resolved-tool-name row (B-007).
- [x] #4 validateCalibrationRecord either rejects a calibration source whose path does not exist (seen red first) or is deleted together with its callers.
- [x] #5 check-artifacts, lint, typecheck and the full suite pass.
<!-- AC:END -->

## Implementation Notes

Executed by the coordinator session per D-023, 2026-09-23. Census at 4a6300f by scripts/probe-census.ts: 240 files, 30 strata, 75 declarations. First probe at the corrected picks: 66 killed, 9 survived. Six were strengthened and independently re-probed to killed, S42 was deleted, S59 was killed in Pi (D-038), and S11 was killed by the type-check step. S57 was re-picked after the AST fix. B-007's resolved-name case: three mutants, all killed. The test-health-audit spec is re-specified. scripts/test-health-audit/ is deleted, taking validateCalibrationRecord with it (D-037). Commits a124dba, 9e93646, 1a876e7, 9858dec, 00b09b8. Codex (gpt-6-sol, high): round 1 FIX (2), round 2 FIX (1), round 3 SHIP. Full suite 2,997/2,997 at 00b09b8; lint, typecheck and check-artifacts are clean.

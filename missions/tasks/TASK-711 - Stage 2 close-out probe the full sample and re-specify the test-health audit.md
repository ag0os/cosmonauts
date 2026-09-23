---
id: TASK-711
title: 'Stage 2 close-out: probe the full sample and re-specify the test-health audit'
status: To Do
priority: high
labels:
  - 'plan:framework-health'
  - testing
dependencies: []
createdAt: '2026-09-22T20:31:18.515Z'
updatedAt: '2026-09-23T13:20:00.000Z'
---

## Description

Framework-health Stage 2, remaining work, executed by the paired sessions per D-023 and recorded here so Stage 3 waits for it (D-033). (1) Run the mutation probe over the D-021/D-030/D-032/D-034 sample in a throwaway worktree; record the census (population count, each stratum incl. (root) with size and stride, the commit) and every declaration killed/survived; re-probe each strengthened or replaced survivor until killed, or delete it (B-008). Per D-036, a declaration admitted through a helper or a bin/ subprocess is probed against a production target, never test code; where scripts/test-health-audit/probe.ts cannot express the route, probe it by hand in the same worktree and record target, mutant and red/green. Add the B-007 "tool name that code resolves" case to the probe table. (2) Rewrite missions/plans/test-health-audit/spec.md to the new method and mark that plan superseded by framework-health; decide per script under scripts/test-health-audit/ whether it serves the new method or goes with its suite. validateCalibrationRecord (artifacts.ts), which accepts a calibration source that does not exist, is fixed or deleted with its callers, not merely given a fate (D-036). (3) Update ROADMAP.md.

<!-- AC:BEGIN -->
- [ ] #1 stage2-probes.md carries the census and a killed/survived row per sampled declaration, with every survivor either re-probed to killed or deleted (B-008).
- [ ] #2 missions/plans/test-health-audit/spec.md describes the sampled-probe method and names framework-health as its successor; no script under scripts/test-health-audit/ remains without a stated fate.
- [ ] #3 Every sampled row names a mutation target in shipped code or shipped content, or, for a pin of an exact-pinned runtime dependency's contract, in that dependency's code; never test code (D-038; helper- and subprocess-admitted declarations included, hand-probed where no tool can route them), and the probe table carries a resolved-tool-name row (B-007).
- [ ] #4 validateCalibrationRecord either rejects a calibration source whose path does not exist (seen red first) or is deleted together with its callers.
- [ ] #5 check-artifacts, lint, typecheck and the full suite pass.
<!-- AC:END -->

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
updatedAt: '2026-09-22T20:31:18.515Z'
---

## Description

Framework-health Stage 2, remaining work, executed by the paired sessions per D-023 and recorded here so Stage 3 waits for it (D-033). (1) Run the mutation probe over the D-021/D-030/D-032/D-034 sample in a throwaway worktree; record the census (population count, each stratum incl. (root) with size and stride, the commit) and every declaration killed/survived; re-probe each strengthened or replaced survivor until killed, or delete it (B-008). (2) Rewrite missions/plans/test-health-audit/spec.md to the new method and mark that plan superseded by framework-health; decide per script under scripts/test-health-audit/ whether it serves the new method or goes with its suite. (3) Update ROADMAP.md.

<!-- AC:BEGIN -->
- [ ] #1 stage2-probes.md carries the census and a killed/survived row per sampled declaration, with every survivor either re-probed to killed or deleted (B-008).
- [ ] #2 missions/plans/test-health-audit/spec.md describes the sampled-probe method and names framework-health as its successor; no script under scripts/test-health-audit/ remains without a stated fate.
- [ ] #3 check-artifacts, lint, typecheck and the full suite pass.
<!-- AC:END -->

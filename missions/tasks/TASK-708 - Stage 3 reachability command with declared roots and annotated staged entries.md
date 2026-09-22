---
id: TASK-708
title: 'Stage 3: reachability command with declared roots and annotated staged entries'
status: To Do
priority: high
labels:
  - 'plan:framework-health'
  - backend
dependencies:
  - TASK-711
createdAt: '2026-09-22T19:16:28.862Z'
updatedAt: '2026-09-22T19:16:28.862Z'
---

## Description

Framework-health Stage 3, first half (D-020, D-024). Root fallow at bin/, cli/, package.json#pi.extensions, domain manifests and the fallow.toml entry list; add the deliberately unwired modules to the entry list and declare each in missions/architecture/staged-code.toml as a [[staged]] row with path and owner (plan:<slug> or roadmap:<exact heading>), per D-027; move the public deep-importable module list into that file's `public` array and point docs/fallow-exceptions.md at it, per D-029; the check asserts fallow.toml entry equals public plus staged paths exactly; add the check:reachability script that runs the tool then the owner check as one step. Tests are not roots. The quality-manager's dead-code capability stays unbound here (per-user consent); this command is the gate. Test-first for the owner check; synthetic data.

<!-- AC:BEGIN -->
- [ ] #1 Running the project's reachability command on this branch reports the pre-triage state truthfully: the two orphans the plan Overview measures (and any other unit it finds) as unreachable, every staged entry with a live owner as reached, and it exits non-zero both for an unreachable unit and for a staged entry whose owner is archived or absent (B-009). Resolving the orphans is TASK-709.
- [ ] #2 The roots are exactly the modules staged-code.toml's public list declares (the 23 fallow.toml names today) plus the staged entries; the command asserts fallow.toml entry equals that set, and a lib/ module outside it that nothing shipped imports is reported unreachable even though package.json publishes all of lib/.
- [ ] #3 The owner check is driven through the command with a synthetic fallow.toml and synthetic plan/roadmap state; the test was seen red before the check existed.
- [ ] #4 check-artifacts, lint, typecheck and the full suite pass.
<!-- AC:END -->

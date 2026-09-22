---
id: TASK-708
title: 'Stage 3: reachability command with declared roots and annotated staged entries'
status: To Do
priority: high
labels:
  - 'plan:framework-health'
  - backend
dependencies: []
createdAt: '2026-09-22T19:16:28.862Z'
updatedAt: '2026-09-22T19:16:28.862Z'
---

## Description

Framework-health Stage 3, first half (D-020, D-024). Root fallow at bin/, cli/, package.json#pi.extensions, domain manifests and the fallow.toml entry list; add the deliberately unwired modules to the entry list and declare each in missions/architecture/staged-code.toml as a [[staged]] row with path and owner (plan:<slug> or roadmap:<exact heading>), per D-027; move the public deep-importable module list into that file's `public` array and point docs/fallow-exceptions.md at it, per D-029; the check asserts fallow.toml entry equals public plus staged paths exactly; add the check:reachability script that runs the tool then the owner check as one step. Tests are not roots. The quality-manager's dead-code capability stays unbound here (per-user consent); this command is the gate. Test-first for the owner check; synthetic data.

<!-- AC:BEGIN -->
- [ ] #1 Running the project's reachability command on this branch reports every lib/ module as reachable from a shipped root or as a staged entry with a live owner, and exits non-zero for a staged entry whose owner is archived or absent (B-009).
- [ ] #2 The roots include the 23 lib/ modules fallow.toml already declares as public API; nothing a consumer can deep-import is reported unreachable.
- [ ] #3 The owner check is driven through the command with a synthetic fallow.toml and synthetic plan/roadmap state; the test was seen red before the check existed.
- [ ] #4 check-artifacts, lint, typecheck and the full suite pass.
<!-- AC:END -->

---
id: TASK-318
title: Run artifact-format coherence pass and final verification
status: To Do
priority: medium
labels:
  - testing
  - devops
  - 'plan:artifact-format-redesign'
dependencies:
  - TASK-307
  - TASK-311
  - TASK-312
  - TASK-313
  - TASK-314
  - TASK-315
  - TASK-316
  - TASK-317
createdAt: '2026-05-21T21:31:58.277Z'
updatedAt: '2026-05-21T21:31:58.277Z'
---

## Description

Perform the plan's final coherence and verification pass after all skill, prompt, and allowlist changes are complete. This is verification and small corrective cleanup only; do not introduce runtime gate enforcement, marker scanning, back-migration, HTML rendering, memory behavior, or new agent roles.

<!-- AC:BEGIN -->
- [ ] #1 All B-001 through B-020 behavior IDs are represented in the appropriate tests with matching `@cosmo-behavior plan:artifact-format-redesign#B-###` markers near executable tests.
- [ ] #2 Every new reference file is directly linked from a dispatcher, role skill, prompt, or prompt test, and no deep reference chains or orphan references remain.
- [ ] #3 Role skills and prompts route to `work-artifacts` instead of duplicating full canonical artifact rules, while direct-fix guidance stays lightweight.
- [ ] #4 Generic artifact references and prompt guidance avoid concrete gate tool names, concrete command columns, project-specific bindings, and runtime enforcement scope.
- [ ] #5 Quality-manager ladder guidance cannot silently skip abstract ladder rows and still preserves legacy `QC-*` behavior.
- [ ] #6 Examples match the canonical workflow tiers and artifact formats.
- [ ] #7 Project test, lint, and typecheck gates used by this repository pass, with prompt tests relying on stable contract phrases rather than full markdown snapshots.
<!-- AC:END -->

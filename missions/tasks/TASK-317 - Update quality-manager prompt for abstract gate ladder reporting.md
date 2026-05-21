---
id: TASK-317
title: Update quality-manager prompt for abstract gate ladder reporting
status: Done
priority: medium
labels:
  - testing
  - backend
  - 'plan:artifact-format-redesign'
dependencies:
  - TASK-305
createdAt: '2026-05-21T21:31:51.133Z'
updatedAt: '2026-05-21T22:18:42.328Z'
---

## Description

Update the quality-manager prompt-level contract for abstract Quality Contract ladder handling while preserving legacy `QC-*` behavior and deferring deterministic gate execution.

<!-- AC:BEGIN -->
- [ ] #1 B-014 is covered by `tests/prompts/quality-manager.test.ts`, with the matching `@cosmo-behavior plan:artifact-format-redesign#B-014` marker near the executable test.
- [ ] #2 `bundled/coding/coding/prompts/quality-manager.md` detects `## Quality Contract` tables with `Gate kind`, `Tier`, and `Binding state` headers and parses rows as `gate_ladder_rows`.
- [ ] #3 Ladder rows are not warned as malformed legacy criteria merely because they lack `QC-*`, `verification`, or `command` fields.
- [ ] #4 Universal gates map to sign-off checks or explicit manual verification when safe, while unbound bindable gates are recorded in `degraded_gates` and reported as unbound/not enforced.
- [ ] #5 Bindable bound rows without protocol are reported as protocol pending unless a legacy criterion or detected project-native tool separately supplies an executable claim.
- [ ] #6 Legacy `verifier_criteria`, `reviewer_criteria`, and `manual_criteria` behavior for old `QC-*` entries is preserved.
- [ ] #7 The final summary includes universal gate status, degraded bindable gates, protocol-pending gates, and legacy manual criteria without implementing a gate enforcement engine.
<!-- AC:END -->

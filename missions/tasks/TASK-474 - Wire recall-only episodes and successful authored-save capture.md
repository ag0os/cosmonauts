---
id: TASK-474
title: Wire recall-only episodes and successful authored-save capture
status: To Do
priority: medium
labels:
  - backend
  - testing
  - 'plan:episodic-log'
dependencies:
  - TASK-471
  - TASK-473
createdAt: '2026-07-17T20:07:57.875Z'
updatedAt: '2026-07-17T20:07:57.875Z'
---

## Description

Implementation Order step 4, after the shared store checkpoint. Extend the existing agent-memory extension without changing its public tool schemas or W2 explicit-save contract. This task solely owns B-009, B-010, B-012, B-021, and B-022. Tests must carry exactly those markers near the executable Vitest cases.

<!-- AC:BEGIN -->
- [ ] #1 B-009 (Source AC-004) is proven with `@cosmo-behavior plan:episodic-log#B-009`: enabled recall requests authored types plus episode and renders full episode body/source/stats through the existing bounded tool shape while retaining profile pinning and the 5/20 non-profile bound.
- [ ] #2 B-010 (Source AC-005) is proven with `@cosmo-behavior plan:episodic-log#B-010`: deletion is treated as absence and malformed episodes produce bounded path/reason warnings only during episode-touching recall, never at session injection or by creating replacement files.
- [ ] #3 B-012 (Sources AC-002 and AC-006) is proven with `@cosmo-behavior plan:episodic-log#B-012`: only primary `written` note/profile/playbook results produce one same-scope `memory.saved` episode sourced `main/cosmo`; rejected, declined, unanswered, confirmation-required, unsupported, or failed saves produce none, and capture failure leaves authored bytes/results successful with one visible warning.
- [ ] #4 B-021 (Source AC-001) is proven with `@cosmo-behavior plan:episodic-log#B-021`: absent/false config preserves W2 schemas, descriptions, outputs/details, consent and collision behavior, injected bytes, and file set byte-for-byte, with zero episode or episode-induced index files.
- [ ] #5 B-022 (Source AC-003) is proven with `@cosmo-behavior plan:episodic-log#B-022`: valid, malformed, and over-threshold episode stores cannot change injection bytes or authored scan stats; injection queries remain exactly note/profile/playbook and expose no episode content or warning.
- [ ] #6 W2 explicit-save remains sequential and consent-driven: `remember` gains neither a type parameter nor an episode arm, and enabled episodes are recall-only and never injected or included in `index.md`.
- [ ] #7 Configured thresholds bind only to fresh enabled-recall stores; injection remains authored-only, per-turn episode recall remains a no-cache full rescan, and awaited warning transport never changes the primary tool result.
<!-- AC:END -->

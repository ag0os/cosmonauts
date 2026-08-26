---
id: TASK-589
title: 'Checkpoint B core, CLI, and generated content before live migration'
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:harness-adapters'
dependencies:
  - TASK-588
createdAt: '2026-08-25T23:05:29.098Z'
updatedAt: '2026-08-26T10:50:33.435Z'
---

## Description

Implementation Order Checkpoint B; dependency barrier with no B-### ownership. Verify all Slice A/B behavior tests and generated content before any live migration. This checkpoint verifies, rather than owns, the implementation constraints. Harness link loading must be probed in a sandbox without project plugin execution, per registered shape: human-ratified D-021 (2026-08-26) registers link shapes per target — Claude registers `directory`, `flat-skill`, and `generated-wrapper`; Codex registers only `directory`, because a Checkpoint B probe showed Codex 0.147.0 does not follow a `SKILL.md` file symlink. A probe failure for a shape a target REGISTERS is an abort condition, never permission to fall back to copy or proceed live. A shape a target does not register must instead be proven to fail before any owner-root, target, or manifest write (already covered by TASK-594). Slice C remains copy mode against Claude throughout and is unaffected.

<!-- AC:BEGIN -->
- [x] #1 B-001 through B-008, B-010, and B-011 targeted tests plus CLI/content tests pass together with exact markers and no missing declared test path.
- [x] #2 Exact generated inventory bytes, authored fallbacks, one-bundle identity, sticky modes, complete classifier, strict discovery, conflicts, and phase recovery remain green as one integrated slice.
- [ ] #3 Sandbox probes demonstrate Claude/Codex support for registered direct-directory, flat `SKILL.md`, and generated-wrapper link shapes without executing project plugins.
- [x] #4 Any failed link/wrapper probe, ambiguous recovery cell, boundary violation, or need for a thirteenth behavior stops before Slice C; explicit link never falls back to copy.
- [x] #5 All Slice B writes are confined to fixtures or ignored outputs, and no live project export, personal bundle, native command source, migration evidence, or live Claude command has changed.
<!-- AC:END -->

## Implementation Notes

task failed

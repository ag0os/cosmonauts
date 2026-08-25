---
id: TASK-578
title: Separate tolerant skill listing from strict export discovery
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:harness-adapters'
dependencies:
  - TASK-577
createdAt: '2026-08-25T23:03:07.272Z'
updatedAt: '2026-08-25T23:03:07.272Z'
---

## Description

Owns B-011 from AC-006 at Implementation Order step 3. Seam/files: `lib/skills/discovery.ts`, `lib/harness-adapters/inventory.ts`, `lib/harness-runtime-inventory.ts`, `tests/harness-adapters/inventory.test.ts`, `tests/skills/discovery.test.ts`, and `tests/harness-runtime-inventory.test.ts`. The inward core may consume plain rows only; runtime/chain/skill composition stays in the outer file. AC-006, INV-002/INV-004/INV-005, D-016, and D-017 are stop-and-escalate ground where restated. This no-write slice cannot migrate content or modify live commands.

<!-- AC:BEGIN -->
- [ ] #1 B-011: tolerant runtime listing preserves existing first-root behavior, while strict export discovery returns candidates plus per-declared-root health and reports read, permission, I/O, and parse failures as incomplete data rather than absence.
- [ ] #2 B-011/D-016: strict candidate failures prevent reconciliation authority; no discovery error can authorize source-removed deletion or any target/manifest write.
- [ ] #3 B-011/AC-006: candidates record nested `frontmatter-name` flattening and flat-root wrapper shape, and only same-domain/same-logical-path overrides collapse.
- [ ] #4 B-011/D-017: `external-skills/cosmonauts` remains one stable-authority asset with all five nested frontmatter names reserved but never emitted as separate export candidates.
- [ ] #5 B-011/AC-006: every remaining output or reserved-name collision, including cross-domain duplicate names, is reported before writes rather than resolved first-wins.
- [ ] #6 The outer `lib/harness-runtime-inventory.ts` alone composes an existing runtime's chain, effective-skill, strict-candidate, source-health, and registry-path rows; `lib/harness-adapters/` imports no runtime, chain loader, skill discovery, CLI, package builder, or git reader.
- [ ] #7 `tests/harness-adapters/inventory.test.ts` contains `separates tolerant effective listing from strict healthy collision-aware export candidates` with marker `@cosmo-behavior plan:harness-adapters#B-011`; the plan-named discovery/composer tests prove tolerant precedence, strict failure data, flattening, one-bundle identity, and collision negatives.
<!-- AC:END -->

---
id: TASK-581
title: Materialize sticky copy and local-link asset shapes safely
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:harness-adapters'
dependencies:
  - TASK-580
createdAt: '2026-08-25T23:03:47.637Z'
updatedAt: '2026-08-25T23:03:47.637Z'
---

## Description

Owns B-005 from AC-002 at Implementation Order step 4. Seam/files: `lib/harness-adapters/render.ts`, `lib/harness-adapters/provenance.ts`, `lib/harness-adapters/sync.ts`, and `tests/harness-adapters/render.test.ts`. AC-002, INV-001/INV-002/INV-006, human D-002, D-008, and D-019 are stop-and-escalate ground. Link mode is explicit and local only; it never falls back to copy. This task uses temp/ignored fixtures only and cannot touch live targets or either live command.

<!-- AC:BEGIN -->
- [ ] #1 B-005/AC-002: a never-managed asset defaults to copy with a stable generated marker and provenance manifest that traces exact rendered bytes to one in-repo source.
- [ ] #2 B-005/D-002: a managed asset retains its recorded copy/link mode for bare sync and bare check; explicit conversion first reports old `recordedMode`, new `requestedMode`, `source-ahead`, and `mode-conversion`, and converts only from an intact baseline.
- [ ] #3 B-005/D-008: direct directory links, flat `<name>/SKILL.md` links, and generated wrappers have the registered local shape; generated wrappers link authored nodes and write/hash generated nodes separately.
- [ ] #4 B-005/INV-001/INV-006: links resolve only to registered local sources, authored linked bytes remain live, and explicit link requests never mutate source or silently fall back to copy.
- [ ] #5 B-005: a repeated sync of already-current copy, direct-link, flat-link, or generated-wrapper assets writes nothing and changes no manifest timestamp, file, link, or mtime.
- [ ] #6 B-005/D-019/INV-002: any command-resolving `--link`, remote source, descendant escape, broken/escaping symlink, owner-root escape, or invalid generated shape fails actionably before every owner-root/manifest write and leaves no provenance or partial artifact.
- [ ] #7 `tests/harness-adapters/render.test.ts` contains `materializes sticky copy direct-link flat and generated-wrapper shapes safely` with marker `@cosmo-behavior plan:harness-adapters#B-005` and mutation-style negatives prove the no-write and no-fallback clauses.
<!-- AC:END -->

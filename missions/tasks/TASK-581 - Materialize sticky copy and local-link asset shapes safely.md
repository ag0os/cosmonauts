---
id: TASK-581
title: Materialize sticky copy and local-link asset shapes safely
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:harness-adapters'
dependencies:
  - TASK-580
createdAt: '2026-08-25T23:03:47.637Z'
updatedAt: '2026-08-26T04:06:00.589Z'
---

## Description

Owns B-005 from AC-002 at Implementation Order step 4. Seam/files: `lib/harness-adapters/render.ts`, `lib/harness-adapters/provenance.ts`, `lib/harness-adapters/sync.ts`, and `tests/harness-adapters/render.test.ts`. AC-002, INV-001/INV-002/INV-006, human D-002, D-008, and D-019 are stop-and-escalate ground. Link mode is explicit and local only; it never falls back to copy. This task uses temp/ignored fixtures only and cannot touch live targets or either live command.

<!-- AC:BEGIN -->
- [x] #1 B-005/AC-002: a never-managed asset defaults to copy with a stable generated marker and provenance manifest that traces exact rendered bytes to one in-repo source.
- [x] #2 B-005/D-002: a managed asset retains its recorded copy/link mode for bare sync and bare check; explicit conversion first reports old `recordedMode`, new `requestedMode`, `source-ahead`, and `mode-conversion`, and converts only from an intact baseline.
- [x] #3 B-005/D-008: direct directory links, flat `<name>/SKILL.md` links, and generated wrappers have the registered local shape; generated wrappers link authored nodes and write/hash generated nodes separately.
- [x] #4 B-005/INV-001/INV-006: links resolve only to registered local sources, authored linked bytes remain live, and explicit link requests never mutate source or silently fall back to copy.
- [x] #5 B-005: a repeated sync of already-current copy, direct-link, flat-link, or generated-wrapper assets writes nothing and changes no manifest timestamp, file, link, or mtime.
- [x] #6 B-005/D-019/INV-002: any command-resolving `--link`, remote source, descendant escape, broken/escaping symlink, owner-root escape, or invalid generated shape fails actionably before every owner-root/manifest write and leaves no provenance or partial artifact.
- [x] #7 `tests/harness-adapters/render.test.ts` contains `materializes sticky copy direct-link flat and generated-wrapper shapes safely` with marker `@cosmo-behavior plan:harness-adapters#B-005` and mutation-style negatives prove the no-write and no-fallback clauses, including that a CRLF source, a frontmatter block with unknown or reordered keys, and a file with no frontmatter each render byte-identical modulo the single marker at its specified offset.
- [x] #8 B-005/Design §4/INV-001: identity Markdown rendering preserves source bytes exactly — line endings are never normalized, unknown frontmatter is never parsed or reserialized, and the single generated-by marker is inserted immediately after the frontmatter block, or at byte zero only when no frontmatter exists; a source-vs-rendered byte diff shows exactly that one insertion at that offset.
- [x] #9 B-005/D-008: direct-directory and flat `<name>/SKILL.md` link provenance records the expected canonical source path and link/wrapper shape and NO source-content digest, so a correct link stays `current` after its linked source's bytes or descendants change; only a wrong, missing, or escaping link target, an authored link-map change, or a generated-node input change moves it off `current`.
<!-- AC:END -->

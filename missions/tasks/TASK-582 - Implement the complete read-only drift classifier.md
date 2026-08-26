---
id: TASK-582
title: Implement the complete read-only drift classifier
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:harness-adapters'
dependencies:
  - TASK-581
createdAt: '2026-08-25T23:04:01.336Z'
updatedAt: '2026-08-26T04:18:59.355Z'
---

## Description

Owns B-006 from AC-002 at Implementation Order step 4. Behavior seam: `lib/harness-adapters/provenance.ts`, `lib/harness-adapters/sync.ts`, `cli/harness/subcommand.ts`; source/test files are `lib/harness-adapters/provenance.ts`, `lib/harness-adapters/sync.ts`, and `tests/harness-adapters/provenance.test.ts`, with CLI reporting wired later without taking behavior ownership. AC-002, INV-002/INV-003, human D-002/D-004, D-006, and D-013 are stop-and-escalate ground. Check is observation-only: it never acquires a lock, recovers, provisions, or writes. No live targets are used.

<!-- AC:BEGIN -->
- [x] #1 B-006/AC-002: every selected row is reported exactly once through Design §5's ordered owner/source/target/mode grid as `missing`, `current`, `source-ahead`, or `locally-edited`, and every non-current row exits nonzero; per D-008, link rows are classified from pointer shape and link-map/generated-node evidence only, never from a linked source's content digest, so an intact correct link stays `current` after its source's bytes or descendants change.
- [x] #2 B-006/D-002: bare check and bare sync resolve exactly the same desired mode, while an explicit conversion is reported as source-ahead from the recorded mode before any write-capable path.
- [x] #3 B-006/D-006/D-013: stable-authority assets remain current or source-ahead across cwd/package relocation; foreign project claims require safe explicit transfer; owned target mismatch outranks source drift; and unprovenanced exact copies remain conflicts.
- [x] #4 B-006: incomplete discovery is nonzero and authorizes no removal, source-unavailable states stay non-destructive, and unknown target frontmatter keys remain opaque raw bytes rather than early parse failures.
- [x] #5 B-006: manifest and pending journal are double-read around target observation; any concurrent version/digest change is `source-ahead (concurrent-change)` and nonzero.
- [x] #6 B-006/D-004: check creates or changes no roots, locks, manifests, journals, timestamps, files, links, or mtimes; it performs no recovery, is not added to universal scripts, selected migration checks may reach zero, and the known unfiltered permanent conflict remains expected nonzero.
- [x] #7 `tests/harness-adapters/provenance.test.ts` contains `classifies the complete owner source target mode and concurrent-read grid without writing` with marker `@cosmo-behavior plan:harness-adapters#B-006` and mutation controls catch mode disagreement, stale hashes, authority misclassification, incomplete-discovery removal, concurrent reads, and any check write.
<!-- AC:END -->

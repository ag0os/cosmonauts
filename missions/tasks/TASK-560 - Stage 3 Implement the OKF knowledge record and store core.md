---
id: TASK-560
title: 'Stage 3: Implement the OKF knowledge record and store core'
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:knowledge-surface'
dependencies:
  - TASK-559
createdAt: '2026-08-19T18:35:09.782Z'
updatedAt: '2026-08-19T18:35:09.782Z'
---

## Description

Deliver Slice A Stage 3 and own B-001, B-002, and B-004. Build the domain-neutral human-read and machine-write contracts on the existing `MemoryStore` substrate, test-first, without depending on Pi or migrated production content. Tests must be observed RED before implementation, then GREEN, followed by refactoring to one focused parser/store.

INV-1/INV-2, AC-001/AC-003/AC-005, OKF-markdown-only with exactly `decision | trade-off | gotcha | convention`, and the proposal/human-promotion boundary are ratified stop-and-escalate ground. Dedicated knowledge/memory pathways may write machine output only under `memory/agent/proposals/`; promotion into project/user `knowledge/` is human-only. D-010 explicitly leaves generic tools/backends trusted and unsandboxed. Preserve disk authority and the exclusions: no consolidation implementation, working state, episode/explicit-save changes, embeddings, retention, cache/registry correctness state, or default enablement.

<!-- AC:BEGIN -->
- [ ] #1 B-001 is GREEN for project and injected user roots: direct/recursive regular OKF markdown with any of the four ratified types is retrieved, type-only human records receive deterministic fallbacks, reserved indexes/symlinks/wrong-scope or malformed occupants are skipped with the planned warnings, and missing roots remain empty without scaffolding.
- [ ] #2 B-004 is GREEN: retrieval filters physical scope first, reflects edits/retimes/deletions from current disk, matches normalized metadata and body text, orders by explicit canonical timestamp or mtime fallback with path tie-break, and applies limit only after filtering.
- [ ] #3 B-002 is GREEN: complete project semantic proposals are written only under the real non-symlinked `memory/agent/proposals/<planSlug>/` root with strict provenance and typed identity; traversal/absolute paths, user scope, wrong type, symlinks, missing fields, interruption, and nonconforming occupants leave no curated file or partial replacement.
- [ ] #4 Proposal identity includes every stable caller field including normalized qualified writer and `sourceDate ?? null`; time-advanced same-writer retries/races return the unchanged first record, while writer-only changes select a different canonical path.
- [ ] #5 Human normalization requires only valid ratified `type`, while machine writes require all normalized metadata plus writer/source/date; existing stores remain compatible, `consolidate` stays an explicit no-op, and the user twin starts empty without copying project seeds or touching the real home directory.
- [ ] #6 The record/path/store contracts remain in `lib/memory/`, with one parser/store and no Pi, config, agent, domain, session, task, plan, architecture-map, direct adapter IO, sandbox, speculative backend, or correctness cache dependency.
- [ ] #7 Executable tests for B-001, B-002, and B-004 carry the exact `@cosmo-behavior plan:knowledge-surface#B-###` markers, are run RED before implementation and GREEN after refactor, and include the Quality Contract’s malformed metadata, path authority, provenance, retry, writer-identity, collision, and current-disk negatives.
<!-- AC:END -->

---
type: decision
title: 'QM isolation is a private local clone, not a linked worktree'
description: >-
  The QM reviews a private clone built from a plumbing-only capture of the
  operator checkout, because a linked worktree shares refs, stash and hooks.
resource: >-
  knowledge/qm-chain-safety/decision-qm-isolation-is-a-private-local-clone-not-a-linked-worktree-ebc24b81f338.md
tags:
  - git
  - isolation
  - quality-manager
  - snapshots
timestamp: '2026-09-23T00:00:00.000Z'
scope: project
kind: semantic
writer: claude-code/archivist
source: missions/archive/plans/qm-chain-safety/plan.md
date: '2026-09-23T00:00:00.000Z'
---
Host code captures the operator checkout with `GIT_OPTIONAL_LOCKS=0` and plumbing-only reads, so it never writes to the source, not even an index refresh. The capture covers HEAD, refs, index identity, tracked and non-ignored untracked paths, file and symlink bytes, and deletions. The host then makes a private local clone in an OS temp directory, writes the resolved base as a local ref (local main, then master, then origin/main), removes origin, detaches at the captured HEAD, and overlays the dirty state. The source is sampled again, and only an identical second sample is accepted; after bounded retries the host refuses. A linked worktree was rejected by the human because the invariant names refs and a linked worktree shares them. Isolation keys on the resolved qualified role (`coding/quality-manager`), derived from domain and file identity, never from a field the definition declares about itself. A QM that is not standalone and not in a chain's terminal position is refused before any session exists, and a refusal never falls back to the shared checkout. Real end-to-end runs on a dirty checkout showed the source byte-identical before and after.

---
id: TASK-516
title: >-
  Reference provider detection, consent-gated introspection, and executable
  resolution
status: To Do
priority: high
labels:
  - 'plan:analysis-capability-runtime'
  - backend
dependencies:
  - TASK-512
  - TASK-513
  - TASK-515
createdAt: '2026-07-29T16:40:48.860Z'
updatedAt: '2026-07-29T16:40:48.860Z'
---

## Description

Stage 3 of `missions/plans/analysis-capability-runtime/plan.md`, first
half: get to a trustworthy binding without running anything the user did
not consent to.

Read Design §2 and decisions D-014, D-015, D-022 first. D-014 exists
because Pi's `isProjectTrusted()` returns true for resource-less checkouts,
making implicit trust indistinguishable from an explicit user decision — a
repository-controlled binary must not run automatically.

Ratified ground: INV-5 (no capability tool mutates the codebase) and INV-3
(a provider runtime failure is never a clean result) outrank capability
completeness. AC-003, AC-007, and AC-011 are spec criteria. A detection
signal with no executable is unbound, not failed — nothing was executed.

Gate kinds: `correctness` (hard fail) and `artifact-conformance` (hard
fail). Record the commit HEAD at task start; that SHA is the changed-scope
base for any audit at task close.

<!-- AC:BEGIN -->
- [ ] #1 `B-004` — every canonical detection signal binds supported capabilities with provider, version, scopes, and metrics and publishes no command; the config-less package signal still binds because config introspection exit 3 is defaults-in-effect (`D-022`); the stale `.fallowrc.toml` signal is not treated as canonical.
- [ ] #2 `B-004` with `D-015` — executable resolution probes configured path, then the target project's package-manager-installed binary, then the injected test seam, and never a PATH/global binary or a mutable fetch; a detection signal with no resolvable executable reports every capability unbound `provider-not-installed`, never `failed`.
- [ ] #3 `B-025` — this repository's pin is exact, every result carries the detected version, and resolution never depends on a global install.
- [ ] #4 `B-037` — a resolved executable whose version differs from the validated engine binds with the detected version surfaced in status, while an out-of-contract envelope `schema_version` is a failure and never a silently normalized completed result.
- [ ] #5 `B-006` — boundary-conformance alone is unbound with `provider-not-configured` when no zones or rules are configured; zero native violations is not conformance.
- [ ] #6 Signal detection is file-read-only, and no introspection subprocess runs without recorded per-project execution consent held outside the repository (`D-014`).
- [ ] #7 Tests carry the `@cosmo-behavior plan:analysis-capability-runtime#B-004`, `#B-006`, `#B-025`, and `#B-037` markers, and the project's test, lint, and type-check steps pass.
<!-- AC:END -->

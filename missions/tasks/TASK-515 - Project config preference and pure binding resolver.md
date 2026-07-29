---
id: TASK-515
title: Project config preference and pure binding resolver
status: To Do
priority: high
labels:
  - 'plan:analysis-capability-runtime'
  - backend
dependencies:
  - TASK-514
createdAt: '2026-07-29T16:40:48.858Z'
updatedAt: '2026-07-29T16:40:48.858Z'
---

## Description

Stage 2 of `missions/plans/analysis-capability-runtime/plan.md`. The
resolver is where degradation is decided, so unsupported-metric and
unsupported-scope must both be resolved before any subprocess runs — that
is what keeps a contract mismatch from being misreported as an INV-3
provider failure.

Read Design §1 and §2 and decisions D-001, D-002, D-009, D-016 first.

Ratified ground: INV-2 requires unsupported to be visible, never silently
passed and never silently omitted. AC-004 and AC-007 are spec criteria.
Route collisions through the deviation classifier rather than widening a
scope or returning empty findings.

Gate kinds: `correctness` (hard fail) and `artifact-conformance` (hard
fail). Record the commit HEAD at task start; that SHA is the changed-scope
base for any audit at task close.

<!-- AC:BEGIN -->
- [ ] #1 `B-003` — capability and tool names stay fixed while a named provider preference swaps the binding, and an explicitly configured but unavailable provider is unbound with no fallback.
- [ ] #2 `B-028` — a malformed analysis object or provider value warns naming the offending field and value, ignores the analysis preference, and leaves every unrelated config key unchanged.
- [ ] #3 `B-011` — a bound complexity capability asked for a metric it does not declare returns unsupported-metric naming the requested and available metrics, without invoking the provider and without returning zero findings.
- [ ] #4 `B-033` — a request whose scope kind the binding does not advertise returns a structured unsupported-scope outcome naming requested and supported kinds before execution; the request never widens and is never reported as a provider failure (`D-016`).
- [ ] #5 The resolver is pure: it preserves failed detection, rejects unsupported metrics and scope kinds before execution, and exposes serializable binding status while provider executors stay in the session runtime.
- [ ] #6 Tests carry the `@cosmo-behavior plan:analysis-capability-runtime#B-003`, `#B-011`, `#B-028`, and `#B-033` markers, and the project's test, lint, and type-check steps pass.
<!-- AC:END -->

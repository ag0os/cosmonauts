---
id: TASK-519
title: 'Tool registration, status injection, consent gate, and cancellation'
status: To Do
priority: high
labels:
  - 'plan:analysis-capability-runtime'
  - backend
dependencies:
  - TASK-517
createdAt: '2026-07-29T16:40:48.867Z'
updatedAt: '2026-07-29T16:40:48.867Z'
---

## Description

Stage 5 of `missions/plans/analysis-capability-runtime/plan.md`. Compose
the runtime into Pi: register everything, discover at first need behind the
consent gate, and publish the status block.

Read Design §4 and decisions D-003, D-006, D-014, D-017, D-018 first. This
task also owns `B-036`, whose seam was designed in the runner task but whose
named test is tool-level and only provable once the tools exist.

Do not delete the legacy "Detected Analysis Tools" prose injection. It is
retained deliberately so no shipped prompt is stranded; the
`analysis-gate-rewiring` slice deletes it in the same stage that rewires
its consumers. Removing it here opens a silent gate window.

Ratified ground: INV-2 (unsupported is visible) and INV-5 (no capability
tool mutates the codebase). AC-003, AC-004, and AC-005 are spec criteria.

Gate kinds: `correctness` (hard fail) and `artifact-conformance` (hard
fail). Record the commit HEAD at task start; that SHA is the changed-scope
base for any audit at task close.

<!-- AC:BEGIN -->
- [ ] #1 All eight tools register immediately with narrow object-root schemas and runtime non-empty validation (`D-003`); tool and capability names match the documented vocabulary exactly.
- [ ] #2 `B-035` — agent start injects one row per capability, all seven, each with state and reason and no commands, across bound, unbound, failed, and detected-but-withheld fixtures (`D-018`).
- [ ] #3 `B-034` — with a detection signal, a sentinel executable, and no recorded consent, zero subprocesses spawn, status shows the provider detected-but-withheld with reason `execution-not-consented`, and every tool returns the withheld state; the paired consent-granted fixture binds normally (`D-014`).
- [ ] #4 `B-005` — a Python fixture lists all seven capabilities unbound with reasons and every tool returns unbound; none is omitted and none is passed.
- [ ] #5 `B-027` — empty or whitespace path strings, empty path arrays, and empty trace targets throw at validation before provider invocation; no request becomes project scope.
- [ ] #6 `B-036` — aborting a capability tool mid-execution terminates the provider child within the bounded grace period, throws the serialized aborted failure rather than a clean or empty result, and leaves no orphan process (`D-017`).
- [ ] #7 The legacy prose analysis injection is left in place and unchanged, tests carry the `@cosmo-behavior plan:analysis-capability-runtime#B-005`, `#B-027`, `#B-034`, `#B-035`, and `#B-036` markers, and the project's test, lint, and type-check steps pass.
<!-- AC:END -->

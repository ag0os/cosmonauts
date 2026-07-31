---
id: TASK-547
title: Keep boundary coverage synchronized with invocation configuration
status: To Do
priority: high
assignee: worker
labels:
  - backend
  - testing
  - review-fix
  - 'review-round:1'
  - 'plan:analysis-gate-coverage'
dependencies: []
createdAt: '2026-07-31T16:39:00.963Z'
updatedAt: '2026-07-31T16:45:46.838Z'
---

## Description

Review round 1 finding F-001. The Fallow runtime caches `boundariesConfigured` at discovery, but a later provider invocation reads current project configuration. A configured→unconfigured change can therefore declare `boundary-conformance` coverage from stale state and create the silent-pass direction forbidden by INV-2/INV-3 and D-031. Revalidate or otherwise bind the configuration signal to the same execution boundary as the capability invocation, failing closed when that state cannot be established. Preserve D-031 exactly: dead-code and audit declare boundary coverage only when zones and rules are configured for that invocation. Do not reintroduce OS sandboxing or change capability support/vocabulary. Implement test-first and keep the change narrow.

<!-- AC:BEGIN -->
- [ ] #1 A boundary configuration change after discovery cannot produce coverage based on the old configuration or silently pass boundary-conformance.
- [ ] #2 Stable configured and unconfigured executions retain D-031's exact declared-coverage behavior without changing capability or gate vocabulary.
- [ ] #3 Configured-to-unconfigured and unconfigured-to-configured caller-observable regression tests pass, and project lint/typecheck/tests remain green.
<!-- AC:END -->

## Implementation Notes

Ordering constraint carried from slice 1's D-027 (see memory/analysis-capability-runtime.md): two independent async preconditions plus a path-based spawn cannot both be last. Consent-last leaves executable identity stale; identity-last leaves consent stale. Two review rounds each 'fixed' one and reopened the other. Do NOT add configuration revalidation as a third independent async precondition ordered before or after the existing pair — fold it into the same single synchronous pre-spawn validation that already reads consent and captures executable identity, and document any residual honestly. Reordering is never the fix.

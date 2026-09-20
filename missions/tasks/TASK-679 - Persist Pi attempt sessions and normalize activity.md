---
id: TASK-679
title: Persist Pi attempt sessions and normalize activity
status: To Do
priority: high
labels:
  - orchestration
  - pi
  - testing
  - 'plan:execution-liveness'
dependencies:
  - TASK-678
createdAt: '2026-09-11T13:25:38.086Z'
updatedAt: '2026-09-13T04:03:39.131Z'
---

## Description

Implement B-008 and B-009 through pinned Pi's supported session, settings, result, abort, and lifecycle surfaces. Limit persistence to in-scope durable attempts, add a session-to-attempt registry for live activity, and retain full assistant results as attempt evidence or artifacts.

<!-- AC:BEGIN -->
- [ ] #1 Re-audit the pinned Pi APIs before implementation and record any plan-affecting difference; do not fork Pi or add a custom provider stream parser.
- [ ] #2 B-008 creates a sanitized run, step, and attempt scoped file-backed session and persists its reference before work without requiring a plan slug; the session file is pre-created so header and prompt persist before the first assistant message.
- [ ] #3 B-008 supplies deterministic explicit settings through session and DefaultResourceLoader paths, checks a latched cancellation state before every prompt, and stores the full final assistant result opaquely as attempt evidence or an artifact.
- [ ] #4 B-009 registers the live session with its owning token and conditionally attributes model, tool, child, nested-run, and activity-capable process evidence; post-run replay is diagnostic only.
- [ ] #5 An aborted Pi prompt cannot be reported as success solely because prompt resolved, and session path/retention behavior remains compatible with existing run storage.
- [ ] #6 B-008 or B-009: the code behavior is protected by tests the worker designed after seeing the code, driven through the shipped entry point and each seen to fail against deliberately broken logic; relevant correctness, lint, and typecheck gates pass.
<!-- AC:END -->

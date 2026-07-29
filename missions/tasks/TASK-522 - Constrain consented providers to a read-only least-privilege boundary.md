---
id: TASK-522
title: Constrain consented providers to a read-only least-privilege boundary
status: To Do
priority: high
labels:
  - security
  - backend
  - testing
  - review-fix
  - 'review-round:1'
  - 'plan:analysis-capability-runtime'
dependencies: []
createdAt: '2026-07-29T18:36:32.636Z'
updatedAt: '2026-07-29T18:36:32.636Z'
---

## Description

Remediate SR-001 against ratified INV-5. Consent permits execution but does not permit repository mutation or credential inheritance. Implement the narrowest portable enforcement boundary that prevents a project-controlled provider from writing to the project or receiving host secrets; fail closed where enforcement is unavailable. If the derived D-012 mechanism must change, amend it on-record before implementation without weakening INV-5.

<!-- AC:BEGIN -->
- [ ] #1 A malicious provider fixture that ignores no-cache/dry-run cannot modify repository or user-owned sentinel files through a capability invocation.
- [ ] #2 Provider children receive only an explicit allowlisted environment and no model/API credentials or unrelated host secrets.
- [ ] #3 The project view is OS-enforced read-only for provider execution, or capability execution reports failed/unavailable rather than weakening INV-5.
- [ ] #4 Pinned Fallow status and capability flows remain functional inside the enforced boundary.
<!-- AC:END -->

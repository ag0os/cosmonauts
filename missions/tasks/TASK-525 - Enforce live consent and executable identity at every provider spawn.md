---
id: TASK-525
title: Enforce live consent and executable identity at every provider spawn
status: To Do
priority: high
labels:
  - backend
  - security
  - testing
  - review-fix
  - 'review-round:1'
  - 'plan:analysis-capability-runtime'
dependencies: []
createdAt: '2026-07-29T18:36:32.726Z'
updatedAt: '2026-07-29T18:36:32.726Z'
---

## Description

Remediate merged findings F-002, SR-003, and SR-004. Cached bindings currently survive consent revocation; lexical consent fallback permits symlink retargeting; the bound executable can be replaced after introspection. Reauthorize canonical project/provider identity immediately before every spawn and invalidate stale executable identity.

<!-- AC:BEGIN -->
- [ ] #1 Revoking consent after status/discovery prevents the next introspection or capability subprocess and exposes execution-not-consented.
- [ ] #2 Consent keys authorize only the current canonical project identity; symlink retargeting cannot transfer consent to another checkout.
- [ ] #3 Replacing or retargeting the resolved executable after introspection invalidates the binding and never runs the replacement under stale provider/version identity.
- [ ] #4 Concurrent lifecycle/status/tool paths cannot reuse authorization or executable identity for different project contents.
<!-- AC:END -->

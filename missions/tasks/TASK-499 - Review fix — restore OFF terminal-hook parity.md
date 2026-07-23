---
id: TASK-499
title: Review fix — restore OFF terminal-hook parity
status: To Do
priority: high
labels:
  - review-fix
  - 'review-round:1'
  - backend
  - testing
  - 'plan:episodic-log-detached-hardening'
dependencies: []
createdAt: '2026-07-22T22:05:08.039Z'
updatedAt: '2026-07-22T22:05:08.039Z'
---

## Description

Round-1 remediation for F-005 and the duplicate codex OFF-hook finding. The onTerminalPersisted hook and swallowing/retry backstop are currently installed for source-less/gate-OFF runs, changing main's release-failure event/result semantics. Preserve exact local-main OFF behavior while retaining D-004 for enabled identity-bearing paths. Do not change D-001 order or successful completion ownership.

<!-- AC:BEGIN -->
- [ ] #1 Gate-OFF/source-less inline release failure matches local main for event bytes, completion/output, and rejection semantics.
- [ ] #2 Gate-OFF/source-less compiled-child release failure matches local main.
- [ ] #3 Enabled identity-bearing hook rejection remains isolated from broad catch, emits no second terminal, and skips capture.
- [ ] #4 Successful terminal order remains stamp → terminal event → completion → hook → capture.
- [ ] #5 Focused/full verification stays green.
<!-- AC:END -->

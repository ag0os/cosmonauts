---
id: TASK-471
title: Reconfirm Pi-first episodic baseline gate
status: To Do
priority: high
labels:
  - testing
  - 'plan:episodic-log'
dependencies: []
createdAt: '2026-07-17T20:06:47.668Z'
updatedAt: '2026-07-17T20:06:47.668Z'
---

## Description

Implementation Order step 1. Re-audit the pinned Pi 0.80.6 lifecycle and persistence surface before any episodic implementation, write `missions/plans/episodic-log/pi-first-audit.md`, and freeze representative disabled W2, plan/task, chain, and Drive baselines. This audit owns no B-### behavior and must not duplicate behavior markers. If Pi now provides durable project/user event storage, stop and route the plan for revision rather than building a second store.

<!-- AC:BEGIN -->
- [ ] #1 The supplementary audit records code-grounded Pi 0.80.6 evidence for lifecycle hooks and `pi.appendEntry()`, and concludes whether they provide durable cross-session project/user storage.
- [ ] #2 The ratified boundary remains explicit: Pi state and compaction cover session scope, while W3 uses the existing markdown store only for project/user run-and-decision episodes; no session store or new Pi session hooks are introduced.
- [ ] #3 Representative pre-W3 disabled baselines are frozen for authored memory, plan/task managers and tools/CLI, inline/durable chains, and inline/detached Drive outputs, events, specs, and files.
- [ ] #4 `missions/plans/episodic-log/pi-first-audit.md` contains no executable `@cosmo-behavior` marker, and the evidence artifact is retained despite Drive excluding `missions/**`.
- [ ] #5 The project-native tests, static analysis, and type checks covering the audit/baseline changes pass.
<!-- AC:END -->

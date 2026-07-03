---
id: TASK-439
title: Write analysis-tools audit substrate recommendation
status: To Do
priority: high
labels:
  - testing
  - devops
  - 'plan:code-structure-map'
dependencies: []
createdAt: '2026-07-03T14:12:37.855Z'
updatedAt: '2026-07-03T14:12:37.855Z'
---

## Description

Implementation order step 1. Behavior ownership: owns B-001 only. Create the plan-local analysis-tools audit rider before any analyzer adapter implementation. The audit must use the current-state evidence named in the plan and end with an explicit substrate recommendation that either allows map analyzer adapter work to proceed or blocks it for plan revision. Planned-behavior evidence must carry `@cosmo-behavior plan:code-structure-map#B-001` near the audit assertion.

<!-- AC:BEGIN -->
- [ ] #1 B-001: `missions/plans/code-structure-map/analysis-tools-audit.md` exists with findings covering current lint/typecheck/audit usage, agent-loop surfacing, and candidate static-analysis substrates.
- [ ] #2 B-001: the audit contains a `Substrate recommendation` section that explicitly allows or blocks analyzer adapter implementation and names the selected substrate when allowed.
- [ ] #3 B-001: the audit identifies analyzer configuration files that map freshness must hash for the selected substrate.
- [ ] #4 B-001: the audit evidence includes the required `@cosmo-behavior plan:code-structure-map#B-001` marker.
- [ ] #5 Quality Contract: analyzer implementation remains gated when the audit does not recommend a viable substrate.
<!-- AC:END -->

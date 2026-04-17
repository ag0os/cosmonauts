---
id: COSMO-013
title: Register orchestration Pi extension
status: Done
priority: medium
labels:
  - orchestration
dependencies:
  - COSMO-012
createdAt: '2026-02-09T19:09:19.388Z'
updatedAt: '2026-02-09T19:19:09.949Z'
---

## Description

Create extensions/orchestration/index.ts. Register chain_run tool and spawn_agent tool with Pi. chain_run takes a chain expression string and executes it. spawn_agent creates and runs a single agent session with given role and prompt. Follow same patterns as extensions/tasks/index.ts for tool registration.

<!-- AC:BEGIN -->
- [x] #1 chain_run tool registered with chain expression parameter
- [x] #2 spawn_agent tool registered with role and prompt parameters
- [x] #3 Tools use TypeBox schemas matching existing extension patterns
- [x] #4 Extension default-exported function following Pi convention
<!-- AC:END -->

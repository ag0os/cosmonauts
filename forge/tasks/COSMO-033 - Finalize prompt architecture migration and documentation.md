---
id: COSMO-033
title: Finalize prompt architecture migration and documentation
status: To Do
priority: medium
labels:
  - forge
  - docs
  - backend
  - 'plan:prompt-architecture'
dependencies:
  - COSMO-032
createdAt: '2026-02-26T20:57:56.953Z'
updatedAt: '2026-02-26T20:57:56.953Z'
---

## Description

Complete migration by removing legacy prompt files/directories once new wiring is verified, and update DESIGN.md to document the layered architecture, capability-tool alignment, runtime sub-agent context contract, and namespace metadata model.

<!-- AC:BEGIN -->
- [ ] #1 DESIGN.md documents the four-layer composition order and rationale
- [ ] #2 DESIGN.md reflects capability pack model and runtime sub-agent context contract
- [ ] #3 Legacy prompt files under prompts/base/ and prompts/roles/ are removed
- [ ] #4 No repository references remain to removed legacy prompt paths
- [ ] #5 Project verification commands (test, lint, typecheck) are executed successfully after cleanup
<!-- AC:END -->

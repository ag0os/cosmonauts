---
id: TASK-466
title: 'Pin Pi contract: schema serialization and sequential dispatch'
status: Done
priority: high
labels:
  - 'plan:memory-hardening'
dependencies: []
createdAt: '2026-07-14T14:40:43.802Z'
updatedAt: '2026-07-14T14:45:58.238Z'
---

<!-- AC:BEGIN -->
- [ ] #1 tests/pi-contract suite imports real @earendil-works packages (no MockPi) and runs without network access or API keys
- [ ] #2 A union-rooted tool is asserted to serialize as zero-parameter input_schema on the captured Anthropic wire request while an object-rooted tool keeps its properties
- [ ] #3 Real agentLoop with faux provider demonstrates parallel overlap for undeclared tools and strict serialization when one tool declares executionMode sequential
- [ ] #4 Context-hook visibility against real createAgentSession is either asserted or explicitly documented in-suite as not cleanly reachable
<!-- AC:END -->

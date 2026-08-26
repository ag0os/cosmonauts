---
id: TASK-573
title: 'Characterize registry, package, discovery, and live export contracts'
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:harness-adapters'
dependencies:
  - TASK-572
createdAt: '2026-08-25T23:02:06.353Z'
updatedAt: '2026-08-26T02:46:44.277Z'
---

## Description

Implementation Order step 1; RED/characterization prerequisite with no B-### ownership. Pin the current package parse/build/serialization/error contract, four legacy skill destinations, tolerant discovery behavior, strict-failure candidate expectations, existing `cosmonauts run chain list` route, exactly four project-copy baselines, the personal copied bundle, and both live command byte baselines. Characterization surfaces are the plan-named files `tests/harness-adapters/registry.test.ts`, `tests/agent-packages/definition.test.ts`, `tests/agent-packages/build.test.ts`, `tests/cli/export/subcommand.test.ts`, `tests/harness-adapters/inventory.test.ts`, `tests/skills/discovery.test.ts`, `tests/harness-runtime-inventory.test.ts`, `tests/cli/skills/subcommand.test.ts`, and `tests/skills/exporter.test.ts`. It prepares RED evidence for B-001/B-002/B-003/B-011 but does not own those behaviors. No sync or migration write is permitted, especially to the two live Claude commands.

<!-- AC:BEGIN -->
- [x] #1 Characterization distinguishes package-definition parsing from target selection while pinning existing Claude/Codex build, serialization, errors, prompt/tool options, and inline skill delivery.
- [x] #2 Characterization pins the four Claude/Codex project/personal skill paths, tolerant first-root discovery, strict read/parse failure data, nested/flat candidates, collision cases, and the existing chain-list route without adding a root chain-list flag.
- [x] #3 Read-only fixtures identify exactly the four A-001 project rows and the separate personal bundle; `playwright-cli` is represented only as a permanent foreign/untraceable conflict.
- [x] #4 Read-only byte baselines cover both fixed live Claude commands without modifying, moving, normalizing, or deleting either file.
- [x] #5 The plan-named characterization tests fail for the intended B-001/B-002/B-003/B-011 gaps rather than by changing ratified expected outcomes.
- [x] #6 No owner root, manifest, journal, evidence file, native command source, live target, memory/knowledge surface, or universal harness-check script is written.
<!-- AC:END -->

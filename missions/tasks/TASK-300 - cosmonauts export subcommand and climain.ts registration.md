---
id: TASK-300
title: cosmonauts export subcommand and cli/main.ts registration
status: Done
priority: high
assignee: worker
labels:
  - backend
  - api
  - testing
  - 'plan:external-agent-orchestration'
dependencies:
  - TASK-296
  - TASK-299
createdAt: '2026-05-11T21:38:19.044Z'
updatedAt: '2026-05-12T01:11:13.911Z'
---

## Description

Implement the human-facing `cosmonauts export` subcommand and register it in `cli/main.ts`. The subcommand bootstraps `CosmonautsRuntime` with bundled domain discovery, normalises CLI input to an `AgentPackageDefinition`, drives the build/compile pipeline, and prints a JSON success line.

Files to create/change:
- `cli/export/subcommand.ts` — new subcommand
- `cli/main.ts` — register `export` in both dispatch sites
- `tests/cli/export/subcommand.test.ts`
- `tests/cli/export/main-dispatch.test.ts`

Depends on: TASK-296, TASK-299

<!-- AC:BEGIN -->
- [x] #1 cosmonauts export --definition <path> --out <path> [--target claude-cli] reads, validates, builds, and compiles the definition, printing one JSON line with packageId, target, and outputPath on success (B-001).
- [x] #2 cosmonauts export <agent-id> --target claude-cli --out <path> bootstraps CosmonautsRuntime with discoverFrameworkBundledPackageDirs() so dogfood agents such as coding/explorer resolve, converts the agent to an AgentPackageDefinition via definitionFromAgent(), and follows the same build/compile path (B-002).
- [x] #3 --target defaults to claude-cli; any other target value (e.g. codex) is rejected before package build with a clear unsupported-target error (B-016).
- [x] #4 An unknown agent-id fails with a clear diagnostic before any build or compile step.
- [x] #5 A raw source-agent shorthand for a nonportable agent (e.g. coding/planner) fails before compile with an error naming the offending features and suggesting the --definition path (B-003).
- [x] #6 The subcommand accepts --domain <id> and repeated --plugin-dir <path> for parity with the main CLI runtime bootstrap.
- [x] #7 cli/main.ts contains 'export' in both the hard-coded dispatch predicate and the programs map so the route is exercised (B-013).
- [x] #8 Tests in tests/cli/export/subcommand.test.ts cover: definition export success, shorthand export success, success JSON shape, unknown-agent failure, unsupported-target failure, and nonportable-shorthand failure.
- [x] #9 Tests in tests/cli/export/main-dispatch.test.ts confirm cli/main.ts routes 'cosmonauts export ...' to createExportProgram() and does not fall through to normal prompt parsing (B-013).
<!-- AC:END -->

## Implementation Notes

Implemented and committed as 94694e9 (TASK-300: Add export subcommand). Added cli/export/subcommand.ts, registered export dispatch in cli/main.ts, and covered subcommand and main dispatch behavior. Verification passed: bun run test, bun run lint, bun run typecheck.

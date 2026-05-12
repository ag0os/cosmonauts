---
id: TASK-299
title: 'Bun compile helper: generated entry and binary compilation'
status: Done
priority: high
assignee: worker
labels:
  - backend
  - testing
  - 'plan:external-agent-orchestration'
dependencies:
  - TASK-298
createdAt: '2026-05-11T21:38:04.182Z'
updatedAt: '2026-05-12T01:03:29.838Z'
---

## Description

Implement the export compiler helper that generates a temporary TypeScript entry file with an embedded serialized `AgentPackage` and invokes `bun build --compile` to produce the standalone binary.

Files to create:
- `lib/agent-packages/export.ts`
- `tests/agent-packages/export.test.ts`

Depends on: TASK-298

<!-- AC:BEGIN -->
- [x] #1 lib/agent-packages/export.ts writes a temporary TypeScript entry file that imports runClaudeBinary() from the known module path and passes the serialized AgentPackage JSON as an embedded string literal.
- [x] #2 The generated entry does not read package data from any Cosmonauts repo path at runtime; all package data is embedded in the entry source (QC-007).
- [x] #3 The compile helper invokes bun build --compile <generated-entry> --outfile <out> using an injectable execFile boundary so tests do not require a real bun installation.
- [x] #4 Tests in tests/agent-packages/export.test.ts assert: the generated entry source contains the serialized package JSON, the runClaudeBinary import is present, and the bun build --compile command receives the correct arguments.
<!-- AC:END -->

## Implementation Notes

Implemented compileAgentPackageBinary() in lib/agent-packages/export.ts with a generated temporary TypeScript entry that imports runClaudeBinary from claude-binary-runner.ts, embeds the serialized AgentPackage JSON as a string literal, invokes bun build --compile via an injectable execFile boundary, and cleans up the temporary directory. Added tests/agent-packages/export.test.ts covering embedded JSON, runner import, no repo package-data read in the entry source, and bun arguments. Verification: bun run test -- tests/agent-packages/export.test.ts passed; bun run test passed. bunx biome check on the two new files passed. Full bun run lint is currently blocked by pre-existing formatting issues in TASK-298 files and missions/tasks/config.json; full bun run typecheck is currently blocked by pre-existing TASK-298 claude-binary-runner.test.ts tuple typing errors.

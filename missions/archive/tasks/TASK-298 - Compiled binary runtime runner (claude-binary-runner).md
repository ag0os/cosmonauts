---
id: TASK-298
title: Compiled binary runtime runner (claude-binary-runner)
status: Done
priority: high
assignee: worker
labels:
  - backend
  - testing
  - 'plan:external-agent-orchestration'
dependencies:
  - TASK-297
createdAt: '2026-05-11T21:37:56.302Z'
updatedAt: '2026-05-12T01:05:19.430Z'
---

## Description

Implement the standalone runtime entrypoint embedded into compiled exports. This module must have no dependency on `CosmonautsRuntime`, domain files, or project-local Cosmonauts paths; all agent data comes from the embedded `AgentPackage` argument.

Files to create:
- `lib/agent-packages/claude-binary-runner.ts`
- `tests/agent-packages/claude-binary-runner.test.ts`

Depends on: TASK-297

<!-- AC:BEGIN -->
- [x] #1 runClaudeBinary(pkg, options) is exported and orchestrates: arg parsing, prompt resolution, Claude invocation via MaterializedInvocation, stdout/stderr piping, and process exit with Claude's exit code.
- [x] #2 Trailing positional args are joined into the prompt and stdin is not awaited when args are present; stdin is read only when no positional args are provided (B-011).
- [x] #3 Empty prompt (no args and empty stdin) prints a usage message to stderr and exits non-zero (B-011).
- [x] #4 --allow-api-billing flag preserves ANTHROPIC_API_KEY in the Claude child env (B-010).
- [x] #5 --claude-binary <path> uses the provided path instead of 'claude' for the spawn (B-012).
- [x] #6 --prompt-mode append|replace overrides the package target default (B-008).
- [x] #7 A failed spawn or missing binary exits non-zero and prints a diagnostic to stderr naming the runtime (claude-cli), the binary path attempted, and a likely fix (B-012).
- [x] #8 Invocation warnings (e.g. anthropic_api_key_removed) are printed to stderr before forwarding Claude output (B-009).
- [x] #9 Claude runs with cwd: process.cwd() by default; temp assets are cleaned up in a finally block even when spawn fails (B-017).
- [x] #10 The module does not import CosmonautsRuntime, domain discovery, Drive, chain, or task modules.
- [x] #11 Tests in tests/agent-packages/claude-binary-runner.test.ts use injectable process/spawn boundaries to cover all behaviors without spawning a real claude binary.
<!-- AC:END -->

## Implementation Notes

Implemented runClaudeBinary with injectable argv/stdin/env/cwd/spawn/materialization boundaries. Added claude-binary-runner tests covering prompt args vs stdin, empty usage, allow-api-billing, claude-binary override, prompt-mode override, warning ordering, spawn diagnostics, cwd, cleanup, and forbidden imports. Verified with bun run test, bun run lint, and bun run typecheck.

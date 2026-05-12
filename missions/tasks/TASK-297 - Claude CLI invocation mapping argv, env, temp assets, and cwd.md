---
id: TASK-297
title: 'Claude CLI invocation mapping: argv, env, temp assets, and cwd'
status: Done
priority: high
assignee: worker
labels:
  - backend
  - testing
  - 'plan:external-agent-orchestration'
dependencies:
  - TASK-296
createdAt: '2026-05-11T21:37:44.143Z'
updatedAt: '2026-05-12T01:00:47.440Z'
---

## Description

Implement the single-source-of-truth mapping from an `AgentPackage` to a Claude CLI `MaterializedInvocation`: writing temp prompt assets, building argv with prompt-mode and tool flags, protecting subscription safety by default, and using the caller's cwd for the Claude working directory.

Files to create:
- `lib/agent-packages/claude-cli.ts`
- `tests/agent-packages/claude-cli.test.ts`

Depends on: TASK-296

<!-- AC:BEGIN -->
- [x] #1 Default argv is: claude -p --bare --setting-sources '' --append-system-prompt-file <temp/system.md> --tools <comma-separated> (B-007, B-008).
- [x] #2 promptMode:'replace' switches to --system-prompt-file without the --append-system-prompt-file flag (B-008).
- [x] #3 tools.preset is mapped to Claude tool names using the canonical preset mapping (coding→Bash,Edit,Read,Write,Glob,Grep; readonly→Read,Glob,Grep; verification→Bash,Read,Glob,Grep; none→[]); targetOptions.allowedTools overrides the preset when present (B-007).
- [x] #4 ANTHROPIC_API_KEY is removed from the child env and an anthropic_api_key_removed warning is added to the InvocationSpec by default; it is preserved when allowApiBilling is true (B-009, B-010).
- [x] #5 The returned MaterializedInvocation.spec.cwd matches the caller-provided cwd; the temp dir holds only prompt asset files and is not used as the working directory (B-017).
- [x] #6 MaterializedInvocation.cleanup() removes the temp dir; it is safe to call after Claude exits or when spawn fails (B-017).
- [x] #7 Tests in tests/agent-packages/claude-cli.test.ts cover all argv shapes, both prompt modes, all tool-preset mappings, allowedTools override, API-key removal default, opt-in preservation, caller cwd, and temp dir cleanup.
<!-- AC:END -->

## Implementation Notes

Implemented lib/agent-packages/claude-cli.ts and tests/agent-packages/claude-cli.test.ts. Verified targeted Claude CLI tests and targeted Biome check for changed files pass. Full bun run test currently fails in out-of-scope tests/agent-packages/build.test.ts because lib/agent-packages/build.ts throws "not implemented"; full typecheck currently fails in out-of-scope tests/agent-packages/claude-binary-runner.test.ts.

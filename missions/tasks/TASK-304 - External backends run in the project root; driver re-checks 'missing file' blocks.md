---
id: TASK-304
title: >-
  External backends run in the project root; driver re-checks 'missing file'
  blocks
status: Done
priority: high
labels:
  - 'plan:drive-smoke-fixes'
  - driver
dependencies: []
createdAt: '2026-05-12T19:34:15.139Z'
updatedAt: '2026-05-12T19:52:41.415Z'
---

## Description

claude-cli and codex spawn with cwd = run workdir (missions/sessions/.../runs/...), not the repo, so filesystem/git lookups are scoped wrong and tasks get false 'file does not exist' blocks. (1) Add projectRoot to BackendRunInvocation; runBackend forwards spec.projectRoot; claude-cli/codex spawn with cwd: invocation.projectRoot (artifact output paths stay under workdir). (2) Structural mitigation: prompt hardening alone is unreliable -- when a backend blocks/fails with a reason naming a path the driver can see on disk under projectRoot, annotate the event (contradicted: {path, existsOnDisk:true}) and retry the task once (config-gated, default on) with an appended note; strictly one retry, only when the path resolves to an existing file/dir. (3) Tighten the coding envelope Failure Protocol to require quoting the actual command + output a block relied on.

<!-- AC:BEGIN -->
- [x] #1 BackendRunInvocation carries projectRoot; runBackend passes spec.projectRoot
- [x] #2 claude-cli and codex spawn with cwd === projectRoot; codex/claude artifact paths still resolve under workdir
- [x] #3 When a backend's block/failure reason names a path that exists on disk under projectRoot, the emitted event is annotated (contradicted) and the task is retried exactly once with a note; if the path is genuinely absent, no retry
- [x] #4 Retry is bounded to a single attempt and gated by config (default on); no possibility of a retry loop
- [x] #5 Coding envelope Failure Protocol requires quoting the command and output excerpt the block relied on
- [x] #6 Regression test: fake backend that blocks on 'design/README.md does not exist' then succeeds -> with file present, one retry then Done; with file absent, no retry then Blocked
- [x] #7 Regression test: backends receive cwd === projectRoot
- [x] #8 bun run test, lint, typecheck all pass
<!-- AC:END -->

## Implementation Notes

Part 1: added projectRoot to BackendInvocation (lib/driver/backends/types.ts); runBackend forwards spec.projectRoot; claude-cli.ts and codex.ts spawn with cwd: invocation.projectRoot (codex -o summary path still under workdir); cosmonauts-subagent unchanged (already uses project root). Part 2: added DriverRunSpec.retryOnContradictedBlock (default true) and ContradictedBlockAnnotation; task_blocked/spawn_failed gained optional contradicted field; runOneTask refactored into a retry loop (runTaskAttempt + block-candidate finalize) that, on a block/failure/partial whose reason contains a path-like token resolving (resolve(projectRoot, token)) to an existing file/dir under projectRoot, emits the terminal event annotated with contradicted and re-runs the backend exactly once with an appended driver note (renderPromptForTask now takes options.appendedNote). Strictly one retry; conservative path extraction (strips quotes/backticks/brackets/trailing punctuation; token must contain '/' or a known file extension). Part 3: tightened bundled/coding/coding/drivers/templates/envelope.md Failure Protocol (must quote the actual command + output excerpt) and Worker Discipline (check filesystem not git ls-files for existence). Tests: tests/driver/contradicted-block-retry.test.ts (retry-once->Done, no-retry->Blocked, config off, cwd===projectRoot, stops at one retry); updated backend test invocations + cwd assertions. Verified: bun run test (2028 pass), bun run typecheck clean; bun run lint clean on changed files (one unrelated pre-existing format error in missions/tasks/config.json from concurrent work).

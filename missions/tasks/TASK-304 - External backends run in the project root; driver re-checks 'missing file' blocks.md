---
id: TASK-304
title: >-
  External backends run in the project root; driver re-checks 'missing file'
  blocks
status: To Do
priority: high
labels:
  - 'plan:drive-smoke-fixes'
  - driver
dependencies: []
createdAt: '2026-05-12T19:34:15.139Z'
updatedAt: '2026-05-12T19:34:15.139Z'
---

## Description

claude-cli and codex spawn with cwd = run workdir (missions/sessions/.../runs/...), not the repo, so filesystem/git lookups are scoped wrong and tasks get false 'file does not exist' blocks. (1) Add projectRoot to BackendRunInvocation; runBackend forwards spec.projectRoot; claude-cli/codex spawn with cwd: invocation.projectRoot (artifact output paths stay under workdir). (2) Structural mitigation: prompt hardening alone is unreliable -- when a backend blocks/fails with a reason naming a path the driver can see on disk under projectRoot, annotate the event (contradicted: {path, existsOnDisk:true}) and retry the task once (config-gated, default on) with an appended note; strictly one retry, only when the path resolves to an existing file/dir. (3) Tighten the coding envelope Failure Protocol to require quoting the actual command + output a block relied on.

<!-- AC:BEGIN -->
- [ ] #1 BackendRunInvocation carries projectRoot; runBackend passes spec.projectRoot
- [ ] #2 claude-cli and codex spawn with cwd === projectRoot; codex/claude artifact paths still resolve under workdir
- [ ] #3 When a backend's block/failure reason names a path that exists on disk under projectRoot, the emitted event is annotated (contradicted) and the task is retried exactly once with a note; if the path is genuinely absent, no retry
- [ ] #4 Retry is bounded to a single attempt and gated by config (default on); no possibility of a retry loop
- [ ] #5 Coding envelope Failure Protocol requires quoting the command and output excerpt the block relied on
- [ ] #6 Regression test: fake backend that blocks on 'design/README.md does not exist' then succeeds -> with file present, one retry then Done; with file absent, no retry then Blocked
- [ ] #7 Regression test: backends receive cwd === projectRoot
- [ ] #8 bun run test, lint, typecheck all pass
<!-- AC:END -->

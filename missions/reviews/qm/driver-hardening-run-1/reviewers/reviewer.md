# Reviewer reviewer

Run: qm-0abafc64-dedd-44f1-adef-626832984fa7
Lens: reviewer
Spawn: f02f850b-7f46-46d5-8a3c-837a242ed12e
Session: 01a0ef60-c80e-7116-8dd2-9d23fd40bda6
Role: coding/reviewer
Model: openai-codex/gpt-5.6-sol
Final-text SHA-256: 5937be6c255c7cfe0391bad508e5b6505108c6a035b3beb1caab99ff00a62184

## Full final text

# Review Report

base: e55040de840b888ed16f204e987f20bc7d465c84
range: e55040de840b888ed16f204e987f20bc7d465c84..captured changes (`materials/full.diff`)
overall: incorrect

## Overall Assessment

The patch introduces several data-preservation failures in worktree snapshot cleanup, task-note updates, and execution-probe coordination. I traced snapshot creation through both `runOneTask` and `runDriveTaskAttempt`, cleanup through `finalizeDriveSourceCommit`, note preservation through `TaskManager.updateTask`, and journal checks through both Drive execution paths.

## Findings

- id: F-001
  priority: P1
  severity: high
  confidence: 0.93
  complexity: complex
  title: "[P1] Journal checks do not prevent probes from racing with Drive work"
  files: lib/driver/run-one-task.ts, lib/driver/drive-scheduler-backend.ts, bundled/coding/extensions/execution-probe/index.ts
  lineRange: lib/driver/run-one-task.ts:595-596
  summary: Drive checks only whether a journal currently exists, without acquiring the probe lock used by `execution_probe`. If another coding session starts a probe after this check, Drive can proceed while the probe instruments live source; a Drive worker editing the same file can then have its edit overwritten when the probe restores its sidecar, and postflight can likewise observe temporary instrumentation. Commit finalization uses the shared lock, but the legacy and scheduler preflight, snapshot, spawn, and postflight boundaries remain uncoordinated.
  suggestedFix: Introduce shared, cross-process ownership for worktree-sensitive Drive phases and probes, with reentrant ownership for the worker allowed to invoke its own probe; do not rely on journal existence checks as synchronization.
  task:
    title: Coordinate Drive attempts atomically with execution probes
    labels: driver, concurrency, data-integrity
    acceptanceCriteria:
      1. A probe starting between Drive's journal check and a worktree-sensitive operation cannot overlap that operation or overwrite worker changes.
      2. Barrier-based regression tests cover both legacy and scheduler paths without preventing the active worker from invoking its own probe.

- id: F-002
  priority: P1
  severity: high
  confidence: 0.98
  complexity: simple
  title: "[P1] Rename records can silently delete the only recovery snapshot"
  files: lib/driver/runtime-helpers.ts
  lineRange: lib/driver/runtime-helpers.ts:507-519
  summary: `git diff-tree --name-status -z` emits three fields for rename and copy records (`R100`, old path, new path), but this loop consumes fixed status/path pairs. When a dirty snapshot contains a rename and the worker changes or loses the destination while the source remains absent, cleanup compares only the absent source, skips the destination, declares the snapshot contained, and deletes the only ref preserving the original renamed bytes.
  suggestedFix: Disable rename/copy detection for this delta with `--no-renames`, or parse variable-width name-status records correctly.
  task:
    title: "-"
    labels: "-"
    acceptanceCriteria:
      1. Cleanup retains a snapshot when a renamed or copied destination differs from the captured version.
      2. Cleanup still removes the ref when both sides of the rename or copy are fully preserved.

- id: F-003
  priority: P1
  severity: high
  confidence: 0.96
  complexity: simple
  title: "[P1] Parser-supported indented note headings lose their contents"
  files: lib/tasks/task-note-editor.ts, lib/tasks/task-parser.ts, lib/tasks/task-manager.ts
  lineRange: lib/tasks/task-note-editor.ts:19-35
  summary: The existing parser finds `## Implementation Notes` without anchoring it to column zero, so a valid Markdown heading indented by up to three spaces is parsed as implementation notes. The new preservation helper requires `##` at column zero, concludes that the original has no note section, and then removes the canonical serialized section during a status-only or criterion update, causing the parsed notes to disappear.
  suggestedFix: Use one shared section recognizer for parsing and preservation, with identical indentation, case, heading-level, and boundary rules.
  task:
    title: "-"
    labels: "-"
    acceptanceCriteria:
      1. Status-only and acceptance-criterion updates preserve notes under parser-supported indented headings.
      2. Parser and preservation tests exercise the same heading grammar, including negative heading-level cases.

- id: F-004
  priority: P2
  severity: medium
  confidence: 0.94
  complexity: simple
  title: "[P2] Snapshot creation unexpectedly requires configured Git identity"
  files: lib/driver/runtime-helpers.ts, lib/driver/run-one-task.ts, lib/driver/drive-scheduler-backend.ts
  lineRange: lib/driver/runtime-helpers.ts:451-463
  summary: Snapshot creation invokes `git commit-tree` with only `GIT_INDEX_FILE`, so it requires the user's Git author and committer identity. In a cloned CI/container checkout without `user.name` or `user.email`, any dirty run—including a `no-commit` run whose tracked task was just marked In Progress—fails before spawning the worker, even though this hidden recovery commit is framework-owned and no-commit operation previously did not require user commit identity.
  suggestedFix: Supply a deterministic framework-owned author and committer identity for recovery snapshot commits.
  task:
    title: "-"
    labels: "-"
    acceptanceCriteria:
      1. Snapshot creation succeeds with system, global, and local Git identity configuration disabled.
      2. Both Drive execution paths can start a dirty `no-commit` attempt in that environment.

- id: F-005
  priority: P2
  severity: medium
  confidence: 0.95
  complexity: simple
  title: "[P2] Snapshot containment ignores executable mode and object type"
  files: lib/driver/runtime-helpers.ts
  lineRange: lib/driver/runtime-helpers.ts:550-557
  summary: `treeEntries` discards the mode/type field from `ls-tree` and containment compares only blob hashes. If the captured dirty work is an executable-bit or regular-file/symlink change whose blob bytes match the final path, cleanup treats it as preserved and deletes the recovery ref even when the worker reverted that metadata; an uncommitted `chmod +x` on a script is a concrete example.
  suggestedFix: Compare complete Git tree identities, including mode/type and object ID, and obtain equivalent metadata from the working tree for no-commit paths.
  task:
    title: "-"
    labels: "-"
    acceptanceCriteria:
      1. Cleanup retains a snapshot when captured executable mode or object type is absent from the final state.
      2. Tests cover executable-bit preservation for both committed and no-commit cleanup.

## Exit Summary

- Overall verdict: incorrect
- Findings: P0: 0, P1: 3, P2: 2, P3: 0
- Complexity: simple: 4, complex: 1
- Scope reviewed: captured diff from `e55040de840b888ed16f204e987f20bc7d465c84`, including all listed changed files and affected existing call sites.
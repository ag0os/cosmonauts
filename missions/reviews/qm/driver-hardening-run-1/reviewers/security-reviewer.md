# Reviewer security-reviewer

Run: qm-0abafc64-dedd-44f1-adef-626832984fa7
Lens: security-reviewer
Spawn: fe0b46e4-1df6-4744-adb0-420e71ecead0
Session: 01a0ef60-e530-7116-8dd2-9d2519b70c8c
Role: coding/security-reviewer
Model: openai-codex/gpt-5.6-sol
Final-text SHA-256: 7e54ec3844843aa022b87b7ce01736a2964531927733d5a96668503308f377e2

## Full final text

# Security Review

## Overall

incorrect

## Assessment

The diff introduces several reachable local data-loss and denial-of-service paths around execution probing, destructive Git filtering, and snapshot cleanup. Explicitly documented residuals such as command substitution, aliases, redirect-overwrite, and escaped probe descendants are not refiled here.

## Findings

- id: SR-001
  dimension: blast-radius
  priority: P1
  severity: medium
  confidence: 0.99
  complexity: simple
  title: "Git switch force flags bypass the destructive-command guard"
  files: lib/agents/drive-worker-tool-guard.ts
  lineRange: 124-126
  summary: |
    The classifier recognizes only `git switch --discard-changes`; Git also supports `-f` and `--force`, so `git switch -f main` returns false here. Both the Drive Bash guard (`lib/agents/session-assembly.ts:259-266`) and execution probe (`bundled/coding/extensions/execution-probe/index.ts:385-386`) trust this result. A worker can therefore discard changes created after the pre-spawn snapshot, which that snapshot cannot recover.
  suggestedFix: Classify `switch -f` and `switch --force` as destructive and add guard/probe regression cases.

- id: SR-002
  dimension: input-validation
  priority: P1
  severity: medium
  confidence: 0.96
  complexity: complex
  title: "Probe commands have unbounded output capture"
  files: bundled/coding/extensions/execution-probe/index.ts
  lineRange: 439-449
  summary: |
    `execution_probe` sends an arbitrary project-controlled shell command to `runProviderProcess` with only a time bound. That runner spools stdout and stderr without a byte ceiling and materializes both complete files before returning. A hostile or broken test such as `yes` can consume gigabytes of temporary storage within the default 30 seconds and then exhaust memory during capture, potentially terminating the host while source remains instrumented.
  suggestedFix: Enforce finite output and timeout limits, terminating the command and restoring source when either limit is exceeded.
  task:
    title: "Bound execution-probe command output"
    labels: [review-fix]
    acceptanceCriteria:
      - "Probe stdout and stderr have an enforced aggregate byte ceiling independent of timeout."
      - "Exceeding the ceiling terminates the process tree, restores every instrumented file, and returns non-usable evidence."
      - "A high-volume-output regression test completes without unbounded disk or memory growth."

- id: SR-003
  dimension: blast-radius
  priority: P1
  severity: medium
  confidence: 0.94
  complexity: complex
  title: "Probe instrumentation can overwrite a concurrent source edit"
  files: bundled/coding/extensions/execution-probe/index.ts
  lineRange: 431-435
  summary: |
    The final digest check and `writeFile` are separate operations. If an editor, another agent, or a Drive worker replaces the file after line 432 reads it but before line 435 writes it, the probe overwrites the new bytes with instrumentation based on the stale version and later restores that stale version. The probe lock serializes only other probes, so the concurrent edit is silently lost and cannot be recovered from Drive's pre-spawn snapshot.
  suggestedFix: Instrument an isolated worktree or introduce a shared mutation protocol that prevents live file writers from racing the validation/write/restore transaction.
  task:
    title: "Prevent execution-probe instrumentation from clobbering concurrent edits"
    labels: [review-fix]
    acceptanceCriteria:
      - "A source replacement occurring after final validation but before instrumentation remains intact and causes the probe to refuse or retry."
      - "Concurrent Drive work and probe execution cannot erase edits made after the Drive snapshot."
      - "A deterministic race test covers the validation-to-write boundary."

- id: SR-004
  dimension: blast-radius
  priority: P2
  severity: medium
  confidence: 0.92
  complexity: complex
  title: "A partial instrumentation write cannot be automatically recovered"
  files: bundled/coding/extensions/execution-probe/index.ts
  lineRange: 315-435
  summary: |
    Instrumentation uses an in-place `writeFile` at line 435. An ENOSPC, I/O error, or process death after truncation can leave bytes whose digest is neither the original nor the planned instrumented digest. Restoration rejects exactly that state at lines 315-320, and restart recovery invokes the same check, leaving the tracked source corrupted despite the verified sidecar backup.
  suggestedFix: Make instrumentation an atomic, durably phased replacement so recovery can distinguish tool-owned incomplete writes from unrelated edits.
  task:
    title: "Make execution-probe instrumentation crash recoverable"
    labels: [review-fix]
    acceptanceCriteria:
      - "A failed or interrupted instrumentation write leaves either complete original or complete instrumented bytes, never a partial source file."
      - "Recovery restores the original digest after injected short-write and interruption failures."
      - "Recovery still refuses genuinely unrelated source changes."

- id: SR-005
  dimension: blast-radius
  priority: P1
  severity: medium
  confidence: 0.88
  complexity: simple
  title: "Rename records can make snapshot cleanup discard the only recovery ref"
  files: lib/driver/runtime-helpers.ts
  lineRange: 507-521
  summary: |
    `git diff-tree --name-status -z` may emit rename/copy records as `status, oldPath, newPath`, but the loop always consumes pairs. With rename detection enabled, it checks only the old path and misreads or skips the destination. If dirty work renamed and modified a file and the worker later deletes the destination while leaving the old path absent, cleanup can conclude the snapshot is contained and delete the only ref holding those bytes.
  suggestedFix: Disable rename detection for this comparison or correctly parse the three-field `R`/`C` records, with a discarded-destination regression test.

- id: SR-006
  dimension: blast-radius
  priority: P2
  severity: low
  confidence: 0.98
  complexity: simple
  title: "Snapshot containment ignores executable and object mode changes"
  files: lib/driver/runtime-helpers.ts
  lineRange: 521-565
  summary: |
    `treeEntries` discards each Git tree entry's mode and compares only object IDs. A pre-spawn executable-bit change produces a snapshot delta but keeps the same blob ID; if the worker removes that permission change, cleanup sees equal hashes and deletes the ref containing the original mode. The same comparison cannot distinguish a symlink from a regular file with an equal blob.
  suggestedFix: Preserve and compare Git modes alongside object IDs, including working-tree mode normalization, before deleting snapshot refs.
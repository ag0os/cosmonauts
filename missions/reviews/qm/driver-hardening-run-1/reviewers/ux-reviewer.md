# Reviewer ux-reviewer

Run: qm-0abafc64-dedd-44f1-adef-626832984fa7
Lens: ux-reviewer
Spawn: e0d3841a-f1ec-40b5-b29f-6df14f7a79b8
Session: 01a0ef61-19cd-7116-8dd2-9d29077bd371
Role: coding/ux-reviewer
Model: openai-codex/gpt-5.6-sol
Final-text SHA-256: 4887a42917fda4b81121af35836f6402744a1f3a88bf47ff9b885c70b9d8cd3e

## Full final text

# UX Review

## Overall

incorrect

## Assessment

The new Drive and analysis surfaces are generally well documented, but the execution probe has one silent source-corruption path and two recovery/feedback gaps. These findings are within the captured scope; no pre-existing or out-of-scope issues are included.

## Findings

- id: UR-001
  dimension: data-loss
  priority: P1
  severity: high
  confidence: 0.98
  complexity: complex
  title: "Execution probe can leave instrumented source staged while reporting successful restoration"
  files: bundled/coding/extensions/execution-probe/index.ts
  lineRange: 148-151
  summary: |
    The side-effect comparison deliberately excludes every instrumented path from
    both byte and Git-status checks. Restoration at lines 476-482 rewrites only
    worktree files, not their index entries. If the confirmed test command or a
    tool it invokes runs `git add` while a target is instrumented, the index keeps
    the injected probe statement after the worktree is restored. Lines 499-529
    then omit that path, delete the journal, and can report `restored: true` and
    `usableZero: true`. A later backend commit can silently commit instrumentation
    containing a reference to the now-deleted hit file.
  suggestedFix: Preserve and verify each target's index state, and never remove the journal or report usable evidence when an instrumented index entry changed.
  task:
    title: "Protect execution-probe target index state"
    labels: [review-fix]
    acceptanceCriteria:
      - "After every probe outcome, each target's worktree and index state match their pre-probe state, or the result remains recovery-required."
      - "A test command that stages an instrumented target cannot produce restored: true or usableZero while leaving probe code staged."

- id: UR-002
  dimension: confusing-states
  priority: P2
  severity: medium
  confidence: 0.96
  complexity: simple
  title: "Documented automatic recovery cannot clear termination-error journals"
  files: bundled/coding/capabilities/execution-probe.md, bundled/coding/extensions/execution-probe/index.ts, domains/shared/skills/drive/SKILL.md
  lineRange: 5-5
  summary: |
    The capability text at execution-probe.md:5 and Drive skill at SKILL.md:29
    tell users that a later probe can recover an intact journal from verified
    sidecars. However, index.ts:348-356 unconditionally retains any journal with
    a `termination-error` marker, even after restoring and verifying its source
    files. Every later call therefore returns `process tree not verified stopped`,
    and Drive remains blocked. The documentation identifies corrupt sidecars and
    unverifiable source changes as manual-recovery cases but does not identify
    this permanent termination-error state or explain how a user can safely clear it.
  suggestedFix: Document termination-error journals as requiring manual process-tree verification and provide the exact safe recovery procedure.

- id: UR-003
  dimension: feedback
  priority: P2
  severity: medium
  confidence: 0.94
  complexity: simple
  title: "Failed probe commands discard diagnostics written to stdout"
  files: bundled/coding/extensions/execution-probe/index.ts
  lineRange: 519-523
  summary: |
    The probe returns the command status, exit code, and a stderr tail, but omits
    stdout entirely. When a project test runner writes its failure explanation to
    stdout, users receive only a nonzero exit code and cannot tell why the probe
    evidence is unusable without rerunning the command separately.
  suggestedFix: Include a bounded stdout tail alongside stderr in the probe result.
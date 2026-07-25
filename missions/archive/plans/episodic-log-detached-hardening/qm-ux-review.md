# UX Review: round 1

## Overall

incorrect

## Assessment

Gate-OFF output identity and the fixed terminal → completion → capture order are preserved in the reviewed paths, and detached capture diagnostics are narrowly drained without duplication. Two enabled failure/resume flows remain misleading or silently incomplete.

## Findings

- id: UR-001
  dimension: confusing-states
  priority: P1
  severity: high
  confidence: 0.99
  complexity: simple
  title: "Completed graph runs silently skip terminal-only episode reconciliation"
  files: cli/drive/subcommand.ts
  lineRange: 402-407
  summary: |
    `prepareTerminalResumeEpisodeIdentity` returns whenever any durable graph steps exist. A normal
    completed graph-backed run has those steps even when `remainingTaskIds` is empty and an
    authoritative completion file exists. `prepareResume` subsequently treats that completion as
    terminal at lines 470-479, prints the normal success JSON, and returns, but the skipped identity
    preparation means no deterministic attempt, ledger, or terminal episode is recorded. Users who
    enable episodic logging and resume a real completed Drive graph therefore see a successful,
    apparently reconciled result while the requested terminal evidence is silently absent; repeated
    resumes remain absent rather than idempotently converging on one episode.
  suggestedFix: Let completion-backed terminal-only resumes prepare deterministic identity even when durable graph state exists, and add a completed graph-backed regression.

- id: UR-002
  dimension: confusing-states
  priority: P2
  severity: medium
  confidence: 0.98
  complexity: simple
  title: "Combined update and lock-release failures falsely say the update continued"
  files: lib/memory/episode-transition-lock.ts
  lineRange: 93-99
  summary: |
    When the protected plan/task update rejects and lock release also rejects, this branch reports
    the lock error and then rethrows the original update error. The shared warning rendered at lines
    127-132 nevertheless always ends with `Continuing unlocked.` No unlocked retry occurs in this
    branch, so users receive a warning claiming continuation immediately alongside a failed update.
    Filesystem or permission failures can realistically make both the entity write and lock release
    fail together, leaving contradictory guidance about whether the requested change was applied.
  suggestedFix: Use failure-state-specific warning text that does not claim an unlocked retry when the protected action already failed.

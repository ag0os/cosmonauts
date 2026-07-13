# UX Review: round 1

## Overall

incorrect

## Assessment

The direct/proposed save, collision confirmation, complete-profile replacement, oversized-profile, success/failure, empty-recall, and truncation flows are generally clear and observably covered. Malformed-record warnings do not complete the user-visible flow, however: automatic context loading discards them, and recall exposes only a count rather than the affected file and reason.

## Findings

- id: UR-001
  dimension: feedback
  priority: P2
  severity: medium
  confidence: 0.99
  complexity: simple
  title: "Automatic memory loading silently discards malformed-record warnings"
  files: domains/shared/extensions/agent-memory/index.ts
  lineRange: 248-263
  summary: |
    `retrieveMemoryContext` returns file-specific warnings, but `before_agent_start` checks only
    `records` and passes only those records into `buildMemoryContext`. If a malformed profile or
    playbook is the only record, the handler returns as though memory were simply absent; if healthy
    records also exist, Cosmo receives silently incomplete context. From the user's perspective the
    assistant appears to have forgotten memory, with no affected path, cause, or recovery cue.
  suggestedFix: Include retrieval warnings with human-readable paths and reasons in the injected context, including when no valid records remain.

- id: UR-002
  dimension: confusing-states
  priority: P2
  severity: medium
  confidence: 0.99
  complexity: simple
  title: "Recall warnings do not identify the malformed file or failure reason"
  files: domains/shared/extensions/agent-memory/index.ts
  lineRange: 730-765
  summary: |
    Both matched and no-match recall results reduce all store warnings to a count and tell the user
    to “see details.warnings.” The result text therefore omits the file and parse/validation reason
    needed to fix malformed memory, despite the store providing both. The observable assertions at
    `tests/extensions/agent-memory.test.ts:1586-1588` and `1600-1602` currently lock in this generic
    message rather than the required file-specific warning.
  suggestedFix: Render each warning's human-readable path and reason in recall text for both matched and no-match results.

- id: UR-003
  dimension: consistency
  priority: P3
  severity: low
  confidence: 0.98
  complexity: simple
  title: "Tool descriptions still present memory as note-only"
  files: domains/shared/extensions/agent-memory/index.ts
  lineRange: 149-216
  summary: |
    The expanded `remember` and `recall` tools still describe themselves as saving or searching
    notes, and the recall limit is likewise described as a note limit. These model-facing
    descriptions conflict with the new profile/playbook prompt contract and can steer Cosmo away
    from the intended tool for those records. The old wording is explicitly retained by
    `tests/extensions/agent-memory.test.ts:1328-1333`.
  suggestedFix: Make the tool and limit descriptions type-neutral and explicitly cover notes, profiles, and playbooks.

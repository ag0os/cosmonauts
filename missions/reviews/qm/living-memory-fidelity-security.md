# Security Review: round 1

## Overall

incorrect

## Assessment

The branch closes the previously reported SR-001 through SR-009 cases, and the durable-file changes only tag errors around the existing link/rename/remove/write ordering. Two source-discovery paths still fail open on project-controlled symlinks: the episode source follows an escaping ancestor and can prune an external episode, while the knowledge source treats a rejected source tree as a healthy complete inventory.

`lib/memory/retirement-store.ts` is unchanged in `03c1f529790739ce317b96c0fcd2b2ce66da6c8d..HEAD`; D-026 retirement sequencing was not reopened. The range does not modify live `knowledge/`, and the reproductions used temporary roots only.

## Findings

- id: SRQ-001
  dimension: path-handling
  priority: P1
  severity: medium
  confidence: 1.0
  complexity: simple
  title: "The episode source follows an escaping directory symlink and prunes the external file"
  files: lib/memory/consolidation-sources.ts
  lineRange: lib/memory/consolidation-sources.ts:365-371,441-447,494-546,1201-1215
  evidence: |
    `directEpisodePaths()` passes `projectRoot/memory/agent/episodes` directly to `readdir()` without checking that the directory or its ancestors resolve beneath the canonical project root. `O_NOFOLLOW` is applied later only to each final file, so it does not prevent traversal through a symlinked `episodes`, `agent`, or `memory` directory. Collection then reports `inventoryComplete: true`; finalization reconstructs the same lexical path and performs the journal, rename, and remove sequence through the symlink.

    A temporary-root reproduction made `project/memory/agent/episodes` a symlink to an external directory containing a valid `victim.md`. The production source collected it as `memory/agent/episodes/victim.md` with `inventoryComplete: true`; calling production `finalize()` returned `episodePrunes: ["memory/agent/episodes/victim.md"]`, `writesCommitted: true`, and the external `victim.md` no longer existed.
  impact: |
    A project-controlled source tree can make consolidation ingest an out-of-project or user-scope episode as project evidence, disclose its contents to the judgment path, and delete it after accepted proposal representation. The mutation runs with the user's filesystem privileges and crosses the selected project boundary.
  suggestedFix: Reject episode source directories whose resolved location is not contained beneath the canonical project root, and fail collection as incomplete before admitting any records from that directory.

- id: SRQ-002
  dimension: fail-closed
  priority: P1
  severity: medium
  confidence: 0.99
  complexity: simple
  title: "Rejected knowledge directories are reported as a healthy complete inventory"
  files: lib/memory/knowledge-store.ts, lib/memory/consolidation-sources.ts, lib/memory/living-memory.ts
  lineRange: lib/memory/knowledge-store.ts:379-388,409-420; lib/memory/consolidation-sources.ts:340-349; lib/memory/living-memory.ts:252-278
  evidence: |
    `listKnowledgeFiles()` returns an empty file list without a warning when the knowledge root exists as a symlink or non-directory. Recursive discovery likewise silently returns when a discovered directory is a symlink/non-directory and treats `ENOENT` during traversal as healthy absence. The changed corpus source defines completeness only as `warnings.length === 0 && uninventoriedDeclines.length === 0`, so these silent skips become `inventoryComplete: true`. `living-memory.ts` then crosses the completeness barrier and supplies the partial/empty keys to `dischargeStale()`.

    A temporary-root reproduction pointed `project/knowledge` at an external directory containing a valid project knowledge record. Production `collect()` returned `records: []`, `inventory: []`, `warnings: []`, `omitted: 0`, and `inventoryComplete: true`.
  impact: |
    A planted symlink, unsafe root occupant, or traversal-time directory loss can hide current knowledge while still authorizing absence-dependent work. Consolidation may discharge materialized receipts and make represented-evidence or retirement-pressure decisions from an inventory it did not actually scan, corrupting durable state instead of failing closed.
  suggestedFix: Emit a source warning for every existing unsafe/unscannable knowledge directory and for discovered directories lost during traversal, so the corpus source reports `inventoryComplete: false` and the existing barrier blocks absence-dependent work.

# UX Review: round 1

## Overall

incorrect

## Assessment

The new owner commands are reachable and their successful JSON results expose the core state, but several end-to-end CLI paths remain misleading or hard to recover from. In particular, one accepted model-flag form is silently ignored, non-JSON output conceals mutations and recovery state, JSON-mode validation errors break the mode contract, the owner close-out workflows are under-documented, and two documentation claims disagree with the shipped API and behavior.

## Findings

- id: UR-001
  dimension: confusing-states
  priority: P1
  severity: medium
  confidence: 1.0
  complexity: simple
  title: "The equals form of --model is accepted but silently ignored"
  files: cli/memory/subcommand.ts
  lineRange: cli/memory/subcommand.ts:111-132,547-553
  summary: |
    The command registers `--model <provider/model>` with Commander, which accepts both
    `--model test/provider` and `--model=test/provider`. The action then ignores Commander's
    parsed `commandOptions.model` and rescans raw arguments only for an element exactly equal to
    `--model`. Consequently, `cosmonauts memory consolidate --model=test/provider` runs in full
    mode with the default model while appearing to honor the override. This is a silent model,
    provider, and potentially cost choice rather than a visible validation failure.
  suggestedFix: Read the normalized Commander option value (while preserving explicit `--no-model` conflict detection) and cover both spaced and equals forms.

- id: UR-002
  dimension: feedback
  priority: P1
  severity: medium
  confidence: 1.0
  complexity: simple
  title: "Human and plain output hide what consolidation changed"
  files: cli/memory/subcommand.ts
  lineRange: cli/memory/subcommand.ts:250-283,485-505
  summary: |
    A successful consolidation can write proposals, soft-retire knowledge, prune represented
    episodes, emit declines or warnings, and record manifest/recovery details, but human output is
    always only `Living-memory consolidation completed.` and plain output is only `kind=ran`.
    The same omission is risky on restoration: a release-unconfirmed failure may carry
    `writesCommitted: true` and a committed manifest path, yet human/plain rendering omits those
    fields. Users cannot tell which files moved or were removed, what needs review, or whether a
    reported failure committed durable state unless they knew in advance to request JSON.
  suggestedFix: Render changed/proposed paths, prune counts, declines/warnings, and recovery/writesCommitted evidence in human and plain modes.

- id: UR-003
  dimension: feedback
  priority: P2
  severity: medium
  confidence: 0.98
  complexity: simple
  title: "Model-backed consolidation gives no start or progress feedback"
  files: cli/memory/subcommand.ts, cli/memory/judgment-provider.ts
  lineRange: cli/memory/subcommand.ts:123-136; cli/memory/judgment-provider.ts:83-105
  summary: |
    The default command performs filesystem scans and may then await a model session, but it emits
    nothing until the entire pass returns. The model wait at `session.prompt(...)` is unbounded from
    the user's perspective, so a terminal user sees an apparently hung command and cannot tell
    whether scanning or judgment has started. The existing architecture generator demonstrates the
    established CLI pattern of writing progress to stderr while reserving stdout for final output;
    memory consolidation supplies no equivalent feedback.
  suggestedFix: Emit concise phase/start feedback to stderr for human/plain runs while keeping JSON stdout clean.

- id: UR-004
  dimension: consistency
  priority: P1
  severity: medium
  confidence: 1.0
  complexity: simple
  title: "Thrown memory errors stop being JSON when --json is selected"
  files: cli/main.ts, cli/memory/subcommand.ts
  lineRange: cli/main.ts:725-755; cli/memory/subcommand.ts:121-122,154-168,178-190
  summary: |
    Successful memory commands honor `--json`, but flag conflicts, invalid improve pointers,
    malformed proposals, and improve lock errors throw out of the action. The newly routed memory
    program reaches the generic top-level catch, which calls `printCliError` with `{}` instead of
    the command's output options. For example, an invalid task pointer with `--json` produces empty
    stdout and a human-formatted stderr line. Other CLI handlers pass their JSON options into the
    shared error renderer, so automation cannot rely on one machine-readable envelope across this
    new command's success and failure paths.
  suggestedFix: Catch memory action errors with the selected output mode and emit the established JSON error envelope with a nonzero exit.

- id: UR-005
  dimension: flow
  priority: P2
  severity: medium
  confidence: 0.99
  complexity: simple
  title: "Improve action does not explain the prerequisite conversion or pointer formats"
  files: cli/memory/subcommand.ts, docs/memory.md
  lineRange: cli/memory/subcommand.ts:143-169,286-379; docs/memory.md:408-418
  summary: |
    Closing an improve proposal is a two-step owner flow: the human must first create or edit the
    product artifact, then record the existing target as a roadmap heading, task ID, prompt path,
    or skill `SKILL.md` path. The command help labels both required options without descriptions,
    and the documentation only says “existing pointer” and that the command does not perform the
    edit. It never tells the user the accepted value shape for each kind. The resulting “pointer
    does not exist” errors echo the rejected value but do not explain a valid example, leaving a
    user with an open proposal and no discoverable route to close it.
  suggestedFix: Document the edit-first/close-second sequence and give accepted pointer syntax and examples in command help, docs, and invalid-pointer errors.

- id: UR-006
  dimension: flow
  priority: P2
  severity: medium
  confidence: 0.99
  complexity: simple
  title: "Restore assumes users know the first git-move act and its exact paths"
  files: cli/memory/subcommand.ts, lib/memory/retirement-store.ts, docs/memory.md
  lineRange: cli/memory/subcommand.ts:194-217; lib/memory/retirement-store.ts:282-304; docs/memory.md:432-439
  summary: |
    Restoration intentionally requires a human move followed by the annotation command, but the
    CLI help only calls `restore` an annotation and the docs do not show the actual two commands.
    If the user invokes `restore` first, the runtime says only that the human-moved live path is
    required; it has already derived the retired source path but does not print it. The retired-path
    conflict likewise says that “the retired path” must be absent without naming it. Users must
    reverse-engineer `knowledge/retired/<original-relative-path>` before they can recover a record.
  suggestedFix: Show the exact `git mv <retired-path> <live-path>` then `cosmonauts memory restore ...` sequence, and include both resolved paths in prerequisite/conflict diagnostics.

- id: UR-007
  dimension: consistency
  priority: P1
  severity: medium
  confidence: 1.0
  complexity: simple
  title: "The documented autonomy payload kind is rejected by the implementation"
  files: docs/memory.md, lib/memory/consolidation-job.ts
  lineRange: docs/memory.md:483-488; lib/memory/consolidation-job.ts:9-15,54-62
  summary: |
    The memory reference tells a sibling host to send `kind: "memory.consolidate"`, while the
    exported payload contract and parser require `kind: "living-memory.consolidate"`. A consumer
    implementing the documented payload receives `Invalid living-memory payload: unsupported
    kind` before any job runs. The B-020 documentation pin currently preserves the incorrect
    spelling rather than protecting the shipped contract.
  suggestedFix: Change the documentation and its pin to the exported `living-memory.consolidate` kind.

- id: UR-008
  dimension: confusing-states
  priority: P1
  severity: medium
  confidence: 0.99
  complexity: simple
  title: "The safety overview says consolidation does not change the episodic log even though it prunes episodes"
  files: docs/memory.md, lib/memory/consolidation-sources.ts
  lineRange: docs/memory.md:349-355,369-376,448-453; lib/memory/consolidation-sources.ts:213-247
  summary: |
    The overview says living-memory consolidation does not “change ... the episodic log,” but the
    same document later says represented project episodes are removed, and the episodic source
    calls `removeFile` for unchanged represented episode bytes. A user deciding whether a normal
    (non-dry) pass is non-destructive can reasonably trust the earlier safety statement and be
    surprised that episode files disappear. Later detail does not make the contradictory top-level
    assurance safe.
  suggestedFix: Clarify that consolidation leaves episodic capture semantics unchanged but may durably prune represented project episode files; reserve no-change guarantees for dry run.

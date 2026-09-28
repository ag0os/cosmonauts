---
title: Establish a Clean Static-Health Baseline
status: active
createdAt: '2026-09-28T14:03:17.956Z'
updatedAt: '2026-09-28T14:20:55.925Z'
---

## Overview

This plan turns the ratified project-health audit into eleven ordered implementation slices. It first freezes and reconciles the whole-project evidence, then removes all confirmed dead-code and duplicate-export findings, eliminates every confirmed one- or two-file clone family, characterizes and refactors production critical-complexity findings, records justified baselines for the remaining tiers, and finally refreshes the changed-scope floors and publishes a reproducible before/after health record.

The work is behavior-preserving. The shipped CLI, registered tools, public library entry points, persisted artifacts, recovery behavior, cancellation behavior, and error reporting remain observably unchanged. Structural findings are not made to disappear through configuration, suppressions, widened entry points, threshold changes, or production-scope changes.

The supplied Fallow 2.54.2 evidence at `64dca3c` is the starting inventory, not an assertion that findings still reproduce. Each implementation slice re-runs and traces its owned findings through the project analysis surface immediately before editing. A non-reproducing or untraceable finding is recorded as unresolved and is not claimed as fixed.

The plan has ten behavior outcomes, below the twelve-behavior checkpoint. Its eleven implementation slices are deliberately sequential because dead-code cleanup changes clone identities, clone extraction changes complexity, and complexity refactoring can reintroduce earlier findings.

## Architecture Context

- `docs/analysis-capabilities.md` defines the seven provider-neutral capabilities, explicit bound/unbound/failed states, completed verdicts, and non-passing trace results. This plan preserves that vocabulary in the health record.
- `docs/fallow.md` defines the Fallow 2.54.2 operations, trace targets, identity baselines, and the distinction between project-scope evidence and changed-scope audit.
- `docs/fallow-exceptions.md` defines the current three changed-scope floors, the reasoned refresh path, and the prohibition on same-change suppression authorization.
- `missions/architecture/staged-code.toml` and `fallow.toml` jointly define public and runtime-loaded reachability. This plan does not add an entry or change either file.
- `missions/architecture/living-memory.md` makes the evidence chain, persisted recovery state, bounded work, and non-destructive handling of curated data load-bearing. The `runPass` refactor must preserve those rules, including write-through `writesCommitted` reporting and recovery from persisted receipts, proposals, retirement records, and source state.
- `missions/architecture/tool-ecosystem.md` and `docs/analysis-capabilities.md` require analysis to remain native through registered tools rather than a parallel shell-only workflow. Direct provider use is diagnostic or fills a surface operation that does not exist; it never replaces a missing or failed capability outcome.
- The generated architecture-map index currently exposes no module shards. That absence is uncertainty, not evidence of clean boundaries; the dedicated `boundary-conformance` capability is also unbound.

Dependency direction for this work stays inward: CLI and provider adapters may depend on focused shared helpers; shared helpers do not import CLI modules; domain-independent `lib/` code does not import bundled or domain-agent code; memory helpers keep persisted state behind the existing dependency interfaces rather than importing CLI or analysis infrastructure.

## Decision Log

- **D-001 - Ratified intent and ranking govern verbatim**
  - Decision: `spec.md` INV-001..005 and the full `Ranking` paragraph are ratified as drafted and govern this plan verbatim. Mechanism yields to them: missing evidence is not clean; observable behavior is preserved; findings are traced before edits; nothing is silenced; and the health record remains reproducible.
  - Alternatives: weaken an invariant for throughput; treat an unavailable capability as empty; permit implementation tasks to reinterpret the ranking.
  - Why: preserves the authoritative Intent and its conflict resolution.
  - Decided by: human, 2026-09-28 (relayed by Shepherd)

- **D-002 - Ratified remediation scope**
  - Decision: “This plan runs now, before `execution-liveness`. Dead code and duplicate exports: fix all. Duplication: extract every family that lives in one or two files; baseline the rest with a reason. Complexity: refactor the `critical` tier only; `high` and `moderate` get a justified baseline with a written justification per file.” The Scope decisions for `scripts/`, `tests/`, static coverage tiers, and preferring removal over configuration also stand exactly as written in `spec.md`.
  - Alternatives: sample findings; baseline difficult critical functions; refactor high/moderate findings opportunistically; add analysis configuration to hide debt.
  - Why: preserves the ratified Scope and AC-002 through AC-006.
  - Decided by: human, 2026-09-28 (relayed by Shepherd)

- **D-003 - Ratified Q-001 through Q-003 rulings**
  - Decision: “Q-001 - Intent INV-001..005 and the ranking: **ratified as drafted**. Q-002 - Risk bound for critical refactors: **(a)**. A critical function that cannot be characterized to a reasonable bound (`runPass`: 886 lines, 104 paths, `partial` coverage) is refactored with the best characterization tests writable plus the full suite, accepting residual risk. Hard stop and escalate if any test expectation would have to change. Rejected: (b) baselining it as an exception to the critical ruling. Q-003 - Duplication ruling consequence: **confirmed**. 41 of the 43 clone families (85 of 87 groups, about 1,730 duplicated lines) live in one or two files and are all extracted; the two three-file families are baselined with reasons.”
  - Alternatives: reopen the ratified questions; baseline `runPass`; refuse the one-/two-file clone extraction scope.
  - Why: carries the closed Open Questions into executable design without reinterpretation.
  - Decided by: human, 2026-09-28 (relayed by Shepherd)

- **D-004 - Committed health-record location and canonical form**
  - Decision: commit the human-readable record at `missions/reviews/project-health-audit.md` and its canonical machine companion at `missions/reviews/project-health-audit.json`. The JSON is schema version 1, UTF-8, LF-terminated, two-space formatted, with fixed top-level fields and deterministically sorted finding identities. The Markdown summarizes the same data and records the companion file’s SHA-256 digest; it is not an independent source of truth.
  - Alternatives: put the record beside transient Shepherd evidence; put it in `.fallow-baselines/`; publish only prose; add a permanent executable solely to generate a one-time record.
  - Why: `missions/reviews/` is tracked, durable, review-oriented, excluded from the shipped package, and does not conflate whole-project evidence with changed-scope floors.
  - Decided by: planner-proposed

- **D-005 - Reproducibility digest contract**
  - Decision: each snapshot records per-file SHA-256 values and one configuration digest over the lexically sorted analysis bundle: `.cosmonauts/config.json`, `.cosmonauts/suppression-exceptions.json`, `.fallow-baselines/manifest.json`, the three referenced baseline files, `bun.lock`, `fallow.toml`, and `package.json`. The bundle digest hashes repeated UTF-8 frames `path`, NUL, file digest, NUL. Each invocation’s result digest hashes its lexically sorted, LF-delimited finding identities with one trailing LF; an empty inventory hashes the empty byte sequence. Dead-code identities are category/path/subject; clone identities are sorted instance coordinates; complexity identities are metric/path/line/column/name/measured-value/threshold; unavailable outcomes use capability/state/reason. Counts and the identity array are stored beside the digest, so later runs can compare without trusting adapter-local IDs.
  - Alternatives: hash raw JSON including elapsed time and unstable adapter-local IDs; store counts only; depend on prose comparison.
  - Why: INV-005 requires same-commit reproduction of identities and counts, while provider payloads contain volatile timing and adapter IDs have no cross-session determinism promise.
  - Decided by: planner-proposed

- **D-006 - Evidence state is closed and explicit**
  - Decision: every inventory row has exactly one disposition: `remediated` with owning task and pre-edit trace reference; `baselined` with file-specific reason; or `unresolved` with the failed/stale evidence and no edit. Capability executions similarly record `completed-pass`, `completed-fail`, `unbound`, `unsupported`, or `failed`; only a completed pass is a pass. The existing duplication `invalid-output` failure and unbound boundary capability remain visible even when diagnostic provider output exists.
  - Alternatives: omit stale findings; count direct provider output as a surface pass; use an “unknown” bucket without a reason.
  - Why: closes every state-space cell under INV-001 and INV-003.
  - Decided by: planner-proposed

- **D-007 - Canonical duplicate exports**
  - Decision: move the shared `partialReason`/progress formatting behavior to a single driver-internal report-format module used by `drive-finalization`, `run-one-task`, and `drive-scheduler-backend`; no dependency from `drive-finalization` back to `run-one-task` is introduced. Keep `registerEditCommand` canonical for plans and rename the task command registration to the domain-qualified `registerTaskEditCommand`, updating its CLI composition and tests.
  - Alternatives: merely remove one `export` while retaining duplicate behavior; import from `run-one-task` and create a cycle; rename both command functions without retaining a canonical export.
  - Why: resolves both concrete pairs under AC-003 while preserving dependency direction and command behavior. Current traces show the finalization copy unused externally, the run-one-task copy imported by the scheduler, and both edit registrations independently used.
  - Decided by: planner-proposed

- **D-008 - Clone extraction follows responsibility, not a global utility bucket**
  - Decision: eliminate each one-/two-file family with the narrowest seam that preserves ownership. Same-file families become private helpers; same-subsystem families may use an internal sibling module; cross-subsystem families share only the smallest pure or infrastructure primitive whose semantics are identical. The two three-file families are not extracted: the judgment/proposal/retirement validation family stays separate because it crosses CLI and distinct persisted-record trust boundaries; the consolidation/knowledge/living-memory read-loop family stays separate because each store owns different TOCTOU, error, and record-validation semantics.
  - Alternatives: one generic utility module for all clones; leave one-/two-file clones when extraction feels awkward; share the two three-file families despite cross-boundary coupling.
  - Why: satisfies Q-003 without replacing duplication with unhealthy dependency direction.
  - Decided by: planner-proposed

- **D-009 - Characterization commits precede critical edits**
  - Decision: in every critical-complexity slice, all listed functions whose Fallow coverage tier is `partial`, `none`, or absent receive behavior-focused characterization first, and that characterization lands in a separate green commit before any listed function is edited. High-tier functions may use existing coverage. Missing tier is treated as below high. Each refactor task records the exact characterization cases it added.
  - Alternatives: characterize after refactoring; treat an absent tier as high; combine tests and refactor in one commit.
  - Why: operationalizes INV-002, Q-002, AC-005, and AC-011.
  - Decided by: planner-proposed

- **D-010 - Final analyzed commit and artifact-only closeout**
  - Decision: first commit the final source and test tree, then refresh all three floors against that exact commit and generate both health-record files from it. The final closeout commit contains only `.fallow-baselines/`, `docs/fallow-exceptions.md`, and the two health-record artifacts. The record names the analyzed source commit and proves that the tip differs from it only by those closeout artifacts. This is the reproducible interpretation of “branch’s final commit”; a commit cannot contain a manifest that names its own content-derived SHA.
  - Alternatives: record a knowingly stale SHA; recursively refresh and recommit forever; weaken manifest provenance; omit the committed record.
  - Why: preserves the ratified operational intent of AC-008 and AC-009 without an impossible self-referential Git hash.
  - Decided by: planner-proposed

## Behaviors

### B-001 - Complete capability evidence stays visible

- Source: AC-001
- Observer: maintainer or Quality Manager reviewing project health
- Entry point: the committed project-health record and machine companion
- Outcome: all seven capability bindings appear with provider identity, version, binding state, and diagnostic reason; all four gate-facing project-scope capabilities have recorded invocations and outcomes. Unbound, unsupported, failed, or invalid output remains visibly non-passing, including boundary conformance with no configured zones.

### B-002 - Dead-code inventory reaches zero without configuration escape hatches

- Source: AC-002
- Observer: maintainer comparing the before and after health snapshots
- Entry point: the committed project-health record
- Outcome: the after snapshot contains zero confirmed findings in every dead-code category. A stale or untraceable starting finding is shown as unresolved rather than fixed, and no new entry point, ignore, threshold, or suppression is used to achieve the result.

### B-003 - Duplicate public names have one owner

- Source: AC-003
- Observer: CLI user and driver consumer using existing plan editing, task editing, and partial-outcome flows
- Entry point: the existing plan/task CLI commands and Drive execution entry points
- Outcome: plan and task editing behave as before, partial outcomes retain the same text, and analysis reports only one canonical owner for each formerly duplicated export name.

### B-004 - Clone debt follows the ratified file-count rule

- Source: AC-004
- Observer: maintainer reviewing duplication evidence
- Entry point: the committed project-health record
- Outcome: every reproduced family confined to one or two files is absent from the after inventory. Each reproduced three-file family remains visible with its exact files and extraction-refusal reason, and the resulting group count, instance count, duplicated lines, and percentage are recorded. If the project surface still fails, that failure remains the capability outcome and diagnostic provider evidence is labeled diagnostic.

### B-005 - Production critical complexity is removed without behavior drift

- Source: AC-005, AC-011
- Observer: users of existing CLI commands, registered tools, public library entries, and persisted memory/runtime artifacts
- Entry point: those existing shipped entry points and recovery paths
- Outcome: success, failure, cancellation, retry, recovery, and persisted-artifact behavior remains unchanged, while every reproduced critical function in `lib/`, `cli/`, `domains/`, and `scripts/` is below all configured thresholds. Below-high functions have prior characterization commits, and no extracted replacement helper inherits a threshold violation.

### B-006 - Deferred complexity is explicit and reviewable

- Source: AC-006
- Observer: future maintainer comparing health debt over time
- Entry point: the machine-readable project-health record
- Outcome: every remaining high or moderate function and every reproduced critical test function has a per-file written justification and a stable identity. No production critical function is moved into this baseline.

### B-007 - Suppression debt does not grow

- Source: AC-007
- Observer: maintainer reviewing the after snapshot and suppression policy result
- Entry point: the committed project-health record
- Outcome: inline suppression count is unchanged or lower, the registered exception set is unchanged or smaller, stale suppressions are zero, and no same-change registry edit authorizes a new directive.

### B-008 - Changed-scope floors describe the post-audit state

- Source: AC-008
- Observer: Quality Manager or later change author
- Entry point: the existing changed-scope analysis capability and baseline manifest
- Outcome: each floor has one category-specific refresh reason tied to the final analyzed source commit, manifest digests match the files, and changed-scope audit from `main` passes against those floors. A failed or unavailable audit is reported and blocks completion rather than being represented as passing.

### B-009 - Health evidence is reproducible and mechanically comparable

- Source: AC-009
- Observer: future coordinator repeating the audit
- Entry point: the exact invocation objects and digest contract in the committed machine record
- Outcome: a second run at the named commit produces the same normalized finding identities, counts, and result digests; a later run can mechanically identify additions, removals, severity changes, baselined debt, and capability-state changes.

### B-010 - Every stage closes without observable regression

- Source: AC-010, AC-011
- Observer: maintainer exercising the existing project after each slice
- Entry point: configured project verification, reachability policy, suppression policy, and the affected shipped entry points
- Outcome: each slice ends green before the next begins. No expected behavior changes unless a test demonstrably pinned the finding being removed; any such proposed expectation change hard-stops for human review rather than landing silently.

## Design

### 1. Evidence and disposition pipeline

The first implementation slice creates the before snapshot from the supplied `64dca3c` evidence and a fresh run at the stage-start commit. It records both commits rather than pretending they are identical. Each discrepancy is a row with `reference`, `fresh`, and `reconciliation`; neither side is silently preferred.

The analysis sequence is fixed:

1. Capture the seven binding rows once for the snapshot.
2. Execute project-scope dead code, duplication, cyclomatic complexity, cognitive complexity, CRAP, and boundary conformance through the project analysis surface.
3. For a dead-code removal, trace the exact symbol and path immediately before edit. For findings without symbol-level trace identity, use the narrowest supported file/dependency trace plus the fresh dead-code finding. A trace failure blocks that edit.
4. For a clone extraction, trace one current instance location from every owned group immediately before edit. A location that no longer matches becomes unresolved.
5. For complexity, run the relevant metric immediately before the characterization/refactor batch. The fresh metric run is the confirmation required by INV-003.
6. Direct provider invocation is permitted only when the surface lacks the operation or for diagnosis of a surface failure. It is stored as executable plus argument array verbatim. Its evidence can guide work, but it cannot turn an unbound/failed surface capability into a pass.

Current planning evidence must be carried into the record and Risks: dead code and all three complexity metrics return findings; duplication currently fails normalization with `invalid-output` because provider exit 0 contradicts 87 normalized findings; boundary conformance is unbound with `provider-not-configured`; `runPass` symbol trace exits at the provider while file trace succeeds and proves its containing file reachable; representative duplicate-export and binary-runner clone traces succeed.

The machine companion uses this closed contract:

```ts
type CapabilityOutcome =
  | { state: "completed-pass" | "completed-fail"; count: number; identityDigest: string }
  | { state: "unbound" | "unsupported" | "failed"; reason: string; identityDigest: string };

type FindingDisposition =
  | { kind: "remediated"; taskId: string; trace: EvidenceRef }
  | { kind: "baselined"; reason: string; files: readonly string[] }
  | { kind: "unresolved"; reason: string; evidence: EvidenceRef };

interface HealthSnapshot {
  commit: string;
  provider: { id: string; name: string; version: string; executableSha256?: string };
  configuration: { files: readonly FileDigest[]; digest: string };
  bindings: readonly CapabilityBindingRecord[];
  invocations: readonly InvocationRecord[];
  findings: readonly FindingRecord[];
  suppressions: { inline: number; registered: number; stale: number };
}

interface ProjectHealthRecordV1 {
  schemaVersion: 1;
  generatedFor: "project-health-audit";
  identityAlgorithm: string;
  before: HealthSnapshot;
  after: HealthSnapshot;
  closeout: { analyzedCommit: string; artifactPaths: readonly string[] };
}
```

`EvidenceRef`, `InvocationRecord`, and `FindingRecord` contain only project-relative paths, exact tool name plus JSON arguments or direct executable plus argument array, provider outcome, normalized identity, counts, and SHA-256 digests. No absolute consent path, secret, environment value, or transient session path is committed.

### 2. Dead code and duplicate exports

The dead-code slice owns the complete supplied inventory and any fresh additions. Its concrete value-export findings are:

- `renderHarnessReport`, `discoverAllRuntimeSkills`, `summarizeDriverEvent`, `FALLOW_MAX_CONCURRENT_ANALYSES`, `detectFallowSignal`, and `DEFAULT_FORCE_KILL_WAIT_MS`.
- `CLAUDE_ARGS_ENV`, `CLAUDE_SKIP_PERMISSIONS_ENV`, `CODEX_ARGS_ENV`, `CODEX_EXEC_ARGS_ENV`, `CODEX_YOLO_ENV`, and `isEnabledEnv`.
- `DRIVE_TASK_STATUS_PARTIAL_ARTIFACT_KIND`, `recordCommitFinalizationFailure`, `recordTaskStatusFinalizationFailure`, `partialReason`, `DRIVE_FINALIZER_RETRY_POLICY`, `buildDriveTerminalEpisode`, `createInlineRunState`, `DRIVE_SHELL_COMMAND_CAPABILITIES`, and `skipStateCommit`.
- `COSMONAUTS_GENERATED_INVENTORY_PATH`, `EMPTY_HARNESS_MANIFEST`, `resolveHarnessSyncMode`, `DEFAULT_REAP_TERM_GRACE_MS`, `DEFAULT_REAP_KILL_GRACE_MS`, and `EntityFileLockTimeoutError`.

The 103 type findings are owned by exact file cluster and count: five CLI types; three domain-extension types; twenty driver types; forty harness-adapter types plus one harness-runtime-inventory type; two episode-lock types; six orchestration types; one plan-manager type; two process-group types; one skills-discovery type; two task-manager types; six knowledge-backfill script types; and fourteen harness-validation script types. The concrete file inventory is the corresponding `unused_types` array in the supplied `dead.json`; the task must copy every identity into the machine record before editing so no cluster can be skipped.

The slice also owns `TaskManager.getTaskDependencyStatusSnapshot`, plus duplicate-export pairs `partialReason` and `registerEditCommand`. Trace decides remove-export versus delete: an internally used value loses only `export`; an unused declaration is deleted only when trace and behavior coverage show no internal or shipped use. Public reachability is never “fixed” by adding an entry.

`partialReason` becomes a single driver-internal formatting contract with the same `ParsedReport -> string` behavior. `registerEditCommand` remains the plan-command name; task registration becomes `registerTaskEditCommand`. No CLI syntax, alias, output, or error behavior changes.

### 3. Duplication ownership and seams

All 43 supplied families are inventory rows. The two ratified baseline families are:

- `cli/memory/judgment-provider.ts`, `lib/memory/consolidation-proposals.ts`, and `lib/memory/retirement-receipts.ts`: validation helpers remain local because the CLI model-output boundary and the two persisted-record readers have distinct contracts and error ownership.
- `lib/memory/consolidation-sources.ts`, `lib/memory/knowledge-store.ts`, and `lib/memory/living-memory.ts`: bounded file-read loops remain local because each subsystem owns different no-follow, consistency, error, and record-validation semantics.

The remaining 41 families are split into three sequential ownership slices.

**Core runtime, CLI, domains, and driver:**

- model-session setup in `cli/architecture/narrative-provider.ts` (`createNarrativeSession`) and `cli/memory/judgment-provider.ts` (`createJudgmentSession`), using Pi’s existing `ModelRuntime`, `ModelRegistry`, `DefaultResourceLoader`, `createAgentSession`, and in-memory session manager through one narrow CLI-infrastructure helper rather than reusing the orchestration session factory, whose agent-definition responsibility is broader;
- plan archive/view command setup and errors, the repeated not-found branch within plan view, plan/task extension warning setup, and process-runner stream teardown;
- `runClaudeBinary`/`runCodexBinary`, their signal cleanup, materialization/spawn lifecycle, child I/O types, and diagnostics, while variant-specific argument parsing and invocation creation stay in their existing modules;
- same-file skill discovery and architecture-map retrieval helpers;
- driver `partialReason`/`progressText`, scheduler/run-one-task command execution and run-expectation assembly, scheduler internal blocks, finalizer task-id handling, event-stream/watch compatibility parsing, lock primitives in `lib/driver/lock.ts` and `lib/entity-file-lock.ts`, run-state/atomic-file writes, durable scheduler heartbeat selection, and scheduler finalization blocks.

**Extensions, harness, and validation:**

- agent-memory/architecture-memory rendering and byte helpers; agent-memory/knowledge-tool limit normalization;
- harness render same-file writes, render/sync path checks, sync transaction same-file blocks, and sync/validation-script durable file operations;
- same-file harness-export validation command probes.

**Memory, skills, and tasks:**

- judgment-provider/living-memory byte formatting, and judgment-provider/retirement-receipt exact-object helpers that do not belong to the three-file baseline group;
- consolidation proposal/receipt reads, proposal/retirement validation, consolidation-source same-file validation, consolidation-source/knowledge-store reads, durable-files with knowledge and retirement stores, episode-transition lock/episode locking, knowledge-record/OKF parsing, knowledge/markdown-store reads, living-memory same-file paths, markdown-store same-file paths, proposal-files/retirement-store operations, and retirement receipt/store parsing;
- same-file catalogue work in the skills exporter and dependency/status work in the task manager.

Each slice starts from fresh clone traces and ends with a fresh project-scope duplication attempt plus the stage’s recorded diagnostic if the surface still rejects provider output. Shared modules expose only the minimum contract needed by their owning family. In particular, binary-runner sharing accepts injected runtime/process collaborators and returns the existing exit behavior; lock sharing cannot erase race, timeout, stale-owner, release-confirmation, or warning differences.

### 4. Complexity refactoring and characterization

Every critical slice follows the same loop:

1. Reconfirm owned functions with all relevant complexity metrics.
2. Commit characterization for every below-high or missing-tier function before editing any owned critical function.
3. Refactor by extracting cohesive pure decisions, parsers, or phase functions while retaining the existing entry point as composition root.
4. Re-run characterization and the existing suite, then re-run all three metrics. An extracted helper above a configured threshold is a failed slice, not a successful move.
5. Record exact before/after identities, metrics, characterization cases, and task ownership.

`runPass` is isolated in its own slice. Characterization must cover, to the best reachable bound: dry-run without mutation or lock acquisition; persisted recovery success and failure; incomplete source inventory; accepted-receipt replay; deterministic-only no-op and proposal/retirement paths; unusable pressure and bounded deferrals; full-model success, invalid/missing judgment provider, and abort; proposal/observation/retirement caps; episode finalization and receipt materialization; a committed write followed by later failure; lock timeout; and unconfirmed release. The refactor separates recovery/preflight, collection/inventory/pressure, deterministic execution, model judgment/materialization, and final result assembly. One state owner retains write-through `details`, `writesCommitted`, and `episodePrunes`. Correctness decisions continue to rehydrate from receipt, proposal, retirement, and source stores; an empty in-memory map or accumulator never fabricates recovery state after restart.

The remaining production critical ownership is exact:

- **Memory:** `readRetirementReceiptInventory` and `collectConsolidationSources` already have high static coverage. Characterize first for `recoverAcceptedEpisodeFinalization`, `applyUnderLock`, `retrieveKnowledge`, `readProposalMaterializations`, `isEpisodePruneJournal`, and `candidateConflict`.
- **Harness and validation scripts:** characterize first for `isManifestEntry`, `validateCommandEvidenceIdentity`, `syncHarnessAssetCore`, `prepareClaudeCommandPair`, and `recoverOwnerRootJournal`. `runRepositoryExportValidation` and `runPersonalBundleValidation` have high static coverage.
- **Runtime, CLI, domains, and extensions:** `runDurableGraphScheduler` has high static coverage. Characterize first for `summarizeEvent`, `isStepRecordLike`, `validateChainAgentEvidence`, `adaptStoredEvent`, `runDrive`, `parseTaskBatchRow`, `describeDriverEvent`, `introspectProvider`, and `parseRememberParams`.
- **Skills and reachability script:** characterize first for `runHarnessSync` because its supplied tier is absent, for partial-tier `groupCatalogue` and `enhancedRows`, and for no-coverage `visit`.

Characterization asserts observable variants and durable outputs, not helper calls. Parsers and validators use explicit result variants or type guards; schedulers and stateful flows retain a single state owner; presentation functions may use exhaustive data-driven dispatch where that is simpler than nested branching. Public signatures change only when a private extraction makes them unnecessary and fresh reachability confirms that no shipped consumer exists.

### 5. Justified baseline and floor refresh

After every production critical function is below threshold, inventory the remaining complexity findings. The baseline task owns all reproduced high and moderate rows from the fresh output and the critical test rows supplied at:

- the anonymous suite callback in `tests/harness-adapters/sync.test.ts` at the recorded location;
- `auditMigratedSeed` in `tests/memory/interface.test.ts`;
- the anonymous suite callback in `tests/orchestration/chain-runner.test.ts` at the recorded location;
- the anonymous suite callback in `tests/memory/markdown-store.test.ts` at the recorded location.

The supplied prose says “all five” test findings while its raw evidence contains these four and the summary count is 34 total. The record must reconcile that discrepancy against the fresh run; it neither fabricates a fifth finding nor drops a reproduced one. Every high/moderate row receives a file-specific justification based on its actual role, coverage evidence, and why the ratified tier rule defers it. Boilerplate such as “out of scope” without a file-specific reason is insufficient.

The final source commit is then frozen. The reasoned baseline-refresh entry point is invoked separately for `dead-code`, `dupes`, and `health`, each with its own literal reason and that commit as base. The dead-code reason states zero confirmed findings; the duplication reason names the two retained three-file families; the health reason points to the per-file high/moderate/test-critical disposition inventory. The refresh path, not manual editing or direct provider fix application, writes the three floors and appends manifest provenance.

The after snapshot repeats the same analysis-surface invocations and digest procedure as before. A second same-commit run must match before closeout. The changed-scope audit is then evaluated from `main` against the refreshed floors. Any earlier-category regression discovered during duplication, complexity, or closeout returns to the owning slice; it is not absorbed into a later baseline.

## Files to Change

- `missions/reviews/project-health-audit.md` (new) — human-readable before/after record.
- `missions/reviews/project-health-audit.json` (new) — canonical machine-readable record and dispositions.
- `docs/fallow-exceptions.md` — replace obsolete floor counts/provenance with the post-audit state and link the whole-project record.
- `.fallow-baselines/dead-code.json` — refreshed post-remediation floor.
- `.fallow-baselines/dupes.json` — refreshed floor containing only justified retained clone families.
- `.fallow-baselines/health.json` — refreshed floor containing justified high/moderate and test-critical findings.
- `.fallow-baselines/manifest.json` — category-specific refresh provenance and digests.
- `cli/chain-execution.ts`, `cli/main.ts`, `cli/pi-flags.ts`, `cli/runtime-bootstrap.ts`, `cli/tasks/commands/create.ts` — confirmed unused type exports and critical CLI parsing where applicable.
- `cli/harness/subcommand.ts`, `cli/skills/subcommand.ts` — confirmed unused value exports.
- `cli/plans/commands/edit.ts`, `cli/tasks/commands/edit.ts`, `cli/plans/index.ts`, `cli/tasks/subcommand.ts` — canonical/domain-qualified edit registrations.
- `cli/architecture/narrative-provider.ts`, `cli/memory/judgment-provider.ts` — shared isolated Pi session setup and owned clone families.
- `cli/drive/subcommand.ts` — `runDrive` characterization and refactor.
- `domains/shared/extensions/orchestration/watch-events-tool.ts` — dead export plus `describeDriverEvent` refactor.
- `domains/shared/extensions/plans/index.ts`, `domains/shared/extensions/tasks/index.ts` — shared episode-warning setup.
- `domains/shared/extensions/project-tools/analysis-consent.ts`, `domains/shared/extensions/project-tools/process-runner.ts` — dead types/values and process clone extraction.
- `domains/shared/extensions/project-tools/fallow-provider.ts` — dead exports and `introspectProvider` refactor without changing the provider-neutral contract.
- `lib/agent-packages/claude-binary-runner.ts`, `lib/agent-packages/codex-binary-runner.ts`, `lib/agent-packages/skills.ts` — runner and same-file clone extraction.
- `lib/architecture-map/retrieval.ts` — same-file clone extraction.
- `lib/driver/backends/claude-cli.ts`, `lib/driver/backends/codex.ts`, `lib/driver/backends/env-args.ts`, `lib/driver/backends/cli-process.ts` — confirmed dead exports/types.
- `lib/driver/drive-finalization.ts`, `lib/driver/run-one-task.ts`, `lib/driver/drive-scheduler-backend.ts`, `lib/driver/shell-command-finalizer.ts` — canonical partial formatting, dead types/values, and clone extraction.
- `lib/driver/drive-graph-compiler.ts`, `lib/driver/drive-graph-runner.ts`, `lib/driver/driver.ts`, `lib/driver/run-state.ts`, `lib/driver/state-commit.ts` — confirmed dead exports/types and owned clones.
- `lib/driver/event-stream.ts`, `lib/driver/watch-events-compat.ts`, `lib/driver/lock.ts`, `lib/entity-file-lock.ts`, `lib/fs/atomic-file.ts` — event, lock, and atomic-write clone families.
- `lib/durable-runtime/scheduler.ts`, `lib/durable-runtime/scheduler-state.ts`, `lib/durable-runtime/controller.ts` — scheduler clones and critical refactors.
- `lib/extensions/agent-memory/index.ts`, `lib/extensions/architecture-memory/index.ts`, `lib/extensions/knowledge-surface/knowledge-tools.ts` — extension clones and critical parsing.
- `lib/harness-adapters/inventory.ts`, `lib/harness-adapters/provenance.ts`, `lib/harness-adapters/registry.ts`, `lib/harness-adapters/sync.ts`, `lib/harness-adapters/target-registry.ts`, `lib/harness-adapters/types.ts`, `lib/harness-adapters/render.ts`, `lib/harness-runtime-inventory.ts` — dead type/value exports, clone families, and critical refactors.
- `lib/memory/consolidation-proposals.ts`, `lib/memory/consolidation-receipts.ts`, `lib/memory/consolidation-sources.ts`, `lib/memory/durable-files.ts`, `lib/memory/episode-transition-lock.ts`, `lib/memory/episode.ts`, `lib/memory/knowledge-records.ts`, `lib/memory/knowledge-store.ts`, `lib/memory/living-memory.ts`, `lib/memory/markdown-store.ts`, `lib/memory/okf.ts`, `lib/memory/proposal-files.ts`, `lib/memory/retirement-receipts.ts`, `lib/memory/retirement-store.ts` — owned clone families and critical memory refactors.
- `lib/orchestration/chain-episodes.ts`, `lib/orchestration/chain-event-adapter.ts`, `lib/orchestration/stage-prompts.ts` — dead types and critical event validation/adaptation.
- `lib/plans/plan-manager.ts`, `lib/process/process-group.ts`, `lib/skills/discovery.ts`, `lib/tasks/lock.ts`, `lib/tasks/task-manager.ts` — confirmed dead exports/types and owned local clones.
- `lib/skills/exporter.ts` — owned clone family and three critical functions.
- `scripts/check-reachability.ts`, `scripts/knowledge-surface-backfill.ts`, `scripts/validate-harness-exports.ts` — dead types, script clones, and critical gate refactors.
- Focused shared helper modules under the already-owned `cli/`, `lib/agent-packages/`, `lib/driver/`, or `lib/fs/` directories may be added only where Design §3 prescribes a cross-file seam; they remain internal and are not added to public entry configuration.

Test files are intentionally not prescribed here; each implementation task chooses mirrored existing suites or focused new suites after inspecting current coverage. Every critical task must record the exact characterization files and cases before its refactor commit.

Explicitly unchanged: `fallow.toml`, `missions/architecture/staged-code.toml`, `.cosmonauts/config.json`, and `.cosmonauts/suppression-exceptions.json`, except that the suppression registry may become smaller only if a stale existing directive is removed with its finding.

## Risks

- **R-001 - Duplication capability currently fails normalization.** Evidence: project-scope duplication returns `invalid-output` despite provider exit 0 and 87 normalized findings. Mitigation: retain failed state, use exact-location surface traces before edits, allow one verbatim direct-provider diagnostic inventory, and never call the capability passing. Pivot: if exact-location trace also fails for a reproduced family, mark it unresolved and stop that extraction for review.
- **R-002 - Boundary conformance has no configured provider coverage.** Evidence: `provider-not-configured`; architecture-map shards are also unavailable. Mitigation: record both absences, preserve known dependency direction through review and existing reachability/type checks, and do not author zones in this plan. Completion cannot describe boundaries as passing.
- **R-003 - Supplied evidence can drift before implementation.** Line numbers and clone grouping may change. Mitigation: key by normalized identities, rerun and trace immediately, and classify stale rows unresolved. Pivot: fresh findings outside a slice are added to the owning inventory before work proceeds, not silently ignored.
- **R-004 - `runPass` and stateful critical paths can preserve types while changing recovery behavior.** Mitigation: characterization first, one state owner, write-through committed-state reporting, persisted-state rehydration, and explicit recovery/cancellation cases. Pivot: any required expectation change hard-stops under Q-002.
- **R-005 - Static coverage is estimated and sometimes absent.** Mitigation: static tier remains the trigger; absent means below high; runtime coverage may inform case selection but cannot waive characterization. No “high” claim is inferred from missing data.
- **R-006 - Mandatory clone extraction can create worse coupling.** Mitigation: local helper first, narrow shared primitive second, no global utility bucket, and two ratified three-file refusals. Pivot: if a one-/two-file family cannot be removed without violating an invariant or dependency direction, stop for human scope review rather than baseline it contrary to Q-003.
- **R-007 - Refactors can move rather than remove complexity.** Mitigation: evaluate newly extracted helpers with the same thresholds and reject a slice that merely transfers a violation.
- **R-008 - Later slices can recreate earlier findings.** Mitigation: relevant capability rechecks at every stage and complete after snapshot. Any regression routes back to its owning stage before baseline refresh.
- **R-009 - Baseline/record commit cannot cryptographically name itself.** Mitigation: D-010’s final analyzed source commit plus artifact-only closeout and an explicit path diff. If a closeout change touches analyzed source or analysis configuration beyond the three baselines, discard closeout and regenerate from a new source commit.
- **R-010 - The spec prose and raw critical-test count disagree.** Mitigation: preserve the human ruling, record the supplied four concrete test findings, reconcile against the fresh inventory, and do not invent evidence. A fresh fifth finding is included automatically.
- **R-011 - Direct provider use could become a shadow gate.** Mitigation: every direct invocation is labeled diagnostic or surface-missing, recorded verbatim, and kept separate from capability outcome. Unsupported/unbound/failed surface evidence stays non-passing.
- **R-012 - Work breadth exceeds a safe parallel-change surface.** Mitigation: eleven dependency-ordered slices, no parallel edits to shared files, characterization commits before refactors, and a green close at every slice. Unexpected complexity changes the slice boundary on record; it does not merge stages or skip ordering.

## Implementation Order

1. **Dead code, duplicate exports, and before snapshot — B-001, B-002, B-003, B-007, B-009, B-010.** Freeze the stage-start commit; populate the before record from Shepherd evidence plus fresh surface evidence; copy all 133 supplied identities into dispositions; trace and remediate all reproduced unused values, types, the class member, and both duplicate-export pairs. Introduce the canonical partial-format seam and domain-qualified task edit registration. End with zero fresh dead-code findings, visible capability failures, and all configured project, reachability, and suppression checks green.

2. **Duplication: core runtime, CLI, domains, and driver — B-004, B-010.** Own the concrete families listed in Design §3’s first group, including isolated Pi session creation, binary runners, driver scheduling/finalization, lock primitives, event compatibility, and durable scheduler internals. Trace every group before edit and preserve variant-specific behavior. End with owned one-/two-file families absent and all stage checks green.

3. **Duplication: extensions, harness, and validation — B-004, B-010.** Own the extension rendering/limit, harness render/sync, sync/validation-script, and validation-script same-file families. Keep transaction and filesystem consistency semantics at their existing owners. End with owned families absent and all stage checks green.

4. **Duplication: memory, skills, tasks, and three-file dispositions — B-004, B-010.** Own every remaining one-/two-file family listed in Design §3 and write the exact reasons for both three-file baselines. Reconcile the expected 41/2 family split against fresh evidence. End with no reproduced one-/two-file family and all stage checks green; a still-failed duplication capability remains recorded as failed rather than green.

5. **Characterize, then refactor `runPass` — B-005, B-010.** First land a green characterization commit covering the outcomes in Design §4 without editing `runPass`; then decompose its phases while preserving single-owner details and persisted recovery. Record the characterization cases in the task. End with `runPass` and every new helper below all thresholds and all stage checks green.

6. **Characterize, then refactor remaining critical memory functions — B-005, B-010.** Before edits, land characterization for `recoverAcceptedEpisodeFinalization`, `applyUnderLock`, `retrieveKnowledge`, `readProposalMaterializations`, `isEpisodePruneJournal`, and `candidateConflict`; rely on existing high coverage for `readRetirementReceiptInventory` and `collectConsolidationSources`. Then refactor the eight owned functions. End with owned functions/helpers below thresholds and all stage checks green.

7. **Characterize, then refactor critical harness and validation functions — B-005, B-010.** Before edits, land characterization for `isManifestEntry`, `validateCommandEvidenceIdentity`, `syncHarnessAssetCore`, `prepareClaudeCommandPair`, and `recoverOwnerRootJournal`; use existing high coverage for `runRepositoryExportValidation` and `runPersonalBundleValidation`. Then refactor all seven. End with owned functions/helpers below thresholds and all stage checks green.

8. **Characterize, then refactor critical runtime, CLI, domain, and extension functions — B-005, B-010.** Before edits, land characterization for `summarizeEvent`, `isStepRecordLike`, `validateChainAgentEvidence`, `adaptStoredEvent`, `runDrive`, `parseTaskBatchRow`, `describeDriverEvent`, `introspectProvider`, and `parseRememberParams`; use existing high coverage for `runDurableGraphScheduler`. Then refactor all ten. End with owned functions/helpers below thresholds and all stage checks green.

9. **Characterize, then refactor critical skills and reachability functions — B-005, B-010.** Before edits, land characterization for missing-tier `runHarnessSync`, partial-tier `groupCatalogue` and `enhancedRows`, and no-coverage `visit`. Then refactor all four. End with owned functions/helpers below thresholds and all stage checks green.

10. **Write justified high/moderate and test-critical dispositions — B-006, B-007, B-010.** Re-run all complexity metrics; prove no production critical remains; create a per-file reason for every high/moderate row and every reproduced critical test row; reconcile the supplied test-count inconsistency. Recheck dead code and duplication so later work has not recreated earlier debt. End with complete dispositions and all stage checks green.

11. **Freeze, refresh, reproduce, and close out — B-001, B-007, B-008, B-009, B-010.** Commit the final source/test state; separately refresh the dead-code, duplication, and health floors against that commit with one category-specific reason each; complete the before/after JSON and Markdown records; repeat the recorded invocations to prove identity/count digests; evaluate changed-scope audit from `main`; update the exceptions documentation; and commit only closeout artifacts. If any capability, digest, floor, suppression, reachability, or configured project check is not in its required state, return to the owning stage rather than publishing a clean verdict.

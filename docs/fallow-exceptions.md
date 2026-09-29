# Fallow Exceptions

This repository is Fallow-compliant with a small set of intentional exceptions.
The desired steady state is fewer exceptions over time: framework/public API
configuration should remain, while temporary migration debt should be removed by
refactoring the underlying code.

## Current Gate

Cosmonauts exposes the change-regression gate through the provider-neutral
`changed-scope-audit` capability. The `analysis_audit` tool requires an
explicit base, runs only after per-project execution consent, and preserves the
provider's complete structured result. A failed or unavailable binding is
reported explicitly; it is never converted to a pass.

For direct provider diagnosis, the equivalent change-scoped operation is:

```bash
fallow audit --base <base-sha> \
  --dead-code-baseline .fallow-baselines/dead-code.json \
  --health-baseline .fallow-baselines/health.json \
  --dupes-baseline .fallow-baselines/dupes.json \
  --format json --quiet --no-cache --fail-on-issues
```

`fallow audit` is not a full-project cleanliness check. Current policy has two
scopes:

- Change regression blocks a `fail` verdict or a provider runtime failure from
  the explicit base. Unbound capability state remains visible and requires
  reviewer judgment.
- Full-project debt remains a separate paydown effort. The committed
  `dead-code.json`, `health.json`, and `dupes.json` files are all active
  changed-scope floors. The duplication baseline exists even though the
  2026-09-10 full-project duplication scan was below its failure threshold.

The current floors were refreshed separately against analyzed source commit
`ea27538ef242155767d64804111997e0e037ad1d` after the project-health
paydown. They contain one unused class member (the evidence-backed Q-005 false
positive), three clone groups in two retained three-file families, and 229
health finding counts across 84 paths. `.fallow-baselines/manifest.json`
records one closeout refresh reason and digest per category at that commit:
`dead-code` `5d658e49031aa2a92e39965f98acce151f1ee6bb59644018d78429b34f74185a`,
`dupes` `d2e6cf3423c71b2d303a67962b4040ef709a23c4eb4b0ba6dee35601529e002a`,
and `health` `271787e1a1d9f0f3efb476d0249e8ae2879525a202f6a300e3cbe892450d7651`.
The earlier N-001 re-anchoring at `29fc0ce` remains historical provenance,
not the current floor. See [the whole-project health record](../missions/reviews/project-health-audit.md)
for the analyzed inventory, unresolved binding, dispositions, and sign-off packet.
Review never refreshes these files.
To refresh selected floors after deliberate debt work, run
`bun run refresh:fallow-baselines -- --base <revision> --reason '<reason>' --category dead-code`
(repeat `--category` for `health` or `dupes`). The script analyzes the resolved
base in a private temporary checkout, writes the selected floors into the
working repository, and appends the base, resolved commit, reason, timestamp,
and new digest to provenance. Ahead or dirty working-tree findings cannot enter
the refreshed floors. A missing or unreadable file fails the audit; it does
not cause an unbaselined scan.

New inline suppressions require a human-listed exception in the **base**
revision of `.cosmonauts/suppression-exceptions.json`. Run
`bun run check:suppressions -- --base <revision>` to compare current source
directives with that base-owned registry. Editing the registry in the same
change cannot authorize a new directive. The registry tracks intentional
Fallow, Biome, and TypeScript directives by directive and target fingerprint.

## Configuration Exceptions

### Public API entry points

Declared in `missions/architecture/staged-code.toml` under `public` and
configured in `fallow.toml` under `entry`. The reachability command checks that
`entry` contains exactly these public paths plus the owner-backed `staged` paths.

Reason: public API.

Cosmonauts publishes TypeScript source and supports consumers and tests
deep-importing stable module entry points such as `lib/agents/index.ts`,
`lib/analysis/index.ts`, `lib/domains/index.ts`, `lib/runtime.ts`, and selected
orchestration modules. `lib/analysis/index.ts` is the provider-neutral public
boundary for capability vocabulary, bindings, requests, results, failures, and
pure resolution. Those exports may be externally consumed even when no
in-repository import exists.

What is needed to remove this exception:

- Publish a single explicit package export surface and stop supporting deep
imports for these modules, or move public API declarations into files that
Fallow already recognizes as package entry points.

This is not temporary unless the package API strategy changes.

### Runtime-loaded domain and extension files

Configured in `fallow.toml` under `dynamicallyLoaded`.

Reason: framework convention.

Cosmonauts and Pi load these files by convention through runtime discovery and
dynamic import:

- `bundled/*/agents/*.ts`
- `bundled/*/domain.ts`
- `bundled/*/workflows.ts`
- `domains/shared/domain.ts`
- `domains/shared/extensions/*/index.ts`
- `domains/shared/workflows.ts`

What is needed to remove this exception:

- Replace convention-based discovery with static imports or a generated manifest
that Fallow can follow as a normal import graph.

This is not temporary while the domain/plugin architecture remains dynamic.

## Framework Health Stage 3 Deletions

- `lib/orchestration/spawn-compiler.ts`: no shipped module imported the graph
  compiler. Its only importer was `tests/orchestration/spawn-compiler.test.ts`,
  which was deleted with it.
- `lib/driver/run-run-loop.ts`: the shipped graph runner imported only its
  `RunRunLoopCtx` type, while `runRunLoop` was exercised only by
  `tests/driver/run-run-loop.test.ts`. The graph runner now uses the equivalent
  `RunOneTaskCtx` type directly; the unused loop and its test were deleted.
- `lib/harness-adapters/index.ts`: no shipped module imported this barrel.
  Shipped callers import the adapter modules directly, so the barrel was deleted.

### Baselined complexity (project-health-audit)

Fallow 2.54.2 project-scope complexity census at the TASK-782 tip: 168
high/moderate production rows and four reproduced critical test rows. Identity
below is `exceeded/path/line/column/name` (Fallow's zero-based column); it is
not a suppression or a new threshold. `partial`, `high`, and `none` are Fallow
coverage tiers; `unreported` means Fallow supplied no CRAP/coverage estimate.
Each file's reason applies to every identity listed beneath it. Refactoring
requires characterization of the named boundary and its failure branches before
removing this retained debt. No production-critical finding is included.

#### `cli/drive/subcommand.ts`
Drive launch/resume CLI validates persisted episode identity and constructs run
specs; partial coverage leaves resume and invalid-run branches to characterize.
- `crap/cli/drive/subcommand.ts/569/0/prepareResume`
- `crap/cli/drive/subcommand.ts/1180/0/createRunSpec`
- `crap/cli/drive/subcommand.ts/522/0/prepareTerminalResumeEpisodeIdentity`

#### `cli/harness/subcommand.ts`
Harness command dispatch and sync-request parsing preserve CLI error behavior;
partial coverage on the callback and unreported coverage on the parser require
invalid-option and conflict cases before simplification.
- `both/cli/harness/subcommand.ts/181/7/parseSyncRequest`
- `crap/cli/harness/subcommand.ts/101/13/<arrow>`

#### `cli/main.ts`
Top-level option normalization routes CLI flags; partial coverage calls for
conflicting and missing option cases before consolidating dispatch.
- `crap/cli/main.ts/220/0/normalizeCliOptions`

#### `cli/memory/judgment-provider.ts`
Model judgment output is extracted, parsed, and shape-checked at an untrusted
boundary; partial coverage calls for malformed-response and rejection cases.
- `crap/cli/memory/judgment-provider.ts/184/0/parseCorpusJudgmentOutput`
- `crap/cli/memory/judgment-provider.ts/246/0/isJudgedProposal`
- `cognitive_crap/cli/memory/judgment-provider.ts/151/0/extractLatestAssistantText`
- `crap/cli/memory/judgment-provider.ts/69/13/judge`

#### `cli/run/subcommand.ts`
Chain CLI execution translates user input into a run; partial coverage defers
restructuring until invalid expressions and failed launches are characterized.
- `crap/cli/run/subcommand.ts/217/0/runChainCommand`

#### `cli/session.ts`
Session resource-loader options compose multiple configuration sources; partial
coverage needs precedence and absent-resource assertions before refactoring.
- `crap/cli/session.ts/90/0/toResourceLoaderOptions`

#### `cli/sessions/subcommand.ts`
Session-list CLI renders persisted metadata and filters; partial coverage needs
missing/corrupt session and filtering cases before simplification.
- `crap/cli/sessions/subcommand.ts/349/0/listAction`

#### `cli/skills/subcommand.ts`
Skill-command callback selects and formats export actions; partial coverage
calls for invalid targets and empty skill selection cases before splitting it.
- `crap/cli/skills/subcommand.ts/212/10/<arrow>`

#### `cli/tasks/commands/create.ts`
Batch task creation detects per-task flags; partial coverage leaves conflicting
batch/single options to characterize before simplifying the predicate.
- `crap/cli/tasks/commands/create.ts/196/0/hasPerTaskOptions`

#### `cli/update/subcommand.ts`
Update CLI coordinates one requested target and its failures; partial coverage
needs missing target and failed update branches before decomposition.
- `crap/cli/update/subcommand.ts/64/0/updateOne`

#### `domains/shared/extensions/orchestration/spawn-tool.ts`
Spawn authorization and resolution enforce tool-level caller identity; partial
coverage requires denied and unresolved-request cases before consolidation.
- `crap/domains/shared/extensions/orchestration/spawn-tool.ts/634/30/checkAuthorization`
- `crap/domains/shared/extensions/orchestration/spawn-tool.ts/524/20/resolved`

#### `domains/shared/extensions/plans/index.ts`
Plans tool execution dispatches user actions across the extension boundary;
partial coverage needs invalid action and backend-failure cases before splitting.
- `crap/domains/shared/extensions/plans/index.ts/195/11/execute`

#### `domains/shared/extensions/project-tools/fallow-provider.ts`
Provider adapter validates envelopes, failure signals, capability arguments,
and audit findings before exposing them to tools; partial coverage requires
malformed provider output and contradictory verdict cases before refactoring.
- `cognitive_crap/domains/shared/extensions/project-tools/fallow-provider.ts/2418/0/auditFindings`
- `crap/domains/shared/extensions/project-tools/fallow-provider.ts/2144/0/capabilityArgs`
- `cognitive_crap/domains/shared/extensions/project-tools/fallow-provider.ts/830/0/processFailure`
- `crap/domains/shared/extensions/project-tools/fallow-provider.ts/438/0/detectFallowSignal`
- `crap/domains/shared/extensions/project-tools/fallow-provider.ts/2317/0/reconcileVerdictEvidence`
- `crap/domains/shared/extensions/project-tools/fallow-provider.ts/711/0/validateSpawnPreconditions`
- `crap/domains/shared/extensions/project-tools/fallow-provider.ts/1728/0/validateFallowEnvelopeSchema`
- `crap/domains/shared/extensions/project-tools/fallow-provider.ts/1874/0/findingLocations`

#### `domains/shared/extensions/project-tools/index.ts`
Project-tools discovery and trace routing bridge provider capabilities to Pi;
partial coverage needs unbound-provider and invalid-target assertions.
- `crap/domains/shared/extensions/project-tools/index.ts/261/0/traceTarget`
- `crap/domains/shared/extensions/project-tools/index.ts/535/27/discoverSnapshot`

#### `domains/shared/extensions/tasks/index.ts`
Tasks tool dispatch handles task mutation and result presentation; partial
coverage requires invalid edits and missing tasks before restructuring.
- `crap/domains/shared/extensions/tasks/index.ts/254/11/execute`

#### `lib/agent-packages/codex-cli.ts`
Codex argument sanitization rejects unsafe or unsupported CLI switches;
partial coverage needs hostile and mixed flag permutations first.
- `cognitive_crap/lib/agent-packages/codex-cli.ts/122/0/sanitizeCodexArgs`

#### `lib/agent-packages/definition.ts`
Package definition validation guards the external export contract; partial
coverage needs missing-field and invalid-shape cases before simplifying.
- `crap/lib/agent-packages/definition.ts/55/0/validateAgentPackageDefinition`

#### `lib/analysis/binding-resolver.ts`
Capability binding resolves scope, provider, and consent rules; coverage is
unreported, so unmatched scopes and unavailable providers need characterization.
- `cognitive/lib/analysis/binding-resolver.ts/150/7/resolveAnalysisRequest`

#### `lib/architecture-map/config.ts`
Architecture-map config combines project paths and options; partial coverage
calls for invalid/missing configuration before changing its branch structure.
- `crap/lib/architecture-map/config.ts/143/0/buildArchitectureMapConfig`

#### `lib/architecture-map/freshness.ts`
Freshness scanning enumerates source files across configured roots; partial
coverage requires exclusions and absent-root cases before simplification.
- `crap/lib/architecture-map/freshness.ts/242/0/collectSourceFiles`

#### `lib/architecture-map/generator.ts`
Map generation resolves module narratives and renders stable records; partial
coverage needs fallback narratives and deterministic ordering assertions.
- `crap/lib/architecture-map/generator.ts/161/0/resolveModuleNarrative`
- `crap/lib/architecture-map/generator.ts/324/0/renderStableRecord`

#### `lib/architecture-map/retrieval.ts`
Map retrieval selects bounded module resources; partial coverage needs missing
resources and duplicate-module cases before restructuring.
- `crap/lib/architecture-map/retrieval.ts/342/0/collectModuleResources`

#### `lib/architecture-map/store.ts`
Bundle path validation protects map storage against unsafe paths; partial
coverage requires traversal and malformed path cases before simplification.
- `crap/lib/architecture-map/store.ts/147/0/validateBundlePath`

#### `lib/artifacts/plan-conformance.ts`
Plan decision reference validation enforces artifact linkage; partial coverage
requires unresolved and duplicate decision references before refactoring.
- `crap/lib/artifacts/plan-conformance.ts/55/0/validateDecisionReferences`

#### `lib/domains/loader.ts`
Domain loader composes discovered manifests and load errors; partial coverage
needs broken-manifest and missing-domain cases before restructuring.
- `crap/lib/domains/loader.ts/99/0/loadSingleDomain`

#### `lib/domains/registry.ts`
Capability registry resolves cross-domain provider names; partial coverage
needs unknown and ambiguous capability cases before simplification.
- `crap/lib/domains/registry.ts/55/18/resolveCapability`

#### `lib/driver/backends/env-args.ts`
Shell-word splitting preserves quoted backend environment arguments; partial
coverage needs escaped quotes and malformed input before changing the parser.
- `cognitive_crap/lib/driver/backends/env-args.ts/32/0/splitShellWords`

#### `lib/driver/drive-finalization.ts`
Task-status transitions reconcile durable Drive finalization; unreported
coverage calls for interrupted commits and contradictory terminal states.
- `cognitive/lib/driver/drive-finalization.ts/172/7/transitionDriveTaskStatus`

#### `lib/driver/drive-graph-runner.ts`
Graph runner records terminal episodes, blocked dependencies, and returned
results; partial coverage needs replay and cancellation interleavings first.
- `cognitive_crap/lib/driver/drive-graph-runner.ts/616/0/toDriverResult`
- `crap/lib/driver/drive-graph-runner.ts/1005/0/blockingTaskIdsForPendingTasks`
- `cognitive_crap/lib/driver/drive-graph-runner.ts/360/0/recordClaimedDriveTerminalEpisode`

#### `lib/driver/drive-scheduler-backend.ts`
Scheduler backend executes task attempts with retry state; partial coverage
needs backend failure and retry exhaustion cases before decomposition.
- `crap/lib/driver/drive-scheduler-backend.ts/197/0/runDriveTaskAttempt`

#### `lib/driver/durable-steps.ts`
Durable step projection and upserts preserve task/finalizer graph state; partial
coverage needs replay, missing step, and duplicate-finalizer cases.
- `crap/lib/driver/durable-steps.ts/648/0/upsertFinalizerStep`
- `crap/lib/driver/durable-steps.ts/617/0/upsertTaskStep`
- `crap/lib/driver/durable-steps.ts/69/15/project`

#### `lib/driver/event-stream.ts`
Event stream content processing translates backend JSONL into activity;
partial coverage needs malformed chunks and out-of-order event cases.
- `cognitive_crap/lib/driver/event-stream.ts/598/24/processContent`

#### `lib/driver/report-parser.ts`
Driver report parsing turns agent output into a terminal result; partial
coverage needs absent and contradictory outcome markers before simplification.
- `crap/lib/driver/report-parser.ts/50/0/toReport`

#### `lib/driver/run-one-task.ts`
Single-task attempt manages worker lifecycle and result propagation; partial
coverage needs timeout, blocked, and failed-backend branches.
- `crap/lib/driver/run-one-task.ts/100/0/runTaskAttempt`

#### `lib/driver/run-state.ts`
Run-state guards validate stamped completion and terminal records; partial
coverage needs malformed persisted state and mismatched episode cases.
- `crap/lib/driver/run-state.ts/263/0/isDriveTerminalRecord`
- `crap/lib/driver/run-state.ts/322/0/isStampedRunCompletion`

#### `lib/driver/shell-command-finalizer.ts`
Shell finalizer updates task status after command completion; partial coverage
needs failed commands and repeated finalization cases.
- `crap/lib/driver/shell-command-finalizer.ts/157/0/runTaskStatusFinalizer`

#### `lib/durable-runtime/file-store.ts`
Persisted event, diagnostic, graph-step, and scheduler-state guards reject
corrupt files; partial coverage calls for malformed fields and old snapshots.
- `crap/lib/durable-runtime/file-store.ts/887/0/isRunGraphStepLike`
- `crap/lib/durable-runtime/file-store.ts/833/0/isStoredEvent`
- `crap/lib/durable-runtime/file-store.ts/853/0/isStoredDiagnostic`
- `crap/lib/durable-runtime/file-store.ts/923/0/isSchedulerStateLike`

#### `lib/durable-runtime/scheduler.ts`
Scheduler recovery, step results, and finalization preserve durable ordering;
partial coverage needs crashed-running and duplicate-completion cases.
- `crap/lib/durable-runtime/scheduler.ts/1687/0/finalizeRun`
- `crap/lib/durable-runtime/scheduler.ts/653/0/blockPotentiallyCommittedRunningSteps`
- `crap/lib/durable-runtime/scheduler.ts/1519/0/isStepResult`

#### `lib/extensions/agent-memory/index.ts`
Memory extension renders captured/remembered results for agents; partial
coverage needs failed capture and mixed-memory result shapes.
- `cognitive_crap/lib/extensions/agent-memory/index.ts/778/0/renderRememberResult`
- `crap/lib/extensions/agent-memory/index.ts/720/0/renderRememberWithCapture`

#### `lib/extensions/architecture-memory/index.ts`
Architecture-map tool rendering exposes indexed results; partial coverage
needs missing-map and malformed-resource cases before restructuring.
- `crap/lib/extensions/architecture-memory/index.ts/211/0/renderArchitectureMapResult`

#### `lib/extensions/knowledge-surface/knowledge-tools.ts`
Knowledge tools handle recall and proposal requests at a user-input boundary;
partial coverage needs malformed proposal and empty-recall cases.
- `crap/lib/extensions/knowledge-surface/knowledge-tools.ts/71/8/<arrow>`
- `crap/lib/extensions/knowledge-surface/knowledge-tools.ts/330/0/parseKnowledgeProposalRequest`

#### `lib/harness-adapters/inventory.ts`
Inventory escaping preserves table cells from exported harness metadata;
partial coverage needs delimiters and multiline cells before simplification.
- `crap/lib/harness-adapters/inventory.ts/138/0/escapeInventoryCell`

#### `lib/harness-adapters/provenance.ts`
Owner identity validation protects harness provenance; partial coverage needs
missing and forged owner fields before simplifying the guard.
- `crap/lib/harness-adapters/provenance.ts/530/0/isOwnerIdentity`

#### `lib/harness-adapters/render.ts`
Registered source reading and generated-shape validation protect materialized
exports; partial coverage needs stale registrations and malformed output cases.
- `crap/lib/harness-adapters/render.ts/465/0/validateGeneratedShape`
- `crap/lib/harness-adapters/render.ts/322/0/readRegisteredSource`

#### `lib/harness-adapters/sync.ts`
Harness sync plans and applies transactional command/assets transfers; high
coverage on transaction apply still leaves many state transitions in one unit,
while partial/unreported coverage elsewhere leaves owner-root, receipt,
rollback, and migration failure branches to characterize before decomposition.
- `all/lib/harness-adapters/sync.ts/2440/7/applySyncPlanInTransaction`
- `both/lib/harness-adapters/sync.ts/1221/7/runClaudeCommandPairBootstrap`
- `cognitive_crap/lib/harness-adapters/sync.ts/3758/0/classifyInventoryRow`
- `crap/lib/harness-adapters/sync.ts/742/0/desiredDifference`
- `crap/lib/harness-adapters/sync.ts/3229/0/isOwnerRootJournal`
- `cognitive_crap/lib/harness-adapters/sync.ts/3016/0/rollbackJournal`
- `cognitive_crap/lib/harness-adapters/sync.ts/3875/0/planTransfers`
- `crap/lib/harness-adapters/sync.ts/4233/0/validateRequest`
- `crap/lib/harness-adapters/sync.ts/1947/0/assertLockedCommandPairMatchesEvidence`
- `crap/lib/harness-adapters/sync.ts/3400/0/canonicalizeOwnerRootReadOnly`
- `crap/lib/harness-adapters/sync.ts/3969/0/planForgets`
- `cognitive_crap/lib/harness-adapters/sync.ts/635/0/validateOwnerTarget`
- `cognitive_crap/lib/harness-adapters/sync.ts/1828/2/<arrow>`
- `crap/lib/harness-adapters/sync.ts/905/0/generatedWrapperMatches`
- `crap/lib/harness-adapters/sync.ts/2013/0/validateCompleteCommandEvidence`
- `crap/lib/harness-adapters/sync.ts/2955/19/<arrow>`
- `crap/lib/harness-adapters/sync.ts/3165/0/parseOwnerRootJournal`
- `crap/lib/harness-adapters/sync.ts/3372/0/verifyEvidenceReceipt`
- `crap/lib/harness-adapters/sync.ts/175/2/<arrow>`
- `crap/lib/harness-adapters/sync.ts/810/0/observeRecordedTarget`
- `crap/lib/harness-adapters/sync.ts/2180/0/readCommandMigrationEvidence`
- `crap/lib/harness-adapters/sync.ts/3000/19/<arrow>`

#### `lib/memory/consolidation-proposals.ts`
Proposal evidence guards and resolution-history parsing preserve accepted
judgments; partial coverage needs invalid references and repeated resolutions.
- `crap/lib/memory/consolidation-proposals.ts/751/0/isEvidenceRef`
- `crap/lib/memory/consolidation-proposals.ts/316/0/parseResolutionHistory`

#### `lib/memory/consolidation-receipts.ts`
Receipt parsing, normalization, and evidence validation protect persisted
judgments; partial coverage needs corrupt and stale receipt cases.
- `crap/lib/memory/consolidation-receipts.ts/335/0/parseReceipt`
- `crap/lib/memory/consolidation-receipts.ts/408/0/isEvidenceRef`
- `crap/lib/memory/consolidation-receipts.ts/291/0/normalizeReceipt`

#### `lib/memory/consolidation-sources.ts`
Episode source collection/finalization and prune-journal recovery preserve
accepted work across crashes; partial coverage needs recovery interleavings.
- `cognitive_crap/lib/memory/consolidation-sources.ts/479/16/finalize`
- `cognitive_crap/lib/memory/consolidation-sources.ts/204/15/collect`
- `crap/lib/memory/consolidation-sources.ts/610/0/recoverEpisodePruneJournal`

#### `lib/memory/durable-files.ts`
Durable restore handles interrupted file replacement; partial coverage calls
for missing backup and failed rename cases before restructuring.
- `cognitive_crap/lib/memory/durable-files.ts/233/0/durableRestore`

#### `lib/memory/episodic-records.ts`
Episodic event validation guards stored event shape; partial coverage needs
malformed event variants and missing required fields.
- `crap/lib/memory/episodic-records.ts/157/0/validateEvent`

#### `lib/memory/injection-budget.ts`
Fair-cap allocation distributes limited context across sources; unreported
coverage requires zero-budget and uneven-source cases before simplifying.
- `cognitive/lib/memory/injection-budget.ts/64/0/fairCaps`

#### `lib/memory/knowledge-records.ts`
Knowledge record and proposal parsing enforce human-authored/retirement
contracts; high coverage on the human parser does not remove its many field
branches, while partial/unreported coverage calls for malformed frontmatter,
retirement, and occupant variants before refactoring.
- `all/lib/memory/knowledge-records.ts/142/7/parseHumanKnowledgeRecord`
- `both/lib/memory/knowledge-records.ts/351/7/normalizeKnowledgeProposal`
- `cyclomatic/lib/memory/knowledge-records.ts/453/7/parseKnowledgeProposalOccupant`
- `crap/lib/memory/knowledge-records.ts/249/0/normalizeRetireWhen`

#### `lib/memory/knowledge-store.ts`
Knowledge-store scans files and accumulates frontmatter/body metadata;
partial coverage needs truncated frontmatter and invalid files before splitting.
- `cognitive_crap/lib/memory/knowledge-store.ts/465/0/collectKnowledgeFiles`
- `cognitive_crap/lib/memory/knowledge-store.ts/507/0/scanKnowledgeFile`
- `crap/lib/memory/knowledge-store.ts/676/24/acceptBodyLine`
- `crap/lib/memory/knowledge-store.ts/694/20/acceptBody`
- `crap/lib/memory/knowledge-store.ts/768/0/knowledgeFrontmatterEnd`

#### `lib/memory/living-memory.ts`
Living-memory citation inventories, deterministic observation, proposal
validation, and judgment selection span many source shapes; partial/unreported
coverage needs missing citation, stale inventory, and rejected judgment cases.
- `cognitive/lib/memory/living-memory.ts/1495/7/inspectLivingMemoryCitationInventory`
- `cognitive_crap/lib/memory/living-memory.ts/1705/0/collectInventoryMarkdown`
- `cognitive_crap/lib/memory/living-memory.ts/1403/0/observeDeterministicRecords`
- `crap/lib/memory/living-memory.ts/2138/0/retireWhenFromMetadata`
- `cognitive_crap/lib/memory/living-memory.ts/1932/0/citationReferences`
- `crap/lib/memory/living-memory.ts/2435/0/validateProposal`
- `crap/lib/memory/living-memory.ts/1830/0/extractInventoryTargets`
- `crap/lib/memory/living-memory.ts/2078/0/isPathShaped`
- `crap/lib/memory/living-memory.ts/862/8/<arrow>`
- `crap/lib/memory/living-memory.ts/2266/0/validateJudgmentOutput`

#### `lib/memory/markdown-store.ts`
Profile, playbook, and episode writers maintain stable markdown serialization;
partial coverage needs escaping, duplicate-key, and write-failure cases.
- `cognitive_crap/lib/memory/markdown-store.ts/325/0/writePlaybook`
- `crap/lib/memory/markdown-store.ts/241/0/writeProfile`
- `cognitive_crap/lib/memory/markdown-store.ts/129/0/writeEpisode`

#### `lib/memory/retirement-receipts.ts`
Retired-event parser reconstructs persisted retirement proof; partial
coverage needs invalid event and missing evidence variants before splitting.
- `crap/lib/memory/retirement-receipts.ts/539/0/parseRetiredEvent`

#### `lib/memory/retirement-store.ts`
Retirement preview, restore, journal recovery, and persisted journal guards
preserve atomic moves; partial coverage needs interrupted restore and corrupt
journal cases before decomposition.
- `cognitive_crap/lib/memory/retirement-store.ts/197/15/restore`
- `cognitive_crap/lib/memory/retirement-store.ts/989/0/recoverJournal`
- `crap/lib/memory/retirement-store.ts/1324/22/<arrow>`
- `crap/lib/memory/retirement-store.ts/273/0/restoreUnderLock`
- `crap/lib/memory/retirement-store.ts/1300/0/isRetirementJournal`
- `crap/lib/memory/retirement-store.ts/448/0/previewRetirements`

#### `lib/orchestration/chain-event-adapter.ts`
Chain event adapter validates spawn events and derives topology; partial
coverage needs malformed events and parallel-group lineage cases.
- `crap/lib/orchestration/chain-event-adapter.ts/771/0/isSpawnEvent`
- `crap/lib/orchestration/chain-event-adapter.ts/679/0/chainTopology`

#### `lib/orchestration/chain-parser.ts`
Chain parser resolves stage syntax into executable roles; partial coverage
needs invalid group expressions and unresolved roles.
- `crap/lib/orchestration/chain-parser.ts/61/0/resolveStage`

#### `lib/orchestration/chain-profiler.ts`
Profiler event handler updates run counters across event variants; partial
coverage needs duplicate and out-of-order event assertions.
- `crap/lib/orchestration/chain-profiler.ts/99/12/handleEvent`

#### `lib/orchestration/chain-runner.ts`
Chain runner prepares execution, loop stages, and completion decisions;
partial coverage needs failed stages, cancellation, and loop exhaustion.
- `crap/lib/orchestration/chain-runner.ts/1448/0/runLoopStage`
- `crap/lib/orchestration/chain-runner.ts/117/0/evaluateDefaultCompletionState`
- `crap/lib/orchestration/chain-runner.ts/1297/0/prepareStageExecution`

#### `lib/orchestration/durable-chain-runner.ts`
Durable chain runner executes steps and reads persisted review decisions;
partial coverage needs resumed failures and missing review artifacts.
- `crap/lib/orchestration/durable-chain-runner.ts/250/0/executeChainStep`
- `crap/lib/orchestration/durable-chain-runner.ts/468/0/readPersistedPlanReview`

#### `lib/plans/plan-manager.ts`
Locked plan updates protect concurrent artifact mutation; partial coverage
needs stale edits and lock failure cases before splitting.
- `crap/lib/plans/plan-manager.ts/196/31/updatePlanLocked`

#### `lib/plans/review-rounds.ts`
Review-round ingestion parses finding records and entries; partial coverage
needs malformed findings and absent review files.
- `crap/lib/plans/review-rounds.ts/522/0/parseFinding`
- `crap/lib/plans/review-rounds.ts/349/0/readReviewEntries`

#### `lib/runtime.ts`
Runtime creation assembles domains and extensions; partial coverage needs
missing domain and disabled-extension cases before decomposition.
- `crap/lib/runtime.ts/125/20/create`

#### `lib/sessions/session-store.ts`
Session store extracts assistant content from message variants; partial
coverage needs tool-only messages and missing text parts.
- `crap/lib/sessions/session-store.ts/63/0/extractAssistantParts`

#### `lib/skills/exporter.ts`
Skill exporter resolves catalogues and applies evaluated target groups;
partial coverage needs collisions, stale destinations, and rollback cases.
- `cognitive_crap/lib/skills/exporter.ts/882/0/applyEvaluatedGroup`
- `cognitive_crap/lib/skills/exporter.ts/456/0/resolveCatalogue`

#### `lib/tasks/task-parser.ts`
Task parser reads acceptance criteria from markdown; partial coverage needs
malformed checkbox and nested criterion cases before simplification.
- `crap/lib/tasks/task-parser.ts/183/0/parseAcceptanceCriteria`

#### `scripts/check-reachability.ts`
Reachability checker classifies live entry owners; Fallow reports no coverage
for this script, so ownerless and stale-owner cases must be exercised first.
- `crap/scripts/check-reachability.ts/70/0/ownerLive`

#### `scripts/knowledge-surface-backfill.ts`
Backfill reads indexed proposals and validates slugs before writing knowledge;
partial/unreported coverage needs duplicate slug, corrupt index, and dry-run
cases before restructuring.
- `cognitive/scripts/knowledge-surface-backfill.ts/178/7/runKnowledgeSurfaceBackfill`
- `cognitive_crap/scripts/knowledge-surface-backfill.ts/516/0/readIndexedProposals`
- `crap/scripts/knowledge-surface-backfill.ts/599/0/validateSlugProposals`

#### `scripts/probe-census.ts`
Census script resolves imports and walks declarations to classify production
reach; Fallow reports no coverage for this script, so alias, unresolved import,
and test-only declaration cases must be characterized before simplification.
- `crap/scripts/probe-census.ts/68/0/admit`
- `crap/scripts/probe-census.ts/46/0/productionReach`
- `crap/scripts/probe-census.ts/105/15/visit`
- `crap/scripts/probe-census.ts/27/0/resolveImport`
- `crap/scripts/probe-census.ts/89/0/isDeclarationCallee`
- `crap/scripts/probe-census.ts/40/7/<arrow>`
- `crap/scripts/probe-census.ts/131/0/census`

#### `scripts/validate-harness-exports.ts`
Export validation compares installed bundles, proofs, and lineage evidence;
partial coverage needs tampered bundle and mismatched proof cases first.
- `cognitive_crap/scripts/validate-harness-exports.ts/1938/2/<arrow>`
- `crap/scripts/validate-harness-exports.ts/1652/0/makeInstalledExternalBundleEvidence`
- `crap/scripts/validate-harness-exports.ts/1473/2/<arrow>`
- `crap/scripts/validate-harness-exports.ts/1848/21/<arrow>`
- `crap/scripts/validate-harness-exports.ts/2325/0/assertProofsMatchEvidence`

#### `tests/harness-adapters/sync.test.ts`
The critical transactional sync suite callback holds many recovery assertions;
partial coverage is measured at file level and cannot establish every
rollback branch. Preserve assertions until those scenarios can be split safely.
- `all/tests/harness-adapters/sync.test.ts/380/93/<arrow>`

#### `tests/memory/interface.test.ts`
The critical migrated-seed audit checks destination and provenance across
memory stores; partial coverage leaves missing/duplicate destination cases to
characterize before extracting the helper.
- `all/tests/memory/interface.test.ts/2713/0/auditMigratedSeed`

#### `tests/memory/markdown-store.test.ts`
The critical markdown-store suite callback checks serialization invariants;
partial file coverage does not guarantee each invalid-record branch is covered.
Split fixtures only after preserving all write and rejection assertions.
- `cognitive_crap/tests/memory/markdown-store.test.ts/1171/75/<arrow>`

#### `tests/orchestration/chain-runner.test.ts`
The critical chain-runner callback spans staged execution and failure tests;
partial file coverage needs canceled/failed stage characterization before
splitting the suite without changing expectations.
- `all/tests/orchestration/chain-runner.test.ts/2191/81/<arrow>`

## Review Rules For Future Exceptions

- Prefer fixing the code over adding a suppression.
- If an exception is needed, make it line-specific or pattern-specific.
- Document the reason using one of: public API, framework convention, generated
  file, optional tooling dependency, false positive, or temporary migration debt.
- Refresh baselines only after deliberate cleanup, with a literal base and
  recorded reason. Keep changed-scope audit failing on introduced issues.
- Remove stale suppressions as soon as refactoring brings a function below the
  threshold.

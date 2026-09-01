# Plan Review: living-memory

## Verdict

- pass: no
- assessment: The ratified direction is viable, and D-001..D-004 remain unchanged, but the plan is not ready for task creation. Its byte-authority baseline, crash-durability protocol, lock liveness, citation inventory, and cross-worker contracts need remediation first.

## Findings

- id: PR-001
  dimension: lifecycle-invariant
  severity: high
  title: "The frozen migration receipt does not prove destination-byte identity"
  plan_refs: Decision Log D-007; B-001; B-002; Design §6 “Baseline reconstruction”
  code_refs: tests/memory/interface.test.ts:1824-1918, tests/memory/interface.test.ts:2050-2063, tests/memory/interface.test.ts:2155-2172
  description: |
    D-007 treats a frozen migrated record as having a reconstructible ratification-byte baseline. The current frozen inventory instead stores digests of the legacy source, then the audit parses the destination with `gray-matter` and compares sorted metadata values plus body text. `stableJson()` deliberately erases key-order differences, so a frontmatter serialization-only byte change can pass; `legacySourceSha256` is not a digest of the resulting `knowledge/...` file.

    Auto-retiring such a record would therefore claim “unchanged since ratification” without evidence for the exact destination bytes required by ratified INV-002 and AC-002. This is a collision with ratified spec ground, so the expected behavior must not be weakened.
  required_remediation: |
    Amend derived D-007 on record so frozen records are eligible only if exact destination bytes can be reconstructed from ratified evidence and proven by a negative serialization-only mutation test. Otherwise classify those baselines as unknown and keep them live. Do not change D-001..D-004, INV-002, or AC-002.

- id: PR-002
  dimension: lifecycle-invariant
  severity: high
  title: "Atomic visibility is being used as crash durability"
  plan_refs: D-006; B-015; B-019; Design §5 proposal primitive; Design §7 steps 2-6; Design §9
  code_refs: lib/memory/knowledge-store.ts:317-338, lib/entity-file-lock.ts:112-132
  description: |
    The plan says to extract the existing proposal-file primitive, then treats a readable proposal and an atomically created manifest as durable commit evidence. The existing primitive performs `writeFile → link → unlink` without syncing file data or parent directory entries. The lock primitive uses the same visibility-oriented pattern. Those operations are exclusive and readable, but the repository seam does not establish power-loss durability.

    If an episode is unlinked after a merely readable proposal, or a live knowledge link is removed after a merely visible manifest, a crash can lose the evidence that was supposed to precede removal. That violates ratified AC-014/INV-002 rather than only an implementation preference.
  required_remediation: |
    Specify the durable-write contract before Slice 2: which files and parent directories are synced, where the commit point is, and how unsupported durability fails closed. Apply it to journals, proposal files before episode pruning, manifest rounds before live unlink, and terminal journal removal. Add crash-oriented negative evidence distinct from ordinary injected exceptions.

- id: PR-003
  dimension: lifecycle-invariant
  severity: high
  title: "Direct use of the shared lock can wait forever"
  plan_refs: Design §7 first paragraph; B-013; B-015; Implementation Order Slice 2 step 9
  code_refs: lib/entity-file-lock.ts:25-36, lib/entity-file-lock.ts:60-68, lib/entity-file-lock.ts:291-328, lib/tasks/lock.ts:7-13, lib/tasks/lock.ts:35-46
  description: |
    The plan requires `withEntityFileLock` “directly” but gives no options. Its `waitTimeoutMs` contract explicitly waits indefinitely when omitted. The task wrapper documents the concrete liveness failure: a live-PID stranded lock cannot be reclaimed and would hang forever, so that caller supplies a 10-second bound. Release failure is also non-throwing unless the caller uses `onReleaseUnconfirmed`.

    Implemented literally, manual consolidation or a long-lived autonomy process can block forever, and an unreported release failure can strand every later pass for that process lifetime.
  required_remediation: |
    Define a finite acquisition timeout, map timeout to the public failed result/CLI exit, and surface `onReleaseUnconfirmed` in result warnings/recovery state. Add tests for live-owner timeout and release-unconfirmed behavior; never continue unlocked.

- id: PR-004
  dimension: interface-fidelity
  severity: high
  title: "Independent workers do not have a complete consolidation contract"
  plan_refs: Design §1; Design §2; Design §3; Files to Change entries for types, living-memory, judgment-provider, and consolidation-job
  code_refs: lib/memory/types.ts:103-116, lib/memory/knowledge-store.ts:75-99, lib/architecture-map/types.ts:90-96, lib/extensions/knowledge-surface/combined-context.ts:20-33, lib/extensions/knowledge-surface/combined-context.ts:182-222
  description: |
    The plan names an optional `consolidator` but gives no callback signature. `MemoryConsolidateDetails` is prose rather than a field-level contract, and `CorpusJudgmentInput`/`CorpusJudgmentOutput` are referenced but never defined. The local architecture-provider pattern it cites has exact exported input, output, and provider interfaces; this plan does not provide their living-memory equivalents.

    Index pressure is also owned by `lib/extensions/knowledge-surface/`, while the pipeline that consumes it is owned by `lib/memory/`; no injected target-policy contract or composition factory explains how CLI and job adapters supply it without reversing the current extension→memory dependency. Workers implementing the store, pipeline, model adapter, and autonomy adapter would have to invent mutually dependent shapes.
  required_remediation: |
    Define exact exported TypeScript contracts for the consolidator callback, all result-detail variants, judgment input/output, proposal previews/evidence, and the injected index-pressure policy. Name the composition factory and its owner so both CLI and job adapters construct the same pipeline while `lib/memory` remains independent of extensions and Pi.

- id: PR-005
  dimension: risk-blast-radius
  severity: high
  title: "The inbound-reference inventory is both over- and under-inclusive"
  plan_refs: B-005; Design §4 step 4; Risks “Path/citation scanning”
  code_refs: lib/memory/knowledge-store.ts:365-397, lib/memory/knowledge-records.ts:82-111, tests/memory/interface.test.ts:1967-2014, tests/memory/interface.test.ts:2097-2118
  description: |
    The proposed scan reads every `knowledge/**/*.md` except only `knowledge/retired/`. This includes `knowledge/index.md`, which the current store intentionally excludes from retrieval and whose frozen receipt lists every migrated destination path. Treating those receipt rows as live semantic citations vetoes retirement of the migrated corpus wholesale.

    In the other direction, the scan omits authority-bearing root documents such as `AGENTS.md`, `README.md`, and `ROADMAP.md`, even though the existing audit explicitly includes them. It also says “exact target resource/path” while the parser accepts both physical-relative and `knowledge/...` resource forms; relative markdown links and anchors are not normalized. The result can either deadlock the regulator or miss a real citation and violate ratified AC-005/INV-004.
  required_remediation: |
    Define a complete, healthy citation inventory and canonical reference resolver: distinguish receipt/history files from live semantic sources, include authority-bearing root docs, define active versus archived mission evidence, normalize accepted resource/link forms, and fail closed on unreadable or partial scans. Add negative tests for `knowledge/index.md`, root docs, relative links, anchors, and incomplete inventory. Do not narrow AC-005.

- id: PR-006
  dimension: user-experience
  severity: high
  title: "Improve proposals have no reachable closing operation"
  plan_refs: B-007; D-011; Design §5 improve variant; Design §7 lifecycle exits; Files to Change CLI entries
  code_refs: cli/main.ts:680-739, lib/extensions/knowledge-surface/knowledge-tools.ts:166-226
  description: |
    B-007 says a human records an action pointer or rejection “through the proposal resolver,” but the resolver is assigned only as an internal `lib/memory/consolidation-proposals.ts` seam. The proposed CLI surface contains only `memory consolidate`, and the existing knowledge tools expose recall and record creation, not improve resolution.

    An internal function exercised only by a unit test is not a human workflow. Open improve proposals would have no reachable validated exit, recreating the monotonic backlog ratified INV-006 explicitly forbids.
  required_remediation: |
    Add an explicit user-invokable owner for action/reject resolution, with closed input schema, pointer validation, idempotent retry, deterministic output/exit behavior, and tests for both lifecycle branches. This must implement AC-007 as written; it must not move improve content into `knowledge/`.

- id: PR-007
  dimension: lifecycle-invariant
  severity: medium
  title: "Model wording is part of the key that retries are expected to reuse"
  plan_refs: B-016; B-019; Design §5 stable key; Design §9 convergence
  code_refs: lib/memory/knowledge-records.ts:158-193, cli/architecture/narrative-provider.ts:43-58, cli/architecture/narrative-provider.ts:66-94
  description: |
    The plan keys a proposal by replacement/four-column content and then claims a fresh retry will reuse that key. The existing identity pattern confirms that changed content produces a different path, while the cited Pi pattern obtains prose from a fresh in-memory model session. Model output is not a deterministic function guaranteed to reproduce byte-identical wording after restart.

    A crash after proposal persistence but before episode pruning can therefore cause the retry to create another proposal rather than recognize the durable one, contradicting B-019’s deduplication and B-016’s convergence claim.
  required_remediation: |
    Define persisted source-to-output identity independently of volatile model wording, or persist and rehydrate an input/evidence receipt that lets retries reuse the first accepted output before another model call. Preserve the rule that changed source evidence creates a new proposal.

- id: PR-008
  dimension: constraint-ownership
  severity: medium
  title: "Ratified D-004 is not carried by an executable behavior"
  plan_refs: D-004; B-005; B-006; B-009; Implementation Order
  code_refs: missions/reviews/living-memory-l4-prototype.md:101-119, missions/architecture/spikes/observational-memory.md:298-304, knowledge/observability/gotcha-do-not-assume-automatic-compaction-works-for-ephemeral-sessions-9608b54dbb0d.md:1-21
  description: |
    D-004 ratifies a specific outcome: keep the across-run claim and drop the fixed within-run claim through an N=1 edit proposal. B-005 only proves that citations block movement and produce a retire conflict; B-006 covers rollup parents; B-009 covers stale paths. No behavior requires the exact edit-narrow result, so task decomposition can preserve every listed behavior while silently dropping D-004.

    D-004 is human-ratified ground and must not be amended by remediation.
  required_remediation: |
    Make the 9608b54 fixture and exact keep/drop outcome owned by an existing behavior/test (preferably the citation-conflict seam) or by a separately identified executable behavior. Use a temp copy; do not perform the excluded live-corpus round.

- id: PR-009
  dimension: quality-contract
  severity: low
  title: "Artifact conformance is declared bound but its current evidence homes do not exist"
  plan_refs: Behaviors B-001..B-020; Quality Contract gate 2; Files to Change
  code_refs: tests/memory/living-memory.test.ts (missing), tests/cli/memory/subcommand.test.ts (missing), tests/cli/memory/main-dispatch.test.ts (missing), tests/memory/interface.test.ts:1631-1714, domains/shared/skills/work-artifacts/references/behavior-spine.md:43-51
  description: |
    Three referenced test files do not exist, and the existing frozen-audit test carries only the old knowledge-surface marker rather than B-001. The canonical mechanical gate requires a resolving test file and exact marker text in that file. The plan may intend to create these during RED work, but it cannot currently present gate 2 as satisfied evidence.
  required_remediation: |
    Record artifact-conformance as not yet passing, then create each executable test home with its exact marker in the owning RED step before task completion. Do not treat marker text in plan prose as evidence.

- id: PR-010
  dimension: scope-size
  severity: low
  title: "Twenty behaviors still exceed the plan-size guidance"
  plan_refs: Overview size justification; D-012; Behaviors B-001..B-020; Implementation Order Slices 0-4
  code_refs: missions/plans/living-memory/plan.md:17-18, missions/plans/living-memory/plan.md:558-616
  description: |
    The plan has 20 behaviors against the 12-behavior guidance. D-012 and the five slices are a useful mitigation, but no tasks yet bind file ownership and acceptance to those slices; one handoff can still become a 20-behavior batch with cross-slice invention.
  required_remediation: |
    Keep the authoritative spec and ratified slug whole, but require separate task/release units for the existing Slice 0, Slice 1, Slice 2, Slice 3, and integrated Slice 4 boundaries, with the shared contracts from PR-004 landed before parallel work.

## Missing Coverage

- Dry-run behavior when `.transaction.json` already exists, a live mutation lock is present, or a mutating pass starts concurrently. The plan exposes `recovery: "pending"` but does not say whether preview stops, fails, or observes a stable read-only snapshot.
- Fail-closed parsing for malformed manifest rounds, duplicate retirement IDs, invalid numeric round order, restoration events referencing unknown retirements, and malformed `retiredRecords` rows.
- CLI conflict behavior for `--json --plain` and `--no-model --model`, plus interruption/cancellation behavior while the one model request is active.
- A concrete human restoration procedure that allocates and appends the restoration round without racing a machine pass.
- A source-contract negative where an adapter exceeds its advertised limit or reuses a record ID also used by another source.

## Coverage Ledger

- dimension: interface-fidelity
  status: checked
  checked: Compared the existing `MemoryStore`, knowledge-store factory, architecture narrative provider contract, combined-context ownership, CLI dispatch, and tool schemas with every proposed call/receive boundary.
  findings: PR-004

- dimension: duplication
  status: unchecked
  checked: `analysis_duplication` returned `unbound` with provider `fallow` and reason `execution-not-consented`; manual reading located the existing proposal primitive but is not reported as structural duplication evidence.
  findings: none

- dimension: state-sync
  status: checked
  checked: Traced byte baselines, persisted proposal identity, retirement journal/manifest state, lock acquisition/release, and fresh-process retry claims.
  findings: PR-001, PR-002, PR-003, PR-007

- dimension: risk-blast-radius
  status: checked
  checked: Walked corpus retirement, frozen receipt audit, citation veto, episode prune, manual CLI, default retrieval, and root-document interactions.
  findings: PR-001, PR-002, PR-005

- dimension: user-experience
  status: checked
  checked: Walked manual consolidate, dry run, retired recall, restoration, improve conversion/rejection, failures, and retry from the owner’s perspective.
  findings: PR-003, PR-006

- dimension: behavior-spec
  status: checked
  checked: Mapped AC-001..AC-018 to B-001..B-020, named tests, seams, edge/failure cases, and ratified D-001..D-004.
  findings: PR-008, PR-009

- dimension: architecture-record
  status: unchecked
  checked: The ratified architecture records and prototype evidence were read, but `analysis_boundaries` returned `unbound` (`execution-not-consented`) and `architecture_map_read` reported the map missing. Dependency-direction conformance is therefore not claimed as checked.
  findings: none

- dimension: quality-contract
  status: checked
  checked: Verified ordered abstract gate shape, universal/bindable tiers, explicit degraded states, and plan-specific negative assertions against the artifact contract.
  findings: PR-009

- dimension: lifecycle-invariant
  status: checked
  checked: Attacked every written state’s exit, commit ordering, power-loss durability, lock liveness, proposal convergence, and improve closure.
  findings: PR-001, PR-002, PR-003, PR-006, PR-007

- dimension: constraint-ownership
  status: checked
  checked: Traced ratified D-001..D-004 and load-bearing design constraints into behaviors, tests, file owners, and implementation slices.
  findings: PR-008

- dimension: scope-size
  status: checked
  checked: Counted 20 behaviors and evaluated Slices 0-4 as candidate task/release seams against the 12-behavior guidance.
  findings: PR-010

## Assessment

No-pass with revisions; the architecture does not need fundamental rethinking. Fix PR-001 and PR-002 first: the feature cannot receive relocation/prune authority until exact ratification bytes and true durable-before-remove ordering are mechanically provable. All remediation must preserve human-ratified D-001..D-004 and the letter of the spec invariants and acceptance criteria.

# Backfill proposal review manifest — knowledge-surface Stage 7B

**This is a review aid, not the approval artifact.** The approval artifact is
`missions/reviews/knowledge-surface-backfill-approval.md` and must be written by a human.

- Proposals: **164** across **19** slugs
- Review-index digest: `e61eaf52d7ca488657323c06e6f6f03463447265158a6eaf114a0faf25e3a6b4`
- Aggregate proposal digest: `f22ae61f24b82d534f68f5d4e4dfccfd08344cf59558dbee72f5118e1e0053c1`

**What you are judging (INV-5):** each record must be *distilled, not copied* — no raw
transcript excerpts, file contents, or command output. Tick a slug when every record
under it has been read.

The **source** column names the specific artifact supporting that record. `T` marks a
record sourced from a session transcript — the class INV-5 exists for, since transcripts
may carry secrets. Records sourced from `plan.md` and other tracked plan-directory
documents draw on material already committed to this repository.

## [ ] agent-thinking-levels (5)

<sub>0 archived transcript(s) available; 0 record(s) cite one</sub>

| # | T | type | title | words | source |
|---:|:-:|---|---|---:|---|
| 1 |  | convention | Thinking configuration mirrors model configuration | 58 | `missions/archive/plans/agent-thinking-levels/plan.md` |
| 2 |  | decision | Agent thinking levels use the existing session API | 52 | `missions/archive/plans/agent-thinking-levels/plan.md` |
| 3 |  | decision | CLI thinking selection applies to spawned chain agents | 53 | `missions/archive/plans/agent-thinking-levels/plan.md` |
| 4 |  | decision | Thinking-level precedence is explicit spawn, role definition, then chain default | 62 | `missions/archive/plans/agent-thinking-levels/plan.md` |
| 5 |  | gotcha | Thinking defaults have model-compatibility and cost consequences | 59 | `missions/archive/plans/agent-thinking-levels/plan.md` |

<sub>path: `memory/agent/proposals/agent-thinking-levels/`</sub>

## [ ] analysis-capabilities (8)

<sub>0 archived transcript(s) available; 0 record(s) cite one</sub>

| # | T | type | title | words | source |
|---:|:-:|---|---|---:|---|
| 1 |  | convention | Distinguish unavailable support from attempted execution failure | 69 | `missions/archive/plans/analysis-capabilities/plan.md` |
| 2 |  | decision | Keep capability contracts inward and provider I/O at the edge | 59 | `missions/archive/plans/analysis-capabilities/plan.md` |
| 3 |  | decision | Remediation should rerun the capability request | 74 | `missions/archive/plans/analysis-capabilities/plan.md` |
| 4 |  | decision | Subprocess runners must preserve termination evidence | 69 | `missions/archive/plans/analysis-capabilities/plan.md` |
| 5 |  | decision | Verdicts belong only to verdict-bearing result kinds | 67 | `missions/archive/plans/analysis-capabilities/plan.md` |
| 6 |  | gotcha | Read-only analysis includes caches and introspection side effects | 64 | `missions/archive/plans/analysis-capabilities/plan.md` |
| 7 |  | gotcha | Read-only discovery must not execute repository-controlled binaries | 66 | `missions/archive/plans/analysis-capabilities/plan.md` |
| 8 |  | gotcha | Scoped requests must never widen silently | 71 | `missions/archive/plans/analysis-capabilities/plan.md` |

<sub>path: `memory/agent/proposals/analysis-capabilities/`</sub>

## [ ] coding-agnostic-framework (10)

<sub>2 archived transcript(s) available; 0 record(s) cite one</sub>

| # | T | type | title | words | source |
|---:|:-:|---|---|---:|---|
| 1 |  | convention | Make test-decoupling inventories executable | 73 | `test-decoupling-ledger.md` |
| 2 |  | convention | Scan-only audits require dispositions | 61 | `leakage-findings.md` |
| 3 |  | convention | Use minimal synthetic installable domains in framework tests | 65 | `missions/archive/plans/coding-agnostic-framework/plan.md` |
| 4 |  | decision | Centralize default-domain resolution | 79 | `missions/archive/plans/coding-agnostic-framework/plan.md` |
| 5 |  | decision | Define CLI runnability by default-assistant availability | 59 | `missions/archive/plans/coding-agnostic-framework/plan.md` |
| 6 |  | decision | Framework orchestration defaults belong outside domains | 65 | `missions/archive/plans/coding-agnostic-framework/plan.md` |
| 7 |  | decision | Record resolved agent identity at the resolution seam | 79 | `dogfood-drive-verification.md` |
| 8 |  | gotcha | Resource fallback is not runtime identity | 63 | `missions/archive/plans/coding-agnostic-framework/plan.md` |
| 9 |  | gotcha | Unqualified role routing can depend on absence | 62 | `missions/archive/plans/coding-agnostic-framework/plan.md` |
| 10 |  | trade-off | Relocate defaults while preserving explicit legacy paths | 64 | `missions/archive/plans/coding-agnostic-framework/plan.md` |

<sub>path: `memory/agent/proposals/coding-agnostic-framework/`</sub>

## [ ] dialogic-planner (7)

<sub>0 archived transcript(s) available; 0 record(s) cite one</sub>

| # | T | type | title | words | source |
|---:|:-:|---|---|---:|---|
| 1 |  | convention | Fuzzy ideas diverge before converging | 54 | `missions/archive/plans/dialogic-planner/plan.md` |
| 2 |  | convention | Product framing and engineering design have separate owners | 52 | `missions/archive/plans/dialogic-planner/plan.md` |
| 3 |  | decision | 'Order delivery design as structure, behaviors, then tasks' | 51 | `missions/archive/plans/dialogic-planner/plan.md` |
| 4 |  | decision | Planning behavior follows invocation mode | 77 | `missions/archive/plans/dialogic-planner/plan.md` |
| 5 |  | decision | Review the final planning artifact before execution | 49 | `missions/archive/plans/dialogic-planner/plan.md` |
| 6 |  | decision | Run independent review lenses as a parallel panel | 51 | `missions/archive/plans/dialogic-planner/plan.md` |
| 7 |  | trade-off | Defer planner memory reads until retrieval is selective | 58 | `missions/archive/plans/dialogic-planner/plan.md` |

<sub>path: `memory/agent/proposals/dialogic-planner/`</sub>

## [ ] domain-authoring (11)

<sub>0 archived transcript(s) available; 0 record(s) cite one</sub>

| # | T | type | title | words | source |
|---:|:-:|---|---|---:|---|
| 1 |  | convention | Centralize public-surface interpretation | 56 | `missions/archive/plans/domain-authoring/plan.md` |
| 2 |  | convention | Domain prompt directories contain personas only | 64 | `missions/archive/plans/domain-authoring/plan.md` |
| 3 |  | decision | 'Binding precedence is live, then project, then same-name' | 64 | `missions/archive/plans/domain-authoring/plan.md` |
| 4 |  | decision | Domain ID conflicts are precedence-sensitive and provenance-rich | 64 | `missions/archive/plans/domain-authoring/plan.md` |
| 5 |  | decision | Domain visibility is default-public with an explicit internal deny-list | 79 | `missions/archive/plans/domain-authoring/plan.md` |
| 6 |  | decision | Live binding state is shared by reference and reconstructed from session history | 81 | `missions/archive/plans/domain-authoring/plan.md` |
| 7 |  | decision | Role binding preserves requested and resolved identities | 83 | `missions/archive/plans/domain-authoring/plan.md` |
| 8 |  | gotcha | A root-domain package needs an exact source kind | 66 | `missions/archive/plans/domain-authoring/plan.md` |
| 9 |  | gotcha | Filter inactive providers before validation and conflict detection | 55 | `missions/archive/plans/domain-authoring/plan.md` |
| 10 |  | gotcha | Malformed execution-identity bindings must not disappear silently | 66 | `missions/archive/plans/domain-authoring/plan.md` |
| 11 |  | trade-off | Live binding switches affect future resolutions only | 53 | `missions/archive/plans/domain-authoring/plan.md` |

<sub>path: `memory/agent/proposals/domain-authoring/`</sub>

## [ ] drive-smoke-fixes (7)

<sub>0 archived transcript(s) available; 0 record(s) cite one</sub>

| # | T | type | title | words | source |
|---:|:-:|---|---|---:|---|
| 1 |  | convention | Blocked-input reports include the command and observed output | 50 | `missions/archive/plans/drive-smoke-fixes/plan.md` |
| 2 |  | decision | Put progress evidence in the model-visible tool channel | 58 | `missions/archive/plans/drive-smoke-fixes/plan.md` |
| 3 |  | decision | Retry contradicted missing-path blocks once | 79 | `missions/archive/plans/drive-smoke-fixes/plan.md` |
| 4 |  | decision | Separate backend execution root from artifact storage | 55 | `missions/archive/plans/drive-smoke-fixes/plan.md` |
| 5 |  | decision | Serialize file-backed ID allocation with a filesystem lock | 64 | `missions/archive/plans/drive-smoke-fixes/plan.md` |
| 6 |  | gotcha | Filesystem locks need stale-owner recovery | 63 | `missions/archive/plans/drive-smoke-fixes/plan.md` |
| 7 |  | trade-off | Bound event text while preserving cursor-based recovery | 64 | `missions/archive/plans/drive-smoke-fixes/plan.md` |

<sub>path: `memory/agent/proposals/drive-smoke-fixes/`</sub>

## [ ] driver-primitives (11)

<sub>85 archived transcript(s) available; 1 record(s) cite one</sub>

| # | T | type | title | words | source |
|---:|:-:|---|---|---:|---|
| 1 |  | convention | Exclude orchestration metadata from driver-created commits | 59 | `missions/archive/plans/driver-primitives/plan.md` |
| 2 |  | convention | Inject backends and preserve the full child execution context | 63 | `missions/archive/plans/driver-primitives/plan.md` |
| 3 |  | decision | Keep execution specifications serializable | 54 | `missions/archive/plans/driver-primitives/plan.md` |
| 4 |  | decision | Persist events before publishing live notifications | 57 | `missions/archive/plans/driver-primitives/plan.md` |
| 5 |  | decision | Return a run handle immediately for long-running tools | 50 | `missions/archive/plans/driver-primitives/plan.md` |
| 6 |  | decision | Separate report parsing from outcome derivation | 60 | `missions/archive/plans/driver-primitives/plan.md` |
| 7 |  | decision | Share one lock-agnostic run loop across execution modes | 63 | `missions/archive/plans/driver-primitives/plan.md` |
| 8 |  | decision | Use separate locks for run ownership and commit serialization | 66 | `missions/archive/plans/driver-primitives/plan.md` |
| 9 |  | gotcha | A successful commit and task-state update are not atomic | 62 | `missions/archive/plans/driver-primitives/plan.md` |
| 10 | T | gotcha | Event isolation requires both type namespaces and session correlation | 62 | `coordinator-4ee7c9e8-ab41-4d08-a25b-8d585efd0a6c.transcript.md` |
| 11 |  | trade-off | 'Treat partial work as committed progress, not completion' | 62 | `missions/archive/plans/driver-primitives/plan.md` |

<sub>path: `memory/agent/proposals/driver-primitives/`</sub>

## [ ] external-agent-orchestration (9)

<sub>19 archived transcript(s) available; 2 record(s) cite one</sub>

| # | T | type | title | words | source |
|---:|:-:|---|---|---:|---|
| 1 |  | convention | Explicit packages own their external tool policy | 62 | `plan.md` |
| 2 |  | convention | Separate runtime cwd from temporary prompt assets | 57 | `plan.md` |
| 3 | T | convention | Single-source internal and packaged skill filtering | 56 | `worker-2d18a049-33bd-42a2-bd6a-e1b8b5bfb3b2.transcript.md` |
| 4 |  | decision | Make subscription-safe authentication the default | 56 | `plan.md` |
| 5 |  | decision | Use declarative package definitions as the export boundary | 57 | `plan.md` |
| 6 | T | gotcha | Mocked compiler tests can miss generated-entry failures | 61 | `reviewer-39c97aa6-3884-4855-a56f-b1f9b362894f.transcript.md` |
| 7 |  | gotcha | Raw internal prompts require portability checks | 65 | `plan.md` |
| 8 |  | trade-off | Inline full skill content for hermetic exports | 69 | `plan.md` |
| 9 |  | trade-off | Schema extensibility does not imply exporter support | 50 | `plan.md` |

<sub>path: `memory/agent/proposals/external-agent-orchestration/`</sub>

## [ ] external-backends-and-cli (12)

<sub>37 archived transcript(s) available; 1 record(s) cite one</sub>

| # | T | type | title | words | source |
|---:|:-:|---|---|---:|---|
| 1 |  | convention | Detached run specifications remain serializable boundary contracts | 58 | `missions/archive/plans/external-backends-and-cli/plan.md` |
| 2 |  | convention | 'Execution-mode parity is behavioral, not byte-identical' | 46 | `missions/archive/plans/external-backends-and-cli/plan.md` |
| 3 |  | convention | External command adapters use structured argv and explicit probes | 59 | `missions/archive/plans/external-backends-and-cli/plan.md` |
| 4 |  | decision | Detached execution process owns the complete run lifecycle | 78 | `missions/archive/plans/external-backends-and-cli/plan.md` |
| 5 |  | decision | Detached mode rejects session-coupled backends | 60 | `missions/archive/plans/external-backends-and-cli/plan.md` |
| 6 |  | decision | Plan locks and repository commit locks protect different scopes | 61 | `missions/archive/plans/external-backends-and-cli/review.md` |
| 7 |  | decision | Separate volatile process identity from durable run completion | 65 | `missions/archive/plans/external-backends-and-cli/plan.md` |
| 8 | T | gotcha | Agent renames can invalidate delegated domain authorization | 73 | `coordinator-fcaf1f39-a753-4e8b-9d36-13c0b00d5a0c.transcript.md` |
| 9 |  | gotcha | JSONL tailers must preserve unread byte boundaries | 73 | `missions/archive/plans/external-backends-and-cli/plan.md` |
| 10 |  | gotcha | Killing a detached supervisor may leave backend children alive | 56 | `missions/archive/plans/external-backends-and-cli/plan.md` |
| 11 |  | gotcha | Resuming after interruption requires a clean-tree guard | 65 | `missions/archive/plans/external-backends-and-cli/plan.md` |
| 12 |  | trade-off | Per-run compilation freezes source at a measurable cost | 68 | `missions/archive/plans/external-backends-and-cli/plan.md` |

<sub>path: `memory/agent/proposals/external-backends-and-cli/`</sub>

## [ ] fallow-temp-exceptions-cleanup (7)

<sub>0 archived transcript(s) available; 0 record(s) cite one</sub>

| # | T | type | title | words | source |
|---:|:-:|---|---|---:|---|
| 1 |  | convention | Lock observable behavior before complexity refactors | 70 | `plan.md` |
| 2 |  | convention | Reduce complexity with behavior-shaped decomposition | 75 | `plan.md` |
| 3 |  | decision | Classify static-analysis exceptions by intent before removal | 66 | `plan.md` |
| 4 |  | decision | Keep shared CLI helpers below command business logic | 74 | `plan.md` |
| 5 |  | decision | Remove duplication baselines in two gated phases | 82 | `plan.md` |
| 6 |  | gotcha | Parallel refactors must serialize shared-file ownership | 68 | `plan.md` |
| 7 |  | trade-off | Deduplicate tests without hiding their intent | 75 | `plan.md` |

<sub>path: `memory/agent/proposals/fallow-temp-exceptions-cleanup/`</sub>

## [ ] framework-extraction (8)

<sub>0 archived transcript(s) available; 0 record(s) cite one</sub>

| # | T | type | title | words | source |
|---:|:-:|---|---|---:|---|
| 1 |  | convention | Bundled domains use the public package layout | 57 | `missions/archive/plans/framework-extraction/spec.md` |
| 2 |  | decision | Agent-independent commands remain usable without installed domains | 57 | `missions/archive/plans/framework-extraction/plan.md` |
| 3 |  | decision | Keep framework infrastructure built in and distribute domains as packages | 55 | `missions/archive/plans/framework-extraction/plan.md` |
| 4 |  | decision | Persist installation origin for source-aware updates | 63 | `missions/archive/plans/framework-extraction/plan.md` |
| 5 |  | gotcha | Published package allowlists must include runtime-loaded content | 58 | `missions/archive/plans/framework-extraction/plan.md` |
| 6 |  | gotcha | Resolve bundled catalog paths from the framework installation | 54 | `missions/archive/plans/framework-extraction/plan.md` |
| 7 |  | gotcha | Use an isolated worktree when moving live-loaded agent definitions | 62 | `missions/archive/plans/framework-extraction/plan.md` |
| 8 |  | trade-off | Package variants may share one domain identity | 61 | `missions/archive/plans/framework-extraction/spec.md` |

<sub>path: `memory/agent/proposals/framework-extraction/`</sub>

## [ ] main-domain-and-cosmo-rename (9)

<sub>22 archived transcript(s) available; 5 record(s) cite one</sub>

| # | T | type | title | words | source |
|---:|:-:|---|---|---:|---|
| 1 |  | convention | 'Qualify cross-domain agent references, not same-domain references' | 46 | `plan.md` |
| 2 | T | convention | Scope persistent lead sessions by domain | 45 | `worker-72b977ff-79af-4807-8f15-be86d1f90dde.transcript.md` |
| 3 | T | decision | Attach rename guidance at the role-resolution boundary | 53 | `worker-c04771a7-1397-486b-9d4a-4bb19833a9db.transcript.md` |
| 4 |  | decision | Delegation-only agents receive no baseline coding tools | 47 | `plan.md` |
| 5 | T | decision | Resolve CLI defaults from domain manifests | 69 | `worker-bef40570-c70c-4ec4-b985-9d19c8aef4fb.transcript.md` |
| 6 |  | decision | Separate the cross-domain executive from domain coordinators | 59 | `plan.md` |
| 7 | T | gotcha | Built-in infrastructure domains do not satisfy installation guards | 51 | `worker-51279a14-29af-4070-ae8d-0078ed5c74ae.transcript.md` |
| 8 | T | trade-off | Delete demonstrably unused packages without migration machinery | 60 | `worker-2a9e789b-3867-459f-84af-8d2ddeee5826.transcript.md` |
| 9 |  | trade-off | Prompts may reference optional capabilities with an explicit fallback | 54 | `plan.md` |

<sub>path: `memory/agent/proposals/main-domain-and-cosmo-rename/`</sub>

## [ ] observability (6)

<sub>0 archived transcript(s) available; 0 record(s) cite one</sub>

| # | T | type | title | words | source |
|---:|:-:|---|---|---:|---|
| 1 |  | convention | Aggregate usage at stage-iteration granularity | 62 | `missions/archive/plans/observability/plan.md` |
| 2 |  | convention | Maintain a canonical framework capability reference | 65 | `missions/archive/plans/observability/plan.md` |
| 3 |  | decision | Observe spawned sessions at their boundary | 62 | `missions/archive/plans/observability/plan.md` |
| 4 |  | decision | Separate local diagnostics from orchestration event streaming | 56 | `missions/archive/plans/observability/plan.md` |
| 5 |  | gotcha | Capture session statistics before disposal | 60 | `missions/archive/plans/observability/plan.md` |
| 6 |  | gotcha | Do not assume automatic compaction works for ephemeral sessions | 59 | `missions/archive/plans/observability/plan.md` |

<sub>path: `memory/agent/proposals/observability/`</sub>

## [ ] orchestration-hardening (10)

<sub>0 archived transcript(s) available; 0 record(s) cite one</sub>

| # | T | type | title | words | source |
|---:|:-:|---|---|---:|---|
| 1 |  | convention | Abnormal scheduler drains carry structured causes | 64 | `TASK-403 - Emit a structured diagnostic reason when the Drive scheduler drains or aborts.md` |
| 2 |  | convention | Migration completion requires a repository-wide stale-reference sweep | 58 | `TASK-406 - Require a repo-wide stale-reference sweep for migration tasks (not testsdocs only).md` |
| 3 |  | convention | Multi-seam behaviors require proof at every declared seam | 62 | `TASK-408 - Verifier must confirm EVERY seam a behavior declares is implemented and tested.md` |
| 4 |  | convention | Shared primitives trigger blast-radius verification | 63 | `TASK-407 - Add a blast-radius review lens for new shared primitives (verifierreviewerQM).md` |
| 5 |  | convention | Task graphs encode only true dependencies | 60 | `TASK-411 - Task-manager encode minimal real dependencies so Drive can parallelize independent work.md` |
| 6 |  | decision | Centralized design intent outranks a narrow single-site criterion | 61 | `TASK-409 - Worker persona implement a rule to the design's centralization intent, not the narrowest AC.md` |
| 7 |  | decision | Long-running orchestration snapshots its tooling inputs | 64 | `TASK-404 - Drive must pin its own tooling (prompt envelope, resolved config) at run start.md` |
| 8 |  | decision | Terminal evidence overrides stale running state | 70 | `TASK-402 - Drive run status must reflect terminal events, not a stale record.md` |
| 9 |  | gotcha | Detached launcher exit is not run completion | 59 | `TASK-405 - Clean up detached Drive launcher output and the spurious --mode flag warning.md` |
| 10 |  | gotcha | Review scope must use the actual local integration base | 61 | `TASK-410 - Quality-manager diff against the local integration base and add a regression-semantics lens.md` |

<sub>path: `memory/agent/proposals/orchestration-hardening/`</sub>

## [ ] orchestration-surface-consolidation (12)

<sub>1 archived transcript(s) available; 0 record(s) cite one</sub>

| # | T | type | title | words | source |
|---:|:-:|---|---|---:|---|
| 1 |  | convention | Keep compatibility evidence opaque at the runtime boundary | 53 | `plan.md` |
| 2 |  | convention | Machine-oriented run commands reserve stdout for one JSON value | 51 | `plan.md` |
| 3 |  | convention | Resolve exact saved names before permissive expression syntax | 54 | `plan.md` |
| 4 |  | convention | Scheduler store wrappers may alter event writes only | 57 | `plan.md` |
| 5 |  | decision | Centralize graph-run initialization behind an adoption-safe seam | 64 | `plan.md` |
| 6 |  | decision | Keep frontend interruptions distinct from scheduler exits | 48 | `plan.md` |
| 7 |  | decision | Model a future compiler shape without migrating the hot path | 61 | `plan.md` |
| 8 |  | gotcha | Compatibility cursors belong to the projected event space | 54 | `plan.md` |
| 9 |  | gotcha | Dispatched subcommands may bypass top-level runtime bootstrap | 61 | `plan.md` |
| 10 |  | gotcha | Repair partial initialization without rewriting durable truth | 68 | `plan.md` |
| 11 |  | gotcha | Resume graphs from the authoritative original work set | 54 | `plan.md` |
| 12 |  | trade-off | Retain a scoped legacy fallback while normalized compatibility matures | 68 | `plan.md` |

<sub>path: `memory/agent/proposals/orchestration-surface-consolidation/`</sub>

## [ ] package-system (9)

<sub>0 archived transcript(s) available; 0 record(s) cite one</sub>

| # | T | type | title | words | source |
|---:|:-:|---|---|---:|---|
| 1 |  | convention | Order domain sources from stable baseline to ephemeral override | 40 | `missions/archive/plans/package-system/spec.md` |
| 2 |  | convention | Preserve ordered roots for merged domains | 49 | `missions/archive/plans/package-system/plan.md` |
| 3 |  | convention | 'Use own, portable, shared resource resolution tiers' | 50 | `missions/archive/plans/package-system/spec.md` |
| 4 |  | decision | Keep package discovery outside domain loading | 58 | `missions/archive/plans/package-system/plan.md` |
| 5 |  | decision | Merge duplicate domain IDs at the resource boundary | 59 | `missions/archive/plans/package-system/plan.md` |
| 6 |  | decision | Resolve domain resources through one runtime abstraction | 50 | `missions/archive/plans/package-system/plan.md` |
| 7 |  | decision | Treat shared as a special final fallback | 47 | `missions/archive/plans/package-system/plan.md` |
| 8 |  | decision | Validate package declarations before installation writes | 51 | `missions/archive/plans/package-system/plan.md` |
| 9 |  | trade-off | Separate persistent installs from session-only development inputs | 51 | `missions/archive/plans/package-system/plan.md` |

<sub>path: `memory/agent/proposals/package-system/`</sub>

## [ ] quality-contracts (7)

<sub>0 archived transcript(s) available; 0 record(s) cite one</sub>

| # | T | type | title | words | source |
|---:|:-:|---|---|---:|---|
| 1 |  | convention | Every quality criterion has an ID and verification owner | 54 | `missions/archive/plans/quality-contracts/plan.md` |
| 2 |  | convention | Non-manual contract criteria gate merge readiness | 36 | `missions/archive/plans/quality-contracts/plan.md` |
| 3 |  | convention | Quality criteria state observable outcomes | 38 | `missions/archive/plans/quality-contracts/plan.md` |
| 4 |  | decision | Contract failures enter normal remediation routing | 41 | `missions/archive/plans/quality-contracts/plan.md` |
| 5 |  | decision | Plan quality contracts augment baseline verification | 36 | `missions/archive/plans/quality-contracts/plan.md` |
| 6 |  | decision | Quality contracts live with the plan | 48 | `missions/archive/plans/quality-contracts/plan.md` |
| 7 |  | trade-off | Convention-based contracts avoid schema overhead | 40 | `missions/archive/plans/quality-contracts/plan.md` |

<sub>path: `memory/agent/proposals/quality-contracts/`</sub>

## [ ] roadmap-system (7)

<sub>0 archived transcript(s) available; 0 record(s) cite one</sub>

| # | T | type | title | words | source |
|---:|:-:|---|---|---:|---|
| 1 |  | convention | Roadmap location encodes item status | 59 | `missions/archive/plans/roadmap-system/plan.md` |
| 2 |  | convention | Size each roadmap item to one planning unit | 51 | `missions/archive/plans/roadmap-system/plan.md` |
| 3 |  | decision | Humans own priority; agents maintain lifecycle state | 55 | `missions/archive/plans/roadmap-system/plan.md` |
| 4 |  | decision | Keep in-flight work visible until archival completes | 70 | `missions/archive/plans/roadmap-system/plan.md` |
| 5 |  | decision | Separate architectural truth from directional truth | 43 | `missions/archive/plans/roadmap-system/plan.md` |
| 6 |  | decision | Use priority horizons instead of sequential phases | 62 | `missions/archive/plans/roadmap-system/plan.md` |
| 7 |  | trade-off | Start roadmap governance as a manual protocol | 68 | `missions/archive/plans/roadmap-system/plan.md` |

<sub>path: `memory/agent/proposals/roadmap-system/`</sub>

## [ ] ruby-rails-skills (9)

<sub>0 archived transcript(s) available; 0 record(s) cite one</sub>

| # | T | type | title | words | source |
|---:|:-:|---|---|---:|---|
| 1 |  | convention | Base-language guidance must remain framework-agnostic | 56 | `missions/archive/plans/ruby-rails-skills/spec.md` |
| 2 |  | convention | Public skill IDs are explicit and globally descriptive | 63 | `missions/archive/plans/ruby-rails-skills/spec.md` |
| 3 |  | convention | Reference documents are private assets of one parent skill | 68 | `missions/archive/plans/ruby-rails-skills/spec.md` |
| 4 |  | convention | Skill-pack QA must verify boundaries and navigation | 65 | `missions/archive/plans/ruby-rails-skills/spec.md` |
| 5 |  | decision | 'Canonical cross-domain guidance is linked, not duplicated' | 54 | `missions/archive/plans/ruby-rails-skills/plan.md` |
| 6 |  | decision | Nested content packs should reuse recursive discovery and export seams | 59 | `missions/archive/plans/ruby-rails-skills/plan.md` |
| 7 |  | decision | Redistribute source content when target boundaries change | 53 | `missions/archive/plans/ruby-rails-skills/spec.md` |
| 8 |  | decision | Repository detection belongs in foundational meta skills | 58 | `missions/archive/plans/ruby-rails-skills/plan.md` |
| 9 |  | trade-off | Prefer coherent skill granularity over an arbitrary task-count target | 55 | `missions/archive/plans/ruby-rails-skills/plan.md` |

<sub>path: `memory/agent/proposals/ruby-rails-skills/`</sub>


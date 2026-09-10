---
title: Later chain stages know what came before them
status: active
createdAt: '2026-09-09T18:36:28.733Z'
updatedAt: '2026-09-09T20:35:00.000Z'
---

## Overview

Fix repeated-role chain stages by deriving a narrow operational purpose from chain
topology. The first stage keeps the current user-request injection. A role that
repeats after an intervening reviewer receives a revision instruction instead of
its ordinary fresh-work default. In a plan-review cycle, the reviewer establishes
a run-local active-plan/round target, a revising stage may mark that exact target
addressed, and every downstream task-decomposition stage is runtime-gated on
addressed evidence from a strictly earlier topology position. Custom and parallel
topologies fail closed rather than racing past review.

For traceability only, this plan refers to the seven bullets under the spec's
`## Acceptance Criteria` in order as AC-001 through AC-007. These are local
aliases; `spec.md` remains authoritative. The spec deliberately has no
`## Intent` or ratified `INV-###` invariants. Its acceptance criteria and scope
exclusions remain ratified ground; every Decision Log entry below is derived.

### Authoritative spec assumptions (verbatim)

- **Stages already share the filesystem, and that is the context channel.** The
  plan directory holds `plan.md` and every `review-N.md`; the terminal planner can
  read them. What it lacks is being *told* it is in a revision pass. So this is a
  prompt-mode problem, not a context-plumbing problem — which is why passing
  stage output forward is out of scope. If that assumption is wrong, the slice
  grows and the plan should say so rather than quietly widen.
- **Step-0-only prompt injection is plausibly deliberate**, to avoid context bloat
  on long chains. The plan should ratify or reverse that explicitly rather than
  patch past it.
- **Position is enough to select the mode.** A planner preceded by a reviewer is
  revising. The agent can determine *which* round from the directory itself. If
  selecting the mode turns out to need artifact I/O inside what is currently a
  pure function, that is a design decision worth recording, not an implementation
  detail.
- There is **no existing review-round machinery** to build on: `lib/plans/` has
  no review-round concept, and `check-artifacts` lives at the CLI layer and checks
  behaviour markers. The signal is new machinery, and its home is a real choice.

## Architecture Context

- `missions/architecture/orchestration-future.md` is the forward source of truth.
  This plan introduces neither arbitrary prior-stage output transport nor another
  runtime; it adds chain-local purpose and machine evidence through existing
  orchestration surfaces.
- `missions/architecture/durable-orchestration-runtime.md` is the historical
  Wave-1/2 record. `lib/orchestration/durable-chain-compiler.ts` belongs to that
  lineage, so its compiled prompts and chain-local metadata must agree with the
  inline runner. Generic `runStart`, scheduler, event, and `StepResult` contracts
  are not widened.
- `ROADMAP.md` `factory-modes` owns a future user-selected layer in four-layer
  system-prompt assembly. This plan's topology-derived purpose remains an
  operational initial-user-message concern in `stage-prompts.ts`, not the first
  factory-mode implementation.
- `docs/prompts.md` confirms the four layers form the system prompt, whereas
  `buildStagePrompt` supplies a stage's initial user message.
- `external-commands/spec-to-backlog.md` runs `planner -> plan-reviewer` and has
  its external coordinator perform revision. It has no in-chain repeated reviser
  or downstream task-manager, so this feature leaves that flow unchanged.

## Decision Log

- **D-001 - Keep user-request injection on step 0 only**
  - Decision: `injectUserPrompt` continues to mutate only the first executable
    step. Later stages receive no copy of the request and no prior-stage prose;
    only bounded topology-derived instructions are added where required.
  - Alternatives: append the request to every stage (context bloat and existing
    behavior reversal); forward arbitrary prior output (out of scope and much
    larger); leave later prompts unchanged (preserves the defect).
  - Why: honors the filesystem-context and context-bloat assumptions while
    satisfying AC-001, AC-002, and AC-006.
  - Decided-by: derived

- **D-002 - Plumb explicit purpose with a zero-based topology index at both call sites**
  - Decision: derive a discriminated `StagePromptPurpose` from `(steps,
    topologyIndex, current stage)`, where `topologyIndex` is always the zero-based
    index in `steps`. Both prompt-building call sites explicitly construct
    `{ completionLabel, purpose }`. In the durable compiler, purpose is derived
    before computing the existing one-based persisted `stepIndex`; those names
    and values are never reused interchangeably. Do not stamp `ChainStage`.
  - Alternatives: stamp purpose onto the stage (mixes runtime context into DSL
    input); pass the whole chain to `buildStagePrompt` (widens the formatter);
    reuse durable `stepIndex` for topology derivation (off-by-one risk); rely on
    structural typing from whole `ChainConfig` (silently preserves call-site
    asymmetry).
  - Why: AC-003 requires identical positional behavior at both asymmetric call
    sites. Explicit units make first/middle/terminal parity reviewable.
  - Decided-by: derived

- **D-003 - Repetition uses resolved identity and strictly intervening review steps**
  - Decision: identify stages by
    `stage.agentReference?.resolved.qualifiedId ?? stage.name`. A repeated
    identity gets revision purpose only when an exact unqualified `reviewer` or
    a role ending in `-reviewer` occupies a strictly greater top-level index than
    the most recent prior same identity and a strictly smaller index than the
    current stage. Current-step siblings and a reviewer sharing the prior role's
    parallel step are unordered and do not count. Exact unqualified
    `plan-reviewer` selects plan specialization; other reviewers select generic
    revision.
  - Alternatives: hardcode the shipped triple (fails AC-002); unqualify authors
    (misclassifies `coding/planner` and `product/planner`); substring-match
    reviewer (misclassifies `reviewer-summary`); immediate-predecessor only
    (misses an intervening checkpoint); any historical reviewer (stale mode).
  - Why: covers shipped, prefixed, qualified, and custom ordered chains without
    changing unrelated identities or parallel siblings.
  - Decided-by: derived

- **D-004 - Halt rather than warn, and enforce again at task decomposition**
  - Decision: validate the plan target after a participating `plan-reviewer`,
    validate addressed evidence after a plan revision, and guard every
    `task-manager` at or after a participating `plan-reviewer`. A task-manager may
    spawn only when matching addressed evidence was produced at a strictly lower
    top-level topology index. Any missing, unaddressed, mismatched, unsafe,
    unreadable, or same-index state produces a typed
    `unaddressed_review_round` block, a nonempty stage error, an unsuccessful
    chain result, and zero task-manager agent spawns. Safe parallel siblings may
    finish, but the group and chain fail. No attended/unattended switch is added.
  - Alternatives: warning (knowingly decomposes unreviewed work); attended policy
    (no reliable signal); validate only the reviser (custom/no-reviser and
    parallel paths escape); accept same-index evidence based on scheduler order
    (turns declared concurrency into a race); ask task-manager to self-stop
    (runtime may still classify success).
  - Why: AC-004 is a task-decomposition-boundary promise. Runtime domination,
    not cooperative prompting or incidental execution order, prevents the defect.
  - Decided-by: derived

- **D-005 - Addressed is one bound active latest round with recorded blocking references**
  - Decision: a participating reviewer must end with exactly one last nonblank
    line `COSMO_PLAN_REVIEW: {"planSlug":"<slug>","reviewRound":<n>}`.
    If `resolvePlanSlug(config)` supplies an expected slug, the report must match;
    otherwise a valid reviewer report establishes the run-local target. The plan
    must exist and be `active`. A plan reviser must end with exactly one last
    nonblank line
    `COSMO_REVIEW_REVISION: {"planSlug":"<same>","reviewRound":<same>,"status":"addressed"}`
    or an `unaddressed` variant with reason. Addressed requires both reports to
    match, the claimed artifact to be the unique safe contiguous highest round,
    the latest report to parse structurally, and every high/medium `PR-###` to
    have an exact round-qualified reference in non-code text inside a parseable
    `D-###` Decision Log entry with a `Decision:` field. Low findings do not
    block. A valid no-high/medium round still needs explicit reports but no edit.
  - Alternatives: mtimes (wrong both ways); revision self-attestation alone
    (wrong/inactive plan can authorize); mandatory public slug (breaks plans
    created inside a chain and changes UX); any text occurrence (examples become
    evidence); all lows block (stricter than persona); literal plan diff required
    (wrong for rejection/no findings).
  - Why: binds reviewer and reviser without giving the latter prior prose and uses
    the shipped filename/citation convention rather than a second numbering
    scheme.
  - Decided-by: derived

- **D-006 - Review-round sequences fail closed on gaps, collisions, and unsafe entries**
  - Decision: recognize only regular, non-symlink `review.md` (legacy round 1)
    and regular, non-symlink `review-<positive integer>.md` **that carry a
    `## Findings` section**. A name-matching file with no findings section is
    another reviewer's artifact and is skipped entirely — it is neither a round
    nor `malformed-review`, and it does not create a gap. A file that has a
    findings section which will not parse is still `malformed-review`. A valid sequence has
    exactly one round-1 representation and every number through its maximum. A
    collision, gap, recognized-name symlink/directory, duplicate logical round,
    or report below the maximum is a typed block. In a historical `1,3` set, a
    lowest-free reviewer may create round 2, but round 2 cannot authorize
    continuation while round 3 remains highest; repair is explicit, never mtime
    or automatic renumbering.
  - Alternatives: permit gaps and select maximum (newly written lower round may
    be ignored); mtime latest (reverses shipped reader); auto-renumber (rewrites
    evidence/citations); treat every `review-<n>.md` as a plan-review round
    (`missions/archive/plans/living-memory-fidelity/` holds 17 `review-<n>.md`
    files written by other reviewers with no `PR-###` block — under that rule the
    highest round is permanently `malformed-review` and the gate can never pass
    for such a plan).
  - Why: safely reconciles the historical lowest-free allocator with the
    highest-numbered reader under malformed state.
  - Decided-by: derived

- **D-007 - Use chain-local reports/evidence; do not repurpose `behaviorsReviewPending`**
  - Decision: leave `Plan.behaviorsReviewPending`, serialization, and `plan_edit`
    unchanged. Add plan review assessment plus chain-local target/addressed/block
    reports. Inline state lives only for the non-resumable run; durable state uses
    existing normalized `run_activity` details. No plan pending field is added.
  - Alternatives: enforce the boolean (behavior-review-specific and not
    round-bound); broaden it (changes existing artifacts); add a numeric
    frontmatter watermark (duplicated mutable state).
  - Why: current plan/review files and chain-local machine evidence reconstruct
    truth; a fresh process never fabricates a default.
  - Decided-by: derived

- **D-008 - Keep revision purpose narrow; `factory-modes` owns the general layer later**
  - Decision: implement only plan-review/revision purposes in chain stage-prompt
    resolution. Do not alter four-layer system-prompt assembly, run
    configuration, or uncertainty policy. `factory-modes` may later absorb the
    vocabulary or seam, but this is not its first public mode contract.
  - Alternatives: build the roadmap layer now (widens a correctness thread into
    collaboration and uncertainty policy); postpone (leaves shipped chains
    unsafe); use the factory-mode name without integration (two meanings).
  - Why: this is an operational user-message contradiction; factory modes are a
    user-visible system-prompt layer.
  - Decided-by: derived

- **D-009 - Round-1 review amends identity, ordering, citation, and failure rules**
  - Decision: bind reviewer/reviser to expected-or-active identity; reject gaps
    and unsafe entries; share existing fenced/inline-code masking; compare
    resolved stage identities; make artifact-read failures typed blocks; and
    preserve durable block evidence across partial result persistence.
  - Alternatives: retain the original self-attested-slug, maximum-with-gaps,
    unqualified-role, unmasked-reference, and generic-I/O-failure design.
  - Why: addresses `review.md (round 1) PR-001`, `review.md (round 1) PR-002`,
    `review.md (round 1) PR-003`, `review.md (round 1) PR-004`, and
    `review.md (round 1) PR-005` without changing ratified acceptance/scope.
  - Decided-by: derived

- **D-010 - Round-2 review adds task-boundary domination and exact runtime contracts**
  - Decision: preserve the identity binding already added for
    `review-2.md PR-001`; use existing `run_activity` (present in
    `lib/durable-runtime/types.ts`) and add its chain-adapter consumer rather than
    adopting `step_tool_activity`; make every review block populate
    `StageResult.error`; guard sequential/parallel task-manager entry on matching
    addressed evidence from a strictly lower topology index; make a plan-reviewer
    with a same-or-later task-manager participate even when no repeated reviser
    exists; and distinguish zero-based `topologyIndex` from one-based persisted
    `stepIndex`.
  - Alternatives: `review-2.md PR-002` recommends `step_tool_activity`, but that
    is agent tool/session evidence while current generic code already exposes
    run-level `run_activity`; retaining reviser-only enforcement leaves
    `review-2.md PR-003`, `review-2.md PR-004`, and `review-2.md PR-005` open;
    accepting same-index proof leaves the parallel race; implicit index units
    preserve `review-2.md PR-006`.
  - Why: addresses `review-2.md PR-001`, rejects `review-2.md PR-002` on verified
    current-code evidence, and addresses `review-2.md PR-003`,
    `review-2.md PR-004`, `review-2.md PR-005`, and
    `review-2.md PR-006` without changing generic durable contracts.
  - Decided-by: derived

- **D-011 - A looping revision stage is gated once, after its final iteration** *(Added 2026-09-09 from the independent review channel)*
  - Decision: when a stage carrying plan-review revision purpose is declared with
    `loop: true`, the addressed-evidence check runs exactly once, after the final
    iteration. Intermediate iterations are never gated. The durable behaviors stay
    scoped to loop-free shapes; this rule governs the inline runner.
  - Alternatives: gate every iteration (a mid-loop block truncates work the loop
    exists to finish); force `loop: true` stages to default purpose (prompt and
    gate stay consistent, but a looping repeated planner silently loses the
    revision instruction — fail-open on the property this plan protects); leave it
    unspecified (the state table then claims a completeness it does not have).
  - Why: the design specifies validation after a one-shot spawn, and the durable
    behaviors are explicitly loop-free, so a looping revision stage fell outside
    every stated rule.
  - Decided-by: derived

- **D-012 - The two structural mitigations are bound, not left to reviewer judgement** *(Added 2026-09-09 from the independent review channel)*
  - Decision: the import-direction rule and the inline/durable prompt-parity rule
    become concrete assertions under the bound `correctness` gate rather than
    resting on the unbound `boundary-conformance` and `duplication` rows: a static
    assertion that the plan-side review-round module imports nothing from
    `../orchestration` or `../durable-runtime`, and an assertion that both paths
    produce byte-identical prompts for the same `(steps, zero-based index, stage)`
    triple.
  - Alternatives: leave both to the unbound rows (five of seven gates here are
    unbound, and this repo has a recorded history of shipping structural remedies
    unbound); bind `fallow` (blocked by `execution-not-consented`, and consenting
    to project-controlled execution is outside this slice).
  - Why: the two rules the design actually leans on should not be among the
    unenforced ones when each is a cheap, deterministic test.
  - Decided-by: derived

## Behaviors

### B-001 - Inline plan-review cycle receives distinct jobs

- Source: AC-001
- Context: inline `planner -> plan-reviewer -> planner` with an injected user request
- Action: all three stage prompts are resolved
- Expected: the first planner prompt is exactly today's default plus `User request:`; the reviewer adds only its terminal target-report contract; the terminal planner prompt differs, orders revision from the highest round rather than fresh design, and states its addressed-report contract
- Seam: `lib/orchestration/chain-runner.ts`
- Test: `tests/orchestration/chain-runner.test.ts` > `gives a plan-review cycle distinct jobs while preserving the first planner prompt`
- Marker: `@cosmo-behavior plan:chain-stage-context#B-001`

### B-002 - Purpose is identity-aware, strictly positional, and unit-safe

- Source: AC-002, AC-005
- Context: first/middle/terminal indices; prefixed/qualified chains; same/different resolved identities; exact, suffix, and substring reviewer names; same-step fan-out; and a prior parallel group containing author plus reviewer
- Action: purpose is derived with a zero-based topology index
- Expected: only the same resolved identity across a reviewer at a strictly intervening top-level index becomes revision; cross-domain same-name agents, lookalikes, and unordered siblings stay default; exact plan-reviewer selects plan specialization
- Seam: `lib/orchestration/stage-prompts.ts`
- Test: `tests/orchestration/chain-steps.test.ts` > `derives review purpose from resolved identity and zero-based strict topology order`
- Marker: `@cosmo-behavior plan:chain-stage-context#B-002`

### B-003 - Durable compilation matches inline prompts and index units

- Source: AC-003
- Context: the durable compiler receives the B-001 chain and injected request
- Action: it derives purpose before creating one-based persisted step metadata
- Expected: first/reviewer/reviser prompts equal inline strings; zero-based first/middle/terminal purpose selection is unchanged by one-based step IDs; purpose and expected plan identity live only in chain backend metadata
- Seam: `lib/orchestration/durable-chain-compiler.ts`
- Test: `tests/orchestration/chain-compiler.test.ts` > `compiles inline-equivalent purposes before converting to persisted step indexes`
- Marker: `@cosmo-behavior plan:chain-stage-context#B-003`

### B-004 - Unrelated prompts remain byte-identical

- Source: AC-002, AC-006
- Context: `implement`, `verify`, `adapt`, all single-stage roles including plan-reviewer, direct `runStage`, qualified non-repeats, and unordered groups
- Action: prompts resolve after the change
- Expected: every prompt is byte-identical to today; user prompt injection still changes only the first executable step
- Seam: `lib/orchestration/chain-steps.ts`
- Test: `tests/orchestration/chain-steps.test.ts` > `keeps non-cycle prompts and step-zero injection byte-identical`
- Marker: `@cosmo-behavior plan:chain-stage-context#B-004`

### B-005 - Artifacts yield one safe latest round and real references

- Source: AC-004
- Context: active/completed plans with legacy/numbered contiguous or gapped rounds, round-1 collision, symlink/non-file entries, I/O failure, malformed findings, quoted/fenced mentions, and complete/incomplete references
- Action: reviewer target or addressed claim is assessed
- Expected: only an active plan's unique regular contiguous highest round is eligible; every other state yields a typed reason; quoted/fenced mentions do not count; low-only/empty rounds require reports but no edit
- Seam: `lib/plans/review-rounds.ts`
- Test: `tests/plans/file-system.test.ts` > `derives a safe latest review round and ignores quoted or fenced references`
- Marker: `@cosmo-behavior plan:chain-stage-context#B-005`

### B-006 - Reviewer binds one active plan and round

- Source: AC-004
- Context: a participating reviewer with expected slug present/absent and reports that are missing, malformed, multiple, nonterminal, inactive, mismatched, unsafe, or valid
- Action: the reviewer stage's last nonblank line is validated
- Expected: expected identity must match; otherwise one valid active reviewer report establishes the run target; invalid states emit a typed block and stop; the reviser/task guard can use only that target
- Seam: `lib/orchestration/chain-runner.ts`
- Test: `tests/orchestration/chain-runner.test.ts` > `binds plan review to the expected or reviewer-established active target`
- Marker: `@cosmo-behavior plan:chain-stage-context#B-006`

### B-007 - Inline revision block makes the whole chain fail

- Source: AC-004
- Context: a bound target followed by missing/malformed/multiple/nonterminal/unaddressed/wrong/stale/unsafe/unreadable/incompletely referenced revision evidence
- Action: the revision stage is finalized
- Expected: the stage has `success:false`, typed block, and nonempty stable `error`; `ChainResult.success` is false, `errors` contains that error, the event is emitted, and no later sequential stage spawns
- Seam: `lib/orchestration/chain-runner.ts`
- Test: `tests/orchestration/chain-runner.test.ts` > `records a typed review block as an unsuccessful inline chain result`
- Marker: `@cosmo-behavior plan:chain-stage-context#B-007`

### B-008 - Task decomposition is dominated in sequential and parallel shapes

- Source: AC-004
- Context: `planner -> plan-reviewer -> task-manager`, `plan-reviewer -> planner -> task-manager`, `planner -> plan-reviewer -> [planner, task-manager]`, and a group containing plan-reviewer plus task-manager
- Action: task-manager reaches its runtime pre-spawn guard without matching addressed evidence from a strictly earlier topology index
- Expected: task-manager has zero agent spawn calls, emits a typed block, and makes its step/group/chain unsuccessful; same-index evidence never authorizes it regardless of sibling execution order
- Seam: `lib/orchestration/chain-runner.ts`
- Test: `tests/orchestration/chain-runner.test.ts` > `blocks sequential and parallel task decomposition until earlier plan review is addressed`
- Marker: `@cosmo-behavior plan:chain-stage-context#B-008`

### B-009 - Addressed inline review advances to task decomposition

- Source: AC-004
- Context: reviewer and revision reports name the same active safe highest round, every high/medium finding has a valid reference, and revision topology index is lower than task-manager's
- Action: revision finalizes and task-manager guard runs
- Expected: addressed evidence records its source index, no block event appears, and task-manager spawns; no-high/medium rounds follow this path with explicit reports and no fake edit
- Seam: `lib/orchestration/chain-runner.ts`
- Test: `tests/orchestration/chain-runner.test.ts` > `starts task decomposition only for earlier reviewer-bound addressed evidence`
- Marker: `@cosmo-behavior plan:chain-stage-context#B-009`

### B-010 - Durable target, addressed, and block evidence gate dependents

- Source: AC-003, AC-004
- Context: loop-free durable sequential and parallel review/task shapes, including either sibling scheduling order and interruption after activity evidence but before terminal step result persistence
- Action: chain backends validate reports and task-manager pre-spawn guard reconstructs evidence plus source topology index
- Expected: existing `run_activity` persists target/addressed/block details; task-manager starts only with matching addressed evidence from a lower topology index and satisfied dependencies; same-index and partial-persistence states cannot authorize it; adapter projects the typed block and unaddressed run ends blocked
- Seam: `lib/orchestration/durable-chain-runner.ts`
- Test: `tests/orchestration/run-start-chain-characterization.test.ts` > `gates durable task decomposition on earlier reviewer-bound addressed activity`
- Marker: `@cosmo-behavior plan:chain-stage-context#B-010`

### B-011 - CLI renders review halt visibly

- Source: AC-004
- Context: CLI event logger receives `unaddressed_review_round` with complete or partial identity
- Action: it formats the event
- Expected: stderr names the halt/reason, includes available slug/round, remains defined without identity, and preserves existing strings
- Seam: `cli/chain-event-logger.ts`
- Test: `tests/cli/chain-event-logger.test.ts` > `renders an unaddressed review-round event with available identity`
- Marker: `@cosmo-behavior plan:chain-stage-context#B-011`

### B-012 - Agent-tool progress renders review halt visibly

- Source: AC-004
- Context: chain progress receives the same typed block event
- Action: it renders a progress line
- Expected: the line says task decomposition was halted, includes available identity/reason, and remains defined when identity is absent
- Seam: `domains/shared/extensions/orchestration/rendering.ts`
- Test: `tests/extensions/orchestration-rendering.test.ts` > `renders an unaddressed review-round halt in chain progress`
- Marker: `@cosmo-behavior plan:chain-stage-context#B-012`

### B-013 - A looping revision stage is gated once, after its final iteration

- Source: AC-004
- Context: an inline stage carrying plan-review revision purpose declared with `loop: true`, whose final iteration reports the bound target addressed in one case and omits the report in another
- Action: the runner finalizes the looping stage
- Expected: the addressed-evidence check runs exactly once, after the final iteration; the addressed case authorizes a later task-manager and the omitted-report case emits the typed block with a nonempty stage error and an unsuccessful chain; no intermediate iteration is gated
- Seam: `lib/orchestration/chain-runner.ts`
- Test: `tests/orchestration/chain-runner.test.ts` > `gates a looping revision stage once after its final iteration`
- Marker: `@cosmo-behavior plan:chain-stage-context#B-013`

## Design

### 1. Pure topology selects bounded stage purposes (B-001 through B-004)

`lib/orchestration/stage-prompts.ts` owns purpose derivation and composition:

```ts
type StagePromptPurpose =
  | { kind: "default" }
  | { kind: "plan-review"; authorIdentity?: string }
  | { kind: "revision"; reviewKind: "generic" | "plan"; authorIdentity: string };

function deriveStagePromptPurpose(
  steps: readonly ChainStep[],
  topologyIndex: number, // always zero-based
  stage: ChainStage,
): StagePromptPurpose;
```

A plan-reviewer participates when it strictly intervenes before a repeated author
or when a task-manager exists at the same or a later top-level index. The latter
ensures review without a repeated reviser cannot silently precede decomposition.
A same-index task-manager is unsafe at runtime, but the reviewer still receives
the target-report contract so the block is diagnosable. Generic reviewers do not
create plan-review gate state.

`buildStagePrompt` preserves `resolveStagePrompt`, appends the bounded instruction,
then preserves the coordinator label suffix. Explicit prompt overrides cannot
remove selected safety instructions. Standalone stages remain default.

Inline derives purpose from `runChainStep`'s zero-based index. Durable
`compileChainToGraph` derives from the `forEach` index and only then computes
`persistedStepIndex = topologyIndex + 1`. Both pass the same narrow options; no
filesystem I/O selects purpose.

### 2. Two terminal reports bind target and addressability (B-005, B-006, B-009)

`lib/orchestration/review-revision.ts` parses full assistant text before summary
truncation. Each report must be the sole matching report and last nonblank line;
trailing prose is invalid. Unknown keys/status, malformed JSON, and
nonpositive/noninteger rounds block.

```ts
interface PlanReviewTarget { planSlug: string; reviewRound: number }

type ReviewCheck =
  | { status: "accepted"; target: PlanReviewTarget }
  | { status: "unaddressed"; block: ReviewRoundBlock };
```

Expected `resolvePlanSlug(config)` identity wins when available. Otherwise the
reviewer establishes fallback identity only after validating an active plan and
safe latest round. Revision must match the accepted target. It never receives the
reviewer's prose or report; it discovers files per the spec assumption.

### 3. Plan artifacts own round truth and shared citation masking (B-005)

Add `lib/plans/review-rounds.ts` for active-state validation, safe no-follow review
enumeration, structured finding parsing, and addressed assessment. Export its
focused contract from `lib/plans/index.ts` for future review-count consumers.

Valid names are one regular round-1 representation (`review.md` or
`review-1.md`) followed contiguously through the numeric maximum. Recognized
symlinks/non-files, collisions, gaps, stale claims, and I/O failures block.
Finding parsing is limited to `## Findings`; duplicate IDs, unknown severities,
and partial records are malformed.

Extract current fence/inline-code masking from
`lib/artifacts/behavior-conformance.ts` to internal
`lib/artifacts/markdown-scan.ts`, preserving current checker tests. Review
assessment uses the same masked lines. A high/medium citation counts only in
non-code text inside a `D-###` block with `Decision:`. This proves a syntactic
recorded reference, not the wisdom of the disposition.

### 4. Inline state and task-decomposition domination (B-006 through B-009)

The current non-resumable `ChainExecutionState` holds:

```ts
interface ActivePlanReview {
  target: PlanReviewTarget;
  addressedAtTopologyIndex?: number;
}
```

A newly accepted participating reviewer replaces prior state and clears
`addressedAtTopologyIndex`; a matching valid reviser records its zero-based index.
A task-manager is guarded when a plan-reviewer appears at or before its top-level
index. It may spawn only when state exists and
`addressedAtTopologyIndex < taskManagerTopologyIndex`. Therefore shipped
sequential cycles proceed; no-reviser chains block; and same-group task-manager
blocks whether the sibling reviser finishes before or after its guard. `implement`
has no plan-reviewer in topology and remains unchanged.

`ReviewRoundBlock` provides stable report, identity, ordering, activity, artifact,
round, parse, and reference reasons. `StageResult` carries the block plus a
nonempty formatted `error`; `ChainEvent` adds
`{ type:"unaddressed_review_round"; stage; block }`. Returning that error through
`ChainStepOutcome` makes `recordChainStepOutcome` populate final errors, so chain
success is false. A guarded task-manager never calls the spawner.

Inline cannot resume: a fresh process reruns review and cannot enter revision or
task decomposition with fabricated state.

### 5. Durable chain-local activity gates backend starts (B-003, B-010)

Compiled chain backend metadata persists purpose, zero-based topology index,
one-based display step index, expected slug, and whether task decomposition needs
proof. No generic type changes.

Current `lib/durable-runtime/types.ts` already includes
`OrchestrationEvent.type:"run_activity"`; use it for run-level chain evidence:

```ts
{ source: "chain", kind: "plan_review_target", target }
{ source: "chain", kind: "plan_review_addressed", target, topologyIndex }
{ source: "chain", kind: "unaddressed_review_round", role, block }
```

This is not `step_tool_activity`, which remains session/tool lifecycle evidence.
`lib/orchestration/chain-event-adapter.ts` validates/projects block activity. The
generic event union is unchanged.

Reviewer appends target activity before success. Valid revision appends addressed
activity with its topology index before success. A guarded task-manager reads
persisted events before invoking its spawner and requires the current target plus
matching addressed evidence whose topology index is strictly lower than its own.
Same-frontier/same-group task-manager therefore blocks in either scheduler order;
no dependency rewrite changes ordinary parallel semantics.

Unaddressed paths append block activity and return existing
`StepResult { outcome:"blocked", nextAction:"wait_for_human" }`. Step status is
scheduling authority. If interrupted after activity but before terminal result,
the unresolved predecessor cannot authorize dependents; activity remains
review-specific evidence even if recovery adds a generic diagnostic.

### 6. Human surfaces render the typed signal (B-011, B-012)

`cli/chain-event-logger.ts` and
`domains/shared/extensions/orchestration/rendering.ts` handle the new chain event.
Known slug/round is included; early failures without identity still render.
`docs/orchestration.md` documents purpose, both reports, fail-closed task guard,
safe topology, and correction-plus-rerun. No CLI surface changes.

### 7. Dependency direction and evidence

```text
inline runner / durable chain backend / renderers
  -> chain-local report + gate adapter
  -> plan review-round assessment
  -> shared markdown masking + existing plan files
```

Plan assessment imports no orchestration/runtime code; shared masking has no plan
semantics; generic durable runtime imports no review semantics. Both paths share
purpose/report/assessment logic.

Runtime analysis bindings were inspected. Cognitive complexity, duplication,
boundary-conformance, and symbol trace returned no evidence because provider
`fallow` is unbound with `execution-not-consented`. Direct reading plus
`review.md` and `review-2.md` supplied interface/state evidence. Missing analysis
is uncertainty, not a clean baseline; bindable gates remain degraded.

### 8. Complete state-space outcomes

| State | Outcome |
|---|---|
| default/generic revision | existing behavior; no plan gate |
| participating reviewer spawn fails | existing failure; later stages stop |
| reviewer report invalid/mismatched/inactive/unsafe | typed error block; later stages stop |
| reviewer report valid | target recorded; addressed index cleared |
| plan reviser fails | existing failure; task-manager stops |
| revision report/evidence invalid or wrong target | typed error block |
| revision valid | matching addressed source index recorded |
| task-manager with no earlier/same plan-reviewer | unchanged (`implement`) |
| guarded sequential task-manager, no addressed index | typed block before spawn |
| guarded task-manager, addressed index equal/greater | typed ordering block before spawn |
| guarded task-manager, matching lower addressed index and satisfied dependencies | spawn allowed |
| durable crash after activity but before result | unresolved step cannot authorize dependents; activity remains evidence |

## Files to Change

- **Test ↔ source (B-002, B-004):** `tests/orchestration/chain-steps.test.ts` ↔ `lib/orchestration/stage-prompts.ts`, with `lib/orchestration/chain-steps.ts` characterized unchanged.
- **Test ↔ source (B-001, B-006 through B-009):** `tests/orchestration/chain-runner.test.ts` ↔ `lib/orchestration/chain-runner.ts` and `lib/orchestration/types.ts`.
- **Test ↔ source (B-003):** `tests/orchestration/chain-compiler.test.ts` ↔ `lib/orchestration/durable-chain-compiler.ts`.
- **Test ↔ source (B-005):** `tests/plans/file-system.test.ts` ↔ `lib/plans/review-rounds.ts` (new) and `lib/plans/index.ts`.
- **Characterization/refactor supporting B-005:** `tests/artifacts/behavior-conformance.test.ts` ↔ `lib/artifacts/behavior-conformance.ts` and `lib/artifacts/markdown-scan.ts` (new).
- **Test ↔ source (B-006 through B-010):** `tests/orchestration/run-start-chain-characterization.test.ts` ↔ `lib/orchestration/review-revision.ts` (new) and `lib/orchestration/durable-chain-runner.ts`.
- **Test ↔ source (B-010):** `tests/orchestration/chain-event-adapter.test.ts` ↔ `lib/orchestration/chain-event-adapter.ts`.
- **Test ↔ source (B-011):** `tests/cli/chain-event-logger.test.ts` ↔ `cli/chain-event-logger.ts`.
- **Test ↔ source (B-012):** `tests/extensions/orchestration-rendering.test.ts` ↔ `domains/shared/extensions/orchestration/rendering.ts`.
- **Docs paired with B-001/B-008/B-010:** `docs/orchestration.md`.

Explicitly unchanged: both coding personas, `bundled/coding/chains.ts`, plan
frontmatter/types/tool surfaces including `behaviorsReviewPending`, four-layer
prompt assembly, `/spec-to-backlog`, and all generic `lib/durable-runtime/*`.

## Risks

- **Reports/references are syntactic evidence, not semantic judgment.** The gate
  proves one target and recorded blocking references, not decision quality.
- **Review-format drift can false-block.** Partial/duplicate findings are
  malformed, never an empty round. If real reports require heuristics, stop for a
  review-schema spec rather than weaken the gate.
- **Historical gaps cannot auto-heal safely.** A lower newly allocated round
  remains non-authoritative while a higher file exists; correction is explicit.
- **Fallback identity begins at the reviewer when no expected slug exists.** It
  must be active and remains fixed for the run. Stronger natural-language binding
  requires a separate explicit API, not prose parsing.
- **Inline state is in memory.** Inline chains cannot resume; a fresh process
  reruns review. Durable chains reconstruct from activity. Missing state never
  authorizes work.
- **Parallel task guards may fail after a safe sibling reviser finishes.** This is
  deliberate for same-index unsafe topology; rerun with task-manager later.
- **Durable activity/result writes are not atomic.** Activity precedes success or
  block; unresolved step status prevents dependency success after a crash.
- **Markdown masking extraction can regress conformance.** Characterize first and
  keep the helper limited to masking.
- **Filesystem attacks/read failures must be total.** Symlinks, non-files,
  permission errors, and races become typed blocks under a validated slug; no
  project-controlled code executes.
- **Structural-analysis evidence is absent.** Relevant bindings are unbound due
  `execution-not-consented`; reviewer judgment substitutes no fake verdict.
- **Scope expansion stop:** halt if correctness needs arbitrary prior prose,
  persona changes, a public CLI field, factory-mode system layer, project code
  execution, or generic durable contract changes.

## Quality Contract

Plan-specific criteria:

1. **Prompt/index parity:** inline and durable exact strings agree at
   first/middle/terminal positions while the first planner remains current.
2. **Negative topology/identity:** cross-domain same names, reviewer lookalikes,
   unordered siblings, non-review chains, and every single stage remain unchanged.
3. **Bound identity/artifacts:** expected/fallback identity, active status,
   terminal report grammar, safe contiguous rounds, real non-code references,
   unsafe entries, and I/O failures follow D-005/D-006.
4. **Task-boundary fail-closed:** sequential no-reviser and both scheduler orders
   for parallel review/revision task-manager shapes make zero task-manager spawns
   and return unsuccessful results with typed errors.
5. **Durable/visible evidence:** target/addressed-index/block activity gates
   backend starts, survives partial persistence without authorizing dependents,
   projects to chain events, and renders on CLI/tool surfaces.
6. **Boundary preservation:** no diff touches personas, named chains,
   `behaviorsReviewPending`, prompt assembly, `/spec-to-backlog`, `runStart`,
   scheduler, or generic durable types; no project code is executed.

| Order | Gate kind | Tier | Binding state | Threshold | Protocol | Degradation / notes |
|---:|---|---|---|---|---|---|
| 1 | `correctness` | universal | bound | B-001 through B-013 focused evidence and project-native full correctness/static checks pass; criteria 2-5 negatives are mandatory; D-012's two structural assertions (review-round import direction, inline/durable prompt parity) pass here rather than awaiting reviewer judgement | project-discovered | hard fail |
| 2 | `artifact-conformance` | universal | bound | Required behavior fields resolve and exact markers exist in named evidence files | artifact evidence | hard fail |
| 3 | `mutation` | bindable | unbound | Mutants erasing purpose, identity, index conversion, strict-lower task guard, error aggregation, round safety, masking, or durable proof fail tests | pending | unbound; reviewer inspects strength |
| 4 | `duplication` | bindable | unbound | One purpose, report, round, and masking implementation serves both paths | pending | unbound (`execution-not-consented`); reviewer judgment |
| 5 | `complexity` | bindable | unbound | Parsing/assessment stay outside runner/compiler control flow | pending | unbound (`execution-not-consented`); reviewer judgment |
| 6 | `boundary-conformance` | bindable | unbound | Plan logic imports no orchestration; shared masking has no plan semantics; generic runtime imports no review semantics | pending | unbound (`execution-not-consented`); reviewer judgment |
| 7 | `dead-code` | bindable | unbound | Every purpose/report/block/activity/event variant has producer and consumer evidence | pending | unbound (`execution-not-consented`); reviewer judgment |

## Implementation Order

1. **RED/GREEN/REFACTOR B-002/B-004:** add identity/index/order/parallel and
   byte-preservation tests; implement pure purpose derivation. Keep step-0
   injection unchanged.
2. **RED/GREEN/REFACTOR B-001/B-003:** test inline prompts; plumb zero-based
   purpose. Test durable strings/positions; derive before one-based conversion and
   persist chain-local metadata. Do not land one call site alone.
3. **Characterize then RED/GREEN/REFACTOR B-005:** pin existing markdown masking,
   extract unchanged, then test/implement active safe contiguous round/reference
   assessment including I/O/symlink failures.
4. **RED/GREEN/REFACTOR B-006:** test terminal reviewer grammar and
   expected/fallback active binding; implement report adapter and inline target
   state. Missing target blocks.
5. **RED/GREEN/REFACTOR B-007/B-009:** test invalid/valid revision evidence;
   implement typed error aggregation and addressed source-index transition.
6. **RED/GREEN/REFACTOR B-008:** add sequential/parallel custom topology tests;
   implement pre-spawn task-manager guard requiring strictly lower addressed
   index. Assert both sibling orders, stage/group/errors/final success, and zero
   task-manager spawns.
7. **RED/GREEN/REFACTOR B-010:** test durable target/addressed-index/block
   activity, strict-lower task guard, adapter projection, and interruption windows;
   implement with existing `run_activity` and blocked outcomes.
8. **RED/GREEN/REFACTOR B-011/B-012:** test/render CLI and tool progress; update
   docs with safe topology and rerun guidance.
9. **Integration:** run focused evidence, project-native full correctness,
   lint/static, type, and artifact-conformance checks; inspect forbidden files and
   record degraded analysis gates.

After each stage, apply the deviation classifier. If two bounded reports plus
artifacts cannot identify one active round, or enforcement needs excluded
persona/arbitrary-output/factory-mode/public-CLI/generic-runtime changes, stop
before production edits. Amend derived ground only when ratified scope survives;
otherwise escalate.

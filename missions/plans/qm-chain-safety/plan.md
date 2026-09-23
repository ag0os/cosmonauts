---
title: >-
  QM chain safety: a review-only Quality Manager that cannot damage what it
  reviews
status: active
createdAt: '2026-09-23T20:56:11.879Z'
updatedAt: '2026-09-23T22:18:01.261Z'
---

## Overview

This planned feature delivers the authoritative `spec.md` as twelve behavior
clusters, covering AC-001 through AC-016 without reopening any excluded
non-goal. The spec's `## Intent`, `## Scope`, excluded items, and `##
Assumptions` remain authoritative verbatim; this plan does not restate or amend
them.

The Quality Manager (QM) remains one outer assessment agent. It does not migrate
the panel to a declared graph, add a general mutable-worktree layer, cancel
timed-out children, change the 200-character summary, generalize persisted
attempt evidence, or introduce remediation. A QM-specific launch boundary takes
an independent detached snapshot, applies a host-owned restricted review
profile, captures reviewer output from correlated child completions, persists
QM-only evidence, and returns findings. Remediation remains a separate caller
action through tasks, Drive, and independent review.

This plan lands before `execution-liveness` (TASK-712..719, all To Do). It
preserves that spec's AC-015, AC-016, and AC-018: giving up a child wait does not
cancel the child; this slice persists only QM evidence; and `StepResult.summary`
remains the existing 200-character orientation value.

Implementation is blocked by D-010. Ratified AC-003 requires every tracked and
untracked checkout file to remain byte-identical, while AC-007 requires a new
tracked summary under that checkout on every exit. The design below keeps all
review-agent writes in a private snapshot and restricts the unavoidable source
writes to host-owned run evidence plus the exact plan summary, but a human must
amend one criterion before task creation or code.

## Architecture Context

This plan is subordinate to:

- `missions/architecture/orchestration-future.md` D-001, D-008, D-012 and its
  Boundary Model. It keeps one durable run/evidence substrate and treats bounded
  summaries as orientation, not the data plane.
- `missions/architecture/orchestration-future.md` Waves B and E. Wave B defers
  converting the QM panel into a declared graph. Wave E defers worktree
  isolation and merge finalizers for **parallel mutable execution**. This plan
  does neither: one terminal QM stage gets one disposable read-only-review
  snapshot, no snapshot content can merge back, and no mutable stages execute
  in parallel there.
- `missions/architecture/durable-orchestration-runtime.md` D-016 and its
  post-production worktree/merge-finalizer boundary. Existing
  `WorktreeSpec.mode: "isolated"` remains vocabulary only. QM isolation is a
  precondition of the volatile review edge, not a general scheduler policy.
- `missions/plans/execution-liveness/spec.md` and `plan.md`. No child is
  cancelled because a wait timed out (AC-015). Reviewer and final-report
  artifacts are scoped to QM and do not implement the later general
  attempt-evidence contract (AC-016). The stage summary stays byte-for-byte
  within the existing 200-character contract (AC-018).

Dependency direction:

- CLI and registered orchestration tools depend on a framework-owned QM launch
  policy and orchestration composition.
- Snapshot, check execution, report persistence, and model attestation depend on
  injected Git/filesystem/process/Pi ports; they do not import coding prompts.
- The durable runtime remains unaware of QM personas and Git snapshot mechanics.
  It carries existing `ArtifactRef` values returned by the QM stage.
- Coding-domain definitions and prompts consume a restricted execution profile
  and final-text contract; they do not choose host paths, storage roots, run
  identity, or producer attribution.

Pi-First findings:

- Pinned Pi 0.80.6 already accepts a per-session `cwd`, tool allowlist, extension
  set, and model override through `createAgentSession`; the design composes
  those capabilities rather than adding a session runtime or provider.
- Pi's `ModelRegistry` supplies the resolved provider/model object. The session
  factory must return that host-observed identity with the session so a reviewer
  cannot self-report which model ran.
- Pi completion tracking already retains a child's full assistant text together
  with its `spawnId` and session lifecycle. The host persists that correlated
  text; reviewers receive no host artifact path.
- Pi does not create a stable Git snapshot, enforce Cosmonauts authority across
  all launch surfaces, maintain run-owned QM lifecycle state, or define a model
  family. Those remain narrow Cosmonauts responsibilities.
- OS sandboxing and a generic `tool_call` write guard remain excluded. Instead,
  the QM and its panel receive no arbitrary shell/edit/write tools at all; exact
  project checks execute through a host-owned configured check list in the
  private snapshot.

Investigation evidence gathered before design:

- Complexity analysis found pre-existing debt at the touched seams:
  `executeChainStep` in `lib/orchestration/durable-chain-runner.ts` is a
  high-severity CRAP finding, `capabilityArgs` in the Fallow provider is a
  moderate finding, and the durable controller's event summarizer is critical.
  QM policy therefore lives in focused modules and is called from those seams;
  it does not add another policy tree inline.
- Duplication analysis produced no usable evidence: the provider exited 0 while
  its normalized envelope contained 92 findings. This is uncertainty, not a
  clean baseline.
- Boundary conformance is unbound (`provider-not-configured`). Dependency
  direction therefore requires independent review.
- Trace evidence confirms the chain tool, spawn tool, agent spawner, durable
  chain runner, Fallow provider, and durable runtime contracts are reachable.
  `WorktreeSpec` has no implementation consumer, supporting D-003.
- The architecture map is unavailable because `memory/architecture/index.md`
  is absent. The two architecture records above remain the source of truth.
- The investigation was moved from its stale `work/todo` citation to
  `.shepherd/work/in-progress/qm-chain-safety/investigation.md`; D-001 remains
  verbatim, while current readers use the moved path.

## Decision Log

- **D-001 - Eight decisions from the qm-chain-safety investigation**
  - Decision: accepted as recommended in `.shepherd/work/todo/qm-chain-safety/investigation.md` §5:
    1. The QM is review-only. Remediation goes through tasks, Drive and independent review.
    2. Full reports go to run-scoped artifacts, with a tracked plan-scoped summary on every exit. The shared `missions/reviews/*-round-N.md` files are retired to an archive.
    3. Isolation is a detached worktree now, with runner support after it. An OS sandbox is deferred.
    4. Changed-scope gates fail only on introduced findings, using the committed baselines. The doc conflict between `docs/fallow-exceptions.md` and `analysis-debt-paydown` gets resolved.
    5. A new suppression directive needs an exception-registry entry, and only a human adds one.
    6. A performance P1 needs a measured or reproduced cost. A lens is never the only judge that closes its own finding.
    7. The final review includes a reviewer on a different model family from the implementer.
    8. `chain_run` enforces the caller's `subagents` allowlist.
  - Alternatives: the incident report's ranked recommendations as written (a pure-code triage filter, protected-test replay, an edit-range diff gate), rejected for the reasons in `investigation.md` §2. Keeping QM remediation behind added gates was also rejected: on 2026-09-23 only 1 of 6 fixer runs was clean.
  - Why: INV-001..INV-005 (spec `## Intent`).
  - Decided by: human, 2026-09-23 (relayed by Shepherd)

- **D-002 - This plan is not verified by the Quality Manager**
  - Decision: where `/implement-plan` calls the QM, substitute an independent review on a different model from the implementer: a Claude subagent reviewer plus `codex exec -m gpt-6-sol -c model_reasoning_effort=high --sandbox read-only`, framed as correctness/liveness. Implementation workers run on codex `gpt-6-sol` at medium effort.
  - Alternatives: run the QM as `/implement-plan` normally does (rejected: the QM is the thing being fixed, and today it can mutate the tree it reviews).
  - Why: INV-001. A verifier that can damage the work cannot certify the fix for that damage.
  - Decided by: human, 2026-09-23 (relayed by Shepherd, coordinator brief)

- **D-003 - Keep QM isolation at a trusted review launch surface**
  - Decision: leave `WorktreeSpec.mode: "isolated"` unimplemented. A
    framework-owned, data-only launch policy identifies the canonical built-in
    QM and QM-ending built-in chains before executable project/domain modules are
    loaded for a standalone review. A terminal QM reached after ordinary prefix
    stages is isolated at that stage boundary. Unclassified aliases that resolve
    to the canonical QM only after executable loading are refused rather than
    launched unsafely. If delivery requires scheduler-owned general worktrees, a
    merge finalizer, panel graph migration, or mutable parallel execution, halt
    and escalate.
  - Alternatives: activate the runtime's generic `WorktreeSpec` slot (rejected
    because it crosses Wave E and execution-liveness store/launch work); trust an
    `AgentDefinition` loaded from the reviewed checkout to select isolation
    (rejected by `review-1.md PR-002`); instructions only (rejected by INV-001).
  - Why: INV-001 outranks availability. This is distinct from Wave E because the
    snapshot has no merge path and runs only a review stage.
  - Decided by: planner-proposed, 2026-09-23 (revised for `review-1.md PR-002`)

- **D-004 - Snapshot into an independent detached checkout**
  - Decision: create a no-hardlink private local clone in an OS temporary
    directory, detach at the captured HEAD, remove its origin, and overlay a
    byte-for-byte manifest of tracked and non-ignored untracked state. Sample
    HEAD, refs, index, paths, modes, symlink targets, and bytes twice; retry a
    bounded number of times and otherwise refuse. Absolute or root-escaping
    symlinks, sparse layouts, and unreproducible gitlinks/submodules fail closed.
    The private checkout has no symlink, mount, alternate object store, or
    exposed path back to the operator checkout or host run store.
  - Alternatives: linked `git worktree` (rejected because common Git metadata is
    shared); source-repository snapshot commit (rejected because it writes the
    source object database); plain directory copy (rejected because review Git
    history/diffs would disappear).
  - Why: AC-003/AC-004 require uncommitted content without sharing source state.
  - Decided by: planner-proposed, 2026-09-23 (revised for `review-1.md PR-001`)

- **D-005 - A configured generalist carries host-attested model diversity**
  - Decision: the always-present general `reviewer` uses
    `qualityReview.diverseReviewerModel`. Project config also maps exact,
    Pi-resolved model IDs to opaque family IDs. The default built-in worker model
    and configured reviewer model must each belong to exactly one different
    family. Session creation returns the actual resolved provider/model identity;
    the host records it with reviewer evidence and refuses unknown, overlapping,
    same-family, unavailable, or substituted identities. This repository maps a
    Claude-family reviewer; no shipped agent definition names a provider.
  - Alternatives: infer family from provider/name strings (rejected because
    aliases such as `openai`/`openai-codex` are not a family contract); trust
    reviewer markdown (rejected by `review-1.md PR-005`); assign diversity to a
    conditional specialist (rejected because it may not run).
  - Why: INV-003 and AC-014 require a durable fact, not a self-report.
  - Decided by: planner-proposed, 2026-09-23 (revised for `review-1.md PR-005`)

- **D-006 - Exact QM report paths are run-owned and host-only**
  - Decision: full artifacts live under
    `missions/sessions/chain/runs/<runId>/artifacts/qm/`: `lifecycle.jsonl`,
    `checks.md`, `final.md`, optional `raw-final.md`, and one immutable
    `reviewers/<lens>.md` for each actual panel member. An active plan gets
    `missions/plans/<planSlug>/qm-runs/<runId>.md`. Only host code writes these
    paths. `final.md` and the plan summary are initialized with a conservative
    complete failure/interruption record, then atomically replaced by the host
    before the QM step returns; reviewer files are exclusive-created and never
    replaced. No path is supplied to an agent.
  - Alternatives: agent-written paths or a linked artifact directory (rejected
    by `review-1.md PR-001/PR-004`); tracked full reports under
    `missions/reviews/qm` (rejected by human decision 2); one mutable plan
    summary (rejected because runs would overwrite history).
  - Why: INV-002, INV-003, AC-005 through AC-007.
  - Decided by: planner-proposed, 2026-09-23 (revised for review round 1)

- **D-007 - Assessment outcome and execution outcome stay distinct**
  - Decision: `ready` and `not-ready` are completed assessments; `refused`
    blocks the run; execution/report-integrity failure fails it; caller
    cancellation cancels it. The QM-specific executor finalizes the complete
    report before returning its `StepResult`, so the scheduler cannot write the
    first terminal run event first. The bounded stage summary remains unchanged.
  - Alternatives: make negative findings an execution failure (rejected because
    the assessment completed); encode the verdict in the bounded summary
    (rejected by AC-007 and execution-liveness AC-018).
  - Why: INV-003 and AC-006 through AC-009.
  - Decided by: planner-proposed, 2026-09-23

- **D-008 - Bootstrap and then consume all three committed Fallow baselines**
  - Decision: before enabling mandatory baseline arguments, explicitly generate
    `.fallow-baselines/duplication.json` from the recorded clean comparison base,
    without implementation changes present, and record the command-equivalent
    provider request, reason, base SHA, timestamp, provider version, and digests
    for all three files in `.fallow-baselines/manifest.json`. Thereafter ordinary
    changed-scope audit always passes dead-code, health, and duplication
    baselines and never creates or rewrites them. Refresh remains a separate,
    reason-required action.
  - Alternatives: require the currently missing file and break every audit
    (rejected by `review-1.md PR-008`); leave duplication unbaselined (rejected
    because inherited duplicate findings could fail touched files); silently
    generate during review (rejected by INV-005).
  - Why: INV-005 and AC-010 require an explicit, non-self-refreshing baseline.
  - Decided by: planner-proposed, 2026-09-23 (revised for `review-1.md PR-008`)

- **D-009 - Suppression authorization comes only from the comparison base**
  - Decision: maintain a machine-readable exception registry keyed by directive
    family, path, and normalized directive/target fingerprint. Authorization is
    loaded from the explicit comparison base; a registry edit in the reviewed
    change cannot authorize that same change. A human first lands a separate,
    reasoned registry update. Existing unchanged or relocated registered
    directives remain unaffected.
  - Alternatives: trust same-change registry edits (self-authorization); parse
    prose as machine policy; or ban every directive forever. All are rejected.
  - Why: INV-005 and AC-011.
  - Decided by: planner-proposed, 2026-09-23

- **D-010 - Halt and escalate: checkout byte identity conflicts with a tracked summary**
  - Decision: implementation is blocked pending a human ruling. AC-003 says the
    checkout's tracked and untracked files are byte-identical after a QM run;
    AC-007 and human D-001 item 2 require a newly written tracked summary under
    that checkout's plan directory on every exit. Host-owned run artifacts under
    the checkout also change ignored bytes. No implementation can make both
    statements literally true in one checkout.
  - Alternatives: (A, planner recommendation) amend AC-003 to exempt only
    host-owned run artifacts and the exact per-run plan summary while keeping
    every reviewed input, HEAD, ref, index entry, and all other files
    byte-identical; agents receive no path to either exception; (B) keep AC-003
    literal and amend AC-007/D-001 item 2 so all evidence lives outside the
    checkout and is untracked; (C) write/commit through another worktree or ref
    (rejected because it still changes a ref or does not place the tracked file
    in the operator checkout).
  - Why: INV-001 protects reviewed state while INV-003 requires durable output;
    `review-1.md PR-009` confirms the unresolved ratified collision.
  - Decided by: planner-proposed halt-and-escalate draft, 2026-09-23

- **D-011 - Reviewer evidence is captured from host-observed completions**
  - Decision: when a quality-profile parent starts a panel member through
    `spawn_agent` or nested `chain_run`, the host correlates requested lens,
    `spawnId`, child session ID, resolved role, actual model, completion outcome,
    and full assistant text. It persists the exact final text before delivering
    the completion to the QM. A missing/duplicate/foreign child, empty final
    output, or persistence failure fails the assessment. The QM cannot mint or
    satisfy producer evidence.
  - Alternatives: bearer producer tokens and agent-written files (rejected as
    forgeable); generic persistence of every durable stage (rejected by the
    execution-liveness non-goal and `review-1.md PR-007`).
  - Why: AC-005/AC-006 and INV-002.
  - Decided by: planner-proposed, 2026-09-23 (addresses `review-1.md PR-004` and
    `PR-007`)

- **D-012 - The review profile removes arbitrary process and write authority**
  - Decision: QM and panel sessions receive a host-owned effective tool profile,
    regardless of their ordinary definitions: read-only filesystem discovery,
    analysis capabilities needed by the QM, and authorized orchestration only.
    They receive no `bash`, edit, or write tool. Project checks are exact argv
    entries from validated project config, run by host code inside the private
    checkout with output captured as evidence. The model cannot submit or alter
    a command. The QM's subagents are only the four reviewer lenses; verifier,
    fixer, coordinator, worker, and integration-verifier are absent.
  - Alternatives: retain Pi's `verification` set (rejected because it includes
    unrestricted bash); rely only on registered-tool allowlists while shell can
    launch the top-level CLI (rejected by `review-1.md PR-003`); add an OS
    sandbox (still deferred by the spec).
  - Why: INV-001/INV-004 and AC-001/AC-002/AC-009.
  - Decided by: planner-proposed, 2026-09-23 (addresses `review-1.md PR-003`)

- **D-013 - QM finalization state is persisted before assessment starts**
  - Decision: after run allocation and before snapshot/check/model work, host
    code creates `lifecycle.jsonl`, a conservative complete `final.md`, and, when
    applicable, the per-run plan summary. Lifecycle records every phase,
    workspace path/owner, child start/settlement, artifact digest, and final
    disposition. The QM executor reads this record on retry and never fabricates
    defaults; it finalizes atomically before returning a step result. A timed-out
    live child leaves the workspace retained. A later QM startup/cleanup pass
    deletes it only after persisted settlement or proof that the owning process
    no longer exists.
  - Alternatives: process-local maps or post-terminal callbacks (rejected by
    `review-1.md PR-006`); mutate state from `run_status` (rejected because
    observation remains read-only); generic durable finalizers (rejected by the
    architecture boundary).
  - Why: INV-003 and AC-007 require crash/restart reconstruction without
    depending on future execution-liveness work.
  - Decided by: planner-proposed, 2026-09-23 (addresses `review-1.md PR-006`)

- **D-014 - Canonical plan shape wins over requested executable coupling**
  - Decision: behavior entries retain source AC, observer, entry point, context,
    action, result, and conceptual seam, but no test titles or
    `@cosmo-behavior` markers. There is no separate quality/gate section.
    Work-specific failure outcomes live in behaviors and pivot conditions live
    in risks. Actual capability observations remain investigation evidence, not
    declared sign-off bindings. D-002 stays verbatim because it is human ground.
  - Alternatives: retain test/marker coupling and a separate sign-off checklist
    (rejected by the current artifact contract and `review-1.md PR-010/PR-011`).
  - Why: archived plans must not remain executable authority over live tests.
  - Decided by: planner-proposed, 2026-09-23

- **D-015 - The moved investigation is the current readable evidence path**
  - Decision: preserve D-001 and the authoritative spec verbatim, including
    their historical `work/todo` citation, while all new design prose points to
    `.shepherd/work/in-progress/qm-chain-safety/investigation.md`.
  - Alternatives: rewrite D-001 or spec provenance (rejected because both are
    ratified); leave every current pointer stale (rejected by
    `review-1.md PR-012`).
  - Why: workers need readable evidence without altering human decisions.
  - Decided by: planner-proposed, 2026-09-23

## Behaviors

### B-001 - Every agent-starting route enforces caller authority

- Source: AC-001, AC-002
- Observer: an agent using an orchestration tool, and a lead or operator using an
  allowed route
- Entry point: `spawn_agent`, `chain_run`, `run_driver`, and a QM review profile
- Context: the caller requests allowed or forbidden sequential, bracket,
  fan-out, Drive, or shell-equivalent delegation
- Action: the request reaches launch admission
- Expected result: every forbidden registered target is refused before a run or
  child is allocated, with caller and target named; QM and panel sessions have no
  arbitrary process tool with which to bypass admission; a QM cannot start
  fixer, coordinator, worker, verifier, or integration-verifier; listed leads
  and genuine top-level CLI invocations retain their behavior
- Seam: shared orchestration authorization plus host-owned effective tool profile

### B-002 - QM reviews a stable private snapshot or refuses

- Source: AC-003, AC-004
- Observer: an operator with staged, unstaged, deleted, and untracked work
- Entry point: standalone QM, direct QM spawn, or the terminal QM stage of a
  named/raw chain
- Context: the operator may keep using the checkout; a standalone review has not
  yet loaded executable project/domain code, while a terminal review samples
  state at its stage boundary
- Action: trusted launch admission captures and materializes the review state
- Expected result: the review sees the captured uncommitted state; no review
  session has a link or path supplied back to source or host evidence; all
  reviewed inputs, Git metadata, and non-exempt source bytes remain identical;
  unsupported layout, unsafe symlink, unstable capture, unclassified QM alias,
  or setup failure produces a named persisted refusal and never falls back to
  the shared checkout. The exact host-output exception remains subject to D-010
- Seam: data-only launch classification and private detached checkout

### B-003 - Reviewer evidence belongs to the observed child and run

- Source: AC-005, AC-006
- Observer: a QM synthesizing its panel and an operator comparing concurrent runs
- Entry point: host-captured reviewer artifacts and the final QM report
- Context: reviews overlap, a child exits silently, a role runs twice, a child
  reports a foreign run, or persistence fails
- Action: the host settles each panel child and the QM attempts synthesis
- Expected result: each immutable reviewer artifact is correlated to this run's
  lens, spawn, session, role, actual model, full final output, and digest; no
  shared round path is written; missing, duplicate, foreign, empty, or
  unpersisted output fails the assessment and stale content is never substituted
- Seam: quality-profile child completion sink

### B-004 - A complete durable verdict precedes every terminal outcome

- Source: AC-007
- Observer: an operator after ready, not-ready, failed, refused, cancelled,
  interrupted, or restarted execution
- Entry point: run record, `run status`/`run_status`, full QM artifact, and an
  active plan's per-run summary
- Context: failure can occur before snapshot, during checks/panel work, while a
  child remains alive, or during final persistence
- Action: the QM-specific executor advances its persisted lifecycle and returns
  a step result
- Expected result: a complete conservative report and applicable plan summary
  exist before fallible work; the host atomically finalizes them before the
  scheduler can terminalize; a fresh process reconstructs phase, artifacts,
  child settlement, and workspace retention from persisted records; status
  points to the full report; the existing stage summary remains the same bounded
  200-character value
- Seam: pre-terminal QM lifecycle protocol and existing `ArtifactRef` result

### B-005 - A QM report is actionable without transcript recovery

- Source: AC-008
- Observer: a coordinator or human triaging findings
- Entry point: the full QM artifact and plan-summary link
- Context: checks pass, fail, or cannot run; reviewers return findings,
  pre-existing/out-of-range observations, or decision-needed items
- Action: the operator opens the report
- Expected result: it contains the verdict; checks and gate evidence; every
  finding's id, priority, severity, file:line, suggested fix, and concrete
  failing input where one exists; separate human-decision items; marked
  pre-existing/out-of-range observations; host-attested reviewer models; and a
  positive statement of what was checked
- Seam: validated quality-report contract

### B-006 - QM performs one assessment and no remediation

- Source: AC-009, AC-016
- Observer: an operator inspecting tasks, plan state, Git history, check evidence,
  and the final report
- Entry point: QM-ending chains and direct QM review
- Context: configured project checks or reviewers find blocking and non-blocking
  defects
- Action: host checks run once and the QM completes Setup → Assess → Report
- Expected result: configured project checks, direct gate resolution, panel
  triage, and applicable specialists still run; the QM creates no task, starts
  no implementation/verifier role, commits nothing, changes no plan status, and
  performs no remediation/re-review round; it returns findings and caller-owned
  remediation advice
- Seam: restricted QM profile and authored one-pass workflow

### B-007 - Changed-scope analysis distinguishes inherited and introduced debt

- Source: AC-010
- Observer: an implementer touching a file with committed baseline findings
- Entry point: changed-scope analysis through the registered audit capability
- Context: the explicit duplication baseline has been bootstrapped from the
  recorded clean base; one change preserves debt and another introduces an
  equivalent finding
- Action: audit resolves the change against that base and all committed
  per-analysis baselines
- Expected result: inherited findings do not fail their category, introduced
  findings do, ordinary review never rewrites a baseline, and missing/unreadable
  baselines fail visibly; an explicit refresh records base, reason, provider
  version, timestamp, and resulting digests
- Seam: Fallow adapter and baseline provenance manifest

### B-008 - A change cannot self-authorize a new suppression

- Source: AC-011
- Observer: an implementer or reviewer adding a suppression directive
- Entry point: the project-native suppression check against an explicit base
- Context: the diff adds a named/configured-equivalent directive, optionally
  beside a registry edit
- Action: suppression policy evaluates added lines
- Expected result: an unregistered directive fails; a same-change registry edit
  cannot clear it; a directive authorized in the base registry passes; unchanged
  existing directives remain unaffected
- Seam: pure base-owned exception policy and project check adapter

### B-009 - Baseline and debt documentation agrees

- Source: AC-012
- Observer: a maintainer preparing baseline maintenance or debt paydown
- Entry point: Fallow exception documentation, the roadmap debt item, and the
  committed baseline manifest
- Context: dead-code, health, and bootstrapped duplication state are recorded
- Action: the maintainer compares the three surfaces
- Expected result: they describe the same baseline files, current debt/threshold
  state, suppression registry, and explicit reasoned refresh process
- Seam: tracked policy and provenance records

### B-010 - Specialist severity and closure require independent evidence

- Source: AC-013
- Observer: a coordinator triaging specialist findings
- Entry point: panel reports and final QM report
- Context: a performance concern is speculative or measured, and a specialist
  considers its prior finding closed/dismissible
- Action: the panel assigns priority and the QM synthesizes disposition
- Expected result: performance P1 requires measured or reproduced cost;
  otherwise it is at most P2; no specialist lens is the only evidence used to
  close or dismiss its own finding
- Seam: reviewer guidance and final-report validation

### B-011 - Every completed panel has host-attested model-family diversity

- Source: AC-014
- Observer: an operator reading a completed or refused QM record
- Entry point: configured QM launch and host-captured reviewer metadata
- Context: worker/reviewer models resolve to different, same, unknown,
  overlapping, unavailable, or substituted family identities
- Action: the host creates and settles the general reviewer
- Expected result: completion requires one actual different-family generalist;
  every actual reviewer model is recorded; every invalid/same-family/unavailable
  cell refuses or fails visibly rather than falling back
- Seam: validated family map and session-factory model attestation

### B-012 - Legacy evidence is archived and callers remain coherent

- Source: AC-015, AC-016
- Observer: an operator using named chains/docs and a maintainer following history
- Entry point: chain registry, lead/dispatch/spawning guidance, orchestration
  docs, external implementation flow, and review archive
- Context: eleven shared round files and their tracked references exist
- Action: migration moves those records and updates callers
- Expected result: all eleven have one archive home with Git history reachable;
  no old-path link remains; direct checks, gate resolution, triage, specialists,
  and QM-ending chains work under the review-only contract; callers route
  remediation to tasks/Drive/independent review and never claim QM fixes or
  completes plans
- Seam: shipped chain/caller surface and tracked archive

## Design

### 1. Authority and restricted execution profile

Keep `isSubagentAllowed` as the single role predicate and place shared target
resolution/denial facts beside it. `chain_run` authorizes every resolved
sequential, bracket, and fan-out member before allocating a run. `run_driver`
treats every backend as worker authority and checks before task discovery or run
ID allocation. `spawn_agent` retains its existing check. Unknown caller/target
and internal-domain visibility fail closed; genuine top-level CLI paths remain
unchanged.

Add an internal, host-created session profile, never a model parameter:

```ts
interface QualityReviewSessionProfile {
  readonly run: { readonly scope: "chain"; readonly runId: string };
  readonly workspaceRoot: string;
  readonly planSlug?: string;
  readonly allowedPanelRoles: readonly ReviewLens[];
  readonly evidenceSinkId: string;
  readonly diverseReviewerModel: string;
}
```

The profile narrows effective Pi tools for the QM and all panel children to
read/grep/find/ls. Only the QM additionally receives analysis capability tools
and the already-authorized orchestration extension. No quality-profile session
receives bash, edit, write, task/plan mutation, Drive, or unrestricted coding
tools. Nested `spawn_agent` and `chain_run` propagate the host profile; absence
or mismatch refuses the child. Quality correctness never defaults from an empty
in-memory map: `evidenceSinkId` resolves a persisted run lifecycle record, and a
missing mapping or record fails the run.

Project checks are configured as validated argv arrays, for example:

```ts
interface QualityReviewCheck {
  readonly id: string;
  readonly command: string;
  readonly args: readonly string[];
}
```

Host code runs exactly those entries, without shell interpolation, in the
private checkout after operator consent, and writes combined evidence to
`checks.md`. The model cannot add a command. This repository configures its
existing test, lint, and typecheck surfaces. Project-controlled scripts are a
trust boundary, but execute only in the disposable checkout.

### 2. Trusted launch admission and private snapshot

Add a framework-shipped, data-only QM launch policy naming the canonical
qualified role, terminal-only topology rule, and built-in QM-ending chain names.
A small preflight reader can inspect raw CLI/tool requests and project JSON chain
overrides without importing `domain.ts`, agent modules, or `chains.ts`.

- Standalone canonical QM and the built-in standalone verify chain snapshot
  before runtime bootstrap; runtime/domain/agent code is then loaded inside the
  clone.
- A terminal QM after ordinary prefix stages snapshots at the stage boundary;
  the existing chain keeps one durable run ID and the QM stage uses the private
  `cwd`.
- An inline chain containing QM is forced through the durable runner so a run
  identity and artifact root exist before assessment.
- Direct `spawn_agent` of canonical QM creates a one-step durable run while
  preserving accepted/completion messages.
- An isolated stage in a parallel group or before a later stage is refused.
- A custom executable alias discovered only after unsafe bootstrap is refused as
  an unsupported QM entry; there is no shared-cwd fallback.

Snapshot creation uses injected, framework-owned Git/filesystem/process ports:

1. Read HEAD, refs, index identity, tracked paths, non-ignored untracked paths,
   lstat metadata, file/symlink bytes, and deletions without source writes.
2. Create a no-hardlink/no-alternate local clone in an OS temp directory, detach
   at captured HEAD, remove origin, and run checkout/filter activity only there.
3. Overlay bytes, modes, safe relative symlinks, and deletions; stage only the
   private index so `git diff HEAD` sees the whole captured change.
4. Re-read identities and bytes. Accept only an identical second sample; retry
   boundedly, then refuse. Absolute/root-escaping symlinks, sparse checkout,
   unreproducible submodules/gitlinks, or errors refuse.
5. Supply only the clone path as Pi `cwd`. Do not link, mount, expose, or mention
   the source root, run store, or plan-summary path to any review session.
6. Never merge/copy source content back. Host output follows D-010 only.

### 3. Persisted QM lifecycle and workspace ownership

QM allocation creates its run record and `qm/lifecycle.jsonl` before fallible
work. The append-only lifecycle uses these phases:

```ts
type QualityRunPhase =
  | "allocated"
  | "snapshot-ready"
  | "assessing"
  | "finalizing"
  | "finalized"
  | "retained";
```

Each transition records timestamp, previous phase, workspace identity, owner
process instance, active/settled child IDs, artifact digests, and disposition.
`allocated` immediately creates a complete conservative `final.md`; an active
plan also gets its exact per-run summary. Consequently a crash cannot leave a
run with only the 200-character summary. Retry/recovery reads the last valid
lifecycle event; malformed/missing history fails rather than fabricating a
phase.

The QM-specific step executor catches setup, model, child, cancellation, and
persistence failures; validates or generates the final report; atomically
replaces its own provisional report/summary; appends `finalized`; and only then
returns `StepResult`. Thus the existing scheduler cannot write the first
terminal run event before full evidence exists. No generic finalizer or general
attempt-evidence behavior is added.

A child wait timeout records the still-live child and transitions to `retained`;
it never calls child cancellation. Completion callback records settlement and
can remove the workspace. After process restart, a QM startup/cleanup pass reads
persisted owner/child state and deletes only when all children settled or the
recorded owning process is provably dead. Uncertainty retains the workspace.
Every lifecycle phase therefore has a safe exit.

### 4. Host-owned reviewer and report artifacts

Add a path-safe QM artifact sink rooted from the loaded `RunRecord.artifactsDir`.
It rejects absolute/traversal/symlink-escape paths and cross-run roots. Only host
code holds the sink. Each successful write is fsynced/atomically renamed as
appropriate and followed by the existing `artifact_written` event; the QM
`StepResult.artifacts` returns those references.

For a quality-profile parent, both detached spawn handling and nested chain
spawning call the same evidence sink before delivering completion. The evidence
record binds:

```ts
interface ReviewerEvidence {
  readonly runId: string;
  readonly lens: ReviewLens;
  readonly spawnId: string;
  readonly sessionId: string;
  readonly resolvedRole: string;
  readonly resolvedModel: { readonly provider: string; readonly id: string };
  readonly outcome: "success" | "failed";
  readonly digest: string;
  readonly fullText: string;
}
```

The first successful completion for each expected lens exclusive-creates its
artifact. Duplicate lens, unexpected role, absent/empty final text, model
mismatch, wrong run context, or failed persistence is a report-integrity
failure. The QM still receives the same full text in the normal completion
message for synthesis, but it never receives a host file path or authority to
create producer evidence.

Only QM evidence is persisted by this feature. Ordinary durable stages continue
to return `artifacts: []` as today; execution-liveness retains ownership of any
future general attempt-evidence design.

### 5. Final report, status, and terminal matrix

The QM returns final markdown as assistant text. Host validation requires all
AC-008 sections and one machine-readable `COSMO_QM_REPORT` footer:

```ts
type QualityVerdict = "ready" | "not-ready" | "failed" | "refused";

interface QualityReportIndex {
  readonly runId: string;
  readonly verdict: QualityVerdict;
  readonly checks: readonly CheckResult[];
  readonly gates: readonly GateResult[];
  readonly findings: readonly QualityFinding[];
  readonly humanItems: readonly HumanDecisionItem[];
  readonly observations: readonly ScopedObservation[];
  readonly reviewed: readonly string[];
  readonly reviewerModels: readonly ReviewerModelRecord[];
}
```

Malformed model output is retained as `raw-final.md`; host code generates a
complete failed `final.md`. Refusal, cancellation, pre-model errors, and child or
storage failure use the same sections with explicit failure evidence.

| Isolation/assessment state | Durable run outcome | Report verdict |
|---|---|---|
| isolation refused | blocked | `refused` with reason |
| assessment ready | completed | `ready` |
| findings/blockers | completed | `not-ready` |
| execution/report-integrity failure | failed | `failed` |
| caller cancellation | cancelled | `failed`, cancellation named |

`run status`/`run_status` aggregate existing step `ArtifactRef` values and point
to `qm/final.md`; this is read-only projection, not recovery. The plan summary at
`missions/plans/<planSlug>/qm-runs/<runId>.md` contains run/verdict, artifact
link, checks/gates, finding IDs, human items, and reviewer models. Plan identity
comes only from existing explicit completion-label/plan-session context; absent
or ambiguous identity yields a planless run. D-010 governs whether these host
writes may occur inside the source checkout.

### 6. One-pass assessment and model policy

Rewrite QM prose as Setup → Assess → Report:

1. Consume host-provided snapshot/run/check context.
2. Resolve direct analysis capability states and execute applicable bound
   capabilities in the snapshot.
3. Triage specialist applicability.
4. Start the general reviewer plus applicable specialists once. Host policy
   overrides the generalist to the configured diverse model.
5. Consume correlated completion text, synthesize the final report, and stop.

There is no verifier child, remediation, task creation, commit, plan mutation,
cleanup of other runs, or re-review loop. The generalist always runs;
specialists remain conditional. A specialist finding may be closed/dismissed
only with independent generalist or QM evidence. Performance P1 requires a
measured or reproduced cost; speculative cost is at most P2.

Project config defines model families without provider-specific framework code:

```ts
interface QualityReviewModelConfig {
  readonly diverseReviewerModel: string;
  readonly modelFamilies: Readonly<Record<string, readonly string[]>>;
  readonly checks: readonly QualityReviewCheck[];
}
```

After Pi resolves canonical model identities, each model must occur in exactly
one family list and the worker/reviewer families must differ. Session creation
returns its actual resolved identity to the host. Substitution or fallback that
does not equal the configured resolved ID fails the review and is recorded.

### 7. Baseline-aware changed-scope audit

First, in a clean detached checkout of the explicit comparison base, invoke the
pinned provider's supported duplication-baseline generation path and create
`.fallow-baselines/duplication.json`. Record its reason, base SHA, timestamp,
provider version/request, and digest alongside dead-code and health in the
manifest. This bootstrap is a standalone tracked act before implementation
changes and cannot include the reviewed diff. If the pinned provider cannot
produce/consume the expected baseline or gives contradictory exit/envelope
semantics, stop for a dependency/spec decision.

After bootstrap, only the Fallow adapter's `changed-scope-audit` builder adds all
three baseline arguments before common JSON/failure flags. Missing/unreadable or
digest-mismatched files fail visibly; they never degrade to unbaselined audit.
Ordinary audit is read-only.

A separate explicit maintenance script takes a literal base plus nonempty human
reason, refreshes requested baseline files atomically, and appends updated
provenance/digests. Review code never calls it.

### 8. Base-owned suppression registry

Add a pure policy and project check with this registry shape:

```ts
interface SuppressionExceptionRegistry {
  readonly version: 1;
  readonly directivePatterns: readonly string[];
  readonly exceptions: readonly {
    id: string;
    path: string;
    directiveFingerprint: string;
    targetFingerprint: string;
    reason: string;
    approvedBy: "human";
    approvedAt: string;
  }[];
}
```

The check reads added lines against the explicit base and loads authorization
from that base revision's registry, never working-tree registry bytes. A base
exception survives movement through directive+target fingerprints; changing
either needs a new human entry. Same-change registry additions are separately
reported and cannot authorize that diff. Seed intentional existing directives;
never edit registry or source from the check.

### 9. Documentation, callers, and legacy migration

Reconcile `docs/fallow-exceptions.md`, `.fallow-baselines/manifest.json`, and the
roadmap: dead-code/health retain their committed floors; duplication now has the
explicitly bootstrapped comparison-base baseline while its threshold/current
state is stated accurately; changed-scope consumes all three; inline directives
use the human registry; refresh is reasoned and explicit.

Move exactly the eleven shared QM files—three general, three security, three UX,
and two performance—to `missions/archive/reviews/qm/shared-rounds/` with history.
The two plan-qualified `analysis-gate-coverage-*-round-1.md` files stay. Update
all tracked old-path links; an old-path search must be empty and each moved
file's history reachable.

Update named-chain descriptions and callers so QM-ending chains stop at findings.
The external implementation flow creates/updates remediation tasks, runs Drive,
and obtains independent review separately. No caller promises automatic fixes,
plan completion, or a clean source tree from QM.

## Files to Change

- `bundled/coding/review-launch-policy.json` (new) — data-only canonical QM and
  built-in-chain preflight facts.
- `cli/main.ts`, `cli/run/subcommand.ts`, and `cli/chain-execution.ts` — perform
  safe standalone admission, force QM-containing chains durable, and preserve a
  host run store while the QM stage uses snapshot `cwd`.
- `domains/shared/extensions/orchestration/authorization.ts` — centralize target
  resolution/denial facts.
- `domains/shared/extensions/orchestration/chain-tool.ts` — preauthorize all
  members and propagate quality context to nested panel chains.
- `domains/shared/extensions/orchestration/spawn-tool.ts` — route canonical QM
  through the durable quality launcher and persist correlated panel completion
  text before notifying the parent.
- `domains/shared/extensions/orchestration/driver-tool.ts` — require worker
  authority before task/run allocation.
- `lib/agents/types.ts` and `lib/agents/session-assembly.ts` — define/apply the
  narrow internal effective-tool profile without changing ordinary agents.
- `lib/orchestration/session-factory.ts` — return host-observed resolved model
  identity and honor host-owned effective tools/extensions.
- `lib/orchestration/agent-spawner.ts`,
  `lib/orchestration/spawn-completion-loop.ts`, and
  `lib/orchestration/spawn-tracker.ts` — carry quality context and correlated
  full-text/model completion evidence without changing wait-timeout cancellation.
- `lib/orchestration/quality-review-policy.ts` (new) — load/validate data-only
  launch, check, and model-family policy.
- `lib/orchestration/quality-review-context.ts` (new) — bind active sessions to
  persisted quality run identity; absence fails closed.
- `lib/orchestration/quality-review-workspace.ts` (new) — capture and materialize
  the independent stable snapshot.
- `lib/orchestration/quality-review-checks.ts` (new) — execute only configured
  argv checks in the snapshot and capture evidence.
- `lib/orchestration/quality-review-artifacts.ts` (new) — own path-safe host
  writes, lifecycle, producer correlation, and retained-workspace cleanup.
- `lib/orchestration/quality-review-report.ts` (new) — validate/generate final
  reports and per-run plan summaries.
- `lib/orchestration/quality-review-run.ts` (new) — compose allocation,
  snapshot, checks, restricted spawn, pre-terminal finalization, and refusal.
- `lib/orchestration/durable-chain-compiler.ts` — reject unsafe QM topology and
  mark only the terminal QM step for the quality executor.
- `lib/orchestration/durable-chain-runner.ts` — delegate that marked step to the
  focused executor and return its QM-only artifacts while preserving summaries.
- `lib/orchestration/types.ts` — carry the narrow host-owned quality context and
  resolved model evidence.
- `lib/durable-runtime/types.ts` and `lib/durable-runtime/controller.ts` — expose
  existing step artifact references in normalized status without changing
  leases, attempts, settlement, or general persistence.
- `domains/shared/extensions/orchestration/run-control-tools.ts` and
  `cli/run/subcommand.ts` — render QM full-report pointers.
- `bundled/coding/agents/quality-manager.ts` — narrow extensions/subagents and
  describe a review-only role.
- `bundled/coding/prompts/quality-manager.md` — replace remediation rounds with
  Setup → Assess → Report and completion-text panel consumption.
- `bundled/coding/prompts/reviewer.md`,
  `bundled/coding/prompts/security-reviewer.md`,
  `bundled/coding/prompts/performance-reviewer.md`, and
  `bundled/coding/prompts/ux-reviewer.md` — return reports as final text,
  calibrate closure/severity, and stop naming shared output paths.
- `lib/config/types.ts` and `lib/config/loader.ts` — validate exact argv checks,
  diverse model, and non-overlapping model-family membership.
- `.cosmonauts/config.json` and `.cosmonauts/config.example.json` — configure and
  document this project's checks and provider-neutral family/model selection.
- `domains/shared/extensions/project-tools/fallow-provider.ts` — pass all three
  baselines only for changed-scope audit.
- `.fallow-baselines/duplication.json` (new) — explicit clean-base bootstrap.
- `.fallow-baselines/manifest.json` (new) — record baseline reason/base/provider
  request/version/digests.
- `scripts/update-fallow-baselines.ts` (new) — explicit reasoned refresh outside
  review.
- `lib/quality/suppression-policy.ts` (new) — pure base-registry classification.
- `scripts/check-new-suppressions.ts` (new) — project-native check adapter.
- `.cosmonauts/suppression-exceptions.json` (new) — human-owned registry seeded
  from current directives.
- `package.json` — expose suppression checking and explicit baseline maintenance.
- `docs/fallow-exceptions.md`, `ROADMAP.md`, and `AGENTS.md` — align baseline,
  debt, suppression, and project-check guidance.
- `bundled/coding/chains.ts`, `bundled/coding/prompts/cody.md`,
  `domains/shared/skills/spawning/SKILL.md`,
  `domains/main/skills/dispatch/SKILL.md`, `docs/orchestration.md`, `README.md`,
  and `external-commands/implement-plan.md` — describe findings-only completion
  and separate remediation.
- `missions/reviews/review-round-1.md`,
  `missions/reviews/review-round-2.md`,
  `missions/reviews/review-round-3.md`,
  `missions/reviews/security-review-round-1.md`,
  `missions/reviews/security-review-round-2.md`,
  `missions/reviews/security-review-round-3.md`,
  `missions/reviews/ux-review-round-1.md`,
  `missions/reviews/ux-review-round-2.md`,
  `missions/reviews/ux-review-round-3.md`,
  `missions/reviews/performance-review-round-1.md`, and
  `missions/reviews/performance-review-round-2.md` — move with history to
  `missions/archive/reviews/qm/shared-rounds/`.
- `missions/reviews/codex-post-review-code-structure-map.md`,
  `missions/plans/framework-health/plan.md`,
  `knowledge/analysis-capability-runtime.md`,
  `knowledge/analysis-investigation-procedures.md`,
  `missions/archive/plans/coding-agnostic-framework/qm.md`,
  `missions/archive/plans/code-structure-map/qm.md`,
  `missions/archive/tasks/TASK-361 - Reviewerquality-manager resolve diff base to originmain, pulling already-merged commits into the review range.md`, and
  `missions/archive/tasks/TASK-399 - Restore recursive and extra skill visibility under internal deny-list filtering.md`
  — update historical links to archive paths without changing substantive
  history.

## Risks

- **R-001 — Ratified AC collision blocks implementation.** D-010 remains open.
  Pivot only after the human selects A or B and the authoritative ground records
  that amendment. Abort any attempt to hide host writes from the integrity
  comparison.
- **R-002 — Generic isolation scope creep.** If implementation needs
  `WorktreeSpec.isolated`, scheduler worktrees, merge finalizers, declared panel
  graph migration, or mutable parallel execution, stop under D-003.
- **R-003 — Snapshot fidelity varies across Git layouts.** Unsafe symlinks,
  sparse checkouts, gitlinks/submodules, rapid edits, and unusual nesting may be
  unprovable. Refuse; never copy approximately or fall back.
- **R-004 — Unsafe pre-bootstrap execution.** Standalone built-in QM admission
  must occur from data before executable project/domain imports. If the CLI/tool
  path cannot do that, refuse and redesign; do not weaken INV-001. Prefix stages
  remain ordinary execution and the snapshot boundary is immediately before QM.
- **R-005 — Shell authority reappears through session assembly.** Any quality
  session receiving bash/edit/write, or any model-selected check command, is an
  abort condition because it reopens `review-1.md PR-003`.
- **R-006 — Timed-out child remains alive.** Never cancel it. Persist retention,
  keep the workspace, and clean only after settlement or proven owner death.
- **R-007 — Execution-liveness rebase collision.** QM lifecycle/artifact
  projection may sit near TASK-714/TASK-718. This plan must not depend on or
  implement their leases, general attempt evidence, start registration, or
  settlement semantics; the later plan rebases onto the narrow additive seam.
- **R-008 — Report persistence partially fails.** Provisional report/summary
  must precede fallible work. A failed replacement leaves the conservative
  record and fails the run; no completed/ready outcome can precede finalization.
- **R-009 — Model identity/family is ambiguous or unavailable.** Unknown,
  overlapping, same-family, fallback, or unavailable resolution refuses/fails;
  never infer from a provider string or silently substitute.
- **R-010 — Pinned Fallow baseline semantics differ.** Bootstrap in a clean
  detached base and live-probe flags/envelope before adapter enforcement. Abort
  if 2.54.2 cannot generate and consume the missing duplication baseline.
- **R-011 — Baseline bootstrap absorbs the feature diff.** The duplication file
  must derive from the recorded pre-implementation base. Any working-tree input
  or unexplained digest aborts the stage.
- **R-012 — Suppression matching is weak/noisy.** Exercise named/equivalent
  directives, movement, target changes, and same-change registry edits. Pivot
  fingerprints within D-009; never weaken base ownership.
- **R-013 — Host artifact escape/forgery.** Path traversal, symlink escape,
  duplicate lens, absent producer correlation, or an agent-visible artifact path
  fails the run. No review session may see a path back to source.
- **R-014 — Historical links are missed.** Verify all eleven histories and a
  full tracked old-path search. Do not move the two plan-qualified analysis gate
  reports merely because a glob matches.
- **R-015 — Structural evidence remains incomplete.** Duplication analysis was
  unusable, boundary conformance is unbound, and the architecture map is absent.
  Independent review must inspect module direction and keep policy out of the
  named complexity hotspots; no clean baseline is inferred.
- **R-016 — Authority drifts at a new launch surface.** Any newly discovered
  agent-starting tool must use shared admission or be proven genuine top-level.
  Do not ship AC-001 with another bypass.
- **R-017 — Configured checks lose existing coverage.** This repository's exact
  existing test/lint/typecheck commands must be configured and their captured
  outcomes shown in B-006. If another current project check is discovered, add
  it to data before removing verifier shell access.

## Implementation Order

All stages are blocked until D-010 receives a human ruling and the chosen
ratified amendment is recorded. Thereafter each code stage follows failing
behavioral coverage → minimal implementation → refactor. Authored prompt/skill
outcomes are reviewed semantically, not asserted by sentence matching.

1. **Close authority and constrain review sessions — B-001, B-006.** Centralize
   target admission for spawn, every chain member, and Drive before allocation.
   Add the host-owned effective tool profile, remove QM implementation/verifier
   roles, and prove no QM/panel path receives shell/edit/write while allowed
   leads and top-level CLI behavior remains unchanged.
2. **Establish trusted launch and snapshot isolation — B-002.** Add data-only
   canonical preflight, terminal-only topology rules, stable capture, independent
   clone materialization, and fail-closed layout outcomes. Prove standalone
   bootstrap occurs after snapshot and hostile private writes cannot reach source.
3. **Persist lifecycle before work — B-004.** Allocate QM run identity, create
   provisional complete report/summary, record reconstructible phases and
   workspace ownership, order finalization before `StepResult`, and retain
   timed-out-child workspaces without cancellation.
4. **Capture host-correlated panel evidence — B-003, B-004, B-005.** Carry actual
   resolved model identity from session creation, persist full child text by
   run/lens/spawn/session/role before completion delivery, reject missing or
   duplicate producers, validate/generate final reports, and expose QM artifact
   references through status without generalizing other stages.
5. **Deliver one review-only assessment pass — B-005, B-006.** Configure and run
   exact host-owned project checks in the clone, rewrite QM/panel prose for final
   text and one Setup → Assess → Report pass, and preserve direct analysis,
   triage, and applicable specialist behavior without remediation.
6. **Bootstrap and enforce baseline-aware audit — B-007, B-009.** From the
   recorded clean base, create the missing duplication baseline plus provenance;
   then pass all three baselines, fail closed on missing/mismatch, and add
   reasoned explicit refresh. Reconcile docs and roadmap in the same stage.
7. **Enforce base-owned suppression exceptions — B-008, B-009.** Add/seed the
   registry, pure classifier, and project check. Cover unauthorized,
   self-authorized, pre-authorized, moved, target-changed, and equivalent
   directives with no implementer-decided cells.
8. **Attest and calibrate the panel — B-010, B-011.** Add non-overlapping family
   config, force the always-present generalist override, validate actual model
   identity, record all reviewers, and revise performance/closure guidance.
   Exercise every valid/invalid family-resolution cell without fallback.
9. **Archive records and update callers — B-012.** Move the eleven files with
   history, repair every old link, update chains/leads/skills/docs/external flow,
   and walk direct checks, analysis, triage, specialists, findings-only chain
   endings, and separate remediation routing end to end.
10. **Independent closure under D-002 — B-001 through B-012.** Resolve the
    project's runtime-capable evidence at sign-off, attack every refusal,
    producer, lifecycle, authority, baseline, suppression, and model-family
    negative, and use the ratified Claude plus read-only Codex
    correctness/liveness review instead of QM. Any remediation goes through
    ordinary tasks/Drive and another independent review; QM never certifies the
    component that confines it.

---
title: >-
  QM chain safety: a review-only Quality Manager that cannot damage what it
  reviews
status: active
createdAt: '2026-09-23T20:56:11.879Z'
updatedAt: '2026-09-24T03:23:43.000Z'
---

## Overview

This plan delivers the authoritative `spec.md` as twelve behaviors covering
AC-001 through AC-016 without reopening any excluded non-goal. The spec's
`## Intent`, `## Scope`, excluded items and `## Assumptions` stay authoritative;
this plan cites them and does not restate them.

The Quality Manager (QM) remains one outer assessment agent. At its launch
boundary, host code:

- takes a private snapshot of the reviewed state;
- prepares the review materials;
- runs the configured project checks there;
- gives the QM and its panel a restricted, shell-free session profile;
- captures each reviewer's final text as run-owned evidence;
- finalizes a complete report before the step returns.

The QM makes one assessment pass and returns findings. Remediation stays a
separate caller action through tasks, Drive and independent review.

It does not:

- migrate the panel to a declared graph;
- implement the runtime's generic `WorktreeSpec.isolated`;
- cancel timed-out children;
- change the 200-character stage summary;
- generalize persisted attempt evidence.

This plan lands before `execution-liveness` (TASK-712..719, all To Do) and does
not contradict that spec's ratified AC-015, AC-016 or AC-018.

**Revision 2026-09-23.** Revised after two review channels:

- the chain's `review-1.md` and `review-2.md`;
- the coordinator's independent four-lens adversarial review. Its 24 findings
  were each verified by a refuting reviewer: 17 confirmed, 7 partial, 0 refuted.

Both channels agreed on the high-severity gaps:

- the private checkout had no dependencies, no analysis consent and no view of
  the diff;
- the duplication baseline treated as missing already exists;
- the QM-ending chains run inline and cannot use the durable runner;
- the ordering removed QM authority before its replacements existed.

Behaviors now use the current `plan-format.md` shape: Source, Observer, Entry
point, Outcome. Five questions on ratified ground were drafted as H-001..H-005 and ruled by the
human on 2026-09-23 as recommended (D-018..D-022). The spec's AC-003, AC-015
and AC-016 are amended in place, and the INV-001 interpretation is recorded
beside the Intent.

## Architecture Context

This plan is subordinate to:

- `missions/architecture/orchestration-future.md`: D-001, D-008, D-012 and its
  Boundary Model. There is one durable run and evidence substrate, and bounded
  summaries are orientation, not the data plane.
- `missions/architecture/orchestration-future.md` Waves B and E.
  - Wave B defers converting the QM panel into a declared graph; this plan keeps
    the panel as agent-driven `spawn_agent` fan-out.
  - Wave E defers worktree isolation, merge finalizers and parallel mutable
    execution. This plan adds none of those. One terminal, read-only review
    stage gets one disposable private checkout. Nothing in it can merge back, no
    mutable stage runs there, and nothing runs in parallel with a mutating
    stage.
  - The record's read/opinion-swarm bullet says the QM panel "does not yet
    provide" an enforced read-only guarantee. This plan supplies that guarantee
    for the QM only. It is not the general read-swarm slice of Wave D.
- `missions/architecture/durable-orchestration-runtime.md` D-016 and its
  post-production worktree/merge-finalizer boundary. `WorktreeSpec.mode:
  "isolated"` stays vocabulary only.
- `missions/plans/execution-liveness/spec.md` and `plan.md`:
  - a timed-out wait never cancels the child (AC-015);
  - only QM evidence is persisted here, and the general attempt-evidence
    contract stays with execution-liveness (AC-016);
  - `StepResult.summary` keeps the existing 200-character contract (AC-018);
  - this plan adds no owner-liveness or process-death protocol (see D-013).

Dependency direction:

- The CLI and the registered orchestration tools depend on a framework-owned QM
  launch module. That module lives in `lib/orchestration/`, never in
  `bundled/coding/`, which the `coding-extraction` plan will externalize.
- Snapshot, materials, checks, report persistence and model attestation depend
  on injected Git, filesystem and process ports, and do not import coding
  prompts.
- The durable runtime stays unaware of QM personas and Git mechanics. It carries
  the existing `ArtifactRef` values the QM stage returns.
- Coding-domain definitions and prompts consume the restricted profile and the
  final-text contract. They never choose host paths, storage roots, run identity
  or producer attribution.

Pi-First findings:

- Pinned Pi 0.80.6 `createAgentSession` accepts a per-session `cwd`, a tool
  allowlist, an extension set and a model. The design composes these rather
  than adding a session runtime or provider.
- Pi's `ModelRegistry` resolves the provider and model object. The session
  factory returns that host-observed identity so a reviewer cannot self-report
  its model.
- Full-text completion retention is Cosmonauts code, not Pi:
  `SpawnTracker.complete(spawnId, summary, fullText)` in
  `lib/orchestration/spawn-tracker.ts`, populated by detached `spawn_agent`. The
  durable chain path returns only messages plus the 200-character summary, which
  is why D-011 limits the QM's panel to `spawn_agent`.
- Pi does not create Git snapshots, enforce Cosmonauts authority, keep QM
  lifecycle state, or define model families. Those are the narrow Cosmonauts
  responsibilities here.
- An OS sandbox and a generic `tool_call` write guard stay excluded by the spec.
  The QM and its panel instead receive no shell, edit or write tool at all (see
  D-012).

Investigation evidence gathered before design:

- Complexity hotspots at the touched seams: `executeChainStep` in
  `durable-chain-runner.ts`, `capabilityArgs` in the Fallow provider, and the
  durable controller's event summarizer. QM policy therefore lives in focused
  new modules called from those seams.
- Boundary conformance is unbound (`provider-not-configured`), so dependency
  direction needs independent review.
- The architecture map is unavailable (`memory/architecture/index.md` is
  absent). The two architecture records above are the source of truth.
- The investigation now lives at
  `.shepherd/work/in-progress/qm-chain-safety/investigation.md` (D-015).

## Decision Log

- **D-001 - Eight decisions from the qm-chain-safety investigation**
  - Decision: accepted as recommended in `.shepherd/work/todo/qm-chain-safety/investigation.md` §5:
    1. The QM is review-only. Remediation goes through tasks, Drive and independent review.
    2. Full reports go to run-scoped artifacts, with a tracked plan-scoped summary on every exit. The shared `missions/reviews/*-round-N.md` files are retired to an archive.
    3. Isolation is a detached worktree now, with runner support after it. An OS sandbox is deferred. *(Superseded 2026-09-23 by D-020: "an isolated detached checkout (a private local clone)".)*
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

- **D-003 - Isolate the QM at its launch boundary, keyed on the resolved role**
  - Decision:
    - Leave `WorktreeSpec.mode: "isolated"` unimplemented.
    - A framework-owned module in `lib/orchestration/` isolates every launch
      whose resolved qualified role is the canonical `coding/quality-manager`.
      The role is resolved from domain and file identity, never from a field
      the definition declares about itself.
    - A standalone QM (CLI agent, `spawn_agent`, or a single-stage chain) is
      snapshotted at launch, after the runtime has bootstrapped and before the
      QM session exists.
    - A terminal QM stage after other stages is snapshotted at its stage
      boundary.
    - A QM anywhere other than the terminal position, or inside a parallel
      group, is refused.
    - Refusals come before any QM session exists and never fall back to the
      shared checkout.
    - If delivery turns out to need scheduler-owned general worktrees, a merge
      finalizer, panel graph migration or mutable parallel execution, halt and
      escalate.
  - Alternatives:
    - Activate `WorktreeSpec.isolated`: rejected, it crosses Wave E and
      execution-liveness's store and launch work.
    - A pre-bootstrap, data-only launch policy under `bundled/coding/`:
      rejected by review-2 PR-004 and PR-007. Aliases are still imported
      before they are refused, and the owner package is being externalized.
    - Instructions only: rejected by INV-001.
  - Why: INV-001 outranks availability. The bootstrap boundary is D-021.
  - Decided by: planner-proposed, 2026-09-23; revised by coordinator after review, 2026-09-23
  - Supersedes: the data-only `bundled/coding/review-launch-policy.json` preflight in the 2026-09-23 D-003

- **D-004 - The snapshot is a private local clone plus prepared review materials**
  - Decision:
    - **Capture.** Host code reads the operator checkout with
      `GIT_OPTIONAL_LOCKS=0` and plumbing-only reads: HEAD, refs, the index
      identity, tracked paths, non-ignored untracked paths, lstat metadata,
      file and symlink bytes, and deletions. No source write happens,
      including no opportunistic index refresh.
    - **Materialize.** Make a private local clone in an OS temp directory.
      Write the resolved base as a local ref (local `main`, then `master`,
      then `origin/main`, the same order as today's QM prompt). Remove
      `origin`, detach at the captured HEAD, then overlay bytes, modes, safe
      relative symlinks and deletions.
    - **Verify.** Re-sample the source and accept only an identical second
      sample. Retry a bounded number of times, then refuse.
    - **Unsupported layouts.** Absolute or root-escaping symlinks, sparse
      layouts and unreproducible gitlinks or submodules are refused.
    - **Review materials.** Beside the checkout, not inside it, host code
      writes: the literal base SHA, the review range, the changed-file list,
      the full diff from the base to the captured state (untracked files as
      additions), and base-revision copies of each changed file. Review
      sessions reach them only through the read-only tools.
    - **Dependencies.** Host code runs the configured `qualityReview.prepare`
      argv, for example `bun install --frozen-lockfile`, in the clone before
      any check. A failure ends the assessment `failed`, naming the step.
    - **Analysis consent.** Host code verifies the user's existing consent
      for the source root's real path, then passes an explicit in-memory
      authorization for the snapshot root to the analysis capabilities. It
      never writes or copies a consent record.
    - **No path back.** No link, mount or path to the source root or the host
      run store is given to a review session.
  - Alternatives:
    - A linked detached `git worktree`: it shares refs, stash, hooks and config
      with the operator repository, which INV-001 forbids changing (D-020).
    - A snapshot commit in the source repository: it writes the source object
      database.
    - A plain directory copy: no history for base comparison.
    - A symlink to the operator's `node_modules`: a writable path back into
      the checkout.
    - Copying consent: contradicts the user-owned consent contract.
  - Why: INV-001; AC-003 and AC-004; AC-016 (checks and analysis must actually
    run).
  - Decided by: planner-proposed, 2026-09-23; revised by coordinator after
    review (DESIGN-ATTACK-001/002/004, FEASIBILITY-001, review-2 PR-002, PR-003,
    PR-006), 2026-09-23. Replacing the decided "detached worktree" mechanism
    is D-020.

- **D-005 - The generalist runs on a configured model of a different family**
  - Decision:
    - `qualityReview.diverseReviewerModel` in project config overrides only
      the always-present general reviewer's model. Shipped definitions keep
      their current `model` values.
    - A model's family is its Pi-resolved provider, normalized by a shipped
      alias table (for example `openai-codex` → `openai`). Project config can
      extend the table with `qualityReview.modelFamilies`.
    - The implementer family is taken from the resolved model of the default
      worker definition.
    - Session creation returns the actual resolved identity, and the host
      records it for every reviewer.
    - The same family, an unresolvable model, or a substituted model fails the
      review visibly.
    - The unconfigured outcome is D-019.
  - Alternatives:
    - Trust reviewer markdown: forgeable.
    - A provider-to-family map with no default: every existing project would
      refuse (SPEC-FIDELITY-004).
    - Give the diversity role to a conditional specialist: it may not run.
  - Why: AC-014 and INV-003. Diversity must be a recorded fact, not a
    self-report.
  - Decided by: planner-proposed, 2026-09-23; revised by coordinator
    (FEASIBILITY-005, SPEC-FIDELITY-004), 2026-09-23

- **D-006 - Exact QM report paths are run-owned and host-only**
  - Decision:
    - Full artifacts live under `missions/sessions/chain/runs/<runId>/artifacts/qm/`
      (gitignored): `lifecycle.jsonl`, `checks.md`, `final.md`, an optional
      `raw-final.md`, and one immutable `reviewers/<lens>.md` per actual panel
      member.
    - An active plan also gets a new tracked file,
      `missions/plans/<planSlug>/qm-runs/<runId>.md` (subject to D-018).
    - Only host code writes these paths. `final.md` and the plan summary are
      first written as a conservative, complete failure record, then atomically
      replaced before the QM step returns.
    - Reviewer files are exclusive-created and never replaced. No path is
      given to an agent.
  - Alternatives:
    - Agent-written paths: forgeable.
    - Tracked full reports under `missions/reviews/qm`: rejected by human
      decision 2.
    - One mutable plan summary: runs would overwrite history.
  - Why: INV-002, INV-003, AC-005 through AC-007.
  - Decided by: planner-proposed, 2026-09-23

- **D-007 - Assessment outcome and execution outcome stay distinct**
  - Decision:
    - `ready` and `not-ready` are completed assessments.
    - `refused` blocks the run.
    - Execution or report-integrity failure fails it.
    - Caller cancellation cancels it.
    - The QM-specific executor finalizes the complete report before returning
      its `StepResult`. The bounded stage summary is unchanged.
  - Alternatives:
    - Make negative findings an execution failure: the assessment completed.
    - Encode the verdict in the summary: conflicts with AC-007 and
      execution-liveness AC-018.
  - Why: INV-003, AC-006 through AC-009.
  - Decided by: planner-proposed, 2026-09-23

- **D-008 - Consume the three committed Fallow baselines as they are**
  - Decision:
    - The changed-scope audit builder passes
      `--dead-code-baseline .fallow-baselines/dead-code.json`,
      `--health-baseline .fallow-baselines/health.json` and
      `--dupes-baseline .fallow-baselines/dupes.json`. The existing files are
      adopted unchanged; `dupes.json` is the duplication baseline of record.
    - A missing or unreadable baseline file fails the gate visibly. It never
      degrades to an unbaselined audit, and ordinary review never writes
      baselines.
    - A new `.fallow-baselines/manifest.json` records each file's digest and
      provenance. The initial entries say "adopted as-is", pointing to the
      commit that last wrote each file.
    - A separate `scripts/update-fallow-baselines.ts` re-saves requested files
      only given a literal base and a non-empty reason, and appends provenance.
      Review code never calls it.
    - The pinned Fallow 2.54.2 already consumes `dupes.json`; the coordinator's
      verifier live-probed `--dupes-baseline`.
  - Alternatives:
    - Bootstrap a new `duplication.json`: rejected. Its premise that no
      duplication baseline exists was false (SPEC-FIDELITY-001,
      FEASIBILITY-003, DESIGN-ATTACK-003, SCOPE-SEQUENCING-005), and it would
      orphan the file of record.
    - Leave duplication unbaselined: inherited clones would fail touched files.
  - Why: INV-005, AC-010. D-001 item 4 names "the committed baselines".
  - Decided by: coordinator, amend-on-record after review, 2026-09-23
  - Supersedes: the 2026-09-23 D-008 ("Bootstrap and then consume all three committed Fallow baselines")
  - Amended by: D-029 (human, 2026-09-24). The files were re-anchored once at `main`.

- **D-009 - Suppression authorization comes only from the comparison base, and tampering is surfaced**
  - Decision:
    - Keep a machine-readable exception registry keyed by directive family,
      path, and normalized directive and target fingerprints.
    - Authorization is loaded from the base revision's registry. A registry
      edit inside the reviewed change cannot authorize that change.
    - Unchanged or moved registered directives stay authorized.
    - A reviewed range that changes any gate-owned file is reported by host
      code as a human-decision item, and the verdict cannot be `ready`. The
      gate-owned files are the registry, the suppression checker and its
      policy module, the Fallow adapter, `.fallow-baselines/*`, and the
      `qualityReview` config block.
    - A change can therefore weaken a gate only visibly, never silently.
  - Alternatives:
    - Trust same-change registry edits: self-authorization.
    - Run the checker from the base revision's code: circular when Cosmonauts
      reviews itself.
    - Ban every directive forever: rejected.
  - Why: INV-005 ("cannot be silenced") and AC-011. The tamper rule answers
    review-2 PR-005.
  - Decided by: planner-proposed, 2026-09-23; tamper rule added by coordinator after review, 2026-09-23

- **D-010 - superseded by H-001 (2026-09-23).** The AC-003 / AC-007 collision is
  now drafted as H-001, narrowed to the one real write: ignored run artifacts
  are not among AC-003's listed items (SPEC-FIDELITY-005).

- **D-011 - Reviewer evidence is captured from host-observed completions; the panel uses `spawn_agent` only**
  - Decision:
    - A quality-profile parent can start panel members only through
      `spawn_agent`. `chain_run` is absent from its profile, so no nested
      durable run or transcript is rooted in the disposable clone.
    - The host correlates requested lens, `spawnId`, child session ID,
      resolved role, actual model, outcome and full assistant text. It
      persists the exact final text before delivering the completion to the
      QM.
    - A missing, duplicate, foreign or empty output, or a persistence failure,
      fails the assessment.
    - A reviewer whose wait times out counts as missing: the assessment fails,
      the child is not cancelled, and its workspace is retained.
    - Late settlement after a timeout is not handled here;
      execution-liveness AC-015 owns lossless late delivery.
  - Alternatives:
    - Bearer tokens with agent-written files: forgeable.
    - Nested `chain_run` fan-out: it roots run records in the clone
      (DESIGN-ATTACK-005) and needs new full-text extraction (FEASIBILITY-005).
    - Implementing late-completion delivery here: that is execution-liveness
      scope (SCOPE-SEQUENCING-002).
  - Why: AC-005, AC-006, INV-002.
  - Decided by: planner-proposed, 2026-09-23; revised by coordinator after review, 2026-09-23

- **D-012 - The review profile removes arbitrary process and write authority; the host runs checks**
  - Decision:
    - QM and panel sessions get a host-owned effective tool profile whatever
      their ordinary definitions say: read, grep, find and ls, which can also
      read the D-004 review materials. The QM additionally gets the analysis
      capabilities and `spawn_agent` restricted to the four reviewer lenses.
    - No quality-profile session gets `bash`, `edit`, `write`, task or plan
      mutation, Drive or `chain_run`. The QM's subagents are only `reviewer`,
      `security-reviewer`, `performance-reviewer` and `ux-reviewer`.
    - Project checks are exact argv entries from `qualityReview.checks`, run
      by host code without shell interpolation in the prepared clone. Output,
      exit code and duration are captured in `checks.md`, and the model cannot
      add or change a command.
    - Check durations are the measured-cost evidence available to the
      performance lens. Without such evidence its findings are at most P2.
    - The unconfigured outcome is D-019.
  - Alternatives:
    - Pi's `verification` tool set: its bash is unrestricted, and a shell can
      launch the top-level CLI and bypass AC-002 (review-1 PR-003).
    - Keep shell in the private clone and rely on isolation (SPEC-FIDELITY-002):
      rejected, because the shell reaches any absolute path and the CLI.
    - Model-proposed check commands: arbitrary argv again.
  - Why: INV-001, INV-004, AC-001, AC-002, AC-009.
  - Decided by: planner-proposed, 2026-09-23; revised by coordinator after review, 2026-09-23

- **D-013 - QM finalization state is persisted before assessment; there is no owner-death protocol**
  - Decision:
    - After run allocation and before any fallible work, host code creates
      `lifecycle.jsonl`, a conservative complete `final.md`, and, when a plan
      is active, the per-run plan summary.
    - A `workspace-reserved` event naming the deterministic temp path is
      appended before any clone I/O.
    - The phases are `allocated`, `workspace-reserved`, `snapshot-ready`,
      `assessing`, `finalizing`, then `finalized` or `retained`.
    - Removing the workspace is mandatory on `finalized` and on refusal when
      no child is live.
    - With a live timed-out child, the workspace is `retained` and named in
      the report. Automatic reclaim waits for execution-liveness's owner
      check; until then, OS temp reaping applies.
    - The executor never fabricates a phase. It finalizes atomically before
      returning.
  - Alternatives:
    - Process-local maps: lost on crash.
    - A QM-specific owner-process-death proof: it duplicates
      execution-liveness's ratified owner and descendant seams
      (SCOPE-SEQUENCING-004).
    - Generic durable finalizers: architecture boundary.
  - Why: INV-003, AC-007.
  - Decided by: planner-proposed, 2026-09-23; revised by coordinator after review, 2026-09-23

- **D-014 - Behaviors follow the current plan format**
  - Decision:
    - Behaviors carry Source, Observer, Entry point and Outcome only. There
      are no Seam, Test or Marker fields and no quality-gate section.
    - Internal structure belongs in Design. Work-specific quality conditions
      live in behaviors and in Risks.
  - Alternatives: keep a conceptual Seam field. That contradicts
    framework-health's human-decided D-001 (review-2 PR-009,
    SPEC-FIDELITY-006).
  - Why: `domains/shared/skills/work-artifacts/references/plan-format.md`.
  - Decided by: planner-proposed, 2026-09-23; Seam fields removed by coordinator, 2026-09-23

- **D-015 - The moved investigation is the current readable evidence path**
  - Decision: preserve D-001 and the authoritative spec verbatim, including
    their historical `work/todo` citation. All new design prose points to
    `.shepherd/work/in-progress/qm-chain-safety/investigation.md`.
  - Alternatives: rewrite D-001 or the spec provenance, rejected because both
    are ratified.
  - Why: workers need readable evidence without altering human decisions.
  - Decided by: planner-proposed, 2026-09-23

- **D-016 - A QM stage of an inline chain runs as its own one-step durable QM run** *(Added 2026-09-23 after review)*
  - Decision:
    - Chains that `shouldRunChainInline` keeps inline (a completion label, a
      loop stage such as `coordinator`, or a completion check) execute their
      terminal QM stage through the same durable QM launcher used for a
      standalone QM. That launcher allocates a separate one-step durable run.
    - The inline chain records the QM run ID in its stage result, and the plan
      slug passes through from the chain's completion label.
    - The durable scheduler gains no loop or completion-label support.
  - Alternatives: force QM-ending chains onto the durable runner. That hits
    the existing refusal in `durable-chain-runner.ts` for four of the five
    named chains, and making it work needs scheduler work across Wave B
    (FEASIBILITY-002).
  - Why: AC-007 and AC-016 for `plan-and-build`, `implement`, `spec-and-build`
    and `adapt`.
  - Decided by: coordinator, record, 2026-09-23

- **D-017 - Missing report index is a report defect, not a failed run** *(Added 2026-09-23 after review)*
  - Decision:
    - The QM returns its final markdown with a `COSMO_QM_REPORT` index block.
    - If the AC-008 sections are present but the index is missing or
      malformed, the host keeps the text, marks the report "index unavailable"
      and derives the plan summary from the section headings. The assessment
      outcome stands.
    - A report missing required AC-008 sections is a report-integrity failure.
  - Alternatives: fail the run on any footer defect. That adds failure surface
    for formatting (SPEC-FIDELITY-006).
  - Why: INV-003. The verdict must survive, and a formatting slip must not
    erase it.
  - Decided by: coordinator, record, 2026-09-23

- **D-024 - Two sequencing adjustments from the task compliance review** *(Added 2026-09-24 after review)*
  - Decision:
    - Host-observed resolved-model identity (session factory →
      `ReviewerEvidence.resolvedModel`) is delivered in Stage 6 (TASK-725),
      because Stage 6's reviewer evidence needs it. Stage 7 (TASK-726) keeps
      family normalization, the override, config validation and the diversity
      verdict.
    - Stage 2 (TASK-721) depends on Stage 3 (TASK-722), so the B-009 docs
      describe the suppression registry that actually shipped.
  - Alternatives: leave the model seam in Stage 7, which makes Stage 6 unable
    to prove its "actual model" outcome; write the registry docs before the
    registry exists.
  - Why: each stage stays independently provable (SCOPE-SEQUENCING-001
    principle), and B-009's docs stay accurate.
  - Decided by: coordinator, amend-on-record, 2026-09-24
  - Supersedes: Implementation Order item 7's "host-observed model recording";
    the independence of stages 2 and 3

- **D-025 - Clarifications forced by the Stage 1–6 mid-branch review** *(Added 2026-09-24 after review)*
  - Decision:
    - **Review base.** The review base is the merge-base of the captured HEAD
      and the resolved base ref (local `main`, then `master`, then
      `origin/main`), not that ref's tip. The literal base SHA in the
      materials, the `{base}` for checks and the `analysis_audit` base are all
      that merge-base. This matches the pre-plan QM prompt, which D-004's
      "same order as today's QM prompt" refers to.
    - **Check evidence reaches the QM as review material.** Host code writes a
      copy of `checks.md` under `materialsRoot` before the materials are made
      read-only. No prompt, tool argument or system-prompt content given to a
      quality session names the source root or the host run store (D-004,
      D-006, R-012).
    - **Panel triage.** The host computes a minimum required lens set. The QM
      may add any other of the four lenses it judges applicable, once each
      (Design §6 step 3). Every lens that is started is required evidence. The
      QM cannot drop a host-required lens.
    - **Gate state is host-verified.** `ready` requires the host to observe a
      completed, bound `analysis_audit` result for the literal base. An
      unbound, unconsented, unobserved or failed-to-run audit is recorded as
      that state and is a human-decision item that blocks `ready`, whatever
      the model writes. *(Amended on record 2026-09-24 after mid-review-3:)*
      A bound, completed audit whose verdict fails is a gate failure, not a
      human decision. It forces `not-ready`, and each introduced audit finding
      is reported as a finding with its `file:line`, category and severity,
      taken from the audit envelope.
    - **The plan summary is not part of the reviewed state.** The capture
      excludes `missions/plans/<slug>/qm-runs/<runId>.md` for the run's own
      id.
    - **Bounded assessment.** A configurable QM assessment deadline, and a
      caller cancellation that propagates to the QM session, prepare and
      checks, both finalize the run (`failed` or `cancelled`). Host-run
      prepare and check processes are killed as a process group on timeout.
      Timed-out panel children are still never cancelled (D-011; execution-
      liveness AC-015).
    - **Quality-review config is base-owned.** *(Amended on record
      2026-09-24 after mid-review-4:)* `qualityReview` is read from the
      review base revision, never from the reviewed state, as D-009 does for
      the suppression registry. A change cannot choose its own prepare or
      check argv, and a change to the block is still a gate-owned human
      item. The operator note carries only caller-authored text, with the
      source and host-store paths replaced.
    - **The change cannot choose what reviews it or what the host imports.**
      *(Amended on record 2026-09-24 after mid-review-5:)* The QM runtime,
      and so the QM and panel definitions, prompts, project domains, local
      packages and config, is built from the framework plus the review
      base revision's project files, never from the reviewed clone. Review
      sessions still run with the clone as `cwd`. Changes to what configured
      checks execute are gate-owned human items that block `ready`. That
      covers `package.json` scripts named by a configured check or prepare
      argv, and any path listed in the base-owned
      `qualityReview.gateOwnedPaths`. Review materials are digested when
      written and verified before the QM starts. A mismatch is a
      report-integrity failure. Reviewer artifact refs are published
      through the StepResult only, with no in-progress `artifact_written`
      event. This supersedes Design §4's "each write … emits the existing
      `artifact_written` event" for reviewer files.
    - **Reviewer prompts serve both callers.** The specialist prompts keep
      their review dimensions. When host materials are present, they read
      scope from the materials. When spawned directly (`cody`, `cosmo`), they
      establish scope as they did before this plan.
  - Alternatives: keep the Stage 6 behavior. The two independent reviews
    rejected that (`mid-review-1-codex.md`, `mid-review-1-claude.md`).
  - Why: INV-001, INV-003, INV-005, AC-016.
  - Decided by: coordinator, amend-on-record, 2026-09-24
  - Supersedes: the Stage 6 host-only lens triage, and the implicit
    "base = resolved ref tip"

- **D-026 - Review before execution: no reviewed code runs while review evidence is open** *(Added 2026-09-24 after mid-review-6)*
  - Decision:
    - The QM run order becomes:
      1. Capture the snapshot.
      2. Export the review base's project files (`.cosmonauts/`, `.pi/`, `AGENTS.md`/`CLAUDE.md`, `package.json`, the gate-owned paths) from the **operator's source repository** with read-only plumbing (`GIT_OPTIONAL_LOCKS=0`), into a host-owned directory beside the clone.
      3. Build every quality runtime from the framework plus that export: the QM **and every panel spawn**, never `getRuntime(clone)`.
      4. Write and digest the materials.
      5. Run the QM assessment (analysis plus the panel).
      6. Seal the reviewer evidence and verify every digest.
      7. Only then run `qualityReview.prepare` and `checks` in the clone.
      8. The host merges the check results into the Checks section. A failing or not-run check forces `not-ready`.
      9. Finalize.
    - No reviewed code executes before step 6. The residual (steps 7–8 execute reviewed code with host authority) is exactly N-004.
    - Quality sessions use an untrusted in-memory Pi `SettingsManager`, so no project `.pi/settings.json`, packages or `npmCommand` apply. They take no project `APPEND_SYSTEM.md`. Their project context files come from the base export.
    - All `git show base:` reads that decide gate-owned items use the operator's source repository, not the clone.
    - If the pinned analysis provider needs installed dependencies to produce a correct verdict, a base-owned `qualityReview.analysisPrepare` argv may run before step 5. It must not execute project lifecycle scripts (for example `bun install --frozen-lockfile --ignore-scripts`), and the report records it. This repository probes whether it is needed.
    - The performance lens no longer receives check durations. P1 still requires measured or reproduced cost (B-010), so without it a performance finding is at most P2.
  - Alternatives: keep patching each route by which executed reviewed code reaches the host. Rounds 4–6 each found a new route (argv, scripts, domains, object-database tampering, `.pi` settings, materials races), so that approach does not converge. An OS sandbox is excluded by the spec (N-004 option B).
  - Why: INV-001, INV-004, INV-005, D-025. The change must not choose what reviews it or what the host loads.
  - Decided by: coordinator, amend-on-record, 2026-09-24
  - Supersedes: D-004's "prepare … before any check" placement before assessment; D-012's "check durations are the measured-cost evidence available to the performance lens"; Design §6 step 1's "check results from `checks.md`" as QM input; the TASK-737 base export built from the clone

- **D-027 - Threat model: accidental damage, not a hostile change** *(human ruling)*
  - Decision:
    - The QM protects against accidental damage by careless agents and
      accidental process behavior. It does not protect against a
      deliberately hostile reviewed change.
    - A finding of the form "a malicious change could tamper with the host,
      the materials or the Git objects to subvert review" is recorded as a
      known residual limit and is not remediated, unless the same outcome can
      also happen by accident.
    - Reviewer prompts state this bound.
    - TASK-726..728 are finished under it.
  - Alternatives: keep remediating hostile-change routes (mid-reviews 4–6).
    That does not converge without an OS sandbox, which the spec excludes.
  - Why: bounds INV-001..INV-005 to the incidents that motivated the plan
    (spec Purpose), all of which were accidental.
  - Decided by: human, 2026-09-24 (relayed by Shepherd; the user accepted
    "all recommended")
  - Residual limits recorded under it (reachable only by a hostile change):
    - Claude mid-review-6 HIGH-2 (tampering with the clone object database).
      Moot after D-026, since the base export comes from the source repository.
    - Codex mid-review-6 HIGH-1 (a surviving detached process rewriting the
      export or materials after checks).
    - Claude mid-review-6 LOW-3 (materials edited after verification).
    - Any change-authored code that deliberately escapes its process group.

- **D-028 - INV-001 and host-run checks** *(human ruling, from N-004)*
  - Decision: option A. INV-001's by-construction guarantee covers the QM,
    its agents and the host code. Host-run prepare and checks execute the
    reviewed code with the operator's own authority, and the report says so.
    The spec records this beside the Intent.
  - Alternatives: (B) an OS sandbox for checks, which reverses a spec
    exclusion; (C) dropping host-run checks, which amends AC-016.
  - Why: INV-001 as ratified, read with D-027.
  - Decided by: human, 2026-09-24 (relayed by Shepherd)

- **D-029 - The committed baselines are re-anchored once at `main`** *(human ruling, from N-001)*
  - Decision: option A.
    - A coordinator probe on local `main` `29fc0ce` (this plan's merge-base)
      found findings above the adopted floors in all three categories:
      dead-code 3, dupes 15 and health 217 unbaselined findings.
    - All three files are refreshed once at `main`, in their own commit, with
      the reason recorded in `.fallow-baselines/manifest.json` provenance.
    - D-008's "adopted unchanged" is amended accordingly. Every later refresh
      still requires the explicit, reasoned script.
    - The refresh was run from a worktree of `main`, because the refresh script
      analyzes its `--root` rather than `--base`. That script defect is
      remediated by task.
  - Why: INV-005 ("findings already present in touched files never fail it").
  - Decided by: human, 2026-09-24 (relayed by Shepherd)
  - Amends: D-008

- **D-030 - Backfill amendment 3 ratified; the stray catalog package** *(human ruling, from N-002 and N-003)*
  - Decision:
    - `missions/reviews/knowledge-surface-backfill-amendment-3.md` is
      ratified.
    - The catalog package `~/.cosmonauts/packages/coding`, installed
      2026-09-23 16:44Z, was not installed by the user. Shepherd moved it to
      a backup under `.shepherd/backups/`, and `coding` now resolves to the
      bundled domain.
    - Its origin is recorded as a finding: possibly a test or run writing to
      the real HOME during the framework-health work. This is a follow-up and
      is not chased here.
  - Decided by: human, 2026-09-24 (relayed by Shepherd)

- **D-031 - B-010 host calibration is defense in depth over model prose** *(Added 2026-09-24 after Stage 7 review 2)*
  - Decision:
    - AC-013 (ratified) requires reviewer *guidance*: a performance P1 needs a measured or reproduced cost, and no lens is the only judge that closes its own finding. The reviewer and QM prompts deliver that guidance.
    - The host calibration added in TASK-726 and TASK-747 is defense in depth over free-form markdown written by models. It must meet two hard floors:
      1. It never produces or permits a false `ready`.
      2. It never silently drops a reviewer finding. Every reviewer finding ID ends up as its own entry in Findings or in Out-of-range observations, or as a dismissal with evidence from a different lens, or the host carries it over. *(Placement of dismissals superseded by D-032, 2026-09-24: evidenced dismissals live only in Out-of-range observations, and any Findings content blocks `ready`.)*
    - Unsupported performance priorities above P2 (P0 and P1) are capped or raised as human items.
    - Recognizing whether a quoted `measuredCost` or `closureEvidence` string is a genuine measurement, or evidence from a different lens, remains a heuristic. Its known misses are recorded limits, not blockers: a measurement-looking code line, or a same-lens evidence quote repeated by the QM. The accidental threat model (D-027) bounds them. The ratified guidance and the independent panel are the primary control.
  - Alternatives: keep hardening the text parsing for each new phrasing (Stage 7 reviews 1–2). That does not converge on free-form prose.
  - Why: AC-013 read with D-027, INV-003 and B-005.
  - Decided by: coordinator, amend-on-record, 2026-09-24

- **D-032 - Findings is fail-safe; dismissals live only in Out-of-range observations** *(Added 2026-09-24 after Stage 7 review 4)*
  - Decision:
    - **Findings blocks `ready` whenever it has content.** Any content except the no-findings sentinel blocks `ready`, whatever its shape: bullets, numbered items, prose, sub-bullets or subheadings. The sentinel is `None recorded.`, with or without a bullet, and matching is case-insensitive. The host does not parse dismissals or closures in Findings. A dismissal written there is simply content, and it blocks. The QM prompt names the sentinel.
    - **Evidenced dismissals are recorded only under Out-of-range observations.**
      - An entry counts as a dismissal only when the dismissal is stated positively right after its leading ID: `dismissed`, `resolved` or `closed`.
      - It is closed only by a cited `closureEvidence` from a lens other than *every* lens that raised that ID. The check is independent of reviewer completion order, and the evidence may sit on any line of the entry.
      - A dismissal-worded entry that fails this check raises a human item.
      - Other Out-of-range entries are observations and do not block `ready`.
    - **Floor 2 is unchanged.** Every reviewer finding ID must appear as the leading ID of an entry in Findings or Out-of-range observations; otherwise the host carries it over with a human item.
    - **The P0/P1 cap applies to every copy of an ID inside Findings and Out-of-range observations, and only there.** It never rewrites Gates or any other section. A cap that cannot be applied in place becomes a human item.
    - **A `##` section outside the defined report sections that has content blocks `ready`.** This fails safe.
    - **Recorded limit.** Placing an in-range reviewer finding under Out-of-range observations is QM judgment. The ratified prompt guidance and the independent panel are the primary control, bounded by D-027.
    - **Recorded limit** *(added 2026-09-24 after Stage 7 review 5)*: the host applies the P0/P1 cap by lens identity, to findings raised by the performance lens. A performance-cost claim made by another lens (generalist, security, UX) is recognized only from its text, which D-031 leaves to heuristics. Every reviewer prompt carries the P0/P1 rule, and that guidance is the control for those claims.
    - **Duplicated sections fail safe** *(added 2026-09-24 after Stage 7 review 5)*: a defined section heading that appears more than once blocks `ready`.
    - **Recorded limit** *(added 2026-09-24 after Stage 7 review 12)*: the host owns the Reviewer models section, and on the unindexed path it replaces that section with host-observed identities. QM prose written there is not carried over. Floor 2 still protects every reviewer finding ID, and the raw assessment is kept in the run artifacts.
  - Alternatives:
    - Keep D-031's placement: dismissals recognized in either section, and Findings blocking only on unaccounted or open entries. Stage 7 reviews 3 and 4 each found a new false-`ready` shape: non-bullet text, an indented sub-finding riding a closed entry, keyword-only closure, and closure that depended on reviewer order. Parsing closure inside Findings does not converge on free-form prose, which is the same reason D-031 gives.
  - Why: D-031 floor 1, which carries INV-003 and the D-025 host-verified `ready`, needs a check that fails safe by construction. AC-013's independent-closure guidance still applies, and the host enforces it where dismissals now live.
  - Decided by: coordinator, amend-on-record, 2026-09-24 (supervisor concurred)
  - Supersedes: D-031 floor 2's allowance of dismissals in Findings; TASK-748 AC #2 and TASK-749 AC #1 as to dismissals in Findings.

- **D-034 - Codex is back through the work account on `gpt-5.6-sol`; the cross-family closure runs now** *(human ruling, amends D-033)*
  - Decision:
    - Codex is available again through the user's work account. GPT-6 models are not available there, so every codex use runs on `gpt-5.6-sol`:
      - reviews: `codex exec -m gpt-5.6-sol -c model_reasoning_effort=high --sandbox read-only`;
      - Drive: `COSMONAUTS_DRIVER_CODEX_ARGS='-m gpt-5.6-sol -c model_reasoning_effort=medium'`.
    - The in-flight claude-cli trial finishes, and its findings are recorded. Later Drive runs may use codex again.
    - The cross-family codex closure review no longer waits for 2026-09-30. It runs as part of the Stage 9 closure. The TASK-728 closure is therefore two channels, as D-002 requires: a Claude subagent on Opus 5.5 and read-only `codex exec` on `gpt-5.6-sol`.
  - Alternatives: keep the D-033 all-Claude closure with codex deferred.
  - Why: this restores D-002's model-family diversity without waiting.
  - Decided by: human, 2026-09-24, relayed by Shepherd
  - Supersedes: D-033's deferral of the codex channel, and D-002's `gpt-6-sol` model name (the command is otherwise unchanged).

- **D-033 - Codex is out of credits: Opus 5.5 replaces codex until 2026-09-30** *(human ruling, from N-005)* *(Amended by D-034, 2026-09-24: codex is back on `gpt-5.6-sol`, and the cross-family closure runs in Stage 9.)*
  - Decision:
    - From 2026-09-24, every step that used codex runs on Opus 5.5 instead.
      - **Drive workers** use `--backend claude-cli` with `COSMONAUTS_DRIVER_CLAUDE_ARGS="--model claude-opus-5-5"`.
      - **The D-002 read-only `codex exec` review channel** becomes a second independent Claude subagent on Opus 5.5. It runs beside the existing Claude channel, with a different framing.
    - The cross-family (non-Claude) closure review for TASK-728 is **pending until 2026-09-30**, when codex credits reset. Everything else is finished and verified before then. The branch is not merged.
  - Alternatives: wait for the codex reset before continuing; buy credits now.
  - Why: D-002's two-channel correctness/liveness review is kept. Only its model-family diversity is deferred, and that deferral is recorded.
  - Decided by: human, 2026-09-24, relayed by Shepherd
  - Supersedes: D-002's codex channel and worker model, until 2026-09-30 only.

- **D-018 - AC-003 exempts exactly the host-written plan summary** *(from H-001)*
  - Decision: option A. AC-003 exempts only the host-written new file
    `missions/plans/<slug>/qm-runs/<runId>.md`, which never overwrites and is
    never visible to an agent. Everything else stays byte-identical. The
    ignored run artifacts were never covered by AC-003. The spec's AC-003 is
    amended in place.
  - Alternatives: (B) keep AC-003 literal and move the summary out of the
    checkout, amending AC-007 and D-001 item 2.
  - Why: INV-001 and INV-003 both hold. The reviewed state is untouched and
    the verdict is durable.
  - Decided by: human, 2026-09-23 (relayed by Shepherd)
  - Supersedes: AC-003 letter without exception; the H-001 draft

- **D-019 - Unconfigured `qualityReview` produces visible not-configured items** *(from H-003)*
  - Decision: option A. Unconfigured `checks` or `diverseReviewerModel` yields
    a visible "not configured" item plus a human-decision item naming the
    missing key, and the verdict cannot be `ready`. Nothing is silent and
    nothing is refused. This repository configures both. The spec's AC-016 is
    amended in place.
  - Alternatives: (B) refuse with setup guidance; (C) model-proposed check
    commands, which weaken INV-001.
  - Why: INV-001 (no model-chosen argv) and INV-003 (visible outcome).
  - Decided by: human, 2026-09-23 (relayed by Shepherd)
  - Supersedes: the H-003 draft; the unqualified letter of AC-016

- **D-020 - Isolation is a private local clone, not a linked worktree** *(from H-002)*
  - Decision: option A. D-001 item 3 now reads "an isolated detached checkout
    (a private local clone)", and D-004 is the mechanism.
  - Alternatives: (B) a linked worktree sharing refs, stash and hooks with the
    operator repository, which would narrow INV-001.
  - Why: INV-001 names refs, and a linked worktree shares them.
  - Decided by: human, 2026-09-23 (relayed by Shepherd)
  - Supersedes: D-001 item 3's "detached worktree" wording; the H-002 draft

- **D-021 - INV-001's "QM run" starts at the QM launch boundary** *(from H-004)*
  - Decision: option A. The framework bootstrap that every command performs is
    outside the QM run, and the snapshot is taken before any QM or panel
    session exists (D-003). The spec records this interpretation beside the
    Intent.
  - Alternatives: (B) the stricter reading, which needs a separate
    CLI-bootstrap redesign.
  - Why: INV-001 as ratified; it keeps a pre-import classifier out of scope,
    since that cannot be made airtight (review-2 PR-004).
  - Decided by: human, 2026-09-23 (relayed by Shepherd)
  - Supersedes: the H-004 draft

- **D-022 - AC-015 "nothing links" covers live surfaces** *(from H-005)*
  - Decision: option A.
    - In scope: prompts, skills, docs, code, tests other than frozen fixtures,
      active plans and `ROADMAP.md`.
    - Kept as historical text: frozen fixtures, curated `knowledge/` records,
      evidence reports and archived plans.
    - `missions/archive/reviews/qm/shared-rounds/README.md` maps each old path
      to its new home.
    - The spec's AC-015 is amended in place.
  - Alternatives: (B) rewrite every occurrence, including a ledger round and
    digest re-pin for curated records, and a fixture ruling.
  - Why: history stays byte-stable, and live readers are redirected.
  - Decided by: human, 2026-09-23 (relayed by Shepherd)
  - Supersedes: the H-005 draft; AC-015's unqualified "nothing links"

- **D-023 - Execution-liveness registers this plan's QM descendants when it rebases** *(acknowledged)*
  - Decision: when `execution-liveness` rebases onto this plan, its plan gets
    an amend-on-record entry that registers the QM launcher's host-run
    prepare and check processes and the private clone as descendants of the
    outer QM attempt (R-008).
  - Why: this keeps a single owner and descendant model.
  - Decided by: human acknowledgement, 2026-09-23 (relayed by Shepherd)

## Behaviors

### B-001 - Every agent-starting route enforces caller authority

- Source: AC-001, AC-002
- Observer: an agent using an orchestration tool, and a lead or operator using an allowed route
- Entry point: the `spawn_agent`, `chain_run` and `run_driver` tools, and the QM review session
- Outcome:
  - A forbidden target in any sequential, bracket or fan-out position of a
    `chain_run` expression is refused before any run is allocated. So is a
    `run_driver` call from a caller not allowed to start `worker`, and a
    forbidden `spawn_agent`. Each refusal names the caller and the target.
  - Leads whose definitions list the target, and top-level CLI invocations,
    behave as before.
  - A QM session cannot start `fixer`, `coordinator`, `worker`, `verifier` or
    `integration-verifier` by any route, and has no process tool with which to
    launch the CLI.

### B-002 - The QM reviews a stable private snapshot, or refuses

- Source: AC-003, AC-004
- Observer: an operator with staged, unstaged, deleted and untracked work who keeps using the checkout
- Entry point: `cosmonauts -a coding/quality-manager`, a `spawn_agent` of the QM, and the terminal QM stage of a named or raw chain
- Outcome:
  - The review sees the captured uncommitted state, including untracked files
    as additions.
  - After the run, the operator checkout's HEAD, refs, `.git/index` bytes,
    tracked files, uncommitted edits and untracked files are byte-identical to
    before. That holds even when the stat cache was stale at capture. The only
    exception is the D-018 plan summary.
  - An unsupported layout, unsafe symlink, unstable capture, failed dependency
    preparation, a QM in a non-terminal or parallel position, or a setup
    failure each produce a persisted refusal or failure report with a named
    reason, never a run in the shared checkout.

### B-003 - Reviewer evidence belongs to the observed child and run

- Source: AC-005, AC-006
- Observer: an operator comparing concurrent QM runs, and the QM synthesizing its panel
- Entry point: the run's `artifacts/qm/reviewers/` files and the final QM report
- Outcome:
  - Each reviewer artifact records its run, lens, spawn, session, resolved
    role, actual model, digest and full final text.
  - Two concurrent runs never write, modify or delete each other's files.
  - No `missions/reviews/*-round-N.md` file is written.
  - A reviewer that ends silently, times out, runs twice, reports for another
    run or fails to persist fails the assessment. Stale content is never
    substituted.

### B-004 - A complete durable verdict exists on every exit

- Source: AC-007
- Observer: an operator after a ready, not-ready, failed, refused, cancelled or interrupted QM run
- Entry point: `cosmonauts run status`, the `run_status` tool, the run's `artifacts/qm/final.md`, and an active plan's `missions/plans/<slug>/qm-runs/<runId>.md`
- Outcome:
  - A complete report exists before any fallible work begins and is replaced
    atomically before the run's terminal event.
  - Status points to the full report. The plan summary exists for every exit
    of a plan-scoped run, including inline chains (D-016).
  - The stage summary stays the same bounded 200-character value.
  - After a crash, the persisted lifecycle names the phase reached and any
    retained workspace.

### B-005 - A QM report is actionable without transcript recovery

- Source: AC-008
- Observer: a coordinator or human triaging findings
- Entry point: the run's `artifacts/qm/final.md` and the plan summary
- Outcome: the report states:
  - the verdict;
  - each check with its argv, exit code, duration and output excerpt;
  - each gate state with evidence;
  - every finding, with id, priority, severity, `file:line`, suggested fix, and
    a concrete failing input where one exists;
  - human-decision items, in their own section, including gate-owned-file
    changes (D-009) and not-configured items (D-019);
  - out-of-range and pre-existing observations, marked as such;
  - which models reviewed, as the host observed them;
  - a positive statement of what was checked.

  A missing index block is reported as "index unavailable" without losing the
  verdict (D-017).

### B-006 - The QM makes one assessment pass and no remediation

- Source: AC-009, AC-016
- Observer: an operator inspecting tasks, plan status, Git history and the report after a QM run
- Entry point: QM-ending named chains and a direct QM review
- Outcome:
  - Configured project checks, direct gate resolution, panel triage and the
    applicable specialists all run once.
  - The QM creates no task, starts no implementation or verifier role, makes
    no commit, changes no plan status and runs no second review round.
  - The report ends with caller-owned remediation advice.

### B-007 - Changed-scope analysis separates inherited from introduced debt

- Source: AC-010
- Observer: an implementer touching a file with findings recorded in the committed baselines
- Entry point: the `analysis_audit` tool
- Outcome:
  - A change that only touches files with baselined findings passes each
    category.
  - A change that introduces a new finding fails that category.
  - A missing or unreadable baseline file fails visibly.
  - No review writes a baseline. The explicit refresh script requires a base
    and a reason and records provenance.

### B-008 - A change cannot silence a gate without a human seeing it

- Source: AC-011
- Observer: an implementer or reviewer adding a suppression directive or editing a gate-owned file
- Entry point: the project's suppression check script, and the QM report
- Outcome:
  - An added `fallow-ignore`, `biome-ignore`, `eslint-disable`, `@ts-ignore`
    or `@ts-expect-error` (or a configured equivalent) fails unless it is
    registered in the base revision's registry.
  - A same-change registry edit does not clear it.
  - Existing and moved registered directives pass.
  - A change to a gate-owned file appears as a human-decision item and blocks
    `ready`.

### B-009 - Baseline and debt documentation agree

- Source: AC-012
- Observer: a maintainer preparing baseline maintenance or debt paydown
- Entry point: `docs/fallow-exceptions.md`, `ROADMAP.md` item `analysis-debt-paydown`, and `.fallow-baselines/manifest.json`
- Outcome: all three describe the same three baseline files, the current debt
  state, the suppression registry and the explicit reasoned refresh process. In
  particular, `docs/fallow-exceptions.md` no longer says that no duplication
  baseline exists.

### B-010 - Specialist severity and closure require independent evidence

- Source: AC-013
- Observer: a coordinator triaging specialist findings
- Entry point: the QM report
- Outcome:
  - A performance finding is P1 only when it cites a measured or reproduced
    cost; otherwise it is at most P2.
  - No finding is closed or dismissed on the evidence of the lens that raised
    it alone.

### B-011 - Every completed panel records model-family diversity

- Source: AC-014
- Observer: an operator reading a completed, failed or refused QM report
- Entry point: the QM report's reviewer-models section
- Outcome:
  - A completed assessment includes one generalist whose host-observed model
    is from a different family than the default implementer, and records every
    reviewer's model.
  - A same-family, unresolvable or substituted model fails visibly.
  - Unconfigured diversity follows D-019.

### B-012 - Legacy records are archived and callers describe the review-only contract

- Source: AC-015, AC-016
- Observer: an operator using named chains and docs, and a maintainer following history
- Entry point: the named chains in `bundled/coding/chains.ts`, lead and skill guidance, `docs/orchestration.md`, `external-commands/implement-plan.md`, and `missions/archive/reviews/qm/shared-rounds/`
- Outcome:
  - All eleven shared round files have one archive home, and their Git history
    stays reachable with `--follow`.
  - Live surfaces no longer link to the old paths (scope per D-022).
  - QM-ending chains complete with a findings report.
  - Callers route remediation to tasks, Drive and independent review, and
    never claim the QM fixes code, completes plans or leaves a clean tree.

## Design

### 1. Authority and the restricted review profile

- Keep `isSubagentAllowed` as the single role predicate, with shared target
  resolution and denial formatting beside it.
- `chain_run` authorizes every resolved sequential, bracket and fan-out member
  after `parseChain` and before allocating a run.
- `run_driver` requires `worker` authority before task discovery or run
  allocation.
- `spawn_agent` keeps its existing check.
- An unknown caller or target fails closed. Top-level CLI paths, which have no
  caller, are unchanged.

A host-created session profile, never a model parameter, narrows the effective
Pi tools for the QM and every panel child:

```ts
interface QualityReviewSessionProfile {
  readonly run: { readonly scope: "chain"; readonly runId: string };
  readonly workspaceRoot: string;      // private clone, the session cwd
  readonly materialsRoot: string;      // D-004 review materials, read-only
  readonly hostRunStoreRoot: string;   // operator-side run store; never exposed to sessions
  readonly planSlug?: string;
  readonly allowedPanelRoles: readonly ReviewLens[];
  readonly diverseReviewerModel?: string;
}
```

- All quality sessions get read, grep, find and ls.
- The QM additionally gets the analysis-capability tools, with the D-004
  in-memory consent authorization, and `spawn_agent` limited to the four
  lenses.
- Session assembly applies the profile after resolving the definition. Any
  quality session that ends up with `bash`, `edit`, `write`, `chain_run`,
  Drive, or task or plan mutation is refused (R-005).
- `spawn_agent` from a quality parent propagates the profile. Absence or
  mismatch refuses the child.
- `hostRunStoreRoot` is what the spawner and session factory use for run
  records and transcripts, while children use `workspaceRoot` as their `cwd`
  (DESIGN-ATTACK-005).

### 2. Launch boundary, snapshot and review materials

- A new `lib/orchestration/quality-review-launch.ts` recognizes the resolved
  canonical role and wraps each entry point: the CLI agent launch, the
  `spawn_agent` of the QM, the durable terminal stage, and the inline-chain
  terminal stage (D-016). Each routes to one launcher.
- The launcher allocates the durable run and lifecycle first (Design §3), then
  builds the snapshot.
- `lib/orchestration/quality-review-workspace.ts` implements D-004 through
  injected Git and filesystem ports. Every source read runs with
  `GIT_OPTIONAL_LOCKS=0` and uses plumbing only: `ls-files -s`,
  `diff-index --cached --no-ext-diff`, `hash-object` without `-w`, and
  `cat-file`. There is no `status`, no `update-index` and no `add`.
- The clone gets the base as a local ref before `origin` is removed.
- The review materials (base SHA, range, changed files, the full diff including
  untracked additions, and base copies of changed files) are written under
  `materialsRoot`, a sibling of the clone inside the same reserved temp
  directory.
- Preparation: `qualityReview.prepare` argv entries run in the clone before any
  check, through the same host process port as the checks.

### 3. Persisted QM lifecycle and workspace ownership

- Allocation creates the run record and `qm/lifecycle.jsonl`. Phases follow
  D-013.
- Each event records the timestamp, previous phase, workspace path, active and
  settled child IDs, artifact digests and disposition. There is no
  owner-process identity: execution-liveness owns that.
- On `allocated`, host code writes a conservative complete `final.md` and, for
  an active plan, the per-run plan summary.
- The QM-specific executor catches setup, preparation, check, model, child,
  cancellation and persistence failures. It then:
  1. validates or generates the final report (D-017);
  2. atomically replaces its own provisional files;
  3. appends `finalized`;
  4. removes the workspace when no child is live;
  5. only then returns its `StepResult`.
- A timed-out child leads to `retained` and is named in the report. It is never
  cancelled.

### 4. Host-owned reviewer and report artifacts

- A path-safe sink rooted at the loaded `RunRecord.artifactsDir` rejects
  absolute, traversal, symlink-escape and cross-run paths. Only host code holds
  it.
- Each write is atomically renamed and emits the existing `artifact_written`
  event. `StepResult.artifacts` returns those references.
- For a quality parent, detached `spawn_agent` completion handling calls the
  sink before delivering the completion message, using this record:

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

- The first successful completion per expected lens exclusive-creates its
  artifact. Any other case is a report-integrity failure: a duplicate lens, an
  unexpected role, empty text, a model mismatch, the wrong run, a timeout or a
  persistence failure.
- Ordinary durable stages keep returning `artifacts: []`.

### 5. Final report, status, and terminal matrix

- The QM returns its final markdown with the AC-008 sections and a
  `COSMO_QM_REPORT` index block (`QualityReportIndex`: verdict, checks, gates,
  findings, human items, observations, reviewed, reviewer models). D-017
  governs index defects.
- Malformed output is kept as `raw-final.md`.

| Isolation/assessment state | Durable run outcome | Report verdict |
|---|---|---|
| isolation or preparation refused | blocked | `refused` with reason |
| assessment ready | completed | `ready` |
| findings, blockers, not-configured, or gate-owned-file items | completed | `not-ready` |
| execution or report-integrity failure | failed | `failed` |
| caller cancellation | cancelled | `failed`, cancellation named |

- `run status` and `run_status` project the existing step `ArtifactRef` values
  and point to `qm/final.md`, as a read-only projection.
- The plan summary contains the run and verdict, an artifact link, checks and
  gates, finding IDs, human items and reviewer models.
- Plan identity comes only from an explicit completion label or plan-session
  context. When it is absent or ambiguous, the run is planless and writes no
  summary.

### 6. One-pass assessment, checks and model policy

The QM prompt becomes Setup → Assess → Report:

1. Read the host-provided context: run ID, materials location, check results
   from `checks.md`, and the base SHA.
2. Resolve analysis capability states and run the bound capabilities against
   the literal base SHA.
3. Triage which specialists apply, from the changed-file list and the diff.
4. Start the generalist and the applicable specialists once through
   `spawn_agent`. The host overrides the generalist's model with
   `diverseReviewerModel`.
5. Read the correlated completion texts, synthesize the report, and stop.

Reviewer prompts:

- Read scope from the materials instead of shell `git`.
- Return the report as final text; there are no output paths.
- Follow the P1 and closure rules (B-010).

Config, validated in `lib/config`:

```ts
interface QualityReviewConfig {
  readonly prepare?: readonly QualityReviewCommand[];
  readonly checks?: readonly QualityReviewCommand[];
  readonly diverseReviewerModel?: string;
  readonly modelFamilies?: Readonly<Record<string, readonly string[]>>; // extends the shipped provider-alias table
}
interface QualityReviewCommand { readonly id: string; readonly command: string; readonly args: readonly string[] }
```

Unconfigured `checks` or `diverseReviewerModel` follow D-019 option A.

### 7. Baseline-aware changed-scope audit

Per D-008:

- Only the Fallow adapter's `changed-scope-audit` builder adds the three
  baseline arguments, before the common JSON and failure flags.
- Missing or unreadable files fail visibly.
- `manifest.json` records digests and provenance.
- `scripts/update-fallow-baselines.ts` is the only writer, and it requires a
  base and a reason.

A live probe before enforcement confirms that each flag is accepted and that
the verdict and envelope stay consistent (R-010).

### 8. Base-owned suppression registry and gate-owned files

A pure policy module in `lib/quality/suppression-policy.ts` and a project check
in `scripts/check-new-suppressions.ts` implement D-009:

- The registry is `.cosmonauts/suppression-exceptions.json`, seeded with the
  current intentional directives.
- The check reads added lines against the explicit base and loads the registry
  from the base revision.
- The QM launcher computes gate-owned-file changes from the changed-file list
  and injects them into the report as human-decision items (B-008).

### 9. Documentation, callers and legacy migration

- Reconcile `docs/fallow-exceptions.md`, `.fallow-baselines/manifest.json` and
  the roadmap item (B-009).
- Move the eleven shared files (three general, three security, three UX, two
  performance) to `missions/archive/reviews/qm/shared-rounds/` with `git mv`.
  Add a README mapping old paths to new. The two plan-qualified
  `analysis-gate-coverage-*-round-1.md` files stay.
- Repair links on live surfaces per D-022.
- Update named-chain descriptions, `cody.md`, the spawning and dispatch skills,
  `docs/orchestration.md`, `README.md`, `AGENTS.md` and
  `external-commands/implement-plan.md`. QM-ending chains now stop at findings,
  and remediation is separate.

## Files to Change

- `domains/shared/extensions/orchestration/authorization.ts` — shared target resolution and denial facts.
- `domains/shared/extensions/orchestration/chain-tool.ts` — authorize every chain member before allocation.
- `domains/shared/extensions/orchestration/driver-tool.ts` — require worker authority before task or run allocation.
- `domains/shared/extensions/orchestration/spawn-tool.ts` — route the canonical QM through the quality launcher; for quality parents, persist correlated panel completion text before notifying.
- `domains/shared/extensions/orchestration/run-control-tools.ts` and `cli/run/subcommand.ts` — render QM report pointers.
- `cli/main.ts` and `cli/chain-execution.ts` — route standalone and chain QM launches through the launcher.
- `lib/agents/types.ts` and `lib/agents/session-assembly.ts` — apply the host-owned effective tool profile without changing ordinary agents.
- `lib/orchestration/session-factory.ts` — return the host-observed resolved model identity; honor the profile's tools and `hostRunStoreRoot`.
- `lib/orchestration/agent-spawner.ts`, `lib/orchestration/spawn-completion-loop.ts`, `lib/orchestration/spawn-tracker.ts` — carry quality context and correlated full-text and model evidence; timeouts still never cancel.
- `lib/orchestration/chain-runner.ts` — the inline-chain terminal QM stage delegates to the launcher (D-016).
- `lib/orchestration/durable-chain-compiler.ts` — reject a QM in a non-terminal or parallel position; mark the terminal QM step.
- `lib/orchestration/durable-chain-runner.ts` — delegate the marked step to the QM executor and return its artifacts; summaries unchanged.
- `lib/orchestration/types.ts` — the narrow quality context and resolved-model evidence.
- `lib/orchestration/quality-review-launch.ts` (new) — role recognition, entry-point routing, refusal.
- `lib/orchestration/quality-review-workspace.ts` (new) — capture, clone, overlay, re-sample, materials, prepare.
- `lib/orchestration/quality-review-checks.ts` (new) — run configured argv in the clone and capture evidence.
- `lib/orchestration/quality-review-artifacts.ts` (new) — path-safe sink, lifecycle, reviewer evidence, workspace removal.
- `lib/orchestration/quality-review-report.ts` (new) — report validation and generation, plan summaries, gate-owned-file items.
- `lib/orchestration/quality-review-run.ts` (new) — the executor composing allocation, snapshot, checks, the restricted QM session and finalization.
- `lib/orchestration/quality-review-models.ts` (new) — the family alias table, config extension and diversity check.
- `domains/shared/extensions/project-tools/analysis-consent.ts` — accept an explicit in-memory authorization for a verified snapshot of a consented root; never write consent.
- `domains/shared/extensions/project-tools/fallow-provider.ts` — pass the three baselines for changed-scope audit only.
- `lib/durable-runtime/types.ts`, `lib/durable-runtime/controller.ts` — expose existing step artifact refs in normalized status; no lease, attempt or settlement changes.
- `lib/config/types.ts`, `lib/config/loader.ts` — validate the `qualityReview` block.
- `.cosmonauts/config.json`, `.cosmonauts/config.example.json` — this repository's `prepare`, `checks`, `diverseReviewerModel`; documented example.
- `bundled/coding/agents/quality-manager.ts` — subagents limited to the four lenses; description is review-only.
- `bundled/coding/prompts/quality-manager.md` — Setup → Assess → Report.
- `bundled/coding/prompts/reviewer.md`, `security-reviewer.md`, `performance-reviewer.md`, `ux-reviewer.md` — scope from materials, final-text reports, P1 and closure rules.
- `.fallow-baselines/manifest.json` (new) — provenance and digests of the three existing files.
- `scripts/update-fallow-baselines.ts` (new) — explicit reasoned refresh.
- `lib/quality/suppression-policy.ts` (new), `scripts/check-new-suppressions.ts` (new), `.cosmonauts/suppression-exceptions.json` (new).
- `package.json` — expose the suppression check and the baseline refresh.
- `docs/fallow-exceptions.md`, `ROADMAP.md`, `AGENTS.md` — baseline, debt, suppression and project-check guidance.
- `bundled/coding/chains.ts`, `bundled/coding/prompts/cody.md`, `domains/shared/skills/spawning/SKILL.md`, `domains/main/skills/dispatch/SKILL.md`, `docs/orchestration.md`, `README.md`, `external-commands/implement-plan.md`, `external-skills/cosmonauts/SKILL.md` — findings-only completion and separate remediation.
- The eleven files `missions/reviews/{review,security-review,ux-review}-round-{1,2,3}.md` and `missions/reviews/performance-review-round-{1,2}.md` — `git mv` to `missions/archive/reviews/qm/shared-rounds/`, plus a `README.md` there.
- Live-surface old-path references found by an exact tracked search at Stage 8, per D-022.

## Risks

- **R-001 — Human rulings recorded.** D-018..D-022 settled the five questions
  on ratified ground on 2026-09-23. A new collision with ratified ground is
  halted and escalated the same way.
- **R-002 — Generic isolation scope creep.** If delivery needs
  `WorktreeSpec.isolated`, scheduler worktrees, merge finalizers, a declared
  panel graph or mutable parallel execution, stop under D-003.
- **R-003 — Snapshot fidelity varies across Git layouts.** Unsafe symlinks,
  sparse checkouts, submodules, rapid edits and unusual nesting refuse. Never
  copy approximately or fall back.
- **R-004 — Source writes during capture.** Any source command that is not
  plumbing, or runs without `GIT_OPTIONAL_LOCKS=0`, can rewrite `.git/index`.
  The B-002 stale-stat-cache case must go red if a porcelain command sneaks
  in.
- **R-005 — Shell authority reappears.** Any quality session that ends up with
  `bash`, `edit`, `write` or `chain_run`, or any model-chosen command, is an
  abort condition.
- **R-006 — Dependency preparation is slow or network-bound.** Record the
  duration in `checks.md`. If preparation routinely exceeds the QM's useful
  budget, pivot to a lockfile-keyed prepared cache outside the checkout. Never
  pivot to a link back into the operator checkout.
- **R-007 — Consent mapping widens authority.** The in-memory authorization
  must apply only to the verified snapshot of the exact consented real path,
  for one run. A reusable or persisted grant aborts the stage.
- **R-008 — Execution-liveness rebase.** This plan adds no leases, owner
  identity, start registration or settlement. Host-run prepare and check
  processes and the clone are new descendants of the outer QM attempt. When
  execution-liveness rebases, its plan needs an amend-on-record entry to
  register them (the human acknowledged on 2026-09-23 that it lands after this
  plan).
- **R-009 — Report persistence partially fails.** The provisional report
  precedes all fallible work. A failed replacement keeps the conservative
  record and fails the run.
- **R-010 — Pinned Fallow baseline semantics.** Live-probe all three flags
  against the committed files before enforcing them. If 2.54.2 rejects a file
  or reports contradictory envelopes, stop for a dependency decision.
- **R-011 — Suppression matching is weak or noisy.** Exercise named and
  equivalent directives, movement, target changes and same-change registry
  edits. Tune fingerprints within D-009; never weaken base ownership.
- **R-012 — Host artifact escape or forgery.** Path traversal, symlink escape,
  a duplicate lens, a missing correlation, or a path visible to an agent fails
  the run.
- **R-013 — Authority drifts at a new launch surface.** Any newly discovered
  agent-starting tool must use shared admission or be shown to be a genuine
  top-level path.
- **R-014 — Structural evidence is incomplete.** Boundary conformance is
  unbound and the architecture map is absent. Independent review must check
  module direction and keep policy out of the named complexity hotspots.

## Implementation Order

Each code stage follows red → green → refactor. Authored prompt and skill
outcomes are reviewed semantically, not by matching sentences. An authority is
removed only in the stage that delivers its replacement (SCOPE-SEQUENCING-001).

1. **Close the authority bypass — B-001 (routes only).** Make `chain_run` and
   `run_driver` admit only allowed targets, sharing facts with `spawn_agent`.
   Independent of D-018..D-022.
2. **Baseline-aware audit and documentation — B-007, B-009.** Live-probe the
   flags, pass the three committed baselines, add the manifest and refresh
   script, and reconcile the docs and the roadmap. Independent of D-018..D-022. This
   lands early so later stages are judged on introduced debt only.
3. **Base-owned suppression check — B-008 (check part).** Add the registry,
   policy and project check, and seed the current directives. Independent of D-018..D-022.
4. **QM run allocation, lifecycle and host artifacts — B-003 (sink), B-004.**
   Allocate the durable QM run (including D-016 for inline chains), write the
   conservative report first, add the lifecycle, path-safe sink, finalization
   ordering, refusal report and status pointers. The plan-summary write follows D-018.
5. **Private snapshot, materials and preparation — B-002.** Capture, clone,
   overlay, re-sample, materials, prepare, and the consent mapping, with every
   refusal reason. Follows D-020 and D-021.
6. **Review-only QM pass — B-001 (QM profile), B-003, B-005, B-006, B-008
   (report part).** Together, in one stage: the restricted profile,
   host-run checks, `spawn_agent`-only panel capture, the one-pass QM and
   reviewer prompts, gate-owned-file items, and removal of fixer, coordinator,
   verifier and integration-verifier. The unconfigured path follows D-019.
7. **Model diversity and calibration — B-010, B-011.** The family table and
   config, the generalist override, the diversity verdict over the model identity
   Stage 6 records (D-024), and the P1
   and closure guidance. The unconfigured path follows D-019.
8. **Archive and callers — B-012.** `git mv` the eleven files with a README,
   update chains, leads, skills, docs and the external flow, and walk
   QM-ending chains end to end. Link repair follows D-022.
9. **Independent closure under D-002 — B-001 through B-012.** A Claude subagent
   reviewer plus read-only codex (`gpt-6-sol`, high), framed as
   correctness/liveness. Attack every refusal, producer, lifecycle, authority,
   baseline, suppression and model-family negative. Any remediation goes
   through ordinary tasks and Drive and gets another independent review.

If a stage surfaces unexpected complexity, stop at the stage boundary and
record an amend-on-record entry, or halt and escalate if ratified ground is
touched. Do not press through.

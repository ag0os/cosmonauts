---
title: Establish a Clean Static-Health Baseline
status: active
createdAt: '2026-09-28T14:03:17.956Z'
updatedAt: '2026-09-28T15:40:00.000Z'
---

## Overview

This plan turns the ratified project-health audit into ordered implementation slices. It first freezes and reconciles the whole-project evidence, then removes all confirmed dead-code and duplicate-export findings, eliminates every confirmed one- or two-file clone family, characterizes and refactors production critical-complexity findings, records justified baselines for the remaining tiers, and finally refreshes the changed-scope floors and publishes a reproducible before/after health record.

The work is behavior-preserving. The shipped CLI, registered tools, public library entry points, persisted artifacts, recovery behavior, cancellation behavior, and error reporting remain observably unchanged. Structural findings are not made to disappear through configuration, suppressions, widened entry points, threshold changes, or production-scope changes.

The supplied Fallow 2.54.2 evidence at `64dca3c` is the starting inventory, not an assertion that findings still reproduce. Each implementation slice re-runs and traces its owned findings through the project analysis surface immediately before editing. A finding that no longer reproduces is recorded as unresolved and is not claimed as fixed. A finding that reproduces but cannot be traced hard-stops for human review (D-013); it is never quietly left in place or quietly removed.

The plan has eleven behavior outcomes and seventeen implementation slices (D-016; stage 15 split by D-018). The slices are dependency-ordered rather than strictly serial: dead-code cleanup changes clone identities, clone extraction changes complexity, and complexity refactoring can reintroduce earlier findings, so the measuring stages are sequential, but the critical-function stages that own disjoint files run in any order and the `runPass` stage runs last so a Q-002 escalation blocks as little as possible.

*(Revised 2026-09-28 after review: chain rounds `review-1.md`/`review-2.md` and the coordinator's independent four-lens verified review. Every change is a dated Decision Log entry D-011 through D-017 or an amendment noted in place.)*

## Architecture Context

- `docs/analysis-capabilities.md` defines the seven provider-neutral capabilities, explicit bound/unbound/failed states, completed verdicts, and non-passing trace results. This plan preserves that vocabulary in the health record.
- `docs/fallow.md` defines the Fallow 2.54.2 operations, trace targets, identity baselines, and the distinction between project-scope evidence and changed-scope audit.
- `docs/fallow-exceptions.md` defines the current three changed-scope floors, the reasoned refresh path, and the prohibition on same-change suppression authorization. After this plan it also carries the per-file baselined-complexity justifications (D-014).
- `missions/architecture/staged-code.toml` and `fallow.toml` jointly define public and runtime-loaded reachability. This plan does not add an entry or change either file.
- `missions/architecture/living-memory.md` makes the evidence chain, persisted recovery state, bounded work, and non-destructive handling of curated data load-bearing. The `runPass` refactor must preserve those rules, including write-through `writesCommitted` reporting and recovery from persisted receipts, proposals, retirement records, and source state.
- `missions/architecture/tool-ecosystem.md` and `docs/analysis-capabilities.md` require analysis to remain native through registered tools rather than a parallel shell-only workflow. Direct provider use is diagnostic or fills a surface operation that does not exist; it never replaces a missing or failed capability outcome.
- The generated architecture-map index currently exposes no module shards. That absence is uncertainty, not evidence of clean boundaries; the dedicated `boundary-conformance` capability is also unbound.
- `lib/orchestration/quality-review-run.ts` declares host gate-owned paths (`HOST_GATE_OWNED_PATHS`, `HOST_GATE_OWNED_DIRECTORY`). Several of them change by design in this plan (R-013), so the Quality Manager cannot return `ready`; its human-decision items are the expected closeout shape.
- `missions/plans/execution-liveness/` is the next plan in the ratified order and its To Do tasks TASK-712..719 name files this plan restructures (R-014). This plan does not edit that plan's artifacts; it records every structural change to those files for re-validation.

Dependency direction for this work stays inward: CLI and provider adapters may depend on focused shared helpers; shared helpers do not import CLI modules; domain-independent `lib/` code does not import bundled or domain-agent code; memory helpers keep persisted state behind the existing dependency interfaces rather than importing CLI or analysis infrastructure.

## Decision Log

- **D-001 - Ratified intent and ranking govern verbatim**
  - Decision: `spec.md` INV-001..005 and the full `Ranking` paragraph are ratified as drafted and govern this plan verbatim. Mechanism yields to them: missing evidence is not clean; observable behavior is preserved; findings are traced before edits; nothing is silenced; and the health record remains reproducible.
  - Alternatives: weaken an invariant for throughput; treat an unavailable capability as empty; permit implementation tasks to reinterpret the ranking.
  - Why: preserves the authoritative Intent and its conflict resolution.
  - Decided by: human, 2026-09-28 (relayed by Shepherd)

- **D-002 - Ratified remediation scope**
  - Decision: “This plan runs now, before `execution-liveness`. Dead code and duplicate exports: fix all. Duplication: extract every family that lives in one or two files; baseline the rest with a reason. Complexity: refactor the `critical` tier only; `high` and `moderate` get a justified baseline with a written justification per file.”
  - Alternatives: sample findings; baseline difficult critical functions; refactor high/moderate findings opportunistically; add analysis configuration to hide debt.
  - Why: preserves the ratified Scope and AC-002 through AC-006.
  - Decided by: human, 2026-09-28 (relayed by Shepherd)
  - *(Amended 2026-09-28 after review, SF-005: the `scripts/`, `tests/`, static-coverage-tier, prefer-removal-over-configuration, and no-`fallow.toml`-edit decisions were split out into D-011, whose provenance is coordinator-proposed and human-confirmed, not a human ruling.)*

- **D-003 - Ratified Q-001 through Q-003 rulings**
  - Decision: “Q-001 - Intent INV-001..005 and the ranking: **ratified as drafted**. Q-002 - Risk bound for critical refactors: **(a)**. A critical function that cannot be characterized to a reasonable bound (`runPass`: 886 lines, 104 paths, `partial` coverage) is refactored with the best characterization tests writable plus the full suite, accepting residual risk. Hard stop and escalate if any test expectation would have to change. Rejected: (b) baselining it as an exception to the critical ruling. Q-003 - Duplication ruling consequence: **confirmed**. 41 of the 43 clone families (85 of 87 groups, about 1,730 duplicated lines) live in one or two files and are all extracted; the two three-file families are baselined with reasons.”
  - Alternatives: reopen the ratified questions; baseline `runPass`; refuse the one-/two-file clone extraction scope.
  - Why: carries the closed Open Questions into executable design without reinterpretation.
  - Decided by: human, 2026-09-28 (relayed by Shepherd)

- **D-004 - Committed health-record location and canonical form**
  - Decision: commit the human-readable record at `missions/reviews/project-health-audit.md` and its canonical machine companion at `missions/reviews/project-health-audit.json`. The JSON is schema version 1, UTF-8, LF-terminated, two-space formatted, with fixed top-level fields and deterministically sorted finding identities. The Markdown summarizes the same data and records the companion file’s SHA-256 digest; it is not an independent source of truth. The per-file AC-006 justifications are mirrored from `docs/fallow-exceptions.md` (D-014), which is their provenance home.
  - Alternatives: put the record beside transient Shepherd evidence; put it in `.fallow-baselines/`; publish only prose; add a permanent executable solely to generate a one-time record.
  - Why: `missions/reviews/` is tracked, durable, review-oriented, excluded from the shipped package, and does not conflate whole-project evidence with changed-scope floors.
  - Decided by: planner-proposed
  - *(Amended 2026-09-28 after review, SEQ-002: intermediate custody of the record is D-015, because Drive commits exclude `missions/**`.)*

- **D-005 - Reproducibility digest contract**
  - Decision: each snapshot records per-file SHA-256 values and two configuration digests, each read from the git object store at `snapshot.commit` (`git show <commit>:<path>`), never from the working tree. The `analysisConfiguration` digest covers the lexically sorted bundle `.cosmonauts/config.json`, `.cosmonauts/suppression-exceptions.json`, `bun.lock`, `fallow.toml`, `package.json`, `tsconfig.json`, and `domains/shared/extensions/project-tools/fallow-provider.ts` (the adapter that normalizes every result; R-015). The `floorConfiguration` digest covers `.fallow-baselines/manifest.json` and the three baseline files and is recorded for the changed-scope audit invocation and the closeout. A bundle digest hashes repeated frames `path`, NUL, lowercase 64-character hexadecimal file digest, NUL, all UTF-8. Each invocation’s result digest hashes its lexically sorted, LF-delimited finding identities with one trailing LF; an empty inventory hashes the empty byte sequence. Identity strings are UTF-8 with fields joined by a single tab: dead-code `category`, `path`, `subject`; duplication `dupes`, then each instance as `path:startLine:endLine` sorted and joined by `;`; complexity `metric`, `path`, `line`, `column`, `name`, measured value, threshold; unavailable outcomes `capability`, `state`, `reason`. Counts and the identity array are stored beside the digest, so later runs can compare without trusting adapter-local IDs. `provider.executableSha256`, when recorded, is informational, carries its platform package name, and is not part of any digest.
  - Alternatives: hash raw JSON including elapsed time and unstable adapter-local IDs; store counts only; depend on prose comparison; hash the working tree.
  - Why: INV-005 requires same-commit reproduction of identities and counts, while provider payloads contain volatile timing, adapter IDs have no cross-session determinism promise, and a working-tree hash is not reproducible at a commit.
  - Decided by: planner-proposed
  - *(Amended 2026-09-28 after review, PR-003/DA-005/FEAS-003: object-store reads, the two-digest split, `tsconfig.json` and the adapter in the bundle, byte-level identity encoding.)*

- **D-006 - Evidence state is closed and explicit**
  - Decision: every inventory row has exactly one disposition: `remediated` with owning task and pre-edit trace reference; `baselined` with file-specific reason; `unresolved` with the stale evidence and no edit, used only for a starting finding that no longer reproduces; `false-positive` with the reference evidence that contradicts the provider and no edit (D-013, pending Q-005); or `escalated` with the failed-trace or public-API evidence and no edit (D-013). Capability executions similarly record `completed-pass`, `completed-fail`, `unbound`, `unsupported`, or `failed`; only a completed pass is a pass. The duplication `invalid-output` failure and the unbound boundary capability remain visible even when diagnostic provider output exists.
  - Alternatives: omit stale findings; count direct provider output as a surface pass; use an “unknown” bucket without a reason; file untraceable reproduced findings under `unresolved`.
  - Why: closes every state-space cell under INV-001 and INV-003.
  - Decided by: planner-proposed
  - *(Amended 2026-09-28 after review, SF-003/PR-002: `unresolved` is reserved for non-reproducing findings; reproduced-but-untraceable rows are `escalated` or `false-positive`.)*

- **D-007 - Canonical duplicate exports**
  - Decision: move the shared `partialReason`/progress formatting behavior to a single driver-internal report-format module used by `drive-finalization`, `run-one-task`, and `drive-scheduler-backend`; no dependency from `drive-finalization` back to `run-one-task` is introduced. Keep `registerEditCommand` canonical for plans and rename the task command registration to the domain-qualified `registerTaskEditCommand`, updating its CLI composition and tests.
  - Alternatives: merely remove one `export` while retaining duplicate behavior; import from `run-one-task` and create a cycle; rename both command functions without retaining a canonical export.
  - Why: resolves both concrete pairs under AC-003 while preserving dependency direction and command behavior. Current traces show the finalization copy unused externally, the run-one-task copy imported by the scheduler, and both edit registrations independently used.
  - Decided by: planner-proposed

- **D-008 - Clone extraction follows responsibility, not a global utility bucket**
  - Decision: eliminate each one-/two-file family with the narrowest seam that preserves ownership. Same-file families become private helpers; same-subsystem families may use an internal sibling module; cross-subsystem families share only the smallest pure or infrastructure primitive whose semantics are identical. The two three-file families are not extracted: the judgment/proposal/retirement validation family stays separate because it crosses CLI and distinct persisted-record trust boundaries; the consolidation/knowledge/living-memory read-loop family stays separate because each store owns different TOCTOU, error, and record-validation semantics. The starting group-to-family mapping is persisted in the before record (Design §3) so the 41/2 split is mechanically checkable.
  - Alternatives: one generic utility module for all clones; leave one-/two-file clones when extraction feels awkward; share the two three-file families despite cross-boundary coupling.
  - Why: satisfies Q-003 without replacing duplication with unhealthy dependency direction.
  - Decided by: planner-proposed
  - *(Amended 2026-09-28 after review, PR-007: persisted group-to-family mapping.)*

- **D-009 - Characterization commits precede the first edit of any below-high critical function, in any slice**
  - Decision: before the first edit of any critical function whose Fallow coverage tier is `partial`, `none`, or absent, in any slice (dead-code, duplication, or complexity), that function receives behavior-focused characterization in a separate green commit. The characterization commit lands in the earliest slice that edits the function and later slices reuse it, adding cases only where their refactor needs them. High-tier functions may use existing coverage. Missing tier is treated as below high. Each refactor task records the exact characterization cases it relies on. Each duplication slice checks its fresh clone instance ranges against the fresh below-high critical function ranges before editing; any overlapping family moves to the critical slice that owns the enclosing function (Design §3).
  - Alternatives: characterize after refactoring; treat an absent tier as high; combine tests and refactor in one commit; scope the rule to complexity slices only.
  - Why: operationalizes INV-002, Q-002, AC-005, and AC-011. The previous text (“in every critical-complexity slice”) let stage 4 extract 174 duplicated lines out of `runPass` before its characterization existed, which INV-002 forbids.
  - Decided by: planner-proposed
  - *(Amended 2026-09-28 after review, SF-001/FEAS-001/DA-001/SEQ-001/PR-006: rule broadened from complexity slices to any slice; overlap check added. Supersedes the previous D-009 decision text.)*

- **D-010 - Final analyzed commit and artifact-only closeout** *(Q-004 ruled (a) by the human on 2026-09-28, round 2, relayed by Shepherd: this reading is adopted as ratified ground)*
  - Decision: first commit the final source and test tree, then refresh all three floors against that exact commit and generate both health-record files from it. The closeout commits contain only `.fallow-baselines/`, `docs/fallow-exceptions.md`, and the two health-record artifacts *(amended by D-018 (4), 2026-09-28: two artifact-only commits, Drive’s for floors and docs and the coordinator’s for the record files)*. The record names the analyzed source commit and proves that the tip differs from it only by those closeout artifacts. This is the reproducible interpretation of “branch’s final commit”; a commit cannot contain a manifest that names its own content-derived SHA.
  - Alternatives: record a knowingly stale SHA; recursively refresh and recommit forever; weaken manifest provenance; omit the committed record.
  - Why: preserves the ratified operational intent of AC-008 and AC-009 without an impossible self-referential Git hash.
  - Decided by: planner-proposed; escalated as Q-004 because it interprets the letter of ratified AC-008 (PR-001); ruled (a) by the human, 2026-09-28 round 2 (relayed by Shepherd).

- **D-011 - Coordinator-derived scope decisions** *(Added 2026-09-28 after review, SF-005)*
  - Decision: `scripts/` critical functions are in scope for refactoring; `tests/` critical functions are baselined with reasons; the Fallow `static_estimated` coverage tier is the characterization trigger; dead-code remediation prefers dropping `export` or deleting the declaration over any configuration change; `fallow.toml` is not edited.
  - Alternatives: treat scripts as out of scope; refactor test suites; use runtime coverage as the trigger; add ignore patterns.
  - Why: recorded in `spec.md` Scope as derived; the human confirmed on 2026-09-28 that they stand.
  - Decided by: coordinator-proposed 2026-09-28; human confirmed 2026-09-28 (relayed by Shepherd)

- **D-012 - Duplication capability is structurally failed for this plan** *(Added 2026-09-28 after review, SF-002/FEAS-002/DA-002/SEQ-006/PR-007. Q-006 ruled (a) by the human on 2026-09-28, round 2, relayed by Shepherd, who independently verified the exit-0-with-findings defect: stage 1 fixes the reconciliation narrowly with a regression test, and the after snapshot must show `duplication` completed.)*
  - Decision: `analysis_duplication` runs `fallow dupes` with no threshold; Fallow exits 0 whenever duplication does not exceed a threshold; `reconcileVerdictEvidence` in `domains/shared/extensions/project-tools/fallow-provider.ts` rejects exit 0 with non-zero normalized findings. The capability therefore returns `failed`/`invalid-output` whenever any clone group exists, and the two ratified three-file families keep it failed at every checkpoint. This is an adapter defect, not clone debt. Until Q-006 is ruled: every duplication checkpoint records the surface outcome as `failed` and pairs it with a direct provider run labeled `surface-missing/diagnostic`, executable `fallow`, args `["dupes", "--format", "json", "--quiet", "--no-cache"]`, recorded verbatim; that run is the only source of clone identities, group/instance counts, duplicated lines, and percentage; exact-location `trace` calls precede every edit. AC-004 is recorded as `unmet: capability failed` while the surface fails, never as satisfied. If Q-006 rules (a), stage 1 gains the narrow adapter fix with a regression test and the after snapshot must show `duplication` completed. If Q-006 rules (b), AC-004 closes as unmet-with-diagnostic-evidence.
  - Alternatives: call the diagnostic run a pass; edit `fallow.toml` to set a threshold; leave the capability’s state undefined.
  - Why: INV-001 keeps a failed capability visibly failed; INV-005 still needs deterministic clone identities from somewhere that is recorded verbatim.
  - Decided by: planner-proposed (coordinator synthesis); Q-006 (a) decided by human, 2026-09-28 round 2 (relayed by Shepherd)

- **D-013 - Reproduced findings that cannot be traced or are public API hard-stop** *(Added 2026-09-28 after review, SF-003/PR-002. Q-005 ruled (a) by the human on 2026-09-28, round 2, relayed by Shepherd, who independently verified the live call at `lib/driver/drive-graph-runner.ts:593`: the class-member row is dispositioned `false-positive` with that reference, and AC-002 reads as zero findings except recorded provider false positives with contradicting evidence.)*
  - Decision: a finding that reproduces in the fresh run but whose symbol trace fails is not marked `unresolved` and is not edited. The slice records the failed trace evidence, the narrowest successful trace, and a repository-wide reference search, then stops that row for human review with disposition `escalated`. A reproduced export that trace or behavior coverage shows is used by a shipped consumer outside the existing `entry` set is neither deleted nor made reachable by configuration; it is `escalated` per AC-002. The one class-member finding, `TaskManager.getTaskDependencyStatusSnapshot`, cannot be symbol-traced by the provider and has a live call at `lib/driver/drive-graph-runner.ts`; its disposition is `false-positive` with that reference recorded if Q-005 rules so, and `escalated` otherwise.
  - Alternatives: file untraceable rows as `unresolved`; delete on the strength of the finding alone; add an entry point.
  - Why: INV-003 requires confirmation before action; AC-002 requires zero findings and names escalation, not addition, for public API.
  - Decided by: planner-proposed (coordinator synthesis); Q-005 (a) decided by human, 2026-09-28 round 2 (relayed by Shepherd)

- **D-014 - AC-006 justifications live with the baseline provenance** *(Added 2026-09-28 after review, SF-004)*
  - Decision: because INV-004 and AC-008 allow one reason per category in manifest provenance, the per-file AC-006 justifications live in a `### Baselined complexity (project-health-audit)` subsection of `docs/fallow-exceptions.md`, listing every retained high/moderate function and every reproduced critical test function by stable identity (metric/path/line/column/name) with its file-specific reason. That file is committed in the same closeout commit as the manifest. The health refresh reason names that section and the after snapshot’s complexity result digest at `analyzedCommit` *(superseded by D-018 (4), 2026-09-28: the reason previously named the record’s JSON digest, which made the record and manifest digests circular)*. `missions/reviews/project-health-audit.json` mirrors the same dispositions, and closeout checks that both list identical identities and justification text.
  - Alternatives: justifications only in the review record with a pointer from the reason; one manifest entry per file.
  - Why: AC-006 says “recorded where the baseline provenance is recorded”; the exceptions document is that provenance narrative.
  - Decided by: planner-proposed (coordinator synthesis)

- **D-015 - Test-expectation freeze is checked mechanically, and record custody is the coordinator’s** *(Added 2026-09-28 after review, DA-004/SEQ-002)*
  - Decision: at the start of each slice the slice-start commit `S` is recorded; in refactor slices the characterization commit `C` is recorded too. Before a slice may close, the worker runs `git diff --name-status --diff-filter=MDR <base> -- tests/`, `git status --porcelain -- tests/`, and `git diff -U0 <base> -- tests/ | grep -E '^\+.*\.(skip|only|todo)\('` against the working tree (base `C` for refactor slices, `S` otherwise) and records the output; after Drive’s commit the coordinator confirms the base and re-runs the same commands from it to the Drive commit, recording both outputs and SHAs *(amended by D-018 (1), 2026-09-28; the previous text compared against `HEAD`, which under `driver-commits` does not contain the worker’s edits, and let the worker be the only observer)*. Allowed without escalation: adding new test files, and pre-declared mechanical reference updates for a renamed or moved symbol whose hunks contain only that identifier change, which the coordinator reviews and records. In refactor slices additions belong in `C` only. Any other modified, deleted, or renamed test path, or any added skip/only/todo, requires the task notes to cite the finding whose defect the test pinned, and the slice stops `blocked` for human review before the next slice begins. The observer is the independent reviewer and the coordinator between slices, not the implementing worker. Separately, Drive’s per-task and state commits exclude `missions/**`, so no implementation task commits the health record: each task that changes `missions/reviews/project-health-audit.{md,json}` also records the same rows in its own task file under `## Implementation Notes`, and after each slice closes green the coordinator makes a record-only commit before dispatching the next slice. Workers never run git operations on `missions/reviews/`.
  - Alternatives: trust the worker’s report; commit the record only at closeout; let workers commit `missions/`.
  - Why: Q-002’s hard stop needs an observer other than the actor with the incentive to skip it; INV-003 trace references and INV-005 evidence must not sit uncommitted across many backend sessions.
  - Decided by: planner-proposed (coordinator synthesis)

- **D-016 - Task split, commit policy, ordering, and task count** *(Added 2026-09-28 after review, SEQ-003)*
  - Decision: Drive runs with `commitPolicy: driver-commits`, one source commit per task, so every refactor stage with below-high or missing-tier functions is two dependent tasks: (a) characterization only, which must not edit any owned critical function, and (b) the refactor, depending on (a). The Implementation Order therefore has sixteen slices (seventeen after D-018 split stage 15). That exceeds the plan skill’s normal 3-12 range; the plan is not split because every slice feeds one record and one closeout, and a split would duplicate the snapshot, floor-refresh, and gate machinery. Stages that own disjoint files do not depend on each other; the `runPass` stage runs last among refactors so a Q-002 escalation blocks only the living-memory stages, the baseline stage, and closeout.
  - Alternatives: one task per stage with `backend-commits` (one commit; the separate characterization commit is lost); split into two plans; keep a strict serial chain.
  - Why: the separate green characterization commit is spec text; Drive produces exactly one commit per task; a strict chain would let the most escalation-prone item block unrelated work.
  - Decided by: planner-proposed (coordinator synthesis)

- **D-017 - Execution backend must expose the analysis surface** *(Added 2026-09-28 after review, FEAS-005. Q-007 ruled (a) by the human on 2026-09-28, round 2, relayed by Shepherd: Drive with the `cosmonauts-subagent` inline backend, one slice per run, a GPT model preferred for the Pi worker to avoid the Opus out-of-usage stall.)*
  - Decision: `analysis_status`, the capability tools, and `analysis_trace` are registered only by the Pi `project-tools` extension, loaded by `coding/worker` and `coding/refactorer`; no CLI subcommand exposes them, and Codex or Claude CLI Drive workers cannot call them. Every slice that removes, extracts, or refactors code therefore runs in a Pi-hosted role with `project-tools`: Drive with `backend: "cosmonauts-subagent"` in inline mode, one slice per run, or spawned refactorer/worker sessions. The absence of the tools in an external harness does not count as “the surface lacks the operation”; a worker that cannot call the surface stops and reports. Before slice 1, `analysis_status` is run from the execution root and must show Fallow bound with execution consent for that root’s canonical path; if execution moves to another worktree, consent is re-established there first and recorded in the before snapshot. The alternative in Q-007 (Codex workers with a Pi-hosted trace step before each edit) is presented to the human because the brief named the Codex backend.
  - Alternatives: detached Codex workers invoking the provider directly (forbidden except diagnosis); skipping the trace (breaks INV-003).
  - Why: INV-003 requires the trace through the analysis surface immediately before the edit.
  - Decided by: planner-proposed (coordinator synthesis); Q-007 (a) decided by human, 2026-09-28 round 2 (relayed by Shepherd)

- **D-018 - Task-compliance amendments** *(Added 2026-09-28 after the task compliance review: coordinator three-lens workflow, 18 verified findings ACF-001..006, CC-001..006, SEQ-001..006; amend-on-record, derived ground only)*
  - Decision: (1) D-015 freeze check under `driver-commits`: the worker's in-session check compares the working tree against the base (`git diff --name-status --diff-filter=MDR <base> -- tests/`, `git status --porcelain -- tests/`, and the skip/only/todo grep without `HEAD`), because HEAD does not contain the worker's edits; the verdict comes from the coordinator, who after Drive's commit confirms the base (`S` = parent of the task's Drive commit, `C` = the characterization task's Drive commit), re-runs the commands from that base to the Drive commit, and records both outputs and SHAs in the task notes; citations go in task notes, not commit messages. Allowed without a human stop: newly added test files, and pre-declared mechanical reference updates in existing tests for a symbol the task renames or moves, whose hunks contain only that identifier change; the coordinator reviews and records those. Characterization tasks add only new test files; existing suites stay unmodified. TASK-768’s two pre-declared edits (the Q-006 (a) fixture flip of the duplication “exit zero with findings” case, human-authorized; the D-007 `registerTaskEditCommand` identifier rename) are coordinator-reviewed and do not block. (2) A testability seam lands only in a separate characterization task the refactor task depends on; inside a refactor task the worker records the measured values and the needed seam and stops `blocked`. In a characterization task a seam is limited to module-boundary visibility or injection that leaves every owned function body byte-identical, and every enumerated result variant is mapped to a test or listed as unreachable with a reason and flagged before the dependent refactor starts. (3) Stage 15 splits into 15a (`runPass` refactor plus living-memory family extraction) and 15b (justified baselines, owner of B-006); stage 16 depends on 15b. (4) Closeout shape: Drive’s stage-16 commit carries `.fallow-baselines/*` and `docs/fallow-exceptions.md`; the coordinator’s record-only commit carries the two record files; `git diff --name-only <analyzedCommit> <tip>` lists exactly those seven paths. The health refresh reason names the `docs/fallow-exceptions.md` section and the after snapshot’s complexity result digest at `analyzedCommit`, never a digest of a record or floor file, which breaks the record/manifest digest cycle; the record carries no closeout-commit SHA, and the coordinator records the closeout SHAs and the changed-scope audit evidence in the stage-16 task notes. (5) Stage 8/9 file lists include `cli/tasks/commands/create.ts` and `lib/extensions/agent-memory/index.ts`; stage 5 excludes the consolidation-proposals/receipts family (supplied family 26) and `lib/memory/consolidation-receipts.ts`; stages 7 and 9 own any family the overlap check moved to them; stage 15a names the TASK-779 cases for `recoverAcceptedEpisodeFinalization` before extracting its clone instances; stage 1 owns the D-017 bound-plus-consent precondition; stage 16 owns the `docs/fallow-exceptions.md` count/provenance/link duties and requires the after snapshot’s duplication run completed with `verdict: "fail"`, marking AC-004 satisfied only then.
  - Alternatives: trust worker-recorded freeze output; allow seams inside refactor commits; keep stage 15 as one task; name the record digest in the manifest reason.
  - Why: serves INV-002 (an observer other than the actor; byte-identical function bodies before characterization), INV-005 (no self-referential digests), and Q-002/Q-006 (a).
  - Supersedes: the affected sentences in D-010, D-014, D-015, Design §4 step 4, Files to Change (test files), and Implementation Order stage 15; each is marked in place.
  - Decided by: coordinator, amend-on-record, 2026-09-28

## Behaviors

### B-001 - Complete capability evidence stays visible

- Source: AC-001
- Observer: maintainer or Quality Manager reviewing project health
- Entry point: the committed project-health record and machine companion
- Outcome: all seven capability bindings appear with provider identity, version, binding state, and diagnostic reason; all four gate-facing project-scope capabilities have recorded invocations and outcomes. Unbound, unsupported, failed, or invalid output remains visibly non-passing, including boundary conformance with no configured zones and duplication while it fails (D-012).

### B-002 - Dead-code inventory reaches zero without configuration escape hatches

- Source: AC-002
- Observer: maintainer comparing the before and after health snapshots
- Entry point: the committed project-health record
- Outcome: the after snapshot’s project-scope dead-code run reports zero findings in every category. A starting finding that no longer reproduces is shown as unresolved rather than fixed; a reproduced finding that cannot be traced, is public API outside `entry`, or is contradicted by a live reference is shown as escalated or false-positive with its evidence and is never silently removed or silently kept. No new entry point, ignore, threshold, or suppression is used to achieve the result. *(Amended 2026-09-28 after review, SF-003.)*

### B-003 - Duplicate public names have one owner

- Source: AC-003
- Observer: CLI user and driver consumer using existing plan editing, task editing, and partial-outcome flows
- Entry point: the existing plan/task CLI commands and Drive execution entry points
- Outcome: plan and task editing behave as before, partial outcomes retain the same text, and analysis reports only one canonical owner for each formerly duplicated export name.

### B-004 - Clone debt follows the ratified file-count rule

- Source: AC-004
- Observer: maintainer reviewing duplication evidence
- Entry point: the committed project-health record
- Outcome: every reproduced family confined to one or two files is absent from the after inventory (diagnostic inventory plus per-location traces while the surface fails, D-012). Each reproduced three-file family remains visible with its exact files and extraction-refusal reason, and the resulting group count, instance count, duplicated lines, and percentage are recorded. The surface outcome is recorded as it is; AC-004 is marked `unmet: capability failed` while the surface fails, and satisfied only by a completed surface run.

### B-005 - Production critical complexity is removed without behavior drift

- Source: AC-005, AC-011
- Observer: users of existing CLI commands, registered tools, public library entries, and persisted memory/runtime artifacts
- Entry point: those existing shipped entry points and recovery paths
- Outcome: success, failure, cancellation, retry, recovery, and persisted-artifact behavior remains unchanged, while every reproduced critical function in `lib/`, `cli/`, `domains/`, and `scripts/` is below all configured thresholds. Below-high functions have prior characterization commits, and no extracted replacement helper exceeds the tier-dependent ceilings in Design §4.

### B-006 - Deferred complexity is explicit and reviewable

- Source: AC-006
- Observer: future maintainer comparing health debt over time
- Entry point: the per-file baselined-complexity section of `docs/fallow-exceptions.md` (provenance narrative) and its machine companion in the committed project-health record
- Outcome: every remaining high or moderate function and every reproduced critical test function has a per-file written justification and a stable identity. No production critical function is moved into this baseline. *(Amended 2026-09-28 after review, SF-004.)*

### B-007 - Suppression debt does not grow

- Source: AC-007
- Observer: maintainer reviewing the after snapshot and suppression policy result
- Entry point: the committed project-health record
- Outcome: inline suppression count is unchanged or lower, the registered exception set is unchanged or smaller, stale suppressions are zero, and no same-change registry edit authorizes a new directive. The `complexity` directive on `runDrive` in `cli/drive/subcommand.ts` becomes stale once `runDrive` is below threshold and is removed with its registry row (FEAS-006).

### B-008 - Changed-scope floors describe the post-audit state

- Source: AC-008
- Observer: Quality Manager or later change author
- Entry point: the existing changed-scope analysis capability and baseline manifest
- Outcome: each floor has one category-specific refresh reason tied to the final analyzed source commit, manifest digests match the files, and changed-scope audit from `main` passes against those floors. A failed or unavailable audit is reported and blocks completion rather than being represented as passing.

### B-009 - Health evidence is reproducible and mechanically comparable

- Source: AC-009
- Observer: future coordinator repeating the audit
- Entry point: the exact invocation objects and digest contract in the committed machine record
- Outcome: a second run at the named commit produces the same normalized finding identities, counts, result digests, and `analysisConfiguration` digest; a later run can mechanically identify additions, removals, severity changes, baselined debt, and capability-state changes.

### B-010 - Every stage closes without observable regression

- Source: AC-010, AC-011
- Observer: maintainer exercising the existing project after each slice
- Entry point: the stage gate (Implementation Order preamble), reachability policy, suppression policy against `main`, the test-expectation freeze check (D-015), and the affected shipped entry points
- Outcome: each slice ends green before the next begins. No expected behavior changes unless a test demonstrably pinned the finding being removed; any modified, deleted, renamed, or skipped test after the slice base is detected by the freeze check and hard-stops for human review rather than landing silently.

### B-011 - Behavior-sensitive clone extractions keep their edge contracts *(Added 2026-09-28 after review, PR-005)*

- Source: AC-004, AC-011
- Observer: Drive and package users running Claude/Codex binaries and concurrent task/plan writers contending for locks
- Entry point: `runClaudeBinary`/`runCodexBinary` in `lib/agent-packages/`, and the lock primitives in `lib/driver/lock.ts` and `lib/entity-file-lock.ts`
- Outcome: after extraction, binary runners still clean materialized resources exactly once, uninstall their signal handlers, propagate the child exit code and signal as before, and keep variant-specific argument handling; the two lock implementations keep their distinct timeout, stale-owner, warning, and release-confirmation behavior. Characterization tests for these outcomes land in a separate green commit before the extraction slice edits them.

## Design

### 1. Evidence and disposition pipeline

The first implementation slice creates the before snapshot from the supplied `64dca3c` evidence and a fresh run at the stage-start commit. It records both commits rather than pretending they are identical. Each discrepancy is a row with `reference`, `fresh`, and `reconciliation`; neither side is silently preferred.

The analysis sequence is fixed:

1. Run `analysis_status` from the execution root (D-017) and capture the seven binding rows once for the snapshot.
2. Execute project-scope dead code, duplication, cyclomatic complexity, cognitive complexity, CRAP, and boundary conformance through the project analysis surface.
3. For a dead-code removal, trace the exact symbol and path immediately before edit. A finding that reproduces but whose trace fails, or that proves to be shipped public API outside `entry`, hard-stops per D-013; it is never filed as unresolved and never edited.
4. For a clone extraction, trace one current instance location from every owned group immediately before edit. A location that no longer matches becomes unresolved.
5. For complexity, run the relevant metric immediately before the characterization/refactor batch. The fresh metric run is the confirmation required by INV-003.
6. Direct provider invocation is permitted only when the surface lacks the operation, for diagnosis of a surface failure, or as the labeled diagnostic pair of the failed duplication capability (D-012). It is stored as executable plus argument array verbatim. Its evidence can guide work, but it cannot turn an unbound/failed surface capability into a pass. A worker whose harness lacks the surface tools stops and reports (D-017).

Current planning evidence must be carried into the record and Risks: dead code and all three complexity metrics return findings; duplication fails normalization with `invalid-output` because provider exit 0 contradicts 87 normalized findings (structural, D-012); boundary conformance is unbound with `provider-not-configured`; `runPass` symbol trace exits at the provider while file trace succeeds and proves its containing file reachable; the class-member symbol trace exits at the provider (D-013); representative duplicate-export and binary-runner clone traces succeed.

The machine companion uses this closed contract:

```ts
type Sha256Hex = string; // lowercase, 64 hexadecimal characters

interface FileDigest { path: string; sha256: Sha256Hex } // project-relative path, read at snapshot.commit

interface CapabilityBindingRecord {
  capability: "dead-code" | "duplication" | "complexity" | "boundary-conformance" | "changed-scope-audit" | "trace" | "fix-preview";
  state: "bound" | "unbound" | "failed";
  provider?: { id: string; version: string };
  scopes?: readonly string[];
  metrics?: readonly string[];
  reason?: string; // unbound/failed diagnostic, verbatim
}

type InvocationSource =
  | { kind: "surface"; tool: string; arguments: Record<string, unknown> }
  | { kind: "direct"; label: "surface-missing" | "diagnostic"; executable: string; args: readonly string[] };

interface InvocationRecord {
  id: string;                 // stable within the record, e.g. "before.dead-code.1"
  source: InvocationSource;
  outcome: CapabilityOutcome;
  native?: { exitCode: number; stderrSha256: Sha256Hex; payloadSha256: Sha256Hex }; // provider envelope digests, never the payload
  failure?: { kind: string; message: string; exitCode?: number }; // structured failure for `failed`
}

type CapabilityOutcome =
  | { state: "completed-pass" | "completed-fail"; count: number; identities: readonly string[]; identityDigest: Sha256Hex }
  | { state: "unbound" | "unsupported" | "failed"; reason: string; identityDigest: Sha256Hex };

interface EvidenceRef { invocationId: string; identity?: string } // points into invocations

type FindingDisposition =
  | { kind: "remediated"; taskId: string; trace: EvidenceRef }
  | { kind: "baselined"; reason: string; files: readonly string[] }
  | { kind: "unresolved"; reason: string; evidence: EvidenceRef }
  | { kind: "false-positive"; reason: string; reference: string; evidence: EvidenceRef }
  | { kind: "escalated"; reason: string; evidence: EvidenceRef };

interface FindingRecord {
  identity: string;           // D-005 identity string
  category: string;           // gate-aligned category
  severity?: string;
  family?: string;            // duplication only: family id from the persisted mapping (Design §3)
  disposition: FindingDisposition;
}

interface HealthSnapshot {
  commit: string;
  executionRoot: { canonicalPathSha256: Sha256Hex; consent: "recorded" | "withheld" }; // never the absolute path
  provider: { id: string; name: string; version: string; executableSha256?: Sha256Hex; executablePackage?: string };
  analysisConfiguration: { files: readonly FileDigest[]; digest: Sha256Hex };
  floorConfiguration?: { files: readonly FileDigest[]; digest: Sha256Hex };
  bindings: readonly CapabilityBindingRecord[];
  invocations: readonly InvocationRecord[];
  findings: readonly FindingRecord[];
  suppressions: { inline: number; registered: number; stale: number };
}

interface ProjectHealthRecordV1 {
  schemaVersion: 1;
  generatedFor: "project-health-audit";
  identityAlgorithm: "sha256/utf-8/tab-joined-v1"; // D-005
  before: HealthSnapshot;
  after: HealthSnapshot;
  reproduction: { commit: string; matched: boolean; mismatches: readonly string[] };
  closeout: { analyzedCommit: string; closeoutCommit: string; artifactPaths: readonly string[]; floorConfiguration: { files: readonly FileDigest[]; digest: Sha256Hex }; gateOwnedFilesChanged: readonly { path: string; justification: string }[] };
  downstream: { executionLiveness: readonly { path: string; changes: readonly string[] }[] };
}
```

No absolute consent path, secret, environment value, or transient session path is committed. The record’s owner is the stage-1 task (schema, before snapshot, validator function used by later stages) and the closeout stage (after snapshot, reproduction, closeout). The validator is a test-side helper, not a shipped executable.

### 2. Dead code and duplicate exports

The dead-code slice owns the complete supplied inventory and any fresh additions. Its concrete value-export findings are:

- `renderHarnessReport`, `discoverAllRuntimeSkills`, `summarizeDriverEvent`, `FALLOW_MAX_CONCURRENT_ANALYSES`, `detectFallowSignal`, and `DEFAULT_FORCE_KILL_WAIT_MS`.
- `CLAUDE_ARGS_ENV`, `CLAUDE_SKIP_PERMISSIONS_ENV`, `CODEX_ARGS_ENV`, `CODEX_EXEC_ARGS_ENV`, `CODEX_YOLO_ENV`, and `isEnabledEnv`.
- `DRIVE_TASK_STATUS_PARTIAL_ARTIFACT_KIND`, `recordCommitFinalizationFailure`, `recordTaskStatusFinalizationFailure`, `partialReason`, `DRIVE_FINALIZER_RETRY_POLICY`, `buildDriveTerminalEpisode`, `createInlineRunState`, `DRIVE_SHELL_COMMAND_CAPABILITIES`, and `skipStateCommit`.
- `COSMONAUTS_GENERATED_INVENTORY_PATH`, `EMPTY_HARNESS_MANIFEST`, `resolveHarnessSyncMode`, `DEFAULT_REAP_TERM_GRACE_MS`, `DEFAULT_REAP_KILL_GRACE_MS`, and `EntityFileLockTimeoutError`.

The 103 type findings are owned by exact file cluster and count: five CLI types; three domain-extension types; twenty driver types; forty harness-adapter types plus one harness-runtime-inventory type; two episode-lock types; six orchestration types; one plan-manager type; two process-group types; one skills-discovery type; two task-manager types; six knowledge-backfill script types; and fourteen harness-validation script types. The concrete file inventory is the corresponding `unused_types` array in the supplied `dead.json`; the task must copy every identity into the machine record before editing so no cluster can be skipped.

The slice also owns `TaskManager.getTaskDependencyStatusSnapshot` (D-013: live call at `lib/driver/drive-graph-runner.ts`, provider cannot symbol-trace class members, disposition per Q-005), plus duplicate-export pairs `partialReason` and `registerEditCommand`. Trace decides remove-export versus delete: an internally used value loses only `export`; an unused declaration is deleted only when trace and behavior coverage show no internal or shipped use. Public reachability is never “fixed” by adding an entry; a reproduced export that shipped consumers outside `entry` use is escalated (D-013).

`partialReason` becomes a single driver-internal formatting contract with the same `ParsedReport -> string` behavior. `registerEditCommand` remains the plan-command name; task registration becomes `registerTaskEditCommand`. No CLI syntax, alias, output, or error behavior changes.

Per Q-006 (a), this slice also owns the narrow adapter fix: `reconcileVerdictEvidence` treats provider exit 0 with findings as a valid completed `fail` verdict for `duplication` when no threshold or `--fail-on-issues` semantics makes exit 1 the findings signal, with a regression test that feeds an exit-0 payload containing clone groups and asserts a completed result with `verdict: "fail"`. The fix changes no other capability’s reconciliation and is listed as a gate-owned change in the closeout packet (R-013).

### 3. Duplication ownership and seams

All 43 supplied families are inventory rows. Stage 1 persists the starting group-to-family mapping in the before record: each of the 87 groups is identified by its D-005 duplication identity (sorted instance coordinates), each family by a stable id derived from its sorted file list, and every group carries its family id and the family’s disposition (`extract` for the 41 one-/two-file families, `baseline` for the two three-file families). Overlapping groups (a three-instance group followed by a two-instance group on two of the same files) take the disposition of the family the supplied `clone_families` array assigns them to; the mapping is what makes the 41/2 split mechanically checkable (PR-007). Fresh groups without a mapping row are new inventory and are dispositioned by their own file count before work proceeds.

The two ratified baseline families are:

- `cli/memory/judgment-provider.ts`, `lib/memory/consolidation-proposals.ts`, and `lib/memory/retirement-receipts.ts`: validation helpers remain local because the CLI model-output boundary and the two persisted-record readers have distinct contracts and error ownership.
- `lib/memory/consolidation-sources.ts`, `lib/memory/knowledge-store.ts`, and `lib/memory/living-memory.ts`: bounded file-read loops remain local because each subsystem owns different no-follow, consistency, error, and record-validation semantics.

**Characterization gate for clone extraction (D-009).** These one-/two-file families sit inside below-high critical functions and are therefore extracted by the critical slice that owns the enclosing function, after its characterization commit, not by the duplication slices:

- the `lib/memory/living-memory.ts` same-file family (nine groups, 174 lines), inside `runPass` (lines 75-960, partial) and `recoverAcceptedEpisodeFinalization` (1043-1171, partial) — owned by the living-memory refactor stages;
- the consolidation-proposals/consolidation-receipts family, inside `readProposalMaterializations` (571-643, partial) — owned by the remaining-memory refactor stage;
- the `lib/skills/exporter.ts` same-file family (instances 467-475 and 484-492), inside `groupCatalogue` (436-500, partial) — owned by the skills/reachability refactor stage.

Groups inside high-tier critical functions (`runDurableGraphScheduler`; `runRepositoryExportValidation` and `runPersonalBundleValidation`) stay in the duplication slices. Each duplication slice re-checks its fresh clone locations against the fresh below-high critical ranges before editing; any other overlap moves the family the same way and is recorded. The stage-15 duplication recheck confirms the moved families are gone.

The remaining families are split into three ownership slices.

**Core runtime, CLI, domains, and driver:**

- model-session setup in `cli/architecture/narrative-provider.ts` (`createNarrativeSession`) and `cli/memory/judgment-provider.ts` (`createJudgmentSession`), using Pi’s existing `ModelRuntime`, `ModelRegistry`, `DefaultResourceLoader`, `createAgentSession`, and in-memory session manager through one narrow CLI-infrastructure helper rather than reusing the orchestration session factory, whose agent-definition responsibility is broader;
- plan archive/view command setup and errors, the repeated not-found branch within plan view, plan/task extension warning setup, and process-runner stream teardown;
- `runClaudeBinary`/`runCodexBinary`, their signal cleanup, materialization/spawn lifecycle, child I/O types, and diagnostics, while variant-specific argument parsing and invocation creation stay in their existing modules — B-011 characterization first;
- same-file skill discovery and architecture-map retrieval helpers;
- driver `partialReason`/`progressText`, scheduler/run-one-task command execution and run-expectation assembly, scheduler internal blocks, finalizer task-id handling, event-stream/watch compatibility parsing, lock primitives in `lib/driver/lock.ts` and `lib/entity-file-lock.ts` (B-011 characterization first), run-state/atomic-file writes, durable scheduler heartbeat selection, and scheduler finalization blocks.

**Extensions, harness, and validation:**

- agent-memory/architecture-memory rendering and byte helpers; agent-memory/knowledge-tool limit normalization;
- harness render same-file writes, render/sync path checks, sync transaction same-file blocks, and sync/validation-script durable file operations;
- same-file harness-export validation command probes.

**Memory, skills, and tasks (excluding the three families moved to critical slices):**

- judgment-provider/living-memory byte formatting, and judgment-provider/retirement-receipt exact-object helpers that do not belong to the three-file baseline group;
- consolidation receipt reads, proposal/retirement validation, consolidation-source same-file validation, consolidation-source/knowledge-store reads, durable-files with knowledge and retirement stores, episode-transition lock/episode locking, knowledge-record/OKF parsing, knowledge/markdown-store reads, markdown-store same-file paths, proposal-files/retirement-store operations, and retirement receipt/store parsing;
- dependency/status work in the task manager.

Each slice starts from fresh clone traces and ends with the stage gate, a fresh project-scope duplication surface run recorded with its actual outcome (a completed `fail` inventory once the stage-1 fix has landed; anything else is recorded as it is and fails the stage), one labeled diagnostic inventory containing none of the slice’s owned families, and, for each owned group, a `trace` at its pre-edit instance coordinates that returns no clone. Any owned family still present in the diagnostic or trace evidence fails the slice. Shared modules expose only the minimum contract needed by their owning family. Binary-runner sharing accepts injected runtime/process collaborators and returns the existing exit behavior; lock sharing cannot erase race, timeout, stale-owner, release-confirmation, or warning differences.

### 4. Complexity refactoring and characterization

Every critical slice follows the same loop:

1. Reconfirm owned functions with all relevant complexity metrics.
2. Commit characterization for every below-high or missing-tier function before editing any owned critical function (task (a) of the stage, D-016).
3. Refactor by extracting cohesive pure decisions, parsers, or phase functions while retaining the existing entry point as composition root.
4. Re-run characterization and the existing suite, run the D-015 freeze check, then re-run all three metrics. If an owned function or a new helper is still above a threshold, the slice first retries the decomposition against the ceilings below; if it still cannot meet them, a helper’s tier may be raised only through a seam added in a separate characterization task that the refactor task then depends on (for example exporting `visit`’s decision logic from a check-reachability module that a test imports), as the spec’s Assumptions allow; inside the refactor task the worker makes no production edit for that function, records the measured values and the needed seam, and stops `blocked` *(amended by D-018 (2), 2026-09-28: the previous text allowed “a further characterization commit”, which one Drive task cannot produce)*. It never edits thresholds, `fallow.toml`, or entry configuration, and never moves a production critical into the baseline.
5. Record exact before/after identities, metrics, characterization cases, and task ownership.

**Effective ceilings under the measurement model (FEAS-004/DA-003).** B-005 is measured with Fallow’s `static_estimated` coverage model, which bases a function’s tier on export references only: directly test-referenced exports get 85%, test-reachable code 40%, unreachable code 0%, and CRAP counts at `>= 30`. A tier never passes from a parent to a private helper, and characterization tests do not raise a private helper’s tier. Every non-exported helper created by a critical slice is therefore budgeted: cyclomatic at most 9 and cognitive at most 14 when a test can reach its file; cyclomatic at most 4 and cognitive at most 14 when no test imports the file (for example `scripts/check-reachability.ts`). Exported entry points keep their own measured tier (about cyclomatic 27 at `high`). Helpers must not be exported just to reach `high`. Each refactor task designs its decomposition against these ceilings and records the planned helper count and target cyclomatic before editing. For the CRAP-only and cyclomatic+CRAP criticals (`adaptStoredEvent`, `isStepRecordLike`, `candidateConflict`, `summarizeEvent`, `isEpisodePruneJournal`, `describeDriverEvent`, `validateCommandEvidenceIdentity`) the remediation is branch-count reduction into cyclomatic-9 units, typically data-driven dispatch tables or result-variant validators, not cognitive flattening.

**Characterization states observable outcomes (PR-004).** Before writing tests, each characterization task enumerates the function’s result variants from its signature and return sites and lists them in the task; each test asserts a named variant and its durable fields, not helper calls. Every enumerated variant is mapped to the test that asserts it through a shipped entry point, or listed as unreachable with the reason and flagged to the coordinator before the dependent refactor task starts. A characterization task’s only production change is a seam limited to module-boundary visibility or injection that leaves every owned function body byte-identical, named in the task before the commit *(D-018 (2), 2026-09-28)*. For `runPass` the required cases and their observable results are: dry-run performs no mutation and acquires no lock; persisted recovery success returns the recovered state and failure returns `kind: "failed"` with the recovery reason in `details`; incomplete source inventory is reported, not silently completed; accepted-receipt replay is idempotent; deterministic-only no-op, proposal, and retirement paths produce the same persisted artifacts as today; unusable pressure and bounded deferrals return their existing variants; full-model success, invalid or missing judgment provider, and abort each return their existing variant; proposal/observation/retirement caps are enforced at the same counts; episode finalization and receipt materialization produce the same files; a committed write followed by later failure returns `kind: "failed"` with `writesCommitted` retained; lock timeout returns `kind: "failed"` with `details.recovery: "concurrent-mutation"`; unconfirmed release returns `kind: "failed"` with `recovery: "release-unconfirmed"`. The refactor separates recovery/preflight, collection/inventory/pressure, deterministic execution, model judgment/materialization, and final result assembly. One state owner retains write-through `details`, `writesCommitted`, and `episodePrunes`. Correctness decisions continue to rehydrate from receipt, proposal, retirement, and source stores; an empty in-memory map or accumulator never fabricates recovery state after restart.

The remaining production critical ownership is exact:

- **Memory:** `readRetirementReceiptInventory` and `collectConsolidationSources` already have high static coverage. Characterize first for `recoverAcceptedEpisodeFinalization`, `applyUnderLock`, `retrieveKnowledge`, `readProposalMaterializations`, `isEpisodePruneJournal`, and `candidateConflict`. This stage also extracts the consolidation-proposals/receipts clone family (Design §3 gate).
- **Harness and validation scripts:** characterize first for `isManifestEntry`, `validateCommandEvidenceIdentity`, `syncHarnessAssetCore`, `prepareClaudeCommandPair`, and `recoverOwnerRootJournal`. `runRepositoryExportValidation` and `runPersonalBundleValidation` have high static coverage.
- **Runtime, CLI, domains, and extensions:** `runDurableGraphScheduler` has high static coverage. Characterize first for `summarizeEvent`, `isStepRecordLike`, `validateChainAgentEvidence`, `adaptStoredEvent`, `runDrive`, `parseTaskBatchRow`, `describeDriverEvent`, `introspectProvider`, and `parseRememberParams`. Once `runDrive` is below threshold its registered `complexity` directive is stale and is removed with its registry row (B-007). `introspectProvider` is part of the measuring instrument (R-015); its characterization pins the normalized `analysis_status` output for the repository’s own configuration.
- **Skills and reachability script:** characterize first for `runHarnessSync` because its supplied tier is absent, for partial-tier `groupCatalogue` and `enhancedRows`, and for no-coverage `visit`. This stage also extracts the `lib/skills/exporter.ts` clone family (Design §3 gate). `visit` is part of a stage gate (R-015); its characterization pins the reachability verdict for the current `staged-code.toml`.

Characterization asserts observable variants and durable outputs, not helper calls. Parsers and validators use explicit result variants or type guards; schedulers and stateful flows retain a single state owner; presentation functions may use exhaustive data-driven dispatch where that is simpler than nested branching. Public signatures change only when a private extraction makes them unnecessary and fresh reachability confirms that no shipped consumer exists.

### 5. Justified baseline and floor refresh

After every production critical function is below threshold, inventory the remaining complexity findings. The baseline task owns all reproduced high and moderate rows from the fresh output and the critical test rows supplied at:

- the anonymous suite callback in `tests/harness-adapters/sync.test.ts` at the recorded location;
- `auditMigratedSeed` in `tests/memory/interface.test.ts`;
- the anonymous suite callback in `tests/orchestration/chain-runner.test.ts` at the recorded location;
- the anonymous suite callback in `tests/memory/markdown-store.test.ts` at the recorded location.

The spec originally said “all five” test findings; the raw evidence contains these four (three anonymous callbacks plus `auditMigratedSeed`) within the summary count of 34, and the spec was corrected on 2026-09-28 (coordinator, factual). The record reconciles the count against the fresh run; it neither fabricates a fifth finding nor drops a reproduced one. Every high/moderate row receives a file-specific justification based on its actual role, coverage evidence, and why the ratified tier rule defers it, written into the `docs/fallow-exceptions.md` subsection (D-014) and mirrored in the record. Boilerplate such as “out of scope” without a file-specific reason is insufficient.

The final source commit is then frozen. The reasoned baseline-refresh entry point is invoked separately for `dead-code`, `dupes`, and `health`, each with its own literal reason and that commit as base. The dead-code reason states that the project-scope dead-code run reports zero findings (or names the single escalated/false-positive row if Q-005 leaves one); the duplication reason names the two retained three-file families; the health reason names the `docs/fallow-exceptions.md` section and the record’s JSON digest. The refresh path, not manual editing or direct provider fix application, writes the three floors and appends manifest provenance.

The after snapshot repeats the same analysis-surface invocations and digest procedure as before, reading its configuration bundle from the object store at `analyzedCommit` (D-005). A second same-commit run must reproduce identities, counts, result digests, and `analysisConfiguration` before closeout; it may run before or after the closeout commit because it reads from `analyzedCommit`. The refreshed floors are digested as `closeout.floorConfiguration` from the closeout commit’s tree after it is committed. The changed-scope audit is then evaluated from `main` against the refreshed floors and its evidence names the closeout commit. Any earlier-category regression discovered during duplication, complexity, or closeout returns to the owning slice; it is not absorbed into a later baseline.

## Files to Change

- `missions/reviews/project-health-audit.md` (new) — human-readable before/after record, including the closeout gate-owned-file packet and the execution-liveness downstream-impact section.
- `missions/reviews/project-health-audit.json` (new) — canonical machine-readable record and dispositions.
- `docs/fallow-exceptions.md` — replace obsolete floor counts/provenance with the post-audit state; add the `### Baselined complexity (project-health-audit)` per-file justification subsection (D-014); link the whole-project record.
- `.fallow-baselines/dead-code.json` — refreshed post-remediation floor.
- `.fallow-baselines/dupes.json` — refreshed floor containing only justified retained clone families.
- `.fallow-baselines/health.json` — refreshed floor containing justified high/moderate and test-critical findings.
- `.fallow-baselines/manifest.json` — category-specific refresh provenance and digests.
- `cli/chain-execution.ts`, `cli/main.ts`, `cli/pi-flags.ts`, `cli/runtime-bootstrap.ts`, `cli/tasks/commands/create.ts` — confirmed unused type exports and critical CLI parsing where applicable.
- `cli/harness/subcommand.ts`, `cli/skills/subcommand.ts` — confirmed unused value exports.
- `cli/plans/commands/edit.ts`, `cli/tasks/commands/edit.ts`, `cli/plans/index.ts`, `cli/tasks/subcommand.ts` — canonical/domain-qualified edit registrations.
- `cli/architecture/narrative-provider.ts`, `cli/memory/judgment-provider.ts` — shared isolated Pi session setup and owned clone families.
- `cli/drive/subcommand.ts` — `runDrive` characterization and refactor; stale `complexity` directive removed afterwards.
- `.cosmonauts/suppression-exceptions.json` — shrinks only by the `runDrive` directive’s row once that directive is stale (gate-owned, R-013).
- `domains/shared/extensions/orchestration/watch-events-tool.ts` — dead export plus `describeDriverEvent` refactor.
- `domains/shared/extensions/plans/index.ts`, `domains/shared/extensions/tasks/index.ts` — shared episode-warning setup.
- `domains/shared/extensions/project-tools/analysis-consent.ts`, `domains/shared/extensions/project-tools/process-runner.ts` — dead types/values and process clone extraction.
- `domains/shared/extensions/project-tools/fallow-provider.ts` — dead exports and `introspectProvider` refactor without changing the provider-neutral contract; the Q-006 (a) duplication reconciliation fix if ruled (gate-owned, R-013, R-015).
- `lib/agent-packages/claude-binary-runner.ts`, `lib/agent-packages/codex-binary-runner.ts`, `lib/agent-packages/skills.ts` — runner and same-file clone extraction (B-011).
- `lib/architecture-map/retrieval.ts` — same-file clone extraction.
- `lib/driver/backends/claude-cli.ts`, `lib/driver/backends/codex.ts`, `lib/driver/backends/env-args.ts`, `lib/driver/backends/cli-process.ts` — confirmed dead exports/types.
- `lib/driver/drive-finalization.ts`, `lib/driver/run-one-task.ts`, `lib/driver/drive-scheduler-backend.ts`, `lib/driver/shell-command-finalizer.ts` — canonical partial formatting, dead types/values, and clone extraction.
- `lib/driver/drive-graph-compiler.ts`, `lib/driver/drive-graph-runner.ts`, `lib/driver/driver.ts`, `lib/driver/run-state.ts`, `lib/driver/state-commit.ts` — confirmed dead exports/types and owned clones.
- `lib/driver/event-stream.ts`, `lib/driver/watch-events-compat.ts`, `lib/driver/lock.ts`, `lib/entity-file-lock.ts`, `lib/fs/atomic-file.ts` — event, lock (B-011), and atomic-write clone families.
- `lib/durable-runtime/scheduler.ts`, `lib/durable-runtime/scheduler-state.ts`, `lib/durable-runtime/controller.ts` — scheduler clones and critical refactors.
- `lib/extensions/agent-memory/index.ts`, `lib/extensions/architecture-memory/index.ts`, `lib/extensions/knowledge-surface/knowledge-tools.ts` — extension clones and critical parsing.
- `lib/harness-adapters/inventory.ts`, `lib/harness-adapters/provenance.ts`, `lib/harness-adapters/registry.ts`, `lib/harness-adapters/sync.ts`, `lib/harness-adapters/target-registry.ts`, `lib/harness-adapters/types.ts`, `lib/harness-adapters/render.ts`, `lib/harness-runtime-inventory.ts` — dead type/value exports, clone families, and critical refactors.
- `lib/memory/consolidation-proposals.ts`, `lib/memory/consolidation-receipts.ts`, `lib/memory/consolidation-sources.ts`, `lib/memory/durable-files.ts`, `lib/memory/episode-transition-lock.ts`, `lib/memory/episode.ts`, `lib/memory/knowledge-records.ts`, `lib/memory/knowledge-store.ts`, `lib/memory/living-memory.ts`, `lib/memory/markdown-store.ts`, `lib/memory/okf.ts`, `lib/memory/proposal-files.ts`, `lib/memory/retirement-receipts.ts`, `lib/memory/retirement-store.ts` — owned clone families and critical memory refactors.
- `lib/orchestration/chain-episodes.ts`, `lib/orchestration/chain-event-adapter.ts`, `lib/orchestration/stage-prompts.ts` — dead types and critical event validation/adaptation.
- `lib/plans/plan-manager.ts`, `lib/process/process-group.ts`, `lib/skills/discovery.ts`, `lib/tasks/lock.ts`, `lib/tasks/task-manager.ts` — confirmed dead exports/types and owned local clones; the class-member row per D-013/Q-005.
- `lib/skills/exporter.ts` — owned clone family (extracted in the skills refactor stage) and three critical functions.
- `scripts/check-reachability.ts`, `scripts/knowledge-surface-backfill.ts`, `scripts/validate-harness-exports.ts` — dead types, script clones, and critical gate refactors.
- Focused shared helper modules under the already-owned `cli/`, `lib/agent-packages/`, `lib/driver/`, or `lib/fs/` directories may be added only where Design §3 prescribes a cross-file seam; they remain internal and are not added to public entry configuration.
- Test files: each characterization task adds new focused test files only (existing suites, including mirrored ones, stay unmodified so the D-015 check is empty; *D-018 (1), 2026-09-28, superseding “mirrored existing suites or focused new suites”*), and records the exact files and cases in the task before the refactor task starts. A test-side validator for the record schema lives under `tests/`.

Explicitly unchanged: `fallow.toml`, `missions/architecture/staged-code.toml`, `.cosmonauts/config.json`, the `qualityReview` block, and every `missions/plans/execution-liveness/` artifact.

## Risks

- **R-001 - Duplication capability fails structurally for this whole plan.** Evidence and mechanism: D-012. Mitigation: record the surface outcome as `failed` at every checkpoint (before snapshot, end of each duplication and refactor slice that extracts clones, the stage-15 recheck, the after snapshot, and the reproduction run) paired with the labeled diagnostic direct run recorded verbatim; keep exact-location surface traces before each edit; AC-004 is `unmet: capability failed` until a completed surface run exists. Pivot: if exact-location trace also fails for a reproduced family, mark it unresolved and stop that extraction for review. Q-006 decides whether the adapter defect is fixed here. *(Replaced 2026-09-28 after review.)*
- **R-002 - Boundary conformance has no configured provider coverage.** Evidence: `provider-not-configured`; architecture-map shards are also unavailable. Mitigation: record both absences, preserve known dependency direction through review and existing reachability/type checks, and do not author zones in this plan. Completion cannot describe boundaries as passing.
- **R-003 - Supplied evidence can drift before implementation.** Line numbers and clone grouping may change. Mitigation: key by normalized identities, rerun and trace immediately, and classify stale rows unresolved. Pivot: fresh findings outside a slice are added to the owning inventory before work proceeds, not silently ignored.
- **R-004 - `runPass` and stateful critical paths can preserve types while changing recovery behavior.** Mitigation: characterization first with the named observable outcomes in Design §4, one state owner, write-through committed-state reporting, persisted-state rehydration, explicit recovery/cancellation cases, and the D-015 freeze check. Pivot: any required expectation change hard-stops under Q-002.
- **R-005 - Static coverage is estimated and sometimes absent.** Mitigation: static tier remains the trigger; absent means below high; runtime coverage may inform case selection but cannot waive characterization. No “high” claim is inferred from missing data. The ceilings in Design §4 follow from the model.
- **R-006 - Mandatory clone extraction can create worse coupling.** Mitigation: local helper first, narrow shared primitive second, no global utility bucket, and two ratified three-file refusals. Pivot: if a one-/two-file family cannot be removed without violating an invariant or dependency direction, stop for human scope review rather than baseline it contrary to Q-003.
- **R-007 - Refactors can move rather than remove complexity.** Mitigation: evaluate newly extracted helpers against the tier-dependent ceilings in Design §4; a slice whose helpers cannot meet them follows the step-4 exit (seam in a characterization commit, else `blocked` escalation), never a threshold or configuration change.
- **R-008 - Later slices can recreate earlier findings.** Mitigation: relevant capability rechecks at every stage and complete after snapshot. Any regression routes back to its owning stage before baseline refresh.
- **R-009 - Baseline/record commit cannot cryptographically name itself.** Mitigation: D-010’s final analyzed source commit plus artifact-only closeout and an explicit path diff, pending Q-004. If a closeout change touches analyzed source or analysis configuration beyond the three baselines, the manifest, the exceptions doc, and the two record files, discard closeout and regenerate from a new source commit.
- **R-010 - The spec prose and raw critical-test count disagreed.** Corrected in the spec on 2026-09-28 (four, not five). Mitigation: reconcile against the fresh inventory; a fresh fifth finding is included automatically.
- **R-011 - Direct provider use could become a shadow gate.** Mitigation: every direct invocation is labeled `surface-missing` or `diagnostic`, recorded verbatim, and kept separate from capability outcome. Unsupported/unbound/failed surface evidence stays non-passing.
- **R-012 - Work breadth exceeds a safe parallel-change surface.** Mitigation: sixteen dependency-ordered slices with disjoint-file stages independent of each other, characterization commits before refactors, a green close at every slice, and the D-015 record-only commits between slices. Unexpected complexity changes the slice boundary on record; it does not merge stages or skip ordering.
- **R-013 - Gate-owned paths change by design.** `.fallow-baselines/*` (closeout), `domains/shared/extensions/project-tools/fallow-provider.ts` (dead exports, `introspectProvider`, the Q-006 (a) fix), and `.cosmonauts/suppression-exceptions.json` (shrink-only) are host gate-owned per `lib/orchestration/quality-review-run.ts`. The Quality Manager will emit “Gate-owned file changed: <file>; human decision required.” for each and cannot return `ready`. Mitigation: expected, not a failure. The closeout section of the record lists each changed gate-owned file with its justification as one human sign-off packet, and completion is reported as “QM human-decision items pending sign-off”. Pivot: if the human declines the provider edits, revert them, baseline the provider’s dead exports and `introspectProvider` with a reason, and re-run the baseline stage. *(Added 2026-09-28 after review, FEAS-003.)*
- **R-014 - `execution-liveness` targets files this audit restructures.** Its plan and To Do tasks TASK-712..719 name `cli/drive/subcommand.ts`, `lib/entity-file-lock.ts`, `lib/driver/lock.ts`, `lib/durable-runtime/scheduler.ts` and `scheduler-state.ts`, `lib/driver/run-one-task.ts`, `drive-finalization.ts`, `drive-scheduler-backend.ts`, `lib/process/process-group.ts`, `lib/tasks/lock.ts`, and `lib/memory/episode-transition-lock.ts`. Mitigation: this plan does not edit that plan’s artifacts; lock-primitive extraction keeps acquisition, stale-owner, and release behavior observably identical (B-011); the closeout writes a “Downstream impact: execution-liveness” section listing, per file, new modules with exported names, functions moved or split, and any newly shared lock/scheduler/finalization code, and flags that plan for re-validation before TASK-712 starts. *(Added 2026-09-28 after review, SEQ-005.)*
- **R-015 - The plan refactors its own measuring instruments between snapshots.** `introspectProvider` and the provider’s dead exports (stage for runtime/extension criticals and stage 1), and `visit` in the reachability gate, change between the before and after snapshots. Mitigation: the adapter file is in the `analysisConfiguration` bundle so the change is visible in the digests; the characterization commits for `introspectProvider` and `visit` pin their normalized outputs on the repository’s own configuration before the refactor; the reproduction run at `analyzedCommit` uses the refactored adapter and must match the after snapshot. A change in the adapter that alters any finding identity for an unchanged file is a regression that returns to its owning stage. *(Added 2026-09-28 after review, DA-006/SEQ-004.)*

## Implementation Order

**Stage gate.** Every stage below ends with all of these exiting 0 at the stage’s final commit: `bun run test`, `bun run lint`, `bun run typecheck`, `bun run check:reachability`, `bun run check:suppressions -- --base main`. `check:reachability` is not a configured `qualityReview` check, so every Drive run for this plan lists all five in its postflight commands. Each stage also re-runs its owned capability as stated, records the D-015 freeze-check output, and hands the updated record rows to the coordinator for the record-only commit. A failed or unbound capability is recorded and never counted as one of the five gates. Execution runs in a Pi-hosted role with the analysis surface: Drive `cosmonauts-subagent` inline backend, one slice per run, GPT model for the worker (D-017, Q-007 (a)). Dependencies are stated per stage; stages without a mutual dependency may run in either order but never concurrently on the same files.

1. **Before snapshot, dead code, and duplicate exports — B-001, B-002, B-003, B-007, B-009, B-010.** Depends on: nothing. Run `analysis_status` from the execution root and record consent; freeze the stage-start commit; populate the before record (schema and validator per Design §1, group-to-family mapping per Design §3) from Shepherd evidence plus fresh surface evidence; copy all 133 supplied dead-code identities into dispositions; trace and remediate all reproduced unused values, types, and both duplicate-export pairs; disposition the class-member row `false-positive` with its live reference (D-013, Q-005 (a)). Introduce the canonical partial-format seam and domain-qualified task edit registration. Land the duplication reconciliation fix with its regression test (D-012, Q-006 (a)) and re-run project-scope `duplication` through the surface: it must complete with `verdict: "fail"` and the 87-group inventory before any clone work starts. End with zero fresh dead-code findings other than the recorded false positive, visible capability states, and the stage gate.

2. **Characterize binary runners and lock primitives — B-011, B-010.** Depends on: 1. Land the B-011 characterization cases for `runClaudeBinary`/`runCodexBinary` (single cleanup, signal-handler removal, exit-code and signal propagation, variant-specific arguments) and for `lib/driver/lock.ts` and `lib/entity-file-lock.ts` (timeout, stale-owner race, warning, release confirmation) as a green commit without editing those modules.

3. **Duplication: core runtime, CLI, domains, and driver — B-004, B-010, B-011.** Depends on: 2. Own the families in Design §3’s first group. Run the D-009 overlap check first; trace every group before edit; preserve variant-specific behavior. End with owned one-/two-file families absent from the diagnostic inventory and per-location traces, the surface duplication outcome recorded as it is, and the stage gate.

4. **Duplication: extensions, harness, and validation — B-004, B-010.** Depends on: 1 (files disjoint from 3; may follow 3 or run before it). Own the extension rendering/limit, harness render/sync, sync/validation-script, and validation-script same-file families. Keep transaction and filesystem consistency semantics at their existing owners. End as stage 3.

5. **Duplication: memory, skills, and tasks, and three-file dispositions — B-004, B-010.** Depends on: 3 and 4. Own every remaining one-/two-file family in Design §3’s third group except the three moved to critical slices; write the exact reasons for both three-file baselines; reconcile the 41/2 split against the persisted mapping and fresh evidence. End as stage 3, with the three moved families recorded as pending their owning refactor stage.

6. **Characterize critical harness and validation functions — B-005, B-010.** Depends on: 5. Land characterization for `isManifestEntry`, `validateCommandEvidenceIdentity`, `syncHarnessAssetCore`, `prepareClaudeCommandPair`, and `recoverOwnerRootJournal` as a green commit without editing them; record the result variants and cases.

7. **Refactor critical harness and validation functions — B-005, B-010.** Depends on: 6. Refactor all seven (the five above plus high-coverage `runRepositoryExportValidation` and `runPersonalBundleValidation`) against the Design §4 ceilings. End with owned functions and helpers below thresholds, the freeze check clean against the stage-6 commit, and the stage gate.

8. **Characterize critical runtime, CLI, domain, and extension functions — B-005, B-010.** Depends on: 5 (files disjoint from 6/7). Land characterization for `summarizeEvent`, `isStepRecordLike`, `validateChainAgentEvidence`, `adaptStoredEvent`, `runDrive`, `parseTaskBatchRow`, `describeDriverEvent`, `introspectProvider` (pinning normalized `analysis_status` output, R-015), and `parseRememberParams` as a green commit without editing them.

9. **Refactor critical runtime, CLI, domain, and extension functions — B-005, B-007, B-010.** Depends on: 8. Refactor all ten including high-coverage `runDurableGraphScheduler`; remove the stale `runDrive` directive and its registry row. End as stage 7.

10. **Characterize critical skills and reachability functions — B-005, B-010.** Depends on: 5 (files disjoint from 6-9). Land characterization for missing-tier `runHarnessSync`, partial-tier `groupCatalogue` and `enhancedRows`, and no-coverage `visit` (pinning the reachability verdict, R-015) as a green commit without editing them.

11. **Refactor critical skills and reachability functions and extract the exporter clone family — B-004, B-005, B-010.** Depends on: 10. Refactor all four; extract the `lib/skills/exporter.ts` same-file family inside `groupCatalogue`. End as stage 7 plus the stage-3 duplication evidence for the extracted family.

12. **Characterize remaining critical memory functions — B-005, B-010.** Depends on: 5 (living-memory.ts is shared with stages 14/15, so this stage precedes them). Land characterization for `recoverAcceptedEpisodeFinalization`, `applyUnderLock`, `retrieveKnowledge`, `readProposalMaterializations`, `isEpisodePruneJournal`, and `candidateConflict` as a green commit without editing them.

13. **Refactor remaining critical memory functions and extract the proposals/receipts clone family — B-004, B-005, B-010.** Depends on: 12. Refactor the eight owned functions (including high-coverage `readRetirementReceiptInventory` and `collectConsolidationSources`); extract the consolidation-proposals/receipts family inside `readProposalMaterializations`. `recoverAcceptedEpisodeFinalization` is refactored here but the living-memory same-file clone instances inside it are extracted in stage 15 together with `runPass`’s. End as stage 11.

14. **Characterize `runPass` — B-005, B-010.** Depends on: 13. Land a green characterization commit covering every outcome named in Design §4 without editing `runPass`; record the cases in the task. This is the stage Q-002 expects may escalate; stages 7, 9, and 11 are complete by now so a hard stop here blocks only 15 and 16.

15a. **Refactor `runPass` and extract the living-memory clone family — B-004, B-005, B-010.** Depends on: 14 and every refactor stage (7, 9, 11, 13). Decompose `runPass` per Design §4 while preserving single-owner details and persisted recovery; name the TASK-779 cases covering `recoverAcceptedEpisodeFinalization` beside the stage-14 cases before extracting the clone instances inside it; extract the nine-group living-memory same-file family; re-run all complexity metrics and prove no production critical remains; record the fresh high/moderate and test-critical row list as the input to 15b. End as stage 11. *(Split by D-018 (3), 2026-09-28, applying the stage’s own split rule up front.)*

15b. **Write justified complexity baselines — B-006, B-007, B-010.** Depends on: 15a. At the 15a tip, write the per-file justification for every high/moderate row and every reproduced critical test row into `docs/fallow-exceptions.md` (D-014) with the identical record mirror; no production critical appears. Recheck dead code and duplication so later work has not recreated earlier debt. End with complete dispositions and the stage gate.

16. **Freeze, refresh, reproduce, and close out — B-001, B-007, B-008, B-009, B-010.** Depends on: 15b. Q-004 (a) governs the commit shape as amended by D-018 (4): Drive’s commit carries the floors and `docs/fallow-exceptions.md` (with the pre-audit counts and `29fc0ce`/N-001 provenance replaced by the refreshed state and a link to the record), the coordinator’s record-only commit carries the record files, and the diff from `analyzedCommit` to the tip lists exactly those seven paths. The after snapshot and the reproduction run must show project-scope `duplication` completed with `verdict: "fail"` and only the two three-file families remaining; AC-004 is marked satisfied only then. Commit the final source/test state; separately refresh the dead-code, duplication, and health floors against that commit with one category-specific reason each; complete the before/after JSON and Markdown records, the gate-owned-file sign-off packet (R-013), and the execution-liveness downstream-impact section (R-014); repeat the recorded invocations at `analyzedCommit` to prove identity/count/`analysisConfiguration` digests; evaluate changed-scope audit from `main`; update the exceptions documentation; and commit only closeout artifacts. If any capability, digest, floor, suppression, reachability, or configured project check is not in its required state, return to the owning stage rather than publishing a clean verdict. Report completion as “QM human-decision items pending sign-off”.

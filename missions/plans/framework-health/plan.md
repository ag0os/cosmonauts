---
title: 'Framework Health: plans that describe outcomes, tests that can fail, code that is reachable'
status: active
createdAt: '2026-09-20T00:00:00.000Z'
updatedAt: '2026-09-20T00:00:00.000Z'
---

## Overview

The planning format makes the planner commit — before any code exists — to the
file a behavior lives in (`Seam`), the test file and test title that prove it
(`Test`), and a comment string that links them (`Marker`). The only obligation
the system then enforces is that the string exists in the named file. The
cheapest path to green is code shaped like the sentence and a test shaped like
the sentence. Nothing asks whether anything that ships routes through the code,
or whether the test could fail for a real reason.

Measured at `f4b0789` (every number re-derived by two sessions independently):

- 704 `toContain(` assertions over authored markdown in `tests/prompts/` (89%
  of that directory's assertions). 72 plan behaviors ordered tests there; the
  format's own canonical example is one. They were planned, not improvised.
- 614 `@cosmo-behavior` markers bind live tests to 28 archived plans; 32 bind
  to the 2 active ones.
- `lib/orchestration/spawn-compiler.ts` has zero production importers. Archived
  `orchestration-surface-consolidation` B-016 is titled "Spawn has a *tested*
  1-node graph compiler shape"; its actor is "a caller" and its Action is "it
  calls `compileSpawnToGraph`". The plan ordered an unwired function and a test
  of it, and got exactly that.
- `lib/driver/run-run-loop.ts` is imported by production only for a type;
  `runOneTask` is therefore transitively test-only. Per-export grep cannot see
  this; 11 exports are directly test-only and 34 more are exported only for
  their own tests.
- `test-health-audit` assessed 3,166 declarations. Fault sensitivity came back
  `reasoned` for 3,134 and `probe-confirmed` for 1. It recommended removing 4
  tests, and graded all 135 `tests/prompts` declarations retain/investigate —
  reading a shipped `.md` counts as grounded. The audit scored tests against
  plan statements and reasoned about fault-sensitivity instead of probing it:
  it reproduced the defect it was built to find.

This plan fixes the format, then the tests, then the code, in that order, and
is biased toward deletion at every stage. It supersedes `test-health-audit` and
reshapes `project-health-audit`. It is written in the format it proposes.

## Intent

Goal: a plan tells a capable agent what must be true for whom; a green suite
means shipped behavior is protected; everything in `lib/` is reachable from
something that ships or is declared staged.

Invariants — mechanism yields to these:

- INV-001 - A plan behavior states who observes it, through what shipped entry
  point, and what they observe. It does not name source files, functions, test
  files, or test titles. (human, 2026-09-20: "drop them outright")
- INV-002 - Test design belongs to whoever has seen the code. Planners do not
  pre-name tests; there is no one-behavior-one-test rule.
- INV-003 - Tests exercise logic with synthetic data and are not coupled to
  particular agent definitions or authored prose: if the logic is unchanged,
  the test stays green. One exception, ratified with D-019: a test may assert
  that shipped guidance does *not* name a provider, toolchain, language or
  framework, because that absence is a project rule rather than wording.
  (human ruling, recorded in TASK-701; exception human, 2026-09-22, from
  `review-1.md PR-002`)
- INV-004 - Archived plans are historical documents with no authority over
  live tests or code. No *executable* coupling to one survives: no marker, no
  test assertion, no gate check. Citations in `knowledge/` (97 files,
  byte-pinned by the promotion ledger) are history citing history and are out
  of scope. (human ruling Q-004, generalised in TASK-701)
- INV-005 - "Can this test fail" is answered by making it fail, never by
  reasoning about it. A judgment that cannot itself fail is not evidence.
- INV-006 - Unreachable code is either declared staged, with an owner, or
  deleted with its tests. Staged and orphaned never share the same green.
- INV-007 - Prefer deleting a constraint to adding one. New mechanism must
  name what it replaces. (human: agents need "good personas, context and
  coordination", not constraints in excess)

## Decision Log

- **D-001 - Drop `Seam`, `Test`, `Marker`, and the artifact-conformance gate outright**
  - Decision: remove the three fields, the one-test-per-behavior rule, the
    "durable home is the test layer" doctrine, the marker checks, and the
    `artifact-conformance` gate row. Not optional fields — gone.
  - Alternatives: keep as optional (rejected: an optional field a planner
    prompt mentions is a field every planner fills).
  - Why: INV-001, INV-002, INV-007.
  - Decided by: human, 2026-09-20
- **D-002 - Re-specify `test-health-audit`; its profiles are forfeit**
  - Decision: replace the per-declaration agent-assessment method with
    reachability plus real mutation probes (Stage 2). The ~3,100 profiles and
    both dead epochs are discarded as evidence. `plan.md`/`spec.md` of that
    plan are no longer frozen.
  - Why: INV-005; the fault-sensitivity axis had no discriminating power.
  - Decided by: human, 2026-09-20
- **D-003 - Branch `feature/framework-health` off `f4b0789`**
  - Decided by: human, 2026-09-20
- **D-004 - Keep the Decision Log checks, delete the rest of `lib/artifacts`**
  - Decision: `unresolved-decision-citation` and `undated-supersession` guard
    the Decision Log and deviation protocol, which stay. Every other issue
    kind in `behavior-conformance.ts` goes. `plan check-artifacts` survives as
    a much smaller command.
  - Alternatives: delete the whole module (rejected: would silently drop a
    coordination check nobody asked to drop).
  - Why: INV-007 cuts both ways — delete constraint, keep coordination.
  - Decided by: planner-proposed
- **D-005 - Prose changes are reviewed, not unit-tested**
  - Decision: a behavior whose subject is a prompt, persona, or skill body is
    verified by the plan-reviewer/quality-manager reading the diff. Tests may
    pin only what a machine parses: frontmatter keys, tool/capability names
    resolved by code, file existence the loader depends on.
  - Absence guards (33 `not.toContain`) are not swept as a class in either
    direction. One survives only if the absent token is something production
    code would resolve if present — a tool name offered to a read-only role,
    a frontmatter key, a removed phase marker. Absence of a prose phrase passes
    on any reword and goes. Borderline cases (e.g. provider names in a
    provider-neutral skill) go to the human in the Stage 2 packet.
  - Why: INV-003. A `toContain` on prose goes red on a harmless reword and
    stays green on an incoherent rewrite.
  - Decided by: planner-proposed
- **D-006 - Reachability comes from a tool rooted at real entry points**
  - Decision: use `fallow` (already a devDependency) rooted at `bin/`, `cli/`,
    `package.json#pi.extensions`, and domain manifests. Tests are not roots.
  - Alternatives: per-export grep (rejected: blind to transitive orphans,
    `export {}` lists, and comment mentions — measured).
  - Decided by: planner-proposed *(superseded in part by D-020, 2026-09-22)*
- **D-007 - One staged-code list, not a marker scheme**
  - Decision: a single tracked file lists deliberately unwired modules, each
    with the active plan or roadmap item that will wire it. The reachability
    check reads it. An entry whose owner is archived or absent is an orphan.
  - Why: INV-006 with the least mechanism INV-007 allows.
  - Decided by: planner-proposed *(superseded in part by D-020, 2026-09-22)*
- **D-008 - Mutation probes are sampled and mechanical**
  - Decision: for a sample stratified by directory, mutate the production
    unit a test claims to cover and record whether the test goes red. Restore
    from `cp` backups, never `git checkout`. Results are recorded as
    killed/survived, nothing else. No per-test agent essay.
  - Why: INV-005.
  - Decided by: planner-proposed *(superseded in part by D-021, 2026-09-22)*
- **D-009 - The new format gets one real trial before Stage 3**
  - Decision: after Stage 1, take one small open behavior from
    `execution-liveness`, restate it in the new shape, have a worker implement
    it under the new policy, and run D-008 probes on the tests it wrote. If
    the probes survive, the format claim is unproven and Stage 1 is revisited
    before anything is deleted in Stage 3.
  - Why: INV-005 applied to this plan. "This format yields tests that can
    fail" is otherwise a judgment that cannot fail.
  - Decided by: planner-proposed (raised in peer review)
  - Result, 2026-09-20: 11 of 11 mutants killed, including the wiring mutant;
    see `trial-d009.md` for the table and for what one run does not show.
- **D-010 - Discarded audit commitments are dropped or re-homed on the record**
  - Decision: (a) Q-002's owner-signed limitation channel
    (`acceptedConditionLimitations`, `established-with-limitations`, spec
    AC-013) is dropped with the old method, citing D-002. The ruling's
    principle — an exception is named and signed rather than legislated into
    the formula — is not reversed; it lives on in D-007's staged-code list,
    which has the same shape. Part 1 of that ruling (the condition-4
    `protected` repair, `51d7b11`) fixed a real defect and dies with
    `portfolio.ts` only because the method does. (b) Q-003 — a tab is the
    contract for multi-column row listings — returns to `ROADMAP.md` as a
    prioritized defect: `cli/plans/commands/list.ts:119` and
    `cli/tasks/commands/shared.ts:96` join fields with an unescaped `" | "`,
    and titles may contain a pipe. Its deferral reason ("moves the
    counted-guardrail set") was an artifact of the old counting method and is
    void. (c) `TASK-706` and `TASK-707` are superseded by this plan.
  - Decided by: human, 2026-09-20 *(part (c) extended by D-022, 2026-09-22)*
- **D-011 - Independent review of Stage 1 runs at the end of Stage 1**
  - Decision: a read-only codex correctness review of the Stage 1 diff, not
    deferred to the end-of-plan sweep. Stage 1 rewrites the planner and
    plan-reviewer prompts; an error there propagates into every later plan and
    no test run can see it.
  - Decided by: human, 2026-09-20
- **D-012 - Prose tests that pin rewritten text are deleted in the commit that rewrites it**
  - Decision: Stage 1's prose rewrite turned 17 `tests/prompts` tests red,
    every one a `toContain` on a sentence this plan removes (e.g. "rejects
    plans with behaviors missing named tests or markers"). They are deleted in
    the same commit rather than waiting for Stage 2's sort, because the
    alternative is a red suite between stages or rewording the assertions to
    match the new sentences — which is the defect. Stage 2 still sorts the
    remainder. The review rounds added two more of the same kind: a pinned
    Drive non-goal phrase, and a test that went red when "on code" was
    inserted into a sentence it asserted verbatim — the defect demonstrating
    itself.
  - Why: INV-003; D-005.
  - Decided by: worker-amended, 2026-09-20 (derived)
- **D-013 - The pre-W3 byte-pin of every shipped prompt is removed**
  - Decision: `tests/episodic/pre-w3-disabled-baselines.test.ts` compared the
    sha256 of 108 prompt and skill files against
    `tests/fixtures/knowledge-surface-off-baselines.json`, a baseline frozen
    by archived `knowledge-surface` (B-008) to show that shipping that feature
    switched off left prompts untouched. That was true on the day and proves
    nothing since: every later prompt edit has had to re-pin it (`554bbcb`).
    Stage 1 changed 18 of the 108. The per-file hash loop is deleted; the
    rest of the test, which exercises gated runtime behavior, stays. The only
    documents that govern the fixture are archived plans.
  - Alternatives: re-pin the 18 hashes (rejected: keeps a check whose only
    possible failure is "someone edited a prompt").
  - Why: INV-003, INV-004.
  - Decided by: human, 2026-09-21 (kept; proposed by the worker 2026-09-20)
- **D-014 - `execution-liveness` is migrated in steps, not at once**
  - Decision: that plan's backlog was built entirely in the old format: 21
    `test.todo` stubs in 4 files whose titles were the plan's `Test:` fields
    verbatim (the suite's whole "21 todo"), and 8 of 9 task ACs reading "No
    test.todo remains for B-0xx; its named tests execute and pass". Step 1,
    mechanical: delete the stubs and replace that clause with an outcome
    (worker-designed tests, seen to fail). Step 2: restate B-011 alone and
    TASK-683's ACs. Step 3: run the D-009 trial on it. Step 4: decide the other
    20 behaviors after the trial reports. Supersedes the Risks note that said
    not to migrate this plan.
  - Alternatives: restate all 21 first (rejected: rewrites a reviewed plan
    into the format the trial exists to validate).
  - Why: INV-005 applied to this plan; D-001 already removes what the stubs
    and the clause served.
  - Decided by: human, 2026-09-20 — sequencing proposed in peer review,
    approved by the human through the peer session and confirmed directly on
    2026-09-21
- **D-015 - The Quality Contract table is load-bearing through a prompt, so it is not deleted yet**
  - Decision: no code reads the table, and its `Binding state` column is
    provenance only — `lib/analysis/binding-resolver.ts` computes binding from
    provider detection at run time. But `quality-manager.md` resolves bindable
    gates "for every bindable row", and with no table every gate list is
    empty: deleting the table today silently stops duplication, complexity,
    dead-code and boundary gates from running. The simplification that makes
    it deletable is to have the quality-manager resolve every gate kind with
    a runtime capability regardless of the plan. Held for the human.
  - Decided by: planner-proposed; superseded in part by D-016, 2026-09-21
- **D-016 - Plans stop declaring quality gates; the quality-manager resolves them from the runtime on every run**
  - Decision: the `## Quality Contract` gate table leaves the plan format.
    The quality-manager now resolves every gate kind with a runtime
    capability on every invocation, with or without a plan, keeping the
    resolution rules the analysis-gate work established (exclusive outcome,
    `failed-to-run` blocks, unbound degrades, unsupported metrics degrade
    alone, verdicts only from declared coverage). Gone with the table: the
    declared `Binding state`, `universal_gate_status`, and the
    protocol-pending state, which existed only to reconcile a declaration
    with the runtime. Legacy `QC-*` criteria lists in older plans are still
    honoured. `gate-contracts.md` keeps the gate-kind list a live test parses.
  - Alternatives: keep the table (rejected: a planner's prediction of a fact
    only the runtime knows); delete it without changing the quality-manager
    (rejected: D-015 — silently stops four gates).
  - Why: INV-007. Supersedes the deletion hold in D-015, 2026-09-21.
  - Decided by: human, 2026-09-21 — approved directly (confirmed by the human
    again on 2026-09-21 when a successor session could not trace it), with the
    condition that the runtime path be verified first; that verification is
    D-015. The gate-kind list in `gate-contracts.md` is no longer parsed by a
    test: see D-019.
- **D-017 - The marker strip ran behind its gate, and the gate found one coupled test**
  - Decision: 546 markers removed from 172 test files — 406 comment lines and
    140 appended to test titles, so the before/after comparison normalises
    titles. Per-test outcomes were compared across the whole suite (3,170
    tests before). One outcome changed:
    `tests/coding-agnostic-fixtures.test.ts` greps every test file for the
    substring "coding" and requires the result to equal a ledger that lives
    in archived `coding-agnostic-framework`. Five files matched only because
    their marker comment named that plan. The ledger is archived and cannot
    be edited; the file's three tests validate nothing but that ledger. The
    file is deleted. Deleted with the strip for the same reason: two tests
    in `tests/memory/interface.test.ts` that read other tests' source and
    assert they carry named markers and contain named assertion strings.
  - Why: INV-004 — no executable coupling to an archived plan survives.
  - Decided by: derived from INV-004 (human, 2026-09-20), 2026-09-21
- **D-018 - The prose sort follows the pins, not the directory**
  - Decision: Stage 2's design named `tests/prompts/`. A probe that blanks
    every shipped markdown body found the same defect in 14 other test files
    (`tests/docs/`, sentence lists over `docs/memory.md` and `README.md`,
    persona sentences in domain tests, source-text greps). They are sorted by
    the same D-005 rule. The correction-region byte-pin of three prompts in
    `tests/episodic/pre-w3-disabled-baselines.test.ts` goes with them: it is
    the check D-013 removed for the other 108 files, against the same fixture.
    Where a test used a persona sentence to prove routing, the sentence is
    replaced by the agent-id marker or the loaded file, not deleted. One test
    is added: shipped skills are discovered under their directory name with a
    description, because both B-007 frontmatter mutants survived without it.
    Record: `stage2-probes.md`.
  - Alternatives: stop at `tests/prompts/` as written (rejected: B-006 is
    about the suite, and it stayed false).
  - Why: INV-003; B-006, B-007, B-008.
  - Decided by: worker-amended, 2026-09-21 (derived from D-005 and D-013)
- **D-019 - Documentation tables are not compared with code constants**
  - Decision: the three tests in `tests/analysis/contracts.test.ts` that parsed
    tables out of `gate-contracts.md` and `docs/analysis-provider-validation.md`,
    and the episode-action table test in `tests/memory/interface.test.ts`, are
    deleted. No production code reads those tables. The provider-, toolchain-
    and framework-name absence guards in
    `tests/prompts/provider-neutrality.test.ts` are kept.
  - Decided by: human, 2026-09-21 (direct; both rulings). The kept guards
    are the INV-003 exception the human ratified 2026-09-22.

- **D-020 - Reachability roots include the declared public API, and staged modules are tool entries**
  - Decision: `fallow` is rooted at `bin/`, `cli/`, `package.json#pi.extensions`, domain manifests, and the modules `fallow.toml` already declares as `entry` — the 23 `lib/` modules the package publishes as deep-importable public API. Deliberately unwired modules are listed as further `entry` items, each annotated with the active plan or roadmap item that will wire it, so both the direct run and the quality-manager's capability treat them as reached with no adapter. One project command runs the tool and then a check that fails on an annotation whose owner is archived or absent; that command is B-009's entry point. The quality-manager's `dead-code` capability is a separate consumer of the same tool and depends on per-user analysis consent held outside the repository; no repository change can bind it, and this plan does not try.
  - Alternatives: roots without the public API (rejected: deletes modules consumers import); a separate staged list (rejected: nothing on the gate path read it); relying on the quality-manager's gate (rejected: unbindable from the repo).
  - Why: `review-1.md PR-003, PR-004, PR-005`; `review-2.md PR-008`.
  - Decided by: worker-amended, 2026-09-22 (derived)
  - Supersedes: D-006 and D-007 in part (2026-09-22)
- **D-021 - Mutation probes have a reproducible sample and run in a throwaway worktree**
  - Decision: the population is every test file under `tests/` that imports from `lib/`, `cli/`, `domains/` or `scripts/`; strata are the first directory level under `tests/`; each stratum contributes the larger of three files and ten percent of its files; within a stratum files are sorted by path and taken at an even stride from the first. Probes run in a throwaway git worktree of the committed tree, never in the working checkout, so an interruption leaves nothing broken behind; within it, mutated files are restored from `cp` backups. The record names the commit, the population count, each stratum's size, and the stride.
  - Why: `review-1.md PR-008`; `review-2.md PR-006, PR-007`. The audit tooling's own suites import only from `scripts/`, and Stage 2 keeps them in scope.
  - Decided by: worker-amended, 2026-09-22 (derived)
  - Supersedes: D-008 in part (2026-09-22)
- **D-022 - The superseded audit plan has a lifecycle exit**
  - Decision: the runtime has no `superseded` plan status and archive refuses while a linked task is open; of the audit plan's 22 tasks, 20 are Done and only `TASK-706` and `TASK-707` are open. When Stage 2's re-spec lands they close `Done` keeping the `superseded` label and a note naming this plan, the audit plan is marked `completed`, and it is archived in the ordinary way.
  - Why: `review-1.md PR-006`.
  - Decided by: worker-amended, 2026-09-22 (derived)
  - Supersedes: D-010 part (c) in part (2026-09-22)

## Behaviors

**Stage 1 — format**

### B-001 - Planners are told to describe outcomes

- Source: INV-001, INV-002
- Observer: a planner agent preparing a plan
- Entry point: the shipped `plan` and `work-artifacts` skills and the planner prompt it is composed from
- Outcome: a behavior shape of observer, entry point, outcome, and source; no instruction anywhere in shipped prompts or skills to name a seam, a test, or a marker

### B-002 - The plan check covers the Decision Log and nothing else

- Source: INV-007
- Observer: a human or agent running `cosmonauts plan check-artifacts <slug>`
- Entry point: that command, in human, `--plain`, and `--json` modes
- Outcome: a plan in the new shape passes; a plan citing an undeclared `D-###`, or carrying a `Supersedes:` pointer or supersession annotation without a date, fails with that issue and a non-zero exit; nothing about tests or markers is checked

### B-003 - Workers own test design

- Source: INV-002, INV-003, INV-005
- Observer: a worker agent picking up a planned task
- Entry point: the worker prompt and the `tdd` skill it loads
- Outcome: it is told test design is its job, and finds one short policy: drive the real entry point, synthetic data, no assertions on prose, prove the test can fail

### B-004 - Reviewers reject function-shaped behaviors

- Source: INV-001, INV-006
- Observer: a plan-reviewer agent reviewing a plan
- Entry point: the plan-reviewer prompt
- Outcome: it is told to raise a finding for a behavior with no real observer or shipped entry point, one that names a function, file, or test, and a designed unit nothing shipped will call

### B-011 - Quality gates come from the runtime, not the plan

- Source: INV-007, D-016
- Observer: the quality-manager reviewing a branch
- Entry point: any quality-manager invocation that has a review scope, with or without an active plan
- Outcome: every gate kind with a runtime capability is resolved exactly once, from the runtime's status, and nothing in the plan is needed to decide which gates run

**Stage 2 — tests**

### B-005 - No test points at a plan

- Source: INV-004
- Observer: a maintainer searching test declarations and their comments for `@cosmo-behavior`
- Entry point: every test file under `tests/`
- Outcome: no test declaration or comment carries a marker — frozen history fixtures under `tests/fixtures/` are records INV-004 leaves alone — and the per-test pass/fail list is identical before and after the strip except for tests deleted on the record in the same change

### B-006 - Rewording prose does not break the suite

- Source: INV-003
- Observer: a maintainer rewording a persona or skill body without touching machine-parsed structure and without naming a provider, toolchain, language or framework (the INV-003 exception)
- Entry point: the project's test command
- Outcome: the suite stays green

### B-007 - Breaking parsed structure does

- Source: INV-003
- Observer: a maintainer removing a frontmatter key or a tool name that code resolves from a shipped prompt or skill
- Entry point: the project's test command
- Outcome: the suite goes red

### B-008 - Sampled tests are shown able to fail

- Source: INV-005
- Observer: a maintainer reading the probe record
- Entry point: the record Stage 2 commits
- Outcome: each sampled test is marked killed or survived, and every survivor has been strengthened, replaced, or deleted

**Stage 3 — code**

### B-009 - Unreachable code fails a check

- Source: INV-006
- Observer: a maintainer running the reachability check
- Entry point: the project's reachability command, which runs the tool and the staged-owner check as one step
- Outcome: every `lib/` module is reachable from a shipped entry point or listed as staged with a live owner; anything else fails, including an entry whose owner is archived

### B-010 - The known orphans are resolved

- Source: INV-006
- Observer: a maintainer running the reachability check on the branch Stage 3 delivers
- Entry point: the project's dead-code gate
- Outcome: the three orphans measured in the Overview no longer appear as unreachable — each is wired, staged with an owner, or gone along with its tests — and the staged list names no owner that is archived

## Design

**Stage 1 — format (deletion).** Rewrite `behavior-spine.md` and the Behaviors
section of `plan-format.md`; fix `examples.md`, `gate-contracts.md`, and the
one-to-three-line mentions in `plan`/`task`/`tdd` skills and the planner,
plan-reviewer, task-manager, worker, reviewer, verifier, quality-manager
prompts and `architectural-design.md` (17 shipped files, 36 mentions). Reduce
`lib/artifacts/behavior-conformance.ts` (1,103 lines) to the two Decision Log
checks — done as `lib/artifacts/plan-conformance.ts` (renamed with the
reduction, 2026-09-20); shrink `tests/artifacts/behavior-conformance.test.ts`
(1,545 lines; now `tests/artifacts/plan-conformance.test.ts`) to
match, using synthetic plan text only — the test at `:1400` that reads three
real plans from `missions/` goes. Update `~/.claude/commands/implement-plan.md`
(one mention; outside the repo — hand the user the diff). Add the test policy
as a short section of the `tdd` skill rather than a new document.

Re-audit afterwards for what else in the artifact machinery is constraint
rather than coordination: the Quality Contract ladder, behavior-count
advisory, workflow tiers, versioned review rounds. Propose deletions to the
human as one packet; do not delete on own authority.

**Stage 2 — tests.** Strip all markers mechanically, in one commit that
touches comments only. Gate, not assumption: capture the per-test pass/fail
list before and after; any difference outside the three known flakes (re-run
in isolation) reverts the commit. For `tests/prompts/`: enumerate
which assertions pin machine-parsed structure by checking whether production
code parses the asserted token; keep those, delete the rest. Then run D-008
probes. Rewrite `missions/plans/test-health-audit/spec.md` to this method and
mark the old plan superseded. The audit tooling is in scope: five suites under
`tests/scripts/test-health-audit/` test `scripts/test-health-audit/`, and
`census.test.ts:925` reads the live `fixtures/calibration.md` off disk. Decide
per script whether it serves the new method (census, probe likely do) or goes
with its suite. Known rot to fix or delete, not inherit:
`validateCalibrationRecord` (`scripts/test-health-audit/artifacts.ts:1215-1223`)
checks only that `sources[].path` and `.identity` are non-empty strings, so a
calibration control can cite a test that no longer exists and still certify.
`artifacts.test.ts` and `carry-forward.test.ts` build synthetic `audit/epochs`
roots in temp dirs; their fate follows whether the epoch/manifest model
survives the re-spec. No suite test reads the real `audit/` directory (since deleted by the
human's authorisation).

**Stage 3 — code.** Configure `fallow` per D-006, add the staged list per
D-007, triage every unreachable unit with the human's known gated-off set
(episodic-log, memory-consolidation, autonomy-host) pre-listed as staged.
Delete the rest with their tests.

**Stage 4 — `project-health-audit`.** Runs unchanged in intent on the smaller
repo; its dead-code input is Stage 3's check. Update `ROADMAP.md:32-44` to
point the quality pause at this plan.

## Files to Change

Stage 1 (done): `domains/shared/skills/work-artifacts/references/*.md`,
`domains/shared/skills/{plan,task,work-artifacts,architecture,archive}/SKILL.md`,
`bundled/coding/prompts/{planner,plan-reviewer,task-manager,worker,reviewer,verifier,quality-manager,integration-verifier}.md`,
`bundled/coding/skills/{tdd,design-dialogue}/SKILL.md`,
`lib/artifacts/plan-conformance.ts` (from `behavior-conformance.ts`),
`tests/artifacts/plan-conformance.test.ts`, `cli/plans/`,
`docs/designs/spec-plan-quality-gates.md`.

Stage 2 (in progress): `tests/**` (deletions and the sort),
`tests/skills/shipped-frontmatter.test.ts` (new),
`missions/plans/framework-health/stage2-probes.md`,
`missions/plans/test-health-audit/spec.md`, `scripts/test-health-audit/`,
`tests/scripts/test-health-audit/`, `ROADMAP.md`.

Stage 3: `fallow.toml` (roots and annotated staged entries), one check script
for staged-entry owners, and the modules and tests the reachability run
removes — enumerated in the Stage 3 commit, not here.

## Risks

- Stage 1 removes a gate three suite-gated analysis plans rely on. They are
  archived; per INV-004 that is the intended outcome, but the suite will need
  the `:1400` test removed in the same commit.
- Deleting ~700 assertions drops the coverage number; `test:coverage` already
  fails its 85% branch threshold with a green suite. Prompt tests cover no
  branches, so the effect should be nil — verify, do not assume.
- In-flight `execution-liveness` (21 behaviors, 9 open tasks) was written in
  the old format, down to pre-created empty tests. It is migrated in steps
  under D-014; its behavior text is not restated until the D-009 trial reports.
- `tests/fixtures/knowledge-seed-inventory.json` lists paths this plan
  deletes and has five readers: `scripts/knowledge-surface-backfill.ts`,
  `tests/domains/coding-agents.test.ts`, `tests/memory/interface.test.ts`,
  `tests/episodic/pre-w3-disabled-baselines.test.ts`,
  `tests/scripts/knowledge-surface-backfill.test.ts`. Check each before the
  first deletion lands. Treat
  per the recorded two-step edit procedure; if a fixture pins live state, that
  fixture is the defect.
- Known suite flakes (three) will look like regressions. Capture exit codes
  and re-run in isolation before believing a failure.

## Implementation Order

1. Stage 1 prose (skills, prompts) — one commit per concept.
2. Stage 1 code (`lib/artifacts`, CLI, tests).
3. Constraint re-audit packet → human.
4. D-009 format trial on one `execution-liveness` behavior.
5. Stage 2 marker strip; then `tests/prompts` sort; then probes.
6. Audit re-spec; ROADMAP update.
7. Stage 3 reachability, staged list, deletions.
8. Independent review (codex, read-only) after each stage; re-review after
   every remediation round. No push or merge without the human.

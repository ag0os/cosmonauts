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
  the test stays green. (human ruling, recorded in TASK-701)
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
  - Decided by: planner-proposed
- **D-007 - One staged-code list, not a marker scheme**
  - Decision: a single tracked file lists deliberately unwired modules, each
    with the active plan or roadmap item that will wire it. The reachability
    check reads it. An entry whose owner is archived or absent is an orphan.
  - Why: INV-006 with the least mechanism INV-007 allows.
  - Decided by: planner-proposed
- **D-008 - Mutation probes are sampled and mechanical**
  - Decision: for a sample stratified by directory, mutate the production
    unit a test claims to cover and record whether the test goes red. Restore
    from `cp` backups, never `git checkout`. Results are recorded as
    killed/survived, nothing else. No per-test agent essay.
  - Why: INV-005.
  - Decided by: planner-proposed
- **D-009 - The new format gets one real trial before Stage 3**
  - Decision: after Stage 1, take one small open behavior from
    `execution-liveness`, restate it in the new shape, have a worker implement
    it under the new policy, and run D-008 probes on the tests it wrote. If
    the probes survive, the format claim is unproven and Stage 1 is revisited
    before anything is deleted in Stage 3.
  - Why: INV-005 applied to this plan. "This format yields tests that can
    fail" is otherwise a judgment that cannot fail.
  - Decided by: planner-proposed (raised in peer review)
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
  - Decided by: human, 2026-09-20
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
    remainder.
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
  - Decided by: worker-amended, 2026-09-20 (derived) — relaxes an existing
    guard, so flagged to the human rather than assumed

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
- Outcome: a plan in the new shape passes; a plan citing an undeclared `D-###`, or superseding without a date, fails with that issue and a non-zero exit; nothing about tests or markers is checked

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

**Stage 2 — tests**

### B-005 - No test points at a plan

- Source: INV-004
- Observer: a maintainer searching `tests/` for `@cosmo-behavior`
- Entry point: the repository
- Outcome: nothing is found, and the per-test pass/fail list is identical before and after the strip

### B-006 - Rewording prose does not break the suite

- Source: INV-003
- Observer: a maintainer rewording a persona or skill body without touching machine-parsed structure
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
- Entry point: the project's dead-code gate
- Outcome: every `lib/` module is reachable from a shipped entry point or listed as staged with a live owner; anything else fails, including an entry whose owner is archived

### B-010 - The known orphans are resolved

- Source: INV-006
- Observer: a maintainer reading `lib/driver` and `lib/orchestration`
- Entry point: the repository
- Outcome: `run-run-loop`, the `runOneTask` function, and `spawn-compiler` are each wired, staged with an owner, or gone along with their tests

## Design

**Stage 1 — format (deletion).** Rewrite `behavior-spine.md` and the Behaviors
section of `plan-format.md`; fix `examples.md`, `gate-contracts.md`, and the
one-to-three-line mentions in `plan`/`task`/`tdd` skills and the planner,
plan-reviewer, task-manager, worker, reviewer, verifier, quality-manager
prompts and `architectural-design.md` (17 shipped files, 36 mentions). Reduce
`lib/artifacts/behavior-conformance.ts` (1,103 lines) to the two Decision Log
checks; shrink `tests/artifacts/behavior-conformance.test.ts` (1,545 lines) to
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
survives the re-spec. No suite test reads the real `audit/` directory. its `audit/` directory (1.4 GB, untracked) is the
human's to delete.

**Stage 3 — code.** Configure `fallow` per D-006, add the staged list per
D-007, triage every unreachable unit with the human's known gated-off set
(episodic-log, memory-consolidation, autonomy-host) pre-listed as staged.
Delete the rest with their tests.

**Stage 4 — `project-health-audit`.** Runs unchanged in intent on the smaller
repo; its dead-code input is Stage 3's check. Update `ROADMAP.md:32-44` to
point the quality pause at this plan.

## Risks

- Stage 1 removes a gate three suite-gated analysis plans rely on. They are
  archived; per INV-004 that is the intended outcome, but the suite will need
  the `:1400` test removed in the same commit.
- Deleting ~700 assertions drops the coverage number; `test:coverage` already
  fails its 85% branch threshold with a green suite. Prompt tests cover no
  branches, so the effect should be nil — verify, do not assume.
- In-flight plans (`execution-liveness`, 21 markers, 9 open tasks) are written
  in the old format. Do not migrate them; strip their markers with the rest
  and let their remaining tasks run under the new worker policy.
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
2. Stage 1 code (`lib/artifacts`, CLI, tests). Gates: test, lint, typecheck.
3. Constraint re-audit packet → human.
4. D-009 format trial on one `execution-liveness` behavior.
5. Stage 2 marker strip; then `tests/prompts` sort; then probes.
6. Audit re-spec; ROADMAP update.
7. Stage 3 reachability, staged list, deletions.
8. Independent review (codex, read-only) after each stage; re-review after
   every remediation round. No push or merge without the human.

## Purpose

The Quality Manager (QM) finds real defects, and its remediation keeps
destroying work. Across four recorded runs it has:

- rewritten other plans' review records;
- reverted a session's uncommitted edits;
- let a stale report from another plan stand in for a missing one;
- introduced a correctness regression that its own later rounds approved;
- added about twenty suppression comments to clear analysis gates;
- left a report that could be recovered only 200 characters at a time.

Prompt instructions did not prevent any of it. On 2026-09-23 its run on
`framework-health` Stage 3 produced six real findings from its review panel
and five remediation commits. Of those commits, one regressed cancellation,
one added a test that could not fail, and one was reverted outright.
Evidence: `missions/reviews/qm/framework-health-incidents.md` and
`.shepherd/work/todo/qm-chain-safety/investigation.md`.

This plan keeps the review and removes the damage. It makes that true by
construction, not by instruction:

- the QM reviews and reports, and nothing it starts can change what it reviews;
- each run's records are its own and are always complete;
- the gates it applies judge only what the change introduced, and cannot be
  cleared by silencing them.

Remediation moves to the normal path: tasks, then Drive, then independent
review. That path caught every defect the QM introduced on 2026-09-23.

## Intent

Goal: a Quality Manager run can only produce findings. It cannot damage the
work it reviews, it cannot mistake another run's record for its own, and its
gates cannot be passed by hiding a finding.

Invariants — mechanism yields to these:

- INV-001 - Review does not mutate. A QM run, and every agent it starts,
  cannot change the reviewed checkout. That covers tracked and untracked
  files, uncommitted edits, the index, refs and HEAD. This holds by
  construction (isolation and authority limits), never by instruction. If the
  isolation cannot be established, the run is refused; it never falls back to
  the shared checkout.
- INV-002 - Records belong to their run. Every report a QM run relies on was
  created by that run, in a location no other run writes to. A missing report
  is a failure, never a stand-in from an earlier run. No run modifies or
  deletes a record it did not create.
- INV-003 - The verdict outlives the conversation. The complete final report
  (verdict, findings, items needing a human, gate results) is persisted
  outside the conversation on every exit, including failure and refusal.
- INV-004 - Authority lists bind every path. An agent can start only the
  agents its definition allows, whichever orchestration tool it uses.
- INV-005 - Gates judge the change and cannot be silenced. A changed-scope
  analysis gate fails only on findings that the change introduced relative to
  the committed baseline. Findings already present in touched files never fail
  it. A newly added suppression directive fails the quality gate unless a
  human has listed it in the project's exception registry.

Ranking. INV-001 wins over availability. If a review cannot run isolated, it
does not run, and the refusal is reported under INV-003. INV-002 wins over
continuity with existing file locations. INV-005's baseline never absorbs a
new finding silently: re-saving a baseline is an explicit, recorded act,
never a side effect of a review.

Interpretation of INV-001 (human ruling 2026-09-23, plan H-004 option A). A
"QM run" starts at the QM launch boundary. The framework bootstrap that every
Cosmonauts command performs (loading the project's domain, agent and chain
modules) is outside it. The snapshot is taken before any QM or panel session
exists.

Interpretation of INV-001, host-run checks (human ruling 2026-09-24, relayed
by Shepherd, N-004 option A; plan D-028). INV-001's by-construction guarantee
covers the QM, every agent it starts, and the host code. The host-run project
checks and dependency preparation execute the reviewed change's own code
(tests, install and lifecycle scripts) with the operator's own authority. That
is the same trust as the operator running those commands, and it is not
sandboxed. The QM report states this explicitly.

Threat model (human ruling 2026-09-24, relayed by Shepherd; plan D-027). The
QM protects the operator's work against accidental damage by careless agents
and accidental process behavior. It does not protect against a deliberately
hostile reviewed change. A way in which a malicious change could tamper with
the host, the review materials, the private workspace or Git objects to
subvert its own review is recorded as a known residual limit and is not
remediated, unless the same outcome can also happen by accident.

Provenance. The eight decisions behind these invariants were accepted by the
human on 2026-09-23 and relayed by Shepherd (`investigation.md` §5, decisions
1-8). The invariant wording was drafted by the coordinator and ratified by
the human exactly as drafted on 2026-09-23 (human, relayed by Shepherd).
INV-001..INV-005 are ratified ground and change only by human decision. The
human also acknowledged two consequences of decision 1. First, the named chains
ending in the QM end at a findings report. Second, `execution-liveness` lands
after this plan. Decisions 6 and 7 stay as AC-013 and AC-014, by human
direction. *(Amended by the human 2026-09-24, plan D-036: decision 7 is
withdrawn. AC-014 now only records which models reviewed; model choice is free
and never affects the verdict.)*

## Users

- **Coordinators and operators** who run the QM on a plan or branch, whether
  from Claude Code, Codex or a Pi lead, and need its findings without
  freezing or risking their checkout.
- **Lead agents** (`cosmo`, `cody`) and **named chains** that end in the QM.
- **Plan owners** who need a plan's review history to stay intact and
  attributable.
- **Implementers** whose gate results should reflect their change, not debt
  that was already in the files they touched.

## User Experience

**Running a review.**

- An operator starts the QM from a plan or branch as today.
- The QM works in an isolated checkout of the reviewed state. That state
  includes uncommitted changes when the review covers them. The operator's
  checkout is untouched and usable for the whole run: no freeze and no need
  to commit first.
- If isolation cannot be set up, the run is refused with a message that names
  the reason.

**What the QM does.** It makes one assessment pass:

- project checks;
- gate resolution;
- panel triage and the reviewer panel;
- a final report.

It starts no fixer, coordinator or worker, creates no tasks, commits nothing
and deletes nothing.

**What comes back.** The report states:

- the verdict;
- the checks and gates, with evidence;
- each finding, with id, priority, severity, `file:line`, a concrete failing
  input where there is one, and a suggested fix;
- items needing a human decision, listed separately;
- the findings that are out of range or pre-existing, marked as such;
- what was checked, as a positive statement.

The caller then triages and routes remediation to tasks. A named chain that
ends in the QM therefore ends at a findings report, not at a remediated tree;
remediation is a separate, explicit invocation.

**Where records live.**

- Each run's reviewer reports and full final report live in a location unique
  to that run, and `run status` points at them.
- When a plan is active, a tracked, plan-scoped summary of each run is written
  under that plan's directory on every exit.
- The shared `missions/reviews/*-round-N.md` files stop being written. The
  eleven existing ones move to an archive location with their history intact.

**Gates.**

- The changed-scope analysis gate compares against the committed baselines.
  Touching a file that already carries debt does not fail it; adding debt
  does.
- Adding a suppression directive fails the quality gate unless it appears in
  the project's exception registry, and only a human adds entries there.
- The exception documentation and the roadmap agree about the current debt
  and baseline state.

**Reviewers.**

- A performance finding is rated P1 only with a measured or reproduced cost;
  otherwise it is at most P2.
- A finding is never closed by the lens that raised it alone.
- The report records which models reviewed. Any model Pi can reach may be set
  freely for the QM and every reviewer; model choice never affects the
  verdict. *(Amended by the human 2026-09-24, plan D-036: model-family diversity is removed from the product; the previous text is in git history.)*

## Acceptance Criteria

- [ ] AC-001 - An agent that uses any orchestration tool to start an agent
  its definition does not allow is refused, with a message naming the caller
  and the target. Lead agents whose definitions list the target, and
  top-level CLI invocations, behave as before.
- [ ] AC-002 - A QM invocation cannot start `fixer`, `coordinator` or
  `worker`, directly or through any orchestration tool.
- [ ] AC-003 - After a QM run on a checkout with uncommitted edits and
  untracked files, that checkout's HEAD, refs, index, tracked files,
  uncommitted edits and untracked files are byte-identical to before the run,
  whatever the QM's agents did in their own workspace. The one exception is
  the host-written new file `missions/plans/<slug>/qm-runs/<runId>.md` (the
  AC-007 plan summary): it never overwrites an existing file and no agent
  receives its path. *(Amended by the human 2026-09-23, plan H-001 option A;
  the previous text had no exception.)*
- [ ] AC-004 - A QM review that covers uncommitted changes sees them. If an
  isolated workspace cannot be created, the run is refused with a named
  reason, and a report of the refusal is persisted.
- [ ] AC-005 - Two QM runs, for the same plan or for different plans, never
  write, modify or delete each other's reports. No QM run writes
  `missions/reviews/*-round-N.md`.
- [ ] AC-006 - A reviewer stage that ends without producing its report, or
  whose report was not created by this run, fails. The QM never reads such a
  file as the review result.
- [ ] AC-007 - On every QM exit (sign-off, not ready, failure, refusal):
  - the complete final report is persisted and reachable from the run record
    and `run status`;
  - when a plan is active, a tracked, plan-scoped summary is written under the
    plan's directory;
  - the 200-character stage summary is unchanged.
- [ ] AC-008 - The QM report carries:
  - the verdict;
  - checks and gate results with evidence;
  - every finding with id, priority, severity, `file:line` and suggested fix;
  - items needing a human decision, in their own section;
  - out-of-range or pre-existing findings, marked as such;
  - a positive statement of what was checked.
- [ ] AC-009 - A QM run makes one assessment pass. It creates no tasks,
  makes no commits and changes no plan status.
- [ ] AC-010 - The changed-scope analysis gate passes a change that only
  touches files carrying findings already in the committed baselines, and
  fails a change that introduces a new finding. Re-saving a baseline is an
  explicit act, recorded with its reason.
- [ ] AC-011 - A change that adds a suppression directive (`fallow-ignore`,
  `biome-ignore`, `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, or an
  equivalent) fails the quality gate unless that directive is listed in the
  project's exception registry. Existing directives are unaffected.
- [ ] AC-012 - `docs/fallow-exceptions.md` and the roadmap's
  `analysis-debt-paydown` item describe the same current baseline and debt
  state.
- [ ] AC-013 - Performance-lens guidance rates a finding P1 only when it
  carries a measured or reproduced cost. Reviewer guidance does not let the
  lens that raised a finding be the only judge that closes it.
- [ ] AC-014 - The report records which models reviewed. The QM and its
  reviewers may use any model Pi can reach, set freely; there is no
  model-family check, no model-related human-decision or not-configured item,
  and the verdict never depends on which models are used. *(Amended by the human 2026-09-24, plan D-036: model-family diversity is removed from the product; the previous text is in git history.)*
- [ ] AC-015 - The eleven legacy `missions/reviews/*-round-N.md` files are in
  an archive location with their git history reachable, and no live surface
  links to their old paths: prompts, skills, docs, code, tests other than
  frozen fixtures, active plans and `ROADMAP.md`. Frozen fixtures, curated
  `knowledge/` records, evidence reports and archived plans keep their
  historical text, and an archive README maps each old path to its new home.
  *(Amended by the human 2026-09-23, plan H-005 option A; the previous text
  read "nothing links to their old paths".)*
- [ ] AC-016 - These keep working: the QM's project checks, direct gate
  resolution, panel triage and specialist lenses; the named chains that end in
  the QM; and the callers that document the QM (lead prompts, spawning and
  dispatch skills, `docs/orchestration.md`, the external `implement-plan`
  command). The callers describe the review-only contract and route
  remediation to tasks. In a project without the `qualityReview` config for
  checks, the report shows a visible "not configured" item and a
  human-decision item naming the missing key, and the verdict cannot be
  `ready`. Nothing is skipped silently and nothing is refused. *(Amended by
  the human 2026-09-23, plan H-003 option A.)* *(Amended by the human
  2026-09-24, plan D-036: the reviewer model is no longer a required key; an
  unset reviewer model means the shipped models are used, with no item.)*

## Scope

Included:

- enforcing the authority list across orchestration tools;
- the QM's agent definition, prompt and panel;
- isolated execution for QM runs;
- run-unique report locations and failure on a missing report;
- persisting the full final report and the plan-scoped summary;
- baseline-aware changed-scope gating and a gate against new suppressions;
- reviewer severity and closure guidance;
- recording which models reviewed (model choice is free; D-036, 2026-09-24);
- relocating the legacy review files;
- updating documentation and callers for the review-only contract.

Excluded (named non-goals, deferred):

- **Mechanical triage of findings** (annotating in-diff, touches ratified
  ground, matches a prior disposition) and a machine-readable dispositions
  file. Triage is the caller's job in this slice. A mechanical out-of-range
  *filter* is rejected outright: it would drop real findings in unchanged
  sibling paths.
- **Replaying earlier findings as a remediation gate.** It would not have
  caught the 2026-09-23 regression, because no test covered the window.
  Remediation now goes through normal independent review.
- **OS-level sandboxing or a `tool_call` write guard for reviewers.** Isolation
  covers INV-001. These remain possible defence in depth later.
- **Enforced sequencing with codex, or a bounded memory footprint.** Running
  the QM and codex one after the other stays an operational rule. Evidence:
  ROADMAP item `qm-chain-safety` (removed when this plan was created; in git
  at `29fc0ce`) and the 2026-09-18 `test-health-audit` run.
- **Aborting timed-out spawned children.** Ratified `execution-liveness`
  AC-015 says giving up a wait must not cancel the child. Isolation makes
  orphaned writers harmless to the operator's checkout.
- **Changes to the 200-character summary contract** (`execution-liveness`
  AC-018) and the general persisted-evidence contract (`execution-liveness`
  AC-016). This slice persists the QM's final report and does not generalize
  that to every attempt.
- **Evaluating whether the specialist panel is worth its cost**
  (`factory-evals`).
- **A remediation workflow or agent that replaces the QM's old loop.**
  Remediation uses existing tasks, Drive and review.

## Assumptions

- Git worktrees are available wherever the QM runs. A snapshot of
  uncommitted state can be taken without touching the operator's checkout
  (for example as a commit object that is never checked out there).
- The committed `.fallow-baselines/` files are the gate's baseline of record.
  The pinned `fallow` supports per-analysis baselines on `audit`
  (`--dead-code-baseline`, `--health-baseline`, `--dupes-baseline`; precedent
  `TASK-676` AC #8).
- ~~A reviewer on a different model family is reachable through a provider Pi
  already supports.~~ *(Withdrawn 2026-09-24, plan D-036: there is no
  model-family requirement.)*
- `execution-liveness` (TASK-712..719, all To Do) has not started. This plan
  lands first, and that plan rebases onto it.

## Open Questions

- Does isolated execution live at the QM launch surface, or in the durable
  runtime's existing `WorktreeSpec.isolated` policy slot? The runtime slot is
  more general but overlaps `execution-liveness`'s launch and store seams, and
  that spec excludes worktrees from its own scope. The planner proposes; if
  the choice moves scope, it comes back to the human.
- ~~Which reviewer takes the different model family, and how is its model
  chosen without hard-coding a provider into a shipped definition?~~
  *(Closed 2026-09-24, plan D-036: no family requirement; an optional
  `qualityReview.reviewerModel` sets the generalist's model.)*
- Where does the full final report live: in the run's gitignored artifacts
  directory with a tracked plan summary, or in a tracked run directory under
  `missions/reviews/qm/<plan>/<runId>/`? Decision 2 chose run artifacts plus
  a plan-scoped summary. The planner confirms the exact paths.
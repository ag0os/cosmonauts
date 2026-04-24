---
title: TDD Orchestration Hardening
status: active
createdAt: '2026-04-24T00:00:00.000Z'
updatedAt: '2026-04-24T00:00:00.000Z'
---

## Summary

Close the gaps in the TDD workflow chain so that the specification layer (behaviors) is reviewed with the same rigor as the architecture layer, the coordinator fans out across tasks instead of running them serially, the RED phase is independently verified, and reviewer-driven remediation keeps the "every production line has a failing test that demanded it" invariant. Insertion-based changes to the existing chain — not a parallel TDD-only agent lineage.

## Scope

**Included**

- New `behavior-reviewer` agent that adversarially reviews the `Behaviors` section produced by `tdd-planner`, written to `missions/plans/<slug>/behavior-review.md`
- New `tdd-fixer` agent that fixes reviewer-driven code-modifying findings via RED-GREEN instead of straight-to-patch
- Update `tdd-planner.md` to require generalization-forcing test cases (≥2 cases whose only common correct implementation is the intended behavior, with an explicit trivial-behavior exception) and to consume `behavior-review.md` on revision passes
- Update `tdd-planner.md` to gate the enrichment-mode branch on "plan already has a Behaviors section" instead of always running `task_list`
- Rewrite `tdd-coordinator.md` to pipelined parallelism: fan out across ready tasks non-blockingly, keep RED→GREEN→REFACTOR serial within a task, process completions turn-by-turn like `coordinator` does today
- Insert a RED-verification step in `tdd-coordinator`: after `test-writer` returns, spawn `verifier` with per-test claims to confirm each expected failing test actually fails on its assertion before spawning `implementer`
- Update `quality-manager.md` to route complex remediation through `tdd-fixer` when the active plan has a `Behaviors` section; keep `fixer` for non-TDD plans and simple reviewer findings
- Update workflow chains `tdd` and `spec-and-tdd` in both `bundled/coding/coding/workflows.ts` and `lib/config/defaults.ts` to include `behavior-reviewer` and a second `tdd-planner` revision pass
- Add `behavior-reviewer` and `tdd-fixer` entries to `DEFAULT_STAGE_PROMPTS` in `lib/orchestration/chain-runner.ts`
- Test coverage for new agent definitions, new chain stage prompts, and the workflow-parity contract between `workflows.ts` and `defaults.ts`

**Excluded**

- Forking generic agents (`planner`, `plan-reviewer`, `task-manager`, `integration-verifier`, `reviewer` panel) into TDD variants — the insertion model keeps shared logic shared
- Changing Pi's spawn model, session lifecycle, or `loop` stage semantics
- Changing non-TDD workflows (`plan-and-build`, `implement`, `verify`, `spec-and-build`, `adapt`)
- Merging `implementer` and `refactorer` into a single agent (evaluated, rejected — see D-003)
- Changing commit cadence within a TDD task (the three-commit-per-task pattern stays; revisit in a separate plan if history noise becomes a real pain)

**Assumptions**

- Pi's non-blocking `spawn_agent` returning `{ status: "accepted", spawnId }` and the `[spawn_completion] ...` follow-up turn model (used today by `coordinator`) remain available to `tdd-coordinator` when it adopts the same pattern.
- The existing `verifier` agent can take claims of the form "test `<name>` in `<file>` fails on its assertion when the test suite runs" and return structured pass/fail evidence. If it cannot, a minimal extension (not a new agent) is in scope.
- The `tdd` skill stays as a single skill loaded by both the planning side (`tdd-planner`) and the execution side (`test-writer`, `implementer`, `refactorer`, and new `tdd-fixer`). Forking the skill is not necessary for any gap we are closing.
- A plan document having a `## Behaviors` section is a sufficient signal that the plan was produced by a TDD workflow. `quality-manager` uses this signal for TDD-aware routing.

## Decision Log

- **D-001 — Insertion over fork**
  - Decision: Add `behavior-reviewer` and `tdd-fixer` as insertions into the shared chain; do not fork `planner`, `plan-reviewer`, `task-manager`, `integration-verifier`, or the reviewer panel.
  - Alternatives: Fully parallel TDD-only lineage for all 13 agents; selective fork of just `planner` and `quality-manager`.
  - Why: Only 2 of the 13 agents in the chain have genuinely TDD-specific behavior. Forking the rest creates duplicate prompts that drift over time and doubles the maintenance cost of any architectural-review improvement.
  - Decided by: user-directed

- **D-002 — Pipelined parallelism in `tdd-coordinator`**
  - Decision: Fan out across ready tasks non-blockingly; keep RED→GREEN→REFACTOR serial within a single task; track per-task phase via `implementationNotes` markers (`RED complete:` / `GREEN complete:` / `REFACTOR complete:`) as today.
  - Alternatives: Keep strict serial execution; fan out phases within a task as well.
  - Why: Phases within a task have a hard data dependency (implementer reads the failing tests). Tasks touching different files do not. Serial-across-tasks is the current perf bottleneck — spawns scale at 3N where N is task count. Pipelining keeps the discipline and recovers the parallelism.
  - Decided by: planner-proposed

- **D-003 — Keep three-phase separation**
  - Decision: `test-writer`, `implementer`, and `refactorer` remain three separate agents.
  - Alternatives: Merge `implementer` + `refactorer` into one agent that runs both steps in one session (saves ~33% orchestration overhead per task).
  - Why: The RED/GREEN separation is the most-violated TDD rule in practice ("I'll write the test while I figure out the implementation"), so the clean-context boundary between `test-writer` and `implementer` is load-bearing. The GREEN/REFACTOR boundary is weaker, but merging would require rewriting two prompts and revising the handoff contract (`GREEN complete:` → `REFACTOR complete:`). Out of scope for this plan; revisit if orchestration cost becomes a measured problem.
  - Decided by: planner-proposed

- **D-004 — `tdd-fixer` as a new agent, not a mode flag**
  - Decision: Add a dedicated `tdd-fixer` agent that runs a single RED-GREEN cycle for one reviewer finding.
  - Alternatives: Add a `--tdd` flag to `fixer`; route every finding through the full `tdd-coordinator` pipeline.
  - Why: `fixer` today is intentionally single-shot and self-contained. Modalizing it via flags bleeds TDD concerns into a general-purpose agent. Routing through the full coordinator is too heavy — most findings need one failing test and one fix, not a full task+plan linkage.
  - Decided by: planner-proposed

- **D-005 — Behaviors-section signal for TDD detection in `quality-manager`**
  - Decision: `quality-manager` detects TDD mode by checking whether the active plan (`activePlanSlug`) has a `## Behaviors` section in its `plan.md`.
  - Alternatives: Pass a `tddMode` flag through the chain config; route based on workflow name.
  - Why: Self-describing — the plan document is the source of truth. No plumbing through chain config, no coupling to workflow names. A human who runs `quality-manager` standalone against a TDD plan gets the right behavior automatically.
  - Decided by: planner-proposed

- **D-006 — RED verification via the existing `verifier` agent**
  - Decision: `tdd-coordinator` spawns `verifier` after `test-writer` returns, with one claim per entry in the `Test Targets` block. Verifier runs the suite and reports per-test pass/fail with failure reason.
  - Alternatives: Give `tdd-coordinator` a `bash` tool and have it run tests itself; trust `test-writer`'s self-report as today.
  - Why: Trusting self-report is the weakest link in the current chain. Giving `tdd-coordinator` code-execution tools breaks its current "orchestrate-only" capability profile (`tools: "none"`). `verifier` already exists and already returns structured pass/fail with evidence — it is the right seam.
  - Decided by: planner-proposed

## Design

### Module structure

All additions live in the existing domain package — `bundled/coding/coding/` — plus default-prompt and workflow-config plumbing in `lib/`.

New agents (definition + prompt pair each):

- `bundled/coding/coding/agents/behavior-reviewer.ts` — adversarial reviewer for the `Behaviors` section and its mapping to plan contracts
- `bundled/coding/coding/prompts/behavior-reviewer.md`
- `bundled/coding/coding/agents/tdd-fixer.ts` — single-finding RED-GREEN fixer for reviewer-driven remediation
- `bundled/coding/coding/prompts/tdd-fixer.md`

Modified agents (one or both of `.ts` and `.md`):

- `bundled/coding/coding/prompts/tdd-planner.md` — generalization-forcing cases rule; enrichment-mode gating; `behavior-review.md` consumption
- `bundled/coding/coding/agents/tdd-coordinator.ts` — add `verifier` to `subagents`
- `bundled/coding/coding/prompts/tdd-coordinator.md` — pipelined parallelism; RED-verification step
- `bundled/coding/coding/agents/quality-manager.ts` — add `tdd-fixer` to `subagents`
- `bundled/coding/coding/prompts/quality-manager.md` — TDD-aware remediation routing

Modified orchestration/config files:

- `bundled/coding/coding/workflows.ts` — `tdd` and `spec-and-tdd` chains
- `lib/config/defaults.ts` — same chains, kept in parity with `workflows.ts`
- `lib/orchestration/chain-runner.ts` — add `behavior-reviewer` and `tdd-fixer` to `DEFAULT_STAGE_PROMPTS`

### Updated chains

```
tdd:
  planner
    -> plan-reviewer
    -> planner
    -> tdd-planner
    -> behavior-reviewer
    -> tdd-planner
    -> task-manager
    -> tdd-coordinator
    -> integration-verifier
    -> quality-manager

spec-and-tdd:
  spec-writer
    -> planner
    -> plan-reviewer
    -> planner
    -> tdd-planner
    -> behavior-reviewer
    -> tdd-planner
    -> task-manager
    -> tdd-coordinator
    -> integration-verifier
    -> quality-manager
```

### Key contracts

**`behavior-reviewer` output contract** — mirrors `plan-reviewer`'s structured findings but scoped to behavioral content:

```markdown
# Behavior Review: <plan-slug>

## Findings

- id: BR-001
  dimension: <testability|coverage|generalization|failure-coverage|boundary-fit|implementability>
  severity: <high|medium|low>
  title: "<short title>"
  plan_refs: <comma-separated plan.md section/behavior references>
  description: |
    <one to three paragraphs of specific, evidence-backed critique>

## Missing Coverage

<bullet list of plan contracts or requirements with no corresponding behavior>

## Assessment

<1-3 sentences. Viable with revisions, or needs rethinking? Single most important fix.>
```

Written to `missions/plans/<slug>/behavior-review.md`. `tdd-planner`'s second invocation reads this file in revision mode (parallel to how `planner` reads `review.md` today).

**`tdd-coordinator` pipelined-parallelism state machine** — per-task status transitions driven by `implementationNotes` markers:

```
To Do (no markers)
  -> spawn test-writer
  -> [spawn_completion] -> spawn verifier (RED verification)
  -> verifier reports all targets failing on assertion
  -> spawn implementer
  -> [spawn_completion] -> check GREEN complete: block
  -> spawn refactorer
  -> [spawn_completion] -> task status Done (REFACTOR complete: block present)
```

Multiple tasks run through this state machine concurrently. File-conflict avoidance follows the same rule as `coordinator` (don't spawn two tasks touching the same source files).

**`quality-manager` TDD-aware routing** — in step 5 (Decide remediation path), after the existing finding-complexity triage:

```
if plan has ## Behaviors section:
  complex code-modifying remediation without activePlanSlug -> tdd-fixer
  simple code-modifying remediation -> tdd-fixer
  complex code-modifying remediation with activePlanSlug -> task_create (as today)
else (non-TDD plan or no plan):
  existing routing (fixer / task_create via coordinator)
```

`tdd-fixer` receives a single finding with `file:lineRange` and `summary`, reproduces the issue with a failing test, fixes it to green, and commits.

### Integration seams

- `lib/orchestration/chain-runner.ts:52-79` — `DEFAULT_STAGE_PROMPTS` map. Two new entries: `behavior-reviewer` (one-sentence operational prompt: "Review the active plan's behavioral specifications and write structured findings.") and `tdd-fixer` ("Reproduce the finding with a failing test, then fix it to green.").
- `lib/orchestration/chain-runner.ts:116-120` — the label-scope constraint for loop coordinators currently lists `["coordinator", "tdd-coordinator"]`. No change needed; `tdd-coordinator`'s loop nature is unchanged.
- `bundled/coding/coding/agents/tdd-coordinator.ts:11` — `subagents: ["test-writer", "implementer", "refactorer"]` becomes `subagents: ["test-writer", "verifier", "implementer", "refactorer"]`.
- `bundled/coding/coding/agents/quality-manager.ts:16-27` — add `"tdd-fixer"` to the `subagents` array alongside `"fixer"`.
- `bundled/coding/coding/workflows.ts:26-31` and `:39-45` — chain strings updated. `lib/config/defaults.ts:35-51` must be updated in the same commit to preserve parity.

### Seams for change

- The `behavior-reviewer` dimension list (testability / coverage / generalization / failure-coverage / boundary-fit / implementability) is the stable interface other tools or future reviewers might consume. Keep it enumerable and avoid burying dimensions in prose.
- `tdd-coordinator`'s per-task state machine is expressed through `implementationNotes` markers, not a new data structure. Future phase additions (e.g., a mutation-testing phase) can slot in by adding a new marker line without schema changes.
- `quality-manager`'s TDD-mode detection via "plan has a Behaviors section" is a heuristic. If a future plan format changes, we swap this probe for a frontmatter flag in one place.

## Approach

- **Introduce `behavior-reviewer` first** — it is the highest-leverage change and unlocks the rest. Without it, everything downstream is still working from an unreviewed specification.
- **Land prompt-only changes before structural ones** — generalization-forcing test cases and enrichment-mode gating in `tdd-planner` are prompt diffs with no orchestration impact. These can ship independently and de-risk the parallelization work.
- **Parallelize `tdd-coordinator` by copying `coordinator`'s non-blocking pattern** — the target prompt is effectively `coordinator.md` with a per-task phase state machine overlaid. Reuse the same file-conflict-avoidance language and the same `[spawn_completion]` handling discipline.
- **Insert RED verification with the existing `verifier`** — no new capability, just a new seam. The verifier's claim-based report is already machine-readable; `tdd-coordinator` treats a failed verification the same as a failed phase (reset task to "To Do", preserve notes).
- **Add `tdd-fixer` alongside `fixer`, not instead of** — keeps the current `fixer` workflow untouched for non-TDD remediation and simple typo-level fixes.
- **Workflow parity test, not manual discipline** — the duplication between `workflows.ts` and `defaults.ts` is a foot-gun. A single test asserting equality between the two sources is cheaper than a review rule.

## Files to Change

New files:

- `bundled/coding/coding/agents/behavior-reviewer.ts` — new agent definition
- `bundled/coding/coding/prompts/behavior-reviewer.md` — new prompt
- `bundled/coding/coding/agents/tdd-fixer.ts` — new agent definition
- `bundled/coding/coding/prompts/tdd-fixer.md` — new prompt
- `tests/orchestration/workflows-parity.test.ts` — new test asserting workflow definitions in `bundled/coding/coding/workflows.ts` and `lib/config/defaults.ts` stay in sync

Modified files:

- `bundled/coding/coding/prompts/tdd-planner.md` — generalization-forcing rule, enrichment-mode gating, `behavior-review.md` consumption in revision pass
- `bundled/coding/coding/agents/tdd-coordinator.ts` — add `verifier` to `subagents`
- `bundled/coding/coding/prompts/tdd-coordinator.md` — rewrite outer loop for pipelined parallelism; insert RED verification step between `test-writer` and `implementer`; preserve all existing phase-handoff markers
- `bundled/coding/coding/agents/quality-manager.ts` — add `tdd-fixer` to `subagents`
- `bundled/coding/coding/prompts/quality-manager.md` — TDD-aware routing in step 5; new "Detect TDD mode" probe
- `bundled/coding/coding/workflows.ts` — `tdd` and `spec-and-tdd` chain strings
- `lib/config/defaults.ts` — same chains, kept in parity
- `lib/orchestration/chain-runner.ts` — two entries in `DEFAULT_STAGE_PROMPTS`
- `tests/bundled/coding/agent-definitions.test.ts` (or existing equivalent) — coverage for the two new agent definitions
- `tests/orchestration/chain-runner.test.ts` — coverage for the new `DEFAULT_STAGE_PROMPTS` entries

## Risks

- **Pipelined-parallelism correctness** — blast radius: `tdd-coordinator` is the execution engine for every TDD run. A state-machine bug that mis-routes a task's phase (e.g., spawning `implementer` twice, or skipping refactorer) silently corrupts output. Classification: **must fix**. Mitigation: explicit state-table in the rewritten prompt with one row per `(task_status, implementationNotes marker)` tuple; a test that simulates out-of-order `[spawn_completion]` arrivals.
- **Behavior-reviewer redundancy with plan-reviewer** — blast radius: two reviewers flagging the same issue wastes tokens and blurs which agent is responsible for what. Classification: **mitigated**. Mitigation: `behavior-reviewer.md` explicitly scopes to behavioral content (`Behaviors` section + its mapping to `Key Contracts` / `Quality Contract`) and forbids flagging architectural issues; any architectural concern spotted is routed as a note, not a finding.
- **Workflow duplication drift** — blast radius: `workflows.ts` and `defaults.ts` disagree, and which one wins depends on which code path loads first. Classification: **must fix**. Mitigation: new parity test.
- **`verifier` claim shape may not support the RED verification semantics** — blast radius: if `verifier` only supports "command exits 0" claims and not "test X fails with assertion error Y", the RED-verification step cannot be implemented as proposed. Classification: **must fix before landing**. Mitigation: the first implementation task validates `verifier`'s current claim model; if insufficient, scope expands to include a minimal `verifier` extension and the remaining tasks proceed from there.
- **Generalization-forcing rule over-generates on trivial behaviors** — blast radius: `tdd-planner` bloats plans with redundant test cases for genuinely-atomic behaviors ("throws on null input"). Classification: **mitigated**. Mitigation: the rule includes an explicit exception for behaviors whose entire surface is binary (throw vs. don't throw, true vs. false), with examples in the prompt.
- **TDD-aware remediation increases quality-manager wall time** — blast radius: long TDD runs end with even longer remediation loops (`tdd-fixer` is ~2× the work of `fixer` per finding). Classification: **accepted**. Reviewer findings on a clean-context review are typically few; the correctness gain is worth the time. If measured as a problem, we add a heuristic for very-simple findings to stay on `fixer`.

## Quality Contract

- id: QC-001
  category: architecture
  criterion: "The `tdd` and `spec-and-tdd` workflow chains include `behavior-reviewer` between the first `tdd-planner` and `task-manager`, followed by a second `tdd-planner` revision pass."
  verification: reviewer

- id: QC-002
  category: correctness
  criterion: "`bun run typecheck` exits 0 with the new agent definitions and modified subagent allowlists in place."
  verification: verifier
  command: "bun run typecheck"

- id: QC-003
  category: correctness
  criterion: "`bun run test` exits 0, including new coverage for `behavior-reviewer`, `tdd-fixer`, the updated `DEFAULT_STAGE_PROMPTS`, and the workflow-parity test."
  verification: verifier
  command: "bun run test"

- id: QC-004
  category: behavior
  criterion: "`tdd-coordinator.md` describes pipelined parallelism: task-level non-blocking fan-out with phase-level serial execution driven by `implementationNotes` markers, mirroring the pattern in `coordinator.md`. The outer loop no longer processes tasks strictly sequentially."
  verification: reviewer

- id: QC-005
  category: behavior
  criterion: "`tdd-planner.md` requires each behavior to include at least two test cases whose only common correct implementation is the intended behavior, with an explicit exception for trivial behaviors (binary outcomes). An example of a compliant behavior and a non-compliant behavior is included in the prompt."
  verification: reviewer

- id: QC-006
  category: integration
  criterion: "`quality-manager.md` detects TDD mode via presence of a `## Behaviors` section in the active plan and routes complex code-modifying remediation to `tdd-fixer` in that mode. Non-TDD remediation paths are unchanged."
  verification: reviewer

- id: QC-007
  category: behavior
  criterion: "`tdd-coordinator.md` requires a RED-verification step between `test-writer` completion and `implementer` spawn, via the `verifier` agent, with one claim per `Test Targets` entry. If any expected-failing test does not fail on its assertion, the task is reset to \"To Do\" with a failure note and does not proceed to GREEN."
  verification: reviewer

## Implementation Order

1. **Prompt-only prep in `tdd-planner`** — add the generalization-forcing test-case rule and gate the enrichment-mode branch on "plan already has a Behaviors section". No chain or agent-definition changes. Ships in isolation; improves TDD output quality immediately even before the reviewer lands.

2. **Introduce `behavior-reviewer` agent** — new `.ts` and `.md` pair, `DEFAULT_STAGE_PROMPTS` entry, agent-definition test coverage. Agent is usable standalone at this point but not yet in the default chain.

3. **Update `tdd-planner.md` revision-pass behavior** — consume `behavior-review.md` on the second invocation, parallel to how `planner` consumes `review.md`. Depends on step 2.

4. **Wire `behavior-reviewer` into `tdd` and `spec-and-tdd` chains** — update both `bundled/coding/coding/workflows.ts` and `lib/config/defaults.ts` in the same commit. Add the new parity test (`tests/orchestration/workflows-parity.test.ts`). Depends on steps 2 and 3.

5. **RED verification in `tdd-coordinator`** — add `verifier` to the agent's `subagents`, insert the verification step between `test-writer` and `implementer` in the prompt. Depends on verifying `verifier`'s claim model supports per-test assertion-failure claims (validate first; extend `verifier` if needed, then proceed).

6. **Pipelined parallelism in `tdd-coordinator`** — rewrite the outer loop for non-blocking task-level fan-out with phase-level serial execution. The single largest prompt change in the plan. Depends on step 5 (the state table includes the verification step).

7. **Introduce `tdd-fixer` agent** — new `.ts` and `.md` pair, `DEFAULT_STAGE_PROMPTS` entry, agent-definition test coverage.

8. **TDD-aware remediation in `quality-manager`** — add `tdd-fixer` to `subagents`; update `quality-manager.md` to detect TDD mode (Behaviors section probe) and route accordingly. Depends on step 7.

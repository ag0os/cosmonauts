# Plan Review: framework-health

## Prior Findings

- **review-1.md PR-001 — resolved.** B-005 now limits the search to test declarations/comments and explicitly excludes frozen fixtures (`plan.md:346-351`); the remaining `@cosmo-behavior` hits under `tests/` are in `tests/fixtures/knowledge-seed-inventory.json`.
- **review-1.md PR-002 — resolved.** INV-003 now carries the human-ratified provider/toolchain/language/framework absence exception (`plan.md:58-64`), and D-019 names the retained guards (`plan.md:278-286`).
- **review-1.md PR-003 — resolved.** D-020 preserves the 23 declared public API entries already rooted by `fallow.toml` (`plan.md:288-293`; `fallow.toml:1-27`).
- **review-1.md PR-004 — resolved.** D-020 makes staged modules additional Fallow `entry` roots and separates the direct combined project command from the consent-gated Quality Manager capability (`plan.md:288-293`). The still-missing concrete command registration is tracked under unresolved `review-2.md PR-008`, not reclassified here.
- **review-1.md PR-005 — resolved.** D-020 explicitly records that repository work cannot grant per-user analysis consent and makes B-009 depend on the direct project command instead (`plan.md:288-293,376-381`).
- **review-1.md PR-006 — resolved.** D-022 supplies an exit for all 22 tasks and the active audit plan (`plan.md:299-303`). The new inconsistency in that chosen transition is PR-004 below.
- **review-1.md PR-007 — resolved.** B-002 now promises checks only for structured `Supersedes:` pointers and supersession annotations (`plan.md:316-321`), matching `lib/artifacts/plan-conformance.ts:96-126,157-190`.
- **review-1.md PR-008 — unresolved.** D-021 adds a population and deterministic strata, but its minimum sample is impossible for existing one-file strata; see PR-002 below (`plan.md:294-298`).
- **review-1.md PR-009 — resolved.** B-011 now owns the Quality Manager runtime-gate behavior (`plan.md:337-342`), matching `bundled/coding/prompts/quality-manager.md:65-94`.
- **review-1.md PR-010 — resolved.** The plan now has `## Files to Change`, and it names the post-rename `plan-conformance.ts` paths (`plan.md:440-458`).
- **review-1.md PR-011 — resolved.** Implementation Order no longer declares a local test/lint/typecheck gate list (`plan.md:482-492`).
- **review-2.md PR-001 — unresolved, human-owned.** `plan_view("framework-health")` still reports zero linked tasks, so the shipped Quality Manager still treats the run as planless (`bundled/coding/prompts/quality-manager.md:43-50`). Per the review request, acceptability is left to the human and this is not re-raised as a round-3 finding.
- **review-2.md PR-002 — unresolved.** The durable source was corrected (`external-commands/implement-plan.md:26-50`), but the generated `/Users/cosmos/.claude/commands/implement-plan.md:29-48` still requires a Quality Contract and behavior markers. The two files are not byte-identical.
- **review-2.md PR-003 — resolved.** B-005 now permits tests deleted on the record during the same marker-removal change (`plan.md:346-351`), matching D-017.
- **review-2.md PR-004 — resolved.** B-006 now excludes rewordings that introduce the human-ratified provider/toolchain/language/framework vocabulary (`plan.md:353-358`).
- **review-2.md PR-005 — resolved.** B-002 is qualified to the two syntaxes the parser recognizes (`plan.md:316-321`; `lib/artifacts/plan-conformance.ts:96-190`).
- **review-2.md PR-006 — resolved.** D-021 includes tests importing from `scripts/`, so the retained audit-tool suites are in the population (`plan.md:294-296`).
- **review-2.md PR-007 — resolved.** D-021 moves mutation into a throwaway worktree of the committed tree (`plan.md:294-298`).
- **review-2.md PR-008 — unresolved.** D-020 says “one project command” will compose Fallow with owner validation, but neither names/registers that command nor adds `package.json` to Stage 3 ownership; the current scripts contain no reachability command (`plan.md:288-293,376-381,456-458`; `package.json:29-38`).
- **review-2.md PR-009 — unresolved.** D-020 through D-022 correctly amend D-006 through D-010, but D-012 and D-018 remain in-place `worker-amended` entries without preserved superseded text or `Supersedes:` pointers (`plan.md:172-184,261-277`), contrary to `deviation-protocol.md:71-84`.
- **review-2.md PR-010 — resolved.** The planned-work example now includes spec Intent, a plan Decision Log, and project-discovered checks rather than declared gates (`domains/shared/skills/work-artifacts/references/examples.md:38-105`).

## Findings

- id: PR-001
  dimension: interface-fidelity
  severity: high
  title: "Shipped external planning surfaces still generate and verify the deleted format"
  plan_refs: D-001, D-016, B-001, B-002, B-011, Files to Change — Stage 1 done
  code_refs: package.json:19-27, external-skills/cosmonauts/plans/SKILL.md:61-70, external-skills/cosmonauts/plans/SKILL.md:91-98, external-commands/spec-to-backlog.md:27-31, external-commands/spec-to-backlog.md:48-51, lib/artifacts/plan-conformance.ts:3-5, cli/plans/commands/check-artifacts.ts:20-24
  description: |
    `package.json` ships both `external-skills/` and `external-commands/`, but Stage 1's completed file list owns neither relevant asset. The external plans skill tells users that `check-artifacts` validates required behavior fields, test paths, and exact markers, while the actual checker exposes only `unresolved-decision-citation` and `undated-supersession`. The `spec-to-backlog` command separately requires a new plan to contain a Quality Contract and asks the task manager to trace ACs to it, despite D-016/B-011 removing plan-declared gates.

    These are active user entry points, not historical prose: one gives false assurance about what a command checked, and the other recreates the format this plan removes. Correct the durable shipped assets and include them in ownership; D-001 and D-016 are human-ratified ground and must not be weakened to accommodate the stale instructions.

- id: PR-002
  dimension: behavior-spec
  severity: medium
  title: "D-021's sample size cannot be drawn from existing small strata"
  plan_refs: D-021, B-008, Implementation Order step 5
  code_refs: tests/artifacts/plan-conformance.test.ts:1-2, tests/chains/named-chain-loader.test.ts:9-18, tests/init/prompt.test.ts:1-3
  description: |
    D-021 requires every first-level test-directory stratum to contribute the larger of three files and ten percent. The repository has strata with only one in-population file: `tests/artifacts/plan-conformance.test.ts`, `tests/chains/named-chain-loader.test.ts`, and `tests/init/prompt.test.ts` are the sole qualifying files in their respective strata. A three-file sample therefore cannot be produced.

    The selection rule remains unsatisfiable before any mutation is chosen, so Stage 2 cannot produce the record B-008 requires. Amend the derived rule to bound requested cardinality by stratum size and state whether the sampled unit is a file or each test declaration within it.

- id: PR-003
  dimension: lifecycle-invariant
  severity: medium
  title: "The Stage 2 record excludes unexplained red runs as environmental evidence"
  plan_refs: INV-005, B-006, Risks — known flakes
  code_refs: missions/plans/framework-health/stage2-probes.md:3-4, missions/plans/framework-health/stage2-probes.md:27-29, missions/plans/framework-health/plan.md:353-358, missions/plans/framework-health/plan.md:479-480
  description: |
    The probe record excludes “four environmental failures and the known flakes” from every count without naming the runs, exits, or isolation evidence. It also records that prose blanking made `tests/extensions/orchestration-driver-tool.test.ts` time out and says the failure “was not investigated.” The plan's own risk procedure requires capturing exit codes and rerunning suspected flakes in isolation before discounting them.

    This permits B-006 to appear supported after silently removing red outcomes from its evidence, contrary to ratified INV-005. The record must identify and disposition each excluded run with reproducible evidence, or retain it as an unresolved survivor; changing INV-005 is ratified ground and is not an available remediation.

- id: PR-004
  dimension: state-sync
  severity: medium
  title: "D-022's archive transition conflicts with the task records it says to retain"
  plan_refs: D-010 part (c), D-022, Files to Change — Stage 2
  code_refs: lib/tasks/task-types.ts:10-14, lib/plans/archive.ts:83-89, missions/tasks/TASK-706 - B1 checkpoint — require all seven automated baseline conditions.md:24-59, missions/tasks/TASK-707 - Stage-11 ratification packet — the audit's single human decision.md:24-33
  description: |
    D-022 chooses `Done` because the runtime has no superseded task status and archive rejects every non-Done task. The two current task records, however, have unchecked criteria and explicitly state “Not completed and will not be” and “Left Blocked, not Done.” Setting only their status to `Done` would leave persisted status, acceptance criteria, and implementation notes contradicting one another.

    Stage 2's Files to Change also omits both task files and the audit plan lifecycle edits, so paired workers have no explicit file owner for the transition. Specify the exact administrative supersession rewrite and own all affected files while preserving D-010's human-ratified decision that the tasks are superseded; do not make `Done` falsely read as completed implementation.

## Missing Coverage

- The combined Stage 3 reachability command still has no concrete command name, package-script registration, annotation grammar, or owner-resolution contract (`review-2.md PR-008`).
- The generated Claude command remains stale even though its packaged source was fixed (`review-2.md PR-002`).
- D-012/D-018 amendment history still lacks the preserved superseded ground required by the deviation protocol (`review-2.md PR-009`).
- Stage 3 deletion candidates could not be mechanically traced because dead-code and trace capabilities are unbound with `execution-not-consented`.

## Coverage Ledger

- dimension: interface-fidelity
  status: unchecked
  checked: The plan checker, CLI adapter, packaged external skills/commands, Quality Manager, Fallow adapter source, and package scripts were compared. A live Fallow probe was not run because the available invocation would load project-controlled configuration and analysis execution is not consented.
  findings: PR-001, review-2.md PR-008

- dimension: duplication
  status: unchecked
  checked: `analysis_status` reports duplication and trace unbound with `execution-not-consented`; no capability evidence was available for a project-wide duplicate-path check.
  findings: none

- dimension: state-sync
  status: checked
  checked: The active audit plan, all 22 linked task statuses, the two blocked task records, task status vocabulary, and archive preconditions were compared with D-022.
  findings: PR-004, review-2.md PR-001

- dimension: risk-blast-radius
  status: unchecked
  checked: Packaged guidance propagation, mutation safety/sampling, and the known orphan paths were inspected. Proposed Stage 3 deletions could not be mechanically traced because dead-code and trace capabilities are unbound with `execution-not-consented`.
  findings: PR-001, PR-003

- dimension: user-experience
  status: checked
  checked: The external plan skill, spec-to-backlog command, generated implement-plan command, check-artifacts CLI, and maintainer probe record were walked from their user-visible entry points.
  findings: PR-001, PR-003, review-2.md PR-002

- dimension: behavior-spec
  status: checked
  checked: All eleven behaviors were checked for observer, shipped entry point, observable outcome, exception handling, and consistency with D-020 through D-022 and the Stage 2 record.
  findings: PR-002, PR-003, review-2.md PR-008

- dimension: architecture-record
  status: checked
  checked: The plan declares no durable architecture record and does not depend on an Architecture Context section. No boundary-conformance claim was inferred from the unbound boundary capability.
  findings: none

- dimension: quality-contract
  status: checked
  checked: D-016/B-011 were compared with the canonical gate references, the current Quality Manager runtime procedure, the planned-work example, and packaged planning commands.
  findings: PR-001

- dimension: lifecycle-invariant
  status: checked
  checked: INV-001 through INV-007, the ratified INV-003 exception, probe exclusions, sampling cardinality, supersession history, and plan/task/archive exits were attacked against current artifacts.
  findings: PR-002, PR-003, PR-004, review-2.md PR-009

- dimension: constraint-ownership
  status: checked
  checked: D-001 through D-022 and every Files to Change entry were traced to shipped assets and lifecycle files; external assets and D-022 task/plan edits lack ownership.
  findings: PR-001, PR-004, review-2.md PR-008, review-2.md PR-009

- dimension: scope-size
  status: checked
  checked: The plan has eleven behaviors, within the twelve-behavior guidance, with explicit stage seams.
  findings: none

## Assessment

The plan remains viable but is not ready for Stage 3. First finish the format migration across every shipped external surface; otherwise users will keep generating the deleted contracts and receive false conformance results. Then make the Stage 2 sample executable and reconcile the audit-plan lifecycle before treating the test stage as complete.

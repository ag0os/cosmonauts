# Plan Review: framework-health

## Prior Findings

- **review-1.md PR-001 — resolved.** B-005 now limits the search to executable test declarations/comments and excludes frozen fixtures (`plan.md:362-367`); `rg '@cosmo-behavior' tests --glob '!tests/fixtures/**'` is empty at HEAD.
- **review-1.md PR-002 — resolved.** INV-003 carries the human-ratified provider/toolchain/language/framework absence exception (`plan.md:58-64`), and D-019 identifies the retained guards (`plan.md:278-286`).
- **review-1.md PR-003 — resolved.** D-020 preserves the 23 stable public deep-import entries (`plan.md:288-293`; `fallow.toml:1-27`), matching the live public-entry contract in `docs/fallow-exceptions.md:39-57`.
- **review-1.md PR-004 — resolved.** D-020 makes staged modules Fallow entries and D-024 names the combined project command; TASK-708 owns that composition (`plan.md:288-313`; `missions/tasks/TASK-708 - Stage 3 reachability command with declared roots and annotated staged entries.md:14-22`). The still-undefined annotation/owner contract is a distinct current finding, PR-005 below.
- **review-1.md PR-005 — resolved.** D-020 explicitly separates the repository-owned reachability command from the consent-gated Quality Manager capability (`plan.md:288-293`), and B-009 uses the direct command (`plan.md:392-397`).
- **review-1.md PR-006 — resolved.** D-025 now specifies terminal transitions for all 22 audit tasks and the old plan: the two unfinished tasks become `Cancelled`, the plan becomes `completed`, and it is archived (`plan.md:314-319`). The missing handoff owner for the last two transitions is a new implementation-ownership defect, PR-003 below.
- **review-1.md PR-007 — resolved.** B-002 now promises only the structured `Supersedes:` and supersession-annotation forms that the parser recognizes (`plan.md:332-337`; `lib/artifacts/plan-conformance.ts:96-190`).
- **review-1.md PR-008 — resolved.** D-021 defines a file population and deterministic per-directory strata; D-024 caps the requested sample at each stratum's size (`plan.md:294-313`).
- **review-1.md PR-009 — resolved.** B-011 explicitly owns runtime gate resolution by the Quality Manager (`plan.md:353-358`).
- **review-1.md PR-010 — resolved.** `## Files to Change` exists and names the post-rename conformance files plus staged ownership (`plan.md:456-477`).
- **review-1.md PR-011 — resolved.** Implementation Order no longer declares a local gate list (`plan.md:501-511`).
- **review-2.md PR-001 — resolved by human disposition.** D-023 records the human's acceptance of paired-session verification for Stages 1–2 and requires plan-linked Drive tasks for Stage 3; TASK-708 and TASK-709 now exist (`plan.md:305-308`; `missions/tasks/TASK-708 - Stage 3 reachability command with declared roots and annotated staged entries.md:1-22`; `missions/tasks/TASK-709 - Stage 3 triage every unreachable unit and delete the orphans with their tests.md:1-22`). Per the review request, this is not re-raised.
- **review-2.md PR-002 — unresolved.** The durable source is corrected (`external-commands/implement-plan.md:26-47`), but `/Users/cosmos/.claude/commands/implement-plan.md:29-48` still requires a Quality Contract and behavior markers; the generated copy has not been refreshed.
- **review-2.md PR-003 — resolved.** B-005 permits tests deleted on the record during the marker-removal change (`plan.md:362-367`), matching D-017.
- **review-2.md PR-004 — resolved.** B-006 excludes the human-ratified provider/toolchain/language/framework vocabulary (`plan.md:369-374`).
- **review-2.md PR-005 — resolved.** B-002 is narrowed to the parser's two structured supersession forms (`plan.md:332-337`).
- **review-2.md PR-006 — resolved.** D-021 includes test files importing from `scripts/` (`plan.md:294-298`).
- **review-2.md PR-007 — resolved.** D-021 requires a throwaway worktree and local `cp` restoration (`plan.md:294-298`).
- **review-2.md PR-008 — resolved.** D-024 names `check:reachability`, adds `package.json` to Stage 3, and TASK-708 requires one invocation that runs Fallow and owner validation (`plan.md:309-313,474-477`; `missions/tasks/TASK-708 - Stage 3 reachability command with declared roots and annotated staged entries.md:16-21`).
- **review-2.md PR-009 — unresolved.** D-020, D-021, D-024, and D-025 now preserve dated supersession pointers, but D-012 and D-018 still replace earlier sequencing/scope as standalone `worker-proposed` entries without naming the superseded ground (`plan.md:172-184,261-277`), and Stage 3 Design still directs workers to superseded D-006/D-007 (`plan.md:447-450`). This does not satisfy `deviation-protocol.md:71-84` merely by changing `worker-amended` to `worker-proposed`.
- **review-2.md PR-010 — resolved.** The planned-work example includes Intent and Decision Log and no longer declares plan-local gates (`domains/shared/skills/work-artifacts/references/examples.md:38-105`).
- **review-3.md PR-001 — resolved.** The shipped external plans skill now describes Decision-Log-only checking, `spec-to-backlog` no longer requires a Quality Contract, and both assets are in Stage 1 ownership (`external-skills/cosmonauts/plans/SKILL.md:61-70`; `external-commands/spec-to-backlog.md:27-55`; `plan.md:458-466`).
- **review-3.md PR-002 — resolved.** D-024 caps each sample at the stratum size (`plan.md:309-313`).
- **review-3.md PR-003 — resolved.** `stage2-probes.md` now names all excluded runs, their reproduction/isolation evidence, and the driver timeout's isolated rerun (`stage2-probes.md:3-18,41-45`).
- **review-3.md PR-004 — resolved.** D-025 supersedes the false `Done` transition with `Cancelled` while preserving unchecked criteria and notes (`plan.md:314-319`). The broader state-machine and ownership gaps introduced by that replacement are PR-001 through PR-003 below.

## Findings

- id: PR-001
  dimension: interface-fidelity
  severity: high
  title: "Cancelled is not owned across the task system's shipped interfaces"
  plan_refs: D-025, Files to Change — Stage 3, TASK-709 AC #3
  code_refs: domains/shared/extensions/tasks/index.ts:17-22, cli/tasks/commands/shared.ts:10-35, lib/artifact-viewer/loaders.ts:281-289, domains/shared/extensions/plans/index.ts:268-276, external-skills/cosmonauts/tasks/SKILL.md:12-19, external-skills/cosmonauts/tasks/SKILL.md:87-99
  description: |
    D-025 adds a global `Cancelled` task status, but Stage 3 owns only `lib/tasks/` and `lib/plans/archive.ts`. The shipped `task_edit` schema and CLI parser accept only the existing four statuses, the artifact viewer exhaustively constructs a `Record<TaskStatus, number>` with four keys, and the shipped task/plan guidance still says only `Done` tasks can be archived. Adding `Cancelled` to `TaskStatus` without these consumers fails typecheck at the viewer; avoiding that type change leaves the tool and CLI unable to set or filter the status required for TASK-706 and TASK-707.

    This is a public task-state addition, not an archive-local detail, yet no behavior or task AC defines what users and agents observe through `task_edit`, `cosmonauts task edit/list`, plan view, or `plan_archive`. Expand the contract and file ownership to every shipped status boundary before TASK-709 is executable. D-025 is worker-derived ground; changing its mechanism is amendable, but silently narrowing the status to hand-edited frontmatter would not deliver its stated decision.

- id: PR-002
  dimension: lifecycle-invariant
  severity: high
  title: "Cancelled is terminal in D-025 but runnable and eventually satisfied in the current state machine"
  plan_refs: D-025, Files to Change — Stage 3, TASK-709 AC #3
  code_refs: lib/driver/task-selection.ts:3-8, lib/tasks/task-manager.ts:565-575, lib/tasks/task-manager.ts:642-662, lib/orchestration/chain-runner.ts:112-144, lib/driver/run-run-loop.ts:217-230
  description: |
    D-025 calls `Cancelled` terminal and says no scheduler treats it as satisfied. The current default Drive selection is every status other than `Done`, so a literal status extension makes cancelled work runnable. Active cancelled dependencies would remain unsatisfied, but once the containing plan is archived `resolveDependencyStatuses()` converts every archived task ID to `Done` without reading its persisted status, so the same cancelled dependency suddenly becomes satisfied. A coordinator over a Done/Cancelled set also remains `pending`, and Drive never emits a completion candidate because both paths require every task to be `Done`.

    The plan must specify the full state semantics: cancelled tasks are not dispatchable; whether they block dependents before and after archival; and how coordinator completion and plan-completion observation handle a terminal-but-unsatisfied task. The affected scheduler/driver surfaces are outside Stage 3's file ownership, so TASK-709 can currently satisfy its narrow archive test while shipping a cancelled task that Drive executes or an archived cancellation that unblocks dependent work.

- id: PR-003
  dimension: state-sync
  severity: medium
  title: "D-025's old-plan completion and archive transition has no implementation owner"
  plan_refs: D-025, Files to Change — Stages 2 and 3, Implementation Order steps 6-7, TASK-709 description and AC #3
  code_refs: missions/plans/test-health-audit/plan.md:1-5, missions/tasks/TASK-706 - B1 checkpoint — require all seven automated baseline conditions.md:1-13, missions/tasks/TASK-707 - Stage-11 ratification packet — the audit's single human decision.md:1-13, missions/tasks/TASK-709 - Stage 3 triage every unreachable unit and delete the orphans with their tests.md:14-22
  description: |
    D-025 says that after TASK-706 and TASK-707 become `Cancelled`, `test-health-audit` is marked `completed` and archived. TASK-709 owns only the new status, archive acceptance, and the two task transitions; none of its ACs requires changing the old plan status or invoking archive. `## Files to Change` likewise omits the old plan and task records from Stage 3, while the old plan remains `active` and both tasks remain `Blocked` today.

    A worker can therefore complete every TASK-709 criterion while leaving the superseded audit visible and routable as an active plan. Give the completion/archive transition an explicit implementing owner and acceptance outcome. Reversing D-010's human-decided supersession would touch ratified ground; supplying the missing owner does not.

- id: PR-004
  dimension: behavior-spec
  severity: medium
  title: "B-010 is attached to the consent-gated dead-code capability instead of the combined reachability command"
  plan_refs: D-020, D-024, B-009, B-010, TASK-709 AC #1
  code_refs: domains/shared/extensions/project-tools/fallow-provider.ts:1984-2022, domains/shared/extensions/project-tools/fallow-provider.ts:2475-2515, missions/tasks/TASK-709 - Stage 3 triage every unreachable unit and delete the orphans with their tests.md:18-21
  description: |
    D-020 deliberately separates the direct `check:reachability` command from the Quality Manager's dead-code capability because repository code cannot grant analysis consent. B-009 uses that command, and TASK-709 AC #1 also uses it. B-010 instead names “the project's dead-code gate” as its entry point while requiring the archived-owner result that only the combined command supplies. The provider adapter invokes and normalizes Fallow only; it has no staged-owner validation path.

    Capability evidence from `analysis_status` on 2026-09-22 reports `dead-code` unbound with provider `fallow` and reason `execution-not-consented`. Thus B-010 is not reachable through its stated entry point even if TASK-709 passes against `check:reachability`. Align the behavior spine with the direct command; changing the consent boundary in D-020 would instead alter derived design and require an amendment.

- id: PR-005
  dimension: lifecycle-invariant
  severity: medium
  title: "The staged-owner model has neither a parseable contract nor live owners for the pre-listed set"
  plan_refs: INV-006, D-020, B-009, Design — Stage 3, TASK-708 AC #3, TASK-709 description
  code_refs: fallow.toml:1-27, ROADMAP.md:23-30, missions/archive/plans/episodic-log/plan.md:1-20, missions/archive/plans/living-memory/plan.md:68-76, missions/tasks/TASK-708 - Stage 3 reachability command with declared roots and annotated staged entries.md:14-22
  description: |
    D-020 puts stable public entries and staged entries into the same TOML string array and says staged entries are “annotated,” but defines no annotation grammar, no way to distinguish staged rows from public API rows, and no owner-resolution rule for an active plan versus a ROADMAP item. TASK-708 asks its worker to invent both the parser and synthetic fixtures. Independent review cannot tell whether a comment, adjacent table, or substring is authoritative, or what happens when a roadmap item becomes a plan.

    The Stage 3 design also pre-lists `episodic-log`, `memory-consolidation`, and `autonomy-host` as staged. Only `autonomy-host` is an active plan. `episodic-log` is archived, and the human-directed `memory-consolidation` slug was renamed to `living-memory`, which is also archived; ROADMAP's active-plan list names neither old slug. If those names are used as owners, B-009 must fail by design. Specify the machine-readable annotation shape and the actual live owner for each staged module, or do not classify it as staged. Allowing an archived/absent owner would collide with ratified INV-006.

- id: PR-006
  dimension: behavior-spec
  severity: medium
  title: "The third known orphan exists only in TASK-709's prose"
  plan_refs: Overview, B-010, TASK-709 description
  code_refs: missions/plans/framework-health/plan.md:25-34, missions/plans/framework-health/plan.md:399-404, missions/tasks/TASK-709 - Stage 3 triage every unreachable unit and delete the orphans with their tests.md:14-16
  description: |
    B-010 promises that “the three orphans measured in the Overview” are resolved. The Overview identifies two concrete orphan paths: `spawn-compiler.ts` and the type-only production reach to `run-run-loop.ts`; its next measurements are aggregate counts of test-only exports, not a third orphan. TASK-709 invents “the marker-era helpers” as item three without naming a symbol or module anywhere in the plan.

    The worker and reviewer therefore cannot agree on the finite set B-010 protects: any arbitrary helper can be called the third item after the fact. Reconcile the measured set in Design/task ownership while keeping source-path detail out of the behavior itself, as INV-001 requires.

## Missing Coverage

- The `Cancelled` status has no specified tool/CLI/view contract, dispatch rule, dependency rule after archival, coordinator terminal outcome, or plan-completion-candidate rule.
- No task AC owns marking `test-health-audit` completed and actually archiving it after its two cancellations.
- The staged-entry owner annotation has no syntax or deterministic active-plan/ROADMAP/archive resolution contract.
- B-010 does not use the command that can enforce staged-owner liveness, and its claimed three-item baseline is not enumerated in Design.
- The generated Claude command remains stale (`review-2.md PR-002`).
- D-012/D-018 and the Stage 3 Design still lack the preserved superseded-ground trail required by the deviation protocol (`review-2.md PR-009`).
- The broad D-021 mutation sample is still explicitly “Not yet probed” (`stage2-probes.md:57-60`); this is unfinished Stage 2 work, not current evidence for B-008.
- Stage 3 deletion candidates could not be mechanically traced because `dead-code` and `trace` are unbound with `execution-not-consented`.

## Coverage Ledger

- dimension: interface-fidelity
  status: unchecked
  checked: Internal task status, CLI/tool schemas, artifact viewer, archive tool, Fallow adapter, package script, and task handoff boundaries were checked. A live Fallow invocation was not run because it would load project-controlled `fallow.toml` and no approved config/plugin-isolated mechanism was available; external flags, exit codes, and envelopes remain unchecked.
  findings: PR-001, PR-004, PR-005

- dimension: duplication
  status: unchecked
  checked: `analysis_status` reports duplication and trace unbound with `execution-not-consented`; no capability evidence was available for a project-wide duplicate-path check.
  findings: none

- dimension: state-sync
  status: checked
  checked: Active, cancelled, archived, ready, Drive-selected, coordinator-complete, and plan-completion states were traced through the task manager, archive, driver, old audit plan, and Stage 3 task records.
  findings: PR-002, PR-003

- dimension: risk-blast-radius
  status: unchecked
  checked: The global task-status blast radius, staged-owner lifecycle, and known orphan handoff were inspected. The exact Stage 3 deletion set could not be traced mechanically because dead-code and trace capabilities are unbound with `execution-not-consented`.
  findings: PR-001, PR-002, PR-005, PR-006

- dimension: user-experience
  status: checked
  checked: `task_edit`, task CLI filtering, plan/task viewing, plan archive, external task guidance, generated implement-plan guidance, and the direct reachability behavior were walked from agent and maintainer entry points.
  findings: PR-001, PR-004, review-2.md PR-002

- dimension: behavior-spec
  status: checked
  checked: All eleven behaviors were checked for observer, shipped entry point, observable outcome, ratified exception handling, and consistency with D-020 through D-025 and the Stage 2 record.
  findings: PR-004, PR-006

- dimension: architecture-record
  status: checked
  checked: The plan declares no durable architecture record. Its public-entry claim was compared with `fallow.toml` and the live contract in `docs/fallow-exceptions.md`; no architecture-record mismatch was found.
  findings: none

- dimension: quality-contract
  status: checked
  checked: B-011 and D-016 were compared with the runtime-resolving Quality Manager contract, while B-009/B-010 were checked against the direct command versus consent-gated dead-code capability split.
  findings: PR-004

- dimension: lifecycle-invariant
  status: checked
  checked: INV-001 through INV-007, the human-ratified INV-003 exception, Cancelled transitions, archived dependency resolution, staged-owner expiry, amendment exits, and the old audit-plan exit were attacked against current artifacts.
  findings: PR-002, PR-003, PR-005, review-2.md PR-009

- dimension: constraint-ownership
  status: checked
  checked: D-020 through D-025, Stage 3 Files to Change, TASK-708/TASK-709 ACs, and the old plan/task mutations were traced to implementing owners.
  findings: PR-001, PR-003, PR-005, review-2.md PR-009

- dimension: scope-size
  status: checked
  checked: The plan has eleven behaviors, within the twelve-behavior guidance, and four explicit stage seams. TASK-709's unrelated status-system and deletion responsibilities were considered under interface and lifecycle ownership rather than behavior count.
  findings: PR-001, PR-002, PR-003

## Assessment

The plan remains viable, but Stage 3 is not ready to execute. Fix D-025's global state-machine contract first: as written, a cancelled task can be dispatched and can become a satisfied dependency after archival, while the shipped tools cannot set the status coherently. Then make the staged-owner and B-010 contracts concrete before authorizing deletion.

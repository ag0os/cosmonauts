# Plan Review: framework-health

## Prior Findings

- **review-1.md PR-001 — resolved.** B-005 now limits the assertion to executable test declarations/comments and excludes frozen fixtures (`plan.md:393-398`); `tests/` has no non-fixture `@cosmo-behavior` hit.
- **review-1.md PR-002 — resolved.** INV-003 carries the human-ratified provider/toolchain/language/framework absence exception (`plan.md:56-64`), and D-019 identifies the retained guards (`plan.md:280-288`).
- **review-1.md PR-003 — resolved.** D-020 preserves the existing 23 public entries, and D-029 makes that set an explicit machine-readable authority (`plan.md:290-295,341-345`; `fallow.toml:1-27`).
- **review-1.md PR-004 — resolved.** D-020/D-024 define the combined direct command, while D-027/D-029 define the staged/public registry consumed by its owner check (`plan.md:290-315,329-345`).
- **review-1.md PR-005 — resolved.** D-020 separates the repository-owned command from the consent-gated Quality Manager capability, and B-009 uses the direct command (`plan.md:290-295,423-428`).
- **review-1.md PR-006 — resolved.** D-025/D-026 and TASK-710 now define and own cancellation of the two unfinished tasks, completion of `test-health-audit`, and archival (`plan.md:316-328`; `TASK-710:16-22`).
- **review-1.md PR-007 — resolved.** B-002 is limited to the two structured supersession syntaxes the checker implements (`plan.md:363-368`; `lib/artifacts/plan-conformance.ts:96-190`).
- **review-1.md PR-008 — resolved.** D-021/D-024/D-030 define a population, deterministic file selection, a per-stratum cap, worktree isolation, and one declaration per selected file (`plan.md:296-315,346-350`). The remaining population/stratum defect is narrower and recorded as review-6 PR-004.
- **review-1.md PR-009 — resolved.** B-011 owns runtime gate resolution by the Quality Manager (`plan.md:384-389`).
- **review-1.md PR-010 — resolved.** `## Files to Change` exists and names the post-rename conformance files plus Stage 3 status/reachability ownership (`plan.md:494-523`).
- **review-1.md PR-011 — resolved.** Implementation Order no longer declares a plan-local gate list (`plan.md:548-558`).

- **review-2.md PR-001 — resolved by human disposition.** D-023 records paired-session verification for Stages 1-2 and plan-linked tasks for Stage 3 (`plan.md:305-310`). Per the review request, this is not re-raised.
- **review-2.md PR-002 — unresolved.** The durable source is corrected, but the generated command still instructs its user to inspect a Quality Contract and verify behavior markers (`/Users/cosmos/.claude/commands/implement-plan.md:30-31,48`; `external-commands/implement-plan.md:26-47`). See review-6 PR-006.
- **review-2.md PR-003 — resolved.** B-005 permits tests deleted on the record during the marker-removal change (`plan.md:393-398`).
- **review-2.md PR-004 — resolved.** B-006 excludes the human-ratified provider/toolchain/language/framework vocabulary (`plan.md:400-405`).
- **review-2.md PR-005 — resolved.** B-002 matches the parser's structured supersession grammar (`plan.md:363-368`).
- **review-2.md PR-006 — resolved.** D-021 includes files importing from `scripts/` (`plan.md:296-300`).
- **review-2.md PR-007 — resolved.** D-021 requires a throwaway worktree and local backup restoration (`plan.md:296-300`).
- **review-2.md PR-008 — resolved.** D-024 names `check:reachability`, and TASK-708 owns the composed invocation (`plan.md:311-315`; `TASK-708:16-22`).
- **review-2.md PR-009 — resolved.** D-012 and D-018 now carry explicit `Supersedes:` lines, and the affected Design text has dated in-place pointers to D-012/D-018 and D-020/D-024/D-027/D-029 (`plan.md:172-185,262-279,458-482`).
- **review-2.md PR-010 — resolved.** The canonical planned-work example includes Intent and Decision Log and does not declare plan-local gates (`domains/shared/skills/work-artifacts/references/examples.md:38-105`).

- **review-3.md PR-001 — resolved.** The shipped plans skill and `spec-to-backlog` command use the new format, and both durable assets are in Stage 1 ownership (`external-skills/cosmonauts/plans/SKILL.md:61-70`; `external-commands/spec-to-backlog.md:27-55`; `plan.md:496-504`).
- **review-3.md PR-002 — resolved.** D-024 caps each sample at its stratum size (`plan.md:311-315`).
- **review-3.md PR-003 — resolved.** `stage2-probes.md` identifies each excluded run and its reproduction or isolated-rerun evidence (`stage2-probes.md:3-18,41-45`).
- **review-3.md PR-004 — resolved.** D-025 replaces the false `Done` transition with `Cancelled` while preserving the unfinished task records (`plan.md:316-321`).

- **review-4.md PR-001 — unresolved.** D-026/D-028 and TASK-710 now cover the previously named type, parser, tool, CLI, viewer, archive, and graph-candidate boundaries, but actual shipped coordinator, Quality Manager, and Drive guidance still encode Done-only terminal rules and are absent from ownership. See review-6 PR-001.
- **review-4.md PR-002 — resolved.** D-026 defines non-dispatch, active/archived dependency behavior, archive acceptance, and coordinator termination (`plan.md:323-328`).
- **review-4.md PR-003 — resolved.** TASK-710 AC #3 owns cancelling TASK-706/TASK-707, completing `test-health-audit`, and archiving it (`TASK-710:19-22`; `plan.md:520-523`).
- **review-4.md PR-004 — resolved.** B-010 now uses the combined project reachability command (`plan.md:430-435`).
- **review-4.md PR-005 — resolved.** D-027 supplies parseable owner rows, D-029 supplies an independent public list, and the Stage 3 design/TASK-709 now pre-list only `autonomy-host` while treating `episodic-log` and `memory-consolidation` per D-027 (`plan.md:329-345,480-488`; `TASK-709:14-21`).
- **review-4.md PR-006 — resolved.** B-010 and TASK-709 identify the same two known orphans (`plan.md:430-435`; `TASK-709:14-21`).

- **review-5.md PR-001 — resolved.** D-028 and Stage 3 ownership now name the persisted parser, graph completion candidate, task capability, and fresh-process round-trip; TASK-710 AC #1 carries those outcomes (`plan.md:336-340,515-523`; `TASK-710:16-22`). The additional shipped prose consumers missed by that inventory are review-6 PR-001.
- **review-5.md PR-002 — unresolved.** D-029 fixes the circular public-entry authority, but TASK-708 AC #2 still protects everything a consumer can physically deep-import even though `package.json` publishes all of `lib/`; that is broader than D-029's selected 23-entry contract. See review-6 PR-003.
- **review-5.md PR-003 — resolved.** D-030 selects the median `it`/`test` declaration in each sampled file and aligns it with B-008's declaration-level disposition (`plan.md:346-350,414-419`).
- **review-5.md PR-004 — resolved.** The Stage 3 design and TASK-709 now carry D-027's owner rulings (`plan.md:480-488`; `TASK-709:14-21`).

## Findings

- id: PR-001
  dimension: interface-fidelity
  severity: high
  title: "Cancelled still has Done-only shipped consumers outside TASK-710's ownership"
  plan_refs: D-026, D-028, Files to Change — Stage 3, TASK-710 AC #1-#2
  code_refs: bundled/coding/prompts/coordinator.md:21, bundled/coding/prompts/coordinator.md:91, bundled/coding/prompts/quality-manager.md:261, domains/shared/skills/drive/SKILL.md:14, domains/shared/skills/drive/SKILL.md:93, domains/shared/capabilities/drive.md:18, external-skills/cosmonauts/SKILL.md:102, external-skills/cosmonauts/plans/SKILL.md:99
  description: |
    D-026 promises that every shipped status consumer understands `Cancelled`, that a coordinator over only `Done`/`Cancelled` tasks terminates, and that plan completion accepts that terminal set. D-028 delegates discovery to a production-code literal search, but the repository also ships prompt, skill, and capability contracts that still say all tasks must be `Done`. The coordinator exits immediately only for all-`Done` and later recognizes only all-`Done`/`Blocked`; the Quality Manager completes a plan only when all tasks are `Done`; Drive guidance describes the default as all non-Done tasks and its candidate as all Done.

    None of these files is in Stage 3 ownership, and TASK-710's ACs cover non-selection and graph-candidate behavior but not the promised all-terminal coordinator or Quality Manager outcomes. A worker can satisfy every AC while an all-cancelled coordinator has no defined exit and the Quality Manager refuses completion. Expand the consumer inventory and task-visible outcomes; D-026/D-028 are derived ground, so this does not require changing a ratified invariant.

- id: PR-002
  dimension: lifecycle-invariant
  severity: high
  title: "TASK-708 requires a clean reachability result before TASK-709 resolves the known orphans"
  plan_refs: Overview — known orphans, B-009, B-010, TASK-708 AC #1, TASK-709 dependency and AC #1
  code_refs: missions/tasks/TASK-708 - Stage 3 reachability command with declared roots and annotated staged entries.md:9-22, missions/tasks/TASK-709 - Stage 3 triage every unreachable unit and delete the orphans with their tests.md:9-21, lib/orchestration/spawn-compiler.ts:60, tests/orchestration/spawn-compiler.test.ts:2, lib/driver/drive-graph-runner.ts:27, lib/driver/run-run-loop.ts:3
  description: |
    TASK-708 is the prerequisite that builds the command; TASK-709 depends on it and owns triage of the two measured orphans. Yet TASK-708 AC #1 requires that running the command "on this branch" already report every `lib/` module as reachable or live-owned staged code. The repository still has exactly the pre-triage state the plan measures: `spawn-compiler.ts` is imported only by its test, while production reaches `run-run-loop.ts` only through a type import.

    Implemented literally, TASK-708 must either fail its own AC, absorb TASK-709's deletion/wiring work, or stage the known orphans without the live owners INV-006 requires. The command-building task should prove that those current orphans make the command fail; TASK-709 should own the final zero finding. Narrowing this derived task AC preserves rather than changes ratified INV-006.

- id: PR-003
  dimension: interface-fidelity
  severity: medium
  title: "TASK-708 still equates the selected public API with every physically deep-importable lib file"
  plan_refs: D-020, D-029, TASK-708 AC #2
  code_refs: package.json:19-27, fallow.toml:1-27, missions/tasks/TASK-708 - Stage 3 reachability command with declared roots and annotated staged entries.md:16-21
  description: |
    D-020/D-029 intentionally protect a selected set of 23 stable public entries. TASK-708 AC #2 first names those 23, then requires that "nothing a consumer can deep-import" be reported unreachable. `package.json` has no exports map and publishes the entire `lib/` directory, so every `lib/**/*.ts` path is physically deep-importable, not only the selected 23.

    A literal worker can satisfy the second clause by adding every orphan to `public` and `fallow.toml#entry`, making the reachability check green without wiring, staging ownership, or deletion. That would conflict with ratified INV-006. The task contract must refer to the declared 23-entry stable API, not physical package reachability.

- id: PR-004
  dimension: behavior-spec
  severity: medium
  title: "D-021's population and strata omit real entry-point tests under a literal implementation"
  plan_refs: INV-005, D-021, D-024, D-030, B-008
  code_refs: tests/cli/dump-prompt.test.ts:1-12, tests/cli/dump-prompt.test.ts:37-45, tests/helpers/packages.test.ts:5-16, tests/helpers/packages.ts:162-174, tests/entity-file-lock.test.ts:4, tests/harness-runtime-inventory.test.ts:5-8, tests/runtime.test.ts:4-7
  description: |
    D-021 defines the population as files that import from four source roots, but it does not say imports are transitive through helpers or reached through a shipped executable. `tests/cli/dump-prompt.test.ts` exercises `bin/cosmonauts` as a subprocess without importing one of those roots; `tests/helpers/packages.test.ts` imports a helper that dynamically imports production code. A literal direct-import census excludes both, biasing the mutation sample away from real entry-point behavior.

    D-021 also says strata are the first directory level under `tests/`, but qualifying files directly under `tests/`—including `entity-file-lock.test.ts`, `harness-runtime-inventory.test.ts`, and `runtime.test.ts`—have no such directory and no defined root stratum. The sample can therefore be recorded reproducibly while omitting these files. Define the import/reachability rule and a root-level stratum before the broad probe runs; D-021 is derived ground.

- id: PR-005
  dimension: architecture-record
  severity: medium
  title: "Stage 3 establishes a second orphan-health authority without reconciling the active code-structure architecture record"
  plan_refs: absent Architecture Context, D-006, D-020, D-027, D-029, Design — Stage 3
  code_refs: missions/architecture/code-structure-map.md:3-9, missions/architecture/code-structure-map.md:17-29, missions/architecture/code-structure-map.md:31-37, missions/architecture/code-structure-map.md:49-52
  description: |
    The active code-structure-map record calls itself the forward source of truth for the mechanical dependency/public-interface map and assigns orphan-file health metrics to that architecture. Stage 3 instead creates a durable public/staged registry under `missions/architecture/` plus an independent Fallow command, but the plan has no `## Architecture Context` and never says whether this command consumes, replaces, or deliberately coexists with the map's health-metric ownership.

    This is not background: the answer changes which generated structure and public-interface authority future plans and reviewers must trust. Add the architecture context and reconcile the two authorities. If the intended fix supersedes the record's "Health metrics (stays here)" decision, that touches existing architecture-of-record ground and must be escalated rather than silently patched.

- id: PR-006
  dimension: user-experience
  severity: high
  title: "The installed implement-plan command still directs users through the deleted contracts"
  plan_refs: D-001, D-016, B-001, Files to Change — Stage 1 done, Design — Stage 1 external command handoff
  code_refs: /Users/cosmos/.claude/commands/implement-plan.md:30-31, /Users/cosmos/.claude/commands/implement-plan.md:48, external-commands/implement-plan.md:26-47
  description: |
    The durable packaged source has been corrected, but the generated command a Claude user actually invokes still requires a plan Quality Contract, accounts for `@cosmo-behavior` markers, and checks marker presence after implementation. Stage 1 is marked done even though its own Design explicitly includes updating this generated asset.

    Once Stage 2 has removed markers, this user-facing entry point orders an impossible and human-ratified-as-deleted verification flow. Refresh the generated asset from the durable source (or complete the recorded user handoff) before calling Stage 1 delivered; weakening D-001 or D-016 would touch ratified ground and is not a valid remediation.

## Missing Coverage

- TASK-710 does not own all-terminal coordinator/Quality Manager behavior or the shipped Drive descriptions that classify every non-Done task as pending.
- TASK-708 does not distinguish the command's expected pre-triage failure from TASK-709's final clean result.
- The mutation population has no explicit transitive/entry-point rule and no root-level stratum.
- The Fallow-backed orphan check is not reconciled with the active code-structure-map architecture record.
- The generated Claude command remains stale even though its packaged source is corrected.
- Exact Stage 3 deletion candidates remain mechanically unchecked because `dead-code` and `trace` are unbound with `execution-not-consented`.

## Coverage Ledger

- dimension: interface-fidelity
  status: unchecked
  checked: Internal task-status types/parsing, scheduler/coordinator paths, Quality Manager and shipped guidance, package/public-entry contracts, Stage 3 tasks, and Fallow's isolated CLI flags/exit behavior were checked. `fallow --help` and a config-isolated synthetic `/tmp` project were probed without loading repository configuration; an actual project invocation was not run because it would load project-controlled `fallow.toml` and analysis execution is not consented.
  findings: PR-001, PR-003

- dimension: duplication
  status: unchecked
  checked: `analysis_status` reports duplication and trace unbound with `execution-not-consented`; no capability evidence was available for a project-wide duplicate-path check.
  findings: none

- dimension: state-sync
  status: checked
  checked: `Cancelled` write/read/archive/dependency transitions, completion-candidate consumers, old audit-plan ownership, and packaged-versus-generated command state were compared.
  findings: PR-001, PR-006

- dimension: risk-blast-radius
  status: unchecked
  checked: Task-status consumers, public/staged classification, mutation-sample scope, known orphan handoff, and package publication were inspected. The exact deletion set could not be mechanically traced because `dead-code` and `trace` are unbound with `execution-not-consented`.
  findings: PR-001, PR-002, PR-003, PR-004

- dimension: user-experience
  status: checked
  checked: Coordinator termination, Quality Manager plan completion, Drive guidance, direct reachability task flow, and the installed implement-plan command were walked from user/agent entry points.
  findings: PR-001, PR-006

- dimension: behavior-spec
  status: checked
  checked: All eleven behaviors were checked for observer, shipped entry point, observable failure, ratified INV-003 exception handling, task reachability, and alignment with D-021 through D-030.
  findings: PR-002, PR-004

- dimension: architecture-record
  status: checked
  checked: Stage 3's public/staged registry and orphan-health command were compared with the active code-structure-map record and the plan's absent Architecture Context.
  findings: PR-005

- dimension: quality-contract
  status: checked
  checked: D-016/B-011 remain aligned with runtime gate resolution and the plan carries no gate table or predicted binding state; the Quality Manager's Done-only lifecycle rule was checked as a task-status consumer.
  findings: PR-001

- dimension: lifecycle-invariant
  status: checked
  checked: INV-001 through INV-007, including the ratified INV-003 exception, were attacked against task sequencing, status exits, public-entry escape hatches, sample selection, owner liveness, and generated-asset state.
  findings: PR-001, PR-002, PR-003, PR-004, PR-006

- dimension: constraint-ownership
  status: checked
  checked: D-020 through D-030, Files to Change, TASK-708 through TASK-710, the active architecture record, and external/generated command ownership were traced into worker-visible acceptance criteria.
  findings: PR-001, PR-002, PR-003, PR-005, PR-006

- dimension: scope-size
  status: checked
  checked: The plan has eleven behaviors, within the twelve-behavior guidance, with explicit stage seams; no scope-size finding was found.
  findings: none

## Assessment

The plan remains viable but Stage 3 is not ready. Fix TASK-708's contradictory pre-triage/public-surface criteria first, then finish the `Cancelled` consumer inventory and refresh the installed command before authorizing execution.

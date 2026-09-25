# Plan Review: framework-health

## Prior Findings

- **review-1.md PR-001 — resolved.** B-005 now limits the assertion to test declarations/comments and excludes frozen fixtures (`plan.md:377-382`).
- **review-1.md PR-002 — resolved.** INV-003 carries the human-ratified provider/toolchain/language/framework absence exception (`plan.md:58-64`), with D-019 naming the retained guards (`plan.md:280-288`).
- **review-1.md PR-003 — resolved.** D-020 preserves the 23 stable public entries already declared by `fallow.toml` (`plan.md:290-295`; `fallow.toml:1-27`).
- **review-1.md PR-004 — resolved.** D-020/D-024 make the direct `check:reachability` command compose Fallow with owner validation, and D-027 supplies a separate staged-owner registry (`plan.md:290-315,329-334`). The remaining public/staged classification defect is tracked under review-5 PR-002.
- **review-1.md PR-005 — resolved.** D-020 records the external consent boundary and makes B-009 use the repository-owned command rather than the consent-gated capability (`plan.md:290-292,407-412`).
- **review-1.md PR-006 — resolved.** D-025/D-026 and TASK-710 now define and own the two task transitions, plan completion, and archival (`plan.md:316-328`; `TASK-710:16-22`). The incomplete status-consumer contract is review-5 PR-001.
- **review-1.md PR-007 — resolved.** B-002 is narrowed to the two structured supersession syntaxes the checker implements (`plan.md:347-352`).
- **review-1.md PR-008 — resolved.** D-021/D-024 define the population, strata, deterministic ordering, cap, and isolation (`plan.md:296-315`). The distinct file-versus-declaration probe gap is review-5 PR-003.
- **review-1.md PR-009 — resolved.** B-011 owns runtime gate resolution by the Quality Manager (`plan.md:368-373`).
- **review-1.md PR-010 — resolved.** `## Files to Change` exists and uses the post-rename conformance paths (`plan.md:471-499`).
- **review-1.md PR-011 — resolved.** Implementation Order no longer declares a local gate list (`plan.md:523-533`).

- **review-2.md PR-001 — resolved by human disposition.** D-023 records the human's acceptance of paired-session verification for Stages 1-2 and plan-linked tasks for Stage 3 (`plan.md:307-310`). Per the review request, this is not re-raised.
- **review-2.md PR-002 — unresolved.** The durable source is corrected (`external-commands/implement-plan.md:28-50`), but `/Users/cosmos/.claude/commands/implement-plan.md:30-31,48` still requires a Quality Contract and behavior markers.
- **review-2.md PR-003 — resolved.** B-005 permits tests deleted on the record during marker removal (`plan.md:377-382`).
- **review-2.md PR-004 — resolved.** B-006 excludes the ratified provider/toolchain/language/framework vocabulary (`plan.md:384-389`).
- **review-2.md PR-005 — resolved.** B-002 matches the checker's structured supersession grammar (`plan.md:347-352`).
- **review-2.md PR-006 — resolved.** D-021 includes tests importing from `scripts/` (`plan.md:296-300`).
- **review-2.md PR-007 — resolved.** D-021 requires a throwaway worktree and local backup restoration (`plan.md:296-300`).
- **review-2.md PR-008 — resolved.** D-024 names `check:reachability`, and TASK-708 owns the composed invocation (`plan.md:311-315`; `TASK-708:16-22`).
- **review-2.md PR-009 — unresolved.** D-012 and D-018 now carry `Supersedes:` lines (`plan.md:172-185,262-279`), but the superseded Design text remains unmarked at `plan.md:442-448`; Stage 3 likewise still directs D-006/D-007 after D-027 (`plan.md:462-464`). This still violates the in-place dated-pointer rule at `deviation-protocol.md:70-82`.
- **review-2.md PR-010 — resolved.** The canonical planned-work example now includes Intent and Decision Log and does not declare plan-local gates (`domains/shared/skills/work-artifacts/references/examples.md:38-105`).

- **review-3.md PR-001 — resolved.** The shipped plans skill and `spec-to-backlog` command use the new format, and both are owned by Stage 1 (`external-skills/cosmonauts/plans/SKILL.md:61-70`; `external-commands/spec-to-backlog.md:27-55`; `plan.md:473-481`).
- **review-3.md PR-002 — resolved.** D-024 caps each sample at the stratum size (`plan.md:311-315`).
- **review-3.md PR-003 — resolved.** `stage2-probes.md` names each excluded run and its reproduction or isolated rerun evidence (`stage2-probes.md:3-18,41-45`).
- **review-3.md PR-004 — resolved.** D-025 replaces the false `Done` transition with `Cancelled`, preserving unchecked criteria and notes (`plan.md:316-321`).

- **review-4.md PR-001 — unresolved.** D-026 and TASK-710 broaden ownership to the previously named tool/CLI/view surfaces, but the persisted task parser and other hard-coded shipped consumers are still absent from Files to Change; review-5 PR-001 gives the concrete failure.
- **review-4.md PR-002 — resolved.** D-026 now specifies non-dispatch, active/archived dependency behavior, archive acceptance, and coordinator termination (`plan.md:323-328`; `TASK-710:16-22`).
- **review-4.md PR-003 — resolved.** TASK-710 AC #3 explicitly owns cancelling TASK-706/TASK-707, completing `test-health-audit`, and archiving it; the old plan and task records are listed in Stage 3 ownership (`TASK-710:18-22`; `plan.md:489-499`).
- **review-4.md PR-004 — resolved.** B-010 now uses the combined project reachability command rather than the consent-gated dead-code capability (`plan.md:414-419`).
- **review-4.md PR-005 — unresolved.** D-027 supplies parseable staged rows and owner syntax, but does not identify an independent machine-readable public-entry authority, while Design and TASK-709 still pre-list owners D-027 rejects (`plan.md:329-334,462-464`; `TASK-709:15-21`). See review-5 PR-002 and PR-004.
- **review-4.md PR-006 — resolved.** B-010 and TASK-709 now identify the same two known orphans; neither claims a third (`plan.md:414-419`; `TASK-709:15-21`).

## Findings

- id: PR-001
  dimension: interface-fidelity
  severity: high
  title: "Cancelled is still omitted from the persisted task parsing boundary"
  plan_refs: D-026, Files to Change — Stage 3, TASK-710 AC #1-#3
  code_refs: lib/tasks/task-parser.ts:21-26, lib/tasks/task-parser.ts:74-88, lib/tasks/task-manager.ts:225-258, lib/tasks/task-manager.ts:479-515, lib/driver/drive-graph-runner.ts:812-825, domains/shared/capabilities/tasks.md:15-23, missions/tasks/TASK-710 - Stage 3 a Cancelled task status, and the superseded audit plan archived.md:16-22, missions/plans/framework-health/plan.md:489-499
  description: |
    D-026 says `Cancelled` joins every shipped `TaskStatus` consumer, but Stage 3 does not own `lib/tasks/task-parser.ts`. That parser has its own four-value `VALID_STATUSES` list and silently maps every unknown value to `To Do`. `TaskManager.updateTask()` can therefore serialize `status: Cancelled`, return it successfully to `task_edit`, and then have the next process or list/archive call parse the same file back as `To Do`.

    This makes TASK-710's ordinary archive transition fail even if the tool and CLI schemas accept the new value. The same ownership list omits other hard-coded shipped consumers such as the graph Drive completion path and capability guidance, despite D-026's “every shipped consumer” contract. Add the persisted round-trip boundary and enumerate/reconcile the remaining consumers before assigning this as a coherent state-machine change.

- id: PR-002
  dimension: lifecycle-invariant
  severity: medium
  title: "The staged check has no independent authority for the public-entry side of its partition"
  plan_refs: INV-006, D-020, D-027, B-009, TASK-708 AC #2
  code_refs: fallow.toml:1-27, docs/fallow-exceptions.md:39-57, package.json:19-27, missions/tasks/TASK-708 - Stage 3 reachability command with declared roots and annotated staged entries.md:16-21
  description: |
    D-027 can identify staged entries through `staged-code.toml`, but it does not identify where the checker obtains the allowed set for its other assertion: every non-staged `entry` must be a declared public module. The current documentation declares public entries by pointing back to `fallow.toml` itself and gives only examples. Once staged paths are added to that same array, `entry - staged` is not independent evidence that every remaining path was one of the original 23 public entries; an orphan added only to `entry` can be treated as public and evade owner validation.

    TASK-708 compounds the ambiguity by saying “nothing a consumer can deep-import” may be reported unreachable, while `package.json` ships the whole `lib/` tree and has no exports map; the actual stable contract is the selected 23 entries, not every physically deep-importable file. Define the exact machine-readable authority for those 23 paths and narrow the task handoff to that stable set. Allowing an arbitrary new `entry` to count as public would violate ratified INV-006 rather than amend it.

- id: PR-003
  dimension: behavior-spec
  severity: medium
  title: "The sample selects files but B-008 and the surviving probe contract judge test declarations"
  plan_refs: INV-005, D-021, D-024, B-008, stage2-probes.md — Not yet probed
  code_refs: scripts/test-health-audit/probe.ts:43-57, scripts/test-health-audit/probe.ts:486-510, tests/artifacts/plan-conformance.test.ts:4-52, missions/plans/framework-health/stage2-probes.md:57-60
  description: |
    D-021's population and stride select test files. B-008 instead promises a killed/survived disposition for each sampled “test,” and the in-scope probe implementation selects and verifies one named `testDeclaration`. Real sampled files contain many declarations: `tests/artifacts/plan-conformance.test.ts` alone begins a second declaration at line 52 and contains many more.

    As written, one easy mutant killed by one declaration can disposition an entire selected file while saying nothing about the other declarations, or each worker can choose a different declaration from the same deterministic file sample. The broad sample is still unrun. Specify the probe unit and the required declarations/mutants per selected file so the Stage 2 record cannot satisfy B-008 with file-level evidence that does not answer ratified INV-005's per-test question.

- id: PR-004
  dimension: constraint-ownership
  severity: medium
  title: "D-027 has not reached the Stage 3 design or TASK-709 handoff"
  plan_refs: D-027, Design — Stage 3, Files to Change — Stage 3, Implementation Order step 7
  code_refs: missions/tasks/TASK-709 - Stage 3 triage every unreachable unit and delete the orphans with their tests.md:15-21, ROADMAP.md:23-30, missions/plans/autonomy-host/plan.md:1-5, missions/archive/plans/episodic-log/plan.md:1-6, missions/archive/plans/living-memory/plan.md:1-6
  description: |
    D-027 says only `autonomy-host` currently has a live plan owner, `episodic-log` is production-reachable rather than staged, and a `memory-consolidation` staging need must halt for a human because no live plan or roadmap heading exists. The superseded Stage 3 Design and TASK-709 still tell the worker to pre-list all three as staged.

    A worker executing TASK-709 literally must either create an owner the plan says it may not invent or fail its own AC #1 because the staged-owner check rejects the absent/archived owners. Propagate D-027 into the task-visible handoff and mark the superseded Design text in place. Choosing a new owner for `memory-consolidation` remains the human stop D-027 records; it is not an automated remediation.

## Missing Coverage

- The `Cancelled` change still lacks a complete persisted-status and shipped-consumer inventory; current omissions include the task parser, Drive completion-candidate paths, coordinator/Quality Manager prose, and capability guidance.
- No independent allowlist or other authority protects the original 23 stable public entries from arbitrary additions masquerading as public API.
- The broad D-021 sample has not run, and the plan does not yet say whether evidence is per selected file, per declaration, or per mutant.
- The generated Claude command remains stale (`review-2.md PR-002`).
- The amendment trail still lacks in-place dated pointers for superseded Design text (`review-2.md PR-009`).
- Exact Stage 3 deletion candidates and the live Fallow command envelope remain unchecked because `dead-code` and `trace` are unbound with `execution-not-consented`, and no config/plugin-isolated live invocation was available.

## Coverage Ledger

- dimension: interface-fidelity
  status: unchecked
  checked: Internal task serialization/parsing, tool/CLI ownership, archive, Drive/coordinator consumers, mutation-probe contracts, package scripts, and Stage 3 task handoffs were checked. A live Fallow invocation was not run because available invocations load project-controlled `fallow.toml` and no approved config/plugin-isolated mechanism was available.
  findings: PR-001, PR-003

- dimension: duplication
  status: unchecked
  checked: `analysis_status` reports duplication and trace unbound with `execution-not-consented`; no capability evidence was available for a project-wide duplicate-path check.
  findings: none

- dimension: state-sync
  status: checked
  checked: `Cancelled` write/read/archive transitions, active versus archived dependency state, old audit-plan transitions, staged ownership, and plan/task handoff state were traced.
  findings: PR-001, PR-004

- dimension: risk-blast-radius
  status: unchecked
  checked: The global task-status consumer surface, public/staged reachability partition, package surface, and known orphan handoff were inspected. Exact deletion impact could not be mechanically traced because dead-code and trace capabilities are unbound with `execution-not-consented`.
  findings: PR-001, PR-002, PR-004

- dimension: user-experience
  status: checked
  checked: `task_edit`, CLI task status, plan archive, coordinator/Quality Manager completion, generated implement-plan guidance, and the direct reachability command were walked from agent and maintainer entry points.
  findings: PR-001, PR-002

- dimension: behavior-spec
  status: checked
  checked: All eleven behaviors were checked for observers, shipped entry points, observable failures, ratified exceptions, and consistency with D-021 through D-027 and the probe record.
  findings: PR-003

- dimension: architecture-record
  status: checked
  checked: The plan declares no architecture record. The staged registry's public/staged boundary was checked as an implementation contract; no dependency-direction claim was inferred from the unbound boundary capability.
  findings: PR-002

- dimension: quality-contract
  status: checked
  checked: D-016/B-011 remain aligned with the runtime-resolving Quality Manager contract; no plan-local gate table or predicted binding state was found.
  findings: none

- dimension: lifecycle-invariant
  status: checked
  checked: INV-001 through INV-007, including the ratified INV-003 exception, were attacked against cancellation persistence, archived dependencies, public/staged classification, probe units, and owner expiry.
  findings: PR-001, PR-002, PR-003, PR-004

- dimension: constraint-ownership
  status: checked
  checked: D-020 through D-027, Files to Change, TASK-708 through TASK-710, and superseded Design text were traced to worker-visible ownership.
  findings: PR-001, PR-002, PR-004, review-2.md PR-009

- dimension: scope-size
  status: checked
  checked: The plan has eleven behaviors, within the twelve-behavior guidance, and the global status change is separated into TASK-710 rather than coupled to orphan deletion.
  findings: none

## Assessment

The plan remains viable but Stage 3 is not ready. Fix the `Cancelled` persistence/consumer contract first; otherwise the new terminal state rehydrates as `To Do` and the archival path cannot work, then make the public-versus-staged authority and worker handoffs non-circular before authorizing deletion.

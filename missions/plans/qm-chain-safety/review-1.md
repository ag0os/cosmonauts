# Plan Review: qm-chain-safety

## Findings

- id: PR-001
  dimension: lifecycle-invariant
  severity: high
  title: "The artifact link gives review agents a write path back into the operator checkout"
  plan_refs: B-002, Design §3 step 5, Design §4, R-005, R-011
  code_refs: lib/orchestration/definition-resolution.ts:21-31, .gitignore:8-9, AGENTS.md:70-76
  description: |
    Design §3 links the private clone's entire `missions/sessions` directory to the host-owned run store while the QM and reviewers retain `bash` plus file-writing tools. A filesystem path through a directory symlink is not confined by the clone: from `snapshot/missions/sessions`, `../plans`, sibling run directories, and other descendants resolve relative to the host target. A hostile reviewer can therefore modify tracked `missions/plans/**`, another run's evidence, or any other host path reachable above the symlink. Artifact-writer traversal checks do not constrain ordinary shell/edit/write calls.

    This directly defeats ratified INV-001/AC-003 and also defeats INV-002's run ownership. D-010 option A would not cure it: an agent-writable link is not an exemption for a narrowly host-owned artifact. The evidence transfer needs redesign so only host code writes outside the clone and the agent has no filesystem path back to the operator checkout; narrowing INV-001 or AC-003 requires a human decision.

- id: PR-002
  dimension: risk-blast-radius
  severity: high
  title: "QM isolation is selected only after project-controlled domain code has already executed"
  plan_refs: D-003, Design §2, Design §3 trust boundary, R-004
  code_refs: cli/runtime-bootstrap.ts:119-132, domains/shared/extensions/orchestration/chain-tool.ts:126-142, lib/runtime.ts:104-141, lib/domains/loader.ts:99-137
  description: |
    The proposed envelope discovers `AgentDefinition.executionPolicy` through the existing runtime. Both CLI and tool paths construct that runtime from the operator checkout before chain routing: `createCliRuntimeContext()` calls `CosmonautsRuntime.create()`, and `chain_run` calls `getRuntime(ctx.cwd)` before parsing. Runtime creation then dynamically imports project/package `domain.ts`, every agent definition, and `chains.ts`. For a self-review or project plugin override, project-controlled TypeScript can therefore execute from the operator checkout before the plan creates its private clone.

    That contradicts the plan's own R-004 rule that project-controlled startup occurs only inside the clone. The stop condition is acknowledged but has no composition design capable of reaching it safely, because the policy used to select isolation is itself loaded by the unsafe bootstrap. The launch boundary must be redesigned or must refuse before dynamic imports; this serves ratified INV-001 and cannot be solved by prompt instructions.

- id: PR-003
  dimension: interface-fidelity
  severity: high
  title: "Verification shell access bypasses every proposed subagent allowlist check"
  plan_refs: B-001, B-006, Design §1, Implementation Order stage 1
  code_refs: lib/orchestration/definition-resolution.ts:21-31, cli/run/subcommand.ts:104-127, cli/run/subcommand.ts:212-243, bin/cosmonauts:1-2
  description: |
    The plan keeps unrestricted `bash` in the QM's verification tool set and preserves callerless top-level CLI behavior. From the private clone, the QM—or any allowed verifier/reviewer with shell access—can run `bun bin/cosmonauts run chain worker`, `... coordinator`, or `run drive`. The CLI creates a fresh top-level runtime with no originating agent identity, so the checks proposed for `spawn_agent`, `chain_run`, and `run_driver` never see the QM as caller.

    Thus a QM invocation can still start `worker`, `coordinator`, or `fixer`, contrary to ratified AC-002 and INV-004, even if all registered-tool checks are correct. Snapshot containment limits where that child writes but does not satisfy the authority promise. This needs an authority design covering shell-launched orchestration or a tool-set redesign; preserving the top-level exception while leaving `bash` unrestricted is not sufficient.

- id: PR-004
  dimension: state-sync
  severity: high
  title: "Reviewer producer claims are self-asserted rather than correlated to a host-observed child"
  plan_refs: B-003, D-006, Design §2 `ReviewerArtifactClaim`, Design §4 reviewer validation
  code_refs: lib/orchestration/types.ts:374-427, domains/shared/extensions/orchestration/spawn-tool.ts:632-696, lib/orchestration/spawn-tracker.ts:300-333
  description: |
    `ReviewerArtifactClaim` contains only a path and bearer token, and the whole claim map is injected into the QM. The design then lets agents write those paths and lets the QM validate token/model fields after completion. Nothing binds a file to the host-observed `spawnId`, child `sessionId`, resolved role, completion event, or captured child output; the QM itself knows every token and can create a missing review, and one child can write another child's path if it obtains the claim. The current spawn host does observe session completion and full text, but `SpawnResult`/tracker evidence is not part of the proposed artifact contract.

    This cannot prove AC-006's “reviewer stage produced its report” condition by construction. The host must persist or attest reviewer output from correlated child completion and reject evidence without that persisted producer record. Any remediation that weakens AC-006 or INV-002 touches ratified ground.

- id: PR-005
  dimension: interface-fidelity
  severity: medium
  title: "Model-family diversity has neither a family classifier nor host-observed actual model evidence"
  plan_refs: D-005, B-011, Design §2 `QualityReviewContext`, Design §6
  code_refs: lib/orchestration/model-resolution.ts:100-121, lib/orchestration/types.ts:374-427, domains/shared/extensions/orchestration/spawn-tool.ts:632-696, bundled/coding/agents/reviewer.ts:3-22, bundled/coding/agents/worker.ts:3-24
  description: |
    Current model resolution yields a provider/model pair; there is no canonical “family” contract. Provider IDs are not families (`openai` and `openai-codex` can be the same vendor family), and custom registry providers make model-name heuristics unsafe. The plan adds only `qualityReview.diverseReviewerModel`, so independent config, launch, and report workers cannot agree on how malformed, unknown, or same-family aliases are classified.

    Enforcement is also not host-authoritative: `spawn_agent` accepts an optional model chosen by the parent, while `SpawnResult` carries no actual resolved model. Recording a model string in reviewer-authored markdown does not prove which model ran. Define the family identity/classification contract and capture the session's actual resolved model at the host boundary; otherwise B-011/AC-014 can pass on self-reported or same-family evidence.

- id: PR-006
  dimension: lifecycle-invariant
  severity: high
  title: "Final-report and retained-workspace state cannot be reconstructed after restart"
  plan_refs: B-004, D-007, Design §3 step 6, Design §4 host finalizer, Design §5 terminal table, R-005, R-007
  code_refs: lib/durable-runtime/scheduler.ts:1600-1669, lib/durable-runtime/run-start.ts:94-174, lib/durable-runtime/controller.ts:11-58, lib/orchestration/spawn-completion-loop.ts:33-98, lib/orchestration/spawn-tracker.ts:300-333, missions/plans/execution-liveness/plan.md:86-91
  description: |
    The current scheduler writes the run terminal event as soon as the terminal step result is accepted. The plan's outer host finalizer must then create/validate `final.md`, possibly create the tracked summary, retain an unsettled workspace, and convert report-integrity or persistence failure into a failed run. No persisted finalization phase orders those writes before first terminalization, and `run status` is explicitly observation-only. A crash after step terminalization but before the host finalizer therefore leaves a terminal run with no required report; a fresh `runStart`/status process has no rule that resumes finalization.

    The same gap applies to the retained workspace: child settlement and trackers are process-local, and the plan defines no durable workspace path/retention/cleanup state that a fresh process can reconstruct. `execution-liveness` explicitly defers AC-015 and AC-016 in its current slice, so this plan cannot assume that future state. Define durable, idempotent pre-terminal finalization and restart recovery without reopening a first terminal outcome; ratified AC-007/INV-003 require the report on every exit.

- id: PR-007
  dimension: architecture-record
  severity: medium
  title: "The design generalizes full-result artifacts despite the ratified execution-liveness exclusion"
  plan_refs: Architecture Context execution-liveness paragraph, Design §4 “Every durable agent stage”, Files to Change `durable-chain-runner.ts`, spec Scope exclusions
  code_refs: lib/orchestration/durable-chain-runner.ts:188-297, lib/durable-runtime/types.ts:174-217, missions/plans/execution-liveness/plan.md:86-91, missions/plans/execution-liveness/plan.md:1640-1661
  description: |
    The authoritative spec excludes changes to the general persisted-evidence contract and says this slice persists only the QM final report. Design §4 nevertheless requires **every durable agent stage** to persist its complete assistant text and changes the generic durable-chain runner/result artifact contract. The active execution-liveness plan assigns AC-016 to a later capability/evidence slice and its closure stage explicitly requires AC-014–AC-017 to remain follow-ups.

    That is not an additive QM-only artifact: it is the excluded generalization and lands directly in the seam reserved for the later plan. Narrow the behavior and implementation owner to the isolated QM stage, or obtain a human amendment to the ratified scope exclusion before implementation.

- id: PR-008
  dimension: interface-fidelity
  severity: high
  title: "The required third Fallow baseline does not exist"
  plan_refs: D-008, B-007, B-009, Design §7, Design §9, R-009
  code_refs: docs/fallow-exceptions.md:16-29, ROADMAP.md:394-423, domains/shared/extensions/project-tools/fallow-provider.ts:1970-2008, .fallow-baselines/dead-code.json:1, .fallow-baselines/health.json:1, .fallow-baselines/duplication.json (missing)
  description: |
    D-008 and Design §7 require ordinary audit to pass dead-code, health, and duplication baseline paths and to fail closed when any is missing. The repository has only `dead-code.json` and `health.json`; `duplication.json` is absent. The current policy documentation explicitly says there is no duplication baseline and that duplication is clean/informational. The provider adapter currently passes no baseline flags, so implementing the stated three-file rule immediately makes every changed-scope audit fail.

    The plan must either add a separately authorized, provenance-recorded duplication baseline before ordinary review can use it, or amend D-008 to match the repository's threshold policy. It cannot silently generate the file during review because INV-005 and AC-010 make baseline refresh explicit.

- id: PR-009
  dimension: behavior-spec
  severity: high
  title: "D-010 remains an unresolved ratified acceptance-criterion collision"
  plan_refs: D-010, R-001, B-002, B-004, Implementation Order precondition
  code_refs: .gitignore:8-9, AGENTS.md:54-76
  description: |
    The repository confirms the collision's physical consequence: `missions/sessions/**` is ignored, while `missions/plans/**` is tracked project state. AC-003 requires the checkout's tracked/untracked bytes to remain identical, and AC-007 plus human D-001 item 2 requires a new tracked plan summary in that checkout on every exit. The plan correctly records that no implementation can satisfy both, but the human ruling has not occurred.

    No tasks or code may be created from this plan until the human amends the chosen ratified criterion and the spec/plan record that amendment. Option A must also be re-evaluated against PR-001: exempting a host-owned artifact does not authorize an agent-accessible symlink into the host tree.

- id: PR-010
  dimension: quality-contract
  severity: low
  title: "The plan carries a separate gate/sign-off list and predicted binding state"
  plan_refs: Architecture Context “Capability evidence gathered before design”, D-002, Design §10 “Sign-off evidence contract”
  code_refs: domains/shared/skills/work-artifacts/references/plan-format.md:50-78, domains/shared/skills/work-artifacts/references/gate-contracts.md:1-35
  description: |
    Design §10 enumerates the abstract gate kinds, prescribes separate mutation negatives and reviewer judgment, and Architecture Context records predicted runtime binding outcomes. D-002 also names an exact verifier command. Current artifact rules require work-specific quality to live in behaviors/risks and resolve bindings only at sign-off; a plan must not carry a separate gate list or command binding.

    Remove the derived duplicate checklist and keep only behavior/risk outcomes. D-002 is human-decided ground, so changing its exact command/model instruction rather than relocating derived quality prose requires escalation under the deviation protocol.

- id: PR-011
  dimension: behavior-spec
  severity: low
  title: "All behavior entries restore the prohibited Test/Marker coupling"
  plan_refs: B-001 through B-012
  code_refs: missions/plans/framework-health/plan.md:48-72, domains/shared/skills/work-artifacts/references/behavior-spine.md:30-54
  description: |
    Every B-### entry includes `Seam`, `Test`, and an `@cosmo-behavior plan:...` marker. The current behavior contract says plans do not pre-name tests and tests carry no plan reference; the ratified framework-health invariants explicitly removed this executable coupling because archived plans must not remain authority over live tests.

    The observable Context/Action/Expected outcomes are usable, but the Test/Marker fields should be removed before task decomposition. Keeping them would recreate ratified framework-health INV-001/INV-002/INV-004's forbidden mechanism.

- id: PR-012
  dimension: constraint-ownership
  severity: low
  title: "The cited authoritative investigation evidence is absent from the checkout"
  plan_refs: Overview evidence paragraph, D-001 provenance, spec Purpose, spec Intent provenance
  code_refs: .shepherd/work/todo/qm-chain-safety/investigation.md (missing), missions/reviews/qm/framework-health-incidents.md:1-24
  description: |
    The plan and spec repeatedly make `.shepherd/work/todo/qm-chain-safety/investigation.md` the authority for the eight human decisions, but that path does not exist in the current checkout. The incident report exists and supports the failure history, and D-001 restates the decisions, but an independent worker/reviewer cannot verify the cited recommendation set or its exact human provenance.

    Restore the investigation as durable tracked evidence or replace the stale citation with the durable ratified source. This does not authorize changing any human-decided D-001 item.

## Missing Coverage

- A live Fallow 2.54.2 baseline invocation was not performed. This role is read-only and cannot execute shell commands, and the available capability surface cannot add the three proposed baseline flags; version-matched docs confirm the flags, but live exit/envelope behavior remains unchecked.
- Repository-wide old-path search and `git log --follow` history for the eleven legacy review files could not be executed under the no-shell review constraint. All eleven explicitly listed source files were read and exist.
- Runtime dependency direction was checked textually against both architecture records, but `boundary-conformance` is unbound (`provider-not-configured`), so there is no capability-backed conformance result.
- Duplication evidence is unavailable: the bound Fallow provider exited 0 but normalization found 92 findings and rejected the contradictory envelope. No clean duplication conclusion is inferred.
- The architecture-map claim was verified: `memory/architecture/index.md` is absent and `architecture_map_read` reports freshness `missing`.

## Coverage Ledger

- dimension: interface-fidelity
  status: unchecked
  checked: Statically compared orchestration tools/CLI, session/model/spawn contracts, durable runtime, config, and Fallow adapter/docs. Live external Fallow baseline probing was unavailable under the read-only/no-shell role.
  findings: PR-003, PR-005, PR-008

- dimension: duplication
  status: unchecked
  checked: `analysis_duplication` failed with `invalid-output` because provider exit 0 contradicted 92 normalized findings; no capability-backed duplicate-path claim is made.
  findings: none

- dimension: state-sync
  status: checked
  checked: Traced host versus agent writes, run/reviewer ownership, producer tokens, actual models, process-local spawn trackers, retained workspaces, terminal report creation, and restart behavior.
  findings: PR-001, PR-004, PR-006

- dimension: risk-blast-radius
  status: checked
  checked: Walked CLI/tool/named-chain/spawn entry points, pre-isolation bootstrap, shell delegation, orphaned children, artifact persistence failure, baseline failure, and D-010 consequences.
  findings: PR-001, PR-002, PR-003, PR-006, PR-008, PR-009

- dimension: user-experience
  status: checked
  checked: Walked ready, not-ready, refusal, persistence failure, cancellation/orphan, model refusal, planless review, active-plan summary, and operator status/report recovery flows.
  findings: PR-005, PR-006, PR-008, PR-009

- dimension: behavior-spec
  status: checked
  checked: Checked all twelve behaviors against AC-001–AC-016, their shipped observers/entry points, edge cases, and ratified Intent/Scope.
  findings: PR-003, PR-009, PR-011

- dimension: architecture-record
  status: unchecked
  checked: Textually compared D-003/D-007 and module direction with `orchestration-future.md`, `durable-orchestration-runtime.md`, and execution-liveness. Mechanical boundary conformance is unavailable because the capability is unbound.
  findings: PR-002, PR-007

- dimension: quality-contract
  status: checked
  checked: Checked for gate tables/lists, predicted bindings, concrete command bindings, separate quality criteria, authored-prose assertions, and marker/test prescriptions.
  findings: PR-010, PR-011

- dimension: lifecycle-invariant
  status: checked
  checked: Attacked isolation establishment, every path back to host state, terminal report ordering, first-terminal absorption, cancellation without child settlement, retained-workspace cleanup, restart, and D-010.
  findings: PR-001, PR-006, PR-009

- dimension: constraint-ownership
  status: checked
  checked: Traced load-bearing Design/Decision/File constraints into behaviors and implementation stages, including model policy, producer claims, baseline ownership, execution-liveness exclusions, and investigation provenance.
  findings: PR-004, PR-005, PR-007, PR-008, PR-012

- dimension: scope-size
  status: checked
  checked: Counted twelve behavior clusters, matching the project's maximum guidance, and reviewed the ten implementation stages as coherent candidate task groups.
  findings: none

## Assessment

The plan is not implementation-ready. Resolve D-010 first, then redesign the isolation boundary so neither pre-bootstrap code nor the artifact transport can reach the operator checkout; without that, the plan violates its highest-ranked ratified invariant by construction.

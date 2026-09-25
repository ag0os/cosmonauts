# Plan Review: framework-health

## Findings

- id: PR-001
  dimension: lifecycle-invariant
  severity: high
  title: "B-005 is already false unless the search crosses ratified historical ground"
  plan_refs: INV-004, B-005, D-017, Risks — knowledge-seed inventory
  code_refs: tests/fixtures/knowledge-seed-inventory.json:50-60, tests/episodic/pre-w3-disabled-baselines.test.ts:31-104, scripts/knowledge-surface-backfill.ts:20-29
  description: |
    B-005 says that a maintainer searching `tests/` for `@cosmo-behavior` finds nothing. The frozen knowledge-seed fixture under `tests/` still contains that exact token in the embedded `artifact-format-redesign` history (`tests/fixtures/knowledge-seed-inventory.json:57`). That fixture is consumed as historical evidence by both the pre-W3 baseline test and the backfill utility, while INV-004 explicitly puts byte-pinned knowledge history out of scope.

    The behavior is therefore unsatisfiable as written: a repository search is non-empty, while removing or rewriting the historical fixture crosses the invariant's exclusion. If B-005 intended only executable test declarations/comments, it must say so. Because either correction changes the letter or scope of ratified INV-004/B-005 ground, the planner must escalate rather than silently patch it.

- id: PR-002
  dimension: lifecycle-invariant
  severity: high
  title: "D-019 retains authored-prose assertions forbidden by INV-003"
  plan_refs: INV-003, D-005, D-019, B-006
  code_refs: tests/prompts/provider-neutrality.test.ts:1-36
  description: |
    INV-003 says tests are not coupled to authored prose, and D-005 says absence of a prose phrase goes. D-019, however, human-ratifies keeping `tests/prompts/provider-neutrality.test.ts`; that suite reads specific shipped prompt and skill bodies and fails on authored vocabulary such as `fallow`, `vitest`, `React`, or `Rails`. These are exactly prose-token assertions, not keys or identifiers parsed by production code.

    D-019 does not state that it amends INV-003, rank the conflict, or carry a `Supersedes:` pointer. The plan therefore contains two pieces of ratified ground that cannot both hold literally. Resolving this requires a human decision under the deviation protocol, not an implementation-time classification.

- id: PR-003
  dimension: risk-blast-radius
  severity: high
  title: "The proposed reachability roots omit the package's declared public TypeScript API"
  plan_refs: D-006, B-009, B-010, Design — Stage 3
  code_refs: fallow.toml:1-26, package.json:24-36
  description: |
    D-006 roots reachability at `bin/`, `cli/`, Pi extensions, and domain manifests, after which Stage 3 deletes everything else not staged. The existing `fallow.toml` deliberately roots 23 `lib/` entry modules because consumers deep-import them as stable public API. `package.json` also ships the entire `lib/` tree.

    A public library entry can have no in-repository production importer and still be reachable to npm consumers. Replacing the current roots with only internal runtime entry points would classify supported public modules as orphaned and authorize their deletion. The plan must account for the existing public-entry contract before Stage 3; otherwise it can break consumers while satisfying B-009.

- id: PR-004
  dimension: interface-fidelity
  severity: high
  title: "The staged-code list has no path into the dead-code gate"
  plan_refs: D-007, B-009, Design — Stage 3
  code_refs: fallow.toml:1-33, domains/shared/extensions/project-tools/fallow-provider.ts:1976-2020, domains/shared/extensions/project-tools/fallow-provider.ts:2456-2519, bundled/coding/prompts/quality-manager.md:71-128
  description: |
    D-007 says a tracked staged-code list is read by the reachability check, and B-009 says a live owner makes such a module pass the project's dead-code gate. The actual gate path does not have that contract: the Quality Manager calls the runtime capability directly; `capabilityArgs()` invokes Fallow from its normal config; and `normalizedCapabilityResult()` returns the provider's findings without consulting plan/roadmap ownership or a staged list.

    Merely adding the list described in Stage 3 changes no gate outcome. The design does not name a module, list schema, owner-resolution contract, or composition point that reconciles provider findings with staged ownership. This central behavior needs an explicit integration contract before independent workers can implement it coherently.

- id: PR-005
  dimension: risk-blast-radius
  severity: medium
  title: "Stage 3 assumes an enforceable dead-code gate without satisfying its external consent precondition"
  plan_refs: D-006, B-009, Design — Stage 3, Risks
  code_refs: domains/shared/extensions/project-tools/analysis-consent.ts:48-102, domains/shared/extensions/project-tools/fallow-provider.ts:1474-1518
  description: |
    Capability evidence from `analysis_status` reports `dead-code` as `unbound` with reason `execution-not-consented` and provider `fallow`. The consent implementation deliberately ignores repository configuration and requires user-owned state outside the project, so no Stage 3 repository edit can make the capability enforceable.

    The plan has no prerequisite, operator handoff, or pivot for reaching Stage 3 while the gate remains unbound. Under the current Quality Manager contract that state degrades to reviewer judgment; it does not make unreachable code fail as B-009 promises. Name the external consent/trust boundary and the outcome when consent is unavailable before relying on this gate.

- id: PR-006
  dimension: state-sync
  severity: medium
  title: "The superseded audit plan and its 22 linked tasks have no defined lifecycle exit"
  plan_refs: D-002, D-010, Design — Stage 2, Implementation Order step 6
  code_refs: lib/plans/plan-types.ts:13-27, lib/plans/archive.ts:64-83, missions/plans/test-health-audit/plan.md:1-44, missions/plans/test-health-audit/spec.md:16-41
  description: |
    The plan says to supersede and rewrite `test-health-audit`, but the live plan remains `active` with 22 linked tasks. The runtime lifecycle has only `active | completed`; there is no `superseded` status, and archival refuses while any linked task is not Done. D-010 names only TASK-706 and TASK-707, not the disposition of the full linked backlog or the old plan's lifecycle state.

    A prose annotation alone leaves `plan list --status active`, task routing, and archive state disagreeing with this plan's claim that the audit is superseded. Specify the exact plan and task transitions, including what happens to incomplete linked tasks and when the old plan leaves the active set.

- id: PR-007
  dimension: interface-fidelity
  severity: medium
  title: "B-002 promises broader supersession-date checking than the checker implements"
  plan_refs: B-002, D-004, D-015
  code_refs: lib/artifacts/plan-conformance.ts:28-35, lib/artifacts/plan-conformance.ts:85-114, lib/artifacts/plan-conformance.ts:151-180
  description: |
    B-002 says that “superseding without a date” fails. The checker only recognizes a line beginning `- Supersedes:` or a parenthesized `*(superseded|withdrawn by ...)*` annotation. Plain supersession prose is ignored. This plan's own D-015 uses `Decided by: planner-proposed; superseded in part by D-016` without a date in that entry, and the implemented checker does not inspect it.

    Either the behavior must narrow the contract to the two structured syntaxes, or the checker must cover the broader claim. As written, the plan can report B-002 delivered while accepting its own undated supersession.

- id: PR-008
  dimension: behavior-spec
  severity: medium
  title: "The mutation sample can be selected arbitrarily and still satisfy B-008"
  plan_refs: D-008, B-008, Design — Stage 2, stage2-probes.md — Not yet probed
  code_refs: scripts/test-health-audit/probe.ts:155-223
  description: |
    D-008 says the sample is “stratified by directory” but defines neither the population, strata, minimum size, nor deterministic selection rule. B-008 only requires a disposition for whatever happened to be sampled, so an implementer can choose a tiny easy sample and satisfy it. The existing `deriveProbeQueue()` cannot fill this gap: it selects old-audit portfolio entries by criticality and false-confidence triggers, not by repository directory strata.

    This is load-bearing for INV-005 and for the plan's critique of the prior one-probe audit. Define observable sampling completeness and how the existing probe tooling is adapted or discarded; otherwise a green Stage 2 record still does not establish the claimed suite-level fault sensitivity.

- id: PR-009
  dimension: constraint-ownership
  severity: medium
  title: "The Quality Manager rewiring in D-016 has no owning behavior"
  plan_refs: D-015, D-016, Behaviors B-001 through B-010, Design — Stage 1
  code_refs: bundled/coding/prompts/quality-manager.md:71-128
  description: |
    D-015 establishes that deleting plan gate tables without rewiring the Quality Manager silently stops four gates. D-016 supplies the replacement rule, and the current prompt contains substantial runtime-resolution procedure. None of B-001 through B-010 has the Quality Manager as observer or states the outcome that all runtime-capable gates are resolved with or without a plan.

    This load-bearing requirement therefore exists only in Decision Log/design prose—the exact material task decomposition is least likely to carry. Give the rewiring explicit behavior ownership or another task-visible owner; final review alone is too late to discover that gate execution vanished.

- id: PR-010
  dimension: constraint-ownership
  severity: medium
  title: "The plan omits Files to Change and still names pre-amendment artifact paths"
  plan_refs: Design — Stage 1, absent `## Files to Change`
  code_refs: lib/artifacts/plan-conformance.ts:1-47, tests/artifacts/plan-conformance.test.ts:1-12
  description: |
    The required flat `## Files to Change` section is absent. Its substitute in Design still instructs workers to reduce `lib/artifacts/behavior-conformance.ts` and `tests/artifacts/behavior-conformance.test.ts`, but those paths no longer exist; the live implementation is `plan-conformance.ts` in both source and tests. No dated amendment marks the path change.

    This makes implementation ownership both incomplete and stale across an unusually broad plan that also edits skills, prompts, CLI, scripts, fixtures, another active plan, and an external home-directory command. Add the flat ownership list and reconcile already-amended paths before task handoff.

- id: PR-011
  dimension: quality-contract
  severity: low
  title: "Implementation Order still declares a local gate list after D-016 removes plan-declared gates"
  plan_refs: D-016, Implementation Order step 2
  code_refs: domains/shared/skills/work-artifacts/references/gate-contracts.md:1-34, bundled/coding/prompts/quality-manager.md:71-128
  description: |
    Implementation Order step 2 says `Gates: test, lint, typecheck`. D-016 and the shipped gate contract say plans no longer declare gate lists; the Quality Manager discovers project-native correctness evidence and resolves runtime capabilities on each invocation. Keeping a plan-local list preserves the obsolete authority split and can be read as exhaustive.

    Remove the gate declaration or restate only the stage-specific outcome/risk it is meant to protect.

## Missing Coverage

- The Stage 3 design does not define the staged-list data shape, owner lookup across active plans/archives/roadmap, or the component that merges it with provider findings.
- No behavior protects externally consumed `lib/` public entry points during reachability triage and deletion.
- No failure outcome covers reaching Stage 3 with analysis execution consent withheld or revoked.
- The old `test-health-audit` plan's full linked-task disposition and archive/completion transition are unaccounted for.
- The Stage 2 mutation record has no deterministic sample-completeness contract for the tests outside shipped-markdown readers.

## Coverage Ledger

- dimension: interface-fidelity
  status: unchecked
  checked: Internal CLI, plan-lifecycle, artifact-checker, analysis-adapter, and Quality Manager source contracts were checked. A live Fallow probe was not run because the available invocation would load project-controlled `fallow.toml`, execution consent is absent, and no approved sandbox was available; external flags, exit codes, and envelopes therefore remain unchecked.
  findings: PR-004, PR-007

- dimension: duplication
  status: unchecked
  checked: `analysis_duplication` and trace are unbound with `execution-not-consented`; no capability evidence was available for a project-wide duplicate-path check.
  findings: none

- dimension: state-sync
  status: checked
  checked: The proposed staged-owner state and the superseded plan/task lifecycle were compared with `PlanStatus`, archive preconditions, and current active-plan evidence.
  findings: PR-006

- dimension: risk-blast-radius
  status: checked
  checked: Reachability roots were traced against the shipped package surface, current public entry configuration, runtime gate resolution, and consent boundary.
  findings: PR-003, PR-005

- dimension: user-experience
  status: checked
  checked: The `plan check-artifacts` modes/archive fallback and the visible active-plan lifecycle were walked from maintainer/operator entry points.
  findings: PR-006, PR-007

- dimension: behavior-spec
  status: checked
  checked: All ten behaviors were reviewed for observer, shipped entry point, observable result, edge/failure coverage, and consistency with current repository artifacts.
  findings: PR-001, PR-002, PR-008

- dimension: architecture-record
  status: checked
  checked: The plan declares no architecture record; its changes were checked against the existing framework/domain edge visible in package and provider code. No dependency-direction finding relies on unavailable boundary-capability evidence.
  findings: none

- dimension: quality-contract
  status: checked
  checked: D-016, the canonical gate contract, the current Quality Manager procedure, and plan-local quality declarations were compared.
  findings: PR-009, PR-011

- dimension: lifecycle-invariant
  status: checked
  checked: Ratified invariants were attacked against historical fixture writes, retained prose tests, supersession syntax, and active-plan lifecycle exits.
  findings: PR-001, PR-002, PR-006, PR-007

- dimension: constraint-ownership
  status: checked
  checked: Load-bearing decisions and design work were traced to behaviors and file ownership; Quality Manager rewiring and file/path ownership do not survive that trace.
  findings: PR-009, PR-010

- dimension: scope-size
  status: checked
  checked: The plan has 10 behaviors, within the 12-behavior guidance, and exposes stage seams suitable for task units.
  findings: none

## Assessment

The plan is viable only after substantial revision. Resolve the two ratified-ground collisions first (B-005 versus historical fixtures, and D-019 versus INV-003), then redesign Stage 3 around the real public API, consent, and staged-owner gate contracts before any deletion task is created.

# Plan Review: main-domain-and-cosmo-rename

## Findings

- id: PR-001
  dimension: state-sync
  severity: high
  title: "Lead-of-domain session rule still makes main/cosmo and coding/cody share one unscoped history"
  plan_refs: plan.md:95-97, plan.md:391, plan.md:451-455
  code_refs: cli/session.ts:516-525, cli/session.ts:605-612
  description: |
    The revision replaces the literal `def.id === "cosmo"` special-case with a lead-of-domain rule and QC-008 requires both `main/cosmo` and `coding/cody` to use the unscoped session directory. In the current session code, `sessionDir` is `undefined` for the special-cased agent and otherwise `join(piSessionDir(cwd), def.id)`; `undefined` is passed directly into `SessionManager.continueRecent(cwd, sessionDir)`.

    That means every domain lead matching the new rule uses the same default Pi session location for the project. It does not create the "different domains' directories" claimed in D-P2-9, and it preserves the history-bleed risk the plan says it mitigates: old coding/cosmo history, new main/cosmo history, and coding/cody history can all be selected by the same unscoped `continueRecent` path. The planner needs to fix the session-path contract and the QC expectation before task creation.

- id: PR-002
  dimension: interface-fidelity
  severity: medium
  title: "Cosmo workflow migration error is assigned to chain-parser, but unknown roles are rejected in chain-runner"
  plan_refs: plan.md:113-115, plan.md:145, plan.md:379, plan.md:392, plan.md:457-461, plan.md:483
  code_refs: lib/orchestration/chain-parser.ts:59-66, lib/orchestration/chain-parser.ts:225-260, lib/orchestration/chain-runner.ts:635-650, tests/orchestration/chain-runner.test.ts:180, tests/orchestration/chain-runner.test.ts:1418
  description: |
    The plan says to edit `lib/orchestration/chain-parser.ts` and extend `tests/orchestration/chain-parser.test.ts` so chain `"cosmo -> ..."` raises the migration-hint error. Today the parser does not reject unknown stages; it only calls `registry.get(... )?.loop ?? false` and returns `ChainStep[]`. The actual unknown-role error is emitted later by `prepareStageExecution()` in `lib/orchestration/chain-runner.ts`, with the current format `Unknown agent role "${stage.name}"`.

    Implementing the plan literally in the parser either will not affect configured workflows that fail in `runChain()`, or will change parser semantics broadly. The test path is also wrong for the current behavior. The migration diagnostic needs to be specified against the component that actually rejects unknown roles, including the exact quote/message format expected by existing chain-runner tests.

- id: PR-003
  dimension: interface-fidelity
  severity: medium
  title: "Cody is described as Cosmo's delegation target but is omitted from Cosmo's spawn allowlist"
  plan_refs: plan.md:197-208, plan.md:221-225, plan.md:308-310
  code_refs: domains/shared/extensions/orchestration/authorization.ts:7-20, domains/shared/extensions/orchestration/spawn-tool.ts:487-520
  description: |
    The planned `coding/cody` description says it is "the agent the executive cosmo delegates to for coding tasks," but `main/cosmo.subagents` deliberately omits `coding/cody`. Spawn authorization is allowlist-based: `isSubagentAllowed()` only accepts an unqualified target id or `${targetDef.domain}/${targetDef.id}` listed in the caller definition, and `spawn-tool.ts` denies the spawn when that check fails.

    As written, any prompt or user flow where main/cosmo delegates to the coding-domain lead will fail with `spawn_agent denied`. The plan simultaneously says main/cosmo delegates directly to specialists, so the intended contract is contradictory. The planner should make the delegation story and allowlist match.

- id: PR-004
  dimension: risk-blast-radius
  severity: medium
  title: "Existing installed coding-minimal packages are still loaded and can reintroduce coding/cosmo"
  plan_refs: plan.md:25, plan.md:71-75, plan.md:398-400, plan.md:445-449
  code_refs: lib/packages/scanner.ts:70-91, lib/packages/scanner.ts:136-158, lib/domains/loader.ts:155-194, lib/domains/loader.ts:217-235, lib/agents/resolver.ts:90-99, bundled/coding-minimal/coding/domain.ts:4-9, bundled/coding-minimal/coding/agents/cosmo.ts:3-4
  description: |
    The plan deletes the bundled `coding-minimal/` directory and catalog entry, but its risk text says existing installations remain on disk until the user removes the package. The scanner still loads global and project installed packages, and the loader merges domains by ID with higher-precedence incoming domains winning manifest/lead and adding agents. The existing `coding-minimal` package declares domain id `coding` and agent id `cosmo`.

    In a project or user environment with coding-minimal already installed, runtime can still contain `coding/cosmo` alongside `main/cosmo` (and possibly set the merged coding manifest lead back to `cosmo`). Unqualified `resolve("cosmo")` returns undefined when multiple domains match. This undercuts the stated resolver-collision fix and can make `-d coding` default to the old minimal lead rather than `coding/cody`. The plan needs an explicit migration/ignore/remove path for already-installed coding-minimal packages, not only bundled catalog deletion.

- id: PR-005
  dimension: quality-contract
  severity: medium
  title: "Planned slash-qualified cody subagents will fail the existing coding-agent invariant test"
  plan_refs: plan.md:238-241, plan.md:384-394, plan.md:486-487
  code_refs: bundled/coding/coding/agents/cosmo.ts:23-45, tests/domains/coding-agents.test.ts:75-83, lib/domains/validator.ts:105-112, domains/shared/extensions/orchestration/authorization.ts:12-18
  description: |
    The cody sketch says to keep the prior cosmo subagents but "now in slash-qualified form within the coding domain." The runtime validator and spawn authorization can handle slash-qualified IDs, but `tests/domains/coding-agents.test.ts` currently asserts every coding-domain subagent string is directly present in the set of unqualified coding agent ids. `coding/planner` will not satisfy `allIds.has(sub)`.

    The plan does not list this existing invariant test for migration. Either cody should keep the existing unqualified within-domain subagent IDs, or the test contract must be updated to recognize qualified IDs. Otherwise the full verification gate will fail even though the runtime accepts the definitions.

- id: PR-006
  dimension: risk-blast-radius
  severity: medium
  title: "main/cosmo receives edit/write/bash despite being defined as non-coding orchestrator"
  plan_refs: plan.md:83-87, plan.md:192-195, plan.md:291-319
  code_refs: lib/agents/types.ts:12, lib/orchestration/definition-resolution.ts:17-28, lib/orchestration/definition-resolution.ts:36-50
  description: |
    The revised plan removes `engineering-discipline` from main/cosmo because it "does not write code," and the persona sketch says "You are not a coding agent." The agent definition still sets `tools: "coding"`, which `resolveTools()` expands to `read`, `bash`, `edit`, and `write`.

    This is not required for orchestration tools: `buildToolAllowlist()` unions extension-registered tools into the allowlist, so an agent with `tools: "none"` plus `tasks`, `plans`, `orchestration`, `todo`, etc. extensions can still receive those extension tools. Granting filesystem mutation tools to the top-level assistant expands blast radius and contradicts the stated delegation-only role unless the plan explicitly intends direct edits and updates the persona/risk model accordingly.

- id: PR-007
  dimension: quality-contract
  severity: low
  title: "QC-006 grep does not verify the rename audit promised by the risk section"
  plan_refs: plan.md:400, plan.md:439-443, plan.md:486
  code_refs: cli/session.ts:516-525, lib/orchestration/chain-runner.ts:641-650, tests/prompts/cosmo.test.ts:4-9
  description: |
    The hardcoded-`cosmo` risk says the audit spans `cli/`, `lib/`, `bundled/coding/`, `tests/`, and `domains/`, but QC-006 only greps double-quoted `"cosmo"` in `cli/main.ts`. It would not catch the existing `cli/session.ts` literal, stale prompt tests importing `prompts/cosmo.md`, chain-runner diagnostics, single-quoted strings, or any bundled coding references outside `cli/main.ts`.

    Other QCs cover some specific cases, but QC-006 is presented as the mechanical rename guard. Its command should match the stated audit scope or the quality contract should stop claiming it catches leftover hardcoded rename stragglers.

## Missing Coverage

- Prior F-001, F-002, F-004, F-005, F-006, and F-007 are substantively addressed in the revised plan: main/cosmo no longer lists `engineering-discipline`; main/cosmo examples use slash-qualified IDs; all three `cli/main.ts` default-agent sites are named; cody prompt/test migration is in scope; `hasInstalledDomain` excludes `shared` and `main`; the coding envelope is listed as a Plan 2 file.
- Prior F-003 is only partially addressed: bundled retirement is in scope, but already-installed `coding-minimal` packages remain loadable and can still create the `coding/cosmo` collision.
- Prior F-008 is conceptually addressed, but the plan targets the wrong chain component/test layer for the actual unknown-role error.
- The Plan 2 fleet prompt/skill contract does not spell out the exact `run_driver` call shape from Plan 1, especially the required `envelopePath` and `watch_events({ planSlug, runId })`. The dependency edge to `bundled/coding/coding/drivers/templates/envelope.md` is named, but the invocation contract workers must encode in the fleet skill remains implicit.
- No test is listed for environments with a pre-existing globally or locally installed `coding-minimal` package, even though the risk section explicitly says those installations remain on disk.

## Assessment

The revised plan is much closer, but it still needs revision before tasks. The most important issue is the session persistence contract: the proposed lead-of-domain rule makes the two lead agents share the same unscoped history, which is exactly the state-sync failure the plan is trying to avoid.

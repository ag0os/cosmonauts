# Plan Review: coding-agnostic-framework

## Findings

- id: PR-001
  dimension: user-experience
  severity: high
  title: "Shared+main-only CLI is still blocked by the no-domain guard"
  plan_refs: plan.md:27-30, plan.md:34-38, plan.md:407-411
  code_refs: cli/main.ts:295-317, cli/main.ts:468-475, tests/cli/no-domain-guard.test.ts:34-45
  description: |
    The plan makes `main` the framework default and says Wave 1 leaves the core bundle as framework + `shared` + `main`, with no framework requirement that `coding` exist. The Wave-1 spec also says a shared+main-only project should be coherent. But the current CLI explicitly treats `shared` + `main` as "no domain installed": `hasInstalledDomain()` returns true only for domains outside `shared`/`main`, `selectRunMode()` routes normal interactive/print runs to `no-domain-guard`, and the guard tells users to install `coding`.

    This is not covered by the default-domain helper or any listed implementation step. If workers follow the plan, a coding-less framework will still refuse ordinary CLI use even though `main/cosmo` is present, directly contradicting the Wave-1 user experience and architecture. The planner should add this hardcoded-coding/default-domain site to Wave 1 or explicitly justify why shared+main-only interactive use remains blocked.

- id: PR-002
  dimension: behavior-spec
  severity: medium
  title: "Bucket B migration omits current bundled-coding test dependencies named by Wave-2 context"
  plan_refs: plan.md:202-220, plan.md:312-315, plan.md:419-427
  code_refs: missions/plans/coding-extraction/spec.md:218-229, tests/cli/packages/subcommand.test.ts:79-84, tests/cli/packages/subcommand.test.ts:147-155, tests/cli/export/subcommand.test.ts:117-128, tests/cli/export/subcommand.test.ts:222-230, tests/cli/skills/subcommand.test.ts:163-170, tests/cli/skills/subcommand.test.ts:186-194, tests/cli/update/subcommand.test.ts:124-132, tests/packages/catalog.test.ts:49-55
  description: |
    The Wave-2 Test Decoupling section classifies package/catalog and CLI export/packages/skills/update tests as Bucket B framework tests to adjust in Wave 1. The current code still has `./bundled/coding` or `/framework/bundled/coding` expectations in those files. The plan's explicit Bucket B migration list, implementation order, and Files to Change include `scanner`, `main-domain`, `dump-prompt`, `loader`, `agent-spawner`, `scaffold`, and `agents/skills`, but not `tests/cli/packages/subcommand.test.ts`, `tests/cli/export/subcommand.test.ts`, `tests/cli/skills/subcommand.test.ts`, `tests/cli/update/subcommand.test.ts`, or `tests/packages/catalog.test.ts`.

    The plan does require a fresh ledger, but independent workers assigned the Bucket B task could reasonably follow the enumerated list and leave these existing bundled-coding dependencies classified as Keep. That would fail the Wave-2 precondition that Buckets B/C are already neutralized before physical extraction. The planner should reconcile these files in the ledger contract and implementation order, including which are true Wave-2 catalog-source keeps versus Wave-1 fixture migrations.

- id: PR-003
  dimension: risk-blast-radius
  severity: medium
  title: "Deleting the old Drive envelope path can break explicit envelope users"
  plan_refs: plan.md:274-293, plan.md:345-346, plan.md:434-436
  code_refs: cli/drive/subcommand.ts:986-995, domains/shared/extensions/orchestration/driver-tool.ts:394-403, domains/shared/skills/drive/SKILL.md:49-52
  description: |
    The plan says to move the envelope and remove `bundled/coding/drivers/templates/envelope.md`. Current CLI Drive and `run_driver` both honor an explicit `--envelope` / `envelopePath` by resolving the caller-provided path directly; if a project or dogfood prompt passes the current bundled path explicitly, that path works today only because the file exists. Removing the file changes that explicit-drive behavior, while the plan's existing-coding verification only covers omitted-envelope default behavior.

    The current `/skill:drive` text also describes the bundled envelope path as the default users should omit rather than pass, so this may be an acceptable compatibility break. But it conflicts with the plan's "explicit coding flows remain unchanged" claim unless the old explicit path is either preserved as a compatibility alias for Wave 1 or explicitly accepted as a break with a targeted failure/update test.

- id: PR-004
  dimension: behavior-spec
  severity: medium
  title: "Dogfood Drive behavior does not specify observable proof of coding-worker resolution"
  plan_refs: plan.md:232-240, plan.md:434-436
  code_refs: lib/runtime.ts:176-181, lib/driver/backends/cosmonauts-subagent.ts:33-50, domains/shared/extensions/orchestration/driver-tool.ts:341-346
  description: |
    B-020 says a dogfood Drive smoke must prove the run resolves intended `coding/*` workers after the default flips to `main`, but it does not specify the exact command, backend, plan/tasks, or what artifact proves the worker domain. In the current code, Drive's cosmonauts-subagent backend defaults the spawned role to unqualified `worker` and passes through `runtime.domainContext`, while `runtime.domainContext` is only the CLI/project configured domain, not the new default-domain helper. The run spec records task IDs and backend, not the resolved agent identity.

    A worker could satisfy the written behavior by recording a run id and envelope path without proving that the spawned agent was `coding/worker` rather than an unqualified/ambiguous role. The planner should make B-020 authorable directly: name the command/backend and the required evidence field or transcript/event assertion that demonstrates the resolved worker qualified ID.

## Missing Coverage

- The no-domain guard and init guard still hardcode `coding` as the path forward when only `shared` + `main` are present.
- The Bucket B/C ledger needs an explicit reconciliation for every current `grep -rl coding tests/` match, especially package/CLI tests that Wave-2 context names as Bucket B but the plan list omits.
- Explicit old Drive envelope paths are not covered, only omitted-envelope default behavior.
- Dogfood Drive evidence does not define a concrete, inspectable proof that workers resolved under the `coding` domain.

## Assessment

The plan is viable with revisions, but it is not ready for task creation. The most important fix is the no-domain guard: without changing or deliberately re-scoping that path, the framework will still not run coherently as a shared+main-only installation after Wave 1.

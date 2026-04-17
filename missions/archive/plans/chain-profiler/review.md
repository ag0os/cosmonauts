# Plan Review: chain-profiler

## Findings

- id: PR-001
  dimension: duplication
  severity: medium
  title: "Plan duplicates plan-slug and session-path resolution that already exists"
  plan_refs: plan.md:22-33, plan.md:93-99, plan.md:174-177
  code_refs: lib/orchestration/types.ts:129-132, lib/orchestration/chain-runner.ts:80-93, lib/sessions/session-store.ts:130-138, lib/plans/archive.ts:112-120
  description: |
    The plan places output-location logic in the new `lib/orchestration/chain-profiler.ts` module while also constraining that module to import only `lib/orchestration/types.ts` and `node:*`. The codebase already has two authoritative integration points for this concern: `ChainConfig` already carries both `completionLabel` and `planSlug`, and `chain-runner` already resolves/validates the effective plan slug with `derivePlanSlug()` / `resolvePlanSlug()` before session artifacts are written.

    Session artifact paths are also already centralized in `sessionsDirForPlan()` and `archivePlan()` depends on that exact layout when moving `missions/sessions/<slug>` into `missions/archive/sessions/<slug>`. As written, the plan forces the profiler path logic to be reimplemented instead of reused. That creates a drift risk between where profiling files are written and where the rest of the session/archive pipeline expects plan-scoped artifacts to live. The planner should resolve this boundary explicitly instead of baking a second path/slug derivation path into the profiler design.

- id: PR-002
  dimension: risk-blast-radius
  severity: medium
  title: "`missions/profiles/` fallback sits outside the existing work lifecycle and archive flow"
  plan_refs: plan.md:93-99, plan.md:146-149, plan.md:159-160
  code_refs: cli/main.ts:393-411, tests/cli/main.test.ts:61-64, AGENTS.md:151-162, lib/plans/archive.ts:112-120
  description: |
    The plan says profiler output should go to `missions/sessions/<planSlug>/` when a plan slug is available, otherwise to a new `missions/profiles/` directory. In the current CLI flow, `--workflow` runs do not inherently provide a plan slug; `runChain()` is called with `completionLabel: options.completionLabel`, and nothing in `cli/main.ts` derives or supplies `planSlug` unless the caller explicitly passed a completion label. The tests also cover ordinary `--workflow plan-and-build` usage without any completion label.

    That means the fallback directory is not an edge case; it will be the common path for many profiled workflow runs. But the documented lifecycle only recognizes `missions/plans`, `missions/tasks`, `missions/sessions`, `missions/archive`, and `memory`, and `archivePlan()` only moves `missions/sessions/<slug>`. Files written to `missions/profiles/` will not travel with plan archival and will sit outside the documented artifact model. The planner should account for how these files are retained, discovered, and archived.

- id: PR-003
  dimension: quality-contract
  severity: medium
  title: "Quality contract does not cover the parallel/fan-out behavior the summary promises"
  plan_refs: plan.md:100-105, plan.md:134-142, plan.md:164-190
  code_refs: lib/orchestration/chain-parser.ts:143-170, lib/orchestration/chain-runner.ts:411-420, tests/cli/main.test.ts:360-394
  description: |
    The plan promises a summary section for "parallel group visibility (which stages overlapped, wall-clock vs sum)", but none of the quality criteria verify parallel groups or fan-out at all. That is the non-trivial part of this feature: the DSL explicitly supports `reviewer[n]` fan-out, which produces multiple identical `ChainStage` objects, and `runParallelGroup()` emits `stage_start` for each member with the same `stepIndex`.

    Because parallel members can share the same role name and do not get a dedicated member identifier at the `stage_start`/`stage_end` boundary, overlap accounting is easy to get subtly wrong. The current QC set only checks tool pairing, orphan tools, file existence, and JSONL shape. It never exercises the parallel paths that motivate summary section 3. The planner should add explicit acceptance criteria and runnable verification for bracket groups/fan-out before this plan is implementation-ready.

- id: PR-004
  dimension: user-experience
  severity: low
  title: "Plan refers to a `--chain` path that the current CLI does not expose"
  plan_refs: plan.md:147
  code_refs: cli/main.ts:393-414, tests/cli/main.test.ts:360-394
  description: |
    The file-change section says to wire profiling into both the `--workflow` path and any `--chain`-style invocations that go through the same `runChain` call. The current CLI surface does not have a separate `--chain` flag; raw chain DSL, bracket groups, and fan-out all route through `--workflow` values and are parsed by `resolveWorkflowExpression()` / `parseChain()`.

    This is a documentation/scope issue, not a functional blocker, but workers following the plan literally will look for a second CLI entry point that does not exist. The planner should tighten this wording so implementation tasks target the real CLI surface.

## Missing Coverage

- Cancellation/interruption behavior: the plan does not say whether a partially collected profile must still be flushed if a workflow is aborted before normal completion.
- Archive/discoverability for non-plan workflow runs: there is no coverage for how users find or clean up profiles written outside `missions/sessions/<slug>`.
- Fan-out cases with repeated role names: the plan does not specify how the profiler distinguishes or reports multiple parallel stages with the same `stage.name`.
- Boundary reuse: there is no explicit requirement to reuse the existing `planSlug`/session-directory helpers instead of re-deriving those values.

## Assessment

The feature is viable, but the storage boundary needs revision before task creation. Fix the plan-slug/session-path story first so profiler artifacts land in the same lifecycle/archive path as the rest of the plan-scoped session data.

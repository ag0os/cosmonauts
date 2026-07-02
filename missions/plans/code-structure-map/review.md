# Plan Review: code-structure-map

## Findings

- id: PR-001
  dimension: behavior-spec
  severity: medium
  title: "Shared map contracts leave cross-module data shapes undefined"
  plan_refs: missions/plans/code-structure-map/plan.md:279-310, missions/plans/code-structure-map/plan.md:313-331, missions/plans/code-structure-map/plan.md:396-400
  code_refs: domains/shared/skills/work-artifacts/references/plan-format.md:44-47
  description: |
    The plan declares `SourceAnalyzer`, `ModuleSkeleton`, `ModuleRecord`, `ArchitectureMapIndex`, and `NarrativeProvider`, but those contracts reference undefined shared types: `SourceFileSnapshot`, `AnalysisInput`, `AnalysisResult`, `PublicExport`, `ModuleDependency`, `ModuleDependent`, `ModuleNarrative`, `NarrativeInput`, and `GeneratedNarrative`. It also says the CLI runs `generateArchitectureMap` and prints `written`/`unchanged`/`unsupported`/`failure` status, but does not define the generator function signature or result union that the CLI, tests, and store must agree on.

    These are cross-task seams: analyzer, generator, renderer/store, CLI, extension, and viewer work will all need the same field names and result variants. The artifact contract expects design to trace behavior seams into implementable units; here the seams are named but the data contracts are not complete enough for independent workers to implement without inventing incompatible shapes. The planner should add the missing type definitions and the `generateArchitectureMap` input/result contract before tasking.

- id: PR-002
  dimension: quality-contract
  severity: low
  title: "New public lib entry points are not reflected in the dead-code public-entry configuration"
  plan_refs: missions/plans/code-structure-map/plan.md:473, missions/plans/code-structure-map/plan.md:489, missions/plans/code-structure-map/plan.md:529, missions/plans/code-structure-map/plan.md:535
  code_refs: fallow.toml:1-20
  description: |
    `fallow.toml` documents that Cosmonauts publishes TypeScript source and treats listed stable module entry points as public API. The plan creates `lib/architecture-map/index.ts` and `lib/artifact-viewer/index.ts` as public export surfaces, and the Quality Contract names dead-code/duplication review, but the Files to Change do not include `fallow.toml`.

    If these new index files are intended as stable deep-import entry points, they should be added to the `entry` list so public exports are not treated as internal unused code by the detected analysis tooling. If they are only internal composition files, the plan should say so and ensure production code imports them so they are reachable.

## Missing Coverage

- The `cosmonauts arch` alias is in the design, but no behavior explicitly names the alias path; add coverage or state that `tests/cli/main.test.ts` owns it outside the behavior spine.
- The plan names `TaskManager.listTasksReadOnly()` but does not give its exact signature (`filter?: TaskListFilter` vs. caller-side filtering), which should be fixed with the shared contract work in PR-001.

## Assessment

The plan is viable with revisions. The most important fix is to make the architecture-map and generator contracts explicit enough that analyzer/generator/CLI/viewer tasks cannot invent incompatible result and record shapes.

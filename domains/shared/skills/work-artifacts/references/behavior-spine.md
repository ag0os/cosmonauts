# Behavior Spine

The behavior spine connects user intent to executable proof: user intent, acceptance criterion, behavior, test plus seam, then code.

## IDs

- Specs use `AC-###` for planned-work acceptance criteria.
- Plans use `B-###` for behavior entries.
- Each behavior maps to one test intent. A task may own several behaviors, but behavior granularity stays close to the test.

## Behavior Entry

Each `B-###` includes:

- Source `AC-###`
- Context
- Action
- Expected result
- Seam
- Test
- Marker

Marker format:

```text
@cosmo-behavior plan:<slug>#B-###
```

Example:

```md
### B-003 - Plans reject behaviors without tests

- Source: AC-004
- Context: a planner is preparing a plan for task creation
- Action: a behavior has no named test
- Expected: the plan is not ready and the missing test is explicit
- Seam: `/skill:plan` readiness check
- Test: `tests/prompts/plan-skill.test.ts` > `flags behaviors without test references`
- Marker: `@cosmo-behavior plan:artifact-format-redesign#B-003`
```

## Test Marker

The corresponding test carries the marker near the executable `it()` or `test()` block as a plain comment. The marker is language-agnostic and grepable; it is not a framework API.

## Mechanical Artifact Conformance

Current mechanical artifact-conformance checks are intentionally narrow. They validate that the `## Behaviors` section has parseable `### B-###` entries, required behavior fields (`Source`, `Context`, `Action`, `Expected`, `Seam`, `Test`, and `Marker`), a project-root-relative `Test` file path that exists and resolves inside the project root, an exact `Marker` value for the plan slug and behavior ID, and exact marker text anywhere in the referenced test or evidence file.

The v1 mechanical scope preserves these exclusions: checks do not parse test ASTs, do not check marker proximity to the named test, do not create concrete gate bindings, do not run a Quality Contract runner, do not enforce broad workflow-tier rules, and do not migrate legacy plans.

Older plans missing current behavior-spine fields may fail until migrated separately.

## Durable Home

A behavior's durable home is the test layer. The plan's `## Behaviors` section is a working view for active planning. Archiving a plan does not lose the behavior because the marker stays coupled to the test.

## Direct Fix Exception

Direct fixes and tiny unplanned patches use a regression test as the behavior record. They do not need `B-###` IDs or markers unless they become part of a plan.

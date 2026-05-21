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

## Durable Home

A behavior's durable home is the test layer. The plan's `## Behaviors` section is a working view for active planning. Archiving a plan does not lose the behavior because the marker stays coupled to the test.

## Direct Fix Exception

Direct fixes and tiny unplanned patches use a regression test as the behavior record. They do not need `B-###` IDs or markers unless they become part of a plan.

# Gate Contracts

Quality gates are decided by what the project can run, not declared per plan. A plan does not carry a gate table. The agent that signs off a change resolves every gate kind the project has a runtime capability for, on every run, and reports the outcome.

## Gate Kinds

1. `correctness`
2. `mutation`
3. `duplication`
4. `complexity`
5. `boundary-conformance`
6. `dead-code`

`correctness` is universal: every project has native correctness evidence — its tests, type or schema validation, and style checks — discovered from project artifacts. The others are bindable: they need a project-specific binding before they can be enforced mechanically.

## Binding State

Binding is a fact about the running project, established at run time. It is never written into a plan.

- `bound` means the project has an enforcement path for the gate kind.
- `unbound` means the project does not yet have one.
- `failed` means an attempted binding could not establish a usable enforcement path.

## Resolution Outcomes

- **Bound and completed.** Evaluate the actual verdict asserted by the completed gate result. Never fabricate a verdict.
- **Genuinely unbound.** Record a degraded state: the gate is not enforced and requires reviewer judgment. This is never a silent pass and never a hard failure.
- **Failed binding or invocation.** Record `failed-to-run`. This outcome is blocking, never a pass, and never a silent degradation to the unbound state.
- **Unsupported metric.** When a requested metric returns `unsupported-metric`, degrade only that unavailable metric. Never treat an unsupported metric as zero; other supported metrics and gates retain their own resolution.

## What a Plan May Say About Quality

A plan states quality expectations that are specific to its work — a threshold that must hold, a boundary that must not be crossed — as behaviors, or in `## Risks` when they are conditions rather than outcomes. It does not list the project's gates, predict their binding state, or name tools and commands. Those bindings belong to project configuration.

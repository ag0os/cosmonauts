# Gate Contracts

A Quality Contract is an ordered abstract gate ladder. It references gate kinds, tiers, binding states, thresholds, and a protocol slot without naming concrete project tools.

## Gate Kinds

Use these gate kinds in ladder order when they apply:

1. `correctness`
2. `mutation`
3. `duplication`
4. `complexity`
5. `boundary-conformance`
6. `dead-code`

## Gate Fields

Each row carries:

- `Order` - the run order of the ladder rung.
- `Gate kind` - one of the abstract kinds above.
- `Tier` - `universal` or `bindable`.
- `Binding state` - `bound`, `unbound`, or `failed`.
- `Threshold` - the pass condition, if known.
- `Protocol` - a placeholder protocol slot for the future enforcement design.
- `Degradation / notes` - what happens when the gate cannot be enforced.

## Tiers

- `universal` gates apply in every project because they use project-native correctness evidence.
- `bindable` gates need a project-specific binding before they can be enforced mechanically.

## Binding State

- `bound` means the project has an enforcement path for the gate kind.
- `unbound` means the project does not yet have an enforcement path for the gate kind.
- `failed` means an attempted binding could not establish a usable enforcement path.

An unbound bindable gate records an explicit degraded state. It is never a silent pass and never a hard failure in the generic artifact contract. The run should say the gate is unbound, not enforced, and subject to reviewer judgment until binding exists.

## Resolution Outcomes

Runtime binding and result evidence resolve each bindable gate without rewriting its declared ladder row:

- **Bound and completed.** When the binding is `bound` and the invocation completes, evaluate the actual verdict asserted by the completed gate result. Never fabricate a verdict.
- **Genuinely unbound.** When the binding is `unbound`, record a degraded state: the gate is not enforced and requires reviewer judgment.
- **Failed binding or invocation.** When the binding is `failed`, or a bound invocation cannot complete, record `failed-to-run`. This outcome is blocking, never a pass, and never a silent degradation to the unbound state.
- **Unsupported metric.** When a requested metric returns `unsupported-metric`, degrade only that unavailable metric. Never treat an unsupported metric as zero; other supported metrics and gate rungs retain their own resolution.

## Ladder Shape

Use this abstract table shape:

| Order | Gate kind | Tier | Binding state | Threshold | Protocol | Degradation / notes |
|---:|---|---|---|---|---|---|
| 1 | `correctness` | universal | bound | project-native correctness evidence passes | project-discovered | hard fail |
| 2 | `mutation` | bindable | unbound | project-specific | pending | unbound, not enforced; reviewer judgment required |

Generic artifact references must not include columns for concrete tool names or runnable commands. Those bindings belong to project configuration and follow-up enforcement work.

# Gate Contracts

A Quality Contract is an ordered abstract gate ladder. It references gate kinds, tiers, binding states, thresholds, and a protocol slot without naming concrete project tools.

## Gate Kinds

Use these gate kinds in ladder order when they apply:

1. `correctness`
2. `artifact-conformance`
3. `mutation`
4. `duplication`
5. `complexity`
6. `boundary-conformance`
7. `dead-code`

## Gate Fields

Each row carries:

- `Order` - the run order of the ladder rung.
- `Gate kind` - one of the abstract kinds above.
- `Tier` - `universal` or `bindable`.
- `Binding state` - `bound` or `unbound`.
- `Threshold` - the pass condition, if known.
- `Protocol` - a placeholder protocol slot for the future enforcement design.
- `Degradation / notes` - what happens when the gate cannot be enforced.

## Tiers

- `universal` gates apply in every project because they use project-native correctness evidence or Cosmonauts artifact evidence.
- `bindable` gates need a project-specific binding before they can be enforced mechanically.

## Binding State

- `bound` means the project has an enforcement path for the gate kind.
- `unbound` means the project does not yet have an enforcement path for the gate kind.

An unbound bindable gate records an explicit degraded state. It is never a silent pass and never a hard failure in the generic artifact contract. The run should say the gate is unbound, not enforced, and subject to reviewer judgment until binding exists.

## Ladder Shape

Use this abstract table shape:

| Order | Gate kind | Tier | Binding state | Threshold | Degradation / notes |
|---:|---|---|---|---|---|
| 1 | `correctness` | universal | bound | project-native correctness evidence passes | hard fail |
| 2 | `artifact-conformance` | universal | bound | planned behaviors name tests and markers | hard fail once enforcement exists |
| 3 | `mutation` | bindable | unbound | project-specific | unbound, not enforced; reviewer judgment required |

Generic artifact references must not include columns for concrete tool names or runnable commands. Those bindings belong to project configuration and follow-up enforcement work.

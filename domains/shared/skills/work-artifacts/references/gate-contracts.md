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

## Artifact-Conformance Scope

`artifact-conformance` is bound for the behavior-spine mechanical checks defined in `behavior-spine.md`: required behavior fields, root-relative test files, and exact marker presence in referenced files. This does not make generic artifact references a concrete command contract: they still must not name project tools, runnable commands, or project-specific bindings.

The v1 scope also preserves explicit exclusions: generic gate contracts do not parse test ASTs, do not check marker proximity, do not create concrete gate bindings, do not run a Quality Contract runner, do not enforce broad workflow-tier rules, and do not migrate legacy plans.

## Ladder Shape

Use this abstract table shape:

| Order | Gate kind | Tier | Binding state | Threshold | Protocol | Degradation / notes |
|---:|---|---|---|---|---|---|
| 1 | `correctness` | universal | bound | project-native correctness evidence passes | project-discovered | hard fail |
| 2 | `artifact-conformance` | universal | bound | behavior-spine mechanical checks pass | artifact evidence | hard fail |
| 3 | `mutation` | bindable | unbound | project-specific | pending | unbound, not enforced; reviewer judgment required |

Generic artifact references must not include columns for concrete tool names or runnable commands. Those bindings belong to project configuration and follow-up enforcement work.

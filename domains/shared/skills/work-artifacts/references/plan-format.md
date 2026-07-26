# Plan Format

`plan.md` is the technical document for planned feature/refactor work and task-producing work. It is a behavior-first `plan.md`: behaviors are placed and tested before design prose is finalized.

## Required Sections

Use this order for a full planned feature/refactor plan:

- `## Overview`
- `## Architecture Context` when the plan depends on a durable architecture record; name the relevant decisions and boundary rules
- `## Decision Log`
- `## Behaviors`
- `## Design`
- `## Files to Change`
- `## Risks`
- `## Quality Contract`
- `## Implementation Order`

## Decision Log

Every full plan has `## Decision Log`. Entries record meaningful choices —
planner trade-offs, human directions, and amendments made while implementing.

Use this shape:

```md
- **D-001 - Decision title**
  - Decision: the chosen rule or direction
  - Alternatives: meaningful options rejected, one line each
  - Why: the reason, naming the spec invariant or goal it serves
  - Decided by: provenance — for example `human, <date>` or `planner-proposed`
  - Supersedes: the exact ground replaced (amendments only)
```

Mutability follows from `Decided by:` provenance: entries decided by the
human are ratified (stop-and-ask); entries proposed by an agent are derived
(amend-on-record); entries with no provenance are treated as ratified. An
explicit `(ratified)` / `(derived)` marker on the title overrides the
default; write it only when overriding. The full mutability rules, the
deviation classifier, and amendment mechanics live in
`deviation-protocol.md`.

Plans cite spec invariants by `INV-###` ID and do not restate intent; the
spec owns it. A plan with no spec carries the spec-format `## Intent`
section itself and is then the single source.

## Behaviors

Every full plan has `## Behaviors`. Each behavior uses a stable `B-###` ID and includes:

- Source `AC-###`
- Context
- Action
- Expected result
- Seam
- Test
- Marker

Use this shape:

```md
### B-001 - Short behavior name

- Source: AC-001
- Context: ...
- Action: ...
- Expected: ...
- Seam: `path/or/skill/section`
- Test: `tests/path/file.test.ts` > `test name`
- Marker: `@cosmo-behavior plan:<slug>#B-001`
```

## Design

`## Design` is derived from behavior placement. If the design cannot trace to behavior seams, source criteria, and named tests, rewrite the behaviors or the design until the relationship is explicit.

## Files to Change

Keep `## Files to Change` as a flat list. Do not hide implementation ownership inside nested diagrams or prose.

## Quality Contract

Use an ordered abstract gate ladder after risks and before implementation order:

| Order | Gate kind | Tier | Binding state | Threshold | Protocol | Degradation / notes |
|---:|---|---|---|---|---|---|
| 1 | `correctness` | universal | bound | Project-native correctness checks pass | project-discovered | hard fail |
| 2 | `artifact-conformance` | universal | bound | behavior-spine mechanical checks pass | artifact evidence | hard fail |
| 3 | `mutation` | bindable | bound/unbound | project-specific | pending or project-discovered | explicit degraded state when unbound |

For `artifact-conformance`, "mechanical checks" means required behavior fields, root-relative test files, and exact marker presence as defined in `behavior-spine.md`.

Generic plan formats must not add tool-name or command columns. Project-specific bindings and execution protocols are deferred outside this shared artifact contract.

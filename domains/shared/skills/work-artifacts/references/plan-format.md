# Plan Format

`plan.md` is the technical document for planned feature/refactor work and task-producing work. It is a behavior-first `plan.md`: what must be observably true is settled before design prose is finalized.

## Required Sections

Use this order for a full planned feature/refactor plan:

- `## Overview`
- `## Architecture Context` when the plan depends on a durable architecture record; name the relevant decisions and boundary rules
- `## Decision Log`
- `## Behaviors`
- `## Design`
- `## Files to Change`
- `## Risks`
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

Every full plan has `## Behaviors`. Each behavior uses a stable `B-###` ID and states:

- Source — the `AC-###` it delivers; in a plan with no spec, the `INV-###` it serves
- Observer
- Entry point
- Outcome

Use this shape:

```md
### B-001 - Short behavior name

- Source: AC-001
- Observer: who or what notices
- Entry point: the shipped command, tool, event, or artifact they use
- Outcome: what they observe, including failure and edge cases
```

"Shipped" means reachable by someone outside the codebase: a registered command or tool, a subscribed event, a file a documented process reads. An exported function is not an entry point. Behaviors do not name source files, functions, test files, or test titles. See `behavior-spine.md` for the full rule and the reason.

## Design

`## Design` explains the structure that will deliver the behaviors: module boundaries, dependency direction, contracts between independently built parts. It is guidance written before the code exists. The implementer may revise it under the deviation protocol; the behaviors and the spec's intent are what must hold.

## Files to Change

Keep `## Files to Change` as a flat list. Do not hide implementation ownership inside nested diagrams or prose.

## Quality

A plan does not declare quality gates. Which gates run is decided by what the project can run, resolved at sign-off; see `gate-contracts.md`. State a quality expectation specific to this work as a behavior, or as a condition in `## Risks`.

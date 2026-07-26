# Spec Format

`spec.md` is the product document: what is being built, who benefits, why it matters, and how the experience should behave. It is required for planned feature/refactor work and optional for bugfix/patch work.

## Required Sections

Use these sections for planned feature/refactor specs:

- `## Purpose`
- `## Intent`
- `## Users`
- `## User Experience`
- `## Acceptance Criteria`
- `## Scope`
- `## Assumptions`
- `## Open Questions`

## Intent

`## Intent` separates load-bearing intent from narrative; `## Purpose` stays narrative. Shape:

```md
## Intent

Goal: <one sentence — what must remain true no matter how the implementation changes>

Invariants — mechanism yields to these:

- INV-001 - The invariant that outranks any specific mechanism.
- INV-002 - Another invariant.
```

Rules:

- One goal sentence plus `INV-###` invariants that outrank any mechanism in
  the plan and tasks derived from this spec.
- Invariants are ratified ground: changing one is always a human decision.
- Keep the list short (3-7). An invariant earns its place only when a
  mechanism elsewhere could plausibly collide with it; otherwise it is
  Purpose prose.
- Where two invariants can conflict, state the ranking — say which one wins.
- When a mechanism collides with intent during implementation, the resolution
  follows `deviation-protocol.md`: mechanism yields, and the yield is
  recorded.

## Acceptance Criteria

Planned-work acceptance criteria use stable IDs:

```md
- [ ] AC-001 - The user-visible outcome is specific and testable.
- [ ] AC-002 - Existing behavior that must be preserved is explicit.
```

Rules:

- Use `AC-###` IDs only for planned work that will feed a plan.
- Write outcomes, not implementation steps.
- Each acceptance criterion should be traceable to one or more plan behaviors.
- Direct fixes and tiny bugfixes do not need a spec unless the human asks for one or product intent is genuinely unclear.

## Hand-Off

When planning begins, the planner turns each relevant `AC-###` into one or more `B-###` behavior entries in `plan.md`. The spec should not design the implementation seam; the plan owns that placement.

# Spec Format

`spec.md` is the product document: what is being built, who benefits, why it matters, and how the experience should behave. It is required for planned feature/refactor work and optional for bugfix/patch work.

## Required Sections

Use these sections for planned feature/refactor specs:

- `## Purpose`
- `## Users`
- `## User Experience`
- `## Acceptance Criteria`
- `## Scope`
- `## Assumptions`
- `## Open Questions`

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

---
name: work-artifacts
description: Canonical artifact-format contracts for Cosmonauts work. Use when choosing workflow tiers, writing or reviewing spec.md, plan.md, architecture.md, behavior markers, Quality Contract ladders, or artifact examples. Do NOT load for task lifecycle tooling or implementation TDD mechanics unless artifact format is in scope.
---

# Work Artifacts

This is a thin dispatcher for Cosmonauts work-document formats. Canonical artifact rules live in `references/`. Role skills should route to this skill instead of duplicating full artifact rules.

## Rules

- Load exactly the references needed for the current artifact question.
- Do not hide a needed file behind another file. Every reference is directly linked below.
- Keep direct fixes lightweight: route them to regression-test guidance, not to the full artifact stack.
- For planned feature/refactor work, route to `spec.md` plus behavior-first `plan.md`.
- Rewrite Quality Contracts that name concrete tools as abstract gate kinds.
- Create architecture records only when they change implementation or review.

## Routing

| Signal | Load |
|---|---|
| Choosing direct fix vs tactical vs planned vs architectural workflow | `references/workflow-tiers.md` |
| Writing or reviewing a planned product spec | `references/spec-format.md` |
| Writing or reviewing an implementation plan | `references/plan-format.md`, plus `references/behavior-spine.md` for behavior details |
| Writing or reviewing architecture context or architecture records | `references/architecture-format.md` |
| Mapping ACs to behaviors, tests, seams, and markers | `references/behavior-spine.md` |
| Writing or reviewing Quality Contract gates | `references/gate-contracts.md` |
| Choosing artifact diagrams or matrix primitives | `references/visual-primitives.md` |
| Needing a small template for the current workflow tier | `references/examples.md` |

## References

- `references/workflow-tiers.md` - direct fix, tactical bugfix, planned feature/refactor, and architecture-linked workflow routing.
- `references/spec-format.md` - `spec.md` sections and planned-work `AC-###` acceptance criteria.
- `references/plan-format.md` - behavior-first `plan.md`, derived design, flat files list, and Quality Contract placement.
- `references/architecture-format.md` - `missions/architecture/<slug>.md`, Decision Log, Boundary Model, Architecture Context, and memory distinction.
- `references/behavior-spine.md` - `AC-###` to `B-###` to seam, test, and `@cosmo-behavior plan:<slug>#B-###` marker.
- `references/gate-contracts.md` - abstract gate kinds, tiers, binding states, protocol slot, and degradation rules.
- `references/visual-primitives.md` - approved markdown-native visuals and the ASCII-art ban.
- `references/examples.md` - minimal templates for direct, tactical, planned, and architecture-linked work.

## Failure Modes

- **Full-stack reflex.** Direct fixes get routed through `spec.md`, `plan.md`, or `architecture.md`. Use `references/workflow-tiers.md` and the direct-fix template instead.
- **Rule duplication.** A role skill copies full artifact sections. Keep the role skill procedural and route here.
- **Concrete gate binding.** A generic artifact names a specific gate tool or command. Rewrite it as a gate kind and leave binding to project configuration.
- **Shelfware architecture.** An architecture record is written as background reading. Create one only when workers or reviewers need it.

## Related Skills

- `/skill:plan` - plan lifecycle, readiness, and plan tools.
- `/skill:task` - task lifecycle, task acceptance criteria, and task tools.
- `/skill:tdd` - implementation red/green/refactor and regression-test discipline.
- `/skill:architecture` - architecture-record authoring dispatcher.

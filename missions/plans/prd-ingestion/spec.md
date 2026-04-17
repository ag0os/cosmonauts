## Purpose

Allow Cosmonauts to ingest a written PRD in non-interactive mode without inventing missing product requirements. A complete PRD should produce a `spec.md`; an incomplete or ambiguous PRD should stop the run with a structured `gaps.md` that tells the human what must be clarified.

## Users

- A developer or operator running `cosmonauts` non-interactively with a written PRD.
- Downstream planner/task-manager/coordinator stages that need a trustworthy product contract instead of inferred assumptions.

## User Experience

1. The user runs a non-interactive command such as `cosmonauts --workflow spec-and-build --prd docs/auth-prd.md`.
2. Cosmonauts reads the PRD, derives the target plan slug, and runs the `spec-writer` in strict PRD mode.
3. If the PRD is complete, Cosmonauts creates `missions/plans/<slug>/spec.md`, then continues into planning/task creation/implementation using that plan slug as the active scope.
4. If the PRD is missing key product information or contains ambiguity that requires product judgment, Cosmonauts creates `missions/plans/<slug>/gaps.md`, prints the gap-list path, exits nonzero, and does not run `planner` or any later stage.
5. If the invocation itself is invalid (bad PRD path, unsupported workflow, conflicting completion label), Cosmonauts fails before starting any agent work.

## Acceptance Criteria

- `--prd <path>` is accepted only for non-interactive spec-writer flows.
- In PRD mode, `spec-writer` validates against a checklist covering goals, users, success criteria, scope, edge cases, non-goals, constraints, and acceptance signals.
- A complete PRD creates `missions/plans/<slug>/spec.md` and does not create `gaps.md`.
- An incomplete or ambiguous PRD creates `missions/plans/<slug>/gaps.md` and does not create `spec.md`.
- When `gaps.md` is produced, downstream chain stages do not run.
- The resolved plan slug is reused for plan files, `plan:<slug>` completion scoping, and downstream stage context.

## Scope

Included:
- CLI flag parsing and validation for `--prd`
- strict PRD ingestion behavior for `spec-writer`
- gap artifact creation and early-abort behavior
- downstream stage scoping for supported spec-driven workflows

Excluded:
- interactive PRD clarification in the same invocation
- arbitrary workflow support when the first stage is not `spec-writer`
- automatic fix-up of PRDs after a refused run

## Assumptions

- PRD mode is intentionally stricter than today’s generic non-interactive spec mode; missing product requirements are a refusal, not an assumption.
- The primary supported workflows are existing chains that begin with `spec-writer`.
- A single plan slug must be authoritative for the entire PRD-driven run.

## Open Questions

- None blocking; unsupported invocation shapes should fail fast rather than being interpreted permissively.
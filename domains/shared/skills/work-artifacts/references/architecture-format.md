# Architecture Format

`architecture.md` is an active architecture record, not background reading. Create it only when durable boundaries, dependency rules, or multi-plan decisions will change how workers implement or reviewers evaluate the work.

## Location

Durable architecture records live at:

```text
missions/architecture/<slug>.md
```

Do not store architecture-of-record content inside an implementation plan. Plans link to records through `Architecture Context`.

## Required Sections

- `## Purpose`
- `## Decision Log`
- `## Boundary Model`
- `## Current Architecture`
- `## Target Architecture`
- `## Plan Links`

## Decision Log

Use structured list entries:

- `D-001 - Decision title`
- `Decision:` the chosen rule or direction
- `Alternatives:` meaningful options rejected
- `Why:` the reason the decision changes implementation or review
- `Decided-by:` human, plan, or review source

## Boundary Model

The Boundary Model names codebase zones and allowed dependency directions. It should be concrete enough for future boundary-conformance review.

## Architecture Context In Plans

Plans that depend on a record include:

```md
## Architecture Context

This plan implements part of `missions/architecture/<slug>.md`.

Relevant decisions:
- D-001 - Decision title.

Boundary rules this plan must preserve:
- Zone A may depend on Zone B only through the declared interface.
```

## Architecture And Memory

`architecture.md` is active, authoritative implementation context used during planning, implementation, and review. `memory/` is post-completion distilled knowledge for later retrieval. Do not replace an active boundary record with memory notes.

## Usefulness Rule

If the record would not change implementation or review, do not create it. Use a plan or task for the work and leave durable lessons for post-completion memory distillation.

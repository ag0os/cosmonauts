---
name: architecture
description: Authors active Cosmonauts architecture records for durable boundaries, dependency rules, and multi-plan decisions. Use when deciding whether to create or update architecture.md or missions/architecture records. Do NOT load for ordinary implementation plans, post-completion memory distillation, or background design notes.
---

# Architecture

This is a thin dispatcher for architecture-record authoring: route architecture-record format details to `/skill:work-artifacts` and load `references/architecture-format.md`.

## Rules

- Create `architecture.md` only when durable boundaries, dependency rules, or multi-plan decisions will change implementation or review.
- Do not create architecture records as background reading, design scratchpads, or post-completion memory.
- Store durable architecture records under `missions/architecture/<slug>.md`.
- Keep architecture-of-record content out of `plan.md`; plans link to records through `Architecture Context`.
- Include a Decision Log and Boundary Model in every durable record.

## Routing

| Signal | Action |
|---|---|
| Deciding whether architecture documentation is useful | Apply the usefulness rule, then load `/skill:work-artifacts` `references/architecture-format.md` only if a durable record is warranted. |
| Writing or reviewing a durable architecture record | Use `/skill:work-artifacts` `references/architecture-format.md` as the canonical format. |
| Writing a plan that depends on an architecture record | Use `/skill:work-artifacts` `references/architecture-format.md` for `Architecture Context`. |
| Capturing lessons after work completes | Use post-completion memory flow, not this skill. |

## Failure Modes

- **Shelfware architecture.** A record would not change implementation or review. Do not create it.
- **Plan stuffing.** Architecture-of-record content is embedded in `plan.md`. Move the durable record to `missions/architecture/<slug>.md` and link it from `Architecture Context`.
- **Memory confusion.** Active architecture records are treated as the same thing as post-completion memory. Keep the authoritative implementation context in architecture records; distill completed lessons into `memory/`.

## Related Skills

- `/skill:work-artifacts` - canonical artifact-format contracts and architecture record details.
- `/skill:plan` - implementation plan lifecycle and task-producing plans.
- `/skill:archive` - post-completion archival and memory distillation.

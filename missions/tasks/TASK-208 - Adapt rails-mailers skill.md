---
id: TASK-208
title: Adapt rails-mailers skill
status: Done
priority: medium
assignee: worker
labels:
  - backend
  - 'plan:ruby-rails-skills'
dependencies:
  - TASK-194
createdAt: '2026-04-24T15:13:49.607Z'
updatedAt: '2026-04-24T15:46:38.045Z'
---

## Description

Adapt the `rails-codex-plugin` `rails-mailer-patterns` source skill into the `rails-mailers` cosmonauts skill.

**Source:** `/Users/cosmos/Projects/rails-codex-plugin/plugins/rails-codex-plugin/skills/rails-mailer-patterns/`
**Target:** `bundled/coding/coding/skills/languages/rails/mailers/`

**Expected output files:**
- `SKILL.md`
- `references/patterns.md`

**Required adaptations (spec.md sections 3–5):**
- Frontmatter: `name: rails-mailers`, cosmonauts description formula, remove `allowed-tools`.
- Opener: standard one-liner Rails opener referencing `/skill:rails-conventions`, `/skill:rails-stack-profiles`, `/skill:ruby-object-design`, `/skill:ruby-refactoring`.
- Content: preserve Action Mailer guidance (mailer structure, previews, delivery methods, testing mailers, internationalization). Shorten description into cosmonauts formula.
- Convert all relative links to `references/...` format (Rule E).
- Add `## Related Skills` at the bottom: link `/skill:rails-conventions`, `/skill:rails-stack-profiles`, `/skill:rails-jobs`, `/skill:rails-testing`, `/skill:find-docs`.

**Read `missions/plans/ruby-rails-skills/spec.md` before writing any file. Complete spec.md section 9 QA checklist before marking Done.**

<!-- AC:BEGIN -->
- [x] #1 SKILL.md exists at `bundled/coding/coding/skills/languages/rails/mailers/SKILL.md` with frontmatter `name: rails-mailers` and no `allowed-tools` field.
- [x] #2 Frontmatter description uses the cosmonauts 'Use when / Do NOT load for' formula.
- [x] #3 Opener uses the standard one-liner Rails preamble.
- [x] #4 `references/patterns.md` exists with Action Mailer structure/previews/delivery/testing content.
- [x] #5 `## Related Skills` section present linking `/skill:rails-conventions`, `/skill:rails-stack-profiles`, `/skill:rails-jobs`, `/skill:rails-testing`, `/skill:find-docs`.
- [x] #6 All relative link targets exist on disk and all cross-skill links use final `/skill:<id>` names (spec.md section 9 checklist green).
<!-- AC:END -->

## Implementation Notes

Added `rails-mailers` at `bundled/coding/coding/skills/languages/rails/mailers/` with a normalized frontmatter, standard Rails opener, preserved Action Mailer guidance, and the required related-skill links. Completed spec.md section 9 QA checks, verified relative and cross-skill links, ran `bun run test`, `bun run lint`, and `bun run typecheck`, and committed as `TASK-208: Adapt rails-mailers skill` (`95055a9`).

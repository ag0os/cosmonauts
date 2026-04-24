---
id: TASK-200
title: Adapt rails-views skill
status: Done
priority: medium
assignee: worker
labels:
  - frontend
  - 'plan:ruby-rails-skills'
dependencies:
  - TASK-194
createdAt: '2026-04-24T15:12:22.990Z'
updatedAt: '2026-04-24T15:40:19.964Z'
---

## Description

Adapt the `rails-codex-plugin` `rails-views-patterns` source skill into the `rails-views` cosmonauts skill.

**Source:** `/Users/cosmos/Projects/rails-codex-plugin/plugins/rails-codex-plugin/skills/rails-views-patterns/`
**Target:** `bundled/coding/coding/skills/languages/rails/views/`

**Expected output files:**
- `SKILL.md`
- `references/patterns.md`

**Required adaptations (spec.md sections 3–5):**
- Frontmatter: `name: rails-views`, cosmonauts description formula, remove `allowed-tools`.
- Opener: standard one-liner Rails opener referencing `/skill:rails-conventions`, `/skill:rails-stack-profiles`, `/skill:ruby-object-design`, `/skill:ruby-refactoring`.
- Content: preserve ERB/partials/forms/cache/accessibility guidance. Link Hotwire-specific advice to `/skill:rails-hotwire` rather than duplicating it.
- Convert all relative links to `references/...` format (Rule E).
- Add `## Related Skills` at the bottom: link `/skill:rails-conventions`, `/skill:rails-stack-profiles`, `/skill:rails-hotwire`, `/skill:rails-controllers`, `/skill:rails-caching`, `/skill:find-docs`.

**Read `missions/plans/ruby-rails-skills/spec.md` before writing any file. Complete spec.md section 9 QA checklist before marking Done.**

<!-- AC:BEGIN -->
- [x] #1 SKILL.md exists at `bundled/coding/coding/skills/languages/rails/views/SKILL.md` with frontmatter `name: rails-views` and no `allowed-tools` field.
- [x] #2 Frontmatter description uses the cosmonauts 'Use when / Do NOT load for' formula.
- [x] #3 Opener uses the standard one-liner Rails preamble.
- [x] #4 `references/patterns.md` exists with ERB/partials/forms/cache/accessibility content.
- [x] #5 Hotwire-specific advice is redirected to `/skill:rails-hotwire` rather than duplicated inline.
- [x] #6 `## Related Skills` section present linking `/skill:rails-conventions`, `/skill:rails-stack-profiles`, `/skill:rails-hotwire`, `/skill:rails-controllers`, `/skill:rails-caching`, `/skill:find-docs`.
- [x] #7 All relative link targets exist on disk and all cross-skill links use final `/skill:<id>` names (spec.md section 9 checklist green).
<!-- AC:END -->

## Implementation Notes

Added `bundled/coding/coding/skills/languages/rails/views/SKILL.md` and `references/patterns.md` adapted from `rails-views-patterns`, preserved ERB/partials/forms/cache/accessibility guidance, and redirected Turbo/Stimulus advice to `/skill:rails-hotwire`. Completed spec.md section 9 QA checks, including a manual link-name/relative-target verification. `bun run test` and `bun run typecheck` passed. `bun run lint` is currently blocked by an unrelated formatting issue in `missions/tasks/config.json`.

---
id: TASK-199
title: Adapt rails-testing skill
status: Done
priority: medium
assignee: worker
labels:
  - backend
  - testing
  - 'plan:ruby-rails-skills'
dependencies:
  - TASK-194
createdAt: '2026-04-24T15:12:13.461Z'
updatedAt: '2026-04-24T15:34:11.852Z'
---

## Description

Adapt the `rails-codex-plugin` `rails-testing-patterns` source skill into the `rails-testing` cosmonauts skill.

**Source:** `/Users/cosmos/Projects/rails-codex-plugin/plugins/rails-codex-plugin/skills/rails-testing-patterns/`
**Target:** `bundled/coding/coding/skills/languages/rails/testing/`

**Expected output files:**
- `SKILL.md`
- `references/patterns.md`

**Required adaptations (spec.md sections 3–5):**
- Frontmatter: `name: rails-testing`, cosmonauts description formula, remove `allowed-tools`.
- Opener: standard one-liner Rails opener referencing `/skill:rails-conventions`, `/skill:rails-stack-profiles`, `/skill:ruby-object-design`, `/skill:ruby-refactoring`.
- Content: preserve Rails-specific test-type selection and framework conventions (RSpec vs Minitest, FactoryBot, fixtures, request specs, system tests). Defer general testing philosophy and language-agnostic test discipline to `/skill:engineering-principles` (Rule C).
- Convert all relative links to `references/...` format (Rule E).
- Add `## Related Skills` at the bottom: link `/skill:rails-conventions`, `/skill:rails-stack-profiles`, `/skill:rails-models`, `/skill:engineering-principles`, `/skill:find-docs`.

**Read `missions/plans/ruby-rails-skills/spec.md` before writing any file. Complete spec.md section 9 QA checklist before marking Done.**

<!-- AC:BEGIN -->
- [x] #1 SKILL.md exists at `bundled/coding/coding/skills/languages/rails/testing/SKILL.md` with frontmatter `name: rails-testing` and no `allowed-tools` field.
- [x] #2 Frontmatter description uses the cosmonauts 'Use when / Do NOT load for' formula.
- [x] #3 Opener uses the standard one-liner Rails preamble.
- [x] #4 `references/patterns.md` exists with Rails-specific test-type and framework convention content.
- [x] #5 Language-agnostic testing philosophy is deferred to `/skill:engineering-principles` rather than duplicated.
- [x] #6 `## Related Skills` section present linking `/skill:rails-conventions`, `/skill:rails-stack-profiles`, `/skill:rails-models`, `/skill:engineering-principles`, `/skill:find-docs`.
- [x] #7 All relative link targets exist on disk and all cross-skill links use final `/skill:<id>` names (spec.md section 9 checklist green).
<!-- AC:END -->

## Implementation Notes

Adapted `rails-testing-patterns` into `bundled/coding/coding/skills/languages/rails/testing/` with a cosmonauts frontmatter, the standard Rails opener, a `references/patterns.md` decision guide, and explicit deferral of language-agnostic testing philosophy to `/skill:engineering-principles`. QA: read both finished files, verified `references/patterns.md` link resolution and `/skill:<id>` names with a Node link-check script, ran `bun run typecheck` and `bun run test` successfully. `bun run lint` still fails on unrelated pre-existing formatting in `missions/tasks/config.json`.

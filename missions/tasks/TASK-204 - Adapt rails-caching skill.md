---
id: TASK-204
title: Adapt rails-caching skill
status: Done
priority: medium
assignee: worker
labels:
  - backend
  - 'plan:ruby-rails-skills'
dependencies:
  - TASK-194
createdAt: '2026-04-24T15:13:05.296Z'
updatedAt: '2026-04-24T15:42:32.632Z'
---

## Description

Adapt the `rails-codex-plugin` `rails-caching-patterns` source skill into the `rails-caching` cosmonauts skill.

**Source:** `/Users/cosmos/Projects/rails-codex-plugin/plugins/rails-codex-plugin/skills/rails-caching-patterns/`
**Target:** `bundled/coding/coding/skills/languages/rails/caching/`

**Expected output files:**
- `SKILL.md`
- `references/patterns.md`

**Required adaptations (spec.md sections 3–5):**
- Frontmatter: `name: rails-caching`, cosmonauts description formula, remove `allowed-tools`.
- Opener: standard one-liner Rails opener referencing `/skill:rails-conventions`, `/skill:rails-stack-profiles`, `/skill:ruby-object-design`, `/skill:ruby-refactoring`.
- Content: keep fragment/low-level/HTTP caching and cache invalidation guidance.
- Convert all relative links to `references/...` format (Rule E).
- Add `## Related Skills` at the bottom: link `/skill:rails-conventions`, `/skill:rails-stack-profiles`, `/skill:rails-views`, `/skill:rails-hotwire`, `/skill:find-docs`.

**Read `missions/plans/ruby-rails-skills/spec.md` before writing any file. Complete spec.md section 9 QA checklist before marking Done.**

<!-- AC:BEGIN -->
- [x] #1 SKILL.md exists at `bundled/coding/coding/skills/languages/rails/caching/SKILL.md` with frontmatter `name: rails-caching` and no `allowed-tools` field.
- [x] #2 Frontmatter description uses the cosmonauts 'Use when / Do NOT load for' formula.
- [x] #3 Opener uses the standard one-liner Rails preamble.
- [x] #4 `references/patterns.md` exists with fragment/low-level/HTTP caching and invalidation content.
- [x] #5 `## Related Skills` section present linking `/skill:rails-conventions`, `/skill:rails-stack-profiles`, `/skill:rails-views`, `/skill:rails-hotwire`, `/skill:find-docs`.
- [x] #6 All relative link targets exist on disk and all cross-skill links use final `/skill:<id>` names (spec.md section 9 checklist green).
<!-- AC:END -->

<!-- AC:BEGIN -->
- [x] #1 SKILL.md exists at `bundled/coding/coding/skills/languages/rails/caching/SKILL.md` with frontmatter `name: rails-caching` and no `allowed-tools` field.
- [x] #2 Frontmatter description uses the cosmonauts 'Use when / Do NOT load for' formula.
- [x] #3 Opener uses the standard one-liner Rails preamble.
- [x] #4 `references/patterns.md` exists with fragment/low-level/HTTP caching and invalidation content.
- [x] #5 `## Related Skills` section present linking `/skill:rails-conventions`, `/skill:rails-stack-profiles`, `/skill:rails-views`, `/skill:rails-hotwire`, `/skill:find-docs`.
- [ ] #6 All relative link targets exist on disk and all cross-skill links use final `/skill:<id>` names (spec.md section 9 checklist green).
<!-- AC:END -->

## Implementation Notes

Adapted the source caching skill into `bundled/coding/coding/skills/languages/rails/caching/` with a normalized `SKILL.md` and rewritten `references/patterns.md`. QA completed: read both finished files, verified relative links and `/skill:*` names, and ran `bun run test`, `bun run lint`, and `bun run typecheck`. Commit: `TASK-204: Add rails-caching skill`.

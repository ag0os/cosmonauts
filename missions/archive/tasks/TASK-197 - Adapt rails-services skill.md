---
id: TASK-197
title: Adapt rails-services skill
status: Done
priority: medium
assignee: worker
labels:
  - backend
  - 'plan:ruby-rails-skills'
dependencies:
  - TASK-194
createdAt: '2026-04-24T15:11:53.394Z'
updatedAt: '2026-04-24T15:32:49.234Z'
---

## Description

Adapt the `rails-codex-plugin` `rails-service-patterns` source skill into the `rails-services` cosmonauts skill.

**Source:** `/Users/cosmos/Projects/rails-codex-plugin/plugins/rails-codex-plugin/skills/rails-service-patterns/`
**Target:** `bundled/coding/coding/skills/languages/rails/services/`

**Expected output files:**
- `SKILL.md`
- `references/patterns.md`

**Required adaptations (spec.md sections 3–5):**
- Frontmatter: `name: rails-services`, cosmonauts description formula, remove `allowed-tools`.
- Opener: standard one-liner Rails opener referencing `/skill:rails-conventions`, `/skill:rails-stack-profiles`, `/skill:ruby-object-design`, `/skill:ruby-refactoring`.
- Content: preserve service/result/query/form-object guidance. Link generic refactoring advice to `/skill:refactoring` (Rule C). When discussing result structs, link Ruby object shape choices to `/skill:ruby-object-design` rather than re-teaching them (Rule B).
- May receive Rails-specific notes about service-oriented profile exceptions migrated from `ruby-object-design` source (check the ruby-object-design wave 1 task notes for any redistributed content).
- Convert all relative links to `references/...` format (Rule E).
- Add `## Related Skills` at the bottom: link `/skill:rails-conventions`, `/skill:rails-stack-profiles`, `/skill:rails-architecture`, `/skill:rails-models`, `/skill:ruby-object-design`, `/skill:refactoring`, `/skill:find-docs`.

**Read `missions/plans/ruby-rails-skills/spec.md` before writing any file. Complete spec.md section 9 QA checklist before marking Done.**

<!-- AC:BEGIN -->
- [x] #1 SKILL.md exists at `bundled/coding/coding/skills/languages/rails/services/SKILL.md` with frontmatter `name: rails-services` and no `allowed-tools` field.
- [x] #2 Frontmatter description uses the cosmonauts 'Use when / Do NOT load for' formula.
- [x] #3 Opener uses the standard one-liner Rails preamble.
- [x] #4 `references/patterns.md` exists with service/result/query/form-object deep-dive content.
- [x] #5 Ruby construct-choice teaching (result struct shape selection, Object Factory Rule) defers to `/skill:ruby-object-design` rather than being restated.
- [x] #6 Generic refactoring philosophy defers to `/skill:refactoring` rather than being duplicated.
- [x] #7 `## Related Skills` section present linking `/skill:rails-conventions`, `/skill:rails-stack-profiles`, `/skill:rails-architecture`, `/skill:rails-models`, `/skill:ruby-object-design`, `/skill:refactoring`, `/skill:find-docs`. All links resolve correctly (spec.md section 9 checklist green).
<!-- AC:END -->

## Implementation Notes

Implemented `bundled/coding/coding/skills/languages/rails/services/SKILL.md` and `references/patterns.md`, preserving the service/result/form-object/query guidance while deferring Ruby construct selection to `/skill:ruby-object-design` and generic refactoring workflow to `/skill:refactoring`. Included the Rails-specific service-oriented profile note migrated from the Ruby object-design task by making service extraction explicitly profile-aware. Completed the spec.md section 9 QA checklist: reread both finished files, verified the `references/patterns.md` link target exists on disk, and checked all cross-skill links use final `/skill:<id>` names. Verification: `bun run test` ✅, `bun run typecheck` ✅, `bun run lint` fails on a pre-existing unrelated formatting issue in `missions/tasks/config.json`. Commit: `c5245ee` (`TASK-197: Adapt rails-services skill`).

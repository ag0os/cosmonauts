---
id: TASK-202
title: Adapt rails-api skill
status: Done
priority: medium
assignee: worker
labels:
  - backend
  - api
  - 'plan:ruby-rails-skills'
dependencies:
  - TASK-194
createdAt: '2026-04-24T15:12:43.379Z'
updatedAt: '2026-04-24T15:39:05.302Z'
---

## Description

Adapt the `rails-codex-plugin` `rails-api-patterns` source skill into the `rails-api` cosmonauts skill.

**Source:** `/Users/cosmos/Projects/rails-codex-plugin/plugins/rails-codex-plugin/skills/rails-api-patterns/`
**Target:** `bundled/coding/coding/skills/languages/rails/api/`

**Expected output files:**
- `SKILL.md`
- `references/patterns.md`

**Required adaptations (spec.md sections 3–5):**
- Frontmatter: `name: rails-api`, cosmonauts description formula, remove `allowed-tools`.
- Opener: standard one-liner Rails opener referencing `/skill:rails-conventions`, `/skill:rails-stack-profiles`, `/skill:ruby-object-design`, `/skill:ruby-refactoring`.
- Content: preserve REST, serializers, versioning, pagination, and error-shape guidance.
- Convert all relative links to `references/...` format (Rule E).
- Add `## Related Skills` at the bottom: link `/skill:rails-conventions`, `/skill:rails-stack-profiles`, `/skill:rails-auth`, `/skill:rails-controllers`, `/skill:rails-graphql`, `/skill:find-docs`.

**Read `missions/plans/ruby-rails-skills/spec.md` before writing any file. Complete spec.md section 9 QA checklist before marking Done.**

<!-- AC:BEGIN -->
- [ ] #1 SKILL.md exists at `bundled/coding/coding/skills/languages/rails/api/SKILL.md` with frontmatter `name: rails-api` and no `allowed-tools` field.
- [ ] #2 Frontmatter description uses the cosmonauts 'Use when / Do NOT load for' formula.
- [ ] #3 Opener uses the standard one-liner Rails preamble.
- [ ] #4 `references/patterns.md` exists with REST/serializers/versioning/pagination/error-shape content.
- [ ] #5 `## Related Skills` section present linking `/skill:rails-conventions`, `/skill:rails-stack-profiles`, `/skill:rails-auth`, `/skill:rails-controllers`, `/skill:rails-graphql`, `/skill:find-docs`.
- [ ] #6 All relative link targets exist on disk and all cross-skill links use final `/skill:<id>` names (spec.md section 9 checklist green).
<!-- AC:END -->

## Implementation Notes

Added `bundled/coding/coding/skills/languages/rails/api/SKILL.md` and `references/patterns.md`, adapted from the source `rails-api-patterns` skill with normalized frontmatter, the standard Rails opener, `references/...` linking, and the required Related Skills links. Completed the section 9 QA checklist: re-read both files, verified the relative link target exists on disk, and confirmed cross-skill links use final `/skill:<id>` names. Validation: `bun run test` ✅, `bun run typecheck` ✅, `bun run lint` ⚠️ fails on unrelated pre-existing formatting in `missions/tasks/config.json`. Commit: `8eb9d30` (`TASK-202: Add rails-api skill`).

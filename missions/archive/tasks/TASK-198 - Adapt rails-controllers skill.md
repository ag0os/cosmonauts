---
id: TASK-198
title: Adapt rails-controllers skill
status: Done
priority: medium
assignee: worker
labels:
  - backend
  - api
  - 'plan:ruby-rails-skills'
dependencies:
  - TASK-194
createdAt: '2026-04-24T15:12:04.570Z'
updatedAt: '2026-04-24T15:33:15.943Z'
---

## Description

Adapt the `rails-codex-plugin` `rails-controller-patterns` source skill into the `rails-controllers` cosmonauts skill.

**Source:** `/Users/cosmos/Projects/rails-codex-plugin/plugins/rails-codex-plugin/skills/rails-controller-patterns/`
**Target:** `bundled/coding/coding/skills/languages/rails/controllers/`

**Expected output files:**
- `SKILL.md`
- `references/patterns.md`

**Required adaptations (spec.md sections 3–5):**
- Frontmatter: `name: rails-controllers`, cosmonauts description formula, remove `allowed-tools`.
- Opener: standard one-liner Rails opener referencing `/skill:rails-conventions`, `/skill:rails-stack-profiles`, `/skill:ruby-object-design`, `/skill:ruby-refactoring`.
- Content: preserve routing/params/response/filter guidance. Shorten opener relative to the source (compress repeated preflight prose per D-003).
- Convert all relative links to `references/...` format (Rule E).
- Add `## Related Skills` at the bottom: link `/skill:rails-conventions`, `/skill:rails-stack-profiles`, `/skill:rails-models`, `/skill:rails-services`, `/skill:rails-api`, `/skill:rails-views`, `/skill:find-docs`.

**Read `missions/plans/ruby-rails-skills/spec.md` before writing any file. Complete spec.md section 9 QA checklist before marking Done.**

<!-- AC:BEGIN -->
- [ ] #1 SKILL.md exists at `bundled/coding/coding/skills/languages/rails/controllers/SKILL.md` with frontmatter `name: rails-controllers` and no `allowed-tools` field.
- [ ] #2 Frontmatter description uses the cosmonauts 'Use when / Do NOT load for' formula.
- [ ] #3 Opener uses the standard one-liner Rails preamble — no verbose preflight boilerplate copied from source.
- [ ] #4 `references/patterns.md` exists with routing/params/response/filter reference patterns.
- [ ] #5 `## Related Skills` section present linking `/skill:rails-conventions`, `/skill:rails-stack-profiles`, `/skill:rails-models`, `/skill:rails-services`, `/skill:rails-api`, `/skill:rails-views`, `/skill:find-docs`.
- [ ] #6 All relative link targets exist on disk and all cross-skill links use final `/skill:<id>` names (spec.md section 9 checklist green).
<!-- AC:END -->

## Implementation Notes

Completed spec.md section 9 QA checklist for rails/controllers. Added `bundled/coding/coding/skills/languages/rails/controllers/SKILL.md` and `references/patterns.md`, verified the `references/patterns.md` link exists on disk, and used final `/skill:<id>` cross-skill links. `bun run test` and `bun run typecheck` passed. `bun run lint` fails from unrelated pre-existing formatting in `missions/tasks/config.json`, not from this task's files.

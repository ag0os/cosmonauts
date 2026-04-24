---
id: TASK-196
title: Adapt rails-models skill
status: Done
priority: medium
assignee: worker
labels:
  - backend
  - database
  - 'plan:ruby-rails-skills'
dependencies:
  - TASK-194
createdAt: '2026-04-24T15:11:39.936Z'
updatedAt: '2026-04-24T15:35:30.247Z'
---

## Description

Adapt the `rails-codex-plugin` `rails-model-patterns` source skill into the `rails-models` cosmonauts skill. Also absorbs God-model, status-field, and lazy-concern smell content redistributed from the ruby-refactoring source (per spec.md section 10, items 1–2).

**Source:** `/Users/cosmos/Projects/rails-codex-plugin/plugins/rails-codex-plugin/skills/rails-model-patterns/`
**Target:** `bundled/coding/coding/skills/languages/rails/models/`

**Expected output files:**
- `SKILL.md`
- `references/associations.md`
- `references/migrations.md`
- `references/validations.md`
- `references/value-objects.md`

**Required adaptations (spec.md sections 3–5):**
- Frontmatter: `name: rails-models`, cosmonauts description formula, remove `allowed-tools`.
- Opener: standard one-liner Rails opener referencing `/skill:rails-conventions`, `/skill:rails-stack-profiles`, `/skill:ruby-object-design`, `/skill:ruby-refactoring`.
- Content: keep ActiveRecord-specific guidance (associations, validations, scopes, callbacks, migrations, query optimization).
- **`references/value-objects.md` rewrite (spec.md section 10, item 2):** Keep ActiveRecord type/JSON column integration patterns. Replace pure Ruby construct-choice teaching (Data vs Struct decision, Ruby 3.2+ `Data.define` guidance) with a link to `/skill:ruby-object-design`. Do not teach Ruby construct selection here.
- **Redistribution intake (Rule D):** The `ruby-refactoring` Wave 1 worker extracted God-model, status-field, and lazy-concern smell sections. Incorporate that substance into `SKILL.md` or `references/value-objects.md` under an appropriate section.
- Convert all relative links to `references/...` format (Rule E).
- Add `## Related Skills` at the bottom: link `/skill:rails-conventions`, `/skill:rails-stack-profiles`, `/skill:rails-architecture`, `/skill:rails-services`, `/skill:ruby-object-design`, `/skill:find-docs`.

**Read `missions/plans/ruby-rails-skills/spec.md` before writing any file. Complete spec.md section 9 QA checklist before marking Done.**

<!-- AC:BEGIN -->
- [x] #1 SKILL.md exists at `bundled/coding/coding/skills/languages/rails/models/SKILL.md` with frontmatter `name: rails-models` and no `allowed-tools` field.
- [x] #2 Frontmatter description uses the cosmonauts 'Use when / Do NOT load for' formula.
- [x] #3 Opener uses the standard one-liner Rails preamble.
- [x] #4 All four reference files exist: `references/associations.md`, `references/migrations.md`, `references/validations.md`, `references/value-objects.md`.
- [x] #5 `references/value-objects.md` retains Rails persistence/integration patterns; pure Ruby construct-choice teaching is replaced with a link to `/skill:ruby-object-design`.
- [x] #6 God-model, status-field, and lazy-concern refactoring guidance (migrated from ruby-refactoring) is incorporated into the skill.
- [x] #7 `## Related Skills` section present linking `/skill:rails-conventions`, `/skill:rails-stack-profiles`, `/skill:rails-architecture`, `/skill:rails-services`, `/skill:ruby-object-design`, `/skill:find-docs`. All relative and cross-skill links resolve correctly (spec.md section 9 checklist green).
<!-- AC:END -->

## Implementation Notes

Adapted `bundled/coding/coding/skills/languages/rails/models/` with `SKILL.md` plus `references/associations.md`, `migrations.md`, `validations.md`, and `value-objects.md`.

Redistribution intake from `TASK-194` is now preserved in `SKILL.md` and `references/value-objects.md`: god-model warning signs and triage, status-field leakage guidance, and lazy-concern guidance.

`references/value-objects.md` now keeps Rails persistence/integration patterns only and defers Ruby construct selection to `/skill:ruby-object-design`.

QA completed per spec section 9:
- Read final `SKILL.md` and each reference file end-to-end.
- Verified all `references/...` links resolve on disk.
- Verified required cross-skill links use final `/skill:<id>` names.
- `bun run typecheck` passed.
- `bun run test` passed (85 files, 1551 tests).
- `bun run lint` still fails on the pre-existing formatter issue in `missions/tasks/config.json`, unrelated to this task.

Git commit: `TASK-196: Add rails-models skill` (`925cfcc`).

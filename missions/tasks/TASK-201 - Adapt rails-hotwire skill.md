---
id: TASK-201
title: Adapt rails-hotwire skill
status: Done
priority: medium
assignee: worker
labels:
  - frontend
  - backend
  - 'plan:ruby-rails-skills'
dependencies:
  - TASK-194
createdAt: '2026-04-24T15:12:34.013Z'
updatedAt: '2026-04-24T15:37:29.184Z'
---

## Description

Adapt the `rails-codex-plugin` `hotwire-patterns` source skill into the `rails-hotwire` cosmonauts skill. This skill keeps both Stimulus and Turbo as separate reference files (spec.md section 10, item 3).

**Source:** `/Users/cosmos/Projects/rails-codex-plugin/plugins/rails-codex-plugin/skills/hotwire-patterns/`
**Target:** `bundled/coding/coding/skills/languages/rails/hotwire/`

**Expected output files:**
- `SKILL.md`
- `references/stimulus.md`
- `references/turbo.md`

**Required adaptations (spec.md sections 3–5):**
- Frontmatter: `name: rails-hotwire`, cosmonauts description formula, remove `allowed-tools`.
- Opener: standard one-liner Rails opener referencing `/skill:rails-conventions`, `/skill:rails-stack-profiles`, `/skill:ruby-object-design`, `/skill:ruby-refactoring`.
- Content: preserve server-first chooser guidance and gotchas. Do NOT collapse `stimulus.md` and `turbo.md` into one reference file — keep them separate (spec.md section 10, item 3).
- Convert all relative links: `stimulus.md` → `references/stimulus.md`, `turbo.md` → `references/turbo.md` (Rule E).
- Add `## Related Skills` at the bottom: link `/skill:rails-conventions`, `/skill:rails-stack-profiles`, `/skill:rails-views`, `/skill:rails-caching`, `/skill:find-docs`.

**Read `missions/plans/ruby-rails-skills/spec.md` before writing any file. Complete spec.md section 9 QA checklist before marking Done.**

<!-- AC:BEGIN -->
- [ ] #1 SKILL.md exists at `bundled/coding/coding/skills/languages/rails/hotwire/SKILL.md` with frontmatter `name: rails-hotwire` and no `allowed-tools` field.
- [ ] #2 Frontmatter description uses the cosmonauts 'Use when / Do NOT load for' formula.
- [ ] #3 Opener uses the standard one-liner Rails preamble.
- [ ] #4 Both `references/stimulus.md` and `references/turbo.md` exist as separate files — they are NOT collapsed into one.
- [ ] #5 All SKILL.md internal links point to `references/stimulus.md` and `references/turbo.md` respectively.
- [ ] #6 `## Related Skills` section present linking `/skill:rails-conventions`, `/skill:rails-stack-profiles`, `/skill:rails-views`, `/skill:rails-caching`, `/skill:find-docs`.
- [ ] #7 All relative link targets exist on disk and all cross-skill links use final `/skill:<id>` names (spec.md section 9 checklist green).
<!-- AC:END -->

## Implementation Notes

Completed `bundled/coding/coding/skills/languages/rails/hotwire/` with `SKILL.md`, `references/stimulus.md`, and `references/turbo.md`. ACs satisfied: normalized `name: rails-hotwire` frontmatter with no `allowed-tools`; cosmonauts description formula; standard Rails opener; separate Stimulus and Turbo references; SKILL links rewritten to `references/stimulus.md` and `references/turbo.md`; required Related Skills links added; relative links verified on disk and `/skill:` cross-links use final IDs. Validation: re-read all three files end-to-end, `bun run test` passed, `bun run typecheck` passed, and `bun run lint` failed only because of unrelated pre-existing formatting in `missions/tasks/config.json`. Commit: `bd2d010` (`TASK-201: Add rails-hotwire skill`).

---
id: TASK-195
title: Adapt rails-architecture skill
status: Done
priority: medium
assignee: worker
labels:
  - backend
  - 'plan:ruby-rails-skills'
dependencies:
  - TASK-194
createdAt: '2026-04-24T15:11:26.120Z'
updatedAt: '2026-04-24T15:34:00.222Z'
---

## Description

Adapt the `rails-codex-plugin` `rails-architecture-patterns` source skill into the `rails-architecture` cosmonauts skill. Also absorbs Rails-layer smell content redistributed from the ruby-refactoring source (per spec.md section 10, item 1).

**Source:** `/Users/cosmos/Projects/rails-codex-plugin/plugins/rails-codex-plugin/skills/rails-architecture-patterns/`
**Target:** `bundled/coding/coding/skills/languages/rails/architecture/`

**Expected output files:**
- `SKILL.md`
- `references/patterns.md`

**Required adaptations (spec.md sections 3–5):**
- Frontmatter: `name: rails-architecture`, cosmonauts description formula, remove `allowed-tools`.
- Opener: standard one-liner Rails opener referencing `/skill:rails-conventions`, `/skill:rails-stack-profiles`, `/skill:ruby-object-design`, `/skill:ruby-refactoring`.
- Content: skill-routing and orchestration guidance; keep architectural decision patterns.
- **Redistribution intake (Rule D):** The `ruby-refactoring` Wave 1 worker extracted "Shotgun Surgery Across Rails Layers" and related Rails-layer architecture smell content from `ruby-refactoring/code-smells.md`. Incorporate that substance into `references/patterns.md` under an appropriate section.
- Convert all relative links to `references/...` format (Rule E).
- Add `## Related Skills` at the bottom: link `/skill:rails-conventions`, `/skill:rails-stack-profiles`, `/skill:rails-models`, `/skill:rails-services`, `/skill:ruby-refactoring`, `/skill:engineering-principles`, `/skill:find-docs`.

**Read `missions/plans/ruby-rails-skills/spec.md` before writing any file. Complete spec.md section 9 QA checklist before marking Done.**

<!-- AC:BEGIN -->
- [ ] #1 SKILL.md exists at `bundled/coding/coding/skills/languages/rails/architecture/SKILL.md` with frontmatter `name: rails-architecture` and no `allowed-tools` field.
- [ ] #2 Frontmatter description uses the cosmonauts 'Use when / Do NOT load for' formula.
- [ ] #3 Opener uses the standard one-liner Rails preamble referencing `/skill:rails-conventions` and `/skill:rails-stack-profiles`.
- [ ] #4 references/patterns.md exists and includes the substance of 'Shotgun Surgery Across Rails Layers' and related Rails-layer architectural smell guidance migrated from the ruby-refactoring source.
- [ ] #5 No Ruby construct-choice teaching (Object Factory Rule, Struct/Data/Hash graduation) is present — those defer to `/skill:ruby-object-design`.
- [ ] #6 `## Related Skills` section present linking `/skill:rails-conventions`, `/skill:rails-stack-profiles`, `/skill:rails-models`, `/skill:rails-services`, `/skill:ruby-refactoring`, `/skill:engineering-principles`, `/skill:find-docs`.
- [ ] #7 All relative link targets exist on disk and all cross-skill links use final `/skill:<id>` names (spec.md section 9 checklist green).
<!-- AC:END -->

## Implementation Notes

Implemented `bundled/coding/coding/skills/languages/rails/architecture/SKILL.md` and `references/patterns.md`. The new skill uses `name: rails-architecture`, the cosmonauts description formula, the standard Rails opener, and a bottom `## Related Skills` section linking `/skill:rails-conventions`, `/skill:rails-stack-profiles`, `/skill:rails-models`, `/skill:rails-services`, `/skill:ruby-refactoring`, `/skill:engineering-principles`, and `/skill:find-docs`. `references/patterns.md` preserves the source architecture decision matrices and adds the redistributed Rails-layer smell guidance from TASK-194, including `Shotgun Surgery Across Rails Layers`, the 4+ layer heuristic, common causes, and profile-aware landing zones. No Ruby construct-choice teaching was kept; those choices defer to `/skill:ruby-object-design`. Completed spec.md section 9 QA checklist: read both finished files end-to-end after writing, verified relative links exist on disk, verified cross-skill links use final `/skill:<id>` names, and confirmed `allowed-tools` is absent. Verification: `bun run typecheck` ✅, `bun run test` ✅, `bun run lint` fails on a pre-existing unrelated formatting issue in `missions/tasks/config.json`. Commit: `f7ce66d` (`TASK-195: Add rails-architecture skill`).

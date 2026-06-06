---
id: TASK-194
title: Adapt rails-stack-profiles skill
status: Done
priority: high
labels:
  - backend
  - 'plan:ruby-rails-skills'
dependencies: []
createdAt: '2026-04-24T15:10:21.672Z'
updatedAt: '2026-04-24T15:10:21.672Z'
assignee: worker
---

## Description

Adapt the `rails-codex-plugin` `rails-stack-profiles` source skill into the `rails-stack-profiles` cosmonauts skill. This is a Wave 1 foundation skill — all other Rails skills will reference it for profile-aware branching.

**Source:** `/Users/cosmos/Projects/rails-codex-plugin/plugins/rails-codex-plugin/skills/rails-stack-profiles/`
**Target:** `bundled/coding/coding/skills/languages/rails/stack-profiles/`

**Expected output files:**
- `SKILL.md`
- `references/profiles.md`

**Required adaptations (spec.md sections 3–5):**
- Frontmatter: `name: rails-stack-profiles`, cosmonauts description formula, remove `allowed-tools`.
- Opener: shorten the source opener; keep profile detection and hybrid guidance as the core value. State that all Rails skills use this for branching by stack style.
- Content: keep omakase/service/api-first profile detection and profile-aware recommendation branching. Deep-dive profiles live in `references/profiles.md`.
- Convert relative link `profiles.md` → `references/profiles.md` (Rule E).
- Add `## Related Skills` at the bottom: link `/skill:rails-conventions`, relevant Rails peer skills, `/skill:find-docs`.

**Read `missions/plans/ruby-rails-skills/spec.md` before writing any file. Complete spec.md section 9 QA checklist before marking Done.**

<!-- AC:BEGIN -->
- [x] #1 SKILL.md exists at `bundled/coding/coding/skills/languages/rails/stack-profiles/SKILL.md` with frontmatter `name: rails-stack-profiles` and no `allowed-tools` field.
- [x] #2 Frontmatter description uses the cosmonauts 'Use when / Do NOT load for' formula.
- [x] #3 Opener is shortened relative to the source — no verbose boilerplate.
- [x] #4 Profiles deep-dive lives at `references/profiles.md`; all internal SKILL.md links point to `references/profiles.md`.
- [x] #5 `## Related Skills` section present linking `/skill:rails-conventions` and `/skill:find-docs` (plus relevant peers).
- [x] #6 All relative link targets exist on disk and all cross-skill links use final `/skill:<id>` names (spec.md section 9 checklist green).
<!-- AC:END -->

## Implementation Notes

- This TASK-194 entry is the `Adapt rails-stack-profiles skill` task; the task tool resolves ambiguous `TASK-194` IDs to a different task, so this file was updated directly.
- Added `bundled/coding/coding/skills/languages/rails/stack-profiles/SKILL.md` and `references/profiles.md`.
- QA: `bun run test` and `bun run typecheck` passed. `bun run lint` failed on the pre-existing formatter issue in `missions/tasks/config.json`.

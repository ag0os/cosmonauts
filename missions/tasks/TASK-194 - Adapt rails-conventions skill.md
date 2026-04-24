---
id: TASK-194
title: Adapt rails-conventions skill
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:ruby-rails-skills'
dependencies: []
createdAt: '2026-04-24T15:10:21.672Z'
updatedAt: '2026-04-24T15:23:35.639Z'
---

## Description

Adapt the `rails-codex-plugin` `project-conventions` source skill into the `rails-conventions` cosmonauts skill. This is a Wave 1 foundation skill — all other Rails skills will reference it.

**Source:** `/Users/cosmos/Projects/rails-codex-plugin/plugins/rails-codex-plugin/skills/project-conventions/`
**Target:** `bundled/coding/coding/skills/languages/rails/conventions/`

**Expected output files:**
- `SKILL.md`
- `references/detection-commands.md`

**Required adaptations (spec.md sections 3–5):**
- Frontmatter: `name: rails-conventions`, cosmonauts description formula, remove `allowed-tools`.
- Opener: this skill IS the convention-detection entry point. State purpose clearly: all other Rails skills reference this skill and `/skill:rails-stack-profiles` for repo fingerprinting. Do not copy the verbose 4-step preflight boilerplate.
- Content: keep Convention Fingerprint format and convention-detection guidance.
- Convert relative link `detection-commands.md` → `references/detection-commands.md` (Rule E).
- Add `## Related Skills` at the bottom: link `/skill:rails-stack-profiles`, relevant Rails peer skills, `/skill:find-docs`.

**Read `missions/plans/ruby-rails-skills/spec.md` before writing any file. Complete spec.md section 9 QA checklist before marking Done.**

<!-- AC:BEGIN -->
- [ ] #1 SKILL.md exists at `bundled/coding/coding/skills/languages/rails/conventions/SKILL.md` with frontmatter `name: rails-conventions` and no `allowed-tools` field.
- [ ] #2 Frontmatter description uses the cosmonauts 'Use when / Do NOT load for' formula.
- [ ] #3 Opener is compressed — no copy of the 4-step verbose preflight boilerplate from the source pack.
- [ ] #4 Detection-commands reference lives at `references/detection-commands.md`; all internal SKILL.md links point to `references/detection-commands.md`.
- [ ] #5 `## Related Skills` section present linking `/skill:rails-stack-profiles` and `/skill:find-docs` (plus any relevant peers).
- [ ] #6 All relative link targets exist on disk and all cross-skill links use final `/skill:<id>` names (spec.md section 9 checklist green).
<!-- AC:END -->

## Implementation Notes

Implemented `bundled/coding/coding/skills/languages/rails/conventions/SKILL.md` and `references/detection-commands.md` and completed the spec.md section 9 QA checklist: correct path/name/description, no `allowed-tools`, all internal links point to `references/detection-commands.md`, relative links exist, and cross-skill links use final `/skill:<id>` names. Read both finished files end-to-end after writing. Verification: `bun run typecheck` ✅, `bun run test` ✅, repo-wide `bun run lint` fails on a pre-existing unrelated formatting issue in `missions/tasks/config.json`; the new markdown skill files are ignored by Biome. Commit: `c2bca2c` (`TASK-194: Adapt rails-conventions skill`).

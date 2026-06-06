---
id: TASK-203
title: Adapt rails-auth skill
status: Done
priority: medium
assignee: worker
labels:
  - backend
  - 'plan:ruby-rails-skills'
dependencies:
  - TASK-194
createdAt: '2026-04-24T15:12:52.868Z'
updatedAt: '2026-04-24T15:40:57.293Z'
---

## Description

Adapt the `rails-codex-plugin` `rails-auth-patterns` source skill into the `rails-auth` cosmonauts skill.

**Source:** `/Users/cosmos/Projects/rails-codex-plugin/plugins/rails-codex-plugin/skills/rails-auth-patterns/`
**Target:** `bundled/coding/coding/skills/languages/rails/auth/`

**Expected output files:**
- `SKILL.md`
- `references/patterns.md`

**Required adaptations (spec.md sections 3–5):**
- Frontmatter: `name: rails-auth`, cosmonauts description formula, remove `allowed-tools`.
- Opener: standard one-liner Rails opener referencing `/skill:rails-conventions`, `/skill:rails-stack-profiles`, `/skill:ruby-object-design`, `/skill:ruby-refactoring`.
- Content: preserve auth patterns (Devise, authentication/authorization separation, session management, token auth). Remove generic security or refactoring duplication that overlaps existing cosmonauts skills (Rule C).
- Convert all relative links to `references/...` format (Rule E).
- Add `## Related Skills` at the bottom: link `/skill:rails-conventions`, `/skill:rails-stack-profiles`, `/skill:rails-api`, `/skill:rails-models`, `/skill:find-docs`.

**Read `missions/plans/ruby-rails-skills/spec.md` before writing any file. Complete spec.md section 9 QA checklist before marking Done.**

Acceptance Criteria:
  [x] #1 SKILL.md exists at `bundled/coding/coding/skills/languages/rails/auth/SKILL.md` with frontmatter `name: rails-auth` and no `allowed-tools` field.
  [x] #2 Frontmatter description uses the cosmonauts 'Use when / Do NOT load for' formula.
  [x] #3 Opener uses the standard one-liner Rails preamble.
  [x] #4 `references/patterns.md` exists with auth patterns content.
  [x] #5 Generic security/refactoring prose that duplicates existing cosmonauts skills is removed and cross-linked instead.
  [x] #6 `## Related Skills` section present linking `/skill:rails-conventions`, `/skill:rails-stack-profiles`, `/skill:rails-api`, `/skill:rails-models`, `/skill:find-docs`.
  [x] #7 All relative link targets exist on disk and all cross-skill links use final `/skill:<id>` names (spec.md section 9 checklist green).

<!-- AC:BEGIN -->
- [ ] #1 SKILL.md exists at `bundled/coding/coding/skills/languages/rails/auth/SKILL.md` with frontmatter `name: rails-rails-auth` — wait, correct: `name: rails-auth` and no `allowed-tools` field.
- [ ] #2 Frontmatter description uses the cosmonauts 'Use when / Do NOT load for' formula.
- [ ] #3 Opener uses the standard one-liner Rails preamble.
- [ ] #4 `references/patterns.md` exists with auth patterns content.
- [ ] #5 Generic security/refactoring prose that duplicates existing cosmonauts skills is removed and cross-linked instead.
- [ ] #6 `## Related Skills` section present linking `/skill:rails-conventions`, `/skill:rails-stack-profiles`, `/skill:rails-api`, `/skill:rails-models`, `/skill:find-docs`.
- [ ] #7 All relative link targets exist on disk and all cross-skill links use final `/skill:<id>` names (spec.md section 9 checklist green).
<!-- AC:END -->

## Implementation Notes

Added `bundled/coding/coding/skills/languages/rails/auth/SKILL.md` and `references/patterns.md`, preserving Rails 8 generated auth, Devise/Turbo customization, OmniAuth, session management, one-time token flows, and profile-aware test helpers. Removed generic hardening prose by limiting the reference to auth-specific session settings and deferring broader config review to `/skill:find-docs`. QA checklist completed: read both finished files, verified `references/patterns.md` exists, and checked relative/cross-skill links with a local script. Verification: `bun run test` passed, `bun run typecheck` passed. `bun run lint` fails on unrelated pre-existing formatting in `missions/tasks/config.json`.

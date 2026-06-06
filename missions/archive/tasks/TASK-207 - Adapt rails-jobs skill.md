---
id: TASK-207
title: Adapt rails-jobs skill
status: Done
priority: medium
assignee: worker
labels:
  - backend
  - 'plan:ruby-rails-skills'
dependencies:
  - TASK-194
createdAt: '2026-04-24T15:13:30.749Z'
updatedAt: '2026-04-24T15:48:33.056Z'
---

## Description

Adapt the `rails-codex-plugin` `rails-jobs-patterns` source skill into the `rails-jobs` cosmonauts skill.

**Source:** `/Users/cosmos/Projects/rails-codex-plugin/plugins/rails-codex-plugin/skills/rails-jobs-patterns/`
**Target:** `bundled/coding/coding/skills/languages/rails/jobs/`

**Expected output files:**
- `SKILL.md`
- `references/patterns.md`

**Required adaptations (spec.md sections 3–5):**
- Frontmatter: `name: rails-jobs`, cosmonauts description formula, remove `allowed-tools`.
- Opener: standard one-liner Rails opener referencing `/skill:rails-conventions`, `/skill:rails-stack-profiles`, `/skill:ruby-object-design`, `/skill:ruby-refactoring`.
- Content: preserve ActiveJob/idempotency/retry/backend-selection guidance; meta opener handles profile/backend detection via stack-profiles reference.
- Convert all relative links to `references/...` format (Rule E).
- Add `## Related Skills` at the bottom: link `/skill:rails-conventions`, `/skill:rails-stack-profiles`, `/skill:rails-mailers`, `/skill:rails-devops`, `/skill:find-docs`.

**Read `missions/plans/ruby-rails-skills/spec.md` before writing any file. Complete spec.md section 9 QA checklist before marking Done.**

Acceptance Criteria:
  [x] #1 SKILL.md exists at `bundled/coding/coding/skills/languages/rails/jobs/SKILL.md` with frontmatter `name: rails-jobs` and no `allowed-tools` field.
  [x] #2 Frontmatter description uses the cosmonauts 'Use when / Do NOT load for' formula.
  [x] #3 Opener uses the standard one-liner Rails preamble.
  [x] #4 `references/patterns.md` exists with ActiveJob/idempotency/retry/backend-selection content.
  [x] #5 `## Related Skills` section present linking `/skill:rails-conventions`, `/skill:rails-stack-profiles`, `/skill:rails-mailers`, `/skill:rails-devops`, `/skill:find-docs`.
  [x] #6 All relative link targets exist on disk and all cross-skill links use final `/skill:<id>` names (spec.md section 9 checklist green).

<!-- AC:BEGIN -->
- [ ] #1 SKILL.md exists at `bundled/coding/coding/skills/languages/rails/jobs/SKILL.md` with frontmatter `name: rails-jobs` and no `allowed-tools` field.
- [ ] #2 Frontmatter description uses the cosmonauts 'Use when / Do NOT load for' formula.
- [ ] #3 Opener uses the standard one-liner Rails preamble.
- [ ] #4 `references/patterns.md` exists with ActiveJob/idempotency/retry/backend-selection content.
- [ ] #5 `## Related Skills` section present linking `/skill:rails-conventions`, `/skill:rails-stack-profiles`, `/skill:rails-mailers`, `/skill:rails-devops`, `/skill:find-docs`.
- [ ] #6 All relative link targets exist on disk and all cross-skill links use final `/skill:<id>` names (spec.md section 9 checklist green).
<!-- AC:END -->

## Implementation Notes

Adapted the rails-jobs skill into `bundled/coding/coding/skills/languages/rails/jobs/` with a cosmonauts frontmatter/opener, preserved ActiveJob + idempotency + retry + backend-selection guidance, and moved detailed patterns into `references/patterns.md`. Completed spec.md section 9 QA by re-reading both files, verifying relative link targets via a Node check, and running `bun run lint`, `bun run typecheck`, and `bun run test`.

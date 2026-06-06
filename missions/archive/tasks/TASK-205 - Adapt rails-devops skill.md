---
id: TASK-205
title: Adapt rails-devops skill
status: Done
priority: medium
assignee: worker
labels:
  - devops
  - backend
  - 'plan:ruby-rails-skills'
dependencies:
  - TASK-194
createdAt: '2026-04-24T15:13:12.894Z'
updatedAt: '2026-04-24T15:43:06.199Z'
---

## Description

Adapt the `rails-codex-plugin` `rails-devops-patterns` source skill into the `rails-devops` cosmonauts skill.

**Source:** `/Users/cosmos/Projects/rails-codex-plugin/plugins/rails-codex-plugin/skills/rails-devops-patterns/`
**Target:** `bundled/coding/coding/skills/languages/rails/devops/`

**Expected output files:**
- `SKILL.md`
- `references/patterns.md`

**Required adaptations (spec.md sections 3–5):**
- Frontmatter: `name: rails-devops`, cosmonauts description formula, remove `allowed-tools`.
- Opener: standard one-liner Rails opener referencing `/skill:rails-conventions`, `/skill:rails-stack-profiles`, `/skill:ruby-object-design`, `/skill:ruby-refactoring`.
- Content: preserve deployment/CI/monitoring/security config patterns; keep framework-specific operational guidance.
- Convert all relative links to `references/...` format (Rule E).
- Add `## Related Skills` at the bottom: link `/skill:rails-conventions`, `/skill:rails-stack-profiles`, `/skill:rails-jobs`, `/skill:find-docs`.

**Read `missions/plans/ruby-rails-skills/spec.md` before writing any file. Complete spec.md section 9 QA checklist before marking Done.**

<!-- AC:BEGIN -->
- [ ] #1 SKILL.md exists at `bundled/coding/coding/skills/languages/rails/devops/SKILL.md` with frontmatter `name: rails-devops` and no `allowed-tools` field.
- [ ] #2 Frontmatter description uses the cosmonauts 'Use when / Do NOT load for' formula.
- [ ] #3 Opener uses the standard one-liner Rails preamble.
- [ ] #4 `references/patterns.md` exists with deployment/CI/monitoring/security config content.
- [ ] #5 `## Related Skills` section present linking `/skill:rails-conventions`, `/skill:rails-stack-profiles`, `/skill:rails-jobs`, `/skill:find-docs`.
- [ ] #6 All relative link targets exist on disk and all cross-skill links use final `/skill:<id>` names (spec.md section 9 checklist green).
<!-- AC:END -->

## Implementation Notes

Added `bundled/coding/coding/skills/languages/rails/devops/SKILL.md` and `references/patterns.md`, preserving deployment, CI, monitoring, security, Puma, Docker, and production config guidance from the source skill. Verified frontmatter/opener/related-skills requirements, ran the spec.md section 9 QA checks for relative links and `/skill:<id>` syntax, and confirmed `bun run lint`, `bun run typecheck`, and `bun run test` all pass. All TASK-205 acceptance criteria are satisfied.

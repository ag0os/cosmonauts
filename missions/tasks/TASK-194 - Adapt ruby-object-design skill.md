---
id: TASK-194
title: Adapt ruby-object-design skill
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:ruby-rails-skills'
dependencies: []
createdAt: '2026-04-24T15:10:21.669Z'
updatedAt: '2026-04-24T15:10:21.669Z'
---

## Description

Adapt the `rails-codex-plugin` `ruby-object-design` source skill into a cosmonauts-native skill.

**Source:** `/Users/cosmos/Projects/rails-codex-plugin/plugins/rails-codex-plugin/skills/ruby-object-design/`
**Target:** `bundled/coding/coding/skills/languages/ruby/object-design/`

**Expected output files:**
- `SKILL.md`
- `references/class-vs-module.md`
- `references/data-structures.md`

**Required adaptations (spec.md sections 3–5):**
- Frontmatter: `name: ruby-object-design`, cosmonauts description formula ("Use when / Do NOT load for"), remove `allowed-tools`.
- Opener: add mandatory "Discover Project Conventions First" section (inspect `.ruby-version`, `Gemfile`, framework markers, test runner; suggest loading `/skill:rails-*` if Rails is detected). Mirror TypeScript skill opener intent.
- Content: keep Object Factory Rule, class/module/Data/Struct guidance. Strip Rails-specific service-object exception (Rule A); replace with a redirect to `/skill:rails-services` and `/skill:rails-stack-profiles`. Ruby must be fully framework-agnostic — grep for "ActiveRecord", "Rails", "concern", "STI", "stack profile" and remove/redirect.
- Convert all relative sibling links to `references/...` format (Rule E).
- Redistribution: any Rails-specific notes embedded here that are still useful → note as migrated to `rails-services` or `rails-stack-profiles` for Wave 2/3 workers.
- Add `## Related Skills` at the bottom: link `/skill:ruby-refactoring`, `/skill:engineering-principles`, `/skill:find-docs`.

**Read `missions/plans/ruby-rails-skills/spec.md` before writing any file. Complete spec.md section 9 QA checklist before marking Done.**

<!-- AC:BEGIN -->
- [x] #1 SKILL.md exists at `bundled/coding/coding/skills/languages/ruby/object-design/SKILL.md` with frontmatter `name: ruby-object-design` and no `allowed-tools` field.
- [x] #2 Frontmatter description uses the cosmonauts 'Use when / Do NOT load for' formula in one sentence or two short clauses.
- [x] #3 'Discover Project Conventions First' section is present and covers `.ruby-version`, `Gemfile`, framework detection, and a Rails redirect hint.
- [x] #4 All supporting docs are at `references/class-vs-module.md` and `references/data-structures.md`; all internal markdown links use `references/...` paths.
- [x] #5 SKILL.md contains no Rails-specific implementation guidance — no mentions of ActiveRecord, Rails.logger, ApplicationController, concerns (as Rails decomp tooling), STI, or stack profiles except as explicit `/skill:rails-*` cross-links.
- [x] #6 `## Related Skills` section is present at the bottom linking `/skill:ruby-refactoring`, `/skill:engineering-principles`, and `/skill:find-docs`.
- [x] #7 All relative link targets exist on disk and all cross-skill links use final `/skill:<id>` names (spec.md section 9 checklist fully green).
<!-- AC:END -->

## Implementation Notes

Implemented `bundled/coding/coding/skills/languages/ruby/object-design/SKILL.md` plus `references/class-vs-module.md` and `references/data-structures.md`, preserving the Ruby construct-choice guidance while making the skill framework-agnostic. The old Rails-specific service-object exception was redistributed as explicit redirects to `/skill:rails-services` and `/skill:rails-stack-profiles` instead of embedded guidance. Completed the spec.md section 9 QA checklist, including end-to-end rereads of all finished files and on-disk verification of every `references/...` link target. Verification: `bun run typecheck` ✅, `bun run test` ✅, repo-wide `bun run lint` fails on a pre-existing unrelated formatting issue in `missions/tasks/config.json`; the new markdown skill files are ignored by Biome. Commit: `127dfbb` (`TASK-194: Adapt ruby-object-design skill`).

---
id: TASK-194
title: Adapt ruby-refactoring skill
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:ruby-rails-skills'
dependencies: []
createdAt: '2026-04-24T15:10:21.672Z'
updatedAt: '2026-04-24T15:42:00.000Z'
---

## Description

Adapt the `rails-codex-plugin` `ruby-refactoring` source skill into a cosmonauts-native skill. This task includes mandatory redistribution of Rails-specific sections from the source into Wave 2 targets.

**Source:** `/Users/cosmos/Projects/rails-codex-plugin/plugins/rails-codex-plugin/skills/ruby-refactoring/`
**Target:** `bundled/coding/coding/skills/languages/ruby/refactoring/`

**Expected output files:**
- `SKILL.md`
- `references/code-smells.md`
- `references/refactoring-patterns.md`

**Required adaptations (spec.md sections 3–5):**
- Frontmatter: `name: ruby-refactoring`, cosmonauts description formula, remove `allowed-tools`.
- Opener: add mandatory "Discover Project Conventions First" section (same Ruby project-detection pattern as ruby-object-design).
- Content: defer Fowler catalog, generic refactoring workflow, and prioritization/test-discipline prose to `/skill:refactoring` (Rule C). Keep only Ruby-specific smell interpretation and examples.
- Rule D redistribution (REQUIRED — document destinations for Wave 2 workers):
  - `code-smells.md` section "Shotgun Surgery Across Rails Layers" → content migrates to `rails-architecture/references/patterns.md`
  - `code-smells.md` God model, status fields, lazy concern sections → content migrates to `rails-models/SKILL.md` or `rails-models/references/value-objects.md`
  - After extraction, `references/code-smells.md` contains only Ruby-native smells with no Rails layer references.
- Convert all relative links to `references/...` format (Rule E).
- Add `## Related Skills` at the bottom: link `/skill:ruby-object-design`, `/skill:refactoring`, `/skill:engineering-principles`, `/skill:find-docs`.

**Read `missions/plans/ruby-rails-skills/spec.md` before writing any file. Complete spec.md section 9 QA checklist before marking Done.**

<!-- AC:BEGIN -->
- [x] #1 SKILL.md exists at `bundled/coding/coding/skills/languages/ruby/refactoring/SKILL.md` with frontmatter `name: ruby-refactoring` and no `allowed-tools` field.
- [x] #2 Frontmatter description uses the cosmonauts 'Use when / Do NOT load for' formula.
- [x] #3 'Discover Project Conventions First' section is present covering Ruby version, Gemfile, framework detection, and Rails redirect hint.
- [x] #4 All supporting docs are at `references/code-smells.md` and `references/refactoring-patterns.md` with all internal links using `references/...` paths.
- [x] #5 `references/code-smells.md` contains only Ruby-native smells — Rails-layer sections (Shotgun Surgery Across Rails Layers, God model, status fields, lazy concern) are removed from this file and their substance is documented as redistributed to `rails-architecture` and `rails-models`.
- [x] #6 Generic Fowler catalog / refactoring-workflow / test-discipline prose is replaced with links to `/skill:refactoring` and `/skill:engineering-principles` rather than duplicated.
- [x] #7 `## Related Skills` section present linking `/skill:ruby-object-design`, `/skill:refactoring`, `/skill:engineering-principles`, `/skill:find-docs`. All relative and cross-skill links resolve correctly (spec.md section 9 checklist green).
<!-- AC:END -->

## Implementation Notes

Adapted the Ruby-only skill at `bundled/coding/coding/skills/languages/ruby/refactoring/` with a new `SKILL.md`, `references/code-smells.md`, and `references/refactoring-patterns.md`.

Redistribution completed per spec Rule D:
- Documented Rails-layer shotgun-surgery guidance for `TASK-195` (`rails-architecture`).
- Documented God-model, status-field, and lazy-concern guidance for `TASK-196` (`rails-models`).

Generic Fowler catalog, prioritization workflow, and test-discipline prose now defer to `/skill:refactoring` and `/skill:engineering-principles` instead of being duplicated here.

QA:
- Read the finished `SKILL.md` and both reference files end-to-end.
- Verified `references/...` links resolve on disk.
- `bun run typecheck` passed.
- `bun run test` passed (85 files, 1551 tests).
- `bun run lint` is currently failing on a pre-existing formatter issue in `missions/tasks/config.json`, unrelated to this task.

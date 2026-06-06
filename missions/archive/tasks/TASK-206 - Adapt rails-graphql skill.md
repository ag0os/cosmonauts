---
id: TASK-206
title: Adapt rails-graphql skill
status: Done
priority: medium
assignee: worker
labels:
  - backend
  - api
  - 'plan:ruby-rails-skills'
dependencies:
  - TASK-194
createdAt: '2026-04-24T15:13:22.488Z'
updatedAt: '2026-04-24T15:43:53.590Z'
---

## Description

Adapt the `rails-codex-plugin` `rails-graphql-patterns` source skill into the `rails-graphql` cosmonauts skill.

**Source:** `/Users/cosmos/Projects/rails-codex-plugin/plugins/rails-codex-plugin/skills/rails-graphql-patterns/`
**Target:** `bundled/coding/coding/skills/languages/rails/graphql/`

**Expected output files:**
- `SKILL.md`
- `references/patterns.md`

**Required adaptations (spec.md sections 3–5):**
- Frontmatter: `name: rails-graphql`, cosmonauts description formula, remove `allowed-tools`.
- Opener: standard one-liner Rails opener referencing `/skill:rails-conventions`, `/skill:rails-stack-profiles`, `/skill:ruby-object-design`, `/skill:ruby-refactoring`.
- Content: preserve `graphql-ruby` gem guidance (schema, types, mutations, resolvers, N+1 avoidance with dataloaders).
- Convert all relative links to `references/...` format (Rule E).
- Add `## Related Skills` at the bottom: link `/skill:rails-conventions`, `/skill:rails-stack-profiles`, `/skill:rails-api`, `/skill:rails-models`, `/skill:find-docs`.

**Read `missions/plans/ruby-rails-skills/spec.md` before writing any file. Complete spec.md section 9 QA checklist before marking Done.**

<!-- AC:BEGIN -->
- [ ] #1 SKILL.md exists at `bundled/coding/coding/skills/languages/rails/graphql/SKILL.md` with frontmatter `name: rails-graphql` and no `allowed-tools` field.
- [ ] #2 Frontmatter description uses the cosmonauts 'Use when / Do NOT load for' formula.
- [ ] #3 Opener uses the standard one-liner Rails preamble.
- [ ] #4 `references/patterns.md` exists with graphql-ruby schema/types/mutations/resolvers/N+1 content.
- [ ] #5 `## Related Skills` section present linking `/skill:rails-conventions`, `/skill:rails-stack-profiles`, `/skill:rails-api`, `/skill:rails-models`, `/skill:find-docs`.
- [ ] #6 All relative link targets exist on disk and all cross-skill links use final `/skill:<id>` names (spec.md section 9 checklist green).
<!-- AC:END -->

## Implementation Notes

Completed rails-graphql adaptation at bundled/coding/coding/skills/languages/rails/graphql/. Added SKILL.md with cosmonauts frontmatter, standard Rails opener, required related-skill links, and graphql-ruby guidance for schema/types/mutations/resolvers/subscriptions/dataloader usage. Added references/patterns.md covering RecordLoader, AssociationLoader, CountLoader, connection pagination, schema configuration, base mutation auth hooks, structured user errors, subscriptions, and direct-schema tests. Spec.md section 9 QA checklist completed: supporting docs under references/, internal relative links verified on disk, cross-skill links use final /skill:<id> names. Verification run: bun run lint, bun run typecheck, bun run test. Commit: 73a5912 (TASK-206: Add rails-graphql skill).

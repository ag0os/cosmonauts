# Ruby/Rails Skill Adaptation Rulebook

## Purpose

This spec is the worker-facing contract for adapting the `rails-codex-plugin` skill pack into cosmonauts-native Ruby and Rails skills under `bundled/coding/coding/skills/languages/`.

Workers must treat this as authoritative for formatting, layout, boundary decisions, and QA.

## 1. Canonical target layout

### Ruby

```text
bundled/coding/coding/skills/languages/ruby/
├── object-design/
│   ├── SKILL.md
│   └── references/
│       ├── class-vs-module.md
│       └── data-structures.md
└── refactoring/
    ├── SKILL.md
    └── references/
        ├── code-smells.md
        └── refactoring-patterns.md
```

### Rails

```text
bundled/coding/coding/skills/languages/rails/
├── api/
├── architecture/
├── auth/
├── caching/
├── controllers/
├── conventions/
├── devops/
├── graphql/
├── hotwire/
├── jobs/
├── mailers/
├── models/
├── services/
├── stack-profiles/
├── testing/
└── views/
```

Rule: every leaf directory above contains `SKILL.md`; supporting docs live under a sibling `references/` directory.

## 2. Granularity rules

1. **Keep Ruby split into two skills**:
   - `ruby-object-design`
   - `ruby-refactoring`
2. **Keep one Rails skill per source skill**.
3. **Do not create a root `languages/ruby/SKILL.md` or `languages/rails/SKILL.md` umbrella skill**.
4. **Multi-doc source skills stay one target skill with multiple references**:
   - Models keeps `associations.md`, `migrations.md`, `validations.md`, `value-objects.md`
   - Hotwire keeps `stimulus.md`, `turbo.md`
   - Conventions keeps `detection-commands.md`
   - Stack Profiles keeps `profiles.md`
5. **Do not split a single source Rails skill into multiple target skills**.
6. **When a source section violates target boundaries, move the section to the owning target skill instead of dropping it**.

## 3. Frontmatter template

### Exact template

```yaml
---
name: <public-skill-id>
description: <what it covers>. Use when <positive trigger>. Do NOT load for <negative trigger>.
---
```

### Rules

- Keep only `name` and `description`.
- Remove `allowed-tools` everywhere.
- `name` must match the public skill ID, not the leaf directory alone.
- Description must be one sentence or two short clauses, not trigger-list prose.
- Prefer “Do NOT load for ...” over “NOT for ...”.

### Example — source to target

**Before**

```yaml
---
name: rails-model-patterns
description: Analyzes and recommends ActiveRecord model patterns including associations, validations, scopes, callbacks, migrations, and query optimization. Use when designing models, reviewing schema, adding associations (has_many, belongs_to), writing validations, creating scopes, or planning migrations. NOT for controller logic, routing, view rendering, or service object design.
allowed-tools: Read, Grep, Glob
---
```

**After**

```yaml
---
name: rails-models
description: ActiveRecord model patterns for associations, validations, scopes, callbacks, and migrations. Use when designing models or reviewing schema and persistence rules. Do NOT load for controller flow, view rendering, or service orchestration.
---
```

## 4. Top-of-file structure templates

### Ruby SKILL.md template

```md
# Ruby ...

## Discover Project Conventions First

Before writing Ruby code, inspect:
1. `.ruby-version` for Ruby version and `Data.define` availability.
2. `Gemfile` for framework/runtime/libraries.
3. Project structure to detect Rails/Sinatra/Hanami/Roda/pure Ruby.
4. Test runner and linter setup.

If Rails is present, load the relevant `/skill:rails-*` skill for framework-specific guidance.
```

Requirements:
- This section is mandatory in both Ruby skills.
- It should mirror the intent of `bundled/coding/coding/skills/languages/typescript/SKILL.md:10` but be Ruby-specific.

### Rails SKILL.md template

```md
# Rails ...

Use `/skill:rails-conventions` and `/skill:rails-stack-profiles` first to match the repo’s conventions and profile. Assume `/skill:ruby-object-design` and `/skill:ruby-refactoring` are available for Ruby-level decisions.
```

Requirements:
- This one-liner replaces the source pack’s repeated long preflight blocks.
- Do not re-copy the 4-step preflight list into every Rails skill.

## 5. Content rewrite rules

### Rule A — Ruby must be framework-agnostic

Remove Rails-specific guidance from Ruby targets.

Cut or rewrite any source content that refers to:
- ActiveRecord
- concerns as Rails decomposition tooling
- service-oriented Rails profiles
- STI or other Rails architecture choices
- stack profiles
- Rails controllers/views/jobs/mailers

**Example**

**Before**
```md
Exception: Service classes ARE appropriate when the Rails project follows service-oriented patterns consistently.
```

**After**
```md
Match the project’s existing Ruby conventions. If the project is a Rails app with established service-object patterns, load `/skill:rails-services` and `/skill:rails-stack-profiles` for framework-specific guidance.
```

### Rule B — Rails must not re-teach Ruby

When a Rails source file explains a Ruby-level concept, cut the explanation and link to Ruby.

Defer these topics to Ruby skills:
- Object Factory Rule
- class vs module as a Ruby design choice
- Struct/Data/Hash graduation
- immutable value-object basics
- generic code-smell catalog

**Example**

**Before**
```md
## Data vs Struct Decision
- Ruby 3.2+: Use `Data.define`
- Ruby < 3.2: Use `Struct.new` ...
```

**After**
```md
For choosing between `Hash`, `Struct`, `Data`, and `Class`, load `/skill:ruby-object-design`.
This reference covers the Rails-specific integration points once you already know the Ruby construct you want.
```

### Rule C — Generic refactoring/design/testing philosophy defers to existing cosmonauts skills

Do not duplicate these topics inside Ruby/Rails targets:
- Fowler catalog and generic refactoring workflow → `/skill:refactoring`
- SOLID, cohesion, coupling, dependency direction, complexity management → `/skill:engineering-principles`
- language-agnostic testing philosophy → `/skill:engineering-principles`

Use short cross-links instead of re-explaining the full topic.

### Rule D — Preserve source content through redistribution

If a section is removed because it violates target boundaries, move its substance to the right target skill.

Required migrations:
- `ruby-refactoring/code-smells.md` Rails-layer smell sections → `rails-architecture` and `rails-models`
- `rails-model-patterns/value-objects.md` Ruby construct-choice sections → link to `ruby-object-design`; keep Rails persistence/integration content in `rails-models/references/value-objects.md`
- any Rails-specific notes embedded in `ruby-object-design` → `rails-services` or `rails-stack-profiles` if still useful

### Rule E — Convert relative links to `references/`

Examples:
- `[patterns.md](patterns.md)` → `[patterns.md](references/patterns.md)`
- `[stimulus.md](stimulus.md)` → `[stimulus.md](references/stimulus.md)`
- `[data-structures.md](data-structures.md)` → `[data-structures.md](references/data-structures.md)`

Do not use absolute filesystem paths inside skill content.

## 6. Reference-file handling rules

1. Preserve source filenames inside `references/` where possible.
2. Do not inline large supporting docs into `SKILL.md` just to avoid a `references/` directory.
3. Reference docs may be rewritten heavily, but they remain subordinate to the parent skill.
4. If a reference doc becomes entirely generic and no longer belongs to its parent skill, replace it with a short pointer to the owning existing cosmonauts skill instead of duplicating content.

## 7. Related Skills template

Every `SKILL.md` must end with:

```md
## Related Skills

- `/skill:<peer-skill>` — ...
- `/skill:engineering-principles` — ...
- `/skill:refactoring` — ...
- `/skill:find-docs` — ...
```

### Minimum expectations

#### Ruby skills
- Link the other Ruby skill.
- Link `/skill:engineering-principles` when design/testing/architecture themes appear.
- Link `/skill:refactoring` from `ruby-refactoring` only if it is deferring generic catalog/workflow content.
- Link `/skill:find-docs`.

#### Rails skills
- Link `/skill:rails-conventions`.
- Link `/skill:rails-stack-profiles`.
- Link the most relevant peer Rails skills.
- Link `/skill:ruby-object-design` and/or `/skill:ruby-refactoring` when the skill touches Ruby-level choices.
- Link `/skill:engineering-principles` and `/skill:refactoring` only where the content actually defers to them.
- Link `/skill:find-docs`.

## 8. Per-skill naming map

| Target path | `name` field |
|---|---|
| `languages/ruby/object-design/` | `ruby-object-design` |
| `languages/ruby/refactoring/` | `ruby-refactoring` |
| `languages/rails/api/` | `rails-api` |
| `languages/rails/architecture/` | `rails-architecture` |
| `languages/rails/auth/` | `rails-auth` |
| `languages/rails/caching/` | `rails-caching` |
| `languages/rails/controllers/` | `rails-controllers` |
| `languages/rails/conventions/` | `rails-conventions` |
| `languages/rails/devops/` | `rails-devops` |
| `languages/rails/graphql/` | `rails-graphql` |
| `languages/rails/hotwire/` | `rails-hotwire` |
| `languages/rails/jobs/` | `rails-jobs` |
| `languages/rails/mailers/` | `rails-mailers` |
| `languages/rails/models/` | `rails-models` |
| `languages/rails/services/` | `rails-services` |
| `languages/rails/stack-profiles/` | `rails-stack-profiles` |
| `languages/rails/testing/` | `rails-testing` |
| `languages/rails/views/` | `rails-views` |

## 9. Worker QA checklist

A worker must not mark a skill task done until all checks pass.

### Structural checks
- [ ] Correct target directory and `SKILL.md` path created.
- [ ] `name` field matches the naming map above.
- [ ] `description` uses the cosmonauts “Use when / Do NOT load for” formula.
- [ ] `allowed-tools` removed.
- [ ] All supporting docs moved under `references/`.
- [ ] All internal markdown links updated to `references/...`.
- [ ] `Related Skills` section added at the bottom of `SKILL.md`.

### Boundary checks
- [ ] Ruby skill contains no Rails implementation advice except explicit cross-links to Rails skills.
- [ ] Rails skill does not duplicate Ruby construct-choice teaching.
- [ ] Generic refactoring/design/testing prose is replaced with links to existing cosmonauts skills where required.
- [ ] Any removed conflicting section has an explicit destination in another target skill or a deliberate deferral to an existing cosmonauts skill.

### Content-preservation checks
- [ ] Every source reference file for this skill is either adapted into `references/` or intentionally collapsed into the parent `SKILL.md` with equivalent content.
- [ ] No source subsection was silently dropped.
- [ ] Examples remain framework-appropriate for the target skill boundary.

### Final read-through checks
- [ ] Read the finished `SKILL.md` end-to-end once after writing.
- [ ] Read each `references/*.md` file once after writing.
- [ ] Verify every relative link target exists on disk.
- [ ] Verify cross-skill links use the final `/skill:<id>` names.

## 10. Review notes for migrated edge cases

These edge cases must be reviewed carefully during implementation:

1. **`ruby-refactoring/references/code-smells.md`**
   - Remove Rails-specific headings.
   - Preserve their substance in `rails-architecture` / `rails-models`.
2. **`rails/models/references/value-objects.md`**
   - Keep ActiveRecord type / JSON column integration.
   - Replace pure Ruby construct-choice teaching with a link to `/skill:ruby-object-design`.
3. **`rails/hotwire/SKILL.md`**
   - Keep both `stimulus.md` and `turbo.md`; do not collapse them into one reference.
4. **Rails skill openers**
   - Must be consistent across all Rails skills.
   - Must not reintroduce the old verbose preflight boilerplate.

## 11. Done definition for the full adaptation

The adaptation is done when:
- all 18 target skills exist at the planned paths
- every target `SKILL.md` uses cosmonauts frontmatter and structure
- every supporting doc lives under `references/`
- Ruby skills are framework-agnostic
- Rails skills reference Ruby/meta skills instead of duplicating them
- all source content has a preserved home or deliberate cross-skill deferral
- reviewers can navigate every relative link successfully

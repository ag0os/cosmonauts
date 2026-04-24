---
title: Adapt rails-codex-plugin Ruby/Rails skills into cosmonauts
status: active
createdAt: '2026-04-23T19:15:38.873Z'
updatedAt: '2026-04-23T19:15:38.873Z'
---

## Summary

Adapt the `rails-codex-plugin` Ruby/Rails skill pack into cosmonauts’ nested language skill layout under `bundled/coding/coding/skills/languages/`, preserving source guidance while rewriting it to cosmonauts conventions and existing cross-skill boundaries. The plan produces a granular Ruby + Rails skill tree that is auto-discoverable by the current loader, exportable with supporting references intact, and structured so the task-manager can generate mostly independent per-skill worker tasks.

## Scope

Included:
- Create new nested skills under `bundled/coding/coding/skills/languages/ruby/` and `bundled/coding/coding/skills/languages/rails/`.
- Adapt every source `SKILL.md` and sibling `.md` doc from `/Users/cosmos/Projects/rails-codex-plugin/plugins/rails-codex-plugin/skills/` into cosmonauts format.
- Rewrite frontmatter, directory layout, relative links, opening guidance, and Related Skills sections.
- Preserve source content by either carrying it into the target skill/references or explicitly redistributing Rails-specific material from Ruby sources into the relevant Rails skills.
- Keep the work content-only: new markdown skill files, no runtime or loader changes.

Excluded:
- No changes to skill discovery, export, session assembly, agent definitions, workflows, or CLI.
- No task creation in this plan.
- No new automated skill validator in this plan; verification is via worker QA checklist plus review.
- No adaptation of non-Ruby/Rails plugin assets outside the source skills tree.

Assumptions:
- The user’s “19 skill packs” count includes `project-conventions/detection-commands.md` as a meta artifact; the source tree contains 18 skill directories plus supporting docs.
- Existing generic cosmonauts skills remain the canonical home for language-agnostic refactoring/design/testing advice: `bundled/coding/coding/skills/refactoring/SKILL.md:3,10,158` and `bundled/coding/coding/skills/engineering-principles/SKILL.md:3,56,94,163`.
- Nested `languages/.../.../SKILL.md` skills are valid without loader work because discovery is recursive and keyed by frontmatter name in `lib/skills/discovery.ts:29,52,108-109,134-137`, with coverage in `tests/skills/discovery.test.ts:76-92`.

## Decision Log

- **D-001 — Split Ruby into two skills**
  - Decision: Create `ruby-object-design` and `ruby-refactoring` as separate nested skills under `languages/ruby/`.
  - Alternatives: Collapse them into a single `ruby` skill; keep source names but place them flat at `skills/` root.
  - Why: The architectural direction already prefers one cosmonauts skill per source skill. The source documents are materially different in purpose (`ruby-object-design` centers on construct selection and value objects; `ruby-refactoring` centers on smells/refactoring workflow), and keeping them separate gives Rails skills precise cross-links (`/skill:ruby-object-design` vs `/skill:ruby-refactoring`) instead of a catch-all Ruby skill. The task count rises to 18, but that is preferable to losing the settled granularity.
  - Decided by: planner-proposed

- **D-002 — Use nested `languages/ruby/*` and `languages/rails/*` directories with local `references/` folders**
  - Decision: Mirror the existing `typescript` and `react` precedent: each target skill gets a `SKILL.md` at its own directory root plus an optional `references/` subdirectory for deep dives.
  - Alternatives: Flatten all skills directly under `skills/`; keep sibling docs beside `SKILL.md` instead of inside `references/`.
  - Why: `bundled/coding/coding/skills/languages/typescript/SKILL.md:10,177,186` and `bundled/coding/coding/skills/languages/react/SKILL.md:28,173,180` establish the desired layout, while `lib/skills/exporter.ts:67,77` already copies whole skill directories with supporting files intact.
  - Decided by: planner-proposed

- **D-003 — Rails skills depend conceptually on Ruby + Rails meta skills, not duplicated prose**
  - Decision: Every Rails skill will open by pointing to `/skill:rails-conventions` and `/skill:rails-stack-profiles`, and will assume Ruby-level guidance is handled by `/skill:ruby-object-design` and `/skill:ruby-refactoring` when relevant.
  - Alternatives: Repeat preflight and Ruby explanations inside every Rails skill; centralize all detection into a single giant Rails root skill.
  - Why: The source already uses repeated preflight instructions (`rails-model-patterns/SKILL.md:18`, `rails-stack-profiles/SKILL.md:13`, `project-conventions/SKILL.md:32`, `hotwire-patterns/SKILL.md:11`). Centralizing detection references reduces duplication while preserving skill-specific guidance.
  - Decided by: planner-proposed

- **D-004 — Preserve content by redistribution when source boundaries conflict with target rules**
  - Decision: When source Ruby docs contain Rails-specific content, strip it from the Ruby target and migrate the useful Rails-specific guidance into the most relevant Rails skills.
  - Alternatives: Leave Rails content in Ruby skills; drop conflicting sections entirely.
  - Why: The source contains explicit Rails-specific refactoring heuristics in `ruby-refactoring/code-smells.md:5,25,47,58,68` and Rails-flavored value-object content in `rails-model-patterns/value-objects.md:17,57,105`. Keeping overall content coverage while enforcing framework boundaries requires redistribution, not deletion.
  - Decided by: planner-proposed

- **D-005 — Preserve sibling reference filenames inside `references/` where possible**
  - Decision: Keep existing filenames such as `patterns.md`, `profiles.md`, `detection-commands.md`, `stimulus.md`, `turbo.md`, `associations.md`, and `data-structures.md` under each skill’s `references/` directory.
  - Alternatives: Rename every reference file to globally unique names; inline all support docs into SKILL bodies.
  - Why: Preserving filenames minimizes rewrite churn and keeps the adaptation mechanical, while moving them under `references/` matches cosmonauts precedent.
  - Decided by: planner-proposed

## Design

### Module structure

This plan introduces two new skill subtrees under the existing language skill root:

```text
bundled/coding/coding/skills/languages/
├── ruby/
│   ├── object-design/
│   │   ├── SKILL.md
│   │   └── references/
│   │       ├── class-vs-module.md
│   │       └── data-structures.md
│   └── refactoring/
│       ├── SKILL.md
│       └── references/
│           ├── code-smells.md
│           └── refactoring-patterns.md
└── rails/
    ├── api/
    │   ├── SKILL.md
    │   └── references/patterns.md
    ├── architecture/
    │   ├── SKILL.md
    │   └── references/patterns.md
    ├── auth/
    │   ├── SKILL.md
    │   └── references/patterns.md
    ├── caching/
    │   ├── SKILL.md
    │   └── references/patterns.md
    ├── controllers/
    │   ├── SKILL.md
    │   └── references/patterns.md
    ├── conventions/
    │   ├── SKILL.md
    │   └── references/detection-commands.md
    ├── devops/
    │   ├── SKILL.md
    │   └── references/patterns.md
    ├── graphql/
    │   ├── SKILL.md
    │   └── references/patterns.md
    ├── hotwire/
    │   ├── SKILL.md
    │   └── references/
    │       ├── stimulus.md
    │       └── turbo.md
    ├── jobs/
    │   ├── SKILL.md
    │   └── references/patterns.md
    ├── mailers/
    │   ├── SKILL.md
    │   └── references/patterns.md
    ├── models/
    │   ├── SKILL.md
    │   └── references/
    │       ├── associations.md
    │       ├── migrations.md
    │       ├── validations.md
    │       └── value-objects.md
    ├── services/
    │   ├── SKILL.md
    │   └── references/patterns.md
    ├── stack-profiles/
    │   ├── SKILL.md
    │   └── references/profiles.md
    ├── testing/
    │   ├── SKILL.md
    │   └── references/patterns.md
    └── views/
        ├── SKILL.md
        └── references/patterns.md
```

Single responsibility by subtree:
- `languages/ruby/object-design/` — pure Ruby construct choice, value objects, class/module/data-structure guidance.
- `languages/ruby/refactoring/` — Ruby-specific smell recognition and refactoring heuristics that are not already owned by generic cosmonauts refactoring skills.
- `languages/rails/conventions/` — project convention detection and convention fingerprinting.
- `languages/rails/stack-profiles/` — profile detection and profile-aware recommendation branching.
- Remaining `languages/rails/*/` skills — framework/domain-specific guidance only for that slice of Rails.

### Dependency graph

Conceptual dependency order for content, links, and worker sequencing:

```text
ruby-object-design     ruby-refactoring
        \                 /
         \               /
          -> rails domain skills

rails-conventions -> rails domain skills
rails-stack-profiles -> rails domain skills

engineering-principles / refactoring / find-docs
        -> referenced from Ruby and Rails skills as external related skills
```

Rules:
- Ruby skills are framework-agnostic and must not depend on Rails concepts.
- Rails skills may reference Ruby skills but must not restate Ruby-level guidance.
- `rails-conventions` and `rails-stack-profiles` are foundational meta skills; all other Rails skills reference them in their opener or Related Skills section.
- `references/*.md` files belong only to their parent skill and are loaded on demand via relative links from that parent `SKILL.md`.

### Key contracts

#### Contract 1 — Directory and naming contract

Every target skill directory must contain a `SKILL.md`. Frontmatter `name` must be the public skill ID, not just the leaf directory name.

```yaml
---
name: rails-models
description: ActiveRecord model patterns. Use when designing models, associations, validations, scopes, or migrations. Do NOT load for controller flow, view rendering, or service orchestration.
---
```

Implications:
- `languages/rails/models/SKILL.md` must declare `name: rails-models`.
- `languages/ruby/object-design/SKILL.md` must declare `name: ruby-object-design`.
- `allowed-tools` is removed everywhere.

#### Contract 2 — Ruby opener contract

Both Ruby skills open with a `## Discover Project Conventions First` section modeled on TypeScript’s project-detection preamble (`bundled/coding/coding/skills/languages/typescript/SKILL.md:10`) but rewritten for Ruby:
- inspect `.ruby-version`
- inspect `Gemfile`
- detect framework markers (Rails/Sinatra/Hanami/Roda)
- detect test runner and linter
- if Rails is present, explicitly suggest loading relevant `/skill:rails-*` skills

#### Contract 3 — Rails opener contract

Every Rails skill starts with a one-line preamble that:
- points to `/skill:rails-conventions` and `/skill:rails-stack-profiles` for repo detection
- states that Ruby-level guidance is assumed from `/skill:ruby-object-design` and `/skill:ruby-refactoring`
- does not duplicate the full repeated preflight checklist from the source pack

#### Contract 4 — Related Skills contract

Every target `SKILL.md` ends with a `## Related Skills` section linking:
- directly adjacent Ruby/Rails peers
- `/skill:engineering-principles` when the skill touches architecture/testing/design trade-offs
- `/skill:refactoring` when the skill currently duplicates generic refactoring catalog material
- `/skill:find-docs` for framework/library API lookups

#### Contract 5 — Redistribution contract for conflicting source content

When a source file violates the target boundary, workers must preserve the useful content by moving it to the owning target skill instead of leaving it in place or dropping it.
Examples:
- `ruby-refactoring/code-smells.md:25` (“Shotgun Surgery Across Rails Layers”) migrates into `languages/rails/architecture/SKILL.md` or its `references/patterns.md`.
- `ruby-refactoring/code-smells.md:47,58,68` (God model, status fields, lazy concern) migrate into `languages/rails/models/SKILL.md` or `references/value-objects.md` where relevant.
- `rails-model-patterns/value-objects.md:17` (Data vs Struct selection) links to `/skill:ruby-object-design`, while `value-objects.md:57` (Rails DB integration) stays in the Rails models reference.

### Integration seams

Verified integration seams and the contract at each seam:

- **Skill discovery accepts nested skills** — `lib/skills/discovery.ts:29,52,124,134-137` recursively scans for `SKILL.md` under subdirectories and exposes the frontmatter `name`/`description`; `tests/skills/discovery.test.ts:76-92` explicitly covers a nested `skills/languages/typescript/SKILL.md` skill. This means `languages/ruby/object-design/SKILL.md` and `languages/rails/models/SKILL.md` will be discoverable without runtime changes.
- **Flat-vs-directory skill behavior is already codified** — `lib/skills/discovery.ts:6,108-109` documents the split between flat root `.md` skills and nested directory skills. The new Ruby/Rails skills must therefore be directory skills, not root-level markdown files.
- **Supporting docs export intact** — `lib/skills/exporter.ts:67,77` copies the entire skill directory recursively, so `references/` docs are safe to rely on when skills are exported to external harnesses.
- **Target format precedent exists** — `bundled/coding/coding/skills/languages/typescript/SKILL.md:10,177,186` and `bundled/coding/coding/skills/languages/react/SKILL.md:28,173,180` verify the expected `Discover Project Conventions First`, `Reference Guides`, and `Related Skills` pattern for language skills.
- **Generic deferral endpoints exist today** — `bundled/coding/coding/skills/refactoring/SKILL.md:3,10,158` and `bundled/coding/coding/skills/engineering-principles/SKILL.md:3,56,94,163` are already the correct homes for Fowler-style refactoring, dependency direction, and language-agnostic testing philosophy. `bundled/coding/coding/skills/find-docs/SKILL.md:14` exists for documentation lookup references.
- **Source pack structure confirmed** — sampled source skills show the exact adaptation work required: repeated `allowed-tools` removal and preflight compression in `rails-model-patterns/SKILL.md:4,11-18`, repo-detection emphasis in `rails-stack-profiles/SKILL.md:11,13,24`, convention fingerprinting in `project-conventions/SKILL.md:12,32,42,53,86`, and multi-doc reference handling in `hotwire-patterns/SKILL.md:11,30-33` and `ruby-object-design/SKILL.md:11,98,133`.

### Seams for change

These are the only intentionally flexible seams:
- **Reference depth per skill** — each skill can add or trim files under `references/` later without changing skill discovery or the public skill ID.
- **Rails meta-skill guidance** — if cosmonauts later grows a reusable repo-detection skill, only the Rails opener text and Related Skills sections need revision.
- **Ruby/Rails redistribution rules** — if future language skills are added (e.g. ActiveRecord-specific or GraphQL-language boundary skills), the content boundary is explicit enough to re-home subsections without reorganizing the whole tree.

## Approach

### Target format strategy

Adapt every source skill into a cosmonauts-native shape instead of copying verbatim:
- rewrite frontmatter to the concise cosmonauts formula
- remove `allowed-tools`
- move sibling docs under `references/`
- add an explicit `Related Skills` section
- replace trigger-list prose with “Use when / Do NOT load for” descriptions

### Ruby strategy

`ruby-object-design` becomes a pure Ruby skill. Keep the Object Factory Rule, class/module/Data/Struct guidance, and supporting references from `ruby-object-design/SKILL.md:11,98,133`, but remove Rails-specific carve-outs such as service-oriented profile exceptions. When Rails-specific nuance is still useful, point readers to `/skill:rails-services` or `/skill:rails-stack-profiles` rather than embedding Rails logic.

`ruby-refactoring` remains separate but slimmer. Keep Ruby-specific smell interpretation and examples, but delete or redirect language-agnostic material already covered by `/skill:refactoring` and `/skill:engineering-principles`. Rails-specific smell sections from `ruby-refactoring/code-smells.md:5,25,47,58,68` are redistributed into Rails architecture/models instead of preserved verbatim in the Ruby skill.

### Rails strategy

Create one Rails skill per source skill, plus two meta skills:
- `rails-conventions` from `project-conventions`
- `rails-stack-profiles` from `rails-stack-profiles`

All other Rails skills become domain-specific wrappers around source content with shorter openers. They assume convention/profile detection is already available and focus on action-oriented guidance for that slice of Rails.

### Content-merge strategy for multi-doc skills

- **Models** — keep `associations.md`, `migrations.md`, `validations.md`, and `value-objects.md` as references; rewrite `value-objects.md` to preserve Rails persistence/integration patterns while linking Ruby-level construct choice to `/skill:ruby-object-design`.
- **Hotwire** — keep `stimulus.md` and `turbo.md` as references under `references/`; `SKILL.md` stays focused on chooser guidance and gotchas.
- **Stack profiles** — keep `profiles.md` as the deep dive; `SKILL.md` remains the detection/dispatch entry point.
- **Conventions** — keep `detection-commands.md` as the deep dive; `SKILL.md` remains the convention-fingerprint entry point.

### Per-skill mapping table

Source root: `/Users/cosmos/Projects/rails-codex-plugin/plugins/rails-codex-plugin/skills/`

Target root: `bundled/coding/coding/skills/languages/`

| Source | Target | Files | Key adaptations |
|---|---|---|---|
| `ruby-object-design/` | `ruby/object-design/` | `SKILL.md`, `references/class-vs-module.md`, `references/data-structures.md` | Rewrite frontmatter; add Ruby project-detection opener; keep Object Factory Rule; strip Rails-specific service-object exception; add Related Skills pointing to `ruby-refactoring`, `engineering-principles`, `find-docs`. |
| `ruby-refactoring/` | `ruby/refactoring/` | `SKILL.md`, `references/code-smells.md`, `references/refactoring-patterns.md` | Rewrite frontmatter; add Ruby project-detection opener; defer Fowler catalog/prioritization/test-discipline to `/skill:refactoring`; remove Rails-specific sections from Ruby docs and migrate them into Rails skills; add Related Skills. |
| `project-conventions/` | `rails/conventions/` | `SKILL.md`, `references/detection-commands.md` | Rename skill to `rails-conventions`; keep Convention Fingerprint format; compress opener to point readers here from all Rails skills; convert relative links to `references/detection-commands.md`. |
| `rails-stack-profiles/` | `rails/stack-profiles/` | `SKILL.md`, `references/profiles.md` | Keep profile detection and hybrid guidance; shorten opener; rename to `rails-stack-profiles`; ensure every Rails skill references it for branching by stack style. |
| `rails-architecture-patterns/` | `rails/architecture/` | `SKILL.md`, `references/patterns.md` | Rename to `rails-architecture`; absorb Rails-layer shotgun-surgery guidance migrated from `ruby-refactoring/code-smells.md`; keep skill-routing/orchestration role. |
| `rails-model-patterns/` | `rails/models/` | `SKILL.md`, `references/associations.md`, `references/migrations.md`, `references/validations.md`, `references/value-objects.md` | Rename to `rails-models`; keep AR-specific guidance; remove duplicated Struct/Data teaching from `value-objects.md` and link to `/skill:ruby-object-design`; absorb God-model/status/lazy-concern refactoring guidance. |
| `rails-service-patterns/` | `rails/services/` | `SKILL.md`, `references/patterns.md` | Rename to `rails-services`; preserve service/result/query/form-object guidance; link generic refactoring advice to `/skill:refactoring`; link Ruby object shape choices to `/skill:ruby-object-design` when discussing result structs. |
| `rails-controller-patterns/` | `rails/controllers/` | `SKILL.md`, `references/patterns.md` | Rename to `rails-controllers`; shorten opener to meta-skill references; preserve routing/params/response guidance. |
| `rails-api-patterns/` | `rails/api/` | `SKILL.md`, `references/patterns.md` | Rename to `rails-api`; preserve REST, serializers, versioning, pagination, error-shape guidance; Related Skills should point to `rails-auth`, `rails-controllers`, `rails-graphql` as applicable. |
| `rails-auth-patterns/` | `rails/auth/` | `SKILL.md`, `references/patterns.md` | Rename to `rails-auth`; preserve auth patterns; remove generic security/refactoring duplication where it overlaps existing skills. |
| `rails-caching-patterns/` | `rails/caching/` | `SKILL.md`, `references/patterns.md` | Rename to `rails-caching`; keep fragment/low-level/HTTP caching and invalidation guidance; Related Skills link to `rails-views`, `rails-hotwire`, `find-docs`. |
| `rails-devops-patterns/` | `rails/devops/` | `SKILL.md`, `references/patterns.md` | Rename to `rails-devops`; preserve deployment/CI/monitoring/security config patterns; keep framework-specific operational guidance. |
| `rails-graphql-patterns/` | `rails/graphql/` | `SKILL.md`, `references/patterns.md` | Rename to `rails-graphql`; preserve `graphql-ruby` guidance; Related Skills link to `rails-api`, `rails-models`, `find-docs`. |
| `rails-jobs-patterns/` | `rails/jobs/` | `SKILL.md`, `references/patterns.md` | Rename to `rails-jobs`; preserve ActiveJob/idempotency/retry/backend guidance; meta opener handles profile/backend detection. |
| `rails-mailer-patterns/` | `rails/mailers/` | `SKILL.md`, `references/patterns.md` | Rename to `rails-mailers`; preserve Action Mailer guidance; shorten description into cosmonauts formula. |
| `rails-testing-patterns/` | `rails/testing/` | `SKILL.md`, `references/patterns.md` | Rename to `rails-testing`; preserve Rails-specific choice of test types/framework conventions; defer general testing philosophy to `/skill:engineering-principles`. |
| `rails-views-patterns/` | `rails/views/` | `SKILL.md`, `references/patterns.md` | Rename to `rails-views`; preserve ERB/partials/forms/cache/accessibility guidance; link Hotwire-specific advice to `rails-hotwire`. |
| `hotwire-patterns/` | `rails/hotwire/` | `SKILL.md`, `references/stimulus.md`, `references/turbo.md` | Rename to `rails-hotwire`; preserve server-first chooser guidance and gotchas; keep both supporting docs in `references/`; update all links. |

## Files to Change

Create these new files:
- `bundled/coding/coding/skills/languages/ruby/object-design/SKILL.md` -- adapted pure Ruby object-design skill
- `bundled/coding/coding/skills/languages/ruby/object-design/references/class-vs-module.md` -- migrated deep-dive on Ruby-native alternatives
- `bundled/coding/coding/skills/languages/ruby/object-design/references/data-structures.md` -- Ruby Hash/Struct/Data/Class graduation guide
- `bundled/coding/coding/skills/languages/ruby/refactoring/SKILL.md` -- adapted Ruby refactoring skill with generic deferrals
- `bundled/coding/coding/skills/languages/ruby/refactoring/references/code-smells.md` -- Ruby-only smell guide after Rails-specific content extraction
- `bundled/coding/coding/skills/languages/ruby/refactoring/references/refactoring-patterns.md` -- Ruby-specific pattern selection deep dive
- `bundled/coding/coding/skills/languages/rails/conventions/SKILL.md` -- convention-detection entry skill
- `bundled/coding/coding/skills/languages/rails/conventions/references/detection-commands.md` -- repo scan recipes
- `bundled/coding/coding/skills/languages/rails/stack-profiles/SKILL.md` -- profile-detection entry skill
- `bundled/coding/coding/skills/languages/rails/stack-profiles/references/profiles.md` -- omakase/service/api-first deep dive
- `bundled/coding/coding/skills/languages/rails/architecture/SKILL.md` -- Rails architecture chooser skill
- `bundled/coding/coding/skills/languages/rails/architecture/references/patterns.md` -- deep-dive architectural patterns and migrated cross-layer refactoring notes
- `bundled/coding/coding/skills/languages/rails/models/SKILL.md` -- ActiveRecord models skill
- `bundled/coding/coding/skills/languages/rails/models/references/associations.md` -- model association reference
- `bundled/coding/coding/skills/languages/rails/models/references/migrations.md` -- migration safety reference
- `bundled/coding/coding/skills/languages/rails/models/references/validations.md` -- validation strategy reference
- `bundled/coding/coding/skills/languages/rails/models/references/value-objects.md` -- Rails integration patterns for value objects
- `bundled/coding/coding/skills/languages/rails/services/SKILL.md` -- Rails service-object skill
- `bundled/coding/coding/skills/languages/rails/services/references/patterns.md` -- service/result/query/form-object deep dive
- `bundled/coding/coding/skills/languages/rails/controllers/SKILL.md` -- controller patterns skill
- `bundled/coding/coding/skills/languages/rails/controllers/references/patterns.md` -- controller reference patterns
- `bundled/coding/coding/skills/languages/rails/api/SKILL.md` -- Rails API skill
- `bundled/coding/coding/skills/languages/rails/api/references/patterns.md` -- REST API patterns reference
- `bundled/coding/coding/skills/languages/rails/auth/SKILL.md` -- Rails auth skill
- `bundled/coding/coding/skills/languages/rails/auth/references/patterns.md` -- auth patterns reference
- `bundled/coding/coding/skills/languages/rails/caching/SKILL.md` -- Rails caching skill
- `bundled/coding/coding/skills/languages/rails/caching/references/patterns.md` -- caching patterns reference
- `bundled/coding/coding/skills/languages/rails/devops/SKILL.md` -- Rails devops skill
- `bundled/coding/coding/skills/languages/rails/devops/references/patterns.md` -- deployment/infrastructure reference
- `bundled/coding/coding/skills/languages/rails/graphql/SKILL.md` -- Rails GraphQL skill
- `bundled/coding/coding/skills/languages/rails/graphql/references/patterns.md` -- graphql-ruby reference
- `bundled/coding/coding/skills/languages/rails/jobs/SKILL.md` -- Rails jobs skill
- `bundled/coding/coding/skills/languages/rails/jobs/references/patterns.md` -- background job reference
- `bundled/coding/coding/skills/languages/rails/mailers/SKILL.md` -- Rails mailers skill
- `bundled/coding/coding/skills/languages/rails/mailers/references/patterns.md` -- Action Mailer reference
- `bundled/coding/coding/skills/languages/rails/testing/SKILL.md` -- Rails testing skill
- `bundled/coding/coding/skills/languages/rails/testing/references/patterns.md` -- Rails testing reference
- `bundled/coding/coding/skills/languages/rails/views/SKILL.md` -- Rails views skill
- `bundled/coding/coding/skills/languages/rails/views/references/patterns.md` -- ERB/partials/forms reference
- `bundled/coding/coding/skills/languages/rails/hotwire/SKILL.md` -- Rails Hotwire skill
- `bundled/coding/coding/skills/languages/rails/hotwire/references/stimulus.md` -- Stimulus deep dive
- `bundled/coding/coding/skills/languages/rails/hotwire/references/turbo.md` -- Turbo deep dive

No existing runtime/code files are planned to change.

## Risks

- **Risk: Ruby skills retain Rails bleed**
  - Blast radius: non-Rails Ruby projects would load framework-specific advice; Rails skills would also duplicate the same guidance.
  - Classification: Must fix
  - Countermeasure: explicit Ruby/Rails boundary contract plus mandatory review of Rails-specific strings/concepts during each Ruby task.

- **Risk: Source content is lost while redistributing conflicting sections**
  - Blast radius: missing guidance in `ruby-refactoring`, `rails-architecture`, or `rails-models`; future workers would think the adaptation is complete while advice disappeared.
  - Classification: Must fix
  - Countermeasure: mapping table above is authoritative, and every removed subsection must have an explicit destination or a deliberate deferral to an existing cosmonauts skill.

- **Risk: Relative links break after moving sibling docs into `references/`**
  - Blast radius: on-demand deep-dive loading fails for Hotwire, Models, Conventions, Stack Profiles, and Ruby references; exported skills would also carry broken links.
  - Classification: Mitigated
  - Countermeasure: every worker follows the QA checklist; final review checks all relative markdown links and `Related Skills` links.

- **Risk: Repeated preflight prose drifts across Rails skills**
  - Blast radius: inconsistent prompt behavior and duplicated maintenance across 16 Rails skills.
  - Classification: Mitigated
  - Countermeasure: standard Rails opener contract referencing `rails-conventions` and `rails-stack-profiles` instead of full copied preflight blocks.

- **Risk: Task count exceeds the usual 15–17 heuristic**
  - Blast radius: task-manager may emit 18 implementation tasks if it keeps one task per target skill.
  - Classification: Accepted
  - Countermeasure: the split is intentional and keeps the skill surface coherent; if the task-manager needs to compress slightly, it can combine the two meta skills into one task without changing the target architecture.

## Quality Contract

- id: QC-001
  category: integration
  criterion: "Every new skill directory is discoverable as a nested directory skill with a `SKILL.md`, and no runtime loader/exporter changes are introduced."
  verification: reviewer

- id: QC-002
  category: correctness
  criterion: "Every target `SKILL.md` frontmatter contains only the normalized `name` and rewritten cosmonauts `description`, with no `allowed-tools` field remaining."
  verification: reviewer

- id: QC-003
  category: behavior
  criterion: "Ruby-target skills contain no Rails-specific implementation guidance except explicit cross-skill references to `/skill:rails-*`; all Rails-specific subsections removed from Ruby sources are preserved in the mapped Rails targets or delegated to existing cosmonauts skills."
  verification: reviewer

- id: QC-004
  category: behavior
  criterion: "All relative links inside each new skill resolve after the move to `references/`, including model, hotwire, conventions, and stack-profile support docs."
  verification: reviewer

- id: QC-005
  category: architecture
  criterion: "Every Rails skill opens by pointing to `/skill:rails-conventions` and `/skill:rails-stack-profiles`, and every `SKILL.md` ends with a `Related Skills` section linking relevant peers plus `/skill:find-docs`."
  verification: reviewer

- id: QC-006
  category: integration
  criterion: "Repository health checks still pass after the content-only adaptation."
  verification: verifier
  command: "bun run test && bun run lint && bun run typecheck"

## Implementation Order

1. **Foundations** — create `ruby-object-design`, `ruby-refactoring`, `rails-conventions`, and `rails-stack-profiles` first. Other Rails skills will reference these IDs, so their names/Related Skills/openers must stabilize first.
2. **Core cross-cutting Rails skills** — adapt `rails-architecture`, `rails-models`, `rails-services`, `rails-controllers`, `rails-testing`, `rails-views`, and `rails-hotwire`. These absorb redistributed content and establish most peer-link patterns.
3. **Remaining vertical Rails skills** — adapt `rails-api`, `rails-auth`, `rails-caching`, `rails-devops`, `rails-graphql`, `rails-jobs`, and `rails-mailers`. These can run mostly in parallel once the foundations exist.
4. **Cross-skill QA sweep** — verify frontmatter normalization, link rewriting, Related Skills completeness, and no Rails bleed in Ruby files.

### Task breakdown outline for the task-manager

Preferred worker task granularity is one target skill per task, with this dependency order:
- Wave 1: `ruby-object-design`, `ruby-refactoring`, `rails-conventions`, `rails-stack-profiles`
- Wave 2: `rails-architecture`, `rails-models`, `rails-services`, `rails-controllers`, `rails-testing`, `rails-views`, `rails-hotwire`
- Wave 3: `rails-api`, `rails-auth`, `rails-caching`, `rails-devops`, `rails-graphql`, `rails-jobs`, `rails-mailers`
- Wave 4: final review/cleanup task only if the task-manager wants a dedicated consolidation pass

Expected total is 18 skill tasks if kept strictly one-per-skill. If the task-manager needs to stay inside the usual 15–17 task band, combine `rails-conventions` + `rails-stack-profiles` into one meta task and leave every other skill separate.

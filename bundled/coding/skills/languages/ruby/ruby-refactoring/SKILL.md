---
name: ruby-refactoring
description: Ruby-specific code smells and refactoring pattern selection. Use when improving maintainability in Ruby code or choosing Ruby-friendly refactoring targets. Do NOT load for Rails-layer architecture, framework-specific patterns, or generic refactoring workflow.
---

# Ruby Refactoring

## Discover Project Conventions First

Before writing Ruby code, inspect:
1. `.ruby-version` for Ruby version and `Data.define` availability.
2. `Gemfile` for framework/runtime/libraries.
3. Project structure to detect Rails/Sinatra/Hanami/Roda/pure Ruby.
4. Test runner and linter setup.

If Rails is present, load the relevant `/skill:rails-*` skill for framework-specific guidance.

## Scope

Use this skill for Ruby-native smell interpretation and pattern selection.
For generic refactoring workflow, prioritization, and test discipline, load `/skill:refactoring`.
For design trade-offs around cohesion, coupling, and dependency direction, load `/skill:engineering-principles`.

## Ruby Smell-to-Pattern Matrix

| Smell | Default move | Escalate when |
|---|---|---|
| Long method | Extract Method | 4+ interacting locals or helpers would need 3+ parameters → see [refactoring-patterns.md](references/refactoring-patterns.md) |
| Large class | Extract Class | The extracted behavior is only a shared role and truly belongs in a mixin |
| Long parameter list | Keyword arguments | The same parameter group travels together repeatedly |
| Feature envy | Move Method | The caller still needs a convenience delegate after ownership is fixed |
| Primitive obsession | Extract Value Object | The new type needs richer behavior or validation rules |
| Data clumps | Introduce Parameter Object | The group represents a stable domain concept |
| Duplicated type/status conditionals | Lookup table or polymorphism | The branch logic changes in 3+ places |
| Shotgun surgery between collaborators | Move the rule to one owner | The concept crosses Rails layers → load `/skill:rails-architecture` |
| Divergent change | Split by axis of change | The class still hides multiple unrelated responsibilities |

## Ruby-Specific Guidance

- Prefer moving behavior to the object that owns the data over reaching through nested objects, hashes, or option bags.
- Replace raw strings, symbols, and arrays with named domain objects when invariants matter.
- Use `/skill:ruby-object-design` when choosing between `Hash`, `Struct`, `Data`, and a full class during an extraction.
- Keep mixins for behavior that is genuinely shared across multiple classes. Do not extract a module just to make one file shorter.
- If a refactoring crosses controllers, views, jobs, serializers, or ActiveRecord-specific concerns, defer to the relevant Rails skill instead of encoding framework rules here.

## Reference Guides

- [code-smells.md](references/code-smells.md) — Ruby-native smells and severity signals.
- [refactoring-patterns.md](references/refactoring-patterns.md) — pattern-selection guidance for ambiguous Ruby cases.

## Recommendation Format

When proposing a Ruby refactoring:
1. Name the smell and the affected file or object.
2. State which object should own the behavior after the change.
3. Pick one refactoring pattern and explain why it fits Ruby here.
4. Point to the tests or characterization coverage using `/skill:refactoring` for the step-by-step workflow.

## Related Skills

- `/skill:ruby-object-design` — Choosing the right Ruby object shape while extracting new collaborators or value objects.
- `/skill:refactoring` — Generic refactoring workflow, prioritization, and test-discipline rules.
- `/skill:engineering-principles` — Cohesion, coupling, and boundary guidance for deciding where behavior should live.
- `/skill:find-docs` — Current Ruby and library documentation when version-specific APIs matter.

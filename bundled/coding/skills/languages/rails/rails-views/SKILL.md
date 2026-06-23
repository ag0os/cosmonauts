---
name: rails-views
description: Rails view patterns for ERB templates, partials, forms, fragment caching, and accessible HTML. Use when building or reviewing server-rendered Rails views and presentation-layer structure. Do NOT load for Turbo or Stimulus behavior, controller flow, or JSON-only responses.
---

# Rails Views

Use `/skill:rails-conventions` and `/skill:rails-stack-profiles` first to match the repo's conventions and profile. Assume `/skill:ruby-object-design` and `/skill:ruby-refactoring` are available for Ruby-level decisions.

## Scope

Use this skill for ERB templates, partials, layouts, helpers, `form_with`, fragment caching, semantic HTML, and accessibility in server-rendered Rails apps. For Turbo Frames, Turbo Streams, or Stimulus behavior, load `/skill:rails-hotwire` instead of mixing client interaction guidance into view advice.

## Reference Guide

- [patterns.md](references/patterns.md) — partial composition, collection rendering, form patterns, cache strategies, accessibility, and profile-aware presenter or component guidance.

## Core Principles

1. **Views present data** — no queries, no mutations, and no business-rule branching that belongs in a model, service, helper, or presenter.
2. **Prefer semantic HTML** — use landmarks, headings, lists, buttons, and links that match meaning before reaching for generic wrappers.
3. **Extract repeated markup intentionally** — use partials, helpers, presenters, or repo-standard components instead of duplicating ERB.
4. **Render collections the Rails way** — prefer `render ... collection:` or repo-standard shorthand over manual loops that lose caching benefits.
5. **Keep interaction guidance separate** — when a template needs Turbo or Stimulus behavior, load `/skill:rails-hotwire` rather than embedding inline handlers or ad hoc client logic.

## Partials and ERB Composition

- Extract repeated markup into partials with explicit locals and predictable filenames.
- Prefer shallow, readable templates; if conditionals keep growing, move formatting rules into a helper or presenter.
- Match the repo's layout, helper, and `content_for` conventions from `/skill:rails-conventions` before introducing a new pattern.
- In service-oriented repos, use ViewComponent only when the gem is already installed; omakase repos usually stay with helpers, partials, and presenter POROs.

## Forms and Accessibility

- Prefer `form_with` and the repo's existing form builder conventions.
- Keep labels, hints, and validation messages explicit; placeholder-only forms are not sufficient.
- Use semantic landmarks, heading order, and accessible flash or error regions by default.
- When a submission shape spans multiple models or needs ActiveModel-backed validation, use the form-object patterns in [patterns.md](references/patterns.md).

## Caching and Performance

- Fragment-cache expensive sections and use collection rendering with `cached: true` when items change less often than the surrounding page.
- Use Russian-doll caching only when invalidation paths are explicit, usually via `touch: true` on the parent relationship.
- Keep cache keys tied to model state or view versions; for broader cache-store and invalidation strategy, pair this skill with `/skill:rails-caching`.
- If the performance fix depends on Turbo-driven lazy loading or streaming updates, load `/skill:rails-hotwire`.

## Anti-Patterns to Correct

| Anti-pattern | Fix |
|---|---|
| Queries or mutations in templates | Load data before rendering and pass prepared objects into the view. |
| `each` plus repeated `render` for a partial collection | Use `render ... collection:` or repo-standard shorthand. |
| Placeholder-only or unlabeled form inputs | Add visible labels, hints, and accessible error wiring. |
| Inline `onclick` handlers or Turbo or Stimulus snippets mixed into ERB | Move interaction behavior to `/skill:rails-hotwire`. |
| Repeated branching-heavy markup | Extract a partial, helper, presenter, or installed component. |

## Review Output

When reporting on view quality, use:

```md
## View Analysis: [file_path]

**Issues Found:**
- [severity] description — suggested fix

**Recommendations:**
1. actionable recommendation
2. ...
```

## Related Skills

- `/skill:rails-conventions` — Detect the repo's helpers, form builders, layout usage, CSS hooks, and component conventions before editing views.
- `/skill:rails-stack-profiles` — Decide whether the app expects partials and presenters only or also supports ViewComponent-style abstractions.
- `/skill:rails-hotwire` — Handle Turbo Frames, Turbo Streams, Stimulus controllers, and progressive enhancement behavior.
- `/skill:rails-controllers` — Align instance variables, flash handling, redirects, and server-rendered response flow with the view layer.
- `/skill:rails-caching` — Go deeper on cache-store choice, invalidation strategy, and low-level caching beyond template patterns.
- `/skill:ruby-object-design` — Choose the Ruby shape for presenters or form objects when view logic needs an extracted object.
- `/skill:find-docs` — Verify current Rails helper, form, and caching APIs when version-specific behavior matters.

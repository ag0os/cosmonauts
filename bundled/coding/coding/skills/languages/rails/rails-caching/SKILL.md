---
name: rails-caching
description: Rails caching patterns for fragment, low-level, and HTTP caching plus invalidation strategy. Use when optimizing expensive rendering or repeated work with fragment caches, `Rails.cache`, ETags, or freshness headers. Do NOT load for CDN setup, database query tuning, or frontend-only performance work.
---

# Rails Caching

Use `/skill:rails-conventions` and `/skill:rails-stack-profiles` first to match the repo's conventions and profile. Assume `/skill:ruby-object-design` and `/skill:ruby-refactoring` are available for Ruby-level decisions.

## Scope

Use this skill when adding or reviewing Rails caching across server-rendered views, controller responses, and repeated expensive computations. Match the app's cache store, rendering style, and invalidation conventions before introducing new keys or expiration rules.

## Quick Reference

| Layer | Use When | Core Tooling |
|---|---|---|
| HTTP caching | The whole response can be reused by the browser, proxy, or CDN | `fresh_when`, `stale?`, `expires_in`, ETag, `Last-Modified` |
| Fragment caching | Expensive view fragments re-render less often than the page around them | `cache`, collection caching, Russian doll caching |
| Low-level caching | Expensive computation or lookup is reused outside template rendering | `Rails.cache.fetch`, `fetch_multi`, `write`, `delete` |

## Core Principles

1. **Choose the highest useful cache layer first**: prefer HTTP caching over fragment caching, and fragment caching over low-level caching, when the same work can be avoided earlier.
2. **Prefer key-based invalidation**: let `cache_key_with_version`, composite keys, and `touch: true` expire entries naturally instead of scattering manual deletes.
3. **Vary keys for shared caches**: include locale, user, permissions, or feature version whenever output changes by request context.
4. **Protect hot keys from stampedes**: use `race_condition_ttl` and batch reads with `fetch_multi` when many requests contend for the same entry.
5. **Measure before and after**: confirm hit rates and response-time impact instead of caching by default.

## Picking the Layer

| Scenario | Best fit | Why |
|---|---|---|
| A mostly static show page or API response | HTTP caching | Avoids controller and view work entirely |
| An expensive partial inside a changing page | Fragment caching | Reuses the rendered HTML fragment |
| Derived statistics, external API mapping, or reusable expensive lookup | Low-level caching | Keeps expensive computation out of the hot path |
| Nested page sections with shared subtrees | Russian doll fragment caching | Only changed fragments re-render |

## Fragment Caching Guidance

- Use fragment caching for expensive partials and repeated list rendering.
- Use Russian doll caching for nested resources, and wire `touch: true` through the association chain so parent keys change when child content changes.
- Use collection caching (`render ..., cached: true`) for repeated partials to let Rails batch cache reads.
- Do not cache user-specific content in a shared fragment unless the key varies by the user-specific inputs.

## Low-Level Caching Guidance

- Wrap expensive, repeatable work in `Rails.cache.fetch`.
- Use `race_condition_ttl` for high-traffic keys that expire predictably.
- Use `fetch_multi` or collection caching instead of looping over `Rails.cache.fetch`.
- Keep the cache payload stable and serializable; cache derived data, not mutable model instances with hidden coupling.

## HTTP Caching Guidance

- Use `fresh_when` or `stale?` when a full response can be skipped based on ETag or `Last-Modified`.
- Set `expires_in`, `public`, and related cache-control directives intentionally; private responses should not leak into shared caches.
- Keep validators aligned with the real inputs to the response, including locale, auth, or feature version when they change the body.

## Invalidation Strategy

- Prefer versioned keys such as `cache @record`, `cache [@record, I18n.locale]`, or a dedicated `stats_cache_key`.
- Use `touch: true` to propagate invalidation across nested records in Russian doll caches.
- Reserve manual deletion for entries that cannot follow model versioning cleanly.
- Treat pattern deletion as store-specific infrastructure: `delete_matched` is practical with Redis, but not with every Rails cache store.

## Anti-Patterns

| Anti-pattern | Fix |
|---|---|
| Caching before measuring the bottleneck | Profile first, then cache the slow layer |
| Manual invalidation scattered across callbacks and services | Move to stable versioned keys or `touch: true` |
| `Rails.cache.fetch` inside a loop | Batch with `fetch_multi` or collection caching |
| Shared cache key for user-specific output | Include every varying input in the key |
| Long-lived hot keys without stampede protection | Add `race_condition_ttl` or precompute/write-through updates |

## Reference Guides

- [patterns.md](references/patterns.md) — detailed cache-store, fragment, low-level, HTTP caching, invalidation, and measurement patterns.

## Recommendation Format

When recommending or generating caching changes, include:
1. The cache layer to add or change.
2. The exact cache key or freshness validator inputs.
3. The invalidation path, including `touch: true`, versioned keys, or manual deletion if unavoidable.
4. Any store assumptions, such as Solid Cache versus Redis.
5. How to measure hit rate or response-time impact after the change.

## Related Skills

- `/skill:rails-conventions` — Match the repo's existing cache-store, rendering, serialization, and instrumentation conventions.
- `/skill:rails-stack-profiles` — Confirm whether the app is omakase, service-oriented, or api-first before choosing store and invalidation defaults.
- `/skill:rails-views` — Pair fragment caching with the repo's partial, helper, and server-rendered UI patterns.
- `/skill:rails-hotwire` — Keep Turbo frames, streams, and fragment caching aligned so updates invalidate the right HTML.
- `/skill:find-docs` — Check current Rails cache-store, controller freshness, and HTTP caching APIs when version details matter.

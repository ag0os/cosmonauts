---
name: rails-graphql
description: Rails GraphQL patterns for graphql-ruby schemas, types, mutations, resolvers, subscriptions, and query batching. Use when building or reviewing GraphQL endpoints in a Rails app. Do NOT load for REST controllers, serializer-driven JSON APIs, or non-GraphQL query tuning.
---

# Rails GraphQL

Use `/skill:rails-conventions` and `/skill:rails-stack-profiles` first to match the repo's conventions and profile. Assume `/skill:ruby-object-design` and `/skill:ruby-refactoring` are available for Ruby-level decisions.

## Scope

Use this skill for graphql-ruby schema design, `app/graphql/` organization, field definitions, mutations, subscriptions, batching, and schema-specific auth or error handling. Match the repo's existing auth, testing, and error conventions before introducing a new GraphQL shape.

See [patterns.md](references/patterns.md) for DataLoader source variants, connection examples, schema configuration, base mutation wiring, structured user errors, subscription filtering, and direct-schema test patterns.

## Core Principles

1. **Batch lookups** — use `GraphQL::Dataloader` sources for associations, record lookups, and aggregates so fields do not fan out into per-row queries.
2. **Keep the schema explicit** — define `Types::*`, `Mutations::*`, and schema configuration intentionally instead of exposing ActiveRecord objects directly.
3. **Treat nullability and pagination as contract** — every field needs an intentional `null:` choice, and list fields should use connection types or another bounded repo-standard shape.
4. **Return structured mutation errors** — validation and domain failures should come back in the payload; reserve exceptions for schema-level boundary mapping such as `rescue_from`.
5. **Authorize and budget per field** — apply authorization, depth, and complexity limits where data is exposed, not only at the query root.

## Schema and Type Organization

- Keep `Query`, `Mutation`, and `Subscription` roots explicit even in smaller schemas.
- Reuse repo-standard base classes such as `Types::BaseObject`, `Types::BaseField`, and `Mutations::BaseMutation` when they already exist.
- Put reusable batching sources under `app/graphql/sources/` or the repo's existing GraphQL support namespace.
- Use input objects, enums, and connection types when the contract is shared across fields or mutations.
- Keep GraphQL field names and return types stable even if underlying model or column names change.

## Resolver and Mutation Guidance

- Prefer small field methods or resolver objects that map GraphQL fields to domain queries; if the workflow becomes orchestration-heavy, delegate according to the repo's stack profile.
- Do not call `object.association` directly for collection fields or counts unless the data was already loaded intentionally for the whole batch.
- Use field-level authorization for sensitive data and mutation actions instead of relying only on top-level query guards.
- Normalize `ActiveRecord::RecordNotFound` and similar boundary errors in the schema so clients get predictable GraphQL errors.
- Trigger subscriptions from the persistence boundary, such as `after_commit`, rather than coupling broadcasts to controller flow.

## Schema Safeguards

- Configure `max_complexity`, `max_depth`, and default page-size limits on the schema.
- Set per-field complexity on expensive fields instead of loosening global caps.
- Prefer connection pagination for list fields so clients and servers both have bounded traversal.
- If the repo already has GraphQL auth helpers, dataloader sources, or mutation base classes, extend them instead of introducing parallel abstractions.

## Anti-Patterns to Correct

| Anti-pattern | Fix |
|---|---|
| N+1 queries inside type methods or resolvers | Add a `GraphQL::Dataloader` source and batch the lookup. |
| Returning unbounded arrays from list fields | Use connection types or bounded list arguments with enforced limits. |
| Raising validation failures as generic exceptions in mutations | Return structured payload errors and reserve exceptions for schema boundary mapping. |
| Authorization only at the root field | Check sensitive fields and mutation actions where data is exposed. |
| Exposing ActiveRecord objects without explicit GraphQL types | Define the field contract in `Types::*` and map only intended data. |
| Resolver methods coordinating large workflows | Push orchestration into repo-standard services or domain objects. |

## Recommendation Format

When recommending or generating GraphQL changes, include:
1. Schema, type, resolver, or mutation placement under the repo's GraphQL structure.
2. Field nullability, pagination shape, and authorization expectations.
3. Dataloader sources or an eager-loading plan for associations and counts.
4. Schema-level configuration for complexity, depth, pagination, and `rescue_from` handling.
5. Query or mutation tests that match the repo's existing GraphQL test style.

## Related Skills

- `/skill:rails-conventions` — Detect the repo's schema layout, auth hooks, error shape, and testing setup before changing GraphQL code.
- `/skill:rails-stack-profiles` — Decide whether GraphQL is the primary interface or a secondary API surface in the app.
- `/skill:rails-api` — Apply REST and serializer guidance when the interface is JSON over controllers instead of a GraphQL schema.
- `/skill:rails-models` — Keep persistence rules, associations, and query shape in the model layer while exposing them through GraphQL.
- `/skill:find-docs` — Verify current graphql-ruby, Rails, and gem APIs before locking in implementation details.

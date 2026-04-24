---
name: rails-api
description: Rails API patterns for REST endpoints, serialization, versioning, pagination, and JSON error contracts. Use when building or reviewing Rails JSON APIs and API-only controllers. Do NOT load for HTML responses, Hotwire flows, or GraphQL schemas.
---

# Rails API

Use `/skill:rails-conventions` and `/skill:rails-stack-profiles` first to match the repo's conventions and profile. Assume `/skill:ruby-object-design` and `/skill:ruby-refactoring` are available for Ruby-level decisions.

Use this skill for JSON-only endpoints, API namespaces, serializers, response envelopes, pagination, and API-specific controller behavior. See [patterns.md](references/patterns.md) for detailed REST, serializer, versioning, pagination, error-shape, rate-limiting, and CORS examples.

## Core Principles

1. **REST resources first** — prefer resourceful routes and dedicated controllers over custom RPC-style endpoints.
2. **Start from an API base controller** — share authentication, rescue handling, pagination, and rendering helpers in `Api::BaseController` or the repo's equivalent.
3. **Serialize explicitly** — never render ActiveRecord models directly; use the repo's serializer, blueprint, presenter, or builder layer.
4. **Version the URL namespace** — default to `/api/v1/` from day one and keep published response shapes stable across versions.
5. **Keep one JSON contract** — standardize the success envelope, error shape, and status-code conventions so clients can parse responses predictably.
6. **Paginate every collection** — set a default page size, enforce a hard cap, and return pagination metadata.
7. **Centralize edge concerns** — keep auth hooks, rate limiting, and CORS rules in shared infrastructure instead of per-endpoint ad hoc code.

## API Design Defaults

- Inherit API-only endpoints from `ActionController::API` or a repo-standard API base controller instead of mixing in HTML concerns.
- Namespace routes by version in `config/routes.rb`; treat version bumps as controller and serializer changes, not model changes.
- Match the installed serializer stack from `/skill:rails-conventions`; for new work, prefer maintained options such as Blueprinter, Alba, or Jbuilder over introducing ActiveModelSerializers.
- Eager load associations in controllers or query objects so serializers do not trigger N+1 queries.
- Keep auth entry points, token parsing, and permission checks consistent with `/skill:rails-auth`.
- Use one response envelope per API namespace; if the repo has no established contract yet, standardize on `{ data:, meta:, errors: }` plus a top-level `error` message for non-validation failures.

## Anti-Patterns to Correct

| Anti-pattern | Fix |
|---|---|
| Rendering models directly with `render json: @record` | Add an explicit serializer or blueprint and whitelist fields. |
| Unversioned `/api/...` routes that later need breaking changes | Introduce `/api/v1/...` and version controllers and serializers together. |
| Collection endpoints without pagination limits | Add pagination metadata, sane defaults, and a hard `per_page` cap. |
| One-off error payloads per controller | Centralize `rescue_from` handling and return one machine-readable error shape. |
| Header-only versioning with no route namespace | Prefer URL namespacing unless the repo already standardized on another scheme. |
| Serializer code that loads associations lazily | Eager load in the controller or query layer before rendering. |

## Recommendation Format

When recommending or generating API changes, include:
1. Route and controller namespace.
2. Serializer or presenter choice and response shape.
3. Auth, authorization, and `rescue_from` hooks shared by the API base controller.
4. Pagination, versioning, and error-handling behavior.
5. Any rate-limit or CORS changes needed at the edge.

## Related Skills

- `/skill:rails-conventions` — Match the repo's serializer, auth, namespace, and response conventions before changing an API.
- `/skill:rails-stack-profiles` — Confirm whether the app or namespace is api-first, hybrid, or controller-driven before applying API defaults.
- `/skill:rails-auth` — Choose token, session, and authorization patterns for API clients.
- `/skill:rails-controllers` — Reuse shared routing, params, and controller-flow guidance for mixed HTML and JSON apps.
- `/skill:rails-graphql` — Switch to GraphQL-specific patterns when the interface is schema-driven instead of REST.
- `/skill:find-docs` — Verify current Rails and serializer gem APIs before locking in implementation details.

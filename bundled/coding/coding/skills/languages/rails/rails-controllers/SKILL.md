---
name: rails-controllers
description: Rails controller patterns for resourceful routing, strong parameters, filters, and HTTP responses. Use when building controllers or reviewing request/response flow and route design. Do NOT load for model persistence rules, service internals, or view composition.
---

# Rails Controllers

Use `/skill:rails-conventions` and `/skill:rails-stack-profiles` first to match the repo's conventions and profile. Assume `/skill:ruby-object-design` and `/skill:ruby-refactoring` are available for Ruby-level decisions.

Generate controllers that follow standard Rails RESTful conventions: resourceful routing, small actions, explicit parameter whitelisting, and consistent response handling. See [patterns.md](references/patterns.md) for detailed routing, params, filters, authorization, and response examples.

## Core Principles

1. **Thin controllers** — keep controllers focused on HTTP concerns and delegate business logic according to the repo's stack profile.
2. **RESTful by default** — prefer the 7 standard actions and create dedicated resource controllers instead of accumulating custom member actions.
3. **Strong parameters always** — never trust input; use `params.expect` on Rails 8+ and `require(...).permit(...)` on older apps.
4. **Consistent responses** — redirect after successful HTML writes, render with explicit status on failure, and keep JSON or Turbo responses aligned.
5. **One resource per controller** — avoid multi-resource controllers and deeply nested routes.

## Routing and Controller Shape

- Start with `resources` or `resource` routing before adding custom actions.
- Treat state transitions as resources, such as `Cards::ClosuresController`, rather than `post :close` on a large parent controller.
- Keep nesting shallow; if relationships go deeper than one level, prefer `shallow: true` or flatter routes.
- Match local base classes, authorization hooks, serialization helpers, and pagination patterns from `/skill:rails-conventions`.

## Params, Filters, and Responses

- Put strong-parameter logic in a private method with an explicit field list.
- Use `before_action` for authentication, authorization, and resource loading; skip selectively instead of opting in action by action.
- Centralize `rescue_from` behavior in `ApplicationController` when the repo already handles common HTTP errors there.
- Return `422` for validation failures, `404` for missing records, `403` for authorization failures, and `303` for redirects after destructive HTML actions.

## Anti-Patterns to Correct

| Anti-pattern | Fix |
|---|---|
| Fat controller actions or business logic in controllers | Move domain logic to the layer favored by the detected stack profile. |
| Custom member actions that keep growing | Introduce a dedicated resource controller and route. |
| `params.permit!` or broad input acceptance | Replace with explicit strong parameters. |
| Multiple duplicated `respond_to` blocks | Consolidate response handling or split API-only behavior into dedicated controllers. |
| Filters skipped inconsistently | Apply shared filters broadly and carve out narrow exceptions. |

## Recommendation Format

When recommending or generating controller changes, include:
1. Controller structure and actions.
2. Route entries for `config/routes.rb`.
3. Filters for auth, authorization, and resource loading.
4. Strong-parameter method with explicit permitted fields.
5. Response and error-handling behavior for HTML, JSON, or Turbo requests.

## Related Skills

- `/skill:rails-conventions` — Match controller helpers, auth hooks, serialization, and other repo-specific conventions.
- `/skill:rails-stack-profiles` — Decide whether controllers should delegate toward models, concerns, or services.
- `/skill:rails-models` — Push persistence rules, associations, and validations into the model layer.
- `/skill:rails-services` — Extract controller-owned workflows into service objects in service-oriented stacks.
- `/skill:rails-api` — Apply API-only controller, serialization, and error-envelope patterns.
- `/skill:rails-views` — Match HTML form, template, and rendering patterns for server-rendered responses.
- `/skill:find-docs` — Fetch current Rails or gem documentation for controller APIs and installed libraries.

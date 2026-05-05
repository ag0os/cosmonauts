---
name: rails-services
description: Rails service-object patterns for commands, results, form objects, queries, and workflow orchestration. Use when extracting business logic from controllers or models or organizing `app/services/`. Do NOT load for simple CRUD that already fits a model/controller, controller routing, or background job scheduling.
---

# Rails Services

Use `/skill:rails-conventions` and `/skill:rails-stack-profiles` first to match the repo's conventions and profile. Assume `/skill:ruby-object-design` and `/skill:ruby-refactoring` are available for Ruby-level decisions.

## Purpose

Use this skill for service objects, result objects, form objects, query objects, and other extracted workflow objects in Rails.

## Quick Reference

| Pattern | Use When | Entry Point |
|---|---|---|
| Basic service | One operation coordinates persistence, transactions, or external calls | `CreateOrder.new(...).call` |
| Result object | Caller must branch on success/failure plus payload or error | `AuthenticateUser.new(...).call` |
| Form object | One submission drives multiple models or validations | `RegistrationForm.new(params).save` |
| Query object | Reusable query logic outgrows scopes | `UserSearchQuery.new(scope).results` |
| Policy object | Authorization logic should stay out of controllers and services | `PostPolicy.new(user, post).update?` |

## Core Principles

1. **VerbNoun naming**: `CreateOrder`, `SendInvitation`, `ProcessPayment` — not `OrderService` or `UserManager`.
2. **One public entry point**: expose a single `call`, `save`, or repo-standard entry method.
3. **Match local conventions**: if `/skill:rails-conventions` finds `ApplicationService`, `.call`, `ServiceResult`, or domain namespaces, follow them.
4. **Return an explicit outcome when callers branch on expected failures**: keep the repo's result API consistent. If you need to choose between `Struct`, `Data.define`, or a custom result class, load `/skill:ruby-object-design` instead of deciding that here.
5. **Use services where the profile expects them**: omakase apps are more conservative; service-oriented and api-first apps usually treat services as the default home for non-trivial workflows.
6. **Decompose safely**: for step-by-step rewrite strategy, smell prioritization, and characterization coverage, load `/skill:refactoring`.

## When to Extract a Service

| Scenario | Omakase | Service-Oriented / API-First |
|---|---|---|
| Logic on a single model's own data | Model method or concern | Model method |
| Shared behavior across models | Concern | Concern or small shared object |
| Multi-model workflow with rollback | Service when the transaction is no longer model-owned | Service object |
| External API call | Service object once retries, mapping, or orchestration appear | Service object |
| Complex request validation + persistence | Form object or model validation depending on scope | Form object or service + form object |
| Reusable cross-screen query logic | Scope first, query object when composition gets complex | Query object |
| Simple side effect (email, log) | Callback or model method if it stays local | Service or job trigger when orchestration matters |

**Omakase:** only extract to a service when the workflow genuinely spans multiple models, transactions, or external systems.

**Service-oriented / API-first:** services are the normal landing zone for non-trivial business workflows. This is the Rails-specific exception that `ruby-object-design` now defers here: if the repo already standardizes on service objects, match that convention instead of pushing everything back into models.

## Result Objects

Use a repo-consistent result interface when the caller needs success/failure plus payload or error details.

```ruby
class AuthenticateUser
  def initialize(email:, password:, result_class: ServiceResult)
    @email = email
    @password = password
    @result_class = result_class
  end

  def call
    user = User.find_by(email: email)
    return result_class.failure("Invalid credentials") unless user&.authenticate(password)

    result_class.success(user: user)
  end

  private

  attr_reader :email, :password, :result_class
end
```

Keep the Rails concern focused on the outcome contract: `success?`/`failure?`, payload access, and predictable controller/job handling. For the underlying Ruby object shape, load `/skill:ruby-object-design`.

## Anti-Patterns

| Anti-Pattern | Problem | Fix |
|---|---|---|
| God service (100+ lines, many branches) | Hidden sub-workflows and weak boundaries | Split by business step and use `/skill:refactoring` for the rewrite plan |
| Deep service-calls-service chains | Hidden coupling and unclear ownership | Keep orchestration in one coordinator service or caller |
| `self.call` everywhere with hidden globals | Harder to inject collaborators and test boundaries | Prefer constructor injection unless the repo explicitly standardizes on class entry points |
| No return contract | Callers cannot react to expected failures | Return a meaningful value or repo-standard result object |
| Services mutating passed-in objects implicitly | Surprising side effects | Return the new state or document the mutation clearly |
| `OrderService`, `UserManager`, `WorkflowService` | Blurry responsibility and fast growth into a god object | Name one operation per service |

## Reference Guides

- [patterns.md](references/patterns.md) — detailed result, form-object, query-object, organization, and error-handling patterns.

## Recommendation Format

When recommending a Rails service:
1. Name the target object and why the logic belongs outside the current controller/model.
2. Match the repo's service base class, entry point, naming, and result conventions.
3. Show the caller integration in the controller, job, or other orchestrator.
4. State how expected failures are returned and where unexpected exceptions are rescued.
5. Point to `/skill:refactoring` if the change requires incremental extraction from a large existing object.

## Related Skills

- `/skill:rails-conventions` — Detect the repo's service base classes, entry points, result types, and naming before adding new services.
- `/skill:rails-stack-profiles` — Decide whether the app expects omakase-style model extraction or service-oriented workflow objects.
- `/skill:rails-architecture` — Place services at the right layer and avoid cross-layer coupling.
- `/skill:rails-models` — Keep persistence rules and model-owned invariants in the model layer.
- `/skill:ruby-object-design` — Choose the Ruby construct behind result objects or helper collaborators.
- `/skill:refactoring` — Use the generic refactoring workflow when splitting large services or extracting them safely.
- `/skill:find-docs` — Verify current Rails, ActiveModel, and gem APIs used by service implementations.

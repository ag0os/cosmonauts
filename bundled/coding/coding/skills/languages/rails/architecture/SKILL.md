---
name: rails-architecture
description: Rails architectural decision patterns for layering, skill routing, and profile-aware boundary choices. Use when planning features or fixing cross-layer design problems in a Rails app. Do NOT load for subsystem-specific implementation details or Ruby object-shape selection.
---

# Rails Architecture

Use `/skill:rails-conventions` and `/skill:rails-stack-profiles` first to match the repo's conventions and profile. Assume `/skill:ruby-object-design` and `/skill:ruby-refactoring` are available for Ruby-level decisions.

## Scope

Use this skill to choose the owning Rails layer, decide which domain skill should handle the next step, and keep recommendations aligned with the repo's stated direction.
For generic guidance on coupling, cohesion, and dependency direction, load `/skill:engineering-principles`.

## Architecture Workflow

Before recommending a Rails architectural change:

1. Read `AGENTS.md`, `agents.md`, `README.md`, and local architecture or migration docs for stated direction.
2. Classify the dominant stack or hybrid with `/skill:rails-stack-profiles`.
3. Capture local conventions with `/skill:rails-conventions`.
4. Pick the owning layer first, then route to the domain skill that implements that layer well.
5. If repo guidance conflicts with current code, treat the guidance as target state and call out the mismatch explicitly.

## Layering Defaults by Profile

| Decision | Omakase | Service-oriented | API-first |
|---|---|---|---|
| Business rule for one record | Model method or small concern | Model method if truly record-local; otherwise service object | Model method for persistence rules, service or command object for request workflows |
| Controller cleanup | Enrich model or extract a concern | Extract to service or form object | Extract to service, command, or form object |
| Cross-model workflow | Transactional model method if small | Service object | Service or command object |
| Side effects | Simple callback or explicit model method | Service object or job | Service object or job |
| Response shaping | Views, helpers, or presenters already used in the repo | Views or serializers per repo conventions | Serializers or presenters, never raw models |

## Skill Routing

| If the next step is mostly about... | Load next | Notes |
|---|---|---|
| schema, associations, validations, scopes, or persistence rules | `/skill:rails-models` | Model-bound smells and persistence decisions live there. |
| controllers, params, HTML flow, or routing | `/skill:rails-controllers` | Use `/skill:rails-api` instead for JSON-only endpoints. |
| service objects, query or form objects, policy orchestration, or external APIs | `/skill:rails-services` | Especially important in service-oriented or API-first repos. |
| serializers, versioning, or JSON envelopes | `/skill:rails-api` | Keep response contracts consistent with repo conventions. |
| ERB, helpers, presenters, partials, or view caching | `/skill:rails-views` | Pair with `/skill:rails-hotwire` when Turbo or Stimulus drives the UI. |
| background execution, retries, or idempotency | `/skill:rails-jobs` | Keep the backend choice aligned with the detected stack profile. |
| authentication or authorization | `/skill:rails-auth` | Use repo conventions before suggesting Devise, tokens, or policies. |
| Ruby-native smell interpretation after the owning layer is clear | `/skill:ruby-refactoring` | Use `/skill:ruby-object-design` only for Ruby construct selection. |

## Typical Feature Order

For a normal feature, keep the implementation sequence explicit:

1. migration and model changes - `/skill:rails-models`
2. route and controller or API endpoint - `/skill:rails-controllers` or `/skill:rails-api`
3. view or serializer updates - `/skill:rails-views` or `/skill:rails-api`
4. service, query, form, or policy object extraction when the profile and complexity warrant it - `/skill:rails-services`
5. background work if the flow should go async - `/skill:rails-jobs`
6. tests that match the repo's framework and layer choices - `/skill:rails-testing`

## Architecture Health Checks

Use these quick checks before approving a Rails design:

- the same business rule has one obvious owner
- controllers coordinate instead of deciding domain rules
- views and serializers format data instead of recomputing domain logic
- jobs are idempotent and do not hide core synchronous invariants
- stack-profile advice and repo conventions point to the same landing zone
- hot spots with repeated cross-layer edits are treated as architecture problems, not just cleanup tasks

## Recommendation Format

When reporting a Rails architecture recommendation, use a structure like this:

```md
## Architecture Plan: [feature or change]

**Detected Profile:** [omakase | service-oriented | api-first | hybrid]
**Owning Layers:** [models, controllers, services, views, jobs]
**Next Skills:** [/skill:rails-models, /skill:rails-services, ...]

**Key Decisions:**
- [decision]: [rationale]

**Risks:**
- [risk]: [mitigation]
```

## Reference Guide

- [patterns.md](references/patterns.md) - decision frameworks for layering, profile-aware fixes, and cross-layer smell triage.

## Related Skills

- `/skill:rails-conventions` - Detect repo-specific service, auth, controller, testing, and serialization conventions before applying architectural advice.
- `/skill:rails-stack-profiles` - Branch architecture decisions by omakase, service-oriented, or API-first defaults.
- `/skill:rails-models` - Implement model-owned persistence and domain rules once the owning layer is clear.
- `/skill:rails-services` - Implement service, query, form, or policy objects when orchestration should leave the model or controller.
- `/skill:ruby-refactoring` - Apply Ruby-native smell and refactoring guidance after the Rails layer owner is decided.
- `/skill:engineering-principles` - General cohesion, coupling, and dependency-direction guidance behind the Rails-specific rules.
- `/skill:find-docs` - Verify current Rails and gem APIs before locking in an architectural pattern.

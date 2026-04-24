---
name: rails-stack-profiles
description: Rails stack-profile detection for omakase, service-oriented, and api-first codebases. Use when architecture or implementation guidance depends on the repo's prevailing stack style. Do NOT load for subsystem-specific Rails details once the project profile is already clear.
---

# Rails Stack Profiles

This is the Rails stack/profile fingerprinting skill. Other Rails skills reference it alongside `/skill:rails-conventions` so recommendations branch to the repo's actual stack style instead of assuming a single Rails default.

See [profiles.md](references/profiles.md) for detailed profile definitions, hybrid examples, and per-profile recommendations.

## Read Repo Guidance First

Before classifying the codebase from code signals, read repo guidance files first:

1. `AGENTS.md`
2. `agents.md`
3. `README.md`
4. Local architecture or migration docs

Treat those files as intent. The codebase may reflect the old world while the guidance describes the target world.

## Three Profiles

| Profile | Philosophy | Key Markers |
|---------|-----------|-------------|
| **omakase** | Rails defaults, convention over gems | Solid Queue, Minitest, fixtures, concerns, `has_secure_password` |
| **service-oriented** | Explicit layers, extracted business logic | Sidekiq, RSpec, FactoryBot, `app/services/`, Devise, Pundit |
| **api-first** | Headless JSON backend | `ActionController::API`, serializers, JWT, no `app/views/` |

## Detection Checklist

Use this sequence to determine the dominant profile:

1. Read `AGENTS.md`, `agents.md`, `README.md`, and local migration docs for stated direction.
2. Read `Gemfile` for key gems.
3. Check directory structure (`app/services/`, `spec/` vs `test/`, `app/views/`).
4. Check `config/database.yml` for adapter choices.
5. Check test setup (RSpec vs Minitest, factories vs fixtures).
6. Check job backend (`config/queue.yml` vs `config/sidekiq.yml`).
7. Check auth approach (Devise, `has_secure_password`, JWT).

## Quick Detection Matrix

| Signal | Omakase | Service-Oriented | API-First |
|--------|---------|-----------------|-----------|
| `gem "sidekiq"` | | X | X |
| `gem "solid_queue"` | X | | |
| `gem "rspec-rails"` | | X | X |
| `test/` directory | X | | |
| `gem "factory_bot"` | | X | X |
| `test/fixtures/` | X | | |
| `app/services/` exists | | X | |
| `gem "devise"` | | X | |
| `has_secure_password` | X | | |
| `gem "pundit"` | | X | |
| `gem "jbuilder"` | X | | |
| `gem "alba"` or `gem "blueprinter"` | | X | X |
| `ActionController::API` base | | | X |
| `app/views/` has ERB files | X | X | |
| `gem "jwt"` | | | X |
| `config/solid_cache.yml` | X | | |

## Hybrid Projects

Most real Rails apps are hybrids. A project can be:

- omakase core with a service-oriented billing module
- service-oriented with an api-first namespace (`/api/v1/`)
- omakase that adopted RSpec early but kept everything else default

When signals conflict, weight the dominant pattern. A project with `app/services/` containing dozens of workflow objects is service-oriented even if it still uses Minitest.

When guidance and code conflict, prefer the guidance files as the intended direction, then call out the current-state vs target-state mismatch explicitly.

## How Profiles Affect Recommendations

| Decision Point | Omakase | Service-Oriented | API-First |
|---------------|---------|-----------------|-----------|
| Where does business logic go? | Model methods + concerns | Service objects | Service objects or interactors |
| Fat controller fix | Extract to model/concern | Extract to service object | Extract to service object |
| God model fix | Extract concerns | Extract service objects + value objects | Extract query/command objects |
| Callbacks for side effects? | Acceptable if simple | Avoid — use services | Avoid — use services |
| Testing framework | Minitest | RSpec | RSpec |
| Test data | Fixtures | FactoryBot | FactoryBot |
| Job backend | Solid Queue | Sidekiq | Sidekiq or Solid Queue |
| Auth | `has_secure_password` | Devise | JWT or token-based |
| Authorization | Controller-level checks | Pundit policies | Token scopes or Pundit |
| Frontend | Hotwire (Turbo + Stimulus) | Hotwire (Turbo + Stimulus) | None — JSON responses |
| Serialization | Jbuilder or `to_json` | Alba, Blueprinter | Alba, Blueprinter, jsonapi-serializer |
| Real-time | Solid Cable + Turbo Streams | ActionCable + Turbo Streams | WebSockets or SSE |
| Cache backend | Solid Cache | Redis | Redis |
| DB default | SQLite (dev), PostgreSQL (prod) | PostgreSQL | PostgreSQL |

## Output Format

When you report a detected profile, use this format:

```md
## Stack Profile: [omakase | service-oriented | api-first | hybrid]

**Detected from:**
- [signal]: [evidence]
- [signal]: [evidence]

**Hybrid notes:** [if applicable — which parts diverge and why]

**Recommendations will follow [profile] conventions.**
```

## Related Skills

- `/skill:rails-conventions` — Capture the repo's explicit conventions before applying a profile.
- `/skill:rails-architecture` — Turn the detected profile into layering and boundary decisions.
- `/skill:rails-services` — Apply service-object guidance when the profile is service-oriented or hybrid.
- `/skill:rails-api` — Apply API-first guidance after confirming the repo actually follows that profile.
- `/skill:find-docs` — Verify the Rails and gem APIs that appear during profile detection.

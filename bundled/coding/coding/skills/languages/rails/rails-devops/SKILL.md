---
name: rails-devops
description: Rails deployment, CI/CD, monitoring, and production security patterns for operational configuration. Use when reviewing Docker, Puma, deploy, logging, health-check, or production environment setup in a Rails app. Do NOT load for application business logic, model design, or generic infrastructure unrelated to Rails runtime behavior.
---

# Rails DevOps

Use `/skill:rails-conventions` and `/skill:rails-stack-profiles` first to match the repo's conventions and profile. Assume `/skill:ruby-object-design` and `/skill:ruby-refactoring` are available for Ruby-level decisions.

## Scope

Use this skill for Rails-specific production concerns: container images, CI/CD workflows, Puma configuration, health endpoints, structured logging, SSL, rate limiting, deploy sequencing, and production database tuning.

## Operational Workflow

Before recommending a deploy or runtime change:

1. Read `AGENTS.md`, `agents.md`, `README.md`, and local deploy or runbook docs.
2. Classify the app with `/skill:rails-stack-profiles`.
3. Capture local conventions with `/skill:rails-conventions`.
4. Inspect the actual deploy surface: `Dockerfile`, compose or Procfile files, `.github/workflows/`, `config/puma.rb`, `config/environments/production.rb`, `config/database.yml`, queue configs, and deploy scripts.
5. Match the existing platform and tooling instead of assuming Kamal, Capistrano, Sidekiq, Redis, or GitHub Actions.

## Quick Reference

| Area | Key Files | Primary Concerns |
|---|---|---|
| Docker and image build | `Dockerfile`, `.dockerignore`, compose files | multi-stage builds, non-root runtime, asset compilation |
| CI/CD | `.github/workflows/*.yml`, `bin/ci`, deploy scripts | test/lint/security gates, artifact promotion, migration sequencing |
| Web server | `config/puma.rb` | threads, workers, phased restart, connection handling |
| Monitoring and logging | `config/environments/production.rb`, initializers | JSON logs, request IDs, health endpoints, error reporting |
| Security | `config/environments/production.rb`, `config/initializers/rack_attack.rb`, credentials | SSL, HSTS, rate limiting, secret handling |
| Deploy orchestration | `bin/deploy`, `config/deploy/`, platform manifests | migration order, rollout sequencing, health-check gating |
| Background processes | queue config files, Procfile, deploy manifests | worker topology, queue backend alignment, web/worker separation |

## Core Principles

1. **Immutable deploys**: build once and promote the same artifact.
2. **Non-root containers**: production images should not run as root.
3. **Health checks at `/up`**: load balancers and orchestrators need a fast success path.
4. **Structured logs to STDOUT**: production diagnostics should be machine-parseable and aggregator-friendly.
5. **Defense in depth**: combine SSL, rate limiting, headers, and database timeouts.
6. **Backward-compatible rollouts**: migrations and app boot order must tolerate old and new code during the same deploy.

## CI/CD Guardrails

- Run the repo's canonical test, lint, and security checks before deploy promotion.
- Keep build and deploy separate: CI proves the artifact, CD promotes it.
- Prefer repo-owned entry points such as `bin/ci` or deploy scripts over large inline shell blocks in workflow YAML.
- Run migrations in a controlled step before or during rollout, and keep them backward-compatible.
- Keep web and worker boot commands explicit; use `/skill:rails-jobs` for backend-specific queue semantics and worker tuning.

## Production Rails Checks

### Health and Observability

- Expose a cheap `/up` endpoint for load balancers.
- Use a richer `/health` endpoint only when the repo needs dependency checks such as database, Redis, or migration status.
- Emit JSON logs with request IDs and enough metadata to correlate web and worker activity.

### Security

- Enable `force_ssl` and HSTS in production.
- Keep secrets in Rails credentials or the platform secret store, never committed `.env` files.
- Apply `Rack::Attack` or equivalent rate limiting where the app already standardizes on it.

### Runtime and Database

- Align `RAILS_MAX_THREADS`, `WEB_CONCURRENCY`, and database pool size.
- Set `statement_timeout` and `lock_timeout` to cap runaway queries and locks.
- Use phased or rolling restarts so old workers drain before the new version takes traffic.

## Anti-Patterns

| Bad | Good | Why |
|---|---|---|
| Secrets committed in `.env` files | Rails credentials or platform secret store | Security |
| Deploying mutable `latest` images | Pinned image digests or versioned tags | Reproducibility |
| No health endpoint | `GET /up` returning 200 | Load balancer readiness |
| Running containers as root | Create a dedicated runtime user | Defense in depth |
| File-based logs inside containers | JSON logs to STDOUT | Container-native observability |
| Running migrations after traffic is shifted | Controlled migration step during rollout | Zero-downtime safety |
| No `statement_timeout` or `lock_timeout` | Explicit timeout settings in `config/database.yml` | Prevent runaway queries and lock contention |
| Ignoring worker topology | Explicit web and worker processes matched to the queue backend | Predictable operations |

## Recommendation Format

When reporting on Rails DevOps configuration, use:

```md
## DevOps Analysis: [area]

**Current State:**
- summary of what exists

**Issues:**
- [severity] description

**Recommendations:**
1. actionable recommendation with file path
```

## Reference Guide

- [patterns.md](references/patterns.md) - Docker, GitHub Actions CI, health checks, structured logging, SSL, rate limiting, database settings, and zero-downtime Puma deploy patterns.

## Related Skills

- `/skill:rails-conventions` - Detect the repo's current deploy commands, queue backend, and infrastructure conventions before changing operational config.
- `/skill:rails-stack-profiles` - Branch DevOps recommendations by the app's omakase, service-oriented, or API-first profile.
- `/skill:rails-jobs` - Align worker processes, queue backends, retries, and deployment topology with the app's background-job strategy.
- `/skill:find-docs` - Verify current Rails, Puma, GitHub Actions, and gem APIs before finalizing operational changes.

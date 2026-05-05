---
name: rails-jobs
description: Rails background-job patterns for ActiveJob wrappers, idempotency, retries, batching, and backend-specific concurrency. Use when building or reviewing asynchronous workflows, queue configuration, or worker behavior in a Rails app. Do NOT load for synchronous controller/model flow, real-time Hotwire behavior, or generic service-object extraction.
---

# Rails Jobs

Use `/skill:rails-conventions` and `/skill:rails-stack-profiles` first to match the repo's conventions and profile. Assume `/skill:ruby-object-design` and `/skill:ruby-refactoring` are available for Ruby-level decisions.

Use this skill for ActiveJob structure, retry/discard policy, idempotency, batching, recurring work, and queue-backend-specific behavior. See [patterns.md](references/patterns.md) for wrapper, locking, concurrency, scheduling, and tenant-context patterns.

## Quick Reference

| Pattern | Use When |
| --- | --- |
| `_later` plus synchronous entry point | A model or service needs both async and inline execution paths |
| Shallow `ApplicationJob` wrapper | All new jobs — keep queueing and retries in the job, domain work elsewhere |
| Double-check locking | The job can be enqueued twice or run concurrently |
| `retry_on` / `discard_on` classification | Failure modes are known and should map to retry vs permanent drop |
| `limits_concurrency` or uniqueness middleware | One resource should not be processed by multiple workers at once |
| `perform_all_later` or self-splitting batches | Large fan-out or chunked background work |

## Core Principles

1. **Prefer ActiveJob as the public API** — use `ApplicationJob`, `perform_later`, `queue_as`, `retry_on`, and `discard_on` unless the repo already standardized on backend-native workers.
2. **Jobs are shallow wrappers** — delegate the actual business work to the layer favored by the detected stack profile: models in omakase apps, services or commands in service-oriented or API-first apps.
3. **Every side effect must be idempotent** — assume duplicate enqueues, retry storms, and concurrent workers can happen.
4. **Retry only transient failures** — timeouts, rate limits, and temporary dependency failures should retry; invalid input, missing records, and stale serialized arguments should discard or surface immediately.
5. **Pass stable inputs** — prefer IDs or other primitives, reload current state inside `perform`, and avoid stale serialized objects unless the repo intentionally relies on GlobalID.
6. **Match the actual backend** — Solid Queue, Sidekiq, and scheduler gems have different concurrency, uniqueness, and retry ownership rules.

## Backend and Retry Ownership

- Detect `config.active_job.queue_adapter`, queue names, recurring-job files, and retry defaults with `/skill:rails-conventions` before changing anything.
- Stay in ActiveJob when the feature fits its API. Drop to backend-specific APIs only for needs such as Solid Queue concurrency limits or Sidekiq uniqueness or middleware that the repo already uses.
- Keep one clear owner for retry behavior. If `retry_on` encodes the application policy, do not also leave an unrelated backend retry policy fighting it underneath.
- Match queue topology to operational expectations: critical, default, low, mailers, or the repo's equivalent. For worker process layout, deploy sequencing, and monitoring, pair this skill with `/skill:rails-devops`.

## Anti-Patterns

| Anti-pattern | Prefer |
| --- | --- |
| Business logic inside the job | Delegate to the profile-appropriate model or service layer |
| Guard clause without execution-time protection | Double-check locking or another idempotent state transition |
| Huge `find_in_batches` loop inside one job | Self-splitting batches or `perform_all_later` |
| Backend-specific retries layered on top of unrelated ActiveJob retries | One explicit retry owner |
| Queueing everything on `default` | Queue segmentation that matches workload priority and worker topology |

## Recommendation Format

When proposing or generating a job, include:
1. The `ApplicationJob` class with queue, retry, and discard configuration.
2. The idempotency strategy for duplicate or concurrent execution.
3. Any backend-specific dependency such as `limits_concurrency`, uniqueness, or recurring scheduler config.
4. The caller entry point (`*_later`, service, callback, or controller trigger).
5. The test surface and operational notes that need follow-up.

## Reference Guide

- [patterns.md](references/patterns.md) — detailed ActiveJob wrapper, retry, locking, batching, recurring-job, and backend-selection patterns.

## Related Skills

- `/skill:rails-conventions` — Detect queue adapters, job base-class defaults, queue names, and retry conventions before adding or changing jobs.
- `/skill:rails-stack-profiles` — Decide whether job bodies should delegate to models, services, or other workflow objects based on the app's profile.
- `/skill:rails-mailers` — Coordinate async email delivery and mailer-specific queue choices.
- `/skill:rails-devops` — Align worker topology, deployment, monitoring, and production queue operations with the app's background-job strategy.
- `/skill:find-docs` — Verify current Rails, ActiveJob, Solid Queue, Sidekiq, and scheduler APIs before using backend-specific features.

---
name: rails-mailers
description: Action Mailer patterns for mailer structure, previews, delivery queues, testing, and internationalized email content. Use when implementing or reviewing email delivery in a Rails app. Do NOT load for background job orchestration, push notifications, or non-Rails messaging systems.
---

# Rails Mailers

Use `/skill:rails-conventions` and `/skill:rails-stack-profiles` first to match the repo's conventions and profile. Assume `/skill:ruby-object-design` and `/skill:ruby-refactoring` are available for Ruby-level decisions.

## Scope

Use this skill for Action Mailer structure, templates, previews, delivery configuration, and mailer-specific test coverage that matches the repo's existing job and test setup.

See [patterns.md](references/patterns.md) for parameterized mailers, shared `ApplicationMailer` defaults, queue selection, preview scenarios, I18n subject patterns, and mailer tests.

## Quick Reference

| Pattern | Use when | Notes |
| --- | --- | --- |
| Parameterized mailer with `before_action` | Multiple mailer actions need the same context | Prefer `with(...)` plus `params` over repeating positional arguments |
| `ApplicationMailer` defaults | Layout, from address, headers, or rescue behavior should stay consistent | Keep delivery-wide defaults in one base class |
| Preview per action | Every non-trivial email should be inspectable in the browser | Add alternate states for edge cases and locales |
| `deliver_later` from the caller | Delivery is I/O and may need retries or queueing | Keep send timing in the model, service, or job that owns the workflow |
| Mailer-specific tests | Recipients, subject, body, multipart output, or enqueueing behavior matter | Match the repo's Minitest or RSpec helpers |

## Core Principles

1. **Mailers render; callers decide when to send**: keep workflow logic in models, services, or jobs and call the mailer at the delivery boundary.
2. **Default to `deliver_later`**: email delivery is I/O. Reserve `deliver_now` for console use, previews, and narrow test cases.
3. **One mailer action per email type**: do not branch between unrelated templates inside one method.
4. **Preview non-trivial emails**: previews catch layout, locale, and data-shape issues before they reach users.
5. **Ship text + HTML for important mail**: multipart output is the safe default for transactional email.
6. **Localize subjects and copy**: keep user-facing text in I18n instead of inline strings.

## Profile-Aware Defaults

| Profile | Typical delivery trigger | Testing default | Queue notes |
| --- | --- | --- | --- |
| Omakase | Model callback or small model method | Minitest mailer or integration tests | Usually relies on Rails-default queue naming |
| Service-oriented | Service object or job | RSpec mailer and request specs | Queue ownership and retries are often more explicit |
| API-first | Service or job after the API workflow completes | RSpec request or job specs plus focused mailer specs | Keep API response handling separate from delivery side effects |

If delivery timing, retries, or queue ownership are the main question, load `/skill:rails-jobs` alongside this skill.

## Mailer Review Checklist

When reviewing or generating mailer code, check:
1. The mailer class only prepares view data, headers, and `mail(...)`.
2. Caller code uses `deliver_later` unless the repo has a clear synchronous exception.
3. Every non-trivial mailer action has preview coverage.
4. Tests cover recipients, subject, body content, and enqueueing or conditional-delivery behavior.
5. Subjects, copy, and locale-sensitive formatting use I18n consistently.

## Anti-Patterns

| Anti-pattern | Why it hurts | Prefer |
| --- | --- | --- |
| `deliver_now` in a controller or request path | Blocks the request on external I/O | Enqueue with `deliver_later` from the caller |
| Business logic in mailers | Hides workflow decisions in rendering code | Move branching and orchestration to a model, service, or job |
| One method choosing several templates | Hard to preview and test | One mailer action per email type |
| No preview coverage | Layout and locale issues surface late | Add preview methods for the main path and important variants |
| Inline user-facing strings | Harder to localize and review | Put subjects and copy in I18n |

## Recommendation Format

When recommending a mailer change, include:
1. The mailer class and action shape.
2. The caller integration point and whether it should use `deliver_later`.
3. Template and preview files that must be added or updated.
4. Test coverage matching the repo's framework and job helpers.
5. Delivery configuration notes such as queue name, interceptor, observer, or provider-specific setup.

## Related Skills

- `/skill:rails-conventions` — Detect the repo's mailer, job, environment, and test conventions before changing email delivery.
- `/skill:rails-stack-profiles` — Match mailer recommendations to the app's omakase, service-oriented, or api-first profile.
- `/skill:rails-jobs` — Coordinate `deliver_later`, queue ownership, retries, and side-effect orchestration around email delivery.
- `/skill:rails-testing` — Match mailer specs, helpers, fixtures, factories, and enqueue assertions to the repo's test stack.
- `/skill:find-docs` — Verify current Action Mailer and provider-specific APIs before locking in an implementation.

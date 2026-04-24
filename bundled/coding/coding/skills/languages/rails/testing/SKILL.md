---
name: rails-testing
description: Rails testing guidance for choosing test types, framework conventions, and test-data setup across RSpec and Minitest suites. Use when writing or reviewing Rails tests or aligning coverage with the app's stack profile. Do NOT load for language-agnostic test philosophy or non-Rails load and monitoring concerns.
---

# Rails Testing

Use `/skill:rails-conventions` and `/skill:rails-stack-profiles` first to match the repo's conventions and profile. Assume `/skill:ruby-object-design` and `/skill:ruby-refactoring` are available for Ruby-level decisions.

This skill covers Rails-specific choices: which test type to write, how to match RSpec vs Minitest conventions, and when to use FactoryBot or fixtures. For behavior-first assertions, mocking discipline, and broader test design rules, load `/skill:engineering-principles`.

## Match the Existing Suite

Before adding or reviewing tests:
1. Read repo guidance files and local testing docs for the intended direction.
2. Detect whether the app uses `spec/` or `test/`, RSpec or Minitest, and FactoryBot or fixtures.
3. Match existing helpers, custom matchers, shared examples, and auth setup instead of introducing a new style.

## Choose the Smallest Rails Test That Covers the Behavior

| Test type | Best fit | Rails-specific default |
| --- | --- | --- |
| Model / unit | validations, scopes, callbacks, PORO domain logic | Fastest feedback for model rules and extracted business logic |
| Request / integration | params, auth, response shape, controller flow | Prefer RSpec request specs over controller specs; use Minitest integration tests for full-stack controller behavior |
| System | JavaScript behavior and critical user journeys | Keep only a small set of end-to-end flows; avoid CRUD coverage |
| Job | retries, idempotency, queueing, external side effects | Always cover jobs that touch external services or have custom retry behavior |
| Mailer | non-trivial content or conditional delivery | Skip trivial scaffold coverage |

## Profile-Aware Defaults

| Profile | Framework | Test data | First tests to add | UI coverage |
| --- | --- | --- | --- | --- |
| Omakase | Minitest | Fixtures | Integration and model tests | System tests for key flows |
| Service-oriented | RSpec | FactoryBot | Model/unit tests plus request specs | System tests sparingly |
| API-first | RSpec | FactoryBot | Request specs first | Prefer request specs over system tests |

Detailed trade-offs, helper patterns, and performance guidance live in [patterns.md](references/patterns.md).

## Rails-Specific Guardrails

- Do not test Rails internals or framework guarantees that Rails already covers.
- Prefer request or integration coverage over controller-spec-style testing.
- Keep factories minimal and trait-driven; keep fixtures realistic and curated when the repo uses them.
- Use Capybara's waiting behavior in system tests instead of `sleep`.
- Reserve database-cleaning truncation strategies for tests that cannot use transactions.

## Review Output

When reviewing a Rails test file or suite, use:

```md
## Test Analysis: [spec_or_test_file]

**Coverage Gaps:**
- [area] missing test for [scenario]

**Issues:**
- [severity] description

**Recommendations:**
1. actionable recommendation
```

## Related Skills

- `/skill:rails-conventions` — Detect the repo's testing helpers, matcher style, and local conventions before writing tests.
- `/skill:rails-stack-profiles` — Choose test types and defaults that fit the app's omakase, service-oriented, or api-first profile.
- `/skill:rails-models` — Align model, validation, and persistence tests with ActiveRecord-specific guidance.
- `/skill:engineering-principles` — Use shared guidance for behavior-first assertions, boundary mocking, and test-design discipline.
- `/skill:find-docs` — Check current Rails, Capybara, FactoryBot, or RSpec docs when version-specific behavior matters.

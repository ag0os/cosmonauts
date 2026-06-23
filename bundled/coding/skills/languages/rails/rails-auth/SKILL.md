---
name: rails-auth
description: Rails authentication patterns for sessions, password flows, Devise, and token-backed identity work. Use when implementing or reviewing login, signup, current-user loading, or password-reset flows in a Rails app. Do NOT load for authorization policy design, generic security hardening, or non-Rails identity systems.
---

# Rails Authentication

Use `/skill:rails-conventions` and `/skill:rails-stack-profiles` first to match the repo's conventions and profile. Assume `/skill:ruby-object-design` and `/skill:ruby-refactoring` are available for Ruby-level decisions.

## Scope

Use this skill for authentication only: how a request becomes an authenticated user, how sessions or bearer tokens are issued and revoked, and how password-reset or confirmation flows are modeled. Keep authorization separate so permission checks stay in the controller, policy, or API layer after identity is established.

See [patterns.md](references/patterns.md) for Rails 8 built-in auth, Devise Turbo integration, OmniAuth, session management, token flows, and profile-aware test helpers.

## Authentication Workflow

Before recommending an auth change:

1. Read repo guidance and migration notes first; do not suggest swapping Devise for built-in auth, or vice versa, unless explicitly asked.
2. Use `/skill:rails-conventions` to detect the current auth stack, installed modules, custom controllers, token helpers, and test setup.
3. Use `/skill:rails-stack-profiles` to branch between omakase, service-oriented, api-first, or hybrid defaults.
4. Extend the existing auth direction: Rails 8 generated auth, `has_secure_password`, Devise, or the repo's existing token layer.
5. Keep browser sessions, one-time tokens, and API bearer auth explicit; do not bury all three behind one vague "auth" abstraction.

## Common Rails Auth Tracks

| Approach | Typical profile | Use when | Notes |
|---|---|---|---|
| Rails 8 generated auth | Omakase | Newer apps or repos already using the generated `Session` model and auth concern | Strong fit for session-backed browser auth with built-in token helpers |
| `has_secure_password` + custom sessions | Omakase or hybrid | Simple custom auth with full control over controllers and session lifecycle | Keep the session flow explicit and add reset or confirmation flows deliberately |
| Devise | Service-oriented or mature HTML apps | Need modules such as confirmable, recoverable, lockable, rememberable, or omniauthable | Match the installed modules and controller overrides instead of assuming the full default set |
| Bearer or API token auth | API-first or hybrid | Non-browser clients, mobile apps, or stateless endpoints | Keep token issuance and verification in the auth layer and response envelopes in `/skill:rails-api` |

## Authentication vs Authorization

Authentication answers "who is this request acting as?" Authorization answers "what may that actor do?"
Do not mix them:

- load the current user or session in one shared place
- expose a consistent `Current.user`, `current_user`, or equivalent helper
- hand off policy and permission checks to the repo's controller or API conventions after authentication succeeds

If the repo uses Pundit, Action Policy, custom policy objects, or API permission checks, keep that boundary in `/skill:rails-api` or the repo's established controller layer rather than embedding permission logic in the authenticator.

## Session and Token Priorities

- Prefer the repo's existing session mechanism for browser auth instead of layering a second one on top.
- Reset or rotate session state on successful sign-in and provide a clear sign-out path.
- Model multiple browser sessions explicitly when the repo needs device or session management.
- Use expiring, invalidatable tokens for password reset, email confirmation, magic-link, and similar one-time flows.
- If the app also exposes bearer-token auth, keep token verification and current-user loading consistent across endpoints instead of decoding tokens separately in each controller.

## Auth-Specific Anti-Patterns

| Anti-pattern | Why it hurts | Prefer |
|---|---|---|
| Recommending a wholesale auth-stack swap without being asked | Ignores migrations, data shape, and existing conventions | Extend the current stack first |
| Mixing authentication and authorization in the same controller branches | Makes policies inconsistent and harder to test | Authenticate once, then authorize separately |
| Login or reset endpoints with no throttling | Brute-force and spam risk | Rate-limit sign-in and reset entry points using the repo's existing mechanism |
| Password-reset or confirmation tokens without expiry or invalidation | Reusable stale links | Use expiring tokens tied to mutable user state |
| Returning different reset responses for known vs unknown emails | User enumeration | Use the same outward response for both cases |
| Hand-rolled crypto when Rails or Devise already provides the token primitive | Easy to get wrong | Use built-in token helpers or the repo's existing token service |

## Recommendation Format

When proposing auth changes, include:
1. The auth model or configuration (`User`, `Session`, Devise modules, or token service).
2. The controller or concern entry points for sign-in, sign-out, reset, confirmation, or API authentication.
3. Route changes and unauthenticated or skip rules.
4. Test shape that matches the repo's current framework and helpers.
5. Session or token lifecycle notes: rotation, expiry, revocation, and multi-session behavior.

## Related Skills

- `/skill:rails-conventions` — Detect the repo's auth strategy, modules, controller overrides, and test helpers before changing authentication.
- `/skill:rails-stack-profiles` — Branch between omakase, service-oriented, api-first, and hybrid auth defaults.
- `/skill:rails-api` — Pair authentication with API-only token transport, error envelopes, and rate-limit response behavior.
- `/skill:rails-models` — Model users, sessions, token-backed records, and persistence rules around authentication state.
- `/skill:find-docs` — Verify current Rails, Devise, OmniAuth, and auth-related API details before locking in an implementation.

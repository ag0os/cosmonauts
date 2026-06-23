---
name: rails-conventions
description: Repository-specific Rails convention detection for services, auth, testing, base classes, error handling, controllers, jobs, models, serialization, and frontend setup. Use when fingerprinting an existing Rails repo before applying domain-specific guidance. Do NOT load for stack-profile classification or Ruby-level design choices.
---

# Rails Conventions

This is the Rails convention-detection entry point. Other Rails skills should load this skill with `/skill:rails-stack-profiles` to fingerprint the repo before applying domain-specific guidance.

## Purpose

Detect project-specific Rails patterns so generated code matches the repo, not generic Rails.
Produce a **Convention Fingerprint** — a structured summary of observed patterns.
Scan the codebase; do not ask the developer what patterns they use.

Usually run this immediately after `/skill:rails-stack-profiles`, or alongside it, before choosing domain-specific recommendations.

## Convention Categories

| Category | Detects | Common Uses |
|---|---|---|
| Service Objects | base class, entry point, naming, result type | service design, architecture reviews |
| Auth | strategy, modules, custom controllers, token approach | auth changes, controller work |
| Testing | framework specifics, shared examples, custom matchers, spec style | test generation and review |
| Base Classes | custom ApplicationX classes | matching local abstractions |
| Error Handling | exception hierarchy, rescue_from patterns | service and controller changes |
| Jobs | base config, queue names, naming pattern, retry strategy | background job work |
| Controllers | pagination, authorization, response helpers | controller and API changes |
| Domain Model | key entities, complexity, namespace structure | models and architecture |
| Serialization | library, envelope format, naming | API changes |
| Frontend | CSS framework, Stimulus patterns, component library, bundler | views and Hotwire work |

## Repo Guidance Priority Note

Always check repo guidance files for intent that overrides detected conventions.
`AGENTS.md`, `agents.md`, `README.md`, and local project docs often document **where the project is going**; the fingerprint documents **where it is now**.

Example: if `AGENTS.md` or `agents.md` says "migrating from Devise to built-in auth", respect that over the detected Devise convention.

## Micro-Scan

Run a lightweight 2-5 command scan for the categories relevant to the task at hand.
Full detection commands in [detection-commands.md](references/detection-commands.md).

**Service Object detection example:**

```
1. Glob `app/services/**/*.rb` — if empty, skip
2. Read first 20 lines of 2-3 files to detect: base class, entry method (.call/.perform/.run), naming pattern
3. Grep for Result/Success/Failure to identify result type
4. Check Gemfile for `dry-monads`
```

## Convention Fingerprint Output Format

```
## Convention Fingerprint

**Services:** base=ApplicationService | entry=.call | result=ServiceResult | naming=Module::VerbNoun
**Auth:** strategy=devise | modules=[database_authenticatable,recoverable,trackable] | custom_controllers=yes
**Testing:** framework=rspec | data=factory_bot | style=request_specs | shared_examples=yes
**Base Classes:** ApplicationQuery, ApplicationForm, ApplicationDecorator
**Error Handling:** hierarchy=ApplicationError>ServiceError,ValidationError | rescue_from=yes
**Jobs:** base=ApplicationJob | queues=[default,mailers,critical] | naming=VerbNounJob | retry=3
**Controllers:** pagination=pagy | auth=pundit | response=respond_to
**Domain:** [top 5-8 entities] | namespaced=yes/no | models_count=N
**Serialization:** lib=alba | envelope={data:,meta:} | naming=ModelSerializer
**Frontend:** css=tailwind | stimulus=yes | components=ViewComponent | bundler=importmap
```

## Defaults (when undetectable)

For new or empty projects, assume these defaults:

| Category | Default |
|---|---|
| Service Objects | VerbNoun naming, .call, Struct-based Result |
| Auth | has_secure_password (Rails 8+) |
| Testing | Match test/ vs spec/ directory |
| Base Classes | None — use standard Rails bases |
| Error Handling | rescue_from in ApplicationController |
| Jobs | ApplicationJob, default queue |
| Controllers | Standard Rails patterns |
| Serialization | to_json or Jbuilder |
| Frontend | Importmap + Stimulus |

**Reference:** See [detection-commands.md](references/detection-commands.md) for complete detection recipes.

## Related Skills

- `/skill:rails-stack-profiles` — Pair convention detection with stack-profile classification before applying Rails guidance.
- `/skill:rails-services` — Apply the detected service-object conventions to new service code.
- `/skill:rails-auth` — Match the repo's authentication strategy, modules, and controller customizations.
- `/skill:rails-testing` — Match the repo's test framework, data setup, and spec style.
- `/skill:rails-controllers` — Match controller helpers, response patterns, pagination, and authorization hooks.
- `/skill:rails-models` — Match domain structure, base classes, and model-layer patterns.
- `/skill:rails-api` — Match serializer, response envelope, and API versioning conventions.
- `/skill:rails-jobs` — Match job base classes, queue naming, and retry conventions.
- `/skill:rails-hotwire` — Match frontend conventions around Stimulus and Turbo.
- `/skill:rails-views` — Match template and component conventions in server-rendered UI work.
- `/skill:find-docs` — Fetch current docs for Rails gems or libraries detected in the repo.

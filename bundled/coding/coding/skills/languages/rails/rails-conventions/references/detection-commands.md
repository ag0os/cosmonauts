# Detection Commands

Use these recipes to build the Convention Fingerprint in `/skill:rails-conventions`.
Each category lists the commands to run, what to look for, common variants, and a default when the pattern is undetectable.

---

## 1. Service Object Conventions

**Useful for:** service design, architecture planning

### Detection Steps

1. **Glob** `app/services/**/*.rb` — count files, note directory structure (flat vs namespaced modules)
2. **Read** first 20 lines of 2-3 service files: look for `< ApplicationService`, `< BaseService`, or standalone class with no parent
3. **Grep** `app/services/` for `def call`, `def perform`, `def run` to identify the entry point method
4. **Grep** `app/services/` for `Result.new`, `Success(`, `Failure(`, `OpenStruct.new` to identify result type
5. **Grep** `Gemfile` for `dry-monads`, `interactor`, `trailblazer`

### Common Variants

| Pattern | Interpretation |
|---|---|
| `< ApplicationService` with `def call` | Custom base class, standard .call convention |
| Standalone class with `Result = Struct.new` | Lightweight, no base class, Struct-based result |
| `include Dry::Monads` with `Success()`/`Failure()` | dry-monads pattern |
| `include Interactor` with `def call` | Interactor gem |
| `< Trailblazer::Operation` | Trailblazer operation pattern |

### Default (if undetectable)

VerbNoun naming (e.g., `CreateUser`), `.call` entry point, `Struct`-based Result.

---

## 2. Auth Implementation

**Useful for:** auth and controller work

### Detection Steps

1. **Grep** `Gemfile` for `devise`, `rodauth`, `sorcery`, `jwt`, `omniauth`
2. If Devise found: **Grep** `app/models/user.rb` for `devise :` line to extract active modules
3. **Glob** `app/controllers/**/sessions_controller.rb` or `**/registrations_controller.rb` — custom auth controllers
4. **Grep** `app/models/` for `has_secure_password`, `authenticate_by`
5. **Grep** `app/models/` for `generates_token_for` (Rails 8+ token generation)
6. **Glob** `app/controllers/concerns/` for authentication-related concerns

### Common Variants

| Pattern | Interpretation |
|---|---|
| `devise :database_authenticatable, ...` | Devise with specific modules |
| `devise :` with custom sessions controller | Devise with custom controllers |
| `has_secure_password` only | Minimal built-in auth |
| `has_secure_password` + `generates_token_for` | Rails 8 authentication generator |
| `jwt` gem + token controller | API JWT authentication |
| `rodauth-rails` in Gemfile | Rodauth-based auth |

### Default (if undetectable)

`has_secure_password` (Rails 8+ style).

---

## 3. Testing Conventions

**Useful for:** test generation and review

### Detection Steps

1. Check for `spec/` vs `test/` directory existence to determine framework
2. **Glob** `spec/support/**/*.rb` or `test/support/**/*.rb` — count and list support files/helpers
3. **Grep** `spec/` for `shared_examples_for` or `shared_context` — shared example usage
4. **Grep** `spec/support/` for `RSpec::Matchers.define` — custom matcher files
5. Check whether `spec/requests/` or `spec/controllers/` is the dominant test style (request specs vs controller specs)
6. **Glob** `spec/factories/` vs `test/fixtures/` — count files to determine data strategy
7. **Grep** `Gemfile` for `factory_bot`, `faker`, `shoulda-matchers`, `vcr`, `webmock`

### Common Variants

| Pattern | Interpretation |
|---|---|
| `spec/` + `spec/factories/` | RSpec with FactoryBot |
| `test/` + `test/fixtures/` | Minitest with fixtures |
| `spec/requests/` dominant | Modern RSpec request spec style |
| `spec/controllers/` dominant | Legacy RSpec controller spec style |
| `shared_examples_for` present | Mature test suite with shared behaviors |
| `spec/` + `test/fixtures/` | RSpec with fixtures (rare but valid) |

### Default (if undetectable)

Match whichever of `test/` or `spec/` directory exists. If neither, default to Minitest (Rails default).

---

## 4. Custom Base Classes

**Useful for:** any task that needs local abstractions

### Detection Steps

1. **Grep** `app/` for pattern `class Application\w+ <` — find ApplicationService, ApplicationQuery, ApplicationForm, ApplicationDecorator, etc.
2. **Grep** `app/` for pattern `class Base\w+ <` — find BaseService, BaseQuery, etc.
3. For each found, **Read** first 15 lines to understand the interface: abstract methods, shared behavior, included modules

### Common Variants

| Pattern | Interpretation |
|---|---|
| `ApplicationService < Object` | Custom service base class |
| `ApplicationQuery < Object` | Query object pattern in use |
| `ApplicationForm < Object` | Form object pattern in use |
| `ApplicationDecorator < SimpleDelegator` | Decorator pattern |
| `BaseService` instead of `ApplicationService` | Alternative naming convention |
| No custom base classes | Standard Rails bases only |

### Default (if undetectable)

None — use standard Rails base classes (ApplicationRecord, ApplicationController, ApplicationJob, ApplicationMailer).

---

## 5. Error Handling

**Useful for:** controller and service changes

### Detection Steps

1. **Read** `app/controllers/application_controller.rb` — look for `rescue_from` lines and what exceptions they handle
2. **Glob** `app/errors/**/*.rb` or `lib/errors/**/*.rb` — custom error class files
3. **Grep** `app/` and `lib/` for `< StandardError` or `< ApplicationError` — custom exception hierarchy
4. **Grep** `app/controllers/` for `rescue_from` to see which controllers define error handling

### Common Variants

| Pattern | Interpretation |
|---|---|
| `ApplicationError < StandardError` with subclasses | Custom exception hierarchy |
| `rescue_from` only in ApplicationController | Centralized error handling, no custom hierarchy |
| `app/errors/` directory with multiple files | Rich exception taxonomy |
| No custom errors or rescue_from | Minimal error handling — Rails defaults |

### Default (if undetectable)

`rescue_from` in ApplicationController for common exceptions (ActiveRecord::RecordNotFound, ActionController::ParameterMissing).

---

## 6. Job Conventions

**Useful for:** background job work

### Detection Steps

1. **Read** `app/jobs/application_job.rb` — look for `queue_as`, `retry_on`, `discard_on`, included modules
2. **Glob** `app/jobs/**/*.rb` — count and note naming pattern (VerbNounJob, NounVerbJob)
3. **Read** first 15 lines of 1-2 job files to detect structure and conventions
4. **Read** `config/sidekiq.yml` or `config/queue.yml` (Solid Queue, Rails 8 default) for queue names and concurrency settings
5. **Grep** `Gemfile` for `sidekiq`, `solid_queue`, `good_job`, `resque`

### Common Variants

| Pattern | Interpretation |
|---|---|
| `config/sidekiq.yml` with named queues | Sidekiq with custom queue topology |
| `config/queue.yml` | Solid Queue (Rails 8 default) |
| `retry_on` in ApplicationJob | Global retry strategy |
| `retry_on` per-job only | Per-job retry strategy |
| VerbNounJob naming (e.g., `SendEmailJob`) | Standard Rails job naming |

### Default (if undetectable)

ApplicationJob base class, `default` queue, VerbNounJob naming.

---

## 7. Controller Conventions

**Useful for:** controller and API work

### Detection Steps

1. **Read** `app/controllers/application_controller.rb` — look for includes, `rescue_from`, helper methods, `before_action`
2. **Grep** `Gemfile` for `pagy`, `kaminari`, `will_paginate` — pagination library
3. **Grep** `app/controllers/` for `respond_with` — responders pattern
4. **Grep** `Gemfile` for `pundit`, `cancancan`, `action_policy` — authorization library
5. **Read** 1 existing resource controller to see response pattern: redirect+render, `respond_to`, `turbo_stream`
6. **Grep** `app/controllers/` for `before_action` patterns to identify common filters

### Common Variants

| Pattern | Interpretation |
|---|---|
| `include Pagy::Backend` | Pagy pagination |
| `include Pundit::Authorization` | Pundit authorization |
| `respond_to do \|format\|` blocks | Multi-format responses |
| `turbo_stream` responses | Hotwire/Turbo integration |
| Namespaced `Api::V1::BaseController` | API versioning in use |

### Default (if undetectable)

Standard Rails controller patterns — redirect/render, no pagination gem, no authorization gem.

---

## 8. Domain Model

**Useful for:** model and architecture work

### Detection Steps

1. **Read** `db/schema.rb` — extract table names for a first-pass scan of the domain (look for `create_table` lines)
2. **Glob** `app/models/**/*.rb` — count models, note namespace structure (flat vs `app/models/billing/`)
3. **Read** `app/models/application_record.rb` — look for shared concerns, includes, default scopes
4. **Grep** `app/models/` for `has_many`, `belongs_to`, `has_one` — map key relationships
5. **Glob** `app/models/concerns/*.rb` — count and note shared model concerns

### Common Variants

| Pattern | Interpretation |
|---|---|
| Flat `app/models/` | Simple domain, no bounded contexts |
| Namespaced models (`Billing::Invoice`) | Domain-driven namespacing |
| Many concerns in `app/models/concerns/` | Concern-heavy architecture |
| STI tables (type column in schema) | Single Table Inheritance in use |
| Polymorphic associations | Polymorphic patterns in use |

### Default (if undetectable)

Scan `db/schema.rb` for key entities. Assume flat namespace.

---

## 9. Serialization

**Useful for:** API and serialization work

### Detection Steps

1. **Grep** `Gemfile` for `alba`, `blueprinter`, `jsonapi-serializer`, `active_model_serializers`, `jbuilder`, `oj`
2. **Glob** `app/serializers/**/*.rb` or `app/resources/**/*.rb` — serializer directory and count
3. **Glob** `app/views/**/*.jbuilder` — Jbuilder template count
4. **Read** 1 serializer file to detect response envelope pattern — look for `data`/`meta`/`errors` wrapper structure
5. Note naming convention: `UserSerializer`, `UserResource`, `UserBlueprint`

### Common Variants

| Pattern | Interpretation |
|---|---|
| `app/serializers/` + `alba` gem | Alba serialization |
| `app/serializers/` + `blueprinter` | Blueprinter serialization |
| `app/views/**/*.jbuilder` | Jbuilder templates |
| `app/resources/` + `jsonapi-serializer` | JSON:API format |
| No serializers, `render json:` only | Inline JSON rendering |

### Default (if undetectable)

`to_json` or Jbuilder (Rails default).

---

## 10. Frontend Conventions

**Useful for:** views and Hotwire work

### Detection Steps

1. **Grep** `Gemfile` for `tailwindcss-rails`, `bootstrap`, `sass-rails`, `cssbundling-rails` — CSS framework
2. **Grep** `Gemfile` for `importmap-rails`, `jsbundling-rails`, `vite_ruby` — JS bundling strategy
3. **Glob** `app/javascript/controllers/**/*.js` or `**/*.ts` — count Stimulus controllers, sample 1-2 for naming convention
4. **Glob** `app/components/**/*.rb` — ViewComponent usage
5. Check for `app/assets/builds/` (cssbundling) vs `app/assets/stylesheets/application.tailwind.css` (tailwind)
6. **Grep** `Gemfile` for `view_component`, `phlex`, `nice_partials`

### Common Variants

| Pattern | Interpretation |
|---|---|
| `tailwindcss-rails` + `importmap-rails` | Tailwind + Importmap (Rails 8 default) |
| `cssbundling-rails` + `jsbundling-rails` | Node-based bundling (esbuild/rollup) |
| `vite_ruby` in Gemfile | Vite bundler |
| `app/components/` present | ViewComponent library |
| `phlex` in Gemfile | Phlex component framework |
| `app/javascript/controllers/` with `_controller.js` | Stimulus naming convention |

### Default (if undetectable)

Importmap + Stimulus (Rails default since Rails 7).

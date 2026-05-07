---
name: rails-models
description: ActiveRecord model patterns for associations, validations, scopes, callbacks, migrations, and query tuning. Use when designing Rails models or reviewing schema and persistence rules. Do NOT load for controller flow, view rendering, or service orchestration.
---

# Rails Models

Use `/skill:rails-conventions` and `/skill:rails-stack-profiles` first to match the repo's conventions and profile. Assume `/skill:ruby-object-design` and `/skill:ruby-refactoring` are available for Ruby-level decisions.

## Scope

Use this skill for ActiveRecord structure and persistence rules: associations, validations, scopes, callbacks, migrations, query shape, and model-layer decomposition. Keep database constraints and application rules aligned.

## Reference Guides

- [associations.md](references/associations.md) — association choice, `dependent`, eager loading, and extension patterns.
- [validations.md](references/validations.md) — validation strategy, custom validators, contexts, and database pairing.
- [migrations.md](references/migrations.md) — production-safe migrations, indexes, and constraint rollouts.
- [value-objects.md](references/value-objects.md) — Rails persistence patterns for custom types, JSON columns, and richer state objects.

## ActiveRecord Priorities

1. Organize models predictably: constants, associations, validations, scopes, callbacks, class methods, instance methods, private methods.
2. Pair model validations with database constraints: unique indexes, `NOT NULL`, foreign keys, and check constraints.
3. Treat association options as behavior, not boilerplate: choose `dependent`, `inverse_of`, `touch`, and `counter_cache` intentionally.
4. Keep named scopes composable and query-friendly; prefer explicit scopes over `default_scope`.
5. Use callbacks for local, predictable record lifecycle work. When a change coordinates multiple models or external systems, follow the repo profile and move orchestration toward `/skill:rails-services`.
6. Shape queries to match indexes and loading strategy; audit `includes`, `preload`, and `eager_load` choices together with index coverage.

## Model-Layer Patterns

### State as relationships, not booleans

Instead of a `closed` boolean, model the event or relationship that carries metadata.

```ruby
class Card < ApplicationRecord
  has_one :closure, dependent: :destroy

  def closed? = closure.present?

  def close!(by:, reason: nil)
    create_closure!(creator: by, reason: reason)
  end

  def reopen!
    closure&.destroy!
  end
end

class Closure < ApplicationRecord
  belongs_to :card
  belongs_to :creator, class_name: "User"
end
```

This keeps who, when, and why in the schema instead of encoding only `true` or `false`.

### Default association values

Use association defaults to remove controller assignment boilerplate when the default is derivable from existing context.

```ruby
class Post < ApplicationRecord
  belongs_to :creator, class_name: "User", default: -> { Current.user }
  belongs_to :account, default: -> { Current.account }
end
```

Check whether the repo actually uses `CurrentAttributes` before introducing `Current.*`.

### Concerns as traits, not file-shrinking

In concern-friendly Rails apps, extract a concern when it represents a real domain trait or shared model role. Do not extract a concern just to move one method or one scope out of a file.

```ruby
module Closeable
  extend ActiveSupport::Concern

  included do
    has_one :closure, dependent: :destroy
    scope :closed, -> { joins(:closure) }
    scope :open, -> { where.missing(:closure) }
  end

  def closed? = closure.present?
  def close!(by:, reason: nil) = create_closure!(creator: by, reason: reason)
  def reopen! = closure&.destroy!
end
```

A concern that wraps one method or one scope in one model is a lazy concern. Inline it unless it is a real trait or shared across multiple models.

### Domain objects beside models

When logic is part of the domain but not a persistence rule, keep the model API small and place the workflow in a nearby domain object. In omakase repos that may live beside models; in service-oriented repos it may belong under `/skill:rails-services`.

```ruby
class Signup
  include ActiveModel::Model

  attr_accessor :name, :email, :password

  validates :name, :email, :password, presence: true

  def save
    return false unless valid?

    User.create!(name: name, email: email, password: password)
  end
end
```

Use `/skill:ruby-object-design` to choose the Ruby construct, then use [value-objects.md](references/value-objects.md) for ActiveRecord integration.

## Model Smell Triage

### God model warning signs

Treat a model as a god object when it shows several of these signals:

- 10+ associations
- 5+ callbacks
- 200+ lines
- 5+ included concerns
- methods that barely use the model's own attributes

Do not rewrite the whole model at once. Identify the most actively changing responsibility first and extract that axis of change before touching the rest.

### Status-field leakage

Scattered checks such as `status == "active" && payment_status == "current"` mean state rules are leaking across the app. Use enums and scopes for simple single-column cases. When transitions or multi-attribute rules become meaningful, move them behind a dedicated state representation or value object; see [value-objects.md](references/value-objects.md).

### Callback and query smell checks

Revisit a model when callbacks begin coordinating multiple records, scopes hide joins that need explicit loading choices, or the same query path repeatedly causes N+1s. The fix is usually to simplify ownership, make the query explicit, and align indexes with the final query shape.

## Persistence and Error Handling

- Use `save` for user-facing form flows and `save!` inside transactions or internal orchestration.
- Wrap multi-model writes in `ActiveRecord::Base.transaction`.
- Handle `ActiveRecord::RecordInvalid`, `ActiveRecord::RecordNotFound`, and `ActiveRecord::StaleObjectError` intentionally.
- Use optimistic locking with `lock_version` when concurrent updates matter.

## Common Anti-Patterns

| Anti-pattern | Why it hurts | Prefer |
|---|---|---|
| Missing `dependent:` on `has_many`/`has_one` | Orphaned records or accidental deletes | Pick the lifecycle explicitly |
| `default_scope` | Hidden query behavior | Named scopes |
| Validations without DB constraints | Race conditions and bad data | Add the matching index or constraint |
| Complex callbacks with side effects | Hard-to-follow writes | Keep callbacks local; move orchestration to a model-layer object or service |
| Boolean or string flags for rich state | No metadata, transitions, or audit trail | State relationship, enum, or dedicated state object |
| Single-use one-method or one-scope concerns | Noise without reuse | Inline or extract a real trait |

## Recommendation Format

When proposing model changes:
1. Show the model structure and the persistence rule being encoded.
2. Show the migration or constraint change that enforces the same rule in the database.
3. Call out the query shape, loading strategy, and index impact.
4. Match the repo's testing and layering conventions from `/skill:rails-conventions` and `/skill:rails-stack-profiles`.

## Related Skills

- `/skill:rails-conventions` — Detect the repo's base classes, model organization, and domain conventions before changing models.
- `/skill:rails-stack-profiles` — Decide how model logic, callbacks, and decomposition should vary by stack profile.
- `/skill:rails-architecture` — Resolve model-layer issues that are really boundary or ownership problems across Rails layers.
- `/skill:rails-services` — Move multi-model or external orchestration out of callbacks when the repo uses service objects.
- `/skill:ruby-object-design` — Choose the Ruby object shape for extracted value objects or domain collaborators.
- `/skill:ruby-refactoring` — Interpret model smells and choose Ruby-level refactoring moves once the Rails boundary is clear.
- `/skill:find-docs` — Check current Rails and ActiveRecord API docs for association, migration, and attribute features.

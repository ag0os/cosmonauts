# ActiveRecord Validation Patterns

Generate standard Rails validations (`presence`, `uniqueness`, `format`, `length`, `numericality`, `inclusion`, conditional) following Rails conventions. This reference covers strategy decisions and non-obvious patterns.

## Core Rule: Pair validations with database constraints

Every critical validation needs a matching database constraint.

| Validation | DB constraint |
|---|---|
| `presence: true` | `null: false` |
| `uniqueness: true` | `add_index ..., unique: true` |
| `numericality: { greater_than: 0 }` | `add_check_constraint` |
| `inclusion: { in: [...] }` | `create_enum` or `add_check_constraint` |

A uniqueness validation without a unique index is still race-prone.

## Custom validator classes

Extract a validator to `app/validators/` when the same rule appears across multiple models.

```ruby
class EmailValidator < ActiveModel::EachValidator
  def validate_each(record, attribute, value)
    return if value.blank?

    unless value =~ URI::MailTo::EMAIL_REGEXP
      record.errors.add(attribute, options[:message] || "is not a valid email")
    end

    if options[:disposable] == false && disposable_email?(value)
      record.errors.add(attribute, "cannot be a disposable email")
    end
  end

  private

  def disposable_email?(email)
    domain = email.split("@").last
    DisposableDomains.include?(domain)
  end
end
```

Usage: `validates :email, email: { disposable: false }`

## Shared validation concerns

Use a concern only when the validation bundle is a real shared trait across multiple models.

```ruby
module Sluggable
  extend ActiveSupport::Concern

  included do
    validates :slug,
      presence: true,
      uniqueness: true,
      format: { with: /\A[a-z0-9-]+\z/ }
    before_validation :generate_slug, on: :create
  end

  private

  def generate_slug
    self.slug ||= name&.parameterize
  end
end
```

If only one model uses the code and the concern does not represent a meaningful trait, keep the validation inline.

## Validation contexts

Use custom contexts sparingly, only when a model truly has different validity rules in different workflows.

```ruby
validates :terms_accepted, acceptance: true, on: :registration
user.save(context: :registration)
```

## Strict validations

Use strict validations for programmer errors, not user-facing validation failures.

```ruby
validates :token, presence: true, strict: true
```

This raises `ActiveModel::StrictValidationFailed`.

## Skipping validations

Use these escape hatches intentionally and document why:

- `save(validate: false)` — exceptional data fixes or migrations
- `update_column` / `update_columns` — targeted writes that also skip callbacks
- `insert_all` — bulk inserts with data validated elsewhere

## Key Rules

- Combine related validations into one `validates` call per attribute.
- Use `on: :create` or `on: :update` only when lifecycle-specific rules really differ.
- Prefer built-in validators over custom methods for standard checks.
- Add meaningful user-facing messages, and use i18n when the app is localized.
- Keep model validations focused on domain rules; push multi-record or workflow orchestration elsewhere.

# Value Objects in Rails Models

This reference covers Rails persistence and integration patterns only. For choosing between `Hash`, `Struct`, `Data.define`, and a full class, load `/skill:ruby-object-design`.

## When value objects help Rails models

Use a value object when a model keeps treating a multi-attribute concept as one thing:

- money, address, coordinate, or date range
- JSON or JSONB blobs that now need coercion, equality, or invariant checks
- state that has outgrown a single enum or a couple of scattered status checks

Do not wrap a single scalar attribute just to add indirection.

## Custom ActiveRecord type

A custom type is the cleanest option when one persisted attribute should always round-trip through a richer object.

```ruby
class CoordinateType < ActiveRecord::Type::Value
  def cast(value)
    case value
    when Coordinate then value
    when Hash then Coordinate.new(**value.symbolize_keys)
    when String then Coordinate.new(**JSON.parse(value).symbolize_keys)
    end
  end

  def serialize(value)
    value&.to_h&.to_json
  end

  def deserialize(value)
    return nil unless value

    Coordinate.new(**JSON.parse(value).symbolize_keys)
  end
end

ActiveRecord::Type.register(:coordinate, CoordinateType)

class Event < ApplicationRecord
  attribute :location, :coordinate
end
```

Pick the Ruby object shape for `Coordinate` with `/skill:ruby-object-design`; the Rails-specific decision here is whether `attribute` plus a custom type is the right persistence boundary.

## JSON or JSONB column integration

Use a JSON column when the shape is nested or semi-structured and you still want a richer Ruby interface at the model boundary.

```ruby
class Event < ApplicationRecord
  def location
    @location ||= begin
      data = read_attribute(:location)
      data ? Coordinate.new(**data.symbolize_keys) : nil
    end
  end

  def location=(coordinate)
    @location = coordinate
    write_attribute(:location, coordinate&.to_h)
  end
end
```

If you query inside the JSONB payload, add the right indexes and keep the serialized shape stable.

## Richer state than scattered status strings

Simple single-column state can stay as an enum plus scopes. Once behavior depends on multiple persisted fields or transition rules, centralize that logic behind one state object instead of scattering conditionals across models, controllers, and views.

```ruby
class Policy < ApplicationRecord
  scope :currently_active, -> { where(status: "active", payment_status: "current") }

  def state
    PolicyState.new(status: status, payment_status: payment_status)
  end

  def active_for_billing?
    state.active_for_billing?
  end
end
```

Keep scopes and columns for database querying; let the value object own the richer predicates and transition rules.

## Key Rules

- Make serialization deterministic and reversible.
- Handle `nil`, `Hash`, and string input paths explicitly in custom types.
- Keep frequently filtered attributes queryable; do not hide reporting or indexing needs inside opaque blobs.
- Use the model as the persistence boundary and the value object as the behavior boundary.
- Load `/skill:ruby-object-design` for equality, immutability, and Ruby construct decisions.

# ActiveRecord Associations

Generate standard Rails associations (`belongs_to`, `has_many`, `has_one`, `has_many :through`, polymorphic) following Rails conventions. This reference covers decision guidance and advanced patterns only.

## Decision Guidance

### `has_many :through` vs `has_and_belongs_to_many`

Prefer `has_many :through`. Use HABTM only for trivial join tables that will never need attributes, callbacks, validations, or direct querying on the join record.

### `dependent` option selection

| Option | Use when |
|---|---|
| `:destroy` | Children have callbacks or further dependents |
| `:delete_all` | No callbacks are needed and bulk deletion speed matters |
| `:nullify` | Children should survive parent deletion |
| `:restrict_with_error` | Deletion should fail with a validation-style message |
| `:restrict_with_exception` | Deletion should fail hard and loudly |

### Eager loading strategy

| Method | Use when |
|---|---|
| `includes` | Default choice when Rails can decide between joins and separate queries |
| `preload` | You want separate queries and are not filtering on associated columns |
| `eager_load` | You need to filter or sort on associated columns |

## Advanced Patterns

### Default association values

Automatically derive association values from related records or current request context.

Check for `app/models/current.rb` before assuming `CurrentAttributes` is available.

```ruby
class Card < ApplicationRecord
  belongs_to :account, default: -> { board.account }
  belongs_to :creator, class_name: "User", default: -> { Current.user }
  belongs_to :board, touch: true
end
```

Without `Current.user`, defaults can still derive values from already-associated records such as `board.account`.

### Association extensions

Add collection behavior only when the operation is truly about that relationship.

```ruby
class Board < ApplicationRecord
  has_many :accesses, dependent: :delete_all do
    def revise(granted: [], revoked: [])
      transaction do
        grant_to(granted)
        revoke_from(revoked)
      end
    end

    def grant_to(users)
      Access.insert_all(Array(users).map { |user|
        {
          id: ActiveRecord::Type::Uuid.generate,
          board_id: proxy_association.owner.id,
          user_id: user.id,
          account_id: user.account_id,
        }
      })
    end

    def revoke_from(users)
      destroy_by(user: users) unless proxy_association.owner.all_access?
    end
  end
end
```

Use `proxy_association.owner` to reach the parent record inside the extension.

### Self-referential convenience methods

Add an identity method when polymorphic code needs a uniform interface.

```ruby
class Card < ApplicationRecord
  def card = self
end

class Comment < ApplicationRecord
  belongs_to :card
end
```

This keeps callers simple when they need `record.card` for mixed collections of cards, comments, and attachments.

## Key Rules

- Put an explicit lifecycle on every destructive `has_many` and `has_one` with `dependent:`.
- Be explicit about `inverse_of` when Rails cannot infer it, especially with custom names or scoped associations.
- Add database indexes for foreign keys and frequent join columns.
- Use `counter_cache: true` for frequently read counts.
- Use `touch: true` only when parent timestamps or caches really depend on child updates.
- Re-check loading strategy after adding scopes or filters on associated tables.

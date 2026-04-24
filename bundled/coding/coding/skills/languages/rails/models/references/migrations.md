# Safe Migration Patterns

Generate standard Rails migrations (`create_table`, `add_column`, `add_index`, `references`, foreign keys) following Rails conventions. This reference covers production-safety patterns and non-obvious decisions.

## Production Safety Patterns

### Adding columns to large tables

```ruby
# Step 1: add the column without a constraint
add_column :users, :role, :string

# Step 2: backfill in batches
User.in_batches.update_all(role: "member")

# Step 3: constrain after the data is valid
change_column_null :users, :role, false
change_column_default :users, :role, "member"
```

For small tables, `add_column :users, :admin, :boolean, default: false, null: false` is usually safe in one step.

### Adding indexes without downtime (PostgreSQL)

```ruby
class AddIndexToPostsTitle < ActiveRecord::Migration[7.1]
  disable_ddl_transaction!

  def change
    add_index :posts, :title, algorithm: :concurrently
  end
end
```

Use `disable_ddl_transaction!` with `algorithm: :concurrently`.

### Safe column removal (two-deploy process)

```ruby
# Deploy 1: tell Rails to ignore the column
class User < ApplicationRecord
  self.ignored_columns += [:old_column]
end

# Deploy 2: remove the column
remove_column :users, :old_column, :string
```

Never remove a column that the running app still references.

### Dangerous operations checklist

| Operation | Risk | Safer move |
|---|---|---|
| Remove column | Running app still references it | `ignored_columns` first |
| Rename column | App code breaks between deploys | Add new column, copy data, remove old |
| Change column type | Data loss or lock time | Add new column, migrate data, swap later |
| Add `NOT NULL` to existing column | Migration fails if nulls exist | Backfill first, then constrain |
| Add index on large table | Table lock | `algorithm: :concurrently` on PostgreSQL |

## PostgreSQL-Specific Patterns

```ruby
# UUID primary keys
create_table :posts, id: :uuid do |t|
  t.string :title
end

# JSONB with GIN index
add_column :users, :preferences, :jsonb, default: {}
add_index :users, :preferences, using: :gin

# Array columns
add_column :posts, :tags, :string, array: true, default: []
add_index :posts, :tags, using: :gin

# Native enum
create_enum :post_status, ["draft", "published", "archived"]
add_column :posts, :status, :enum, enum_type: :post_status, default: "draft"

# Partial index
add_index :posts, :published_at, where: "published = true"

# Expression index
add_index :users, "lower(email)", unique: true
```

## Data Migrations

### Small tables: inline carefully

```ruby
class BackfillUserSlugs < ActiveRecord::Migration[7.1]
  class MigrationUser < ApplicationRecord
    self.table_name = "users"
  end

  def up
    add_column :users, :slug, :string

    MigrationUser.find_each do |user|
      user.update_column(:slug, user.name.parameterize)
    end

    add_index :users, :slug, unique: true
    change_column_null :users, :slug, false
  end
end
```

For migrations that may live through substantial model changes, prefer a migration-local class or SQL over the application model.

### Large tables: separate schema and backfill

Use one deploy to add the column and supporting index, then backfill in a job or task using batches.

## Index Strategy

- Index foreign keys and any column used heavily in `WHERE`, `ORDER BY`, or `GROUP BY`.
- Use composite indexes for common multi-column queries; remember the leftmost-prefix rule.
- Prefer partial indexes when queries always include the same predicate.
- Keep indexes aligned with the actual query shapes used by scopes and preload paths.

## Key Rules

- Make every migration reversible; use `change` when Rails can infer the rollback and `up`/`down` when it cannot.
- Add foreign key constraints for referential integrity.
- Use `reversible` for raw SQL that needs both directions.
- Test with `rails db:migrate` and `rails db:rollback` before shipping.

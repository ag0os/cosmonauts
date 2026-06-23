# Rails GraphQL Patterns — Detailed Reference

Match the repo's existing GraphQL organization and auth conventions when they already exist. These patterns cover graphql-ruby structure, mutation payloads, subscriptions, and batching with `GraphQL::Dataloader`.

## RecordLoader for ID-Based Fetches

Use a record loader for `belongs_to`-style lookups keyed by an ID on the current object.

```ruby
class Sources::RecordLoader < GraphQL::Dataloader::Source
  def initialize(model_class, column: :id)
    @model_class = model_class
    @column = column
  end

  def fetch(ids)
    records = @model_class.where(@column => ids).index_by { |record| record.public_send(@column) }
    ids.map { |id| records[id] }
  end
end

# Usage in a type
field :author, Types::UserType, null: false

def author
  dataloader.with(Sources::RecordLoader, User).load(object.user_id)
end
```

This keeps foreign-key lookups batched and avoids one query per row.

## AssociationLoader for `has_many` and `has_one`

Batch-preload ActiveRecord associations instead of resolving them record by record.

```ruby
class Sources::AssociationLoader < GraphQL::Dataloader::Source
  def initialize(model_class, association_name)
    @model_class = model_class
    @association_name = association_name
  end

  def fetch(records)
    ActiveRecord::Associations::Preloader.new(
      records: records,
      associations: @association_name
    ).call

    records.map { |record| record.public_send(@association_name) }
  end
end

# Usage
field :comments, [Types::CommentType], null: false

def comments
  dataloader.with(Sources::AssociationLoader, Post, :comments).load(object)
end
```

If the repo already has a shared association loader, extend it instead of creating a second version.

## CountLoader for Aggregate Fields

Use a dedicated loader for counts and similar aggregate data so the schema does not load full child collections just to compute a number.

```ruby
class Sources::CountLoader < GraphQL::Dataloader::Source
  def initialize(model_class, foreign_key)
    @model_class = model_class
    @foreign_key = foreign_key
  end

  def fetch(ids)
    counts = @model_class
      .where(@foreign_key => ids)
      .group(@foreign_key)
      .count

    ids.map { |id| counts[id] || 0 }
  end
end

# Usage
field :comments_count, Integer, null: false

def comments_count
  dataloader.with(Sources::CountLoader, Comment, :post_id).load(object.id)
end
```

## Connection Types for Pagination

Use connection types for list fields so pagination, cursors, and metadata stay part of the schema contract.

```ruby
module Types
  class PostConnectionType < GraphQL::Types::Connection
    edge_type(Types::PostEdgeType)
    field :total_count, Integer, null: false

    def total_count
      object.items.size
    end
  end
end

field :posts, Types::PostConnectionType, null: false, connection: true do
  argument :filter, Types::PostFilterInput, required: false
end
```

Keep list fields bounded. Do not return unpaginated arrays for resources that can grow without limit.

## Schema Configuration

Configure schema-wide complexity, depth, pagination, and error mapping at the schema boundary.

```ruby
class MyAppSchema < GraphQL::Schema
  max_complexity 300
  max_depth 15
  default_max_page_size 25

  use GraphQL::Dataloader

  rescue_from ActiveRecord::RecordNotFound do |_error, _object, _arguments, _context, field|
    raise GraphQL::ExecutionError, "#{field.type.unwrap.graphql_name} not found"
  end
end
```

Set per-field complexity on expensive fields instead of loosening global limits.

```ruby
field :expensive_field, String do
  complexity 50
end
```

## Base Mutation with Authorization Hooks

Keep shared auth and authorization checks in one mutation base class when the repo uses that pattern.

```ruby
module Mutations
  class BaseMutation < GraphQL::Schema::RelayClassicMutation
    argument_class Types::BaseArgument
    field_class Types::BaseField
    input_object_class Types::BaseInputObject
    object_class Types::BaseObject

    def current_user
      context[:current_user]
    end

    def authenticate!
      raise GraphQL::ExecutionError, "Authentication required" unless current_user
    end

    def authorize!(record, action)
      policy = Pundit.policy!(current_user, record)
      unless policy.public_send("#{action}?")
        raise GraphQL::ExecutionError, "Not authorized"
      end
    end
  end
end
```

If the repo already wraps auth in helpers or uses a different policy layer, preserve that entry point and keep the GraphQL boundary consistent with the rest of the app.

## Structured User Errors

Return field-level mutation errors in the payload instead of turning validation failures into generic GraphQL exceptions.

```ruby
module Types
  class UserErrorType < Types::BaseObject
    field :field, String, description: "Field with error (camelCase)"
    field :message, String, null: false, description: "Error message"
  end
end

# In a mutation resolve method
field :errors, [Types::UserErrorType], null: false

private

def user_errors(record)
  record.errors.map do |error|
    {
      field: error.attribute.to_s.camelize(:lower),
      message: error.message
    }
  end
end
```

A common payload shape is `{ resource:, errors: [] }` on success and `{ resource: nil, errors: [...] }` on validation failure.

## Subscriptions

Trigger subscriptions from the write boundary so broadcasts only happen after the database commit succeeds.

```ruby
class Post < ApplicationRecord
  after_create_commit :notify_subscribers

  private

  def notify_subscribers
    MyAppSchema.subscriptions.trigger(:post_created, {}, self)
  end
end
```

Keep subscription filtering in the subscription field itself when filtering depends on subscriber arguments.

```ruby
module Types
  class SubscriptionType < Types::BaseObject
    field :post_created, Types::PostType, null: false do
      argument :author_id, ID, required: false
    end

    def post_created(author_id: nil)
      return object unless author_id
      object if object.author_id.to_s == author_id
    end
  end
end
```

## Direct Schema Tests

Execute queries against the schema directly when the repo's GraphQL tests are schema-focused. Assert on `data` and `errors` instead of GraphQL internals.

```ruby
RSpec.describe Types::QueryType do
  let(:user) { create(:user) }
  let(:context) { { current_user: user } }

  describe "posts query" do
    let(:query) do
      <<~GQL
        query($status: PostStatus) {
          posts(status: $status) {
            nodes { id title }
            totalCount
          }
        }
      GQL
    end

    it "returns published posts" do
      create_list(:post, 3, :published)

      result = MyAppSchema.execute(
        query,
        context: context,
        variables: { status: "PUBLISHED" }
      )

      expect(result["data"]["posts"]["totalCount"]).to eq(3)
      expect(result["errors"]).to be_nil
    end
  end
end
```

If the repo instead tests GraphQL through request specs, keep the same query shape and assertions while moving the execution boundary to HTTP.

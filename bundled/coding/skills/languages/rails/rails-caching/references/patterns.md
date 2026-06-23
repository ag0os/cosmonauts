# Caching Patterns — Detailed Reference

Follow standard Rails conventions for the basic `cache` helper, `Rails.cache.fetch`, `fresh_when`, `stale?`, `expires_in`, ETags, and `Cache-Control` headers. This file focuses on the non-obvious decisions around cache stores, fragment caching, low-level caching, HTTP caching, and invalidation.

## Cache Store Selection

Choose the cache store that matches the app's actual stack profile and deployed infrastructure.

### Solid Cache (omakase / Rails 8 default)

Use Solid Cache when the app follows Rails defaults and does not already depend on Redis for other infrastructure.

```ruby
# config/environments/production.rb
config.cache_store = :solid_cache_store

# config/solid_cache.yml
default: &default
  database: cache
  store_options:
    max_age: 1.week
    max_size: 256.megabytes
    namespace: null

production:
  <<: *default

# config/database.yml
production:
  primary:
    <<: *default
  cache:
    <<: *default
    database: app_cache
    migrations_paths: db/cache_migrate
```

### Redis Cache Store (service-oriented / shared infra)

Use Redis when the app already runs Redis-backed jobs, real-time features, or centralized cache infrastructure.

```ruby
config.cache_store = :redis_cache_store, {
  url: ENV.fetch("REDIS_URL", "redis://localhost:6379/1"),
  expires_in: 1.hour,
  namespace: "app_cache",
  error_handler: ->(method:, returning:, exception:) {
    Rails.logger.error("Redis cache error: #{exception.message}")
    Sentry.capture_exception(exception) if defined?(Sentry)
  }
}
```

Keep cache failures non-fatal. If the store is unavailable, the app should degrade to a miss instead of crashing the request path.

## Fragment Caching

Fragment caching fits server-rendered HTML that is expensive to build but changes less often than the surrounding page.

### Russian doll caching with `touch: true`

The invalidation path has to exist in the data model. `touch: true` propagates `updated_at` changes upward so parent fragments get new cache keys.

```ruby
class Comment < ApplicationRecord
  belongs_to :post, touch: true
end

class Post < ApplicationRecord
  belongs_to :category, touch: true
  has_many :comments, dependent: :destroy
end
```

```erb
<% cache @category do %>
  <h2><%= @category.name %></h2>

  <% @category.posts.includes(:comments).each do |post| %>
    <% cache post do %>
      <h3><%= post.title %></h3>

      <% post.comments.each do |comment| %>
        <% cache comment do %>
          <p><%= comment.body %></p>
        <% end %>
      <% end %>
    <% end %>
  <% end %>
<% end %>
```

A changed comment invalidates its own fragment, then touches the post, then touches the category. Unchanged siblings still hit cache.

### Collection caching

Use collection caching for repeated partial rendering so Rails batches reads with `read_multi`.

```erb
<%= render partial: "products/product", collection: @products, cached: true %>
```

### Composite fragment keys

Vary the fragment when output changes by locale, permissions, or format.

```erb
<% cache [@product, I18n.locale, current_user&.admin?, "v2"] do %>
  <%= render "products/card", product: @product %>
<% end %>
```

Do not reuse the same fragment key for materially different output.

## Low-Level Caching

Low-level caching is for reusable expensive work outside view rendering.

### `Rails.cache.fetch`

```ruby
class DashboardStats
  def self.call(user)
    Rails.cache.fetch(["dashboard", user.cache_key_with_version], expires_in: 5.minutes) do
      calculate_for(user)
    end
  end
end
```

Key the entry from the real inputs. If the result changes by user, locale, feature flag, or version, include that in the key.

### `race_condition_ttl`

Use it for hot keys that expire under load.

```ruby
Rails.cache.fetch("reports/daily", expires_in: 10.minutes, race_condition_ttl: 30.seconds) do
  DailyReport.generate
end
```

The first request recomputes; other concurrent requests can serve the slightly stale value during the short TTL window instead of stampeding the backend.

### `fetch_multi`

Batch multiple low-level reads instead of doing one cache round-trip per item.

```ruby
class Product < ApplicationRecord
  def self.with_cached_stats(products)
    keys = products.map { |product| "product/#{product.id}/stats" }

    cached = Rails.cache.fetch_multi(*keys, expires_in: 1.hour) do |key|
      product_id = key.split("/")[1].to_i
      calculate_stats_for(product_id)
    end

    products.each do |product|
      product.cached_stats = cached["product/#{product.id}/stats"]
    end
  end
end
```

### Write-through invalidation

If recomputation is expensive and tied to a clear lifecycle event, update the cache on write.

```ruby
class Product < ApplicationRecord
  after_commit :write_stats_cache, on: %i[create update]
  after_commit :delete_stats_cache, on: :destroy

  def cached_stats
    Rails.cache.fetch(stats_cache_key, expires_in: 1.day) { calculate_stats }
  end

  private

  def write_stats_cache
    Rails.cache.write(stats_cache_key, calculate_stats, expires_in: 1.day)
  end

  def delete_stats_cache
    Rails.cache.delete(stats_cache_key)
  end

  def stats_cache_key
    "product/#{id}/stats"
  end
end
```

Prefer versioned keys first. Use manual writes and deletes only when lifecycle-based invalidation is clearer than deriving a stable versioned key.

## HTTP Caching

HTTP caching skips work before Rails renders the body.

### `fresh_when`

Use it when the controller can describe the whole response from a record or collection validator.

```ruby
class ArticlesController < ApplicationController
  def show
    @article = Article.find(params[:id])

    fresh_when(
      @article,
      public: true,
      last_modified: @article.updated_at,
      etag: [@article, I18n.locale, current_user&.admin?]
    )
  end
end
```

If the request is fresh, Rails returns `304 Not Modified` without rendering the template.

### `stale?`

Use `stale?` when the action should continue only for stale requests.

```ruby
class FeedsController < ApplicationController
  def show
    @feed = Feed.find(params[:id])

    return unless stale?(etag: [@feed, params[:page]], last_modified: @feed.updated_at, public: true)

    @entries = @feed.entries.recent.limit(50)
  end
end
```

### `expires_in` and cache-control

Use explicit directives when time-based freshness matters.

```ruby
class AssetsController < ApplicationController
  def manifest
    expires_in 15.minutes, public: true, stale_while_revalidate: 30.seconds
    render json: build_manifest
  end
end
```

Be deliberate about `public` versus private responses. Authenticated or user-specific output usually needs private caching or a user-varying validator.

## Invalidation Strategies

### Key-based expiration

Prefer keys that change automatically with the underlying data.

```ruby
cache @product
cache [@product, I18n.locale]
cache [@product, current_price_list.cache_key_with_version]
```

`cache_key_with_version` is safer than manual cache busting because the invalidation stays coupled to the data version.

### Namespace and version bumps

For broad invalidation, include an explicit version component.

```ruby
Rails.cache.fetch(["catalog", "v3", product.cache_key_with_version]) do
  serialize_product(product)
end
```

Bumping `v3` invalidates the whole family without pattern deletion.

### Pattern deletion is store-specific

```ruby
Rails.cache.delete_matched("product/#{id}/*")
```

Do not assume `delete_matched` works everywhere. It is practical with Redis-backed stores, but not every Rails cache store supports it efficiently or at all.

## Measuring Cache Effectiveness

### Notifications for hit and miss visibility

```ruby
ActiveSupport::Notifications.subscribe("cache_read.active_support") do |*args|
  event = ActiveSupport::Notifications::Event.new(*args)
  hit = event.payload[:hit]
  key = event.payload[:key]

  StatsD.increment("cache.#{hit ? 'hit' : 'miss'}")
  Rails.logger.debug("[Cache] #{hit ? 'HIT' : 'MISS'}: #{key}") if Rails.env.development?
end
```

### Server-Timing headers

```ruby
# config/application.rb
config.server_timing = true
```

Use browser DevTools or tracing to confirm the cache is reducing end-to-end response time, not just shifting work around.

## Common Failures to Correct

| Failure | Correction |
|---|---|
| Caching an expensive query result and stale HTML separately with different invalidation rules | Choose one ownership point, or derive both keys from the same version inputs |
| Shared fragment key for user-specific controls | Include user, role, or permission state in the key, or keep the fragment uncached |
| Manual deletes spread across callbacks, services, and jobs | Replace with key-based invalidation or a single lifecycle-managed write-through path |
| High-traffic key expires and all requests recompute | Add `race_condition_ttl`, longer TTL, or background warming |
| Cache-store outage breaks requests | Configure error handling and degrade to misses |

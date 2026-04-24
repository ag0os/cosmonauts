# Rails API Patterns — Detailed Reference

Match the repo's existing auth, serialization, and envelope conventions when they already exist. These patterns cover the default shape for establishing or cleaning up a Rails JSON API.

## Baseline API Controller Shape

Keep shared API behavior in one base controller so auth, rescue handling, and rendering stay consistent across versions and resources.

```ruby
class Api::BaseController < ActionController::API
  before_action :authenticate!

  rescue_from ActiveRecord::RecordNotFound do
    render_error("Record not found", status: :not_found)
  end

  rescue_from ActionController::ParameterMissing do |error|
    render_error(error.message, status: :bad_request)
  end

  private

  def render_collection(data:, meta: {})
    render json: { data: data, meta: meta, errors: nil }
  end

  def render_resource(data:, status: :ok, meta: {})
    render json: { data: data, meta: meta, errors: nil }, status: status
  end

  def render_error(message, details: nil, status:)
    render json: {
      data: nil,
      error: message,
      errors: details
    }, status: status
  end
end
```

Keep token/session mechanics in `/skill:rails-auth`. This reference covers where API auth hooks live, not how to design the auth system itself.

## REST Routes and URL Versioning

Use resourceful routing and version in the URL namespace. Keep old controllers and serializers intact when a response contract changes.

```ruby
namespace :api do
  namespace :v1 do
    resources :products
    resource :session, only: :create
  end

  namespace :v2 do
    resources :products
  end
end
```

Guidelines:
- prefer `resources` and dedicated nested resource controllers over RPC-style endpoints
- treat `v1`, `v2`, and later versions as stable contracts once clients ship against them
- version controllers and serializers together; do not fork models just to support API versions
- avoid header-only versioning unless the repo already standardizes on it

## Serializer and Presenter Guidance

Never expose ActiveRecord objects directly. Use an explicit serialization layer so field selection, associations, and version-specific output stay intentional.

- Match the installed serializer stack from `/skill:rails-conventions`.
- For new work, prefer maintained options such as Blueprinter, Alba, `jsonapi-serializer`, or Jbuilder over introducing ActiveModelSerializers.
- Keep query loading in the controller, relation, or query object; serializers should format data, not decide which rows to fetch.
- Use lightweight collection views for `index` and richer detail views for `show`.

```ruby
class ProductBlueprint < Blueprinter::Base
  identifier :id
  fields :name, :description, :created_at

  field :price do |product|
    format("%.2f", product.price)
  end

  view :extended do
    association :category, blueprint: CategoryBlueprint
    association :reviews, blueprint: ReviewBlueprint
  end
end

products = Product.includes(:category).order(created_at: :desc)
render_collection(
  data: ProductBlueprint.render_as_hash(products),
  meta: { total_count: products.size }
)
```

If the repo uses JSON:API or another established serializer contract, follow that exact contract instead of mixing formats across endpoints.

## Response Envelope and Error Shape

Keep one machine-readable top-level structure across the API. If the repo has no established contract yet, standardize on:

```json
{
  "data": { "id": 1, "name": "Widget" },
  "meta": { "request_id": "abc123" },
  "errors": null
}
```

Validation failure example:

```json
{
  "data": null,
  "error": "Validation failed",
  "errors": {
    "name": ["can't be blank"],
    "price": ["must be greater than 0"]
  }
}
```

Not-found or auth failure example:

```json
{
  "data": null,
  "error": "Record not found",
  "errors": null
}
```

Rules:
- keep the same top-level keys for all endpoints in a namespace
- use `error` for a single human-readable message on 401, 403, 404, 409, and 429 responses
- use `errors` for field or domain error details, especially 422 validation responses
- never return bare arrays or objects for one endpoint and envelopes for another in the same API

## Pagination Defaults

Paginate every collection and search endpoint. Keep defaults small, return metadata, and cap `per_page` so one request cannot exhaust the app.

```ruby
module Api::Paginatable
  extend ActiveSupport::Concern

  DEFAULTS = { page: 1, per_page: 20, max_per_page: 100 }.freeze

  private

  def page_params
    page = [params.fetch(:page, DEFAULTS[:page]).to_i, 1].max
    requested_per_page = params.fetch(:per_page, DEFAULTS[:per_page]).to_i
    per_page = [requested_per_page, DEFAULTS[:max_per_page]].min

    { page: page, per_page: per_page }
  end

  def pagination_meta(collection)
    {
      current_page: collection.current_page,
      next_page: collection.next_page,
      prev_page: collection.prev_page,
      total_pages: collection.total_pages,
      total_count: collection.total_count,
      per_page: collection.limit_value
    }
  end
end
```

Use the repo's existing pagination gem or helper. The important part is the contract:
- default page size such as 20
- hard cap such as 100
- explicit `meta` fields for the next request
- no unpaginated `index` on large resources

## Rate Limiting and CORS

Handle throttling and cross-origin access centrally instead of scattering logic through controllers.

- Rate limit by token for authenticated requests and by IP for anonymous requests.
- Return `Retry-After` and limit headers when throttling.
- Keep allowed origins environment-driven; never ship `origins "*"` for credentialed production APIs.
- Expose the headers clients actually need, such as `Retry-After` and rate-limit metadata.

```ruby
class Rack::Attack
  throttle("api/token", limit: 100, period: 1.minute) do |req|
    next unless req.path.start_with?("/api/")

    req.env["HTTP_AUTHORIZATION"]&.delete_prefix("Bearer ")
  end

  throttle("api/ip", limit: 20, period: 1.minute) do |req|
    req.ip if req.path.start_with?("/api/") && req.env["HTTP_AUTHORIZATION"].blank?
  end
end
```

```ruby
Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    origins ENV.fetch("ALLOWED_ORIGINS", "http://localhost:3000").split(",")

    resource "/api/*",
      headers: :any,
      methods: [:get, :post, :put, :patch, :delete, :options],
      expose: ["Retry-After", "X-RateLimit-Limit", "X-RateLimit-Remaining"],
      max_age: 600
  end
end
```

## Status Code Conventions

| Status | Use when |
|---|---|
| `200 OK` | Standard successful read or update with a response body |
| `201 Created` | New resource created and returned |
| `204 No Content` | Successful delete or update that intentionally returns no body |
| `400 Bad Request` | Request shape or required params are malformed |
| `401 Unauthorized` | Token or credentials are missing or invalid |
| `403 Forbidden` | Credentials are valid but the client lacks permission |
| `404 Not Found` | Resource does not exist or is outside the visible scope |
| `409 Conflict` | Optimistic-lock or state-conflict failure |
| `422 Unprocessable Entity` | Valid request shape, but validations or domain rules failed |
| `429 Too Many Requests` | Rate limiter rejected the request |

## API Review Checklist

Before approving an API change, verify:
1. routes stay RESTful and versioned
2. responses use one serializer strategy and one JSON contract
3. collection endpoints paginate with a cap
4. auth hooks and `rescue_from` behavior live in shared API infrastructure
5. CORS and throttling rules are configured once and documented for clients

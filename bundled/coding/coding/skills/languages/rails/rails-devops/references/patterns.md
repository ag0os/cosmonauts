# Rails DevOps Patterns

Use this reference after checking `/skill:rails-conventions` and `/skill:rails-stack-profiles`. It focuses on Rails-specific operational config; adapt platform choices to the repo instead of assuming a single hosting stack.

## Production Dockerfile (Alpine, Non-Root)

Key details: `SECRET_KEY_BASE=precompile_placeholder` lets asset compilation run without a real key, the runtime image uses a dedicated user, and the health check exercises the Rails process directly.

```dockerfile
# syntax=docker/dockerfile:1
FROM ruby:3.2-alpine AS base
RUN apk add --no-cache postgresql-dev tzdata gcompat
WORKDIR /app
ENV RAILS_ENV=production \
    BUNDLE_DEPLOYMENT=true \
    BUNDLE_WITHOUT="development:test"

FROM base AS build
RUN apk add --no-cache build-base git
COPY Gemfile Gemfile.lock ./
RUN bundle install --jobs 4 --retry 3
COPY package.json* yarn.lock* ./
RUN if [ -f package.json ]; then apk add --no-cache nodejs yarn && yarn install --production --frozen-lockfile; fi
COPY . .
RUN SECRET_KEY_BASE=precompile_placeholder bundle exec rails assets:precompile

FROM base AS runtime
COPY --from=build /usr/local/bundle /usr/local/bundle
COPY --from=build /app /app
RUN addgroup -S rails && adduser -S rails -G rails && \
    chown -R rails:rails /app
USER rails
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:3000/up || exit 1
CMD ["bundle", "exec", "puma", "-C", "config/puma.rb"]
```

## GitHub Actions CI (Single Entry Point Preferred)

Keep the workflow small and delegate repo-specific lint, test, and security commands to `bin/ci` when the repo provides it.

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: app_test
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready -U postgres -d app_test"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    env:
      RAILS_ENV: test
      DATABASE_URL: postgres://postgres:postgres@127.0.0.1:5432/app_test
    steps:
      - uses: actions/checkout@v4
      - uses: ruby/setup-ruby@v1
        with:
          bundler-cache: true
      - uses: actions/setup-node@v4
        if: ${{ hashFiles('package.json') != '' }}
        with:
          node-version: 20
          cache: yarn
      - name: Install JavaScript dependencies
        if: ${{ hashFiles('package.json') != '' }}
        run: yarn install --frozen-lockfile
      - name: Prepare database
        run: bin/rails db:prepare
      - name: Run CI entry point
        run: bin/ci
```

If the repo does not provide `bin/ci`, replace that step with the repo's canonical lint, security, and test commands instead of inventing a second workflow-specific sequence.

## Health Check Endpoint (Detailed)

Keep `/up` cheap for orchestration. Add `/health` only when operators need dependency-level checks.

```ruby
# config/routes.rb
get "/up", to: proc { [200, {}, ["OK"]] }
get "/health", to: "health#show"

# app/controllers/health_controller.rb
class HealthController < ActionController::API
  def show
    checks = {
      database: database_connected?,
      redis: redis_connected?,
      migrations: migrations_current?
    }

    status = checks.values.all? ? :ok : :service_unavailable
    render json: checks, status: status
  end

  private

  def database_connected?
    ActiveRecord::Base.connection.execute("SELECT 1")
    true
  rescue StandardError
    false
  end

  def redis_connected?
    return true unless ENV["REDIS_URL"]

    Redis.current.ping == "PONG"
  rescue StandardError
    false
  end

  def migrations_current?
    !ActiveRecord::Base.connection.migration_context.needs_migration?
  end
end
```

## Structured JSON Logging

```ruby
# config/environments/production.rb
config.logger = ActiveSupport::TaggedLogging.new(
  Logger.new(STDOUT).tap do |logger|
    logger.formatter = proc do |severity, time, _progname, msg|
      {
        severity: severity,
        time: time.iso8601(3),
        msg: msg,
        host: Socket.gethostname,
        pid: Process.pid,
        tid: Thread.current.object_id
      }.to_json + "\n"
    end
  end
)
config.log_tags = [:request_id]
config.log_level = ENV.fetch("LOG_LEVEL", "info").to_sym
```

### Lograge (Compact Request Logs)

```ruby
# config/initializers/lograge.rb
Rails.application.configure do
  config.lograge.enabled = true
  config.lograge.formatter = Lograge::Formatters::Json.new
  config.lograge.custom_payload do |controller|
    {
      user_id: controller.current_user&.id,
      request_id: controller.request.request_id
    }
  end
end
```

## Security Configuration

### Rack::Attack Rate Limiting

Tune limits to the app's real traffic, but keep login and API throttles explicit.

```ruby
# config/initializers/rack_attack.rb
class Rack::Attack
  throttle("req/ip", limit: 300, period: 5.minutes) do |req|
    req.ip unless req.path.start_with?("/assets")
  end

  throttle("logins/ip", limit: 5, period: 20.seconds) do |req|
    req.ip if req.path == "/login" && req.post?
  end

  throttle("logins/email", limit: 5, period: 5.minutes) do |req|
    if req.path == "/login" && req.post?
      req.params.dig("user", "email")&.downcase&.strip
    end
  end

  throttle("api/token", limit: 100, period: 1.minute) do |req|
    req.env["HTTP_AUTHORIZATION"]&.split(" ")&.last if req.path.start_with?("/api/")
  end

  blocklist("block bad IPs") do |req|
    Rack::Attack::Allow2Ban.filter(req.ip, maxretry: 10, findtime: 1.minute, bantime: 1.hour) do
      req.path == "/login" && req.post?
    end
  end

  self.throttled_responder = lambda do |matched, _env|
    headers = {
      "Content-Type" => "application/json",
      "Retry-After" => (Time.now.utc + matched[:period]).httpdate
    }
    [429, headers, [{ error: "Rate limit exceeded. Retry later." }.to_json]]
  end
end
```

### SSL With Health Check Exclusion

```ruby
# config/environments/production.rb
config.force_ssl = true
config.ssl_options = {
  hsts: { subdomains: true, preload: true, expires: 1.year },
  redirect: { exclude: ->(request) { request.path.start_with?("/health", "/up") } }
}
```

## Production Environment Variables

```bash
RAILS_ENV=production
RAILS_LOG_TO_STDOUT=true
RAILS_SERVE_STATIC_FILES=true
SECRET_KEY_BASE=<generated>
DATABASE_URL=postgres://user:pass@host:5432/dbname
REDIS_URL=redis://host:6379/0
RAILS_MAX_THREADS=5
WEB_CONCURRENCY=2
```

## Database Production Config

Match pool size to thread count and set timeouts so bad queries fail fast.

```yaml
production:
  adapter: postgresql
  url: <%= ENV["DATABASE_URL"] %>
  pool: <%= ENV.fetch("RAILS_MAX_THREADS", 5) %>
  timeout: 5000
  reaping_frequency: 10
  connect_timeout: 2
  checkout_timeout: 5
  variables:
    statement_timeout: "30s"
    lock_timeout: "10s"
  prepared_statements: true
```

## Zero-Downtime Deployment

Use phased or rolling restarts, and keep migrations compatible with both old and new application versions during rollout.

```ruby
# config/puma.rb
if ENV["RAILS_ENV"] == "production"
  workers ENV.fetch("WEB_CONCURRENCY", 2).to_i
  preload_app!

  before_fork do
    ActiveRecord::Base.connection_pool.disconnect! if defined?(ActiveRecord)
  end

  on_worker_boot do
    ActiveRecord::Base.establish_connection if defined?(ActiveRecord)
  end
end
```

Deployment sequence:
1. build and publish the release artifact once
2. run `db:migrate` in a controlled step
3. start or restart the new web and worker processes
4. use `/up` or `/health` checks before shifting traffic fully
5. prefer `pumactl phased-restart` or platform-native rolling restarts over stop-the-world restarts

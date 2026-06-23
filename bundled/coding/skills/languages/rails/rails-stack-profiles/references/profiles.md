# Stack Profiles — Detailed Reference

Load this reference after the main `rails-stack-profiles` skill when you need the full definitions, examples, and hybrid handling details.

## Profile 1: Omakase

The "Rails Way". Trust Rails defaults, avoid unnecessary gems, and keep logic close to models.

### Core Beliefs

- **Models are smart.** Business logic belongs in models.
- **Concerns are acceptable.** They decompose models without introducing new architectural layers.
- **Callbacks are acceptable** for simple, predictable side effects.
- **Fixtures over factories.** Fixtures are fast, declarative, and encourage stable test data.
- **Minitest over RSpec.** Less DSL magic, closer to plain Ruby.
- **Use what Rails gives you.** Solid Queue, Solid Cache, Solid Cable, Active Storage, Action Text, and Action Mailbox before reaching for gems.

### Characteristic Patterns

**Business logic in models with concerns:**

```ruby
# app/models/order.rb
class Order < ApplicationRecord
  include Purchasable
  include Trackable

  belongs_to :user
  has_many :line_items, dependent: :destroy

  validates :status, inclusion: { in: %w[pending confirmed shipped delivered] }

  scope :recent, -> { where("created_at > ?", 30.days.ago) }

  def total
    line_items.sum(&:subtotal) + tax + shipping
  end

  def confirm!
    update!(status: "confirmed", confirmed_at: Time.current)
    OrderMailer.confirmation(self).deliver_later
  end
end
```

```ruby
# app/models/concerns/purchasable.rb
module Purchasable
  extend ActiveSupport::Concern

  included do
    has_many :payments, as: :purchasable
    scope :paid, -> { joins(:payments).where(payments: { status: "completed" }) }
  end

  def paid?
    payments.completed.exists?
  end

  def outstanding_balance
    total - payments.completed.sum(:amount)
  end
end
```

**Controller with inline orchestration (acceptable in omakase):**

```ruby
class OrdersController < ApplicationController
  before_action :authenticate_user!

  def create
    @order = current_user.orders.build(order_params)

    if @order.save
      @order.confirm!
      redirect_to @order, notice: "Order placed!"
    else
      render :new, status: :unprocessable_entity
    end
  end
end
```

**Testing with Minitest + fixtures:**

```ruby
# test/models/order_test.rb
class OrderTest < ActiveSupport::TestCase
  test "total includes tax and shipping" do
    order = orders(:with_items)
    assert_equal 115.0, order.total
  end

  test "confirm! updates status and sends email" do
    order = orders(:pending)
    assert_emails 1 do
      order.confirm!
    end
    assert_equal "confirmed", order.status
  end
end
```

**Auth with `has_secure_password`:**

```ruby
class User < ApplicationRecord
  has_secure_password
  normalizes :email, with: -> { _1.strip.downcase }
end

class SessionsController < ApplicationController
  def create
    user = User.authenticate_by(email: params[:email], password: params[:password])
    if user
      start_new_session_for(user)
      redirect_to root_path
    else
      redirect_to new_session_path, alert: "Invalid email or password"
    end
  end
end
```

### Gems Typical of Omakase

```ruby
# Gemfile — minimal, mostly Rails defaults
gem "rails", "~> 8.0"
gem "propshaft"
gem "puma"
gem "solid_queue"
gem "solid_cache"
gem "solid_cable"
gem "jbuilder"
gem "thruster"
gem "kamal"
```

## Profile 2: Service-Oriented

Favor explicit layers and extracted business logic. Common in larger teams and apps with complex domains.

### Core Beliefs

- **Thin everything.** Controllers route, models validate, services orchestrate.
- **Service objects for workflows.** Any multi-step process gets its own class.
- **RSpec for expressiveness.** `describe`/`context`/`it` reads like documentation.
- **FactoryBot for flexibility.** Factories compose better than fixtures for edge cases.
- **Pundit for authorization.** Policy objects are testable and explicit.
- **Devise for auth.** Battle-tested and familiar to many Rails teams.

### Characteristic Patterns

**Service object with a result type:**

```ruby
# app/services/orders/create.rb
module Orders
  class Create
    def initialize(user:, params:)
      @user = user
      @params = params
    end

    def call
      order = @user.orders.build(@params)

      ActiveRecord::Base.transaction do
        order.save!
        Payments::Charge.new(order: order).call
        OrderMailer.confirmation(order).deliver_later
      end

      Result.new(success: true, order: order)
    rescue ActiveRecord::RecordInvalid => e
      Result.new(success: false, error: e.message, order: e.record)
    rescue Payments::ChargeError => e
      Result.new(success: false, error: e.message)
    end
  end
end
```

**Thin controller delegating to the service:**

```ruby
class OrdersController < ApplicationController
  def create
    result = Orders::Create.new(user: current_user, params: order_params).call

    if result.success?
      redirect_to result.order, notice: "Order placed!"
    else
      @order = result.order || Order.new(order_params)
      flash.now[:alert] = result.error
      render :new, status: :unprocessable_entity
    end
  end
end
```

**Testing with RSpec + FactoryBot:**

```ruby
# spec/services/orders/create_spec.rb
RSpec.describe Orders::Create do
  describe "#call" do
    let(:user) { create(:user) }
    let(:params) { attributes_for(:order).merge(line_items_attributes: [attributes_for(:line_item)]) }

    context "with valid params" do
      it "creates an order and charges payment" do
        result = described_class.new(user: user, params: params).call

        expect(result).to be_success
        expect(result.order).to be_persisted
      end
    end

    context "with payment failure" do
      before { allow(Payments::Charge).to receive(:new).and_raise(Payments::ChargeError) }

      it "returns a failure result" do
        result = described_class.new(user: user, params: params).call
        expect(result).not_to be_success
      end
    end
  end
end
```

### Gems Typical of Service-Oriented

```ruby
# Gemfile — explicit tools for each concern
gem "rails", "~> 8.0"
gem "pg"
gem "puma"
gem "sidekiq"
gem "redis"
gem "devise"
gem "pundit"
gem "alba"
gem "pagy"

group :test do
  gem "rspec-rails"
  gem "factory_bot_rails"
  gem "shoulda-matchers"
  gem "vcr"
  gem "webmock"
end
```

## Profile 3: API-First

Use Rails as a JSON backend. No views, no Hotwire; the frontend is a separate app or client.

### Core Beliefs

- **JSON in, JSON out.** No HTML rendering or asset pipeline in the main delivery path.
- **Versioned from day one.** Breaking changes are expensive once clients depend on the API.
- **Token-based auth.** JWT or API keys instead of cookie-first sessions.
- **Explicit serialization.** Never expose ActiveRecord directly.
- **Contract-driven.** API docs and response schemas are first-class artifacts.

### Characteristic Patterns

**API base controller:**

```ruby
# app/controllers/api/v1/base_controller.rb
module Api
  module V1
    class BaseController < ActionController::API
      include ActionController::HttpAuthentication::Token::ControllerMethods

      before_action :authenticate_token!

      rescue_from ActiveRecord::RecordNotFound, with: :not_found
      rescue_from ActiveRecord::RecordInvalid, with: :unprocessable

      private

      def authenticate_token!
        authenticate_or_request_with_http_token do |token, _options|
          @current_user = User.find_by(api_token: token)
        end
      end

      def not_found
        render json: { error: "Not found" }, status: :not_found
      end

      def unprocessable(exception)
        render json: { errors: exception.record.errors.full_messages }, status: :unprocessable_entity
      end
    end
  end
end
```

**Response envelope pattern:**

```ruby
# app/controllers/api/v1/orders_controller.rb
module Api
  module V1
    class OrdersController < BaseController
      def index
        orders = current_user.orders.order(created_at: :desc)
        orders = pagy(orders)

        render json: {
          data: OrderSerializer.new(orders).serialize,
          meta: pagy_metadata(orders)
        }
      end

      def create
        result = Orders::Create.new(user: current_user, params: order_params).call

        if result.success?
          render json: { data: OrderSerializer.new(result.order).serialize }, status: :created
        else
          render json: { errors: [result.error] }, status: :unprocessable_entity
        end
      end
    end
  end
end
```

**Versioned routes:**

```ruby
# config/routes.rb
Rails.application.routes.draw do
  namespace :api do
    namespace :v1 do
      resources :orders, only: [:index, :show, :create]
      resources :users, only: [:show, :update]
    end
  end
end
```

### Gems Typical of API-First

```ruby
# Gemfile — no frontend gems
gem "rails", "~> 8.0"
gem "pg"
gem "puma"
gem "sidekiq"
gem "redis"
gem "jwt"
gem "alba"
gem "rack-cors"
gem "rack-attack"
gem "pagy"
gem "oj"

group :test do
  gem "rspec-rails"
  gem "factory_bot_rails"
  gem "json_matchers"
end
```

## Hybrid Projects

### Omakase app with an API namespace

A full-stack Rails app may still expose a mobile or third-party API.

```text
app/
  controllers/
    application_controller.rb
    orders_controller.rb
    api/
      v1/
        base_controller.rb
        orders_controller.rb
```

**Detection:** `app/views/` with ERB files and `app/controllers/api/` both exist.

**Recommendation:** Apply omakase patterns to the full-stack portion and api-first patterns to the API namespace. Shared models and services bridge both.

### Service-Oriented app with omakase testing

Some teams adopt service objects but keep Minitest + fixtures.

**Detection:** `app/services/` exists but `spec/` does not; `test/` with fixtures is present.

**Recommendation:** Follow service-oriented patterns for code organization and omakase patterns for testing.

## Profile Detection Script

Check these in order:

```text
Step 1: Check for API-first signals
  - ActionController::API as the base class in non-namespaced controllers?
  - No app/views/ directory (or only mailer views)?
  → If yes: api-first

Step 2: Check for service-oriented signals
  - app/services/ with multiple files?
  - RSpec + FactoryBot in Gemfile?
  - Devise + Pundit?
  → If 2+ match: service-oriented

Step 3: Default to omakase
  - Minitest (test/ directory)?
  - Fixtures present?
  - Solid Queue/Cache/Cable?
  - No app/services/ or very few files there?
  → Default: omakase

Step 4: Check for hybrid signals
  - api/ namespace in controllers + views exist?
  - Mixed testing setup?
  → Note hybrid aspects
```

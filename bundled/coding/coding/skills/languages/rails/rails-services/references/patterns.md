# Rails Service Patterns — Detailed Reference

## Baseline Service Template

Start with the repo's established base class and entry point. If `/skill:rails-conventions` finds `ApplicationService`, `.call`, or a specific result wrapper, match that shape instead of introducing a new service framework.

```ruby
class CreateOrder
  def initialize(customer:, params:, payment_gateway:, result_class: ServiceResult)
    @customer = customer
    @params = params
    @payment_gateway = payment_gateway
    @result_class = result_class
  end

  def call
    Order.transaction do
      order = customer.orders.create!(params)
      charge = payment_gateway.charge!(order.total_cents)

      result_class.success(order: order, charge: charge)
    end
  rescue PaymentGateway::Declined => error
    result_class.failure(error.message)
  end

  private

  attr_reader :customer, :params, :payment_gateway, :result_class
end
```

This keeps the transaction, external call, and return contract together without burying request/response logic in the service.

## Result Objects in Rails

Keep the result interface stable for callers:
- `success?` / `failure?`
- payload access (`value`, `user`, `order`, etc.)
- one error field or error collection for expected failures
- optional helpers such as `on_success` / `on_failure` if the repo already uses them

For the underlying Ruby construct choice (`Struct`, `Data.define`, or a dedicated class), load `/skill:ruby-object-design`. This reference covers how Rails callers should use the result, not how to choose the Ruby container.

```ruby
result = AuthenticateUser.new(email:, password:).call

if result.success?
  session[:user_id] = result.user.id
  redirect_to dashboard_path
else
  flash.now[:alert] = result.error
  render :new, status: :unprocessable_entity
end
```

### Chainable Result APIs

If the codebase already uses a richer `ServiceResult`, chainable callbacks can keep controller code flat:

```ruby
ProcessPayment.new(order: current_order).call
  .on_success { |payment| redirect_to payment_path(payment), notice: "Paid" }
  .on_failure { |message| redirect_to new_payment_path, alert: message }
```

Do not introduce a monad-style wrapper just because it looks elegant. Match the repo. If you need to refactor toward or away from a richer result abstraction, use `/skill:refactoring` for the migration plan.

## Form Object Pattern

Use `ActiveModel::Model` when one submission spans multiple models, validations, or side effects and the controller would otherwise become the coordinator.

```ruby
class RegistrationForm
  include ActiveModel::Model
  include ActiveModel::Validations

  attr_accessor :email, :password, :password_confirmation,
                :company_name, :company_size

  validates :email, presence: true, format: { with: URI::MailTo::EMAIL_REGEXP }
  validates :password, presence: true, length: { minimum: 8 }, confirmation: true
  validates :company_name, presence: true

  def save
    return false unless valid?

    ActiveRecord::Base.transaction do
      user = User.create!(email: email, password: password)
      Company.create!(name: company_name, size: company_size, owner: user)
    end

    true
  rescue ActiveRecord::RecordInvalid => error
    errors.add(:base, error.message)
    false
  end
end
```

Form objects are a good fit when:
- validation belongs to the submitted shape, not one model alone
- persistence spans multiple records
- the controller should stay at request/response level

If the object grows orchestration steps, notifications, or gateway calls, split the persistence-facing form from a coordinating service.

## Composable Query Objects

Start with scopes for simple filtering. Extract a query object when the logic is reused across screens, needs joins/subqueries, or requires staged composition that would make scopes awkward.

```ruby
class PolicySearchQuery
  def initialize(relation = Policy.all)
    @relation = relation
  end

  def by_status(status)
    @relation = @relation.where(status: status)
    self
  end

  def expiring_within(days)
    @relation = @relation.where("expiry_date < ?", days.from_now)
    self
  end

  def for_agent(agent)
    @relation = @relation.where(agent: agent)
    self
  end

  def results
    @relation
  end
end
```

Query objects should:
- accept a base relation so callers can compose with authorization or tenant scopes
- expose intention-revealing filters
- return a relation when possible so pagination and eager loading still work upstream

## Directory Organization

Keep `app/services/` flat until grouping becomes useful. Group by domain after the service count or namespace pressure makes scanning harder.

```text
app/services/
  create_order.rb
  process_payment.rb
  send_welcome_email.rb
```

```text
app/services/
  orders/
    create_order.rb
    cancel_order.rb
  payments/
    process_payment.rb
    refund_payment.rb
```

Do not introduce namespaces prematurely. Prefer the smallest structure that keeps related workflows discoverable.

## Error Handling Strategy

| Error Type | Handling | Example |
|---|---|---|
| Expected business failure | Return `result_class.failure(...)` or repo equivalent | invalid credentials, declined card, expired subscription |
| Validation failure in a form object | Add errors and return `false` or failure result | missing company name, password mismatch |
| Unexpected system failure | Raise and let the caller or global handler rescue | network timeout, database outage |
| Caller-actionable external failure | Normalize into the result contract | gateway rejected payment, upstream returned 422 |

Rule of thumb: if the caller needs to branch, return a result. If the caller cannot recover locally, let the exception bubble to the appropriate boundary.

## Choosing Between Services, Forms, and Queries

| Need | Best Fit |
|---|---|
| Orchestrate a business workflow across models or systems | Service object |
| Validate and persist one submitted form shape | Form object |
| Reuse complex filtering or relation composition | Query object |
| Decide authorization rules | Policy object |

When a single object starts doing two of these jobs, split it. A form should not also be the authorization policy and the external billing coordinator.

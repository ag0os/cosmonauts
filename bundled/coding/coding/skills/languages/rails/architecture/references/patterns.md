# Rails Architecture Patterns

Use this reference after classifying the repo with `/skill:rails-stack-profiles` and capturing local conventions with `/skill:rails-conventions`.

## STI vs Polymorphic Associations

Use these thresholds as a starting point:

| Factor | STI | Polymorphic |
|---|---|---|
| Shared columns > 70% | Yes | No |
| Shared columns < 30% | No | Yes |
| Need to query all types together | Yes | Possible, but usually slower |
| Types have different associations | No | Yes |
| Type-specific columns | Few nullable columns | Many distinct columns |

Choose STI when the records are mostly the same thing with small behavioral variation. Choose polymorphic associations when the records differ structurally and only share a relationship endpoint.

## Model Method vs Concern vs Service Object

The owning object depends on stack profile and on whether the rule is record-local or workflow-oriented.

| Scenario | Omakase | Service-oriented / API-first |
|---|---|---|
| Calculates from one record's own attributes | Model method | Model method |
| Shared role across 2+ models | Concern | Concern only when the role is truly shared |
| Coordinates multiple models or an external API | Small transactional model method if the repo already does this | Service, command, or form object |
| Request-specific coercion or validation | Strong params plus model validation | Form or command object |
| Simple side effect after commit | Callback is acceptable if it stays predictable | Prefer explicit service or job |

**Omakase example - keep record-local behavior near the model:**

```ruby
# app/models/concerns/purchasable.rb
module Purchasable
  extend ActiveSupport::Concern

  included do
    has_many :payments, as: :purchasable
    after_create_commit :send_confirmation
  end

  def charge!
    PaymentGateway.charge(total, user.payment_method)
    update!(paid_at: Time.current)
  end
end
```

**Service-oriented or API-first example - move orchestration into a service:**

```ruby
# app/services/orders/create_order.rb
class Orders::CreateOrder
  def self.call(params:, user:)
    new(params:, user:).call
  end

  def initialize(params:, user:)
    @params = params
    @user = user
  end

  def call
    order = user.orders.build(params)

    Order.transaction do
      order.save!
      PaymentGateway.charge(order.total, user.payment_method)
      OrderMailer.confirmation(order).deliver_later
    end

    order
  end

  private

  attr_reader :params, :user
end
```

API-first stacks usually follow the same orchestration rule as service-oriented stacks, but keep transport concerns in serializers, policies, and API controllers rather than views.

## God Model Fix

A model is behaving like a god object when unrelated edits, callbacks, query rules, and workflow code all accumulate in one file.

The architectural decision is whether the extracted behavior stays model-local or becomes orchestration:
- **Omakase:** extract cohesive concerns or model collaborators for capabilities that still belong to the record.
- **Service-oriented / API-first:** move workflow, coordination, and integration logic into service, command, query, or form objects.

Use `/skill:rails-models` for the model-specific extraction details. Use this skill to decide whether the fix should stay in the model layer or leave it.

## Fat Controller Fix

A controller is too fat when actions contain branching business rules, persistence decisions, or external API coordination.

**Omakase landing zone:** enrich the model or extract a small concern when the rule is still fundamentally about the record.

```ruby
def create
  @order = current_user.orders.build(order_params)

  if @order.place!
    redirect_to @order
  else
    render :new, status: :unprocessable_entity
  end
end
```

**Service-oriented or API-first landing zone:** move request orchestration to a service, command, or form object and let the controller handle transport concerns only.

```ruby
def create
  result = Orders::CreateOrder.call(params: order_params, user: current_user)

  if result.success?
    redirect_to result.order
  else
    @order = result.order
    render :new, status: :unprocessable_entity
  end
end
```

## Callback Hell Fix

Long callback chains usually mean workflow logic is hiding in lifecycle hooks.

Keep callbacks for normalization and small integrity rules. Move multi-step workflows, retries, notifications, billing, or external coordination into an explicit service or job.

```ruby
class Order < ApplicationRecord
  before_validation :normalize_status
  after_create_commit :send_confirmation_email

  def place!
    transaction do
      save!
      charge_payment
      reserve_inventory
    end
  end
end
```

When callbacks start triggering more callbacks across models, treat it as an ownership problem and move the workflow to one explicit entry point.

## Shotgun Surgery Across Rails Layers

Treat a change as Rails-layer shotgun surgery when one concept change touches 4+ of these layers:
- migration
- model
- controller
- view or serializer
- tests
- form object or decorator

This smell is strongest when each layer recomputes the same rule instead of reading it from one owner.

Common causes:
- business logic split between controller and model
- display logic duplicated across helpers, views, and serializers
- authorization duplicated in multiple layers

Refactoring direction:
1. Identify the business rule that keeps being re-expressed.
2. Pick one owner for that rule instead of recomputing it in each layer.
3. Make other layers ask that owner for the result.

Profile-aware landing zones:
- **Omakase:** model method or concern
- **Service-oriented:** service object or form object
- **API-first:** form object, command object, or policy object

If the smell is mostly inside one large model rather than spread across layers, route the follow-up work to `/skill:rails-models`.

## Monolith vs Engine vs Microservice

Start with a monolith unless there is a proven reason not to.

| Factor | Monolith | Engine | Microservice |
|---|---|---|---|
| Team size | 1-10 | 5-20 | 10+ |
| Deploy independently | No | No | Yes |
| Code isolation | Directories and namespaces | Gem boundary inside the app | Network boundary |
| Complexity | Low | Medium | High |
| When to choose | Default starting point | Large monolith needs an internal boundary | Proven scaling or deployment need |

Only extract an engine when a domain needs a real internal boundary inside the same app. Only extract a microservice when the need for independent deployment or scaling is already demonstrated. For the general complexity rationale, defer to `/skill:engineering-principles`.

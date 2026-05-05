# Class vs Module

Ruby has built-in features that make many Gang of Four patterns unnecessary. When a type is named after a pattern, first ask whether a module, lambda, hash lookup, or direct instantiation would be clearer.

## Factory pattern -> hash lookup or direct instantiation

```ruby
# Unnecessary factory class
class NotificationFactory
  def self.create(type, message)
    case type
    when :email then EmailNotification.new(message)
    when :sms then SmsNotification.new(message)
    when :push then PushNotification.new(message)
    end
  end
end

# Ruby way: hash lookup for dynamic dispatch
NOTIFICATION_TYPES = {
  email: EmailNotification,
  sms: SmsNotification,
  push: PushNotification,
}.freeze

def create_notification(type, message)
  NOTIFICATION_TYPES.fetch(type).new(message)
end

# Or just: EmailNotification.new(message)
```

## Decorator pattern -> module prepend

```ruby
# Java-style decorator class
class LoggingDecorator
  def initialize(service) = @service = service

  def call(args)
    warn("Calling with #{args.inspect}")
    @service.call(args)
  end
end

# Ruby way: prepend a module
module Logging
  def call(args)
    warn("Calling with #{args.inspect}")
    super.tap { |result| warn("Returned #{result.inspect}") }
  end
end

class MyService
  prepend Logging
end
```

## Strategy pattern -> procs or lambdas

```ruby
# Verbose strategy hierarchy
class PricingStrategy
  def calculate(order) = raise NotImplementedError
end

class PremiumPricing < PricingStrategy
  def calculate(order) = order.subtotal * 0.9
end

# Ruby way: lambdas
PRICING = {
  regular: ->(order) { order.subtotal },
  premium: ->(order) { order.subtotal * 0.9 },
}.freeze

def calculate_price(order, tier) = PRICING.fetch(tier).call(order)
```

## Abstract base class -> module mixin

```ruby
# Bad: inheritance for method injection
class BaseProcessor
  def process = (validate; execute; notify)
  def execute = raise NotImplementedError
end

# Good: composition with modules
module Processable
  def process = (validate; execute; notify)

  private

  def validate = nil
  def notify = nil
end

class OrderProcessor
  include Processable

  def execute = nil
end
```

## When callable classes are appropriate

A class with `initialize` and `call` is justified when it maintains state across multiple operations, when constructor dependency injection materially improves clarity, or when the project already uses callable objects consistently.

```ruby
class BatchEmailSender
  def initialize(users)
    @users = users
    @sent_count = 0
    @failed = []
  end

  def send_all
    @users.each { |user| send_to(user) }
    self
  end

  def report = { sent: @sent_count, failed: @failed }
end
```

If that convention comes from a Rails service-object style, load `/skill:rails-services` and `/skill:rails-stack-profiles` for the framework-specific trade-offs.

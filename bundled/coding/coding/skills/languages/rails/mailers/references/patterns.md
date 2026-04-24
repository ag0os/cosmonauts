# Action Mailer Patterns

Use standard Rails conventions for provider configuration, multipart templates, attachments, I18n, and development preview tooling such as `letter_opener` when the repo already uses it. This reference focuses on patterns that affect mailer structure, delivery, previews, and tests.

## Keep Mailer Structure Explicit

Use parameterized mailers with `params` and `before_action` when multiple actions need the same context.

```ruby
class UserMailer < ApplicationMailer
  before_action { @user = params[:user] }
  before_action { @account = @user.account }

  default to: -> { @user.email }

  def welcome
    I18n.with_locale(@user.locale || I18n.default_locale) do
      mail(subject: t(".subject", account_name: @account.name))
    end
  end

  def weekly_digest
    @events = @user.events.from_last_week

    I18n.with_locale(@user.locale || I18n.default_locale) do
      mail(subject: t(".subject"))
    end
  end
end

# Usage
UserMailer.with(user: user).welcome.deliver_later
```

Keep the filesystem structure aligned with the mailer actions:

```text
app/mailers/user_mailer.rb
app/views/user_mailer/welcome.html.erb
app/views/user_mailer/welcome.text.erb
test/mailers/previews/user_mailer_preview.rb
# or spec/mailers/previews/user_mailer_preview.rb
```

Use one mailer action per distinct email. If two branches need different templates or subjects, split them into separate actions so previews and tests stay obvious.

## Shared `ApplicationMailer` Defaults

Keep layout, default sender, shared headers, and delivery-specific rescue behavior in `ApplicationMailer`.

```ruby
class ApplicationMailer < ActionMailer::Base
  default from: -> { "#{Current.account&.name || 'App'} <noreply@example.com>" }
  layout "mailer"

  rescue_from Net::SMTPSyntaxError, with: :log_delivery_error

  before_action :set_default_headers

  private

  def set_default_headers
    headers["X-App-Version"] = Rails.application.config.version
    headers["List-Unsubscribe"] = "<mailto:unsubscribe@example.com>"
  end

  def log_delivery_error(exception)
    Rails.logger.error("[Mailer] Delivery failed: #{exception.message}")
  end
end
```

Do not put business rules here. `ApplicationMailer` should only hold defaults and cross-cutting email concerns.

## Delivery Method and Queue Selection

Default to `deliver_later`. The caller owns send timing; the mailer owns rendering.

```ruby
class ApplicationMailer < ActionMailer::Base
  self.deliver_later_queue_name = :mailers
end

class UrgentMailer < ApplicationMailer
  self.deliver_later_queue_name = :critical
end
```

Use `deliver_now` only when synchronous delivery is explicitly required and already accepted by the repo. For broader queue and retry guidance, load `/skill:rails-jobs`.

## Staging Interceptors and Delivery Observers

Redirect staging mail away from real users with an interceptor:

```ruby
# app/mailers/interceptors/staging_interceptor.rb
class StagingInterceptor
  def self.delivering_email(message)
    original_to = message.to
    message.to = ["staging-inbox@example.com"]
    message.cc = nil
    message.bcc = nil
    message.subject = "[STAGING] #{message.subject} (was: #{original_to.join(', ')})"
  end
end

# config/initializers/mail_interceptors.rb
if Rails.env.staging?
  ActionMailer::Base.register_interceptor(StagingInterceptor)
end
```

Observers are useful for audit or metrics hooks that should run after delivery:

```ruby
class DeliveryObserver
  def self.delivered_email(message)
    EmailLog.create!(
      to: message.to.join(", "),
      subject: message.subject,
      delivered_at: Time.current
    )
  end
end

ActionMailer::Base.register_observer(DeliveryObserver)
```

Keep these hooks focused on delivery concerns. If they grow workflow logic, move that orchestration back to the calling model, service, or job.

## Previews with Multiple Scenarios

Every non-trivial mailer action should have a preview. Add alternate scenarios for the edge cases most likely to break layout or copy.

```ruby
class OrderMailerPreview < ActionMailer::Preview
  def confirmation
    order = Order.first || Order.new(id: 1, number: "PREVIEW-001", created_at: Time.current)
    OrderMailer.with(order: order).confirmation
  end

  def confirmation_with_discount
    order = Order.joins(:discount).first
    OrderMailer.with(order: order).confirmation
  end

  def confirmation_international
    order = Order.joins(:user).where(users: { locale: "ja" }).first
    OrderMailer.with(order: order).confirmation
  end
end
```

Use previews to catch:
- long translated subjects
- missing associations or optional content blocks
- mobile-unfriendly layout regressions
- locale-specific formatting differences

## Conditional Delivery

A mailer action can return `nil` to skip delivery when there is no meaningful content.

```ruby
class NotificationMailer < ApplicationMailer
  def activity_digest(user)
    @user = user
    @activities = user.activities.from_last_day
    return if @activities.none?

    mail(to: @user.email, subject: "Your daily activity")
  end
end
```

Keep the condition simple. If the decision depends on wider business workflow rules, decide earlier and avoid calling the mailer at all.

## Internationalization and Multipart Templates

Set the locale before calling `mail` so the subject and both templates render under the same locale.

```ruby
class BillingMailer < ApplicationMailer
  before_action { @invoice = params[:invoice] }

  def receipt
    I18n.with_locale(@invoice.customer.locale || I18n.default_locale) do
      mail(
        to: @invoice.customer.email,
        subject: t(".subject", invoice_number: @invoice.number)
      )
    end
  end
end
```

```erb
<!-- app/views/billing_mailer/receipt.html.erb -->
<p><%= t(".greeting", name: @invoice.customer.first_name) %></p>
<p><%= t(".body", invoice_number: @invoice.number) %></p>
```

```erb
<%# app/views/billing_mailer/receipt.text.erb %>
<%= t(".greeting", name: @invoice.customer.first_name) %>
<%= t(".body", invoice_number: @invoice.number) %>
```

```yaml
# config/locales/mailers/en.yml
en:
  billing_mailer:
    receipt:
      subject: "Receipt for invoice %{invoice_number}"
      greeting: "Hi %{name},"
      body: "Thanks for your payment."
```

Do not inline translated strings in the mailer class just because the subject looks short. Keep subjects and body copy in locale files so they can evolve together.

## Profile-Aware Delivery Triggers

**Omakase — model callback or small model method triggers delivery:**

```ruby
class Order < ApplicationRecord
  after_create_commit :send_confirmation

  private

  def send_confirmation
    OrderMailer.with(order: self).confirmation.deliver_later
  end
end
```

**Service-oriented — service triggers delivery:**

```ruby
class Orders::Create
  def call
    order = Order.create!(params)
    OrderMailer.with(order: order).confirmation.deliver_later
    Result.new(success: true, order: order)
  end
end
```

**API-first — job or service triggers delivery after the response-critical work succeeds:**

```ruby
class SignupJob < ApplicationJob
  def perform(user_id)
    user = User.find(user_id)
    UserMailer.with(user: user).welcome.deliver_now
  end
end
```

The key rule is ownership: the caller decides when email belongs in the workflow. The mailer should not discover that workflow on its own.

## Testing Mailers

Match the repo's test stack, then cover both rendering and enqueueing behavior.

**Omakase — Minitest mailer test:**

```ruby
class OrderMailerTest < ActionMailer::TestCase
  test "confirmation email" do
    order = orders(:confirmed)
    mail = OrderMailer.with(order: order).confirmation

    assert_emails 1 do
      mail.deliver_now
    end

    assert_equal [order.user.email], mail.to
    assert_match "Order ##{order.number}", mail.subject
    assert_includes mail.body.encoded, order.number
  end
end
```

**Service-oriented — RSpec mailer spec:**

```ruby
RSpec.describe OrderMailer, type: :mailer do
  describe "#confirmation" do
    let(:order) { create(:order) }
    let(:mail) { described_class.with(order: order).confirmation }

    it "renders the headers" do
      expect(mail.to).to eq([order.user.email])
      expect(mail.subject).to match(/Order ##{order.number}/)
    end

    it "renders the body" do
      expect(mail.body.encoded).to include(order.number)
    end
  end
end
```

**Caller-level enqueue assertion:**

```ruby
RSpec.describe "Order creation", type: :request do
  it "sends a confirmation email" do
    expect {
      post orders_path, params: { order: attributes_for(:order) }
    }.to have_enqueued_mail(OrderMailer, :confirmation)
  end
end
```

Mailer tests should answer four questions:
1. Who receives the message?
2. Does the subject and body render the right data?
3. Is multipart output present when the email matters?
4. Does the caller enqueue delivery at the right boundary?

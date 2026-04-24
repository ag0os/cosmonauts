# Rails Authentication Patterns — Detailed Reference

Use this reference after identifying the repo's auth stack with `/skill:rails-conventions`. Extend the existing approach instead of forcing a migration between auth systems.

## Rails 8 Generated Authentication

### What the generator creates

```bash
bin/rails generate authentication
# Creates: User model, Session model, SessionsController,
# Authentication concern, PasswordsController, PasswordsMailer, migrations
```

### `generates_token_for` with automatic invalidation

```ruby
class User < ApplicationRecord
  has_secure_password
  has_many :sessions, dependent: :destroy

  normalizes :email_address, with: -> { _1.strip.downcase }

  generates_token_for :password_reset, expires_in: 15.minutes do
    password_salt&.last(10)
  end

  generates_token_for :email_confirmation, expires_in: 24.hours do
    email_address
  end

  generates_token_for :unsubscribe
end

# Generate: user.generate_token_for(:password_reset)
# Find:     User.find_by_token_for(:password_reset, token)
# Find!:    User.find_by_token_for!(:password_reset, token)
```

Tie one-time tokens to mutable user state so they expire naturally when the password or email changes.

### Current/session tracking

```ruby
# app/models/current.rb
class Current < ActiveSupport::CurrentAttributes
  attribute :session
  delegate :user, to: :session, allow_nil: true
end
```

This keeps `Current.user` derived from the current session instead of duplicating user lookup logic across controllers.

### Rate-limiting entry points

```ruby
class SessionsController < ApplicationController
  allow_unauthenticated_access only: %i[new create]
  rate_limit to: 10, within: 3.minutes, only: :create, with: -> {
    redirect_to new_session_url, alert: "Try again later."
  }
end

class PasswordsController < ApplicationController
  rate_limit to: 5, within: 1.hour, only: :create, with: -> {
    redirect_to new_password_url, alert: "Too many reset requests."
  }
end
```

### Multiple session management

```ruby
def destroy_all
  Current.user.sessions.where.not(id: Current.session.id).destroy_all
  redirect_to sessions_path, notice: "All other sessions terminated."
end
```

If the product exposes device or session management, model each session explicitly and let users revoke the ones they no longer trust.

## Devise Turbo Integration

Turbo needs specific response codes. This is the most common Devise + Rails 7+ integration issue.

```ruby
# config/initializers/devise.rb
Devise.setup do |config|
  config.responder.error_status = :unprocessable_entity
  config.responder.redirect_status = :see_other
  config.navigational_formats = ["*/*", :html, :turbo_stream]
end
```

If redirects still break for Turbo requests, match the repo's failure-app setup instead of layering ad hoc controller workarounds.

```ruby
class TurboFailureApp < Devise::FailureApp
  def respond
    if request_format == :turbo_stream
      redirect
    else
      super
    end
  end

  def skip_format?
    %w[html turbo_stream */*].include?(request_format.to_s)
  end
end

# config/initializers/devise.rb
config.warden do |manager|
  manager.failure_app = TurboFailureApp
end
```

## Devise Custom Controllers

Use custom controllers when you need extra permitted fields, onboarding redirects, or repo-specific registration/session behavior.

```ruby
# config/routes.rb
devise_for :users, controllers: {
  registrations: "users/registrations",
  sessions: "users/sessions"
}
```

```ruby
class Users::RegistrationsController < Devise::RegistrationsController
  before_action :configure_sign_up_params, only: [:create]

  protected

  def configure_sign_up_params
    devise_parameter_sanitizer.permit(:sign_up, keys: [:name, :organization_name])
  end

  def after_sign_up_path_for(resource)
    onboarding_path
  end
end
```

## OmniAuth Integration with Devise

```ruby
# Gemfile
gem "omniauth-google-oauth2"
gem "omniauth-rails_csrf_protection"
```

```ruby
class User < ApplicationRecord
  devise :omniauthable, omniauth_providers: [:google_oauth2]

  def self.from_omniauth(auth)
    find_or_create_by(provider: auth.provider, uid: auth.uid) do |user|
      user.email = auth.info.email
      user.password = Devise.friendly_token[0, 20]
      user.name = auth.info.name
    end
  end
end
```

Keep third-party identity setup in the same auth stack already used by the repo instead of bolting on a second sign-in path with separate persistence rules.

## Custom `has_secure_password` Lockout Pattern

When a repo uses built-in auth and needs brute-force protection beyond request throttling, keep the counters on the user or session model rather than scattering them through controllers.

```ruby
class User < ApplicationRecord
  has_secure_password

  def lock_if_too_many_attempts!
    increment!(:failed_login_attempts)
    update!(locked_at: Time.current) if failed_login_attempts >= 5
  end

  def locked?
    locked_at.present? && locked_at > 30.minutes.ago
  end

  def reset_failed_attempts!
    update!(failed_login_attempts: 0)
  end
end
```

Pair this with `reset_session` on successful login so the browser session is not reused after authentication.

## Bearer Token Boundary

Bearer-token auth is usually repo-specific. Match the existing token object, JWT service, signed-token verifier, or personal-access-token model found via `/skill:rails-conventions`.

Keep these rules stable across implementations:
- parse or verify the token in one shared concern, middleware, or base controller
- set the current user or current session in one place
- keep `401` vs `403`, error envelopes, and rate-limit headers aligned with `/skill:rails-api`
- do not let each controller invent its own token decoding logic

## Profile-Aware Test Helpers

### Omakase (Minitest)

```ruby
class SessionsControllerTest < ActionDispatch::IntegrationTest
  test "login with valid credentials" do
    user = users(:jane)
    post session_url, params: { email_address: user.email_address, password: "password" }
    assert_redirected_to root_path
  end

  test "rate limiting after 10 attempts" do
    11.times { post session_url, params: { email_address: "x@x.com", password: "wrong" } }
    assert_redirected_to new_session_url
    follow_redirect!
    assert_match "Try again later", flash[:alert]
  end
end
```

### Service-oriented (RSpec + Devise)

```ruby
# spec/rails_helper.rb
RSpec.configure do |config|
  config.include Devise::Test::IntegrationHelpers, type: :request
  config.include Devise::Test::IntegrationHelpers, type: :system
end

# In specs — use sign_in helper, don't hit the login endpoint
before { sign_in user }
```

## Auth-Specific Session Settings

Session cookies are part of auth behavior; broader transport hardening is an environment and deployment concern.

```ruby
Rails.application.config.session_store :cookie_store,
  key: "_app_session",
  secure: Rails.env.production?,
  httponly: true,
  same_site: :lax,
  expire_after: 12.hours
```

Re-check the repo's current cookie, proxy, and HTTPS expectations before changing these values. Use `/skill:find-docs` for current Rails session-store and cookie options.

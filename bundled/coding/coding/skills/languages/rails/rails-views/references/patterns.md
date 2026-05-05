# Rails View Patterns — Detailed Reference

Use standard Rails conventions for basic ERB, layouts, helpers, `form_with`, and `content_for`. This reference focuses on higher-leverage server-rendered patterns. For Turbo Frames, Turbo Streams, or Stimulus behavior, load `/skill:rails-hotwire`.

## ERB and Partial Composition

### Extract repeated markup into partials

Keep templates flat by moving repeated or nested markup into partials with explicit locals.

```erb
<%= render partial: "products/product", collection: @products, as: :product %>
```

```erb
<%# app/views/products/_product.html.erb %>
<article class="product-card">
  <h2><%= product.name %></h2>
  <p><%= number_to_currency(product.price) %></p>
</article>
```

Prefer collection rendering over manual loops when rendering the same partial many times. It is easier to read and works naturally with collection caching.

### Use layout slots intentionally

Use `content_for` when a view needs to fill a layout region such as page actions, head tags, or sidebars.

```erb
<% content_for :page_actions do %>
  <%= link_to "New product", new_product_path, class: "btn btn-primary" %>
<% end %>
```

Do not spread one-off layout wiring across many partials. Keep slot ownership obvious at the page template level.

## Profile-Aware Display Objects

### Presenter objects in omakase apps

Omakase Rails apps usually favor helpers, partials, and small presenter POROs instead of component frameworks.

```ruby
class DashboardPresenter
  attr_reader :user, :period

  def initialize(user:, period: Date.current.all_month)
    @user = user
    @period = period
  end

  def grouped_activities
    user.activities.where(date: period).group_by(&:category).sort_by { |category, _| category.position }
  end

  def empty? = user.activities.where(date: period).none?
  def title = "#{user.name}'s Dashboard"
end
```

```erb
<h1><%= @presenter.title %></h1>
<% @presenter.grouped_activities.each do |category, activities| %>
  <section>
    <h2><%= category.name %></h2>
    <%= render partial: "activity", collection: activities, cached: true %>
  </section>
<% end %>
```

For the underlying Ruby object shape, load `/skill:ruby-object-design`.

### ViewComponent when the gem is already installed

ViewComponent is a service-oriented pattern. Use it only when the `view_component` gem is already part of the repo.

```ruby
class AlertComponent < ViewComponent::Base
  ALLOWED_TYPES = %i[info success warning error].freeze

  def initialize(type: :info, title: nil)
    @type = ALLOWED_TYPES.include?(type) ? type : :info
    @title = title
  end
end
```

```erb
<%# app/components/alert_component.html.erb %>
<div class="alert alert--<%= @type %>" role="alert">
  <% if @title.present? %>
    <h2 class="alert__title"><%= @title %></h2>
  <% end %>

  <div class="alert__body"><%= content %></div>
</div>
```

If the component also needs Turbo or Stimulus behavior, load `/skill:rails-hotwire` instead of embedding that advice here.

## Collection Caching Strategies

### Russian-doll caching

Nest caches so inner updates only bust the inner fragment. The outer model must `touch` on inner changes:

```ruby
class Product < ApplicationRecord
  belongs_to :category, touch: true
end
```

```erb
<% cache @category do %>
  <h2><%= @category.name %></h2>
  <%= render partial: "products/product", collection: @category.products, cached: true %>
<% end %>
```

Key points:
- `cached: true` on collection render uses `read_multi` to batch cache reads.
- The `touch: true` association ensures the outer cache busts when any inner record changes.
- Use `cache_if(condition, record)` when admins or preview users should see uncached content.

### Conditional caching

```erb
<% cache_if(!current_user&.admin?, @product) do %>
  <%= render @product %>
<% end %>
```

## Form Patterns

### Use `form_with` consistently

Match the repo's form-builder conventions and keep field markup predictable.

```erb
<%= form_with model: @user do |f| %>
  <div class="field">
    <%= f.label :email %>
    <%= f.email_field :email, autocomplete: "email" %>
  </div>

  <div class="field">
    <%= f.label :password %>
    <%= f.password_field :password, autocomplete: "new-password" %>
  </div>

  <%= f.submit "Create account" %>
<% end %>
```

### Form object pattern

Use a form object when one submission does not map 1:1 to a model, or spans multiple models.

```ruby
class RegistrationForm
  include ActiveModel::Model
  include ActiveModel::Attributes

  attribute :email, :string
  attribute :password, :string
  attribute :terms_accepted, :boolean

  validates :email, presence: true, format: { with: URI::MailTo::EMAIL_REGEXP }
  validates :password, length: { minimum: 8 }
  validates :terms_accepted, acceptance: true

  def save
    return false unless valid?

    User.create!(email: email, password: password)
  end
end
```

This works with `form_with model: RegistrationForm.new` like any ActiveRecord model.

## Accessibility Patterns

### Accessible error states

Link errors to fields via `aria-describedby` and announce them with `role="alert"`:

```erb
<%= f.email_field :email, aria: { invalid: @user.errors[:email].any?, describedby: "email-error" } %>
<% if @user.errors[:email].any? %>
  <span id="email-error" role="alert"><%= @user.errors[:email].first %></span>
<% end %>
```

### Flash messages as live regions

```erb
<div aria-live="polite" aria-atomic="true">
  <% flash.each do |type, message| %>
    <div class="flash flash--<%= type %>" role="status"><%= message %></div>
  <% end %>
</div>
```

### Skip navigation

Make the skip link the first focusable element inside `<body>`:

```erb
<a href="#main-content" class="sr-only sr-only--focusable">Skip to main content</a>
```

### Accessibility checklist

Use this checklist during review:

- All images have meaningful `alt` attributes, with `alt=""` only for decorative images.
- Form fields have associated `<label>` elements instead of placeholder-only text.
- Interactive elements are keyboard-accessible and use the correct semantic element.
- Color contrast meets WCAG AA for text and controls.
- Major page regions use semantic landmarks such as `header`, `nav`, `main`, `section`, and `footer`.
- A skip-to-content link appears as the first focusable element in `<body>`.
- Validation errors are linked to fields with `aria-describedby` and announced with `role="alert"`.
- Flash messages live in an `aria-live="polite"` region.

## Performance Decision Table

| Technique | When to Use |
|---|---|
| `render collection:` | Rendering 3+ items of the same partial |
| `cached: true` on collection | Collection items rarely change |
| Russian-doll caching | Nested parent or child displays with `touch: true` |
| `cache_if(condition)` | Skip caching for admins or preview modes |
| `loading="lazy"` on images | Below-the-fold images |
| Turbo Frames or Streams | Load `/skill:rails-hotwire` for deferred loading or live updates |

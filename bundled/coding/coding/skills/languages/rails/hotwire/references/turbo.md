# Turbo Patterns — Gotchas, Advanced Patterns, and Version-Aware Features

Follow standard Turbo Drive, Frame, and Stream conventions. This reference covers non-obvious patterns, debugging tips, and version-specific features.

## Morphing (Turbo 8+)

Check the installed Turbo version before using morphing. It requires `@hotwired/turbo-rails` 8.0 or newer.

```erb
<%# Enable page-level morphing (Turbo 8.0+) %>
<meta name="turbo-refresh-method" content="morph">
<meta name="turbo-refresh-scroll" content="preserve">
```

```erb
<%# Stream-level morphing %>
<%= turbo_stream.replace dom_id(@card, :card_container),
    partial: "cards/container",
    method: :morph,
    locals: { card: @card.reload } %>
```

Benefits over a standard replace:
- Preserves focus and scroll position.
- Maintains form input state during updates.
- Keeps CSS transitions smoother.
- Reduces unnecessary DOM churn.

Check `Gemfile.lock` or `package.json` for the installed Turbo version before relying on morphing.

## Turbo Stream Custom Actions

Extend Turbo with domain-specific actions when the built-in stream actions are not enough.

```javascript
// app/javascript/application.js
import { Turbo } from "@hotwired/turbo-rails"

Turbo.StreamActions.notification = function() {
  const message = this.getAttribute("message")
  const type = this.getAttribute("type") || "info"
  window.showNotification(message, type)
}
```

```erb
<turbo-stream action="notification" message="Saved!" type="success"></turbo-stream>
```

## Nested Frames Pattern

Nested frames let each record in a list own its own edit surface.

```erb
<turbo-frame id="posts">
  <% @posts.each do |post| %>
    <turbo-frame id="<%= dom_id(post) %>">
      <%= render post %>
    </turbo-frame>
  <% end %>
</turbo-frame>
```

Clicking Edit on one post replaces only that post's inner frame. The `dom_id(post)` frame ID must match exactly between the listing and the replacement response.

## Infinite Scroll with Lazy Frames

Chain lazy-loaded frames for pagination without extra JavaScript.

```erb
<div id="posts">
  <%= render @posts %>
</div>

<%= turbo_frame_tag "pagination",
    src: posts_path(page: @page + 1),
    loading: :lazy do %>
  <div class="loading">Loading more...</div>
<% end %>
```

```erb
<%# app/views/posts/index.turbo_frame.erb %>
<%= turbo_stream.append "posts" do %>
  <%= render @posts %>
<% end %>

<% if @has_more %>
  <%= turbo_frame_tag "pagination",
      src: posts_path(page: @page + 1),
      loading: :lazy do %>
    <div class="loading">Loading more...</div>
  <% end %>
<% end %>
```

## Permanent Elements

Use `data-turbo-permanent` for UI that should survive navigation with its state intact.

```erb
<div id="notifications" data-turbo-permanent>
  <%= turbo_stream_from current_user, "notifications" %>
  <div id="notification-list"></div>
</div>

<div id="media-player" data-turbo-permanent>
  <audio controls src="<%= @podcast.audio_url %>"></audio>
</div>
```

A permanent element needs a stable `id` and must appear in the same spot on the destination page. If it is missing from the new page, Turbo removes it.

## Fragment Caching with Turbo Frames

Cache at the frame boundary when each item updates independently.

```erb
<% @comments.each do |comment| %>
  <% cache comment do %>
    <%= turbo_frame_tag comment, :container do %>
      <%= render comment %>
    <% end %>
  <% end %>
<% end %>
```

```ruby
class Comment < ApplicationRecord
  belongs_to :post, touch: true
end
```

Include the user in the cache key for personalized content: `cache [@post, current_user]`.

## User-Scoped Broadcasting

```ruby
Turbo::StreamsChannel.broadcast_prepend_to(
  [user, "notifications"],
  target: "notifications",
  partial: "notifications/notification",
  locals: { notification: notification }
)
```

```erb
<%= turbo_stream_from current_user, "notifications" %>
```

## Version Requirements

| Pattern | Turbo Version | Notes |
|---|---|---|
| Frames, Streams | Any | Core functionality |
| Page refresh | 7.2+ | `turbo_stream.refresh` |
| Morphing (`:morph`) | 8.0+ | Check the installed Turbo version first |
| Custom Stream Actions | Any | `Turbo.StreamActions` |

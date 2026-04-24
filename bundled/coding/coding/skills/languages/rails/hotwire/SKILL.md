---
name: rails-hotwire
description: Hotwire patterns for Turbo, Stimulus, progressive enhancement, and real-time Rails UI updates. Use when building interactive server-rendered Rails interfaces or reviewing frame, stream, and controller behavior. Do NOT load for JSON-only APIs, GraphQL clients, or model and database design.
---

# Rails Hotwire

Use `/skill:rails-conventions` and `/skill:rails-stack-profiles` first to match the repo's conventions and profile. Assume `/skill:ruby-object-design` and `/skill:ruby-refactoring` are available for Ruby-level decisions.

## Scope

Use this skill for Hotwire-first Rails interfaces: Turbo Drive, Frames, Streams, Stimulus controllers, and real-time HTML updates. Keep the server as the source of truth and add JavaScript only where server-rendered HTML needs lightweight behavior.

## Reference Guides

- [stimulus.md](references/stimulus.md) — Stimulus integration patterns and production gotchas.
- [turbo.md](references/turbo.md) — Turbo Frames, Streams, morphing, and version-aware features.

## Quick Reference

| Component | Use When |
|---|---|
| Stimulus | Adding focused JavaScript behavior to server-rendered HTML |
| Turbo Drive | Default navigation and form submission behavior |
| Turbo Frames | Updating one bounded region without a full-page reload |
| Turbo Streams | Updating multiple DOM targets from one response |
| ActionCable + Streams | Pushing real-time updates to connected clients |

## Core Philosophy

**HTML over the wire**: send HTML from the server, not JSON. JavaScript enhances server-rendered HTML instead of owning the application state.

1. **Progressive enhancement** — core flows should still work without JavaScript.
2. **Server-first** — business logic and state stay on the server.
3. **Minimal JavaScript** — use Stimulus for behavior, not a client-side app shell.
4. **No duplicate state** — avoid mirroring business state in browser-only stores.

## Choosing Between Frames and Streams

| Scenario | Use | Why |
|---|---|---|
| Edit-in-place | Frame | Scoped navigation that replaces its own region |
| Form creates an item and updates a counter | Stream | One response updates multiple targets |
| Lazy sidebar or below-the-fold panel | Frame with `loading: :lazy` | Deferred load for one bounded target |
| Real-time chat or notifications | ActionCable + Stream | Server pushes updates to every subscribed client |
| Tabs or pagination inside a page | Frame | Replaces one section without disturbing the rest of the page |
| Flash plus content update | Stream | Response updates both the flash container and the content |

Use Frames when one request should replace one well-bounded region. Use Streams when one response needs to touch multiple DOM targets or when the update is broadcast from the server.

## Stimulus + ActionCable Integration

This pattern is easy to get wrong because Turbo navigation changes page lifecycle. Pair the subscription with a Stimulus controller so `connect()` and `disconnect()` manage the cable subscription correctly.

```javascript
// app/javascript/controllers/chat_controller.js
import { Controller } from "@hotwired/stimulus"
import consumer from "../channels/consumer"

export default class extends Controller {
  static targets = ["messages", "input"]
  static values = { roomId: Number }

  connect() {
    this.subscription = consumer.subscriptions.create(
      { channel: "ChatChannel", room_id: this.roomIdValue },
      { received: (data) => this.messagesTarget.insertAdjacentHTML("beforeend", data.html) }
    )
  }

  disconnect() {
    this.subscription?.unsubscribe()
  }

  send(event) {
    event.preventDefault()

    if (this.inputTarget.value.trim()) {
      this.subscription.send({ message: this.inputTarget.value })
      this.inputTarget.value = ""
    }
  }
}
```

## Critical Gotchas

### Turbo form errors need `422`

Turbo ignores a validation-error re-render unless the response status is `:unprocessable_entity`.

```ruby
# Wrong: Turbo treats this as a success response
format.html { render :new }

# Right: Turbo renders the form errors
format.html { render :new, status: :unprocessable_entity }
```

### Frame ID mismatches fail silently

If the response HTML does not contain a matching `<turbo-frame id="...">`, Turbo cannot replace the frame.

- Check the browser console for the missing-frame warning.
- Verify `dom_id(@record)` resolves to the same value in both views.
- Make sure the response view wraps the replacement content in the expected frame tag.

### Broadcasting must stay scoped

```ruby
# Wrong: every connected user sees every message
after_create_commit { broadcast_prepend_to "messages" }

# Right: scope the broadcast to the relevant stream
after_create_commit -> { broadcast_prepend_to(room, :messages) }
after_create_commit -> { broadcast_prepend_to(user, :notifications) }
```

### Stimulus controllers must clean up on Turbo navigation

Turbo reconnects controllers across visits and cache restores. Timers, observers, and subscriptions that are not cleaned up in `disconnect()` will leak and cause duplicate behavior.

## Progressive Enhancement Checklist

Before shipping a Hotwire feature, verify:

- [ ] Core functionality still works with Turbo disabled where appropriate.
- [ ] Forms still submit successfully without custom JavaScript.
- [ ] Links still have a full-page navigation fallback.
- [ ] Stimulus controllers fail soft: content stays visible or usable without JS.
- [ ] `data-turbo-permanent` is used intentionally for media players, notifications, or other persistent UI.
- [ ] `data-turbo="false"` is used on file downloads or flows that should bypass Turbo.

## Recommendation Format

When recommending or generating Hotwire changes, include:
1. The Stimulus controller behavior, targets, values, and lifecycle cleanup.
2. The ERB partial or frame markup with the required Turbo data attributes.
3. The controller response format for HTML and `turbo_stream` requests.
4. Any model broadcast or channel subscription needed for real-time updates.
5. The failure mode to watch for, such as missing `422`, frame ID mismatches, or unscoped broadcasts.

## Related Skills

- `/skill:rails-conventions` — Match the repo's existing Stimulus, frontend, component, and response conventions before adding Hotwire code.
- `/skill:rails-stack-profiles` — Confirm the app is server-rendered or hybrid before leaning on Hotwire-first UI patterns.
- `/skill:rails-views` — Pair Turbo and Stimulus changes with the repo's ERB, partial, helper, and component conventions.
- `/skill:rails-caching` — Align frame and partial updates with fragment caching and invalidation strategy.
- `/skill:find-docs` — Check current Turbo, Stimulus, and Rails docs when version-specific behavior matters.

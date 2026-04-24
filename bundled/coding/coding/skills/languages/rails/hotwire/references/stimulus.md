# Stimulus Patterns — Gotchas and Advanced Integration

Follow standard Stimulus controller conventions for targets, values, classes, lifecycle callbacks, and actions. This reference covers non-obvious patterns and production gotchas.

## Auto-Save Controller

This pattern combines dirty tracking, interval-based saves, and a save on disconnect.

```javascript
// app/javascript/controllers/auto_save_controller.js
import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static values = { interval: { type: Number, default: 3000 } }
  #timer
  #dirty = false

  disconnect() {
    this.submit()
  }

  change(event) {
    if (event.target.form === this.element && !this.#dirty) {
      this.#dirty = true
      this.#scheduleSave()
    }
  }

  async submit() {
    if (this.#dirty) {
      this.#resetTimer()
      this.#dirty = false
      await this.element.requestSubmit()
    }
  }

  #scheduleSave() {
    this.#timer = setTimeout(() => this.submit(), this.intervalValue)
  }

  #resetTimer() {
    clearTimeout(this.#timer)
  }
}
```

Key points:
- Uses private fields for controller-local state.
- Saves on `disconnect()` so a Turbo navigation does not drop a pending edit.
- Uses `requestSubmit()` so Turbo sees the form submission.
- Composes cleanly with other controllers, such as `data-controller="autoresize auto-save"`.

## Controller Communication: Outlets vs Events

Use outlets when controllers have a direct relationship and one needs to call another. Use events for loosely coupled communication.

```javascript
// Outlets: direct reference via HTML wiring
static outlets = ["results"]

filter() {
  if (this.hasResultsOutlet) {
    this.resultsOutlet.filterBy(query)
  }
}

// Events: loosely coupled communication
this.dispatch("filter", { detail: { query }, prefix: "search" })
// Listener: data-action="search:filter->results#handleFilter"
```

Outlet references break silently if the outlet element is removed by a Turbo Stream update, so guard with `has*Outlet`.

## Lifecycle Gotchas with Turbo

Turbo navigation disconnects controllers on the old page and reconnects them on the new page. Turbo cache restoration can reconnect cached DOM as well.

1. Clean up timers, observers, event listeners, and subscriptions in `disconnect()`.
2. Do not assume `connect()` runs only once.
3. Use `initialize()` for true one-time setup per controller instance.

```javascript
connect() {
  this.observer = new IntersectionObserver(this.handleIntersect.bind(this))
  this.observer.observe(this.element)
}

disconnect() {
  this.observer?.disconnect()
}
```

## Target Callbacks for Dynamic Content

Target callbacks are the simplest way to react when Turbo Streams add or remove matching targets.

```javascript
itemTargetConnected(element) {
  this.updateCount()
  element.animate([{ opacity: 0 }, { opacity: 1 }], 300)
}

itemTargetDisconnected() {
  this.updateCount()
}
```

Use these callbacks instead of wiring a separate mutation observer when the changes already correspond to Stimulus targets.

## Directory Organization

```text
app/javascript/
├── controllers/
│   ├── application.js
│   ├── index.js
│   ├── dropdown_controller.js
│   ├── forms/
│   │   ├── validation_controller.js
│   │   └── auto_submit_controller.js
│   └── shared/
│       └── clipboard_controller.js
└── helpers/
    └── timing_helpers.js
```

Namespace controllers in subdirectories. Stimulus auto-registers `forms/validation_controller.js` as `forms--validation`, referenced in HTML as `data-controller="forms--validation"`.

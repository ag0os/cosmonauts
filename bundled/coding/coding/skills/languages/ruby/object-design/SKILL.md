---
name: ruby-object-design
description: Ruby object-shape guidance for choosing between modules, classes, Struct, Data, and Hash. Use when deciding how Ruby code should hold data or behavior; Do NOT load for Rails-specific architecture or refactoring workflow.
---

# Ruby Object Design

## Discover Project Conventions First

Before writing Ruby code, inspect:
1. `.ruby-version` for Ruby version and `Data.define` availability.
2. `Gemfile` for framework, runtime, and library choices.
3. Project structure to detect Rails, Sinatra, Hanami, Roda, or pure Ruby.
4. Test runner and linter setup.

Match what you find. If Rails is present, load the relevant `/skill:rails-*` skill for framework-specific guidance.

This skill is the Ruby-level source of truth for choosing between `Hash`, `Struct`, `Data.define`, modules, and classes.

## Object Factory Rule

Only use a `class` when you are creating an object factory: a template for multiple instances that encapsulate state and behavior. If the code does not create meaningful instances with distinct state, start with a module, method, lambda, `Struct`, `Data`, or `Hash` instead.

## Choose the Smallest Construct

```text
Do you need multiple instances with encapsulated state?
|-- YES: Does the object have both state and behavior?
|   |-- YES -> Class
|   +-- NO -> Struct or Data
+-- NO: Is this a collection of related functions?
    |-- YES -> Module with `extend self`
    +-- NO: Is this ad-hoc or temporary data?
        |-- YES -> Hash
        +-- NO -> Standalone method or lambda
```

## Red Flags for Classes

### Stateless utility buckets

If a class has no instance variables, it is usually a module pretending to be a class.

```ruby
# Bad: class with no instance state
class StringUtils
  def self.titleize(string) = string.split.map(&:capitalize).join(" ")
end

# Good: module with `extend self`
module StringUtils
  extend self

  def titleize(string) = string.split.map(&:capitalize).join(" ")
end
```

### Single-method callable objects

Classes with only `initialize` and `call` are often functions in a class costume. Ask whether multiple instances will exist, whether the object keeps state between calls, and whether `initialize` plus `call` adds clarity or just ceremony.

```ruby
# Questionable: function in a class costume
class CalculateDiscount
  def initialize(order) = @order = order
  def call = @order.subtotal * discount_rate

  private

  def discount_rate = @order.customer.premium? ? 0.1 : 0.05
end

# Alternative: module function
module Discounts
  extend self

  def calculate(order) = order.subtotal * discount_rate(order.customer)

  private

  def discount_rate(customer) = customer.premium? ? 0.1 : 0.05
end
```

If a Rails codebase already standardizes on service objects, load `/skill:rails-services` and `/skill:rails-stack-profiles` before pushing against the project convention.

### Pattern-shaped names

Classes named `Factory`, `Builder`, `Decorator`, `Adapter`, or `AbstractBase` are often signs that Ruby-native features would fit better. See [references/class-vs-module.md](references/class-vs-module.md) for lighter-weight alternatives.

### Objects invalid after initialization

Objects should be valid at birth. If an object only works after a sequence of setter calls, fix the constructor or pick a different construct.

```ruby
# Bad: requires setup after `.new`
report = ReportGenerator.new
report.set_data(data)
report.generate

# Good: valid at birth
ReportGenerator.new(data: data).generate
```

## Data and Struct for Value Objects

Prefer `Data.define` for immutable value objects on Ruby 3.2+.

```ruby
Point = Data.define(:x, :y) do
  def distance_from_origin = Math.sqrt(x**2 + y**2)
  def translate(dx, dy) = with(x: x + dx, y: y + dy)
end
```

Use `Struct.new(..., keyword_init: true)` when the project is on an older Ruby or when the object is intentionally mutable. For the full graduation path from temporary hashes to richer value objects, see [references/data-structures.md](references/data-structures.md).

## Decision Matrix

| Scenario | Use | Why |
| --- | --- | --- |
| Multiple instances with state and behavior | Class | True object factory |
| Stateless utility methods | Module with `extend self` | No instance state to encapsulate |
| Named data with light behavior | Struct or Data | Less boilerplate than a class |
| Immutable value object | Data (3.2+) or frozen Struct | Value semantics and copy-friendly updates |
| Ad-hoc or temporary data | Hash | Smallest possible shape |
| Object named after a pattern | Rethink design | Ruby usually has a simpler construct |
| Object invalid after `.new` | Not a class | Objects must be usable immediately |

## Reference Guides

- [references/class-vs-module.md](references/class-vs-module.md) — Ruby-native replacements for class-heavy pattern names.
- [references/data-structures.md](references/data-structures.md) — when to graduate from `Hash` to `Struct`, `Data`, or `Class`.

## Recommendation Format

When recommending an object shape:
1. Explain the current construct and whether it matches the Object Factory Rule.
2. Recommend the smallest construct that fits the behavior and state involved.
3. Show a before-and-after example when the rewrite is non-trivial.
4. Call out Ruby version constraints and project conventions that affect the choice.

## Related Skills

- `/skill:ruby-refactoring` — Ruby-focused refactoring guidance once the target object shape is clear.
- `/skill:engineering-principles` — Design guidance for cohesion, coupling, and keeping object boundaries small.
- `/skill:find-docs` — Find authoritative Ruby or framework documentation when version details matter.

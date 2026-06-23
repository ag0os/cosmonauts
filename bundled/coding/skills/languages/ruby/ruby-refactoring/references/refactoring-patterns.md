# Ruby Refactoring Patterns

This reference helps choose among Ruby-friendly refactoring moves. For generic refactoring mechanics and safe sequencing, load `/skill:refactoring`.

## Extract Method vs Method Object

Use Extract Method by default.

Escalate to a method object when:
- 4+ local variables interact with each other
- extracted helpers would need 3+ parameters passed between them
- the algorithm deserves its own focused tests

A method object is just a plain Ruby class with one job. Name it after the calculation or workflow it performs.

## Extract Class vs Role Module vs Value Object

| Use | When it fits | Avoid when |
|---|---|---|
| Extract Class | Behavior and state belong together and have one clear owner | You are only relocating one helper used in one place |
| Role module | The same behavior is genuinely shared across 2+ classes and depends on a small host API | The module would only be included once |
| Value object | A domain concept needs invariants, equality, or formatting rules | The data is still just incidental plumbing |

Use `/skill:ruby-object-design` when deciding whether the extracted object should be a `Hash`, `Struct`, `Data`, or full class.

## Move Method vs Delegate

Move a method when it mostly reads another object's data.

Add delegation only after ownership is correct, and only when callers benefit from the convenience. Delegation is not a substitute for fixing misplaced behavior.

## Keyword Arguments vs Parameter Object

Prefer keyword arguments when:
- the parameters are local to one method
- defaults are simple
- the group does not travel across the codebase

Prefer a parameter object when:
- the same argument cluster appears in multiple calls
- the group needs validation or derived data
- the parameter group represents a named concept

## Lookup Table vs Polymorphism

Use a lookup table when the branch selects a value or a single callable and the variant set is small and stable.

Use polymorphism when:
- each variant owns multiple related behaviors
- new variants should be added without editing a central conditional
- the conditional has already spread to 3+ call sites

Keep the lightest tool that removes duplication. A simple hash or lambda table often beats a class hierarchy.

## Composition vs Inheritance

Prefer composition by default. Extract a collaborator object before creating a subclass.

Reach for inheritance only when the substitutability is real: callers can treat every subtype as the same abstraction, and the shared interface is stable.

If the variation is behavioral rather than structural, a collaborator object or strategy object is usually clearer than a subclass tree.

## Framework-Specific Extraction Targets

If the Ruby code lives inside Rails and the refactoring choice is between a service object, concern, STI model, serializer, or policy object, load `/skill:rails-services`, `/skill:rails-models`, and `/skill:rails-architecture`. Those framework-layer trade-offs are intentionally kept out of this Ruby-only reference.

## Namespace Module vs Mixin Module

Use a namespace module to group related classes:

```ruby
module Billing
  class Invoice; end
  class Statement; end
end
```

Use a mixin module only for shared behavior:

```ruby
module Retryable
  def with_retries
    ...
  end
end
```

Do not turn a single class into a namespace-plus-mixin arrangement just to make one file shorter.

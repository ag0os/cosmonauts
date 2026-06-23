# Ruby Code Smells

This reference covers Ruby-native smell interpretation only. Framework-layer smells belong in `/skill:rails-architecture` and `/skill:rails-models`.

## Feature Envy in Plain Ruby Objects

A method smells when it mostly navigates another object's data instead of using its own state.

```ruby
class Shipment
  def delivery_line
    "#{address.street}, #{address.city}, #{address.postcode}"
  end

  private

  def address
    customer.address
  end
end
```

`delivery_line` belongs closer to `Address`. Move the behavior to the object that owns the data, then add delegation only if callers still need the shortcut.

## Long Method with Temporary State

Long Ruby methods usually hide a missing name or a missing object.

Watch for:
- 10-15+ lines with several comments or blank-line-separated phases
- 4+ local variables that feed later calculations
- Conditionals mixed with formatting, parsing, and persistence decisions

Start with Extract Method. Escalate to a method object when the locals themselves form a coherent calculation.

## Large Class and Divergent Change

A class is too large when unrelated edits keep landing in the same file.

Signals:
- Public methods cluster into unrelated topics
- Some methods never touch the same instance variables as the others
- One change request touches parsing, another formatting, another delivery concerns in the same class

Split by reason to change. Extract a collaborator when behavior and state travel together. Extract a mixin only when the role is truly shared across multiple classes.

## Long Parameter Lists and Data Clumps

Repeated argument groups usually mean the data wants a name.

```ruby
def schedule_meeting(start_time, end_time, timezone, attendee_ids)
  ...
end

def reschedule_meeting(start_time, end_time, timezone, attendee_ids)
  ...
end
```

If the same cluster appears across multiple methods or classes, extract a parameter object or value object. Use `/skill:ruby-object-design` to choose the right Ruby construct.

## Primitive Obsession

Raw strings, symbols, arrays, and hashes become a smell when domain rules start orbiting them.

Examples:
- currency codes with formatting rules
- date ranges with overlap rules
- coordinates with validation
- status codes with transition rules

Extract a named object once the value needs invariants, equality semantics, or behavior.

## Duplicated Type or Status Conditionals

Repeated branching on `type`, `kind`, or `status` across multiple call sites is a smell.

```ruby
case notification.kind
when :email then EmailSender.new(notification).call
when :sms then SmsSender.new(notification).call
end
```

A single lookup table is fine for trivial value-to-result mapping. Refactor when the same dispatch logic appears in 3+ places or each branch grows its own behavior.

## Shotgun Surgery Between Collaborators

A change request should have one obvious home. If every small rule change forces edits in a parser, validator, formatter, and notifier, the ownership boundary is wrong.

Refactor by moving the rule to the object that represents the concept, then let the surrounding collaborators ask that object instead of recomputing the rule independently.

If the same change crosses Rails models, controllers, views, serializers, or jobs, move to `/skill:rails-architecture` for the framework-layer version of this smell.

## When to Escalate Severity

Raise the priority of a smell when:
- the same file appears repeatedly in recent changes
- the class needs large test setup before you can exercise one method
- developers keep duplicating the same rule in neighboring objects
- the smell sits on a hot path or high-risk business rule

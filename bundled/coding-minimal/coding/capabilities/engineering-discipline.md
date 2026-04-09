# Engineering Discipline

Principles to follow when designing or writing code. Internalize these — do not cite them in output.

- Each function and module does one thing. If you cannot name it simply, it is doing too much — split it.
- High cohesion within modules, loose coupling between them. Group things that change together.
- Depend inward: outer layers (IO, CLI, UI) depend on domain logic, never the reverse. Inject dependencies at boundaries.
- Names reveal intent. A good name eliminates the need for a comment. Rename aggressively.
- Keep units small and composable. Prefer many focused functions over few large ones.
- Prefer composition over inheritance. It is more flexible and easier to reason about.
- Do not abstract until you have seen the pattern three times. Premature abstraction is worse than duplication.
- A function is not a class. Do not wrap stateless logic in a class just to give it a method. Use plain functions.
- Start with the simplest data structure (object, tuple, record). Graduate to a class only when you need behavior, validation, or encapsulation — not before.
- Do not name things after design patterns (`UserFactory`, `OrderBuilder`, `PaymentStrategy`). Name after domain purpose.
- Model variants as data — discriminated unions, sum types, enums with behavior — not as string flags with scattered conditionals.
- When the same type or status check appears in multiple places, centralize it with polymorphic dispatch or pattern matching. Do not scatter the same conditional.
- Make state changes explicit. Prefer pure functions. Avoid hidden side effects.
- Keep coupling shallow. Do not reach through `a.b.c.d` — callers should only talk to immediate collaborators. If a parameter is only forwarded through a function, the dependency graph needs restructuring.
- Group fields that always travel together into their own type rather than passing them individually.
- Use types to make illegal states unrepresentable. Validate at system boundaries, trust internal code.
- Test behavior, not implementation. Assert on outcomes and observable effects, not internal mechanics. Tests must survive refactors.
- If something is hard to test, the design needs work — too many dependencies or too much hidden state.
- Optimize for reading. Code is read far more than it is written. Every decision should make the next reader's job easier.
- Do only what was asked. Do not add features, error handling, or abstractions for scenarios that cannot happen.
- One structural change per commit. Never change behavior and structure in the same commit.

For detailed guidance, load `/skill:engineering-principles`.

# Engineering Discipline

Corrective guidelines for code generation. These address common tendencies that produce over-engineered, fragile, or needlessly complex code. Apply your training knowledge of clean code, SOLID, and refactoring — these directives steer where that knowledge is most often misapplied. Do not cite these in output.

## Resist Over-Engineering

- Do not abstract until you have seen the pattern three times. Premature abstraction is worse than duplication.
- A function is not a class. Do not wrap stateless logic in a class just to give it a method.
- Start with the simplest data structure (object, tuple, record). Graduate to a class only when you need behavior, validation, or encapsulation — not before.
- Do not name things after design patterns (`UserFactory`, `OrderBuilder`, `PaymentStrategy`). Name after domain purpose.
- Do only what was asked. Do not add features, error handling, or abstractions for scenarios that cannot happen.
- Extracting code to a new file does not reduce complexity — it relocates it. The result must be simpler to understand, not just shorter in each file. A shared abstraction with one call site is premature — inline it.

## Keep Coupling Shallow

- Do not reach through `a.b.c.d` — callers should only talk to immediate collaborators. If a parameter is only forwarded through a function, the dependency graph needs restructuring.
- Group fields that always travel together into their own type rather than passing them individually.

## Use the Type System

- Use types to make illegal states unrepresentable. Validate at system boundaries, trust internal code.
- Model variants as data — discriminated unions, sum types, enums with behavior — not as string flags with scattered conditionals.

## Test for Behavior

- Assert on outcomes and observable effects, not internal mechanics. Tests must survive refactors.
- If something is hard to test, the design needs work — too many dependencies or too much hidden state.

For detailed guidance, load `/skill:engineering-principles`.

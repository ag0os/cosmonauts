# Engineering Discipline

Principles to follow when designing or writing code. Internalize these — do not cite them in output.

- Each function and module does one thing. If you cannot name it simply, it is doing too much — split it.
- High cohesion within modules, loose coupling between them. Group things that change together.
- Depend inward: outer layers (IO, CLI, UI) depend on domain logic, never the reverse. Inject dependencies at boundaries.
- Names reveal intent. A good name eliminates the need for a comment. Rename aggressively.
- Keep units small and composable. Prefer many focused functions over few large ones.
- Prefer composition over inheritance. It is more flexible and easier to reason about.
- Do not abstract until you have seen the pattern three times. Premature abstraction is worse than duplication.
- Make state changes explicit. Prefer pure functions. Avoid hidden side effects.
- Use types to make illegal states unrepresentable. Validate at system boundaries, trust internal code.
- If something is hard to test, the design needs work — too many dependencies or too much hidden state.
- Optimize for reading. Code is read far more than it is written. Every decision should make the next reader's job easier.
- Do only what was asked. Do not add features, error handling, or abstractions for scenarios that cannot happen.

For detailed guidance, load `/skill:engineering-principles`.

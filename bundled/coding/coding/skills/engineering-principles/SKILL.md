---
name: engineering-principles
description: Software engineering principles for maintainable, extensible code. Design guidance for boundaries, naming, dependencies, composition, and managing complexity.
---

# Engineering Principles

Deep reference for writing maintainable, extensible, well-organized code. Load this when making design decisions, reviewing code quality, or planning architecture.

## Cohesion and Coupling

**Cohesion** measures how strongly related the elements within a module are. High cohesion means everything in a module serves a single, clear purpose.

**Coupling** measures how much modules depend on each other's internals. Loose coupling means modules interact through narrow, well-defined interfaces.

The goal: modules that are self-contained (high cohesion) and interact through stable contracts (loose coupling). When you change one module, you should rarely need to change another.

Practical checks:
- If a change to one file forces changes in many others, coupling is too tight.
- If a module mixes unrelated responsibilities (e.g., HTTP handling and business rules), cohesion is too low.
- If you cannot describe what a module does in one sentence without "and", it is doing too much.
- If a single feature change touches 4+ files across layers, the related logic is too scattered. Colocate things that change together.

### Coupling Depth

Keep coupling shallow. Callers should only talk to immediate collaborators:

- Do not reach through `a.b.c.d`. If you need something deep in a collaborator's structure, the collaborator should expose it directly.
- Do not pass parameters through functions just to relay them to a callee. If a parameter is only forwarded, the dependency graph needs restructuring — the caller should talk to the dependency directly, or the dependency should be injected closer to where it is used.
- Group fields that always travel together into their own type rather than passing them individually. If three arguments always appear as a triple, they are a concept — name it.

## Small, Composable Units

**Functions**: 5–20 lines is a sweet spot. A function should do one thing at one level of abstraction. If it scrolls, look for extraction points.

**Files/modules**: When a file exceeds ~300 lines, look for natural seams. Types that are used together, functions that call each other — these suggest a module boundary.

**Parameters**: When a function takes 3+ parameters, use an options object. This is self-documenting and order-independent.

**Data structures**: Start with the simplest structure (hash/dict, tuple, plain object). Graduate to a class only when you need behavior, validation, or encapsulation — not before. A function is not a class: do not wrap stateless logic in a class just to give it a method.

**Composition**: Build complex behavior by combining simple, focused pieces. A pipeline of `validate → transform → persist` is easier to understand and test than one function that does all three.

## Naming as Design

Good names are the cheapest documentation:
- Functions: verb + noun describing the action and target (`calculateShippingCost`, `parseTaskFile`)
- Booleans: `is`/`has`/`should` prefix (`isValid`, `hasPermission`)
- Collections: plural nouns (`tasks`, `activeUsers`)
- Transformations: `toX`/`fromX` (`toJSON`, `fromMarkdown`)

If you struggle to name something, the design is likely unclear. Naming difficulty is a design signal — refactor the concept until the name is obvious.

Avoid: generic names (`data`, `result`, `item`, `handle`, `process`, `manager`), abbreviations that save a few characters but cost clarity, names that describe implementation instead of intent, and names that are design-pattern labels (`UserFactory`, `OrderBuilder`, `PaymentStrategy`). Name after domain purpose, not the pattern you used.

## Dependency Direction

Code should be organized in layers, with dependencies pointing inward:

```
Outer (infrastructure)  →  Inner (domain logic)
CLI, HTTP, DB adapters  →  Business rules, types, pure functions
```

**Rules:**
- Domain logic never imports from infrastructure. It defines interfaces that infrastructure implements.
- Each layer can only depend on layers below (more abstract) it, never above (more concrete).
- Side effects (IO, network, filesystem) live at the edges. The core is pure.

**Dependency injection**: Pass dependencies as parameters or constructor arguments rather than importing them directly. This makes code testable and swappable.

```
Bad:  import { db } from "./database";  // hard-coded dependency
Good: function createUser(store: UserStore, data: UserInput)  // injected
```

## Explicit Over Implicit

- Prefer pure functions (same input → same output, no side effects). They are trivial to test and reason about.
- Make state transitions visible. If a function changes state, its name and signature should make that obvious.
- Avoid action at a distance — when code in module A silently affects module B through shared mutable state.
- Return values instead of mutating arguments. If mutation is necessary, document it in the function name (`sortInPlace`, `resetCounter`).

## Designing for Change

Not all code changes at the same rate. Identify the **seams** — the points where change is most likely — and make those flexible:

- Configuration changes → externalize as config, not code changes.
- New variants of existing behavior → model variants as data (discriminated unions, sum types, enums with behavior) rather than string flags with scattered conditionals. When the same type or status check appears in multiple places, centralize it with polymorphic dispatch or pattern matching.
- New features → ensure the module boundary allows addition without modification (open-closed at the module level).

**But**: only invest in flexibility where you have evidence of change. Do not speculatively generalize. The wrong abstraction is harder to fix than no abstraction.

## Testing Principles

### Test Behavior, Not Implementation

The most important testing principle: assert on **what** the code does, not **how** it does it. A test that breaks when you rename an internal function, change a config shape, or reorder private steps is testing implementation — it creates drag without catching real bugs.

**What to assert:**
- Return values and output state — the observable result of calling the public API.
- Side effects at boundaries — did it write the file, send the request, emit the event?
- Error conditions — does it reject invalid input with the right category of error?

**What NOT to assert:**
- Internal function call order or call counts (unless order is the contract).
- Exact error message strings when the contract is just "throws an error".
- Private state or intermediate values that aren't part of the public surface.
- Specific implementation choices (which internal helper was called, which branch was taken).

**The refactor test:** if you can refactor the implementation without changing observable behavior and a test breaks, that test is coupled to implementation. Fix the test.

### Test Through the Public API

Don't test private methods directly. Test them through the public functions that use them. If a code path is unreachable through the public API, it's dead code — delete it, don't test it.

This means: one test file per module, exercising the module's exports. Not one test per internal function.

### Mock Boundaries, Not Internals

Mock at the edges of your system — external services, filesystem, network, databases. Do not mock your own modules or internal functions. When tests mock internals:
- They break on every refactor.
- They test the wiring, not the behavior.
- They can pass even when the real integration is broken.

```
Bad:  mock(internalParser).toReturn(fakeResult)    // coupled to implementation
Good: mock(fileSystem.readFile).toReturn(testData)  // mocking a boundary
```

If you need to mock an internal module, that's a design signal — the boundary between modules is unclear.

### Write Resilient Test Assertions

- Use `toContain` / `toMatchObject` over exact equality when only part of the result matters.
- Assert on structural properties (`expect(result).toHaveProperty("id")`) rather than snapshot-matching entire objects that include volatile fields.
- Name tests after the behavior they verify: "rejects expired tokens", "returns empty list when no tasks match" — not "test1" or "calls validateToken".

### Testing as Design Feedback

Tests are the first consumer of your API. Listen to what they tell you:

- **Hard to construct**: the object has too many dependencies. Simplify or inject them.
- **Hard to invoke**: the function signature is too complex. Decompose it.
- **Hard to assert**: the function does too much or returns too little. Separate concerns.
- **Requires extensive mocking**: the code is too coupled to infrastructure. Introduce a boundary.

When tests are easy to write, the design is usually good. When they are painful, listen to the pain.

### Characterization Tests

Before refactoring code that lacks test coverage, write characterization tests first. These tests capture the current behavior — right or wrong — so you can refactor with confidence that you are preserving it. Only after the characterization tests are green should you change the structure.

## Managing Complexity

- **YAGNI** (You Aren't Gonna Need It): do not build for hypothetical future requirements. Build for today, refactor when the need is real.
- **Rule of Three**: tolerate duplication until you see three instances. Then the real pattern is visible and the abstraction will be correct.
- **Duplication nuance**: same code is not always real duplication. If two blocks look identical but would change for different reasons, leave them separate. When duplication is real, extract it — but do not DRY across module or service boundaries just to eliminate surface similarity. Cross-boundary extraction creates coupling that is worse than the duplication it removes.
- **Composition over inheritance**: inheritance creates rigid hierarchies. Composition (mixing behaviors via functions, interfaces, delegation) keeps things flexible.
- **Fewer moving parts**: every abstraction, layer, and indirection has a cost. The right amount of complexity is the minimum needed for the current requirements.
- **Delete freely**: unused code is not an asset, it is a liability. Version control remembers everything. Remove dead code, dead parameters, dead branches.

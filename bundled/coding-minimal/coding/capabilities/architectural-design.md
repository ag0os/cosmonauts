# Architectural Design

Discipline for agents that design solutions others will implement. Workers execute tasks in isolation — they cannot see the full picture. Your plan must carry the architectural intent explicitly enough that independent workers produce code that coheres into a well-designed system.

## Design the Structure

Before writing the plan, answer these questions about the code you are introducing or changing:

**Module boundaries** — What are the distinct responsibilities? Each module should have one reason to change. If you cannot describe a module's purpose in one sentence without "and", it is doing too much. Group things that change together; separate things that change for different reasons.

**Dependency direction** — Which modules depend on which? Dependencies must point inward: infrastructure (CLI, HTTP, filesystem, database) depends on domain logic, never the reverse. Domain logic defines interfaces; infrastructure implements them. If a new module needs IO, it accepts an interface — it does not import the IO layer directly.

**Contracts between components** — What types, interfaces, or data shapes must independent workers agree on? Define these explicitly. When two tasks will produce code that must interoperate, the plan must specify the shared contract (function signatures, type definitions, data formats) so both workers build to the same boundary. Do not leave contracts implicit — workers cannot coordinate.

**Seams for change** — Which parts of this design are likely to evolve? Where requirements are uncertain or extension is foreseeable, design the boundary to allow addition without modification: strategy patterns, discriminated unions, plugin interfaces, configuration-driven behavior. But only invest in flexibility where there is evidence of change — do not speculatively generalize.

**Stable core vs. volatile edges** — Identify what is unlikely to change (core data structures, fundamental domain rules) versus what will change (configuration, presentation, integration points). The stable core should be simple, well-tested, and depended upon. The volatile edges should be isolated so changes do not ripple inward.

## Prescribe, Do Not Suggest

Workers follow the plan literally. Vague architectural guidance produces inconsistent code. Be specific:

- **Name the modules.** "Create a `lib/auth/` module with `types.ts`, `validator.ts`, and `session.ts`" — not "add an auth layer."
- **State the dependency rule.** "The `validator` imports from `types` only. It must not import from `session` or any infrastructure module" — not "keep things loosely coupled."
- **Define the contracts.** Show the interface signature, type definition, or data shape that workers must implement against. Short code snippets for interfaces and types are expected and encouraged in plans.
- **Specify composition strategy.** "The pipeline composes as `validate → transform → persist`, each a pure function taking and returning a `Result<T>`" — not "use a pipeline pattern."

## Paradigm-Agnostic Principles

These apply whether the codebase is object-oriented, functional, or mixed:

- **Cohesion over convention.** Group by what changes together, not by technical category. A feature module containing its types, logic, and tests is often better than scattering types in `types/`, logic in `services/`, and tests in `tests/`. If a single feature change would touch 4+ files across layers, the related logic is too scattered — colocate it.
- **Variants as data.** Model variants as data — discriminated unions, sum types, enums with behavior — not as string flags with scattered conditionals. When the same type or status check would appear in multiple places, centralize it with polymorphic dispatch or pattern matching.
- **Composition over inheritance.** Combine focused behaviors through functions, interfaces, or delegation. Avoid deep hierarchies that create rigid coupling.
- **Explicit over implicit.** Prefer pure functions, explicit parameters, and visible state transitions. Avoid action at a distance through shared mutable state or hidden side effects.
- **Small surface area.** Export only what consumers need. A module's public API should be the minimum necessary for its purpose. Internal helpers stay internal.

## Architectural Checklist

Before finalizing the plan, verify:

- [ ] Every new module has a stated single responsibility
- [ ] Dependency direction is inward — no domain module imports infrastructure
- [ ] Contracts between components that different workers will implement are explicitly defined (types, interfaces, data shapes)
- [ ] Parts likely to change are isolated behind stable interfaces
- [ ] The plan is specific enough that a worker seeing only their task can produce code that fits the whole

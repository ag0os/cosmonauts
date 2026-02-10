---
name: typescript
description: TypeScript best practices and patterns. Load for TypeScript projects.
---

# TypeScript

You are working on a TypeScript project. Follow these guidelines for all code you write.

## Discover Project Conventions First

Before writing any code, read the project's configuration to understand its setup:

1. **tsconfig.json** -- module system (`NodeNext` vs `ESNext` vs `bundler`), target, strict settings, path aliases.
2. **package.json** -- `"type": "module"` or not, scripts, test runner, existing dependencies.
3. **Linter/formatter config** (biome.json, .eslintrc, .prettierrc) -- follow whatever the project uses.
4. **Existing source files** -- match naming conventions (kebab-case, camelCase, etc.), import style, file organization, indentation.

Match what you find. Do not introduce new conventions.

## Module System

Prefer ESM. Only use CommonJS if the project requires it.

```typescript
// ESM (preferred)
import { Thing } from "./thing.ts";
import type { Config } from "./config.ts";
export function doWork(): void { ... }

// CommonJS (only if the project already uses it)
const { Thing } = require("./thing");
module.exports = { doWork };
```

**Import rules**:

- Use `import type` for type-only imports to ensure they are erased at runtime.
- Check whether the project includes `.ts` extensions in relative imports (`allowImportingTsExtensions`) or omits them. Match what you see.
- Group imports: external packages first, then internal modules, then type-only imports.
- Prefer named exports over default exports unless the project convention says otherwise.

## Type Safety

Write code that passes `strict` mode. Even if the project has not enabled every strict flag, write as if it has -- stricter code is always compatible with less strict settings, but not the reverse.

### Use precise types

Model your domain with specific types rather than broad primitives:

```typescript
// Good: string literal union
type Status = "idle" | "loading" | "done" | "error";

// Good: discriminated union
type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

// Bad: lose information
type Status = string;
```

Why: precise types catch misuse at compile time. A function that accepts `Status` rejects `"bogus"` at the call site. A function that accepts `string` does not.

### Avoid `any`

Use `unknown` when the type is genuinely not known, then narrow before use:

```typescript
function parse(input: unknown): Config {
  if (typeof input !== "object" || input === null) {
    throw new Error("Expected object");
  }
  // narrow further...
}
```

Why: `any` disables type checking for everything it touches. It spreads silently -- a single `any` in a function signature can make downstream code unchecked. `unknown` forces you to prove the type is safe before using it.

### Narrow instead of assert

```typescript
// Good: type guard -- proves the type at runtime
function isUser(value: unknown): value is User {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "name" in value
  );
}

// Acceptable: assertion when you control both sides
const id = map.get(key) as string; // only if you know the key exists

// Bad: blind assertion -- no runtime check
const user = data as User;
```

Why: `as` assertions tell the compiler to trust you unconditionally. If you are wrong, the error surfaces at runtime as a confusing property-access failure far from the assertion. Type guards move the check to the boundary where the data enters.

### Additional type rules

- Prefer `interface` for object shapes that may be extended, `type` for unions, intersections, and computed types.
- Use `readonly` for data that should not be mutated after creation.
- Use `satisfies` to validate that a value matches a type without widening the inferred type.
- Prefer `as const` objects over enums -- they are erasable, produce literal types, and work with standard JavaScript tooling.
- Handle `undefined` from indexed access. If the project uses `noUncheckedIndexedAccess`, array and record lookups return `T | undefined` -- check before using the value.

## Error Handling

Use typed errors. Custom error classes or discriminated result types make error handling exhaustive and self-documenting:

```typescript
// Custom error class with a discriminant
class NotFoundError extends Error {
  readonly code = "NOT_FOUND" as const;
  constructor(public readonly entityId: string) {
    super(`Not found: ${entityId}`);
    this.name = "NotFoundError";
  }
}

// Result pattern for expected failures
type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };
```

Why: untyped `catch (e)` gives you `unknown`. Typed error classes let you narrow with `instanceof`. Result types make the caller handle the failure path explicitly -- it cannot be ignored the way a thrown exception can.

Only catch errors you can handle. Let unexpected errors propagate. Do not silently swallow errors with empty `catch` blocks.

## Functions and Parameters

- Use explicit return types on exported functions and public APIs. Internal helpers can rely on inference.
- Use an options object for functions with more than 3 parameters.
- Prefer `readonly` array parameters (`readonly string[]`) when the function does not mutate them.

```typescript
// Options object for complex parameters
interface SearchOptions {
  query: string;
  status?: Status;
  limit?: number;
}
export function search(options: SearchOptions): Item[] { ... }

// Simple parameters for simple functions
export function getById(id: string): Item | undefined { ... }
```

Why: explicit return types on public APIs prevent accidental signature changes. Options objects are self-documenting at call sites and easily extended without breaking callers.

## Async Code

- Always handle promise rejections. Never fire and forget an unhandled promise.
- Use `async`/`await` over `.then()` chains for readability.
- Use `Promise.all()` for independent concurrent operations, `Promise.allSettled()` when partial failure is acceptable.
- Prefer `AbortSignal` for cancellation over custom mechanisms.

## Testing

Identify the project's test runner (Vitest, Jest, node:test, etc.) by reading `package.json` scripts and devDependencies. Use that runner, not a different one.

**Testing principles** (framework-agnostic):

- **Test behavior, not implementation.** Assert observable outcomes. Do not assert internal state or call counts unless the behavior under test *is* the interaction.
- **One concept per test.** Multiple assertions are fine if they verify the same behavior. Split unrelated assertions into separate tests.
- **Descriptive names.** State what is being tested and the expected result: `"returns undefined for missing keys"`, not `"test1"`.
- **Isolate tests.** Each test gets fresh setup via `beforeEach`. Do not share mutable state between tests.
- **Use temp directories** for filesystem tests. Clean up in `afterEach`.
- **Minimize mocking.** Mock external services and I/O boundaries. Do not mock the code under test or its direct collaborators -- that tests your mocks, not your code.

## Reference Guides

For advanced topics, read the relevant reference file:

| Topic | Reference | When to Load |
|-------|-----------|--------------|
| Type Patterns | `references/type-patterns.md` | Generics, conditional types, mapped types, branded types, template literals |
| Testing Patterns | `references/testing-patterns.md` | Test structure, mocking strategies, async testing, parameterized tests |

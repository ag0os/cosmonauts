# Testing Standards

Guidelines for writing and maintaining tests in Cosmonauts. All tests use [Vitest](https://vitest.dev/) and run with `bun run test`.

## Project Setup

- **Config**: `vitest.config.ts` at repo root.
- **Setup file**: `tests/setup.ts` — runs before every test file. Restores mocks and reverts fake timers in `afterEach` so individual tests do not need to.
- **Coverage**: V8 provider, scoped to `lib/**`. Run with `bun run test -- --coverage`.

## Canonical Test Structure

```ts
/**
 * Tests for <module>.
 * Brief summary of what is covered.
 */

import { describe, expect, test } from "vitest";
import { myFunction } from "../../lib/<module>.ts";

describe("myFunction", () => {
  test("returns expected value for normal input", () => {
    expect(myFunction("hello")).toBe("HELLO");
  });

  test("returns undefined for missing input", () => {
    expect(myFunction(undefined)).toBeUndefined();
  });
});
```

### Conventions

- **One concept per test.** Each `test()` verifies a single behavior.
- **Descriptive names.** Use plain-English descriptions of the expected outcome: `"returns undefined for missing keys"`, not `"test1"`.
- **Mirror source structure.** Tests for `lib/tasks/task-parser.ts` live in `tests/tasks/task-parser.test.ts`.
- **Use `describe` blocks** to group related tests by function, method, or scenario.
- **Imports**: use `import type` for type-only imports. Include `.ts` extensions in relative imports to source code (Vitest resolves them).

## Mock Strategy Order

Prefer the simplest approach that gives adequate isolation. Listed from most preferred to least:

1. **Real implementations.** Use real code when it is fast, deterministic, and side-effect-free. This is always the first choice.
2. **Plain objects / stubs.** Hand-craft a minimal object that satisfies the interface. Good for simple dependencies.
3. **`vi.fn()` spies.** Use when you need to assert call counts, arguments, or provide per-test return values.
4. **`vi.spyOn()`** for observing or overriding a method on a real object without replacing the whole module.
5. **`vi.mock()` module mocks.** Use as a last resort when a module has side effects or deep dependency chains that cannot be injected. Declare at the top of the file (Vitest hoists them).

### Guidelines

- Always restore mocks after use. The global setup file (`tests/setup.ts`) calls `vi.restoreAllMocks()` in `afterEach`, so manual cleanup is only needed in `beforeEach` or within a test.
- Prefer dependency injection over module mocking. If a function accepts its collaborators as parameters, pass test doubles directly.
- When using `vi.mock()`, co-locate the mock setup near the top of the file with a clear comment explaining what is mocked and why.

## Parameterized Tests

Use `test.each` for testing the same logic with multiple inputs:

```ts
test.each([
  { input: "To Do", expected: true },
  { input: "Done", expected: false },
  { input: "Invalid", expected: false },
])("isActionable returns $expected for $input", ({ input, expected }) => {
  expect(isActionable(input)).toBe(expected);
});
```

### When to use

- Three or more similar assertions that differ only by input/output.
- Boundary value testing (empty string, zero, negative, max length).
- Status/enum validation across all valid and invalid values.

### When not to use

- Two cases — just write two `test()` calls; `test.each` adds indirection for no benefit.
- Tests with different setup or assertions — they are not truly parameterized.

## Fake Timers

Use `vi.useFakeTimers()` when testing code that depends on `setTimeout`, `setInterval`, `Date.now()`, or similar time-based APIs.

```ts
test("retries after delay", async () => {
  vi.useFakeTimers();

  const promise = retryWithBackoff(action);
  await vi.advanceTimersByTimeAsync(1000);
  const result = await promise;

  expect(result).toBe("ok");
  // No need to call vi.useRealTimers() — the global setup handles it.
});
```

### Guidelines

- **Only use when necessary.** If the code under test does not use timers, do not install fake timers.
- **Prefer `vi.advanceTimersByTimeAsync`** over `vi.advanceTimersByTime` when the code uses `async`/`await` or Promises — the async variant flushes microtasks correctly.
- The global setup file reverts to real timers in `afterEach`, so you do not need to call `vi.useRealTimers()` manually.

## Filesystem Tests

When tests create files or directories:

- Use `mkdtemp` to create a unique temporary directory.
- Clean up in `afterEach` with `rm(dir, { recursive: true })`.
- Use `join` from `node:path` for all path construction — never string concatenation.

```ts
let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "test-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true });
});
```

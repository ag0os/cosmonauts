# Testing Standards

Guidelines for writing and maintaining tests in Cosmonauts. All tests use [Vitest](https://vitest.dev/) and run with `bun run test`.

## Project Setup

- **Config**: `vitest.config.ts` at repo root.
- **Setup file**: `tests/setup.ts` — runs before every test file. Restores mocks and reverts fake timers in `afterEach` so individual tests do not need to.
- **Coverage**: V8 provider, scoped to `lib/**`. Run with `bun run test:coverage`. See [Coverage Thresholds](#coverage-thresholds) below.

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

### `vi.hoisted()` for Module-Level Mocks

When using `vi.mock()`, declare mock references with `vi.hoisted()` so the hoisting intent is explicit. This avoids relying on Vitest's implicit `vi.mock()` hoisting and keeps mock setup centralized at the top of the file.

```ts
import { describe, expect, test, vi } from "vitest";
import type { MyDep } from "../../lib/my-dep.ts";

// 1. Declare mock references in a hoisted block — runs before imports.
const mocks = vi.hoisted(() => ({
  myFunction: vi.fn(),
  myOtherFunction: vi.fn(),
}));

// 2. Wire mocks into module replacements.
vi.mock("../../lib/my-dep.ts", () => ({
  myFunction: mocks.myFunction,
  myOtherFunction: mocks.myOtherFunction,
}));

// 3. Import the mocked modules (resolved to the mocks above).
import { myFunction, myOtherFunction } from "../../lib/my-dep.ts";

describe("consumer", () => {
  // Use vi.mocked() for typed access in assertions, or reference
  // the hoisted mocks directly — both work.
  const myFunctionMock = vi.mocked(myFunction);

  test("calls myFunction", () => {
    myFunctionMock.mockReturnValue("stubbed");
    // ...
    expect(mocks.myFunction).toHaveBeenCalled(); // also works
  });
});
```

For mutable mock state that changes per-test (e.g., a mock module returns different objects), use a ref wrapper:

```ts
const refs = vi.hoisted(() => ({
  currentSpawner: undefined as MySpawner | undefined,
}));

vi.mock("../../lib/spawner.ts", () => ({
  createSpawner: () => refs.currentSpawner,
}));

beforeEach(() => {
  refs.currentSpawner = createMockSpawner();
});
```

### Guidelines

- Always restore mocks after use. The global setup file (`tests/setup.ts`) calls `vi.restoreAllMocks()` in `afterEach`, so manual cleanup is only needed in `beforeEach` or within a test.
- Prefer dependency injection over module mocking. If a function accepts its collaborators as parameters, pass test doubles directly.
- When using `vi.mock()`, co-locate the mock setup near the top of the file with a clear comment explaining what is mocked and why. Use `vi.hoisted()` for any mock references needed before imports.

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

### Testing Timestamp Differences

Use `vi.setSystemTime()` to control `new Date()` and `Date.now()` deterministically instead of inserting real-time sleeps:

```ts
test("updates the updatedAt timestamp", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

  const created = await createItem();

  vi.setSystemTime(new Date("2026-01-01T00:01:00Z"));
  const updated = await updateItem(created.id);

  expect(updated.updatedAt.getTime()).toBeGreaterThan(created.updatedAt.getTime());
});
```

### Guidelines

- **Only use when necessary.** If the code under test does not use timers, do not install fake timers.
- **Use `vi.setSystemTime()`** for tests that assert on timestamp ordering or `Date.now()` values — avoids flaky real-time sleeps.
- **Prefer `vi.advanceTimersByTimeAsync`** over `vi.advanceTimersByTime` when the code uses `async`/`await` or Promises — the async variant flushes microtasks correctly.
- The global setup file reverts to real timers in `afterEach`, so you do not need to call `vi.useRealTimers()` manually.

## Coverage Thresholds

Coverage thresholds are enforced in `vitest.config.ts` and checked when running `bun run test:coverage`. The build fails if any metric drops below its gate.

### Current Baseline (March 2026)

| Metric     | Threshold | Measured |
|------------|-----------|----------|
| Statements | 65%       | ~71%     |
| Branches   | 85%       | ~89%     |
| Functions  | 55%       | ~61%     |
| Lines      | 65%       | ~71%     |

Thresholds are set ~5–6 points below measured values to allow normal fluctuation without false failures.

### Ratchet Strategy

As coverage improves, ratchet thresholds upward:

1. After adding tests that meaningfully increase a metric, raise the threshold to ~5 points below the new measured value.
2. Never lower a threshold unless code is intentionally removed or restructured.
3. Review thresholds quarterly or after major refactors.
4. Target trajectory: statements/lines → 75% by mid-2026, functions → 65%.

### Running Coverage

```bash
# Run tests with coverage report and threshold enforcement
bun run test:coverage

# Equivalent manual invocation
bun run test -- --coverage
```

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

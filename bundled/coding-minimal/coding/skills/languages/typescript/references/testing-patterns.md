# Testing Patterns

Reference guide for testing TypeScript code. Load when writing or modifying tests.

Check the project's test runner before writing tests. Common runners: Vitest, Jest, node:test. The examples below use `describe`/`it`/`expect` syntax (shared by Vitest and Jest). Adapt to whatever the project uses.

## Test Structure

```typescript
describe("ModuleName", () => {
  describe("methodName", () => {
    it("describes expected behavior", () => {
      // arrange
      const input = createInput();

      // act
      const result = module.method(input);

      // assert
      expect(result).toBe(expected);
    });

    it("handles edge case", () => {
      expect(() => module.method(null)).toThrow("Expected non-null");
    });
  });
});
```

**Naming**: Use `it("verbs the thing", ...)`. Describe what the code does, not how:

```typescript
// Good
it("returns undefined for missing keys", ...);
it("throws when input exceeds max length", ...);
it("creates task with default status To Do", ...);

// Bad
it("test1", ...);
it("should work", ...);
it("calls validateInput then processData then formatOutput", ...);
```

## Setup and Teardown

```typescript
import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("FileBasedManager", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes to the configured directory", async () => {
    const manager = new Manager(tmpDir);
    await manager.save({ id: "1", data: "test" });

    const files = readdirSync(tmpDir);
    expect(files).toHaveLength(1);
  });
});
```

**Rules**:

- Use `beforeEach` over `beforeAll` unless setup is expensive and truly shared.
- Always clean up in `afterEach` -- temp dirs, open handles, global state.
- Do not share mutable state between tests. Each test gets a fresh setup.

## Assertions

```typescript
// Equality
expect(value).toBe(primitive);           // strict equality (===)
expect(obj).toEqual(expected);           // deep equality
expect(obj).toStrictEqual(expected);     // deep equality + no extra properties

// Truthiness
expect(value).toBeTruthy();
expect(value).toBeFalsy();
expect(value).toBeNull();
expect(value).toBeUndefined();
expect(value).toBeDefined();

// Numbers
expect(num).toBeGreaterThan(3);
expect(num).toBeCloseTo(0.3, 5);

// Strings
expect(str).toMatch(/pattern/);
expect(str).toContain("substring");

// Arrays and objects
expect(arr).toContain(item);
expect(arr).toHaveLength(3);
expect(obj).toHaveProperty("key", value);

// Errors
expect(() => fn()).toThrow();
expect(() => fn()).toThrow("specific message");
expect(() => fn()).toThrow(SpecificError);

// Async errors
await expect(asyncFn()).rejects.toThrow("message");
```

## Async Testing

```typescript
// Async/await (preferred)
it("fetches data", async () => {
  const result = await fetchData();
  expect(result).toBeDefined();
});

// Promise rejection
it("rejects on invalid input", async () => {
  await expect(fetchData("bad")).rejects.toThrow("Invalid");
});

// Timeouts for slow operations (syntax varies by runner)
it("completes within time limit", async () => {
  const result = await processLargeFile(path);
  expect(result.success).toBe(true);
}, 10_000); // 10s timeout -- Vitest/Jest syntax
```

## Mocking

Use mocking sparingly. Prefer real implementations. Mock only at I/O boundaries:

- External HTTP APIs
- File system operations that are slow or have side effects
- Time-dependent code (fake timers)
- Expensive computations in unrelated modules

The mocking API varies by runner. Below are the common patterns:

**Vitest**:
```typescript
import { vi } from "vitest";
vi.mock("./http-client", () => ({
  fetchJson: vi.fn().mockResolvedValue({ id: 1 }),
}));
const spy = vi.spyOn(obj, "method");
vi.useFakeTimers();
vi.advanceTimersByTime(5000);
vi.useRealTimers();
```

**Jest**:
```typescript
jest.mock("./http-client", () => ({
  fetchJson: jest.fn().mockResolvedValue({ id: 1 }),
}));
const spy = jest.spyOn(obj, "method");
jest.useFakeTimers();
jest.advanceTimersByTime(5000);
jest.useRealTimers();
```

Check the project's existing tests for mock patterns before writing your own.

## Snapshot Testing

Use sparingly -- only for stable output formats like serialized configs or error messages:

```typescript
it("serializes to expected format", () => {
  const output = serialize(data);
  expect(output).toMatchInlineSnapshot(`"expected output here"`);
});
```

Prefer explicit assertions over snapshots. Snapshots hide what matters and create brittle tests that break on formatting changes.

## Test Organization

```
src/
  tasks/
    task-manager.ts
    task-manager.test.ts       # co-located test

# or

src/
  tasks/
    task-manager.ts
  __tests__/
    task-manager.test.ts       # separate test directory
```

Match whatever convention the project already uses.

## Parameterized Tests

```typescript
it.each([
  { input: "valid", expected: true },
  { input: "also-valid", expected: true },
  { input: "", expected: false },
  { input: null, expected: false },
])("validates $input -> $expected", ({ input, expected }) => {
  expect(isValid(input)).toBe(expected);
});
```

## TypeScript-Specific Testing

### Keep the Type System Engaged

The most common testing mistake in TypeScript is escaping the type system with `any` or `as unknown as X` to make test data easier to construct. This defeats the purpose -- when the production type changes, untyped test data silently drifts and tests pass against stale shapes.

**Principle**: All test data (fixtures, mocks, factory return values) should be typed against the production types. Use `satisfies` for fixtures to validate the shape without widening, so the compiler catches drift immediately. If constructing valid test data is painful, that is design feedback -- the type has too many required fields or the constructor is too complex.

### Type Mock Return Values

When mocking a function or module, use the test runner's type parameter support to type the mock against the real function signature. An untyped mock that returns `{ id: 1 }` will not break when the real function starts returning `{ id: string }` -- the test silently passes against wrong data. A typed mock fails at compile time.

Check how the project's test runner supports typed mocks -- most modern runners accept type parameters on their mock/spy factory functions.

### Test Discriminated Unions Exhaustively

When production code handles a discriminated union, write a test case for each variant. If the code uses exhaustive checking with `never`, verify that an unrecognized variant throws. The test suite should mirror the union -- when a new variant is added, a missing test case should be obvious.

### Test Type Guards on Both Paths

A type guard has two contracts: what it accepts and what it rejects. Test both:

- **Positive**: valid inputs that should narrow successfully.
- **Negative**: `null`, `undefined`, wrong primitive types, objects missing required fields, objects with wrong field types. The negative path is where type guards earn their keep -- a guard that accepts everything is worse than no guard.

### Assert Types When Types Are the Contract

For generic utilities, builder patterns, or type narrowing functions where the return type IS the primary value, assert the type directly. Most modern test runners provide a type-level assertion API. If the runner does not, a compile-time check via `satisfies` or assignment to a typed variable achieves the same goal -- the test file fails to compile if the type contract breaks.

## Debugging Failing Tests

1. **Run the single failing test in isolation.** Most runners support filtering by file path and test name.
2. **Read the diff.** The assertion error shows expected vs received -- start there.
3. **Add `console.log` temporarily** if the issue is not obvious. Remove before committing.
4. **Check for leaked state.** If the test passes alone but fails in suite, look at `beforeEach`/`afterEach` for missing cleanup.
5. **Disable parallelism.** Run tests serially to rule out ordering issues.

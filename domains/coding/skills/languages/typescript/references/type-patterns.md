# Type Patterns

Reference guide for advanced TypeScript type patterns. Load when working with generics, conditional types, or complex type manipulation.

## Discriminated Unions

Use a literal `type` or `kind` field as the discriminant:

```typescript
type Shape =
  | { kind: "circle"; radius: number }
  | { kind: "rectangle"; width: number; height: number };

function area(shape: Shape): number {
  switch (shape.kind) {
    case "circle":
      return Math.PI * shape.radius ** 2;
    case "rectangle":
      return shape.width * shape.height;
  }
}
```

Use exhaustive checking with `never` to catch unhandled cases:

```typescript
function assertNever(x: never): never {
  throw new Error(`Unexpected value: ${x}`);
}

function describe(shape: Shape): string {
  switch (shape.kind) {
    case "circle":
      return `circle(r=${shape.radius})`;
    case "rectangle":
      return `rect(${shape.width}x${shape.height})`;
    default:
      return assertNever(shape);
  }
}
```

## Type Guards

```typescript
// Type predicate
function isString(value: unknown): value is string {
  return typeof value === "string";
}

// Generic type predicate
function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

// Filter with type narrowing
const values: (string | null)[] = ["a", null, "b"];
const strings: string[] = values.filter(isDefined);

// Assertion function
function assertDefined<T>(value: T | null | undefined, msg?: string): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(msg ?? "Expected defined value");
  }
}
```

## Generic Constraints

```typescript
// Constrain to object with specific key
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}

// Constrain to types with a specific shape
interface HasId {
  id: string;
}

function findById<T extends HasId>(items: T[], id: string): T | undefined {
  return items.find((item) => item.id === id);
}

// Default type parameters
type ApiResponse<T = unknown, E = Error> =
  | { ok: true; data: T }
  | { ok: false; error: E };
```

## Conditional Types

```typescript
// Extract inner type
type UnwrapPromise<T> = T extends Promise<infer U> ? U : T;
type Inner = UnwrapPromise<Promise<string>>; // string

// Distributive conditional
type ToArray<T> = T extends unknown ? T[] : never;
type Result = ToArray<string | number>; // string[] | number[]

// Non-distributive (wrap in tuple)
type ToArraySingle<T> = [T] extends [unknown] ? T[] : never;
type Result2 = ToArraySingle<string | number>; // (string | number)[]
```

## Mapped Types

```typescript
// Make all properties optional
type Partial<T> = { [K in keyof T]?: T[K] };

// Key remapping
type Getters<T> = {
  [K in keyof T as `get${Capitalize<string & K>}`]: () => T[K];
};

// Filter keys by value type
type PickByType<T, U> = {
  [K in keyof T as T[K] extends U ? K : never]: T[K];
};
```

## Template Literal Types

```typescript
type EventName = `on${Capitalize<"click" | "focus" | "blur">}`;
// "onClick" | "onFocus" | "onBlur"

// Extract route params
type ExtractParams<T extends string> =
  T extends `${string}/:${infer Param}/${infer Rest}`
    ? Param | ExtractParams<`/${Rest}`>
    : T extends `${string}/:${infer Param}`
      ? Param
      : never;

type Params = ExtractParams<"/users/:id/posts/:postId">;
// "id" | "postId"
```

## Branded Types

Simulate nominal typing to prevent mixing structurally identical types:

```typescript
type Brand<T, B extends string> = T & { readonly __brand: B };

type UserId = Brand<string, "UserId">;
type TaskId = Brand<string, "TaskId">;

function createUserId(id: string): UserId {
  return id as UserId;
}

function getUser(id: UserId): User { ... }

// getUser("raw-string");       // Error
// getUser(createUserId("123")); // OK
```

## Utility Type Patterns

```typescript
// Deep partial
type DeepPartial<T> = T extends object
  ? { [K in keyof T]?: DeepPartial<T[K]> }
  : T;

// Deep readonly
type DeepReadonly<T> = T extends object
  ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
  : T;

// Value union from object
type ValueOf<T> = T[keyof T];

// Make specific keys required
type RequireKeys<T, K extends keyof T> = T & Required<Pick<T, K>>;
```

## `satisfies` Operator

Validate a value against a type without widening:

```typescript
const STATUS = {
  idle: "idle",
  loading: "loading",
  done: "done",
} as const satisfies Record<string, string>;

// STATUS.idle is "idle" (literal), not string
// But TypeScript verified the shape matches Record<string, string>
```

## `as const` Over Enums

```typescript
// Prefer this
const Direction = {
  Up: "UP",
  Down: "DOWN",
  Left: "LEFT",
  Right: "RIGHT",
} as const;

type Direction = (typeof Direction)[keyof typeof Direction];
// "UP" | "DOWN" | "LEFT" | "RIGHT"

// Over this
enum Direction {
  Up = "UP",
  Down = "DOWN",
}
```

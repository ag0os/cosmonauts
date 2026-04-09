# React 19

Reference for React 19 APIs. These are newer than most training data — pay attention to the correct signatures and usage patterns.

## `use()` Hook

Reads a promise or context during render. Unlike other hooks, `use()` can be called inside conditionals and loops.

**For promises:** The component suspends until the promise resolves. Must be wrapped in `<Suspense>`. The promise must be created outside the component (in a server component, loader, or parent) — creating a promise during render causes an infinite loop.

**For context:** Replaces `useContext()`. The advantage is conditional reads — you can skip reading context based on props or state, which `useContext` doesn't allow.

**When to use `use(promise)` vs `useEffect` + `useState`:**

- `use()` — data needed for initial render, especially when the promise comes from a server component or framework loader.
- `useEffect` — side effects after render, subscriptions, or data that updates over time without Suspense.

## `useActionState(action, initialState, permalink?)`

Manages form action state. Returns `[state, formAction, isPending]`.

**Signature details:**

- `action: (previousState: State, formData: FormData) => State | Promise<State>` — receives the previous state as its first argument, not just FormData.
- `initialState: State` — the state before any action fires.
- `permalink?: string` — optional URL for progressive enhancement before JS loads.
- Returns: `[state, formAction, isPending]` — `formAction` goes on `<form action={formAction}>`, `isPending` tracks async completion.

**Key distinction from manual form state:**

- The state machine is managed by React — no manual `setError`, `setLoading`, `setSuccess`.
- Works with Server Actions (`'use server'`) — the action runs on the server, the state updates on the client.
- Supports progressive enhancement — forms work before JS hydrates.

## `useFormStatus()`

Returns `{ pending, data, method, action }` for the nearest parent `<form>`. Must be called from a component rendered inside a `<form>`, not in the same component that renders the form.

**Common mistake:** Calling `useFormStatus` in the same component as the `<form>`. It won't see the form. Extract the submit button into a child component.

## `useOptimistic(state, updateFn)`

Provides optimistic UI updates that automatically revert if the action fails.

- `state` — the actual server state (source of truth).
- `updateFn: (currentState, optimisticValue) => newState` — produces the optimistic state.
- Returns `[optimisticState, addOptimistic]`.
- Call `addOptimistic(value)` before the async action. React shows the optimistic state immediately and reverts to actual state when the action resolves.

**When to use:** Short-lived mutations where instant feedback matters — toggling likes, adding items to lists, marking as read. Not for complex multi-step operations where partial failure is hard to undo visually.

## `ref` as Prop

`forwardRef` is no longer needed. Components accept `ref` as a regular prop.

**Migration:** Remove the `forwardRef` wrapper and add `ref` to the props type. No behavior change.

## Migration Decision Table

| Current pattern | Migrate? | Notes |
|----------------|----------|-------|
| `forwardRef` | Yes, when touching the file | Simple mechanical change, no risk |
| `useContext` → `use(Context)` | Only if you need conditional reads | No benefit otherwise, `useContext` still works |
| `useEffect` data fetch → `use(promise)` | Yes, if wrapped in Suspense | Requires restructuring how the promise is created |
| Manual form state → `useActionState` | Yes, for new forms; migrate existing when modifying | Significant simplification for server-mutation forms |
| Custom `isPending` → `useFormStatus` | Yes, when using form actions | Must extract into child component |
| Manual optimistic state → `useOptimistic` | Evaluate case by case | Worth it for simple toggles, overkill for complex state |

---
name: react
description: React best practices and architecture decisions. Use when building components, managing state, working with hooks, Server Components, or React 19 APIs. Load for any React 18+ project. Do NOT load for non-React frontend work (Vue, Svelte, vanilla JS).
---

# React

You are working on a React project. Follow these guidelines for all code you write.

## Constraints

### Must

- Use TypeScript with strict mode. Type all props interfaces.
- Use `key` props with stable, unique identifiers (IDs, not array indices for dynamic lists).
- Clean up all effects (subscriptions, timers, listeners, abort controllers).
- Wrap async component trees in `<Suspense>` with meaningful fallbacks.
- Handle error states — use error boundaries for unexpected failures and explicit UI for expected ones.

### Must Not

- Mutate state directly. Always produce new references.
- Use array index as `key` for lists that reorder, filter, or have items added/removed.
- Define components inside other components (creates a new component identity every render).
- Ignore React strict mode warnings — they surface real bugs.
- Suppress ESLint exhaustive-deps warnings without understanding why the dependency is needed.

## Discover Project Conventions First

Before writing any code, read the project's configuration to understand its setup:

1. **Framework** -- Next.js (App Router or Pages), Vite, Remix, or plain React. This determines routing, data fetching, and Server Component support.
2. **package.json** -- React version (18 vs 19), state management libraries, test runner, existing dependencies.
3. **tsconfig.json** -- JSX transform (`react-jsx` vs `react`), path aliases, strict settings.
4. **Existing components** -- match file organization (flat vs feature folders), naming conventions, component patterns (arrow functions vs function declarations), export style.
5. **Styling approach** -- Tailwind, CSS Modules, styled-components, or plain CSS. Use what the project uses.

Match what you find. Do not introduce new patterns or libraries.

## Component Architecture

### Server vs Client Components

If the project uses Next.js App Router or another RSC-capable framework:

- **Default to Server Components.** They run on the server, have zero client bundle cost, and can directly access databases, file systems, and backend services.
- **Add `'use client'` only when the component needs:** hooks (useState, useEffect, etc.), event handlers (onClick, onChange, etc.), browser APIs, or third-party client-only libraries.
- **Push the client boundary down.** Extract the interactive part into a small client component; keep the data-fetching parent as a server component.
- **Props crossing the boundary must be serializable.** No functions, classes, or Dates. Pass IDs, strings, and plain objects.

For details on Server Component data fetching, streaming, and Server Actions, load `references/server-components.md`.

### Component Design

- **One component per file** unless helpers are small and tightly coupled.
- **Props interfaces over inline types.** Name them `{Component}Props`. Export if the component is public.
- **Composition over configuration.** Prefer children and render props over deeply configurable prop APIs. A component with 15 boolean props needs decomposition.
- **Collocate state with usage.** Start with local state. Only lift when a sibling needs it. Only go global when lifting becomes impractical.

## State Management

Choose based on what the state represents:

| State type | Tool | Why |
|------------|------|-----|
| UI state local to one component | `useState` / `useReducer` | Simplest option, no overhead |
| UI state shared by a subtree | Lift state to nearest common ancestor | Avoids global state for local concerns |
| App-wide UI state (theme, auth, sidebar) | Context or Zustand | Context for rarely-changing values; Zustand when updates are frequent or selective subscriptions matter |
| Complex client state with middleware needs | Redux Toolkit or Zustand | Redux when you need devtools, middleware, or the team already uses it |
| Server/async state (API data, cache) | TanStack Query or framework-native (RSC, loader) | Handles caching, revalidation, loading/error states — don't rebuild this |

**Common mistakes:**
- Reaching for global state before trying local state or lifting.
- Using Context for frequently-changing values — every consumer re-renders on every change. Use Zustand or `useSyncExternalStore` for selective subscriptions.
- Managing server state manually with useEffect + useState instead of using a data-fetching library.
- Duplicating server state in client state. If you fetched it, let the cache own it.

## Hooks

### Rules (non-negotiable)

- Call hooks at the top level only. Never inside conditions, loops, or nested functions.
- Every value used inside a hook callback that can change must be in the dependency array. Do not lie to the linter.
- Always return a cleanup function from effects that create subscriptions, timers, or listeners.

### Effect Discipline

`useEffect` is for synchronizing with external systems, not for deriving state:

- **Don't:** useEffect to transform props into derived state. Compute it during render or with `useMemo`.
- **Don't:** useEffect to respond to events. Use event handlers instead.
- **Don't:** useEffect to fetch data in components that could be Server Components. Fetch on the server.
- **Do:** useEffect for subscriptions (WebSocket, ResizeObserver, media queries), DOM measurement, and third-party library integration.
- **Do:** use AbortController for fetch cleanup. Return `() => controller.abort()`.

### Memoization

Only memoize when there is a measured or structurally obvious reason:

- `React.memo` -- when a component receives the same props frequently but its parent re-renders often. Don't wrap everything.
- `useMemo` -- when a calculation is expensive (sorting/filtering large arrays, complex math) and its dependencies change rarely. Don't memoize simple object construction.
- `useCallback` -- when passing a callback to a memoized child or as a dependency of another hook. Not needed for event handlers on native elements.

**Over-memoization is worse than no memoization.** It adds complexity, hides bugs (stale references), and rarely improves performance for simple components. Profile before optimizing.

### Custom Hooks

Extract a custom hook when:
- Multiple components need the same stateful logic (not just the same UI).
- A component's hook logic is complex enough to test independently.
- You need to encapsulate a subscription or external system integration.

Name custom hooks `use{Behavior}`, not `use{Component}`. A hook describes what it does, not where it's used.

## React 19

If the project uses React 19, prefer the new APIs over their older equivalents:

| Old pattern | React 19 replacement |
|-------------|---------------------|
| `forwardRef(Component)` | `ref` as a regular prop |
| `useEffect` + `useState` for async data in client components | `use(promise)` with Suspense |
| `useContext(Ctx)` | `use(Ctx)` (works inside conditionals) |
| Manual form state with `useState` + `onSubmit` | `useActionState` + form actions |
| Custom `isPending` state for form submission | `useFormStatus` inside the form |
| Manual optimistic state rollback | `useOptimistic` |

For detailed patterns and usage of React 19 APIs, load `references/react-19.md`.

## Performance

### Profile First

Do not optimize without evidence. React is fast by default. Use React DevTools Profiler to identify actual bottlenecks before adding `memo`, `useMemo`, or `useCallback`.

### Structural Optimizations (free, always valid)

- **Move state down.** If only one child needs state, don't hold it in a parent that causes wide re-renders.
- **Lift content up.** Pass slow-to-render children as `children` prop to the stateful parent — they won't re-render when the parent's state changes.
- **Code split routes and heavy components** with `lazy()` + `Suspense`.
- **Virtualize long lists** (1000+ items) with `@tanstack/react-virtual` or similar.

### `useTransition` for Responsiveness

Wrap expensive, non-urgent state updates in `startTransition` to keep the UI responsive. Typical use: search filtering, tab switching with heavy content.

## Testing

Identify the project's test runner and testing library from `package.json`. Use what the project uses.

### Principles

- **Test behavior, not implementation.** Assert what the user sees and can interact with, not internal state or component structure.
- **Query like a user.** Priority: `getByRole` > `getByLabelText` > `getByText` > `getByTestId`. If you can't find an element by role or label, the component may have an accessibility problem.
- **Use `userEvent` over `fireEvent`.** `userEvent` simulates real browser behavior (focus, keyboard, pointer events); `fireEvent` dispatches synthetic events that skip browser behavior.
- **Mock at the boundary.** Mock network requests (MSW), not internal functions. Mock context providers only when the real provider requires heavy setup.
- **Test custom hooks with `renderHook`.** Test component integration with `render` + user interaction.

### Async Testing

- Use `findBy*` queries (which wait) instead of `getBy*` + `waitFor` when possible.
- Use `waitFor` only when there is no query that naturally waits.
- Never use arbitrary `sleep`/`setTimeout` in tests.

## Accessibility

- Use semantic HTML elements (`button`, `nav`, `main`, `section`, `dialog`) instead of `div` + ARIA.
- Every form input needs a visible `<label>` or `aria-label`.
- Every image needs `alt` text (empty string for decorative images).
- Interactive custom components need `role`, `aria-*` attributes, and keyboard handlers.
- Error boundaries should render accessible error messages, not blank screens.

## Reference Guides

| Topic | Reference | When to Load |
|-------|-----------|--------------|
| Server Components | `references/server-components.md` | RSC data fetching, streaming, Server Actions, boundary decisions |
| React 19 | `references/react-19.md` | use() hook, useActionState, useFormStatus, useOptimistic, migration from older patterns |

## Related Skills

- `/skill:typescript` — TypeScript type safety, generics, discriminated unions
- `/skill:engineering-principles` — Design principles (cohesion, coupling, testing philosophy)

# Server Components

Reference for React Server Components architecture. Covers boundary decisions, data patterns, and Server Actions.

## The Boundary Decision

The `'use client'` directive is a **module boundary**, not a component boundary. Every module it imports becomes client code too. This makes boundary placement the most consequential architectural decision in an RSC app.

**Decision framework:**

1. Start with everything as Server Components.
2. Identify the interactive leaves — buttons, forms, stateful widgets.
3. Draw the `'use client'` boundary as low as possible, wrapping only the interactive part.
4. If a client component needs server-fetched data, pass it as props from a server parent — don't fetch in the client component.

**Boundary violations to watch for:**

- Importing a large library in a `'use client'` file pulls it into the client bundle even if the component only uses a small part. Consider whether the import can stay in a server component instead.
- Passing non-serializable props (functions, class instances, Dates, Maps) across the boundary causes runtime errors. Only JSON-compatible values cross.
- Context providers that wrap the whole app force everything below to be client components. Split providers: server data flows through props, client state through context.

## Data Fetching

Server Components are async — fetch data directly in the component. No useEffect, no loading state management, no client-side cache for initial loads.

**Patterns ranked by preference:**

1. **Direct database/API access in server components.** Simplest, zero client overhead.
2. **Parallel fetching with `Promise.all`.** When a component needs multiple independent data sources, fetch concurrently — don't waterfall.
3. **Streaming with Suspense.** Wrap slow data sections in `<Suspense>` so the fast parts render immediately. The slow part streams in when ready.
4. **Client-side fetching (TanStack Query, SWR).** Only for data that changes after initial load — polling, user-triggered mutations, infinite scroll.

**Caching:**

- Next.js extends `fetch` with `next: { revalidate: seconds }` for time-based caching and `next: { tags: [...] }` for on-demand revalidation.
- For non-fetch data sources, use `unstable_cache` (Next.js) or framework-equivalent.
- Cache at the data layer, not the component layer. Two components fetching the same data with the same cache key get deduplicated.

## Server Actions

Functions marked with `'use server'` that run on the server but can be called from client components. They replace API route handlers for mutations.

**When to use:**

- Form submissions (create, update, delete operations).
- Any mutation that needs server-side validation or database access.
- Revalidating cached data after a mutation (`revalidatePath`, `revalidateTag`).

**When NOT to use:**

- Read-only data fetching — use server components directly.
- Real-time subscriptions — use WebSocket or SSE.
- Long-running background jobs — trigger from a Server Action but run asynchronously.

**Security:**

- Server Actions are public HTTP endpoints. Always validate inputs and check authorization inside the action, even if the UI restricts access.
- Do not pass sensitive data (secrets, internal IDs that shouldn't be exposed) from server to client and back. Re-fetch on the server side.
- Use `zod` or equivalent to validate FormData — never trust client input.

## Composition Patterns

### Server parent, client child (most common)

Server component fetches data, passes serializable props to a small client component for interactivity.

### Client parent, server child (children pattern)

A client layout component receives server components as `children`. The server components are rendered on the server and passed as a serialized tree — the client component doesn't re-render them.

### Interleaving

Server and client components can alternate in the tree. The rule is: a `'use client'` module can't import a server module, but it can accept server components as `children` or other JSX props.

## Common Mistakes

- **Fetching in client components when the data could come from a server parent.** The data exists on the server already — pass it down.
- **Making everything `'use client'` out of habit.** Most components don't need interactivity. Default to server.
- **Waterfall fetches in nested server components.** If parent and child both fetch independently, the child waits for the parent. Use parallel fetching or Suspense streaming.
- **Forgetting that Server Actions are public.** A malicious client can call any Server Action with arbitrary arguments. Validate everything.

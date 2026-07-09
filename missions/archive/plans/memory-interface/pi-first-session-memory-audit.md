# Pi-First Session Memory Audit

Plan: `memory-interface`
Behavior: `B-001`
Date: 2026-07-08

## Scope

This audit gates W1 session-scope memory work. It reviews Pi session JSONL,
compaction, `pi.appendEntry()`, `ctx.sessionManager`, and session/fork/compact
lifecycle hooks for the repo-pinned Pi packages:
`@earendil-works/pi-coding-agent@0.80.3`,
`@earendil-works/pi-agent-core@0.80.3`,
`@earendil-works/pi-ai@0.80.3`, and
`@earendil-works/pi-tui@0.80.3`.

Sources checked:

- Context7 library `/earendil-works/pi`, queried for current Pi session,
  compaction, `appendEntry`, `ctx.sessionManager`, and lifecycle hook docs.
- Local project Pi skill: `domains/shared/skills/pi/SKILL.md`.
- Installed local docs:
  `node_modules/@earendil-works/pi-coding-agent/docs/session-format.md`,
  `docs/compaction.md`, and `docs/extensions.md`.
- Installed local types/source:
  `node_modules/@earendil-works/pi-coding-agent/dist/core/session-manager.d.ts`,
  `dist/core/extensions/types.d.ts`,
  `dist/core/extensions/loader.js`,
  `dist/core/extensions/runner.js`,
  `dist/core/agent-session.js`, and
  `dist/core/agent-session-runtime.js`.

## Findings

### Pi Session JSONL

Pi sessions are already persisted as JSONL files with one JSON object per line.
The first line is a `session` header with version, id, timestamp, cwd, and
optional `parentSession`. Non-header entries form an append-only tree using
`id` and `parentId`, allowing branches without rewriting prior history.

Evidence:

- `docs/session-format.md:1-4` states that sessions are JSONL files and entries
  form a tree through `id`/`parentId`.
- `docs/session-format.md:186-198` documents the `SessionHeader`, including
  `parentSession` for forked or cloned sessions.
- `docs/session-format.md:293-318` explains tree structure and
  `buildSessionContext()`, including compaction summaries, branch summaries,
  and custom messages.
- `dist/core/session-manager.d.ts:155-165` defines `SessionManager` as an
  append-only JSONL tree manager whose resolved LLM context follows the branch
  from root to current leaf and handles compaction summaries.
- `dist/core/session-manager.d.ts:252-257` states that entries cannot be
  modified or deleted; writes happen through append methods and branch changes.

Conclusion: Pi owns durable session transcript storage and branch structure
already. W1 does not need a separate session markdown store to preserve
same-session conversational continuity.

### Compaction

Pi compaction is the active short-term/session context mechanism. It summarizes
older messages when context grows too large or when `/compact` runs, appends a
`CompactionEntry`, and rebuilds LLM context from the compaction summary plus
recent messages.

Evidence:

- `docs/compaction.md:25-46` documents auto/manual compaction, cut point
  selection, summary generation, appending `CompactionEntry`, and reloading
  with summary plus kept messages.
- `docs/compaction.md:70-79` shows that what the LLM sees after compaction is
  the summary plus messages from `firstKeptEntryId` onward, with repeated
  compactions preserving continuity through prior kept boundaries.
- `docs/compaction.md:119-143` documents `CompactionEntry`, including
  `summary`, `firstKeptEntryId`, `tokensBefore`, extension-specific `details`,
  and `fromHook`.
- `docs/session-format.md:226-236` documents the persisted compaction entry.
- `dist/core/session-manager.d.ts:36-45` defines the typed `CompactionEntry`.

Conclusion: Pi already provides session-local summarization and context
retention. W1 should not add pruning, decay, embedding, SQLite, or relevance
gate machinery under the session scope.

### `pi.appendEntry()`

Pi extensions can persist custom session-local state as JSONL `custom` entries.
Those entries are not sent to the LLM; they are intended for extensions to
rebuild internal state on reload. Pi also separately supports
`custom_message` entries that do participate in LLM context.

Evidence:

- `docs/extensions.md:9-16` lists session persistence through
  `pi.appendEntry()` as an extension capability.
- `docs/session-format.md:250-258` documents `CustomEntry` as extension state
  persistence that does not participate in LLM context.
- `docs/session-format.md:260-271` documents `CustomMessageEntry` for
  extension-injected messages that do participate in LLM context.
- `dist/core/extensions/types.d.ts:822-887` exposes
  `ExtensionAPI.appendEntry<T>(customType, data?)`.
- `dist/core/extensions/loader.js:231-233` delegates `pi.appendEntry()` to the
  extension runtime.
- `dist/core/agent-session.js:1787-1789` binds that runtime action to
  `sessionManager.appendCustomEntry(customType, data)`.
- `dist/core/session-manager.d.ts:55-69` defines `CustomEntry` as persistent
  extension state ignored by `buildSessionContext`.
- `dist/core/session-manager.d.ts:81-99` defines `CustomMessageEntry` as
  context-bearing extension content.

Conclusion: If a future feature needs session-local extension state, Pi has an
append-only custom-entry substrate already. W1 should not invent a markdown
scratchpad for that purpose.

### `ctx.sessionManager`

Pi exposes the current session manager to extension handlers and tool
executions through `ctx.sessionManager` as a read-only session manager. It
supports reading the current branch, all entries, leaf entry/id, tree, labels,
header, current file, and session name.

Evidence:

- `dist/core/extensions/types.d.ts:208-219` defines `ExtensionContext` with
  `sessionManager: ReadonlySessionManager`.
- `dist/core/session-manager.d.ts:136` defines the read-only surface as
  `getCwd`, `getSessionDir`, `getSessionId`, `getSessionFile`, `getLeafId`,
  `getLeafEntry`, `getEntry`, `getLabel`, `getBranch`, `getHeader`,
  `getEntries`, `getTree`, and `getSessionName`.
- Context7 documentation for Pi reports the same extension access pattern:
  `ctx.sessionManager.getEntries()`, `getBranch()`, `buildContextEntries()`,
  and `getLeafId()`.
- `docs/extensions.md:721-725` documents a timing guarantee for `tool_call`:
  by the time it runs, `ctx.sessionManager` is up to date through the current
  assistant tool-calling message.

Conclusion: Extension code can inspect existing session state without a
parallel store. W1 retrieval should report skipped session scope rather than
scan or synthesize a separate session store.

### Session, Fork, And Compact Lifecycle Hooks

Pi has lifecycle hooks for session startup/reload/replacement, switch, fork,
compaction, tree navigation, and shutdown. `session_start` carries a reason
including `startup`, `reload`, `new`, `resume`, and `fork`, and replacement
flows shut down/reload/rebind extension instances.

Evidence:

- `docs/extensions.md:313-330` summarizes `/new`, `/resume`, `/fork`,
  `/clone`, and `/compact` event order.
- `docs/extensions.md:389-399` documents `session_start` with reasons and
  `previousSessionFile`.
- `docs/extensions.md:412-429` documents `session_before_switch`, followed by
  `session_shutdown`, extension rebinding, and `session_start`.
- `docs/extensions.md:431-446` documents `session_before_fork`, successful
  fork/clone shutdown, extension rebinding, and `session_start` with
  `reason: "fork"`.
- `docs/extensions.md:448-477` documents `session_before_compact` and
  `session_compact`, including cancellation/custom compaction and saved
  `compactionEntry`.
- `dist/core/extensions/types.d.ts:404-451` defines `SessionStartEvent`,
  `SessionBeforeForkEvent`, `SessionBeforeCompactEvent`, and
  `SessionCompactEvent`.
- `dist/core/extensions/types.d.ts:822-837` exposes typed `pi.on()` overloads
  for `session_start`, `session_before_fork`, `session_before_compact`,
  `session_compact`, and `before_agent_start`.
- `dist/core/agent-session-runtime.js:171-224` shows fork handling emits the
  before-fork path, creates or opens the appropriate `SessionManager`, tears
  down the current session, and starts the replacement session with
  `reason: "fork"`.

Conclusion: Pi already provides the hooks needed to reset, restore, or inspect
session-local state if W3/W4 later require it. W1 does not need a separate
lifecycle-managed markdown session store.

## Behavior Coverage Evidence

### Session-scope recommendation gates W1 implementation

`@cosmo-behavior plan:memory-interface#B-001`

Recommendation: W1 must keep the default as **no session-scoped markdown
store**.

The evidence above supports the planned no-session-store decision. Pi already
owns session JSONL persistence, branch/fork structure, extension custom entries,
context-bearing custom messages, branch summaries, compaction summaries, and
session lifecycle hooks. Building a W1 markdown session store would duplicate
Pi's session/compaction machinery and create a second source of truth for
same-session continuity.

Required W1 behavior:

- Keep `session` in the shared memory scope vocabulary for forward
  compatibility.
- Do not expose session-scoped `remember` writes in W1.
- If a W1 `retrieve()` caller requests `session`, return a skipped scope entry:
  `skippedScopes: [{ scope: "session", reason: "Session-scoped markdown memory is not built in W1; Pi session state and compaction cover short-term memory." }]`.
- Continue with project/user memory stores only after this audit artifact is
  present.

If future evidence contradicts this audit, the plan must be revised before any
session-scope store is implemented.

## Explicit Non-Authorization

This task authorizes only this Pi-First audit artifact and its W1
recommendation. It does **not** authorize building any of the following:

- session-scope store
- session scratchpad
- pruning
- decay
- embedding
- SQLite persistence
- relevance-gate machinery

Any implementation of those items requires a plan revision or a later task that
explicitly authorizes it.

## Commit Handoff

This artifact lives under `missions/plans/...`, and the plan notes that Drive's
per-task source commit path can exclude `missions/**`. The worker completion
handoff must include `git status --short --branch` after writing this file and
must call out that
`missions/plans/memory-interface/pi-first-session-memory-audit.md` is an
untracked plan artifact for Drive's final-state commit path to preserve.

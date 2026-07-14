# Pi-First Profile And Playbook Audit

Plan: `profile-playbooks`  
Behavior: `B-001`  
Pinned Pi version: `0.80.6`  
Audit date: 2026-07-13

## Gate outcome

**Proceed with the planned W2 split.** Pi 0.80.6 supplies the lifecycle, tool,
context, session, compaction, UI, and execution-order primitives W2 needs, but
it does not supply an equivalent mutable, human-prunable, cross-session
profile/preference/playbook store or a domain-level collision-save primitive.
W2 should therefore lean on Pi's existing primitives while retaining and
extending Cosmonauts' W1 disk store for durable authored records.

No contradictory equivalent semantics were found. If later 0.80.6 evidence
does show equivalent mutable profile/playbook plus collision-save semantics,
W2 production implementation must stop and this plan must be revised before
parallel machinery is built.

## Audit scope and authority

The repository manifest and lockfile pin all four Pi packages exactly and in
lockstep:

| Package | Root pin | Installed package | Audited role |
|---|---:|---:|---|
| `@earendil-works/pi-agent-core` | `0.80.6` | `0.80.6` | Agent state, context transform, tool loop, and execution ordering |
| `@earendil-works/pi-ai` | `0.80.6` | `0.80.6` | Provider/model API, LLM messages, schemas, token and cost behavior |
| `@earendil-works/pi-coding-agent` | `0.80.6` | `0.80.6` | Sessions, resource loading, extensions, compaction, UI modes, and SDK |
| `@earendil-works/pi-tui` | `0.80.6` | `0.80.6` | Interactive terminal rendering and components |

Evidence:

- `package.json:40-43` pins the four packages to exact `0.80.6`; `bun.lock:110-116`
  resolves those same four versions.
- Each installed `node_modules/@earendil-works/pi-*/package.json:2-7`
  identifies the package and reports version `0.80.6` (the TUI's `types` field
  is at line 38).
- `node_modules/@earendil-works/pi-agent-core/README.md:1-3` describes the
  stateful agent/tool layer; `pi-ai/README.md:1-5` describes the provider/LLM
  layer; `pi-coding-agent/README.md:15-19` describes the extensible coding
  harness and its run modes; and `pi-tui/README.md:1-14` describes the terminal
  UI layer.
- The installed coding-agent package is the only one of the four that ships a
  top-level changelog. Its `CHANGELOG.md:3-20` identifies 0.80.6, while the
  installed READMEs and declarations cover the other packages. Relevant
  changes already present by 0.80.6 include sequential question tools,
  custom-message compaction accounting, custom-entry ordering, and stable
  parent context-file traversal (`CHANGELOG.md:72-84`).
- The repository's version-matched Pi skill
  (`domains/shared/skills/pi/SKILL.md`) was read as the local index. Context7
  library `/earendil-works/pi` was resolved and queried for extension/session,
  UI-mode, and execution-order behavior; it corroborated the installed docs.
  Because this gate targets 0.80.6 specifically, the installed 0.80.6 docs,
  declarations, and runtime JavaScript are authoritative where current docs
  could move ahead.

The installed Markdown/declaration corpus was also searched for the domain
terms `long-term`, `playbook`, `recall`, `mutable profile`, and `preference
store`; it contains no matches. The few `remember` matches concern persisted
project-trust decisions or selected models, not authored memory. `profile` and
`preference` occurrences elsewhere concern provider credentials/routing or UI
settings. This negative inventory is not the recommendation by itself; the
positive API audit below establishes what Pi actually provides and why none of
it has W2's store semantics.

## Primitive-by-primitive findings

| Required concern | Pi 0.80.6 evidence | Build or lean decision |
|---|---|---|
| Long-term memory | Pi persists a session transcript tree and compaction summaries, but its active context is session/branch based and lossy after compaction. It has no authored-record API or cross-project user-memory namespace. | Retain the W1 project/user disk store for durable long-term records; lean on Pi only for short-term session continuity. |
| Profile | No profile record type, singleton user profile path, complete-body replacement rule, size policy, current-disk rescan, or cross-project injection primitive exists. Provider “profiles” are credential concepts. | Build the W2 profile policy in the existing store. |
| Preference | Context files may contain preferences, but Pi only discovers and injects generic instruction files; it supplies no preference mutation, validation, visible save result, human-edit collision rule, or profile taxonomy. | Lean on context-file composition for static project instructions, not for W2 saves; retain the authored store. |
| Playbook | No playbook record type, scoped stable name identity, title canonicalization, current-title scan, or full-body recall primitive exists. Skills are prompt resources, not mutable user-authored records saved through `remember`. | Build the finite playbook policy in the existing store; do not introduce a registry/backend. |
| Save confirmation | `ctx.ui.confirm()` is a generic dialog primitive. It is not a collision preflight/result protocol and is unavailable in two supported modes. Pi's per-file mutation queue serializes callbacks but does not detect semantic name collisions or require a confirmed re-call. | Conversational confirmation remains authoritative; the W2 tool/store edge owns `confirmation_required` and `confirmUpdate`. |
| Context injection | `before_agent_start` can inject a persisted context-bearing custom message, and `context` can transform the message list before each provider call. | Lean on these hooks; W2 should reread disk once per authorized turn and keep only the newest memory context message. |
| Extension state | `pi.appendEntry()` persists branch-local custom data that is deliberately excluded from LLM context; custom messages are the separate context-bearing mechanism. | Lean on custom entries only for genuinely session-local extension state. Do **not** use `pi.appendEntry()` for save proposals or pending approval. |
| Session/compaction | Pi owns JSONL session trees, custom messages/entries, branching, compaction entries, and the session lifecycle. | Lean on Pi; do not build a session store, proposal store, or compaction layer. |
| Tool ordering | Pi defaults batches to parallel, supports a per-tool `executionMode`, and makes the whole batch sequential when any called tool requires it. | Register mutating `remember` as sequential; leave read-only `recall` at the default. |

### Context files are injection, not a mutable profile store

Pi loads the first `AGENTS.md`/`CLAUDE.md` candidate from the global agent
directory and every directory from filesystem root down to the cwd
(`node_modules/@earendil-works/pi-coding-agent/dist/core/resource-loader.js:30-72`).
`DefaultResourceLoader` can disable or override those files
(`dist/core/resource-loader.d.ts:43-60,61-112`), and `buildSystemPrompt()` wraps
their contents in project-instruction elements (`dist/core/system-prompt.js:17-31,102-109`).
The installed usage guide explicitly calls context files suitable for project
conventions, safety rules, and preferences (`docs/usage.md:96-104`).

That is useful Pi-owned prompt composition, but it is read/discover/inject
behavior only. It has no user-profile singleton, project/user authored scope,
OKF validation, `remember` result, collision preflight, atomic replacement, or
current-disk recall contract. A global `AGENTS.md` can contain hand-written
preferences, but treating it as W2's save target would mix runtime instructions
with human-prunable memory and would not satisfy profile/playbook semantics.

### Factory-time tools and lifecycle/context hooks

Pi extensions are factories and may register tools during load. The installed
quick start registers a tool directly in the extension factory
(`docs/extensions.md:55-100`), while the API also permits later dynamic
registration (`docs/extensions.md:1321-1339`). W2 should keep W1's simpler
factory-time `registerTool` pattern: `remember` and `recall` are always known to
the host, while their execution remains protected by the existing per-turn
Cosmo authorization guard. Dynamic registration adds no W2 semantic value.

The relevant lifecycle order is explicit: `before_agent_start` runs after input
processing and before the agent loop; `context` runs before every LLM call
(`docs/extensions.md:284-306`). `before_agent_start` can return a custom message
and a chained system prompt (`docs/extensions.md:513-548`), and `context` gets a
deep copy it can filter (`docs/extensions.md:640-650`). Runtime wiring confirms
the order: the session adds `before_agent_start` messages to the turn
(`dist/core/agent-session.js:846-878`), SDK wiring delegates `transformContext`
to extension `context` handlers (`dist/core/sdk.js:225-231`), and agent-core
applies that transform before conversion to provider messages
(`node_modules/@earendil-works/pi-agent-core/dist/agent-loop.js:173-190`).

Recommendation: use these Pi hooks instead of a custom injection scheduler.
The later B-020 implementation must keep the newest `agent-memory-context`
message through the `context` transform; it must not rely on stale session
messages or add a second context channel.

### Session entries, custom messages, and compaction

Pi distinguishes two mechanisms:

- `pi.sendMessage()` creates a custom message that participates in LLM context
  (`docs/extensions.md:1378-1400`). A `before_agent_start` result uses the same
  context-bearing custom-message shape.
- `pi.appendEntry()` creates extension state that does **not** participate in
  LLM context (`docs/extensions.md:1429-1445` and
  `dist/core/extensions/types.d.ts:890-907`). Its runtime implementation calls
  `sessionManager.appendCustomEntry()` (`dist/core/agent-session.js:1840-1845`).

Custom entries are append-only, branch/session-local reconstruction data, not a
mutable cross-session authored store. The session declarations say they are
ignored by `buildSessionContext()` while custom messages are context-bearing
(`dist/core/session-manager.d.ts:55-92`), and the runtime projection returns no
message for plain custom entries (`dist/core/session-manager.js:162-188`). W2
therefore must not persist proposals, declines, or pending approval with
`pi.appendEntry()`. A proposed save remains conversation only; if it is declined
or unanswered, no tool call and no entry is produced.

Compaction is already Pi-owned short-term context management: it selects a cut
point, summarizes older messages, appends a `CompactionEntry`, and reloads the
summary plus kept messages (`docs/compaction.md:25-79`). Custom messages are
valid cut points and participate in retained-token accounting
(`docs/compaction.md:109-117`; `CHANGELOG.md:74-76`). Plain custom entries can
remain in the selected branch for reconstruction but still never become LLM
messages (`docs/session-format.md:307-326`). This is sufficient for session
continuity, not equivalent to mutable profile/playbook files that follow a user
across project sessions and reflect human edits/deletions on the next read.

### Confirmation across TUI, RPC, print, and JSON

The typed primitive is `ctx.ui.confirm(title, message): Promise<boolean>`, with
`ctx.mode` covering `"tui" | "rpc" | "json" | "print"` and `ctx.hasUI`
identifying dialog-capable contexts
(`dist/core/extensions/types.d.ts:63-72,204-214`). Its actual mode behavior is:

| Mode | `hasUI` | 0.80.6 behavior | W2 consequence |
|---|---:|---|---|
| TUI | `true` | Full interactive confirmation dialog. | Usable as incidental UI, but not the cross-mode authority. |
| RPC | `true` | Emits an `extension_ui_request`; cancellation, timeout, or a malformed response resolves `false` (`dist/modes/rpc/rpc-mode.js:76-84`). | Depends on a client implementing the dialog protocol. |
| JSON | `false` | UI methods are no-ops. | Cannot obtain a save confirmation dialog. |
| Print | `false` | Extensions run but cannot prompt. | Cannot obtain a save confirmation dialog. |

The installed mode table confirms those four values
(`docs/extensions.md:2657-2666`). For non-UI contexts Pi installs a no-op UI
whose `confirm` resolves **`false`** (`dist/core/extensions/runner.js:87-102`).
Even in UI modes a timed confirmation resolves false on cancel/timeout
(`docs/extensions.md:2265-2287`).

Therefore conversational confirmation remains authoritative. It works on all
four surfaces because explicit assent is a user message already present in the
normal prompt/RPC/print input path. Cosmo's prompt may propose a profile or
playbook save and call `remember` only after that assent; a direct user save
request is already conversational authorization. For a playbook name collision,
the first tool result returns `confirmation_required` and the model re-calls
`remember` with `confirmUpdate: true` only after the user agrees. Making
`ctx.ui.confirm` mandatory would silently turn valid print/JSON saves into
`false`, make RPC correctness depend on a client dialog implementation, and
create mode-specific approval state. W2 adds no parser, persisted proposal, or
approval state machine.

### Execution ordering and the W1 atomic-write dependency

Agent-core's documented and typed default is parallel execution. Parallel mode
preflights in source order but executes allowed calls concurrently; sequential
mode executes one by one. A per-tool sequential declaration forces the entire
assistant batch to run sequentially
(`node_modules/@earendil-works/pi-agent-core/README.md:102-111` and
`dist/types.d.ts:215-223`). The runtime checks for any called tool with
`executionMode === "sequential"` and then awaits each tool call in source order
(`dist/agent-loop.js:285-330`); otherwise it starts prepared calls together
(`dist/agent-loop.js:332-375`). Coding-agent carries the extension definition's
mode into the core tool (`node_modules/@earendil-works/pi-coding-agent/dist/core/tools/tool-definition-wrapper.js:1-10`).

Decision for B-021: register `remember` with
`executionMode: "sequential"`. The collision check and write must be one
ordered operation, so a second same-batch, same-canonical-name save observes the
first completed write and returns `confirmation_required` instead of racing an
absent-name preflight. `recall` is read-only and keeps Pi's default execution
mode; adding a sequential override to it would reduce safe concurrency without
protecting an invariant. If a batch contains both tools, `remember`'s override
correctly makes that batch sequential.

Pi 0.80.6 also exports `withFileMutationQueue()`, which serializes same-file
mutation callbacks (`docs/extensions.md:1804-1810`). It is not an equivalent
collision-save primitive: it does not define profile/playbook identity, scan
human-edited titles, return `confirmation_required`, or connect a confirmed
re-call to the existing record. W2's `remember` preflight spans more than the
final file write, so the explicit sequential tool decision remains the required
Pi primitive.

The shipped W1 atomic helper names its temporary file with only target path,
`process.pid`, and `Date.now()` before rename
(`lib/memory/markdown-store.ts:335-349`). Same-process parallel writes to the
same target in one millisecond can therefore contend for the same temp path.
B-021 will protect the W2 tool path by pinning and testing sequential
`remember` execution. This does not claim cross-process locking; the plan
explicitly leaves stronger concurrent-writer semantics out of W2.

## Pi 0.80.6 recommendation gates W2 implementation

`@cosmo-behavior plan:profile-playbooks#B-001`

The evidence supports this binding recommendation:

1. Lean on Pi's factory-time `registerTool`, `before_agent_start`, `context`,
   custom-message, session/compaction, mode, and per-tool execution primitives.
2. Retain Cosmonauts' W1 mutable project/user disk store and extend only its
   finite authored vocabulary and fixed layout for profile/playbook semantics.
   Pi has no equivalent human-prunable profile/playbook store or semantic
   collision-save protocol.
3. Keep proposal/decline state conversational. `pi.appendEntry()` is **not used
   for proposals**, pending confirmation, or declines. Use no approval backend
   or conversation parser.
4. Keep conversational confirmation authoritative across TUI, RPC, JSON, and
   print. `ctx.ui.confirm` is optional UI, not the W2 correctness boundary,
   because `hasUI` and client behavior vary and non-UI confirmation falls back
   to `false`.
5. Register `remember` with `executionMode: "sequential"`; keep read-only
   `recall` at Pi's parallel default. B-021 must protect the collision preflight
   and the W1 PID-plus-`Date.now()` temp-file naming dependency.
6. If contradictory Pi 0.80.6 evidence later establishes equivalent mutable
   profile/playbook and collision-confirmed save semantics, stop production
   implementation and revise the plan. Do not build parallel machinery.

This audit is the gate only. W2 production work remains blocked until TASK-459
is completed by Drive.

## Applicable Quality Contract checkpoint

- **Gate 2, artifact conformance:** B-001 is recorded at the exact root-relative
  evidence path
  `missions/plans/profile-playbooks/pi-first-profile-playbooks-audit.md`, under
  the exact named check above, with the exact behavior marker.
- **Gate 4, boundary conformance:** this audit changes no production file,
  shared interface, `lib/memory/*` dependency, architecture-map code,
  registry/backend, approval mechanism, or consumer wiring.
- **Gate 5, complexity:** this audit introduces no configuration, dispatch
  layer, cache, alternate store, or additional machinery.
- **Gate 6, dead code:** this audit introduces no W3 episodic capture, W4
  consolidation/mining, pending proposal persistence, relevance gate,
  embeddings, extra consumer, or unused result variant.

The audit artifact must remain in final version-control state; Drive owns
staging and commit creation for this run.

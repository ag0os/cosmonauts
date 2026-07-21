# Pi-first audit: episodic baseline gate

Date: 2026-07-21  
Task: TASK-471  
Audited dependency: `@earendil-works/pi-coding-agent` 0.80.6

## Verdict

The implementation gate remains open. Pi 0.80.6 provides durable session
JSONL files, session lifecycle callbacks, and session compaction. It does not
provide a durable cross-session project/user event store for run-and-decision
episodes.

`pi.appendEntry()` survives a restart or resume of the session file that owns
the entry. It is not a project- or user-scope append API: it delegates to the
active `SessionManager`, creates a `custom` child of that session's current
leaf, and uses that manager's session JSONL persistence policy. Starting a new
session creates a new manager/file and a new entry tree. Pi can list session
files across projects, but that discovery surface does not merge custom
entries into a project/user event log or give them the markdown store's
scope, retrieval, pruning, warning, and human-ownership contracts.

Therefore the ratified boundary stands:

- Pi state, session entries, session files, and compaction cover session scope.
- W3 uses the existing markdown `MemoryStore` only for consequential
  project/user run-and-decision episodes.
- W3 does not add a session markdown store, copy Pi custom entries into a
  second session store, or introduce Pi session hooks.
- Raw sessions, turns, tools, and compaction activity are not W3 episodes.

No plan revision is required. If a later pinned Pi version adds an explicit
durable project/user event-store abstraction, this decision must be reopened
before extending the markdown implementation.

## Version evidence

- `package.json:40-43` pins all four `@earendil-works/pi-*` packages to the
  exact lockstep version `0.80.6`.
- `bun.lock:110-116` resolves those exact package versions.
- `node_modules/@earendil-works/pi-coding-agent/package.json:1-4` identifies
  the installed package as version `0.80.6`.
- The repository Pi skill, `domains/shared/skills/pi/SKILL.md`, explicitly
  tracks 0.80.6 and identifies the installed docs and declarations as the
  local source of truth.
- A 2026-07-21 Context7 lookup resolved the official Pi documentation as
  `/earendil-works/pi`. The current extension documentation describes
  `appendEntry` restoration by iterating `ctx.sessionManager.getEntries()` in
  `session_start`; the pinned installed code below determines the exact 0.80.6
  semantics for this gate.

## Lifecycle evidence

The installed lifecycle documentation at
`node_modules/@earendil-works/pi-coding-agent/docs/extensions.md:270-346` shows
that the relevant callbacks are tied to the active session runtime:

| Surface | Pinned behavior | Storage implication |
|---|---|---|
| `session_start` | Fires for startup, reload, new, resume, and fork. | Rebinds extension state to the newly active `SessionManager`; it is not a project event-store callback. |
| `session_shutdown` | Fires before quit/reload/new/resume/fork teardown. | Provides cleanup for session-scoped resources; it does not persist project/user history itself. |
| `session_before_compact` | Can cancel or replace the summary for the active branch. | Operates on branch entries from the active session. |
| `session_compact` | Observes the compaction entry saved to the active manager. | The resulting entry remains in that session's JSONL tree. |
| prompt/turn/tool callbacks | Observe work inside an active agent loop. | They are capture opportunities, not durable project/user storage, and are outside W3's noise budget. |

The implementation confirms session replacement rather than shared event
state. `dist/core/agent-session-runtime.js:98-166` tears down the current
runtime, opens or creates a `SessionManager`, and supplies a new
`session_start` event. A fresh-session action calls `SessionManager.create()`
or `SessionManager.inMemory()`; it does not carry arbitrary custom entries
forward. Resume explicitly opens a selected session file. Forking is the
separate, explicit path that copies a session history.

## `pi.appendEntry()` evidence

The pinned implementation has a direct, narrow call chain:

1. `dist/core/extensions/loader.js:236-239` forwards the extension API call to
   the active extension runtime.
2. `dist/core/agent-session.js:1840-1847` calls
   `this.sessionManager.appendCustomEntry(customType, data)` and emits an
   `entry_appended` event for that session entry.
3. `dist/core/session-manager.js:758-768` constructs a `type: "custom"` entry
   with `parentId: this.leafId`, advances the session leaf, and returns the
   entry id.
4. `dist/core/session-manager.js:663-698` writes through `_persist()` only when
   that manager is persistent and has a session file. In-memory managers write
   nothing to disk. A fresh persistent session also defers its first physical
   flush until the session has assistant output, reinforcing that this is a
   transcript entry rather than a general event-journal API.
5. `dist/core/session-manager.js:918-921` exposes the entries through that
   manager's `getEntries()` collection. The installed extension example at
   `docs/extensions.md:1429-1446` restores custom state from exactly this
   collection.

The default persistence path is session-specific. In
`dist/core/session-manager.js:242-252`, Pi encodes the working directory under
`~/.pi/agent/sessions/` and stores separate JSONL session files there.
`SessionManager.create/open/continueRecent/inMemory()` at lines 1113-1150
choose a new file, a named file, the most recent file, or no file persistence.
`SessionManager.list()` and `listAll()` at lines 1205-1249 discover those
files; they do not expose a durable project/user custom-entry collection.

Conclusion: official wording that custom data “persists” means persistence in
the owning Pi session and restoration when that session file is reopened. It
does not establish automatic cross-session project/user event storage.

## Compaction evidence

Compaction is likewise session-scoped:

- `dist/core/agent-session.js:1345-1425` obtains the active manager's branch,
  emits the before callback, generates or accepts a summary, appends the
  compaction to the same manager, rebuilds the same session context, and emits
  the after callback.
- `dist/core/session-manager.js:742-756` writes the summary as a
  `type: "compaction"` child in the session tree.
- `dist/core/session-manager.js:896-905` rebuilds LLM context from the active
  session entries. The full entry history remains in that JSONL, while the
  model receives the compaction-aware context for that session.

Compaction is therefore the correct short-term/session-memory mechanism, but
it is neither a project/user episode index nor a substitute for W3's explicit
recallable markdown records.

## Frozen pre-W3 disabled baselines

The following absent-config cases are the baseline that W3 must preserve. The
new umbrella characterizations own no product behavior; they pin the bytes and
shapes that later behavior-specific tests build upon.

| Surface | Frozen evidence |
|---|---|
| Authored memory | `tests/episodic/pre-w3-disabled-baselines.test.ts` fixes the `remember`/`recall` tool contract, exact successful note result, exact injected index bytes, authored file set, and absence of user/episode paths. Existing W2 cases in `tests/extensions/agent-memory.test.ts` continue to cover consent, collisions, profile/playbook behavior, warning text, bounds, and authorization. |
| Plan/task managers | The same umbrella suite creates and status-transitions a plan and task through context-free managers, fixes returned shapes and persisted files, and proves no memory path is induced. Existing manager suites retain broader CRUD and locking coverage. |
| Pi tools and CLI | The umbrella suite fixes absent-config plan/task tool text/details and CLI render results. `tests/extensions/plans.test.ts`, `tests/extensions/task-tools.test.ts`, and `tests/cli/{plans,tasks}/commands/{create,edit}.test.ts` retain the full parameter and output-mode matrix. |
| Inline chain | `tests/orchestration/chain-runner.test.ts` fixes the exact one-stage result shape, event order, non-durable identity, and empty project file set. |
| Durable chain | `tests/orchestration/run-start-chain-characterization.test.ts` fixes the durable result identity, graph, steps, event vocabulary, and proves no memory path is created. |
| Inline Drive | `tests/driver/drive-run-start-characterization.test.ts` fixes result/spec keys, completion bytes, legacy and normalized events, graph/step artifacts, and absence of a memory path. |
| Detached Drive | `tests/driver/driver-detached.test.ts` fixes the detached result, frozen input spec bytes, event bridge, runner/prompts/queue/completion files, and absence of a memory path. `tests/driver/run-step.test.ts` separately fixes the compiled child's exact legacy event order and completion. |

## Artifact retention

Drive's source-commit path excludes `missions/**` (see
`lib/driver/run-one-task.ts:68-74` and `lib/driver/drive-finalization.ts:799-856`).
This audit is intentionally stored at its canonical plan path rather than only
inside the ignored run workdir. TASK-471's handoff must list this file
explicitly, and finalization must leave it present for the later artifact
hygiene gate. The run verifies retention with a filesystem existence check and
an explicit status inspection; a tracked-file-only query is not evidence of
absence.

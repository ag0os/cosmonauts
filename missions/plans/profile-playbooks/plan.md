---
title: Profile + explicit playbooks (agent-memory W2)
status: active
createdAt: '2026-07-13T13:15:32.000Z'
updatedAt: '2026-07-13T13:30:10.911Z'
---

## Overview

This is the implementation plan for agent-memory W2: extend the shipped authored
record vocabulary from `note` to `note | profile | playbook` without changing the
shared `MemoryStore` contract, and extend Cosmo's existing explicit `remember` /
`recall` edge with confirmation-guided profile and playbook flows.

The spec at `missions/plans/profile-playbooks/spec.md` is authoritative. W2 keeps
the W1 markdown store, sibling scope roots, scope-filtered recency retrieval,
index-inject + pull recall, factory-register-then-guard extension pattern, and
test construction seams. It adds no backend, registry, cache, approval workflow,
or non-Cosmo consumer.

For traceability, the spec's acceptance-criteria bullets are numbered in order
for this plan:

| Source | Spec acceptance criterion summary |
|---|---|
| AC-001 | A confirmed durable preference creates one valid user-scoped profile and its body is available in a new session in a different project. |
| AC-002 | A second confirmed profile update changes the same profile document and reports what changed. |
| AC-003 | User-initiated and Cosmo-proposed-then-confirmed playbook saves create valid records in the correct scope and report name, scope, and path. |
| AC-004 | A declined proposal changes no files or store state and persists no pending state. |
| AC-005 | Saving an existing playbook name in the same scope requires confirmation and updates one stable file without duplicates. |
| AC-006 | A later session receives the playbook in the injected index and `recall` returns its full body. |
| AC-007 | Project playbooks stay project-local; user playbooks/profile follow the user; store/frontmatter mismatches warn and do not leak. |
| AC-008 | Human edits and deletions of profiles/playbooks are reflected by the next retrieval, injected context, and recall. |
| AC-009 | All shipped W1 note, retrieval, extension, and no-op consolidation behavior remains green without substantive test rewrites. |
| AC-010 | Profile body and note/playbook index share one 12,000-byte injection, profile first, with honest truncation pointing to `recall`. |
| AC-011 | A Pi-First audit of pinned Pi 0.80.6 records evidence and a build-vs-lean-on-Pi recommendation before W2 machinery is built. |
| AC-012 | Project-native test, lint, and typecheck gates pass; tests make no model calls and never touch the real `~/.cosmonauts`. |

No tasks are created by this plan. Task decomposition and implementation happen
only after review and approval.

### Authoritative spec assumptions (verbatim; not reopened)

Ratified (W1 decisions preserved, not reopened):
- Sibling stores behind one interface; interface stays in `lib/memory/`, no
  Pi/CLI/domains imports; pull-not-push recall; Pi session/compaction owns
  short-term (`session` stays a skipped scope); plain-text first; OKF v0.1
  serialization; scope (`scope`) × taxonomy (`kind`) as custom frontmatter
  keys.

Proposed by the spec-writer 2026-07-13 (human away — autonomous run; veto
before implementation if wrong):
- **Profile is a singleton user-scoped document, updated in place.** One
  markdown file per user store; `type: profile`, `kind: semantic`, scope
  fixed to `user`. No per-project profile (project facts stay notes). No
  version history in W2: the user store has no VCS; "proposed truth the human
  can edit" is the undo story. Concurrent-writer safety beyond W1's
  atomic-write pattern is not built.
- **Playbooks have stable name identity; kind is fixed `procedural`.**
  Slug-named files (not timestamp-hash names) so a name+scope maps to exactly
  one file and updates replace it. Body convention: when-to-use, then steps —
  guidance, not schema-enforced structure.
- **One combined 12,000-byte injection budget, profile first,** rather than
  per-type budgets. Single consumer, simplest honest accounting; the planner
  sets the profile's own size bound within it. Budget pressure is a named
  ◆reassess input.
- **Per-turn full-store rescan is re-affirmed for W2, no cache.** W2 adds one
  scanned subdirectory per store plus one profile file; authored records stay
  in the dozens; disk-as-only-truth is what makes human edits trustworthy.
  The reassess gate owns caching, trigger unchanged: stores approaching
  hundreds of records.
- **Confirmation is conversational, not mechanical.** Explicit-save v1 rides
  on Cosmo asking in the conversation and calling the save tool only after
  assent; the enforced guarantees are the tool-level ones (saves are
  explicit tool calls, visible results, no pending state, collision
  confirmation). No approval-workflow machinery in W2.
- **Cosmo-only stays the W2 consumer boundary** (same identity gating as W1).
- The interface contract (`MemoryQuery.recordTypes`, `MemoryRecordDraft.type`)
  is expected to absorb the new types without breaking changes — W1 was
  shaped for exactly this; if the planner finds otherwise, that is a
  stop-and-report signal, not license to rework the interface silently.

## Architecture Context

This plan implements W2 of `missions/architecture/agent-memory.md` and shares
the W1 interface described by `missions/architecture/architectural-memory.md`.
The shipped implementation and rationale are recorded in
`memory/memory-interface.md`, `docs/memory.md`, and the archived
`missions/archive/plans/memory-interface/plan.md`.

Relevant durable decisions and boundaries:

- W2 is profile + explicit playbooks only. W3 episodic capture and W4 dreaming,
  mining, pruning, decay, and scheduled consolidation stay out;
  `consolidate()` remains the shipped no-op.
- `lib/memory/*` is the stable inward core. It must not import Pi, CLI,
  orchestration, tasks, plans, domains, or architecture-map code.
- `domains/shared/extensions/agent-memory/index.ts` is the Pi edge. It may use
  `lib/memory` and Pi lifecycle/tool APIs; the dependency never points back.
- The existing `MemoryStore`, `MemoryRecordDraft`, `MemoryQuery`, and result
  unions are sufficient. `MemoryRecordDraft.type: string` and
  `MemoryQuery.recordTypes?: readonly string[]` carry the W2 vocabulary without
  changing `lib/memory/types.ts`.
- The architecture-map sibling adapter, generated architecture store, CLI,
  viewer, and architecture-memory extension are untouched.
- Disk is the only correctness source. Every injection, collision check,
  retrieval, and recall re-reads current files; no in-memory profile/playbook
  cache or latest-record map is introduced.
- `createMarkdownMemoryStore({ projectRoot, userCosmonautsRoot, now })` and
  `createAgentMemoryExtension({ userCosmonautsRoot, storeFactory, now })` remain
  the production/test construction seams. All filesystem tests use temporary
  project and user roots.

## Behaviors

### B-001 - Pi 0.80.6 re-audit gates W2 machinery

- Source: AC-011
- Context: implementation is about to add profile/playbook behavior on top of Pi
  0.80.6
- Action: the implementer audits the four pinned lockstep Pi packages, local
  docs/types, and changelog for long-term memory, profile, preference, playbook,
  save-confirmation, context-injection, and extension-state primitives
- Expected: `missions/plans/profile-playbooks/pi-first-profile-playbooks-audit.md`
  records evidence and an explicit recommendation. The planned recommendation
  is to lean on Pi's existing factory-time `registerTool`,
  `before_agent_start`, `context`, session/compaction, and custom-message hooks,
  but retain Cosmonauts' W1 human-prunable long-term store because Pi 0.80.6 has
  no equivalent mutable profile/playbook store or collision-save primitive.
  `pi.appendEntry()` is not used for proposals. If evidence contradicts this,
  stop and revise the plan before production changes.
- Seam: `missions/plans/profile-playbooks/pi-first-profile-playbooks-audit.md`
- Test: `missions/plans/profile-playbooks/pi-first-profile-playbooks-audit.md` >
  `Pi 0.80.6 recommendation gates W2 implementation`
- Marker: `@cosmo-behavior plan:profile-playbooks#B-001`

### B-002 - Three authored types use the unchanged shared interface

- Source: AC-009
- Context: the W1 `MemoryStore` contract accepts string record types and record
  type filters
- Action: contract tests write and retrieve `note`, `profile`, and `playbook`
  through one `createMarkdownMemoryStore()` instance
- Expected: all three types flow through the existing `write`/`retrieve`/
  `consolidate` signatures; `lib/memory/types.ts` and the architecture-map
  adapter require no contract changes; `consolidate()` remains the shipped
  no-op; no type/backend registry or plugin dispatch layer is added
- Seam: `lib/memory/types.ts`
- Test: `tests/memory/interface.test.ts` >
  `supports note profile and playbook through the unchanged MemoryStore contract`
- Marker: `@cosmo-behavior plan:profile-playbooks#B-002`

### B-003 - A confirmed profile save follows the user across projects

- Source: AC-001
- Context: a Cosmo turn in project A has no profile and the user directly asks
  for a durable preference to be added, or confirms Cosmo's proposal
- Action: Cosmo calls the extended `remember` tool with `type: "profile"`, the
  complete desired profile body, and a concise `changeSummary`
- Expected: one valid `type: profile`, `scope: user`, `kind: semantic` OKF file
  is created at the injected user root; the tool reports that it created the
  profile, the change summary, and human-readable path. A new Cosmo extension
  instance in project B with the same user root injects that profile body
  without a recall request.
- Seam: `domains/shared/extensions/agent-memory/index.ts`
- Test: `tests/extensions/agent-memory.test.ts` >
  `creates a user profile and injects it in a different project session`
- Marker: `@cosmo-behavior plan:profile-playbooks#B-003`

### B-004 - Profile updates replace the singleton in place

- Source: AC-002
- Context: a valid user profile already exists and a later confirmed update
  supplies the complete revised profile body
- Action: Cosmo calls `remember` with `type: "profile"` again
- Expected: the same `memory/agent/profile.md` path is atomically replaced, its
  timestamp advances, no second profile file exists, and the visible result says
  the profile was updated and includes `changeSummary`; an unchanged path, not
  byte identity, is the invariant
- Seam: `lib/memory/markdown-store.ts`
- Test: `tests/extensions/agent-memory.test.ts` >
  `updates the same profile file and reports the change summary`
- Marker: `@cosmo-behavior plan:profile-playbooks#B-004`

### B-005 - User-initiated playbooks save visibly in either supported scope

- Source: AC-003
- Context: the user directly asks to save a named repeatable procedure and no
  playbook with that canonical name exists in the selected scope
- Action: Cosmo calls `remember` with `type: "playbook"`, explicit `title`,
  explicit `scope`, description, and full procedure body
- Expected: a valid `type: playbook`, `kind: procedural` record is created under
  the project or user `playbooks/` directory as requested; the result states
  created name, scope, and human-readable path; the body convention is guided as
  when-to-use then steps but is not schema-validated
- Seam: `domains/shared/extensions/agent-memory/index.ts`
- Test: `tests/extensions/agent-memory.test.ts` >
  `saves named playbooks directly in project and user scopes`
- Marker: `@cosmo-behavior plan:profile-playbooks#B-005`

### B-006 - Cosmo-proposed saves wait for conversational confirmation

- Source: AC-003
- Context: Cosmo notices a durable preference or repeatable multi-step procedure
  that the user did not directly ask to save
- Action: Cosmo follows its prompt guidance
- Expected: Cosmo proposes the profile/playbook save, names the intended scope,
  and calls `remember` only after explicit assent; after a confirmed playbook
  call, the same visible created result from B-005 is produced. No event handler
  parses conversation or implements an approval state machine.
- Seam: `domains/main/prompts/cosmo.md`
- Test: `tests/domains/main-domain.test.ts` >
  `guides Cosmo to propose profile and playbook saves and call remember only after confirmation`
- Marker: `@cosmo-behavior plan:profile-playbooks#B-006`

### B-007 - Declined or unanswered proposals leave no pending state

- Source: AC-004
- Context: Cosmo proposed a profile/playbook save and the user declines or moves
  on without confirming
- Action: no save tool call occurs and later session lifecycle events run
- Expected: no record or store directory is created, no `pi.appendEntry()` call
  persists a proposal, no closure field retains pending-save data, and Cosmo does
  not repeat the proposal automatically. A later explicit request starts from
  current conversation/disk state rather than reconstructed approval state.
- Seam: `domains/shared/extensions/agent-memory/index.ts`
- Test: `tests/extensions/agent-memory.test.ts` >
  `declined or unanswered proposals write nothing and persist no pending state`
- Marker: `@cosmo-behavior plan:profile-playbooks#B-007`

### B-008 - Playbook names map to a deterministic human-readable identity

- Source: AC-005
- Context: a playbook title must map safely to one file identity in a project or
  user store
- Action: the authored-record policy canonicalizes the title
- Expected: identity is the NFKC-normalized, trimmed, lowercase title with runs
  outside Unicode letters/numbers replaced by `-`, edge separators removed, and
  a maximum of 80 Unicode code points; an empty result is invalid. Names with the
  same canonical key are the same playbook within one scope, while the same key
  in project and user scopes remains two records. New files use
  `playbooks/<canonical-key>.md` with no timestamp/hash fork.
- Seam: `lib/memory/authored-records.ts`
- Test: `tests/memory/markdown-store.test.ts` >
  `canonicalizes playbook names into stable scoped resources`
- Marker: `@cosmo-behavior plan:profile-playbooks#B-008`

### B-009 - Existing playbook names require confirmation before update

- Source: AC-005
- Context: a valid playbook with the same canonical name already exists in the
  requested scope, including a playbook whose human-edited frontmatter title now
  maps to that name
- Action: Cosmo first calls `remember` without `confirmUpdate`, then either gets
  user confirmation and repeats with `confirmUpdate: true`, or chooses a new
  name
- Expected: the first call returns `confirmation_required`, names the existing
  title/scope/path, writes nothing, and stores no pending state. Confirmation
  atomically replaces the existing file at its current path, reports `updated`,
  and leaves exactly one matching playbook. Choosing another valid name creates
  a separate file. The transient response exits by re-call, rename, or decline;
  it is never a persisted status.
- Seam: `domains/shared/extensions/agent-memory/index.ts`
- Test: `tests/extensions/agent-memory.test.ts` >
  `requires confirmation before updating a canonical playbook name`
- Marker: `@cosmo-behavior plan:profile-playbooks#B-009`

### B-010 - Playbooks are indexed compactly and recalled in full

- Source: AC-006
- Context: a valid playbook was saved in an eligible store and a later Cosmo
  turn/session starts
- Action: the extension builds current memory context and Cosmo calls unchanged
  `recall(query)` by playbook name or matching text
- Expected: the injected index includes playbook type, name, scope, timestamp,
  description, and path but not its body; recall searches all three authored
  types and returns the full playbook steps. The user-facing recall schema gains
  no type filter in W2 because text/name query plus the existing 5 default and 20
  maximum result bounds are sufficient at the ratified scale.
- Seam: `domains/shared/extensions/agent-memory/index.ts`
- Test: `tests/extensions/agent-memory.test.ts` >
  `indexes playbooks and recalls their full steps in a later session`
- Marker: `@cosmo-behavior plan:profile-playbooks#B-010`

### B-011 - New record scopes remain isolated across projects

- Source: AC-007
- Context: project A has a project playbook, the shared user root has a user
  playbook and profile, and project B uses the same user root
- Action: stores for both projects retrieve/inject current authored memory
- Expected: project A sees all three eligible records; project B sees the user
  playbook and profile but never project A's playbook; no project profile can be
  retrieved; `session` remains skipped exactly as W1 defines
- Seam: `lib/memory/markdown-store.ts`
- Test: `tests/memory/markdown-store.test.ts` >
  `keeps profile and playbook scopes isolated across projects`
- Marker: `@cosmo-behavior plan:profile-playbooks#B-011`

### B-012 - Malformed new records warn without hiding healthy records

- Source: AC-007
- Context: stores contain healthy records beside bad frontmatter, a profile in a
  project store, a user profile with non-user scope/non-semantic kind, a
  playbook with wrong scope/non-procedural kind, or a wrong type in a reserved
  profile/playbook path
- Action: retrieval scans the fixed W2 locations
- Expected: each invalid file is skipped with a warning naming its physical
  path and reason; healthy notes/playbooks/profile still return; store location
  decides eligibility and frontmatter cannot upgrade scope; the session remains
  usable and reads do not scaffold files
- Seam: `lib/memory/okf.ts`
- Test: `tests/memory/markdown-store.test.ts` >
  `skips malformed profile and playbook records with file warnings`
- Marker: `@cosmo-behavior plan:profile-playbooks#B-012`

### B-013 - Human profile edits and deletion win on the next turn

- Source: AC-008
- Context: after a profile save, the human edits its body/frontmatter or deletes
  `memory/agent/profile.md` outside Cosmonauts
- Action: the next injection/retrieval/recall runs in the same or another project
- Expected: edited disk content is injected and recalled as edited; after
  deletion no profile section is injected, recall cannot find it, no error is
  raised, and no blank profile is scaffolded. No process-local profile value can
  survive the disk change.
- Seam: `domains/shared/extensions/agent-memory/index.ts`
- Test: `tests/extensions/agent-memory.test.ts` >
  `reflects profile edits and deletion on the next injected context and recall`
- Marker: `@cosmo-behavior plan:profile-playbooks#B-013`

### B-014 - Human playbook rename, body edits, and deletion win on the next turn

- Source: AC-008
- Context: after a playbook save, the human edits its frontmatter title/body or
  deletes the file outside Cosmonauts
- Action: the next current-disk index/retrieval/recall runs
- Expected: the edited title/body are indexed and recalled under the new
  canonical name while the existing resource path remains stable; a later
  confirmed save under that edited name updates the same path; after deletion
  the playbook is absent from the injected index and recall. The persisted
  human-browsing `index.md` remains W1's write-regenerated derived artifact;
  “next index” here means the authoritative current-disk injected index.
- Seam: `lib/memory/markdown-store.ts`
- Test: `tests/memory/markdown-store.test.ts` >
  `reflects playbook rename edits and deletion without a stale cache`
- Marker: `@cosmo-behavior plan:profile-playbooks#B-014`

### B-015 - W1 notes and extension authorization remain unchanged

- Source: AC-009
- Context: existing note stores and the factory-registered, Cosmo-guarded
  `remember`/`recall` extension are upgraded to W2
- Action: the pre-existing W1 memory/interface/extension suites run and note
  calls omit the new discriminant
- Expected: omitted `type` still means `note`; note file names/layout, defaults,
  scope behavior, recency ordering, list mode, write-failure behavior, 5/20
  recall bounds, session skipped scope, no-op consolidation, allowlist presence,
  auth reset, non-Cosmo refusal, and absent-store inertness remain behaviorally
  intact. Existing tests are retained and extended rather than substantively
  rewritten.
- Seam: `tests/extensions/agent-memory.test.ts`
- Test: `tests/extensions/agent-memory.test.ts` >
  `preserves W1 note save recall allowlisting and Cosmo authorization`
- Marker: `@cosmo-behavior plan:profile-playbooks#B-015`

### B-016 - Profile and index share one profile-first byte budget

- Source: AC-010
- Context: eligible profile, note, and playbook records fit or compete within
  Cosmo's hidden context
- Action: `before_agent_start` performs one list-mode retrieval, partitions the
  singleton profile from notes/playbooks, and renders one custom message
- Expected: the profile body section comes first regardless of timestamp; the
  remaining notes/playbooks are most-recent-first and capped at 50 entries; all
  framing, profile content, index metadata, and truncation footers together are
  at most 12,000 UTF-8 bytes. Empty stores and an absent profile produce no
  empty section/scaffold. If only an index exists it can use the full combined
  budget.
- Seam: `domains/shared/extensions/agent-memory/index.ts`
- Test: `tests/extensions/agent-memory.test.ts` >
  `injects profile before the recency ordered note and playbook index within one 12000 byte budget`
- Marker: `@cosmo-behavior plan:profile-playbooks#B-016`

### B-017 - The profile bound is enforced on writes and honest for human edits

- Source: AC-010
- Context: tool/store writes can keep authored profiles small, but a human may
  edit the file beyond the supported bound
- Action: a profile write exceeds 4,000 UTF-8 body bytes, then a separately
  human-edited valid profile exceeds that size before injection
- Expected: the save is rejected before changing an existing profile; reads
  still accept the human-owned oversized file; injection includes a UTF-8-safe
  profile excerpt capped to 4,000 body bytes, an explicit profile-truncation
  notice with original/included sizes, and a direction to `recall` for the full
  profile. Recall returns the untruncated body and the combined message still
  remains within 12,000 bytes.
- Seam: `lib/memory/markdown-store.ts`
- Test: `tests/extensions/agent-memory.test.ts` >
  `rejects oversized profile writes and truncates oversized human edits honestly`
- Marker: `@cosmo-behavior plan:profile-playbooks#B-017`

### B-018 - New-type write failures are visible and leave no partial files

- Source: AC-003
- Context: profile creation/update or playbook creation/update targets an
  unwritable/blocked temporary store path
- Action: the store attempts its W1 atomic temp-write + rename path for each new
  type
- Expected: the tool returns `failed` with record type, intended scope/path, and
  filesystem reason; no temp or byte-partial new record remains; an existing
  record is either the previous complete file or the new complete file, never a
  truncated file; the session continues. The test exercises both `profile` and
  `playbook` rather than assuming note coverage generalizes.
- Seam: `lib/memory/markdown-store.ts`
- Test: `tests/memory/markdown-store.test.ts` >
  `reports profile and playbook write failures without partial files`
- Marker: `@cosmo-behavior plan:profile-playbooks#B-018`

### B-019 - W2 remains Cosmo-only and test-root isolated

- Source: AC-012
- Context: shared extensions may auto-load in package hosts and the production
  user root defaults to `~/.cosmonauts`
- Action: domain/extension tests collect tools, run Cosmo and non-Cosmo turns,
  and construct real markdown stores
- Expected: no new tool name is added; `remember` and `recall` stay
  factory-registered but refuse non-Cosmo execution before touching a store;
  only `main/cosmo` declares `agent-memory`; all W2 filesystem tests inject temp
  `userCosmonautsRoot`/`storeFactory` dependencies and make no model calls
- Seam: `tests/domains/main-domain.test.ts`
- Test: `tests/domains/main-domain.test.ts` >
  `keeps W2 memory Cosmo only without broadening the tool allowlist`
- Marker: `@cosmo-behavior plan:profile-playbooks#B-019`

## Design

### Decision log

- **D-001 — Extend `remember`; do not add two save tools.** Chosen: a TypeBox
  discriminated union adds `type: "profile" | "playbook"` branches while the
  omitted branch preserves W1 note calls. Alternatives: dedicated
  `update_profile`/`save_playbook` tools (clearer names but two more
  factory-visible tools and duplicated result/path handling), or an approval
  tool/workflow (contradicts the ratified conversational-confirmation rule).
- **D-002 — Keep one fixed-layout markdown store.** Chosen: add the user
  singleton and fixed `playbooks/` directories to
  `createMarkdownMemoryStore()`. Alternative registry/backend/type-handler
  machinery is rejected: three concrete authored variants in one store do not
  justify it.
- **D-003 — Canonical playbook key is the scoped stable identity.** Chosen:
  Unicode-readable deterministic slugs and a current-disk title scan preserve
  human rename-by-editing. Alternative exact-case names create accidental
  duplicates; timestamp/hash names defeat update-in-place.
- **D-004 — Profile write bound is 4,000 UTF-8 body bytes.** This leaves roughly
  two-thirds of the 12,000-byte combined message for framing and the index while
  keeping the profile useful. It is a record-size rule, not a reserved
  per-type injection budget: when no profile exists, the index uses the whole
  combined budget. Human oversize edits remain readable and are handled
  honestly rather than marked malformed.
- **D-005 — `recall` gets no type parameter in W2.** Existing text/resource
  matching already searches title, description, tags, resource, and body, and
  the result limits remain bounded. A type filter would widen user-facing
  surface without evidence at dozens-of-records scale.
- **D-006 — The W1 interface remains byte-for-byte structurally unchanged.** New
  authored policies live beside the contract; no result variant is added for
  confirmation. The extension preflights playbook collisions through
  `retrieve()` and only calls `write()` after explicit collision confirmation.
  If implementation proves this cannot be done without breaking
  `lib/memory/types.ts`, stop and report rather than revising the interface in
  scope.

### Module boundaries and dependency direction

- `lib/memory/authored-records.ts` (new) owns the finite authored vocabulary and
  cross-component policies: `note | profile | playbook`, the 4,000-byte profile
  write bound, and playbook-name canonicalization. It is plain TypeScript with
  no IO or Pi imports.
- `lib/memory/okf.ts` remains the OKF serialization/validation seam. Replace its
  note-only parsed shape with a discriminated authored-record union; validate
  common OKF keys plus location-specific type/scope/kind rules. It performs no
  filesystem IO.
- `lib/memory/paths.ts` remains fixed path resolution. Add profile and playbook
  resource/path helpers; it does not discover plugins or inspect Pi context.
- `lib/memory/markdown-store.ts` remains the only authored filesystem store. A
  small explicit `switch` handles the three write identities, and retrieval
  scans the fixed note directory, fixed playbook directory, and reserved profile
  path. It owns atomic file IO and deterministic per-store index regeneration.
- `lib/memory/index.ts` exports only the authored policy constants/helper needed
  by the Pi edge in addition to the existing public interface/factory. It does
  not export OKF parser internals.
- `domains/shared/extensions/agent-memory/index.ts` owns tool schemas,
  conversational-edge validation, collision preflight/results, Cosmo identity
  authorization, recall rendering, and the single hidden context message.
- `domains/main/prompts/cosmo.md` owns model guidance: what belongs in a profile
  versus a note/playbook, direct versus proposed save timing, complete-profile
  replacement semantics, collision confirmation, scope choice, and visible
  reporting.

Dependency flow is:

`domains/main prompt + Pi agent-memory extension -> lib/memory public API -> authored policies / OKF / fixed paths`

No `lib/memory/*` module imports outward. The architecture-map adapter continues
using only the existing shared contract and is not aware of authored W2 policy.

### Unchanged shared contract

`lib/memory/types.ts` remains unchanged. W2 uses the seams W1 deliberately
shipped:

```ts
// Existing fields; no W2 widening.
MemoryRecordDraft.type: string;
MemoryQuery.recordTypes?: readonly string[];
MemoryStore.write(record: MemoryRecordDraft): Promise<MemoryWriteResult>;
MemoryStore.retrieve(scope: MemoryScopeContext, query: MemoryQuery): Promise<MemoryRetrieveResult>;
MemoryStore.consolidate(): Promise<MemoryConsolidateResult>;
```

The architecture adapter may continue rejecting authored writes. The markdown
store supports exactly these authored combinations:

| Record type | Physical location | Allowed scope | Required kind | Identity/write rule |
|---|---|---|---|---|
| `note` | `notes/<timestamp>-<slug>-<hash>.md` | `project | user` | existing caller-selected kind | W1 append/deduplicate behavior unchanged |
| `profile` | user `profile.md` | `user` only | `semantic` | singleton complete-body replacement at one path |
| `playbook` | `playbooks/<canonical-name>.md` initially | `project | user` | `procedural` | create by scoped canonical name; confirmed writes update the existing matching path |

A profile draft's `content` is the complete desired document, not an append
fragment. This keeps `MemoryStore.write()` simple and makes replacement explicit;
Cosmo's prompt requires preserving current profile content and using the injected
current-disk body before producing the revision. `changeSummary` exists only at
the tool edge and is echoed in the visible result; it is not added to OKF or the
shared draft type.

### Store layout and OKF records

The W2 layout extends, rather than replaces, W1:

```text
<projectRoot>/memory/agent/
  index.md
  notes/*.md
  playbooks/<canonical-name>.md

<userCosmonautsRoot>/memory/agent/
  index.md
  profile.md
  notes/*.md
  playbooks/<canonical-name>.md
```

`<userCosmonautsRoot>` defaults to `~/.cosmonauts` in production and is injected
in tests. Existing W1 paths and note files remain valid without migration.

Profile frontmatter written by Cosmo uses `type: profile`, title `User profile`,
description `Durable user profile and preferences.`, resource
`memory/agent/profile.md`, timestamp, `scope: user`, `kind: semantic`, and
`source: main/cosmo`. The body is free-form markdown.

Playbook frontmatter uses `type: playbook`, the user-facing name as `title`, the
supplied/defaulted description, resource under `memory/agent/playbooks/`, tags,
timestamp, selected scope, fixed `kind: procedural`, and `source: main/cosmo`.
The body is free-form markdown; “when to use” followed by steps is prompt guidance
only.

The playbook filename is chosen from the canonical title on creation. Before a
write, the store scans valid playbooks in the physical scope and compares their
current frontmatter titles by the same canonicalizer. If one matches, it updates
that existing path, preserving a human rename-by-editing even when the old
filename no longer matches the edited title. If multiple valid files manually
claim one canonical name, or the default target path is occupied by an invalid
or differently named record, the write fails safely with the conflicting paths
instead of guessing or overwriting. Normal W2 saves never create duplicates.

The persisted per-scope `index.md` stays a write-regenerated, deterministic human
browsing artifact. It indexes valid notes and playbooks in recency order and
excludes the profile because the profile body has its own injection section.
Existing note entries remain present; no migration reads or rewrites a W1 store
on startup. Retrieval/injection never trusts this file, so human edits/deletions
are current on the next turn even if the browsing index waits for the next write
to regenerate.

### Extended `remember` and unchanged `recall` surface

Keep exactly two factory-registered tools. Model `remember` as a TypeBox
discriminated union:

```ts
type RememberInput =
  | {
      type?: "note";
      content: string;
      title?: string;
      description?: string;
      tags?: string[];
      scope?: "project" | "user";
      kind?: "semantic" | "procedural" | "episodic";
    }
  | {
      type: "profile";
      content: string;          // complete desired profile body
      changeSummary: string;    // visible, not persisted
    }
  | {
      type: "playbook";
      title: string;            // stable user-facing name
      content: string;
      description?: string;
      tags?: string[];
      scope: "project" | "user";
      confirmUpdate?: boolean;
    };
```

The note branch preserves every W1 default. Profile/playbook branches reject
empty required strings; callers cannot choose invalid scope/kind combinations.
The store repeats invariants at the public boundary because non-extension callers
can construct `MemoryRecordDraft` directly.

For playbooks, the extension calls existing list-mode retrieval with
`recordTypes: ["playbook"]`, compares canonical names, and returns a structured
`confirmation_required` tool result before any write. `confirmUpdate: true`
allows the subsequent write after the user assents. Nothing is placed in
`pi.appendEntry()`, session metadata, or extension closure. The only closure
state remains W1 authorization, reset on `session_start`, `session_shutdown`, and
every `before_agent_start`.

`recall` keeps `{ query, limit? }`, but retrieves
`recordTypes: ["note", "profile", "playbook"]`. Text matching and 5/20 result
bounds remain unchanged. Rendering becomes type-neutral (“authored memory
record”) while retaining type, title/name, scope, kind, timestamp, path, and full
body. No automatic playbook relevance gate is added.

### Retrieval, injection, and budget accounting

Each authorized `before_agent_start` performs one current-disk list-mode
retrieval for all three authored types with no global result limit, then:

1. take the sole valid user profile, if present;
2. sort eligible notes/playbooks by timestamp descending with path tie-break;
3. take at most the 50 most recent index records;
4. render one hidden `agent-memory-context` message with profile section first,
   then compact index; and
5. run one UTF-8-safe combined-budget truncation pass whose final output,
   including headers and all footers, is at most 12,000 bytes.

A tool-written profile body is at most 4,000 UTF-8 bytes. A human-edited larger
profile remains valid and recallable; injection takes a UTF-8-safe 4,000-byte
body excerpt and appends a profile-specific footer with original/included byte
counts and a `recall` direction. This is the profile's size bound, not a reserved
injection sub-budget. The index receives whatever combined budget remains; with
no profile it can use all 12,000 bytes. If index metadata is cut, its footer says
the index was truncated and points to `recall`. No truncation claim says records
were deleted or fully loaded.

The `context` hook continues removing older `agent-memory-context` messages, so
manual edits are reflected next turn without accumulated stale profile/index
messages.

### Cost, state, and failure ownership

- Per-turn cost is one full scan/parse of eligible `notes/`, `playbooks/`, and
  the reserved profile paths. A playbook save performs an additional collision
  preflight scan before its write. This is accepted for authored stores in the
  dozens; stores approaching hundreds of records remain the explicit ◆reassess
  trigger. No cache is introduced.
- Correctness state is only markdown on disk. Short-lived scan arrays and the
  authorization boolean do not outlive the turn or decide later correctness.
- Every transient confirmation outcome has an exit: confirm and re-call with
  `confirmUpdate`, choose another name and re-call, or decline/move on and retain
  no state.
- Reads never create directories/files. Profile deletion is represented by
  absence, not a blank default.
- Writes retain W1's temp-file + atomic rename and cleanup shape. Profile and
  playbook updates may change timestamps and therefore are not byte-idempotent;
  stable path/identity is the invariant. Derived `index.md` remains deterministic
  for an unchanged indexed record set.
- Project roots always come from Pi `ctx.cwd` and are bound when the store is
  created; user roots are injected/defaulted independently. This works for
  monorepos, unusual nesting, and projects without existing memory/config
  directories without assuming this repository's layout.

## Files to Change

- `missions/plans/profile-playbooks/pi-first-profile-playbooks-audit.md` (new) —
  Pi 0.80.6 evidence, recommendation, B-001 marker, and explicit gate outcome.
- `tests/memory/interface.test.ts` — prove the unchanged interface supports all
  three authored types and retains no-op consolidation/architecture adapter
  compatibility.
- `lib/memory/authored-records.ts` (new) — finite authored type vocabulary,
  profile write bound, and canonical playbook-name policy; no registry.
- `tests/memory/markdown-store.test.ts` — profile/playbook OKF round trips,
  singleton/name identity, invalid combinations, scope filtering, human
  override/deletion, write failures, deterministic index, and W1 regression.
- `lib/memory/okf.ts` — discriminated OKF parse/render/validation for note,
  profile, and playbook while preserving W1 note format.
- `lib/memory/paths.ts` — fixed profile/playbook paths/resources and safe scoped
  name resolution.
- `lib/memory/markdown-store.ts` — explicit three-type write semantics, fixed
  location scans, current-title collision resolution, profile bound on writes,
  and notes+playbooks index regeneration.
- `lib/memory/index.ts` — export the authored policy constants/helper required by
  the extension; keep parser/path internals private.
- `tests/extensions/agent-memory.test.ts` — extended `remember` union,
  profile/playbook visible flows, collision confirmation/no pending state,
  cross-project profile injection, all-type recall, human override, byte budget,
  and temp-root/Cosmo guard evidence while retaining W1 tests.
- `domains/shared/extensions/agent-memory/index.ts` — type-aware `remember`,
  all-type `recall`, collision preflight, generic result rendering, and one
  profile-first combined-budget context.
- `tests/domains/main-domain.test.ts` — Cosmo-only wiring/tool allowlist
  invariants and explicit-save prompt guidance.
- `domains/main/prompts/cosmo.md` — profile/playbook scope and content guidance,
  direct versus proposed save rules, collision confirmation, no nagging/pending
  behavior, complete-profile replacement, pull recall, and visible reporting.
- `docs/memory.md` — W2 layout/OKF examples, explicit-save flows, canonical
  identity, profile bound, one-budget injection, full-scan cost/reassess trigger,
  human override, failures, and unchanged no-op consolidation.

Files intentionally not changed: `lib/memory/types.ts`,
`lib/architecture-map/*`, `domains/shared/extensions/architecture-memory/*`,
`domains/main/agents/cosmo.ts` (the W1 extension is already wired), CLI code,
`fallow.toml`, generated `memory/architecture/*`, and any coding-agent
definition/prompt.

## Risks

- **Pi 0.80.6 already has an equivalent primitive:** building custom W2 state
  would violate Pi-First. Mitigation/pivot: B-001 runs first; contradictory
  evidence stops implementation and triggers plan revision.
- **The W1 interface proves insufficient:** adding confirmation/result/config
  fields to `MemoryStore` would silently break the spec's interface expectation
  and architecture sibling. Mitigation/pivot: collision confirmation stays at
  the extension edge; if `lib/memory/types.ts` must change, stop and report.
- **Profile complete replacement can lose stale content:** Cosmo could submit a
  delta or race a human edit. Mitigation: current disk is injected each turn,
  prompt/tool schema label content as the complete desired profile, updates are
  atomic, and no cache exists. Residual concurrent-writer protection beyond W1's
  atomic file pattern remains explicitly out by authoritative assumption.
- **Canonical-name collisions overwrite the wrong playbook:** punctuation,
  case, Unicode normalization, human title edits, or duplicate manual files can
  converge. Mitigation: one shared canonicalizer, preflight no-write response,
  explicit `confirmUpdate`, current-frontmatter scan, duplicate/occupied-path
  refusal, and mutation tests. Never guess between multiple matches.
- **Scope leakage:** a project profile or mismatched frontmatter could follow the
  user or expose another project. Mitigation: fixed physical locations decide
  eligibility before query matching; type/scope/kind validation and two-project
  temp-root tests cover every new type.
- **Profile starves the index or breaks UTF-8 accounting:** a large body/footer
  could exceed 12,000 bytes or hide all playbooks. Mitigation: 4,000-byte write
  bound, honest handling of human oversize edits, profile-first single-pass
  accounting including footers, Unicode mutation tests, and explicit ◆reassess
  budget-pressure documentation.
- **Write claims failure after corrupting an existing record:** update paths are
  correctness-sensitive. Mitigation: retain temp-write + rename, clean temp/new
  files on failure, and test blocked create/update paths for both new types. A
  file is always old-complete or new-complete, never byte-partial.
- **Factory registration broadens access or authorization leaks between turns:**
  shared extensions auto-load. Mitigation: add no new tools, preserve W1
  factory-registration and per-turn/session reset guard, and assert non-Cosmo
  calls never construct a store.
- **Per-turn scans grow expensive:** W2 adds fixed profile probes and one
  playbook directory per store. Mitigation: one list retrieval per injection,
  no duplicate profile/index scans, accepted dozens-of-records scale; approaching
  hundreds is the named pivot to the post-W2 reassess, not license for an in-scope
  cache.
- **Premature abstraction/dead future code:** three variants can tempt handler
  registries, backend config, W3 episodic schemas, or W4 result arms. Mitigation:
  fixed paths, a discriminated union, and an explicit switch only; complexity and
  dead-code gates reject future-wave scaffolding.
- **Plan/audit artifacts or test memory hit the wrong filesystem:** Drive may
  omit `missions/**`, and production defaults point at a real home directory.
  Mitigation: final status check includes the audit artifact; every test injects
  temp roots/store factories and never invokes models.

## Quality Contract

| Order | Gate kind | Tier | Binding state | Threshold | Protocol | Degradation / notes |
|---:|---|---|---|---|---|---|
| 1 | `correctness` | universal | bound | Project-native test, lint, and typecheck evidence passes; all pre-existing W1 memory and agent-memory tests remain present and green; W2 tests make no model calls or real-home writes | project-discovered | hard fail |
| 2 | `artifact-conformance` | universal | bound | B-001..B-019 have all required fields, root-relative evidence paths, and exact markers in the named test/audit files | artifact evidence | hard fail |
| 3 | `boundary-conformance` | bindable | bound | `lib/memory/types.ts` is unchanged; `lib/memory/*` has no Pi/CLI/domain/architecture imports; only `main/cosmo` consumes agent-memory; architecture-map code is unchanged; no registry/backend/approval machinery appears | project-discovered | hard fail |
| 4 | `mutation` | bindable | bound | Targeted negatives fail on: profile project scope/non-semantic kind, playbook non-procedural kind, cross-project playbook leak, same canonical name written without confirmation, collision response writing/persisting state, stale human edit cache, deleted records retained in injected context, oversized/Unicode profile exceeding budget, and failed writes leaving partial files | project-discovered | hard fail |
| 5 | `complexity` | bindable | unbound | W2 remains one store, two tools, fixed layout, finite discriminated variants, and no speculative configuration/dispatch layer | reviewer judgment | unbound, not enforced mechanically; reviewer must inspect |
| 6 | `dead-code` | bindable | unbound | No W3 episodic capture, W4 consolidation/mining, pending proposal persistence, relevance gate, cache, embeddings, backend registry, extra agent wiring, or unused result variant ships | reviewer judgment | unbound, not enforced mechanically; reviewer must inspect |

## Implementation Order

1. **Write the Pi-First audit and lock the build/lean decision (B-001).** Check
   `package.json`, installed Pi 0.80.6 docs/types/changelog, context-file
   behavior, extension hooks, session custom entries, and compaction. If Pi now
   provides equivalent long-term mutable profile/playbook semantics, stop and
   revise rather than building parallel machinery. Preserve the plan-local audit
   in final version control state.

2. **Pin W1 and the unchanged contract before refactoring (B-002, B-015).** Run
   existing memory/extension suites as characterization coverage, add failing
   contract tests for the two new `type` values through the existing interfaces,
   and add an explicit source/boundary assertion that `lib/memory/types.ts` did
   not widen. If tests require a new interface field or result arm, stop and
   report the spec's interface assumption failure.

3. **Add authored policies and store behavior one red/green/refactor loop at a
   time (B-004, B-008, B-011, B-012, B-014, B-017, B-018).** Start with profile
   create/update at the fixed user path, then playbook canonical creation and
   stable updates, then multi-scope retrieval, OKF validation/warnings, human
   rename/edit/delete behavior, profile write bound, atomic failure cases, and
   deterministic notes+playbooks index regeneration. Preserve note fixtures and
   assertions. Refactor only after each named test passes; use an explicit switch,
   not a registry.

4. **Extend the save edge without adding tools or pending state (B-003, B-005,
   B-007, B-009, B-019).** First add the discriminated `remember` schema while
   keeping omitted `type` as W1 note. Add profile visible create/update results
   and complete-body/change-summary validation. Then add playbook collision
   preflight, no-write `confirmation_required`, confirmed update, and non-Cosmo
   guard/temp-root evidence. Test decline/unanswered behavior by proving no tool
   call, file, store directory, `appendEntry`, or closure state exists.

5. **Generalize recall and build the single profile-first context (B-010, B-013,
   B-016, B-017).** Use one all-type list retrieval, partition profile from the
   50-entry note/playbook index, render current disk content, and apply UTF-8-safe
   12,000-byte accounting including both profile/index footers. Add later-session,
   cross-project, human edit/delete, Unicode, oversize-human-profile, and full
   recall evidence before changing documentation.

6. **Encode conversational UX and document W2 (B-006, B-019).** Update Cosmo's
   prompt with direct/proposed save timing, explicit scope, complete profile body,
   collision confirmation, visible outcome, no nagging, and pull recall. Update
   main-domain tests without adding tools or consumers. Expand `docs/memory.md`
   with exact layout/OKF examples, profile bound, canonical playbook identity,
   budget/cost stance, human operations, and exclusions.

7. **Run the Quality Contract and inspect final scope.** Verify project-native
   correctness, all behavior markers/evidence, import boundaries, W1 test
   retention, targeted mutation negatives, and temp-root/no-model isolation.
   Check final status for the Pi audit under `missions/**`. If review or tests
   reveal approval-state, cache, registry, backend, extra-consumer, W3/W4, or
   shared-interface pressure, remove it or revise/abort the plan rather than
   silently expanding scope.

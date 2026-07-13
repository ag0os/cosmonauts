## Purpose

W1 (`memory-interface`, shipped 2026-07-09) gave Cosmo a durable notebook:
explicit `note` records behind the shared `write`/`retrieve`/`consolidate`
interface, sibling project/user stores, index-inject + pull recall. But notes
are flat remarks. Two kinds of knowledge the track was created for still have
nowhere first-class to live:

- **Who the user is** — role, preferences, working style, standing
  constraints. Today this either isn't captured or is scattered across notes
  that compete for index space and never cohere into a picture.
- **How the user likes things done** — repeatable procedures ("how we cut a
  release", "how I triage my inbox"). A procedure saved as a note has no
  stable identity: it can't be found by name, updated in place, or refined as
  the procedure evolves.

W2 grows the authored record vocabulary from exactly `note` to
`note | profile | playbook`, and ships explicit-save v1: Cosmo may *propose*
("save that as a playbook?", "want that in your profile?") but writes only on
explicit confirmation — no silent capture. Everything stays self-authored,
plain markdown, human-prunable.

This is **W2** of the `agent-memory` track. Source of truth:
`missions/architecture/agent-memory.md`. Committed track scope is W1–W2, then
the ◆reassess gate; W3 (episodic log) and W4 (dreaming/consolidation) stay
out. Profile + playbooks also gate `ambient-cosmo` phase 3 and feed
`executive-assistant` on the autonomy track — downstream consumers, not W2
scope.

## Users

- **The human working with Cosmo** — stops re-explaining who they are and how
  they like things done. They confirm every save before it happens, can read
  any record as plain markdown, edit or delete it, and the system respects the
  edit on the next turn: memory remains *proposed truth the user can
  override*. The profile is *their* dossier — legible, one file, prunable.
- **Cosmo (`main/cosmo`)** — the sole W2 consumer, as in W1. Starts each
  session already knowing the user (profile injected) and what procedures
  exist (playbooks in the index), and can pull a playbook's full steps by name
  or query when the situation calls for it.
- **The developer at the ◆reassess gate** — inherits a type vocabulary that
  proves the W1 interface generalizes (three authored types, differing write
  semantics, zero interface rework is the expectation), plus honest evidence
  on scan cost and budget pressure to decide W3/W4 and multi-agent expansion
  with.

The substrate targets any project cosmonauts runs in; this repo is the first
dogfooding target.

## User Experience

### The profile — one evolving user-scoped record

The profile is a single markdown document in the **user** store
(`~/.cosmonauts/`) — one per user, never per project. It holds durable facts
about the person: role, preferences, communication style, environment,
standing constraints. Free-form markdown body under OKF frontmatter; the
human can open it, rewrite it, or delete it whole.

- **Learning:** the user states something durable ("I prefer terse answers",
  "my mornings are blocked for deep work"). Cosmo offers: "want me to add
  that to your profile?" On yes — or when the user directly says "add this to
  my profile" — Cosmo updates the document **in place** (the profile evolves;
  it does not accumulate timestamped copies) and states what changed and
  where. On no, nothing is written.
- **Using:** in every later session (any project), Cosmo starts with the
  profile content in context — this is the one record whose *body* is
  injected, because a standing picture of the user is the point. Project
  facts do not belong in the profile; they remain project-scoped notes.
- **Owning:** human edits win. An edited profile is what Cosmo sees next
  turn; a deleted profile simply means no profile context, nothing
  scaffolded, and Cosmo may start proposing again from scratch.

### Playbooks — named procedures, project- and user-scoped

A playbook is a named, durable "how to do X": when to use it, then the steps.
Project-scoped playbooks (how *this repo* cuts a release) live in the project
store, git-tracked and shared with the team; user-scoped playbooks (how *I*
triage email) live in the user store and follow the user everywhere.

- **Saving (explicit-save v1):** two entry points, both visible —
  1. *User-initiated:* "save this as a playbook" → Cosmo saves directly,
     stating name, scope, and path.
  2. *Cosmo-proposed:* after walking a repeatable multi-step procedure, Cosmo
     may ask "save that as a playbook?" — it writes **only** on explicit
     confirmation in the conversation. A declined or unanswered proposal
     writes nothing and persists no pending state anywhere.
- **Identity:** unlike notes, a playbook has a **stable name**. Saving under
  an existing name is an *update* to that playbook — Cosmo says it's updating
  (not creating) and confirms before overwriting; no duplicate files, no
  timestamped forks. This is what makes playbooks refinable.
- **Using:** playbooks appear in Cosmo's injected memory index (name, scope,
  description) alongside notes; `recall` pulls the full steps. Pull, not
  push — no automatic "this situation matches playbook X" gate in W2.
- **Owning:** plain markdown files a human can edit, rename-by-editing, or
  delete; the next turn reflects reality on disk.

### Notes keep working

Everything W1 shipped is unchanged for `note` records: same files, same
`remember`/`recall` behavior, same index entries. Existing stores need no
migration; a W1 store is a valid W2 store.

### Injection — one budget, profile first

Cosmo's hidden memory context remains a single injection under the **one
combined 12,000-byte budget** W1 set (no per-type sub-budgets). Priority
order inside it: profile body first (it is bounded and small), then the
compact index of playbooks and notes, most-recent-first. Truncation stays
honest — a truncation footer says what was cut and points at `recall`. Empty
stores and absent profile inject nothing and scaffold nothing.

### Failure, invalid, empty, and cancel flows

- **Proposal declined** ("no", or the user moves on) — nothing written, no
  pending-save state persisted; Cosmo doesn't nag.
- **Name collision on save** — Cosmo surfaces that a playbook with that name
  exists in that scope and confirms update vs. choosing another name before
  writing.
- **Malformed profile or playbook file** (bad frontmatter, wrong type/scope
  for its store) — skipped with a warning naming the file; healthy records
  and the session are unaffected. Same contract as W1 notes.
- **Profile absent or deleted** — no profile context injected, no error, no
  scaffolding; `remember`-style profile updates create it fresh on the next
  confirmed save.
- **Write failure** (unwritable store, permission error) — reported honestly
  with path and reason, no partial file, session continues (W1 `failed` arm,
  now exercised by two more types).
- **recall matching nothing** — honest empty result naming searched scopes,
  unchanged from W1.

## Acceptance Criteria

- **Profile round-trip:** the user tells Cosmo a durable preference and
  confirms; a single profile document with valid OKF frontmatter exists under
  the user store; Cosmo states what it added. In a *new session in a
  different project*, Cosmo demonstrably has the profile content in context
  without being asked.
- **Profile evolves in place:** a second confirmed profile update modifies
  the same document (no second profile file); Cosmo states what changed.
- **Playbook save via both entry points:** a user-initiated "save this as a
  playbook" and a Cosmo-proposed-then-confirmed save each produce a playbook
  file with valid OKF frontmatter under the correct scope store, with Cosmo
  stating name, scope, and path.
- **Explicit-save is real:** a declined proposal produces no file, no store
  change, and no persisted pending state — verifiable by test.
- **Stable playbook identity:** saving a playbook under an existing name in
  the same scope updates that file after confirmation; the store never holds
  two files for one playbook name+scope.
- **Playbook recall:** in a later session, the saved playbook appears in the
  injected index, and `recall` returns its full body (the steps).
- **Scope filtering holds for new types:** a project playbook never surfaces
  in a different project; user playbooks and the profile follow the user
  across projects; store/frontmatter scope mismatches are skipped with
  warnings.
- **Human override:** after the human edits a playbook or the profile on
  disk, the next retrieval returns the edited content; after deletion, the
  record is gone from index, injection, and recall.
- **W1 regression:** all shipped `note` behavior is preserved — the
  pre-existing W1 memory and extension test suites pass without substantive
  rewrites.
- **One-budget injection:** profile + index inject as one context message
  within the single 12,000-byte budget, profile prioritized, truncation
  honest and pointing at `recall`.
- **Pi-First re-audit evidence exists** for the pinned Pi 0.80.6: findings on
  any Pi memory/profile/preference primitives, with an explicit
  build-vs-lean-on-Pi recommendation recorded before new machinery is built.
- **Full project gates pass** (test, lint, typecheck); the suite makes no
  model calls and never touches the real `~/.cosmonauts`.

## Scope

Included:
- Two new authored OKF record types — `profile` (singleton, user-scoped,
  update-in-place) and `playbook` (many, named, project- or user-scoped,
  update-by-name) — through the existing `lib/memory/` interface and
  markdown store; type-specific write semantics and validation.
- Explicit-save v1 in Cosmo: user-initiated saves and Cosmo-proposed,
  confirmation-gated saves for playbooks and profile updates; visible
  outcomes; prompt guidance for when to propose.
- Profile-body + combined-index injection under the single existing budget;
  `recall` over all three authored types.
- Scope filtering, human-override, honest-failure, and no-scaffolding
  behavior extended to the new types, with tests (temp roots only).
- Pi-First re-audit of Pi 0.80.6 for anything W2 would otherwise build.
- `docs/memory.md` updated for the W2 vocabulary and flows.

Excluded:
- W3 episodic log; W4 background consolidation, decay, pruning, playbook
  *mining* (implicit learning) — explicitly out; `consolidate()` stays a
  no-op.
- Any silent/background capture; any persisted "pending proposal" state.
- Extending memory injection or tools to any agent other than `main/cosmo`
  (cody/coding agents wait for the ◆reassess gate — that expansion triggers
  the combined-budget reassessment with the architecture map).
- An always-on relevance gate / push recall ("this matches playbook X").
- Embeddings, SQLite, vector search; any retrieval cache (per-turn full
  rescan stance is re-affirmed for W2 — see Assumptions).
- Converging per-plan distilled bundles (`memory/<slug>.md`) onto the
  interface — stays a separate convention; reconsidered at the gate.
- Registry/plugin machinery for record types or backends beyond what three
  concrete types in one store need.
- Migration or import of any external memory format (e.g. Claude Code's
  MEMORY.md).

## Assumptions

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

## Open Questions

Deliberately left to the planner (HOW, not product scope):
- **Tool surface:** extend `remember` with a `type` parameter vs. dedicated
  `save_playbook` / `update_profile` tools — whichever yields the clearest
  confirmation UX and smallest prompt surface; product only requires
  explicit, visible, type-aware saves and collision confirmation.
- **Exact file layout** for the profile document and `playbooks/` directory,
  and slug rules for playbook names (including what "same name" means across
  scopes).
- **Profile size bound** inside the combined budget, and the honest behavior
  when the profile alone exceeds it.
- **Whether `recall` needs a type filter parameter** for the user-facing tool
  or query text suffices at W2 scale.

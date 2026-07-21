# Memory

Cosmonauts memory is a small, plain-text substrate. W2 provides explicit
authored notes, one user profile, and named playbooks. W3 adds an optional
episodic log of consequential project and user events. Files remain human-owned,
current disk is the source of truth, and Pi session state remains responsible
for short-term conversational continuity.

Only main/cosmo consumes authored agent memory. The extension still exposes
exactly two tools: remember for explicit saves and recall for pull retrieval.

## Fixed Store Layout

Project and user memory use sibling stores with fixed locations:

~~~text
<projectRoot>/memory/agent/
  index.md
  notes/*.md
  playbooks/<canonical-name>.md
  episodes/*.md

~/.cosmonauts/memory/agent/
  index.md
  profile.md
  notes/*.md
  playbooks/<canonical-name>.md
  episodes/*.md
~~~

The production user root is ~/.cosmonauts; tests inject a temporary
userCosmonautsRoot. Project memory is for facts and procedures tied to the
current repository or workspace. User memory follows the user across projects.
The profile exists only in the user store.

index.md is a deterministic, write-regenerated browsing artifact with
type: memory-index. It lists valid notes and playbooks, not the profile.
Retrieval never trusts the index, so it may temporarily lag a human edit until
the next write without making recall stale. Generated architecture maps remain
separate under memory/architecture/. The episodes/ directories are not
scaffolded by reads and exist only after an episode file is written or a human
creates one. Episodes never appear in index.md.

## Authored OKF Records

Authored records are markdown with OKF v0.1-style YAML frontmatter. Required
fields are type, title, description, resource, tags, timestamp, scope, and kind;
source is optional. The markdown body is the complete content returned by
recall.

A note keeps the W1 append-style identity and may use any supported memory kind:

~~~markdown
---
type: note
title: Release branch
description: Staging deploy branch.
resource: memory/agent/notes/20260708T140000000Z-release-branch-a1b2c3d4.md
tags:
  - deploys
timestamp: 2026-07-08T14:00:00.000Z
scope: project
kind: semantic
source: main/cosmo
---
Staging deploys happen from the release branch.
~~~

The profile is a singleton user-scoped semantic record at the stable
memory/agent/profile.md resource:

~~~markdown
---
type: profile
title: User profile
description: Durable user profile and preferences.
resource: memory/agent/profile.md
tags:
  - communication
timestamp: 2026-07-13T14:00:00.000Z
scope: user
kind: semantic
source: main/cosmo
---
I prefer concise status updates with explicit risk callouts.
~~~

A playbook is a named procedural record in either durable scope:

~~~markdown
---
type: playbook
title: Release Deploy
description: Use after a production release is approved.
resource: memory/agent/playbooks/release-deploy.md
tags:
  - release
timestamp: 2026-07-13T15:00:00.000Z
scope: project
kind: procedural
source: main/cosmo
---
When to use: after release approval.

1. Verify the release commit.
2. Create the tag.
3. Deploy and validate.
~~~

The playbook body convention is “when to use” followed by steps; it is prompt
guidance rather than a schema requirement. An omitted description defaults to
the title.

The supported combinations are fixed:

| Type | Scope | Kind | Write identity |
|---|---|---|---|
| note | project or user | semantic, procedural, or episodic | W1 timestamp/slug/hash file |
| profile | user only | semantic | one complete document replaced at profile.md |
| playbook | project or user | procedural | current title's canonical key within the scope |

session remains a recognized contract scope but has no markdown store. Writes
to it return unsupported, and retrieval reports it in skippedScopes. Pi session
state and compaction cover short-term memory.

## Profile And Playbook Identity

The profile is always one document. Every profile update supplies the complete
desired body, not an append fragment or patch, and atomically replaces the same
path. The visible result distinguishes created from updated and includes the
caller's changeSummary. A malformed existing profile.md is not silently
overwritten; the user must fix or delete that human-owned file first.

Before an existing profile is replaced, its prior content is copied to
profile.md.prev next to it — exactly one previous version, overwritten on each
replacement. The sidecar is never listed, retrieved, or indexed. To recover
from a bad overwrite, copy profile.md.prev back over profile.md by hand. If
the sidecar cannot be written, the replacement fails and the current profile
is left untouched.

A playbook's identity is its current frontmatter title canonicalized as follows:

1. normalize with Unicode NFKC;
2. trim and lowercase;
3. replace runs outside Unicode letters and numbers with a hyphen;
4. remove edge separators; and
5. keep at most 80 Unicode code points.

An empty result is invalid. Equal canonical keys in one scope identify the same
playbook; the same key in project and user scope identifies two different
playbooks.

The current title, not the filename, determines identity. If a human changes
Release Deploy to Shipping in frontmatter, the existing path can remain
release-deploy.md, the shipping key now targets that file, and the old
release-deploy key is free. The old title is not retained as an alias. If a new
Release Deploy then needs the still-occupied default filename, it uses the
first deterministic free suffix, such as release-deploy-2.md. Multiple valid
files claiming one current canonical title are returned with a warning naming
the conflicting paths, and writes to that ambiguous identity are refused.

## Explicit Save And Failure Flows

Memory writes are always visible tool calls:

- A direct user request to remember something saves immediately, subject to the
  playbook collision rule.
- If Cosmo notices a durable preference or repeatable procedure without a save
  request, it proposes a profile or playbook save, names the intended scope, and
  calls remember only after explicit assent.
- A declined or unanswered proposal writes nothing, creates no pending state,
  and is not repeated as a nag.
- Profile content holds durable facts and preferences about the user. Project
  facts remain notes. Every profile update supplies the complete revised body
  and a visible changeSummary.
- Every playbook save supplies a name and an explicit project or user scope. A
  new playbook result states the created name, scope, and human-readable path.
- If one valid playbook already has the canonical name in that scope, an
  unconfirmed call returns confirmation_required with the existing name, scope,
  and path and writes nothing. After the user confirms, Cosmo re-calls remember
  with confirmUpdate: true. Declining or choosing another name leaves no
  confirmation state behind.
- Malformed or misplaced records are skipped with file-specific warnings while
  healthy records remain available. Invalid type/scope/kind combinations and
  oversized profile writes are rejected without changing disk.
- Filesystem failures report the record type, intended scope/path, and reason.
  Atomic temp-write and rename behavior leaves no partial file, and the session
  can continue.

## Recall And Injection

Cosmo uses an index-inject plus pull-recall model. On each authorized
before_agent_start, the extension performs one current-disk list retrieval
across all three authored types and renders one hidden agent-memory-context
message:

1. the current user profile body, if present;
2. compact metadata for at most the 50 most recent notes and playbooks, ordered
   by timestamp with a path tie-break;
3. honest truncation notices directing Cosmo to recall; and
4. a memory-warnings section naming records that could not be read (at most 5
   entries, each clamped, with an overflow count). Warnings also appear in
   recall's visible text. A store whose only content is unreadable still
   injects the warnings notice, so a mangled profile is named instead of
   silently forgotten.

The profile and compact index share one UTF-8 budget of 12,000 bytes, including
headers and notices. The profile comes first. This is not a per-type split: with
no profile, the index may use the whole budget.

Tool-written profile bodies are limited to 4,000 UTF-8 bytes. A valid profile
that a human edits beyond that bound remains readable and recallable. Injection
includes only a UTF-8-safe 4,000-byte excerpt plus the original/included byte
counts, path, and recall direction. That truncated excerpt is never a safe
update source: Cosmo must recall the full body first. If the complete desired
replacement still exceeds 4,000 bytes, the write is rejected, the existing file
is preserved, and the user is asked to shorten it or provide an intentionally
shorter complete replacement.

The compact note/playbook index never includes record bodies. recall(query)
searches the current project and user stores and returns full bodies across
notes, profile, and playbooks. It defaults to 5 non-profile results and caps a
requested limit at 20; a matching profile is pinned first outside that window
so full-profile recovery cannot be shadowed by newer records. W2 adds no type
parameter and no automatic relevance/push-recall gate.

## W3 Episodic Log

### Project Gate And Store Layout

Episodic capture is project-gated and OFF by default. The only gate is the
current project's `.cosmonauts/config.json`:

~~~json
{
  "episodicLog": {
    "enabled": true,
    "warningThreshold": 500
  }
}
~~~

Capture is enabled only when `episodicLog.enabled` is literally true. An absent
config, an absent object, false, or a malformed enabled value leaves W3 off.
There is no user-config loader or user-level gate. An enabled project may still
write a user-scoped episode to the injected `~/.cosmonauts` store when the event
itself is cross-project.

`warningThreshold` is a positive integer and defaults to 500 when absent or
invalid. Capture and enabled recall load the current project setting and pass
the effective threshold into each fresh store they construct. The store remains
config-free; a direct consumer must pass the same effective threshold when it
constructs its own store.

Each episode is one independent OKF markdown file directly under
`memory/agent/episodes/`. Project and user scopes use their corresponding roots.
There is no shared `log.md`. The timestamp/action/hash filename permits
independent atomic writers and record-granular human deletion:

~~~markdown
---
type: episode
title: Drive run "run-e360ace0" completed.
description: drive.run completed for run:run-e360ace0.
resource: memory/agent/episodes/20260721T170000000Z-drive-run-a1b2c3d4.md
tags:
  - attempt:attempt-42
  - action:drive.run
  - outcome:completed
  - subject:run:run-e360ace0
  - writer:cosmonauts
timestamp: 2026-07-21T17:00:00.000Z
scope: project
kind: episodic
source: coding/worker
---
Timestamp: 2026-07-21T17:00:00.000Z
Actor: coding/worker
Action: drive.run
Outcome: completed
Subject: run:run-e360ace0

Drive run "run-e360ace0" completed.
~~~

Machine-written episode bodies begin with Timestamp, Actor, Action, Outcome,
Subject, and an optional Payload line, followed by a concise summary and optional
details. `source` is the actor. `scope` is only project or user, and `kind` is
always episodic.

### Finite Event Vocabulary

W3's event vocabulary is closed and finite. These are the only actions:

| Action | Capture rule and conventional envelope |
|---|---|
| `chain.run` | Project-scoped start and one terminal outcome (`succeeded`, `failed`, or `aborted`); subject `chain:<run-id>`. |
| `drive.run` | Project-scoped start and terminal result; subject `run:<run-id>` and a non-reserved `attempt:<attempt-id>` tag. |
| `plan.created` | Project-scoped successful creation; subject `plan:<slug>`, outcome is the persisted plan status. |
| `plan.status-changed` | Project-scoped real status transition only; subject `plan:<slug>`, outcome is the new status. |
| `task.created` | Project-scoped successful creation; subject `task:<task-id>`, outcome is the normalized persisted status. |
| `task.status-changed` | Project-scoped real status transition only; subject `task:<task-id>`, outcome is the normalized new status. |
| `memory.saved` | Only after a note, profile, or playbook is actually written; scope matches that authored record and subject is its `memory:<resource>`. |
| `autonomy.wake` | Project- or user-scoped wake record for a future host; stable trigger subject and required stable payload. |

Raw Pi session start/end, turns, tool calls, chain stages, Drive task chatter,
same-status updates, rejected/declined/failed authored saves, and arbitrary file
edits are not captured. Pi session state remains the session-scope answer; W3
does not capture raw sessions or create a session-scoped markdown store.

Plans and tasks use the qualified Pi actor at interactive tool edges and
`cosmonauts/cli` at CLI edges. Authored saves use `main/cosmo`. A chain uses its
first executable stage's resolved qualified id (the first member for a
group-first chain), with the raw stage name only when resolution is unavailable.
A Drive launch freezes the exact execution-resolved qualified worker id,
including project/live domain bindings; resolution failure warns and skips
capture instead of inventing a generic actor. `autonomy.wake` uses the future
host/trigger actor supplied by its owner.

The reserved tag prefixes are exactly `action:`, `outcome:`, `subject:`,
`payload:`, and `writer:`. Machine serialization removes caller-supplied tags
using those prefixes and writes the canonical values. Outcomes are normalized,
non-empty tokens. Subjects and payloads are stable kind/id references encoded as
`subject:<kind>:<id>` and `payload:<kind>:<id>`; a payload is optional except for
`autonomy.wake`, where it is required. Non-reserved tags remain available for
owner metadata such as a Drive attempt id.

### Recall, Injection, And W2 Preservation

Episodes are recall-only. When W3 is enabled, the existing recall tool adds
episode to its internal record-type query and can return full episode bodies,
actor, subject, and payload. Episodes are never injected into the hidden memory
context and are never indexed in `index.md`; injection continues to request
exactly note/profile/playbook and does not even scan episodes.

With the gate absent or disabled, W2 remember, recall, injection bytes, tool
schemas, and tool results remain byte-identical, and no episode directory, file,
or induced index file is created. The W2 authored-save contract is untouched:
remember remains an explicit, sequential tool; direct save requests may run
immediately, inferred profile/playbook saves require explicit consent, and a
declined or unanswered proposal writes nothing.

Hand deletion is represented by absence. A human-edited valid episode remains
recallable on the next full scan; a malformed episode is skipped and named only
by an episode-touching recall, never by injection. Recall's visible warning text
and structured warning details report malformed paths/reasons and the per-scope
large-log guard. Capture failures never change the triggering primary result:
interactive plan/task/memory tools append one visible warning, chain tools add a
non-fatal warning to their final model-visible result, Drive publishes a
`driver_diagnostic` through its legacy/durable/session-bus paths, and CLI or
off-session callers fall back to bounded stderr. Reporter failure also falls
back to stderr; capture and warning delivery are both non-load-bearing.

### Append-Forever Cost And Provenance

W3 is append-forever until a human deletes files or a later consolidation design
acts. Every episode-touching retrieval performs a full, current-disk rescan and
reads every eligible episode file again. Its `stats` report `filesScanned`,
`bytesRead`, and `durationMs`, including malformed files. There is no episode
cache, retention window, write cap, automatic pruning, or delete API.

The large-log guard is evaluated separately for each physical project/user
scope. When, and only when, that scope's file count is strictly greater than the
fresh store's configured threshold, retrieval warns `episode log large — N
records; run consolidation`. The warning is informational; it does not skip or
remove records.

`writer:cosmonauts` is editable provenance only. A human can add, remove, or
copy it. The short filename hash is for naming/deduplication, not authentication;
W3 supplies no SHA-256 integrity envelope, edit detection, trust decision, or
safe-prune guarantee. The `memory-consolidation` plan owns the machine-vs-human
trust predicate, including how it combines provenance with its own consumed
watermark.

### Fresh-Process Wake And Drive Reconstruction

A fresh process reconstructs wake state from retrieved episode content: the
persisted `source`, subject, required payload, outcome, and timestamp. It does
not depend on retained in-memory defaults or filesystem mtime. The future
autonomy host reuses this store and envelope; W3 does not implement that host,
triggers, scheduling, or a second wake-state store.

Drive likewise makes terminal identity content-derived. The primary result's
persisted `completedAt` supplies the terminal episode timestamp and, together
with run id, attempt id, actor, and outcome, its deterministic identity.
Reconciliation never derives identity from the completion file's mtime, so
completion rewrites and resume/abort reconciliation converge on one terminal
episode. Reconcilable inline, `startDetached` plus `abort()`, and resume surfaces
have terminal evidence. One residual is deliberately scoped: an externally
hard-killed fire-and-forget `launchDetached` child has no reconciling parent and
may leave a start-only episode.

## Human Ownership And Authored-Memory Cost

Markdown on disk is the only correctness state. A human may edit, retitle, or
delete a profile or playbook; the next scan and recall reflect that change.
Reads do not scaffold missing files, and deletion is represented by absence.
Project memory is normally git-tracked; user memory lives outside the
repository.

W2 authored-memory injection intentionally uses no content cache. Each
authorized turn performs one full logical scan and parse of eligible notes/,
playbooks/, and reserved profile paths across the project and user stores. A
playbook save is worst-case three store scans:

1. the extension collision preflight;
2. the store's own current-title/conflict scan for callers that use the public
   store directly; and
3. the notes-plus-playbooks index.md regeneration scan.

That cost is accepted while authored stores remain in the dozens of records.
Stores approaching hundreds of records are the explicit post-W2 reassess
trigger; W2 does not add a cache, registry, or alternative backend in advance.

## Boundaries

W3 preserves these limits:

- Only main/cosmo declares the agent-memory extension. Factory registration
  keeps remember and recall host-visible, but both reject non-Cosmo execution
  before store access.
- The shared MemoryStore write, retrieve, and consolidate signatures remain
  unchanged. Retrieved records add only optional actor provenance through
  `source`.
- consolidate() remains an explicit no-op. There is no pruning, decay,
  playbook mining, or dreaming.
- There is no persisted proposal/approval workflow, record/backend registry,
  relevance gate, embeddings/vector search, SQLite backend, autonomy host,
  user-config loader, session store, trust engine, pruning API, W4 machinery, or
  additional agent wiring.

Drive runs may exclude missions/** and memory/** artifacts when preparing
commits or diffs. Always check git status when memory files are expected to be
part of a change.

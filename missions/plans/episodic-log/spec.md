## Purpose

Agents do consequential work — runs, saves, plan and task transitions — and
today none of it is remembered anywhere an agent or human can cheaply consult.
The episodic log is the append-only "what happened" record of agent memory's
taxonomy: durable, per-scope, human-legible, prunable. It exists for three
consumers at once (the source-of-truth docs call this "one log, three roles"):

1. **Memory** — the episodic facet Cosmo and the human can query.
2. **Wake-state** — what the autonomy host remembers across wakes
   (`autonomy-host` plan reuses this store; it must not invent a second one).
3. **Audit trail** — the record autonomy governance will later read.

Per the 2026-07-17 ◆reassess decision this ships as infrastructure:
config-gated, **off by default**, zero behavior change until enabled.

## Users

- **The human (project owner)** — opens episode files or asks Cosmo to see
  what agents did in a session, a day, or a run; prunes or deletes freely
  (files are proposed truth, human-owned like all agent memory).
- **Cosmo** — answers "what did we do last time / what happened while I was
  away" from episodes via recall.
- **The consolidation job** (sibling plan) — reads episodes as its raw input.
- **The autonomy host** (sibling plan) — writes wake events and reads its own
  durable state from the same log.

## User Experience

**Disabled (default):** nothing. No new files, no new tool behavior, sessions
byte-identical to today.

**Enabling:** one documented config flag (project or user cosmonauts config).
No code change, no migration.

**Enabled:** meaningful agent actions append episodic records to the scope
store the action belongs to (project store for project work; user store for
cross-project events). Each record is a small human-readable OKF file naming
when, which agent, what happened, and the outcome. The v1 event vocabulary is
deliberately coarse — session start/end, memory saves, chain/drive run
start/end with outcome, plan/task lifecycle transitions — refined by the
planner, not an exhaustive firehose.

**What enabling must NOT do:** flood Cosmo. Episodes stay out of the injected
memory index by default; they are reachable through explicit recall queries.
Enabling the log must not measurably change the injected context of a normal
session.

**Reviewing:** the human can read episodes as plain files, and Cosmo can
answer questions about recent activity by recalling them.

**Pruning / failure:** deleting any or all episode files by hand never breaks
a later session. A failed episode write warns and the session continues — the
log is never load-bearing for the work that generates it. Malformed episode
files surface through the existing memory-warnings channel (named path +
reason in recall text and injected context).

## Acceptance Criteria

- With the flag off (default), no episodic file is ever created and a
  session's injected context and tool behavior are identical to today.
- With the flag on, a session that performs logged actions leaves
  human-readable episode records in the correct scope store, each naming
  timestamp, actor, action, and outcome.
- Enabling the log does not change the injected memory index of a session
  (episodes are excluded from injection by default).
- An explicit recall query can return episodes.
- Hand-deleting episode files, or a store containing only malformed episodes,
  never breaks a session; malformed files are named via the existing warnings
  surfacing.
- A failed episode write leaves the triggering action successful and the
  session running, with a visible warning.
- The scan-cost `stats` seam reports episodic scanning like any other record
  type, so log growth is measurable before the use-it decision.
- The flag and the event vocabulary are documented in `docs/memory.md`.

## Scope

Included:
- Episodic record type through the existing `MemoryStore` contract and OKF
  store layout (the W1/W2 seams absorbed profile and playbook; episodes are
  the third test of that bet).
- Capture wiring for the v1 event vocabulary, config-gated.
- Retrieval eligibility (recall yes, injection no) and warnings parity.
- The config flag and documentation.

Excluded:
- Consolidation, pruning policy, decay (`memory-consolidation` plan).
- Triggers, wakes, scheduling (`autonomy-host` plan) — though that plan will
  write its wake events here.
- Governance/trust tiers (autonomy W3).
- Session-scoped episodic storage — W1's Pi-First audit ratified Pi session
  state as the session-scope answer; re-audit before building any of it.
- Embeddings or any retrieval beyond scope + recency + recall.

## Assumptions

- Project scope is the primary capture target (the "run/decision log" of the
  taxonomy); user-scope cross-project episodes are supported by the store but
  capture defaults conservative. Planner refines which events are user-scoped.
- The gate is a cosmonauts config flag (exact key and level — project vs user
  vs both — is a planner decision).
- Episode records are one file per episode under the existing agent store
  (OKF reserves `log.md` as an alternative single-file convention; planner
  chooses file-per-episode vs log-file and must justify against prunability
  and scan cost).
- A Pi-First re-audit opens the plan (standing rule), particularly on session
  lifecycle events (`pi.on` surface) for capture points.

## Open Questions

- Exact v1 event vocabulary and its noise budget: what is worth remembering
  per session such that a week of enabled use stays readable and scannable?
  (The `stats` numbers should inform the ceiling.)
- Do chain/Drive runs log through the same capture path as interactive
  sessions, and under which actor identity?
- Retention: is v1 "append forever until consolidation exists," or is there a
  cheap size guard (e.g. warn past N episodes) before W4 lands?

## Design-session resolutions (2026-07-17)

Added by the W3 design session after a code-grounded read of the shipped
memory store (`lib/memory/*`), the Cosmo agent-memory extension, the config
loader, and the Pi 0.80.6 lifecycle surface. These resolve the Open Questions
and correct three overstatements. They are ratified inputs for the planner;
the human will review them in the plan gate.

**Pi-First audit verdict (opening step, re-confirmed).** Pi 0.80.6 exposes
`session_start` / `session_shutdown` / `before_agent_start` / `turn_start` /
`turn_end` / `tool_call` / `tool_execution_end` / `context` plus
`pi.appendEntry()` (session JSONL). These are *capture hooks*, not a durable
cross-session/project store. The W1 finding stands: Pi session state +
compaction cover **session-scope** episodic, so v1 builds no session-scoped
store — v1 episodic is the **project/user-scope run & decision log** on the
existing markdown store. No new Pi capability is required. A written audit
artifact is a backlog task (and Drive strands `missions/**` — commit it by
hand).

**OQ1 — v1 event vocabulary and noise budget (RESOLVED).** v1 captures
*consequential project/user-scope events*, not per-session chatter:
run lifecycle (chain/Drive run start + end-with-outcome), plan lifecycle
(created, status transition), task lifecycle (created, status transition),
and authored-memory saves (note/profile/playbook written). The autonomy
host's **wake event** is a run/decision-class record of this same shape; the
`episodic-log` plan owns the record type + capture helper, the host plan owns
calling it. Noise budget target: `O(runs + lifecycle transitions)` per active
period, **not** `O(sessions × turns)`. The `stats` seam measures it.

**OQ2 — chain/Drive actor identity (RESOLVED).** Capture is a **framework-level
helper** (e.g. `recordEpisode()` in `lib/memory/`), not extension-only, because
chain/Drive/host events fire from framework code with no Cosmo turn. One helper,
one record shape; the actor varies via the existing `source` field —
`main/cosmo` for interactive saves, the run's qualified agent id (e.g.
`coding/worker`) for chain/Drive runs, the trigger/host id for wakes. A stable
subject id (run id / plan slug / task id) rides in tags for consumer filtering.

**OQ3 — retention before W4 (RESOLVED).** v1 is **append-forever** (pruning is
W4's job) **plus a cheap size guard**: when a scope's episode count exceeds a
documented, config-overridable threshold, retrieval surfaces a warning through
the existing warnings channel ("episode log large — N records; run
consolidation"). No pruning, no decay — just measurable back-pressure so the
operator sees growth before W4 lands.

### Corrections to the spec above

1. **Drop raw session start/end from the v1 vocabulary.** The User Experience
   section lists "session start/end" among logged actions; that contradicts the
   ratified "Pi session state covers session-scope" and would spam one pair of
   episodes per one-shot `-p` invocation. v1 logs run/decision-class events, not
   raw session lifecycle. (If a single end-of-session summary proves wanted, it
   is a run-scope event, decided later — not two raw lifecycle episodes.)

2. **The v1 gate is a project-level `.cosmonauts/config.json` flag.** "project or
   user cosmonauts config" overstates today's surface: only a project config
   loader exists (`loadProjectConfig`); there is no user-level cosmonauts config
   loader. v1 gates capture with a project flag (additive `ProjectConfig` field,
   parsed like `architectureMap`). A user-level gate is new infrastructure —
   defer. User-scope *episodes* still write to the user store when captured from
   an enabled project.

3. **Malformed-episode warnings surface on episode-touching recalls, not on
   every session.** Acceptance says malformed files are named "via the existing
   warnings surfacing," which today runs during injection retrieval. But
   injection must **not** scan episodes (that is what keeps enabling the log from
   changing injected context / flooding Cosmo). So a malformed *episode* file is
   named when a recall (or CLI listing) that requests episodes runs — not at
   session start, unlike a malformed note or profile. This is the deliberate,
   correct trade of "injection excludes episodes" against "warnings parity"; the
   acceptance criterion should read accordingly.

### Key mechanism directives for the planner (design, not product)

- **Episodes flow through the unchanged `MemoryStore` contract** as
  `type: "episode"`, `kind: "episodic"` (`episodic` already exists in
  `MEMORY_KINDS`). This is the third test of the W1/W2 "seams absorb a new type
  with `lib/memory/types.ts` untouched" bet. Prefer no `types.ts` change; an
  additive change is allowed only if genuinely required (hardening's `stats`
  precedent). The real store surface to add: a `writeEpisode` branch, an episode
  parse/`expectedType` path, an `episodes/` store dir in `paths.ts`, and
  **conditional** episode scanning in retrieval.
- **File-per-episode under `memory/agent/episodes/*.md`** (timestamp+slug+hash
  naming, mirroring notes), not a single `log.md`. Justification: consolidation
  prunes by unlinking one file; concurrent writers never contend; it reuses the
  existing atomic temp+rename + `listMarkdownFiles` machinery. `log.md` would be
  a whole-file rewrite hazard and un-prunable at record granularity.
- **Injection-exclusion and recall-inclusion are one seam:** retrieval scans the
  `episodes/` dir **only when the query's `recordTypes` includes `"episode"`**.
  Injection requests `["note","profile","playbook"]`, so it never walks the
  episodes dir → zero added per-turn scan cost and a byte-identical injected
  index. Recall (and any episode CLI/consumer) adds `"episode"` to `recordTypes`
  and pays the scan then. This satisfies "recall yes, injection no" with no
  types.ts change and keeps the per-turn full-rescan stance intact.
- **Also exclude episodes from `index.md` regeneration** (today it filters only
  `profile`). The on-disk browsing index must not bloat with episodes.
- **Fail-soft capture:** the helper wraps `store.write` in try/catch, never
  throws into the triggering action; a write failure logs a non-fatal warning
  (session context via the memory-warnings channel; off-session via stderr/log).
- **Scan-cost tension is real, surfaced not papered over:** episodes accumulate
  faster than notes and are re-scanned per episode-touching recall. v1 keeps the
  ratified no-cache full-rescan stance and bounds the problem with the OQ3 size
  guard + `stats`; if volume ever threatens the stance, that is the adoption /
  reassess input, not a v1 cache.

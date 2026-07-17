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

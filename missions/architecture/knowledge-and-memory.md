# Knowledge & Memory — Unified Forward Architecture

**Status: RATIFIED 2026-08-18 (drafted by agent; every ruling Decided-by:
human). §10 amended on record 2026-08-25 — see §10.1.** Forward source of
truth for cosmonauts' knowledge & memory system.
Supersedes `agent-memory.md` (absorbed whole) and `architectural-memory.md`
(curated facets absorbed; the derived code-structure map carved out to
`code-structure-map.md`). All seven §11 questions were ruled 2026-08-18. §9's
invariant candidates remain drafts for plan `## Intent` sections —
deliberately not yet `INV-###`.

This document records the unified forward picture for two tracks that
converged: `agent-memory.md` (profile, playbooks, episodic log, the shared
memory interface) and `architectural-memory.md` (code-structure map, decisions
and rationale, per-plan work history). Section 8 lists exactly what it
superseded in each; everything not listed there stands unchanged.

Per `deviation-protocol.md`, every ruling here was human-made — amend-on-record
where it touched ratified ground (the ◆reassess ordering, the sibling-track
boundary). Agents drafted; the human decided.

---

## 1. Why this document exists

Three things changed the picture:

**The memory system should serve every agent, not only Cosmo.** Today
`domains/shared/extensions/agent-memory/` is wired into `main/cosmo` alone.
That was a correct W1 scoping decision and it is now the main constraint: the
knowledge most worth having is knowledge that helps a *worker* do the next task
well.

**A project's durable knowledge is the main event.** The high-value corpus is
"how this project is being built and why" — important decisions, not every
decision — serving whatever agent is working. Targets any project cosmonauts
runs in, software or otherwise.

**The two tracks now describe the same corpus.** `architectural-memory.md`
facets 2 and 3 (*Decisions & rationale — distilled from plans*; *Work history —
per-plan distilled knowledge bundles*) and its W2/W4 waves are precisely this
knowledge base. Its stated boundary against agent-memory — "user vs repo",
"self-authored vs derived/curated" — dissolves once memory is framework-wide
and project knowledge is the primary record class. Two docs describing one
system will drift.

**Proposal: one knowledge system, several record classes, two capture
pipelines.** Not two tracks.

---

## 2. The reframe: memory is the mechanism, knowledge is the payload

- **Memory** stays the name of the *mechanism* — `write` / `retrieve` /
  `consolidate`, the stores, the scopes, the budgets. Shipped code and a shipped
  interface; renaming buys nothing.
- **Knowledge** names the *highest-value record class* the mechanism carries:
  curated, durable, project-scoped, readable by every agent. What you would hand
  a new team member.

This is consistent with what is already in the repo: the record format is OKF —
*Open Knowledge Format* — and `lib/sessions/types.ts` already types knowledge as
`decision | trade-off | gotcha | convention`.

**Knowledge is not `AGENTS.md`.** `AGENTS.md` is *instructions* — how to behave,
always loaded, necessarily small. Knowledge is *facts and rationale* — what is
true here and why, large, pulled on demand. Confusing the two produces either an
unreadable `AGENTS.md` or a knowledge base nobody consults.

---

## 3. The tier map

| Tier | Holds | Lifecycle | Reads | Writes |
|---|---|---|---|---|
| **Knowledge** | project decisions, conventions, trade-offs, gotchas, patterns | durable, curated, git-tracked | all agents | humans + consolidation *proposals* |
| **Playbooks** | named procedures | durable, promoted | all agents | humans + consolidation *candidates* |
| **Working state** | "where we left off" | singleton, overwritten each session | all agents | end-of-session writer |
| **Profile / global** | user preferences and facts across projects | durable, user-scoped | all agents | Cosmo + human |
| **Episodes** | raw typed event log | transient, consumed then pruned | consolidation only | framework capture |

Consolidation is the pump from the bottom row to the top rows.

**Conceptual axes** (carried over from `agent-memory.md`): records classify as
semantic (facts) / procedural (how-to) / episodic (what happened), across
session / project / user scopes. Short-term memory ≈ the live session context
plus a small scratchpad — largely Pi's job already (session state, compaction);
Pi-First audit before building any short-term machinery.

**Promotion ladder:** `episode → candidate → knowledge/playbook → skill`. Each
rung trades locality for authority. The last rung — a local habit becoming a
shipped, reviewed capability in a domain — stays a deliberate human act with a
commit attached. Consolidation may propose memory; it may never produce product.

**Working state deserves attention as the cheapest win.** "We were working on X,
finished Y, next is Z" does not accumulate and needs no consolidation — it is
*overwritten*. That is the profile's exact shipped mechanics (singleton,
body-injected, bounded, `.prev` sidecar). It is close to free and it directly
answers "a new session should know what happened last time."

---

## 4. Physical layout

**Decision (proposed): `knowledge/` sits beside `memory/`, not inside it.**

```
knowledge/                       # human-curated, git-tracked, all agents read
  index.md
  <records>.md

memory/                          # machine-managed store
  agent/{index.md,notes,playbooks,episodes,profile.md}
  agent/proposals/               # consolidation candidates awaiting promotion
  architecture/                  # derived code-structure map (code-structure-map.md)

~/.cosmonauts/
  knowledge/                     # user-scoped twin — cross-project knowledge
  memory/agent/{...,profile.md}
```

Beside, not inside, because it makes the human/machine boundary **physical and
enforceable by path** rather than by promise. W4 introduces the first machine
*deletion* authority anywhere in the memory tree; "consolidation never touches
human-curated knowledge" should be true by layout, not by a rule an
implementation can drift away from.

**A user-scoped twin exists** — cross-project knowledge, distinct from the
profile. The profile is *who you are and what you prefer*; user knowledge is
*things you know that outlive any one repo*. Different record class, same
mechanism, and the analogue of a global memory file in other harnesses.

Migration: the 36 existing `memory/*.md` distillations and the 10
`memory/*.knowledge.jsonl` bundles are the seed corpus. They already carry
`source: archive` provenance frontmatter.

### Record format — OKF v0.1 (ratified 2026-07-02; scope confirmed 2026-08-18)

All records — knowledge, notes, playbooks, proposals — are OKF markdown (Open
Knowledge Format, github.com/GoogleCloudPlatform/knowledge-catalog): YAML
frontmatter (`type` required; `title`, `description`, `resource`, `tags`,
`timestamp` recommended), reserved `index.md`/`log.md`, relative links as
untyped relationship edges, with a project-defined `type` vocabulary and custom
keys on top. For knowledge records the `type` vocabulary absorbs
`KnowledgeRecord`'s: `decision | trade-off | gotcha | convention`. The
`.knowledge.jsonl` format is **retired** — the 10 existing bundles migrate to
OKF records, and `lib/sessions/knowledge.ts`'s JSONL path goes with them (zero
production consumers, so retirement costs nothing). OKF is serialization only;
retrieval and consolidation stay behind the memory interface.

---

## 5. Sources of knowledge

Ranked by knowledge density per token:

| Source | Density | Coverage | Cost | Status |
|---|---|---|---|---|
| **Artifacts** — specs, plans, reviews, decision logs, tasks | highest; already structured and human-reviewed | planned work only | cheap | in use by the archive skill |
| **Transcripts (Tier 2 markdown)** | low, but holds the unique material: dead ends, rejected alternatives, *why not* | everything | expensive | 350 files exist; distiller reads them |
| **Episodes** | near zero as currently defined | every consequential event | trivial | shipped, gated off |

### Episodes are the spine, not the content

W3's event vocabulary is closed and finite: `chain.run`, `drive.run`,
`plan.created`, `plan.status-changed`, `task.created`, `task.status-changed`,
`memory.saved`, `autonomy.wake`. That is an **activity log**. It records that
things happened, not why. A consolidation pass whose only input is episodes
distills approximately nothing of value — this is the sharpest problem with
`memory-consolidation`'s spec as written.

Reframed, episodes become valuable: an episode carries run id, plan, task,
actor, outcome, and time. That is exactly the **pointer** a consolidation pass
needs to locate the relevant artifacts and transcript slice without reading the
whole corpus. Walk the spine → read what it points at → distill → prune the
spine entries consumed.

### Use Tier 2, never Tier 1

Raw session JSONL carries full tool results (file contents, command output,
environment), is coupled to Pi's session `version: 3` format which moves on
lockstep bumps, and is roughly two orders of magnitude larger. The filtered
`.transcript.md` tier already exists and is already readable. This decision is
already made correctly in the archive skill and should not be revisited.

### Extracted versus offered

- **Project knowledge is extracted.** Complete coverage, retroactive, no
  dependence on an agent remembering to save while busy doing something else.
- **User knowledge is offered.** "I prefer flat conditionals", "never push
  without asking" — knowable only in the moment, from what the user said. W2's
  explicit-save already does this well and should stay the mechanism.

### What already exists (verified 2026-08-18)

- `bundled/coding/agents/distiller.ts` — a read-only, GPT-backed agent whose
  stated job is "read plan artifacts and session transcripts → structured
  KnowledgeBundle JSONL".
- 350 `.transcript.md` files, generated by `lib/sessions/session-store.ts`.
- 474 raw session JSONL — 24MB active, **2.2GB archived**.
- 36 `memory/*.md` distillations; **10** `memory/*.knowledge.jsonl` bundles.
- `lib/sessions/knowledge.ts` — read/write for those bundles, with **no
  production consumer**. Records are written and never read.

The extraction pipeline is built and half-run. The gap is **retrieval and
consistency**, not extraction.

---

## 6. Retrieval and access

The pattern is unchanged and stays: **compact index always loaded, detail pulled
on demand**, filtered cheap-to-expensive — scope, then recency, then explicit
`recall`, with embeddings only as a last filter if the first three fall short.

**Ratified: read for all, write for few.** Opening *retrieval* to every agent is
the cheap, safe half. Opening *authoring* to every agent is precisely how the
endless-growth failure arrives — twelve agents each saving what felt important
produces noise, not knowledge. Authorship stays narrow: humans, Cosmo, and the
consolidation pass.

**Ratified 2026-08-18: knowledge reaches agents through a small always-injected
index plus `recall`** — index-then-detail, exactly like the other two consumers.
Retrieval-only was rejected: a corpus reachable only when an agent thinks to ask
is halfway back to unread, and unread is the failure this whole doc exists to
end.

**The injection budget must be reassessed.** The memory index is bounded at
12,000 bytes and the architecture map at 24,000. W1 explicitly flagged that "a
future agent consuming both must reassess a combined budget" — going
framework-wide *is* that moment, and the knowledge index makes a third consumer
of the same per-turn space. All three live inside one reassessed combined
budget; the number is a plan-stage call.

---

## 7. Consolidation — the pump

**Consolidation is lossy compression, not transcription.** If a run produces one
record per episode it has failed. Most of what happened is not worth
remembering, and deciding what is not worth remembering *is the job*. This is
the real answer to unbounded growth, and it is the kind of property an
implementation drifts away from silently — so it belongs in ratified intent, not
in prose.

**Sources are an input contract, not a hardcoded assumption.** The mechanism
should accept episodes (spine), artifacts, and transcripts behind one seam, so
adding a source later is not a rewrite.

**It is a chain, not a monolith.** Propose → review → write maps onto machinery
this repo already has. A single unreviewed model pass writing into a git-tracked
knowledge base is the wrong shape.

**Trust and prune authority.** It never writes the profile. It never modifies or
deletes human-authored or human-curated records. Name collisions surface as
proposals, mirroring W2's confirm-update semantics. Deletion authority extends
only to machine-written episodes it has consumed.

**Ratified 2026-08-18: consolidation writes to a proposals area on the machine
side of the path boundary** (`memory/agent/proposals/`), never inside
`knowledge/`. Promotion into `knowledge/` is a human act — or Cosmo with
explicit assent. This keeps C-1 enforceable by path rather than by frontmatter
promise, and answers the `memory-consolidation` spec's open question on where
candidates live.

**The safe-prune predicate, stated honestly.** W3 established that
`writer:cosmonauts` is provenance, not proof, and that a content digest cannot
be a sound trust predicate — a human can edit a file and reproduce any digest.
The sound narrower version: **prune only bytes still identical to what the run
read and distilled.** That protects any edit made during a run. For an episode
edited before the run, machine and human content are genuinely
indistinguishable — say so plainly rather than promise protection that cannot be
implemented.

**Failure safety.** Distillation lands before its episodes are pruned, per
batch. An interrupted run leaves every remaining episode either intact or
already durably represented; a re-run completes cleanly. Reuse the two-phase
intent→confirm pattern from `episodic-log-detached-hardening` rather than
reinventing it.

---

## 8. What this superseded (executed 2026-08-18)

**In `agent-memory.md`:**

- Cosmo-only scope for authored memory → framework-wide *read*, narrow *write*.
- W4 framed as "dreaming / memory hygiene" → W4 as the general raw-to-curated
  pump feeding a project knowledge base, with pluggable sources.
- The implicit assumption that episodes are consolidation's input → episodes are
  the spine; artifacts and transcripts are the content.

**In `architectural-memory.md`:**

- The sibling-track boundary ("distinct from general/operational agent memory…
  its own doc") → one system, one doc, several record classes.
- W2 (architecture-of-record) and W4 (semantic retrieval over KnowledgeRecords)
  → folded into the knowledge surface and its retrieval, rather than sequenced
  separately behind the code-structure map.

**Explicitly unchanged and still ratified:** OKF v0.1 as the record format
(2026-07-02); the shared memory interface and its `write`/`retrieve`/
`consolidate` shape; the premature-abstraction guard; sibling stores per scope;
disk-as-only-truth with no cache; the derived code-structure map (W1, shipped)
and its cache-on-hash spine; explicit-save v1 semantics; the `episodicLog` gate
defaulting off; Tier-2-not-Tier-1 for transcripts.

### Lineage ledger

- `agent-memory.md` (deleted 2026-08-18) re-homed the former `agent-memory`
  ROADMAP idea and defined the shared memory interface; absorbed here whole.
- `architectural-memory.md` (deleted 2026-08-18) had absorbed the former
  ROADMAP items `architecture-of-record` (→ the intended-architecture knowledge
  record class, here) and `embedding-memory` (→ §6's embeddings-as-last-filter,
  here); its derived code-structure map, `reuse-scan` discipline, and the
  deferred presentation/health layer moved to `code-structure-map.md`.
- The intended-architecture record (former architectural-memory W2) is a
  knowledge record class here; its divergence from the derived map remains the
  **drift signal** — the comparison spans this doc and `code-structure-map.md`.
- Autonomy-track consumers stay cross-linked, not absorbed: `ambient-cosmo` and
  `executive-assistant` consume profile/playbooks; the autonomy host schedules
  consolidation (`autonomy.md`).

---

## 9. Invariant candidates

Drafted for the `## Intent` sections of the plans that derive from this. Not yet
ratified; IDs are provisional and deliberately not `INV-###`.

- **C-1 — Human-authored and human-curated records are never modified or
  deleted by a machine.** Machine authority covers what the machine wrote.
- **C-2 — The profile is never machine-written by consolidation.**
- **C-3 — Nothing is pruned that is not already durably represented**, and only
  when its bytes are unchanged since the run read them.
- **C-4 — Every machine write is visible and attributable** — provenance in the
  record, project-scope results reviewable as a diff. *(Promoted →
  `knowledge-surface` INV-6, human-ratified 2026-08-18.)*
- **C-5 — Consolidation output is lossy by design.** One record per input is a
  failure, not a success.
- **C-6 — Knowledge records are distilled, never verbatim.** Transcripts contain
  raw file contents and command output, plausibly secrets; knowledge is
  git-tracked. Verbatim excerpting is an exfiltration path with a friendly name.
  *(Promoted → `knowledge-surface` INV-5, human-ratified 2026-08-18.)*
- **C-7 — The always-on cost of memory does not grow with the size of the log.**
  Episodes are never injected and never indexed.
- **C-8 — Consolidation may propose memory; it may never produce product.**
  Promotion to a shipped skill is a human act.

---

## 10. Resequencing — **RATIFIED 2026-08-18 (Decided-by: human)**

The ◆reassess gate (2026-07-17) committed to infrastructure-first via exactly
three plans: `episodic-log` (shipped), `memory-consolidation`, `autonomy-host`.
On 2026-08-18 the human ratified the amendment below (amend-on-record): the
infrastructure-first stance and the relative order of the two committed plans
stand unchanged; a knowledge-surface plan (with working state riding along or
adjacent) is inserted ahead of them. Grounds: the pump needs a destination —
without the knowledge surface's layout, format, and retrieval, consolidation
output lands where the 10 unread JSONL bundles landed; and the existing
36-record corpus has no retrieval while consolidation as specced has no corpus.

**Observation:** `memory-consolidation` has good retrieval and no corpus worth
consolidating. The knowledge surface has a real corpus already — 36
distillations plus 10 structured bundles — and no retrieval at all. The cheapest
path to agents doing better work is not new extraction; it is giving the
existing corpus a home, wiring retrieval so every agent can reach it, and
bringing distiller coverage from 10/36 to consistent.

**Ratified order:**

1. **Knowledge surface** *(new plan)* — `knowledge/` beside `memory/` plus the
   user twin, record format, all-agent retrieval, combined injection budget,
   migration of the existing corpus, distiller coverage. *(completed
   2026-08-21 — shipped, archived, distilled to
   `knowledge/knowledge-surface.md`)*
2. **Working state** *(small; could ride with 1)* — the singleton
   "where we left off" record. *(superseded 2026-08-25 — parked; see §10.1)*
3. **`memory-consolidation` (W4)** — reframed as the general pump: pluggable
   sources, episodes as spine, lossy by design, trust rules, prune safety.
   *(amended 2026-08-25 — re-spec required before tasks; see §10.1)*
4. **`autonomy-host`** — unchanged; it is the scheduler, and by then it has a
   payload worth scheduling. *(§10.1 adds a second named consumer)*

### §10.1 Amendment — 2026-08-25 (Decided-by: human)

Amended on record in the 2026-08-25 re-assessment session, after the
knowledge-surface ship and in the same session that reorganized `ROADMAP.md`
around the portable-harness / software-factory thesis. The
infrastructure-first stance stands; the queue changes as follows:

1. **① Knowledge surface — completed** (2026-08-21). Leaves the queue.
2. **Two items are inserted ahead of the remaining queue:**
   - **Adoption** — enable the shipped knowledge surface *in this repository*
     (a dogfooding act, on record; shipped defaults stay OFF), deliberately
     exercising internal cosmonauts coordinators and agents — recent usage
     has been external-coordinator-only, so internal agents are the
     unobserved population — and record what retrieval actually does. Every
     remaining design decision currently rests on theory; this converts them
     to observations. *(ROADMAP: `knowledge-adoption`.)*
   - **Observational-memory investigation** — Pi-First audit and trial of
     `pi-observational-memory` (github.com/elpapi42/pi-observational-memory;
     requires the Pi lockstep bump to ≥0.81.0 for `agent_settled`, with the
     mandated API re-audit), and design of its seams with this system: its
     `recall` tool vs ours, Reflector output as a live consolidation source,
     and whether a continuously-maintained observation log subsumes working
     state. *(ROADMAP: `observational-memory`.)*
3. **② Working state — parked pending the OM investigation.** *Supersedes
   "small; could ride with 1":* an observation log may provide "where we left
   off" for free; build the singleton only if the investigation says
   otherwise.
4. **③ `memory-consolidation` — position unchanged, re-spec before any
   tasks.** The sources contract must admit OM reflections and
   externally-coordinated session data (ROADMAP: `external-session-capture`)
   behind the pluggable-sources seam, and the spec's stale open question on
   where candidates live must be reconciled with §11's proposals-area ruling
   rather than re-litigated by a planner.
5. **④ `autonomy-host` — unchanged in shape, still last.** It gains a second
   named consumer beside the dreaming loop: `factory-modes`'
   `ask-and-continue` escalation resumes on the host's event-wait trigger.

---

## 11. Decisions — all ruled 2026-08-18 (Decided-by: human)

- ~~Ratify or reject the resequencing in §10~~ — **ratified 2026-08-18**, and
  the track merge in §1/§8 with it (formalized by the doc-structure ruling
  below).
- ~~Does this doc replace both existing docs, or sit above them?~~ —
  **ratified 2026-08-18: replace, with one carve-out.** This doc absorbs
  `agent-memory.md` entirely and `architectural-memory.md`'s curated facets
  (decisions & rationale, work history, architecture-of-record); the derived
  code-structure map — plus reuse-scan and the deferred presentation/health
  layer — moves to its own small doc (`code-structure-map.md`). The boundary
  that stays is lifecycle: derived-never-authored vs. curated. The restructure
  executes at the end of this review, once the remaining rulings land.
- ~~Knowledge record format~~ — **ratified 2026-08-18: OKF markdown only.**
  The `KnowledgeRecord` vocabulary (`decision | trade-off | gotcha |
  convention`) is absorbed as the OKF `type` values; the 10 existing
  `.knowledge.jsonl` bundles migrate into OKF records and the JSONL format
  retires (zero production consumers, so retirement costs nothing).
- ~~Write authority for the consolidation pass~~ — **ratified 2026-08-18: a
  proposals area, machine-side of the path boundary** (under `memory/`).
  Promotion into `knowledge/` is a human act, or Cosmo with explicit assent.
  Consolidation never writes inside `knowledge/` — C-1 stays enforceable by
  path. This also answers the `memory-consolidation` spec's open question on
  where candidates live.
- ~~Retrieval only, or an always-injected index?~~ — **ratified 2026-08-18: a
  small always-injected knowledge index plus `recall`**, index-then-detail like
  the memory index and the architecture map, all three consumers inside one
  reassessed combined per-turn budget (§6).
- ~~Retention for `missions/archive/sessions/`~~ — **ratified 2026-08-18:
  deletable on schedule.** One correction on the way in: raw sessions are *not*
  regenerable — they are the primary record, and everything else derives from
  them. The ruling rests on the Tier-2 decision instead: extraction is
  Tier-2-only, so once a session's transcript exists and archive-time
  distillation has run, the raw JSONL has no consumer. The deletion window is a
  plan-stage call.
- ~~Rename~~ — **ratified 2026-08-18: the track is `knowledge-and-memory`**,
  matching this doc. `agent-memory` now names only the shipped extension code
  (`domains/shared/extensions/agent-memory/`) and history.

All seven questions above are ruled. What remains open is plan-stage, not
architectural: the exact proposals path, the combined injection budget number,
the raw-session deletion window, and `memory-consolidation` spec hygiene (add
`## Intent`, `AC-###` IDs, and split the host-dependent trigger AC into its own
verifiable criterion).

---

## Cross-links

- `missions/architecture/code-structure-map.md` — the derived code-structure
  map, reuse-scan, and the deferred presentation/health layer (carved out
  2026-08-18; the other half of the drift signal).
- `missions/architecture/autonomy.md` — the scheduler that eventually runs the
  pump.
- `docs/memory.md` — the shipped user-facing contract (W1–W3).
- `memory/{memory-interface,profile-playbooks,memory-hardening,episodic-log,episodic-log-detached-hardening}.md`
  — distilled knowledge from the shipped waves.
- `domains/shared/skills/work-artifacts/references/deviation-protocol.md` — the
  classifier governing any change to ratified ground above.

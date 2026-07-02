# General Agent Memory — Forward Architecture & Roadmap

**Status:** Forward source of truth for cosmonauts' **general/operational agent
memory** — user/session/project-scoped knowledge an agent carries so it works well
without re-loading context every turn. Companion to the `agent-memory` roadmap
entry. **Sibling** to architectural (code-knowledge) memory
(`architectural-memory.md`): different records and lifecycle, but a **shared
save/retrieve mechanism** — the *pluggable memory interface*, defined here as the
common ancestor both tracks use. Last updated 2026-07-02.

## The basic idea

Agents — and especially an always-on assistant like Cosmo — benefit from durable
memory about the **user, the project, and the session**, so they don't re-derive
context every turn. The hard part is not storing it; it is **retrieving the right
memory at the right time without polluting context** with memory that isn't needed.

## Taxonomy (what kinds of memory)

Two axes:

| | **Semantic** (facts) | **Procedural** (how-to) | **Episodic** (what happened) |
|---|---|---|---|
| **Session** | working facts | — | session scratchpad |
| **Project** | project facts, conventions | project playbooks | run/decision log |
| **User** | profile, preferences | personal playbooks | cross-project history |

**Short-term** memory ≈ the live session context + a small scratchpad — largely
Pi's job already (session state, compaction). **Pi-First audit** before building
any short-term machinery. **Long-term** = the consolidated records above.

## Retrieval — the core problem (and the shared ancestor)

Surface a memory only when relevant; never inject everything. Filter
cheap-to-expensive:

1. **Scope** — session memory only in-session, project only in-repo, user
   always-eligible. (Kills most pollution for free, before any similarity math.)
2. **Recency / decay.**
3. **Explicit `recall(query)` tool** — pull, not push: the agent asks when it
   senses a gap.
4. **Embeddings** — semantic similarity, the *last* filter, only if 1–3 fall short.

Pattern: **compact index always-loaded + detail pulled on demand** — the *same*
pattern architectural memory uses for its sharded map. This retrieval/inject
mechanism is the **common ancestor** the two tracks share.

## Storage & the pluggable interface

**Decision: plain-text first.** Markdown + frontmatter (reuse `gray-matter`),
tagged by scope × type; human-legible and prunable — *proposed truth the user can
override*, not silently-mutated state. Embeddings / SQLite are **optional
backends**, added only if scope+keyword retrieval proves insufficient.

**Decision (2026-07-02): records conform to OKF v0.1** (Open Knowledge Format,
github.com/GoogleCloudPlatform/knowledge-catalog): its frontmatter vocabulary
(`type`, `title`, `description`, `resource`, `tags`, `timestamp`), reserved
`index.md`/`log.md`, and link conventions — with a project-defined `type`
vocabulary and custom keys on top. One record format shared with architectural
memory. OKF is serialization only; retrieval and consolidation stay behind the
memory interface.

The mechanism is a **pluggable memory interface** — `write(record)` /
`retrieve(scope, query)` / `consolidate()` — with backends behind it and **domains
declaring** which record types + retrieval strategy they need (domain-dependent
memory). Both this track and architectural memory are *implementations* of this
interface.

> **Premature-abstraction guard:** design *toward* one interface, but extract it
> when the second implementation actually lands (architectural W1 + this track's
> W1), not before. If embeddings are ever built, they live behind this interface
> and serve **both** tracks — don't build it twice.

## Background consolidation ("dreaming")

A scheduled process that reprocesses raw episodic logs into consolidated memory:
mine playbooks, prune redundancy, summarize, decay. This is the v2 of
explicit-save → implicit-learn, and it needs a background-scheduling capability —
so it **intersects the autonomy track** (heartbeat / daemon / scheduled agent
processes).

## Intersection map (watch the ancestors)

- **↔ Architectural memory:** shared memory interface + index-then-detail,
  scope-filtered retrieval. (Mechanism ancestor.)
- **↔ Autonomy / scheduler:** "dreaming" needs scheduling; the episodic log *is*
  the autonomy audit trail; profile/playbooks gate `ambient-cosmo` phase 3 and feed
  `executive-assistant`.

## Forward waves

- **W1 — Memory interface + plain-text substrate + scope-filtered retrieval**
  *(active slice → `agent-memory`)*. The shared ancestor: `write`/`retrieve`/
  `consolidate`, markdown records tagged scope×type, retrieval =
  scope + recency + `recall()`, index-then-detail. Pi-First audit on session/
  short-term state.
- **W2 — Records: profile + explicit playbooks.** Self-authored, human-prunable;
  explicit-save v1 ("save that as a playbook?"). User-scoped `~/.cosmonauts/`.
- **W3 — Episodic log.** Append-only record of agent actions (= autonomy audit
  trail).
- **W4 — Background consolidation ("dreaming").** Scheduled episodic →
  semantic/procedural distillation; prune/decay; playbook mining
  (implicit-learning v2). Gated on the autonomy scheduling capability.
- **Optional — Embedding/SQLite retrieval backend** behind the interface, shared
  with architectural memory; only if relevance-gating needs it.

## Open decisions

- Shared physical store with architectural memory, or sibling stores behind one
  interface.
- `recall()` trigger model: agent-initiated only, vs. a light always-on relevance
  gate at prompt assembly.
- How much short-term memory to build vs. lean on Pi's session/compaction.
- Where the interface lives once extracted (shared lib vs. a memory capability/
  extension).

## Consolidation ledger

- Re-homes the former `agent-memory` ROADMAP idea (profile / playbooks / episodic,
  user-scoped, self-authored, Pi-First, hygiene).
- **Defines the shared memory interface** referenced by `architectural-memory.md`.
- **Cross-links (autonomy track, not absorbed):** `ambient-cosmo` and
  `executive-assistant` consume this; `heartbeat` / daemon scheduling enables W4.

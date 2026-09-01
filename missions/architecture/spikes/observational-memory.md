# Observational Memory — Pi-First Audit, Live Trial & Seam Design

**Status:** Spike record for the ROADMAP item `### observational-memory: Investigate
OM and Design Its Seam`, executed 2026-08-28. Deliverable shape (spike vs. plan),
trial target (real GPT-backed internal coordinator), and bump scope (trial at the
pinned 0.80.6; treat the Pi migration as its own roadmap item) were chosen by the
human at the start of this session.

**Subject:** `pi-observational-memory` (github.com/elpapi42/pi-observational-memory),
an independent Pi implementation of Mastra-style observational memory —
Observer/Reflector/Dropper background workers, threshold-driven,
compaction-as-rendering.

**Mandate** (`missions/architecture/knowledge-and-memory.md` §10.1): design OM's
seams with our memory system *before* the `memory-consolidation` re-spec, and
resolve two parked dispositions — the working-state singleton, and the
consolidation pump's sources contract.

**Added motivation** (human, 2026-08-28): evaluate OM as a *context extender for
internal coordinators on modest-context models*, so GPT-backed agents can act as
internal coordinators instead of relying on external harnesses.

> **Ratified 2026-09-01:** all seven §6 dispositions were human-ratified as
> part of the living-memory slate (`missions/architecture/living-memory.md`
> §7.1, "ratify all"). §7 lists what remains open. The repository was
> unchanged by the investigation itself — all trial scaffolding lives outside
> it (§8).

---

## 0. Executive summary

Five findings, in descending order of how much they change the plan.

1. **The stated blocker does not exist.** The ROADMAP says this investigation
   "requires the Pi lockstep bump to ≥0.81.0 (`agent_settled` event)". `agent_settled`
   actually landed in **Pi 0.80.4** — two releases *below* our pinned 0.80.6 — and the
   published OM release does not use it at all. OM was trialed against 0.80.6
   unmodified, and it works. **No Pi bump is required, and the mandated API re-audit
   is off this item's critical path.**
2. **The bump, when it comes, is a migration project.** Because 0.80.7 and 0.80.8 are
   themselves breaking and sit *below* 0.81.0, even the minimum bump forces an
   auth-API migration. Reaching current (0.84.3) adds a TypeBox major and the removal
   of the session-repository APIs our session factory is built on. This is a separate,
   sizable roadmap item — not a rider on any memory work.
3. **OM has no store.** Its entire memory is Pi *session-ledger entries*. It writes
   nothing to `memory/` or `knowledge/`. Every seam in the mandate is therefore an
   **export adapter that does not exist today**, not a wiring exercise.
4. **Two value propositions, only one of which is mode-limited.** *Within* a run, OM
   extends context anywhere compaction happens — and Pi's native window-pressure
   compaction is on by default, so this works in print mode, spawned agents and Drive
   workers alike. *Across* runs, OM's memory survives only where the session is
   file-backed, which print mode and non-plan-linked spawns are not. The
   context-extension thesis rides on the first; the "sessions lasting weeks" pitch
   rides on the second.
5. **The `recall` collision is fail-closed, and the fix is cheap.** Loading OM
   naively would *throw at session construction*, not silently collide. An
   adapter-side rename clears it in ~50 lines without forking upstream — built and
   demonstrated in this trial.

The context-extension thesis behind the added motivation is **plausible but not yet
demonstrated**; §5 explains precisely what would demonstrate it and why this trial
could not.

---

## 1. The Pi version premise — corrected

### 1.1 `agent_settled` is already available

| Claim | Source | Verdict |
| --- | --- | --- |
| "Requires the Pi lockstep bump to ≥0.81.0 (`agent_settled`)" | `ROADMAP.md` OM item | **False** |
| "Requires Pi 0.81.0 or newer. Proactive compaction uses the `agent_settled` lifecycle event introduced in that release." | OM `README.md` | **False** — wrong release |

`agent_settled` was added in **0.80.4** ("Added extension and RPC `agent_settled`
events plus session-level idle waiting for fully settled agent runs"). It is present
in the pinned 0.80.6 at `node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts:536`
and `:858`.

Independently, the **published OM release (3.0.4) does not use `agent_settled` at
all** — its compaction trigger listens on `agent_end`
(`src/hooks/compaction-trigger.ts`). Only the `master` branch uses `agent_settled`,
and the README documents master. Two independent reasons the premise collapses.

### 1.2 Empirical compatibility with 0.80.6

Against pinned 0.80.6, with OM `master` checked out:

- `tsc --noEmit` → **exit 0**, zero errors.
- `vitest run` → **247 / 257 passing**.
- All 10 failures share **one** root cause and are confined to two credential
  files (`ambient-credential-auth.test.ts`, `oauth-end-to-end.test.ts`):
  `TypeError: this.authStorage.getOAuthProviders is not a function`. The test doubles
  construct `ModelRegistry` with the **≥0.80.8** `getAuth` shape.

OM's production code types `ctx.modelRegistry` as `any` and calls
`getApiKeyAndHeaders()` and `find()` — which **exist in 0.80.6** and were removed in
0.80.8. So OM is, if anything, *more* natural against our pinned version than against
current Pi. The live trial (§3) confirms this end to end.

### 1.3 What the bump would actually cost

Sizing for the separate roadmap item. Three breaking clusters between us and current:

**Cluster A — auth (0.80.7 / 0.80.8, unavoidable at *any* bump ≥0.81):**
- `CreateAgentSessionOptions.authStorage` and `modelRegistry` **removed**, replaced by
  the async `modelRuntime`. `AuthStorage` is no longer exported.
- `ModelRegistry.getApiKeyAndHeaders()` → `ModelRuntime.getAuth()`.
- `ModelRuntime.getAll()/find()/getSnapshot()/getAuthOptions()` removed.
- `ModelRegistry.refresh()` sync → async.
- **Our exposure:** 61 references across `lib/agents/session-assembly.ts`,
  `lib/orchestration/session-factory.ts`, `lib/orchestration/model-resolution.ts`,
  `cli/session.ts`, `cli/architecture/narrative-provider.ts`,
  `cli/sessions/subcommand.ts`. `session-factory.ts` passes exactly the two removed
  options.

**Cluster B — TypeBox (0.83.0):** bundled TypeBox to 1.3.7, removing `Type.Base`,
`Type.Awaited`, `Type.Promise`, `Type.AsyncIterator`, `Type.Iterator`, `Type.Options`,
`Value.Mutate`. We pin `typebox 1.1.33` directly in `package.json`.

**Cluster C — sessions (0.84.0):** pi-agent-core's harness session model replaced with
the lane-based `Session` / `SessionStorage` / `SessionRepo` API; **the legacy JSONL and
in-memory repository APIs are removed**. Our persistence decision sits precisely there
(`lib/orchestration/session-factory.ts:104-117`, `SessionManager.open()` /
`SessionManager.inMemory()`). Also: JSON/RPC `message_update` no longer carries
cumulative `message` — relevant to driver event parsing.

Plus the standing rule: all four `@earendil-works/pi-*` packages move together, a full
API re-audit is mandated, and `domains/shared/skills/pi/SKILL.md` (currently written
against 0.80.6) updates in the same change.

---

## 2. What OM actually is

### 2.1 Architecture

Three background workers on token clocks, plus a compaction renderer:

- **Observer** (`turn_end`, `observeAfterTokens`) — distills raw session entries into
  timestamped **observations** with a `relevance` tier (`low|medium|high|critical`) and
  `sourceEntryIds` back-pointers.
- **Reflector** (`turn_end`, `reflectAfterTokens`) — distills observations into durable
  **reflections**, each carrying `supportingObservationIds`.
- **Dropper** (after successful reflection) — prunes the active observation pool toward
  `observationsPoolTargetTokens`, using deterministic coverage evidence
  (`none|partial|strong`) as *guidance*, not as an automatic rule.
- **Compaction hook** (`session_before_compact`) — renders prepared memory instead of
  calling a model. An empty projection delegates to Pi's native summarizer rather than
  replacing context with an empty summary.

### 2.2 The decisive structural fact: no store

OM's entire memory is **Pi session-ledger custom entries**:

```
om.observations.recorded · om.reflections.recorded · om.observations.dropped · om.folded
```

(`src/session-ledger/types.ts:1-4`), written with `pi.appendEntry`
(`src/hooks/consolidation-trigger.ts:62-63`) and read back by scanning
`ctx.sessionManager.getBranch()` (`src/tools/recall-observation.ts`). Outside opt-in
NDJSON debug logs, **OM writes no files**.

Four consequences that drive everything downstream:

1. **Scope is one session branch.** Not the project, not the user, not a plan.
2. **Durability is exactly the session's durability.** In-memory session ⇒ the memory
   evaporates at process exit.
3. **No record format.** Observations/reflections are ledger JSON, not OKF; they carry
   no `type`, `scope`, `kind`, `resource`, `writer`, or tags, so they are not
   `RetrievedMemoryRecord`-shaped.
4. **The payoff is deferred to compaction.** OM's memory reaches the model when a
   compaction renders it. No compaction, no benefit — however many observations were
   built. Note this cuts *for* OM in our setting: the hook fires on **any** compaction,
   including Pi's native window-pressure one, which is on by default. OM does not need
   its own trigger to be useful.

### 2.3 Consequence for the injection budget (a worry that does not apply)

OM injects at `session_before_compact`, i.e. into the compaction summary. Our knowledge
surface injects at `before_agent_start` under `COMBINED_CONTEXT_MAX_BYTES = 24_000`
with `INDEX_LIMIT = 50` (`lib/extensions/knowledge-surface/combined-context.ts:24-25`).
**These are two independent paths with two independent budgets.** OM observations do
*not* contend for the 24 KB combined-context window against the 237 curated records;
they contend with — and replace — what Pi's summarizer would have written.

This is the opposite of the pre-trial expectation, and it is a point in OM's favor.

---

## 3. The live trial

### 3.1 Method

A real internal cosmonauts coordinator, not a synthetic harness.

- **Agent:** `omtrial/coordinator-om` — `main/cosmo`'s exact configuration (capabilities,
  tools, extensions, `projectContext`, `session: "persistent"`) with the OM adapter
  added and `thinkingLevel: "medium"`.
- **Model:** `openai-codex/gpt-5.6-sol` — which is **every cosmonauts agent's model**;
  all 19 agent definitions in `bundled/coding/agents/` and `domains/*/agents/` use it.
  The "GPT-backed internal coordinator" is not a special case, it is the default.
- **Pi:** 0.80.6, unbumped. **OM:** published 3.0.4 (not `master` — the README warns
  master may be unstable, and the two differ in 7 files).
- **Knowledge surface:** left **enabled**, as in this repository.
- **Thresholds lowered** so the workers fire inside one run: `observeAfterTokens` 2000,
  `reflectAfterTokens` 4000, `compactAfterTokens` 12000, pool max/target 4000/2000,
  `agentMaxTurns` 8, `debugLog: true`.
- **Workload:** read five `lib/memory/` files in full and summarize how the
  `MemoryStore` interface, its two implementations, and the injection budget fit
  together.

### 3.2 Result: OM runs correctly at 0.80.6

The run completed (exit 0) and produced a correct, specific summary. OM's debug log
shows all three workers doing real work:

| Time | Event | Detail |
| --- | --- | --- |
| 19:54:50 | `observer.start` | 12,776 tokens; 4 source entries |
| 19:54:59 | `observer.records` → `appended` | **2 observations**, 159 tokens |
| 19:55:02 | `reflector.result` | `no_tool_call` — 0 reflections (declined) |
| 19:55:02 | `dropper.waiting_for_reflection` | correctly idle |
| 19:55:04 | `observer.start` | 14,949 tokens; 9 source entries |
| 19:55:24 | `observer.records` → `appended` | **6 observations**, 456 tokens |
| 19:55:39 | `reflector.result` | `accepted_nonempty` — **5 reflections from 8 observations** |
| 19:55:39 | `dropper.not_ready` | 615 / 2000 tokens (fullness 0.31) — correctly declined |
| 19:55:41 | `observer.start` | 15,110 tokens |
| 19:55:52 | `observer.records` | 2 observations produced… |
| 19:55:52 | `observer.error` | **…and lost.** Stale-ctx failure (below) |

Observer, Reflector and Dropper all functioned. The Reflector's 8 → 5 fold is genuine
lossy compression, and both the Reflector's first-pass decline and the Dropper's
under-target decline are *correct restraint* — the behavior §7 of the knowledge-and-memory
doc demands of a pump ("if a run produces one record per episode it has failed").

**This is the empirical answer to the Pi-version question: OM works at 0.80.6, inside a
real cosmonauts session, with the knowledge surface enabled.**

### 3.3 Two integration defects, both ours to own

**(a) Stale extension context.** The third observer run distilled 2 observations and
then failed to append them:

> `This extension ctx is stale after session replacement or reload. Do not use a
> captured pi or command ctx after ctx.newSession(), ctx.fork(), ctx.switchSession(),
> or ctx.reload().`

OM's background workers capture `ctx` and use it asynchronously; something in our
session lifecycle invalidates it. Note OM's compaction trigger already defends against
exactly this (it snapshots `ctx.hasUI`/`ctx.ui` synchronously "because the setTimeout +
async work below may outlive the extension ctx") — the observer path does not. Work
was performed and then discarded: the worst failure shape, since it costs tokens and
yields nothing.

**(b) Compaction never fired — so the payoff was never exercised.** Source-entry tokens
reached 15,110 against OM's configured 12,000 threshold, yet no compaction occurred.
OM's proactive trigger runs on **`agent_end`**, which in print mode fires exactly once,
at teardown, when there is nothing left to compact *for*; the deferred
`setTimeout` → `ctx.isIdle()` → `ctx.compact()` path then races the same teardown that
produced (a).

**But that is a limit on OM's *proactive* trigger, not on OM in non-interactive mode.**
Pi's native window-pressure compaction is independent and **enabled by default** —
`shouldCompact` gates on `settings.enabled`, which defaults to `true` with
`reserveTokens` 16,384 (`core/settings-manager.js:510,521`), and when no
`settingsManager` is supplied the SDK constructs one
(`core/sdk.js:72`). On a 272K GPT window that is a threshold around 255,600 tokens.
OM's `session_before_compact` hook renders on *any* compaction, whoever triggered it.

So the honest reading of this run: it peaked near 15K source tokens and never came
within 240K of native compaction. **It was too short, not wrong-moded.** OM paid the
observation and reflection cost and delivered no context benefit *because nothing
compacted* — a property of the workload, not of print mode.

### 3.4 Persistence: the harder half

`handlePrintMode` passes **`persistent: false`** (`cli/main.ts:628`), which
**overrides the agent definition's `session: "persistent"`**. Only
`handleInteractiveMode` passes `true` (`cli/main.ts:664`). Separately, the
orchestration path is in-memory unless plan-linked
(`lib/orchestration/session-factory.ts:104-117`).

Confirmed empirically: the trial run wrote **no session file** anywhere under
`~/.pi/agent/sessions/`. Every observation and reflection above existed only in
process memory and is now gone.

Note this table is about **across-run** survival only. Within-run context extension is
unaffected by it — see §3.3b.

| Path | Session | OM memory survives the run? |
| --- | --- | --- |
| Interactive (`cosmonauts` TUI) | file-backed | **yes** |
| Print (`-p`, incl. every scripted/internal call) | in-memory | no |
| Spawned agent, plan-linked (`planSlug` set) | file-backed | yes |
| Spawned agent, not plan-linked | in-memory | no |

This is the ephemeral-session hazard recorded in
`knowledge/observability/gotcha-do-not-assume-automatic-compaction-works-for-ephemeral-sessions-9608b54dbb0d.md`,
now load-bearing rather than hypothetical, and it is **our** configuration, not an OM
defect.

---

## 4. Seam analysis

### 4.1 Seam 1 — `recall`: fail-closed today, cheaply fixed

The handoff framed this as a three-way name collision. It is sharper than that.

`assertEnabledRecallOwner` (`lib/orchestration/definition-resolution.ts:58`) **throws**
unless exactly one loaded extension owns `recall` *and* that owner is
`<inline:knowledge-surface>`. It is enforced at `lib/orchestration/session-factory.ts:101`
and `cli/session.ts:604,637`. With `knowledgeSurface.enabled: true` in this repository,
**naively loading OM aborts session construction.** Loud, not silent — a good failure.

The two internal `recall` registrations
(`lib/extensions/agent-memory/index.ts:255`, `lib/extensions/knowledge-surface/knowledge-tools.ts:173`)
are never simultaneous: when the surface is enabled, the file-based `agent-memory` and
`architecture-memory` extensions are filtered out and replaced by a single inline
extension that owns one `recall` and dispatches on a `recallOwner: "knowledge" | "agent-memory"`
discriminator (`lib/agents/session-assembly.ts:205-217`,
`lib/extensions/knowledge-surface/session-extension.ts:37`).

So our architecture already resolved a two-way collision by **merging both meanings
behind one tool**. The question for OM is whether its meaning belongs in that merge.

**It does not.** Ours is *text search over durable records* (`query`, `limit`).
OM's is *id-keyed source-evidence retrieval* — it takes a 12-char hex id, refuses to
search by topic, and its own guidelines say "Do not use recall as semantic search or
transcript browsing". Folding a strict-id evidence tool into a free-text search tool
would produce a surface no model can use predictably.

**Recommendation: rename OM's, adapter-side.** Not because ours has seniority, but
because "recall" in our vocabulary means search, and OM's operation is *cite*. It also
happens to be the cheapest of the three options and the only one requiring no upstream
fork and no change to orchestration resolution.

Built and proven in this trial (§8): a ~50-line adapter proxies `pi.registerTool` and
renames `recall` → `recall_evidence` before registration. Upstream is loaded unmodified.
The fail-closed assert passes; the session builds; OM works.

Rejected alternatives, briefly: *namespace all three* churns two shipped tools and every
prompt that names them, to fix a problem only the third party has; *stop keying
resolution on the name* removes a guard that is currently doing real work, and buys
nothing this rename does not.

### 4.2 Seam 2 — Reflector → consolidation pump: an adapter that does not exist

Both `MemoryStore.consolidate()` implementations are deliberate no-ops today
(`lib/memory/types.ts:116`; `lib/memory/knowledge-store.ts:98` and `:47`, whose
`NOOP_REASON` states the store "does not consolidate, promote, retain, or prune
records"; `lib/memory/markdown-store.ts:119`). The mandate asks whether OM's Reflector
can be a live source feeding that seam.

**It can, and the fit is genuinely good on substance** — reflections are exactly the
lossy, distilled shape §7 wants, and the trial produced real ones. But four gaps sit
between them and `memory/agent/proposals/`:

1. **Extraction.** Reflections live in the session ledger. Reading them means scanning
   session entries for `om.reflections.recorded` — a *source adapter*, and the first
   real consumer of §7's "sources are an input contract" clause.
2. **Format.** Ledger JSON → OKF, inventing `type`, `scope`, `kind`, `resource`, tags,
   and a `writer` that honestly attributes machine authorship.
3. **Durability.** Per §3.4, most of our runs never persist a ledger, so for those the
   source is empty. **The pump's OM source is only as good as our session persistence.**
   Fixing persistence is a prerequisite, not a follow-up.
4. **The path boundary (INV-1).** Any OM→pump adapter writes to
   `memory/agent/proposals/` and *only* there. Promotion into `knowledge/` stays a human
   act under the ledger protocol. OM has no concept of this boundary — it must be
   enforced entirely on our side, which is the right place for it since §11 made it
   enforceable by path rather than by frontmatter promise.

**Disposition for the `memory-consolidation` re-spec:** treat OM as **one pluggable
source among several**, specified alongside `external-session-capture`, and do not let
its ledger shape leak into the sources contract. The re-spec should assume the adapter,
not the extension.

### 4.3 Seam 3 — does an observation log subsume working state?

§10.1 parked the working-state singleton on the theory that "an observation log may
provide 'where we left off' for free".

**On this evidence: no — not as shipped.** Three reasons, in order of how hard they are
to remove:

1. **Wrong lifetime.** Working state must survive session death; that is its entire
   purpose. OM's memory has exactly the session's lifetime, and §3.4 shows most of our
   sessions are ephemeral. A "where we left off" record that dies when you leave off is
   not one.
2. **Wrong cardinality.** Working state is a *project singleton*. OM's memory is
   *per session branch*. Two coordinator sessions produce two divergent unmergeable
   logs with no defined precedence.
3. **Wrong shape.** Working state is a small, current, overwritable snapshot. An
   observation log is an append-only history whose current state is only implied — and
   the Dropper may prune the very observations that pinned it, since even `critical`
   observations are droppable once "safely represented by reflections".

The honest qualifier: (1) is contingent on *our* configuration, not on OM. If we made
coordinator sessions durable, a file-backed OM log would carry "where we left off"
*within one continuing session* quite well — which is real value, just not the
singleton's job. (2) and (3) are intrinsic and would remain.

**Proposed disposition: un-park working state as an independent item.** It is not
subsumed. It may still be small.

---

## 5. OM as a context extender for GPT-backed internal coordinators

The added motivation. Assessed honestly, in three parts.

**The mechanism is real and it is the right one.** Every cosmonauts agent runs
`openai-codex/gpt-5.6-sol` (272K window). The alternative to OM is repeated
summarize-the-summary compaction, whose degradation is exactly what makes long internal
coordinator runs unreliable. OM replaces that chain with per-turn distillation plus
id-addressable evidence — strictly better *when it engages*. The trial confirmed the
distillation half works at our pinned Pi.

**This trial did not demonstrate the benefit, and could not.** No compaction occurred
(§3.3b), so no prepared memory ever reached the model. Everything measured here is
input-side. Any claim about "effective context depth" would be unsupported, so this
spike makes none.

**Separate the two axes, because only one of them is mode-limited:**

- **Within-run context extension — available in every mode.** Native compaction is on
  by default (§3.3b), and OM renders on any compaction. Nothing about print mode,
  spawned agents or Drive workers blocks this. The only requirement is that the run
  actually approach the context window — ~255,600 tokens on the 272K GPT window every
  cosmonauts agent uses.
- **Across-run continuity — genuinely mode-limited.** Print mode hard-codes
  `persistent: false`, overriding the agent definition (§3.4), so a coordinator invoked
  that way cannot accumulate memory across invocations. This is the half that needs a
  persistence decision.

**What would actually settle the context-extension claim:** a **long** coordinator run
— interactive *or* print, it does not matter — that genuinely crosses the native
compaction threshold, with OM enabled, measured on compaction count, post-compaction
task coherence, and `recall_evidence` usage, against the same work without OM. Because
print mode is fair game, this is **scriptable and repeatable**, which makes the A/B far
cheaper than a hand-driven TUI session would be. A run of that length also feeds the two
open `knowledge-adoption` evidence bullets (internal agents deliberately exercised;
retrieval usage recorded), exactly as the handoff anticipated.

The one caveat worth designing around: in print mode the memory is discarded at exit, so
such a run measures within-run benefit only. Measuring across-run continuity needs the
persistence decision first.

---

## 6. Proposed dispositions — **ratified 2026-09-01 (Decided-by: human)**

All seven were human-ratified with the living-memory slate
(`missions/architecture/living-memory.md` §7.1). Each was stated so it could
be accepted or rejected on its own.

| # | Disposition | Grounds |
| --- | --- | --- |
| **D-1** | Drop "requires the Pi bump to ≥0.81.0" from the OM roadmap item. | §1.1 — `agent_settled` shipped in 0.80.4; OM 3.0.4 does not use it; OM verified working at 0.80.6. |
| **D-2** | Create a separate roadmap item for the Pi lockstep bump, sized at three breaking clusters, and stop treating it as a rider on memory work. | §1.3 — auth API, TypeBox major, session-repo removal; 61 call sites. |
| **D-3** | `recall` disambiguation = **adapter-side rename of OM's tool**; our two internal registrations are unchanged and orchestration keeps keying on the name. | §4.1 — different operation (cite vs. search); demonstrated working; no upstream fork; preserves a guard that is doing real work. |
| **D-4** | **Un-park working state** as an independent item. An observation log does not subsume it. | §4.3 — wrong lifetime, cardinality, and shape. |
| **D-5** | In the `memory-consolidation` re-spec, treat OM reflections as **one pluggable source behind an adapter**, writing only to `memory/agent/proposals/` (INV-1). Do not let ledger shape into the sources contract. | §4.2 — good substance, four-gap mismatch, path boundary is ours to enforce. |
| **D-6** | Treat **session persistence** as a prerequisite for across-run continuity and for D-5's source — but **not** for within-run context extension, which needs nothing from us. Compaction policy is *not* a prerequisite: native compaction is already on by default. | §3.3b, §3.4, §5 — the two axes have different prerequisites; an earlier draft wrongly treated compaction as a blocker. |
| **D-7** | Do not adopt OM in this repository yet. Re-decide after the long-run A/B in §5, which is scriptable in print mode. | §5 — the central benefit claim is currently unmeasured. |

---

## 7. What this spike does not settle

- **Whether OM improves coordinator output.** Unmeasured (§5). The experiment is
  specified in §5 and is scriptable in print mode; it needs a run long enough to cross
  the native compaction threshold, and a decision to spend that.
- **The stale-ctx defect's root cause** (§3.3a). Observed and reproduced, not diagnosed
  to the specific lifecycle call in our code. Worth an upstream issue once we can name it.
- **`master` vs. `3.0.4`.** The trial used 3.0.4. `master` differs in 7 files, uses
  `agent_settled`, and adds ambient-credential handling. If we adopt, that choice needs
  making — and master's `agent_settled` path may interact differently with our teardown.
- **Packaging.** OM ships raw `.ts` and **does not compile under our
  `noUncheckedIndexedAccess`** — 25 errors at 3.0.4. The trial adapter sidesteps this
  with a computed import specifier TypeScript cannot follow. Real adoption needs a
  deliberate boundary decision, and it lands squarely in `vendored-skills`' unresolved
  territory (adopting a third party's *generated* artifact as source of truth).
- **Multi-agent semantics.** Every spawned agent gets its own session and therefore its
  own disjoint observation log. What OM means in a chain or a Drive fan-out is undesigned.
- **Cost.** OM adds background model calls per turn (three workers, `agentMaxTurns` 8).
  Unmeasured here; it deserves a number before adoption, since it multiplies against
  every internal agent run.

---

## 8. Reproduction

The repository is **unchanged** by this investigation — `git status` is clean, no
dependency was added, and the gates are untouched. All scaffolding lives outside the
repo, under this session's scratchpad:

```
<scratch>/om/                            # OM master checkout (compat testing, §1.2)
<scratch>/omnpm/node_modules/…@3.0.4     # the published release used in the trial
<scratch>/trial-domain/
  node_modules/{pi-observational-memory, @earendil-works}   # symlinks
  omtrial/domain.ts
  omtrial/agents/coordinator-om.ts       # cosmo's config + the OM extension
  omtrial/prompts/coordinator-om.md      # copy of domains/main/prompts/cosmo.md
  omtrial/extensions/observational-memory/index.ts          # the rename adapter
```

Run it:

```bash
bun bin/cosmonauts --plugin-dir <scratch>/trial-domain -d omtrial -a coordinator-om -p "<prompt>"
```

To exercise the workers, add the §3.1 thresholds to a project-local `.pi/settings.json`
with `debugLog: true`; events land in
`~/.pi/agent/observational-memory/debug/<session-id>.ndjson`. (That settings file was
removed after the trial — note it is *not* gitignored, and Biome checks it.)

**The adapter**, in full — the artifact behind D-3:

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export const OM_RECALL_TOOL_NAME = "recall_evidence";
const OM_ENTRY = ["pi-observational-memory", "src", "index.ts"].join("/");

type ExtensionFactory = (pi: ExtensionAPI) => void | Promise<void>;

export default async function observationalMemoryTrial(pi: ExtensionAPI): Promise<void> {
	const module = (await import(OM_ENTRY)) as { default: ExtensionFactory };
	await module.default(withRenamedRecall(pi));
}

function withRenamedRecall(pi: ExtensionAPI): ExtensionAPI {
	return new Proxy(pi, {
		get(target, property, receiver) {
			if (property === "registerTool") return renamingRegisterTool(target);
			const value = Reflect.get(target, property, receiver);
			return typeof value === "function" ? value.bind(target) : value;
		},
	});
}

function renamingRegisterTool(pi: ExtensionAPI) {
	return (tool: { readonly name: string }) => {
		const renamed = tool.name === "recall" ? { ...tool, name: OM_RECALL_TOOL_NAME } : tool;
		return pi.registerTool(renamed as Parameters<ExtensionAPI["registerTool"]>[0]);
	};
}
```

Two deliberate shapes, both findings: the rename is applied **adapter-side via a proxy**
so upstream is never forked, and the import specifier is **computed** so TypeScript does
not follow it into source that fails our strictness (§7).

---

## Cross-links

- `missions/architecture/knowledge-and-memory.md` — §7 (the pump), §10.1 (the two
  dispositions this spike addresses), §11 (proposals-area ruling / INV-1)
- `ROADMAP.md` — `observational-memory` (D-1/D-2 amend it), `knowledge-adoption`
  (§5's experiment feeds its two open bullets), `vendored-skills` (§7 packaging)
- `knowledge/observability/gotcha-do-not-assume-automatic-compaction-works-for-ephemeral-sessions-9608b54dbb0d.md`
  — §3.4 is this gotcha, now load-bearing
- `domains/shared/skills/pi/SKILL.md` — written against 0.80.6; updates with any bump (D-2)
- Precedent for this document's shape: `missions/architecture/spikes/spec-to-backlog-pipeline.md`

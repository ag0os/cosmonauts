# Living Memory — Design Brief

**Status: RATIFIED SLATE — 2026-09-01.** Design-dialogue artifact (drafted
2026-08-31). All Decision Log rulings LM-D-001..008 are ruled; the amendment
slate A-1..A-10 was ratified whole by the owner ("ratify all", 2026-09-01)
and executed on record — `knowledge-and-memory.md` §10.2, `ROADMAP.md`, the
OM spike's §6, and `docs/memory.md` carry the amendments. This brief is now
the input for the `living-memory` re-spec (§10.1 item ③). This brief reframes the `memory-consolidation` re-spec around the
owner's living-memory thesis (stated 2026-08-31) and consumes the OM spike
(`spikes/observational-memory.md`, whose dispositions D-1..D-7 are also still
unratified). On ratification, the amendments in §5 land in
`knowledge-and-memory.md` on record per `deviation-protocol.md`; until then
that document stands unchanged and this brief carries no authority.

---

## 0. The requirement

The owner's thesis, 2026-08-31, treated as the requirement rather than as
background:

> "That corpus should be as small as possible while giving context to the
> agents on what we did and why, and also what we are doing now and want to
> do. So: what we did, why, some gotchas — and gotchas should be eliminated
> in the long run. The memory system should be a living thing, constantly
> mutating. For a while we saved stuff without doing anything, and now we
> started actually creating knowledge from all the distilled plans and
> conversations — but that doesn't mean we need to always be dealing with a
> huge amount of knowledge. We need just the right knowledge, the right
> things to help the agents do their thing. Observational memory is not just
> the system but as an idea is really good, because it should happen on
> different levels — the conversation, in the plan, after the plan, and also
> constant post-processing of the knowledge we have so it's minimal and
> optimal. If it's a good idea we might fork the OM plugin and make it our
> own, so we can use it but also shape it as we want and need."

Restated as four properties the design must deliver:

1. **Minimal.** The corpus is as small as it can be while still telling an
   agent what we did, why, what we are doing, and what we want.
2. **Living.** Records mutate, merge, and die. Accumulation is the failure
   mode, not the goal.
3. **Self-eliminating gotchas.** A gotcha is a bug report against the
   system; fixing the underlying cause retires the record.
4. **Multi-level observation.** Extraction and compression happen in the
   conversation, at end of plan, after the plan, and continuously over the
   corpus itself.

Standing authorization from the same conversation: the owner has no problem
amending ratified plans in service of a great memory system. Read here as:
amendments may be *proposed* freely; each still needs an explicit human
ruling (Do-not in the handoff; `deviation-protocol.md`).

---

## 1. The gap, precisely

**The memory system has a writer and a reader but no forgetter.**
`MemoryStore.consolidate()` (`lib/memory/types.ts:116`) is a deliberate no-op
in both implementations — `lib/memory/knowledge-store.ts:98` (whose
`NOOP_REASON` states the store "does not consolidate, promote, retain, or
prune records") and `lib/memory/markdown-store.ts:119`. Nothing anywhere
prunes, merges, or retires a record. The corpus is 237 typed records and
monotonically grows; the only sanctioned mutation is a human ledger round.

**OM has exactly the missing worker — at session scale.** Its Dropper prunes
a bounded observation pool toward `observationsPoolTargetTokens`, using
deterministic coverage evidence (`none|partial|strong`) as guidance rather
than automatic rule, and drops even `critical` items once they are "safely
represented by reflections, superseded by newer memory, redundant, or
obsolete" (spike §2.1; verified doing real work live, §3.2). **The reframe is
to lift the Observer→Reflector→Dropper shape from session scope to corpus
scope.** That is the spine of this design, and the strongest single argument
in the fork question (§4).

**The second gap: nothing prescriptive.** All four OKF record types are
descriptive — live counts: `decision` 103, `convention` 70, `gotcha` 47,
`trade-off` 17. "X should change" has no home, which is why that signal
escapes into the owner's head and returns later as a hardening plan. The
owner has already hand-written the prescriptive schema once
(`missions/reviews/drive-improvement-observations-artifact-format-redesign.md`):
*observed problem → what happened in this run → suggested improvement → why
it helps*, plus ranked follow-ups and explicit non-goals. §3.3 treats that as
the existing template, not a blank page.

---

## 2. Q1 — Pruning authority (the load-bearing decision)

### 2.1 The three collisions, stated plainly

The living-corpus vision conflicts with three ratified things. None is routed
around here; each needs an explicit ruling.

1. **§7 trust-and-prune** (`knowledge-and-memory.md`): consolidation "never
   modifies or deletes human-authored or human-curated records"; deletion
   authority "extends only to machine-written episodes it has consumed."
   Promotion makes a record human-curated — so under the current ruling the
   machine may not retire *anything* in `knowledge/`, ever. Corpus pruning
   requires exactly the authority this forbids. This is the ruling that must
   be amended; §7's safe-prune predicate ("prune only bytes still identical
   to what the run read and distilled") is the honest floor for the narrower
   replacement.
2. **The frozen-receipt layers**: promoted records are byte-pinned
   permanently; the guard lives in `tests/memory/interface.test.ts` (~1631,
   the B-003 seed audit) and forgives edits only when listed in a ratified
   ledger round's `curatedRecords`. A pruning pump trips this on every run
   unless the receipt contract itself is extended (§2.4). The receipt story
   is designed *before* any code.
3. **INV-1 / C-1 path boundary**: machine output lands in
   `memory/agent/proposals/`; promotion into `knowledge/` is a human act. A
   *deletion* proposal has no representation today — `write()` on the
   knowledge store only creates proposals for new records.

### 2.2 The options

- **Option A — Propose-only retirement (symmetric with creation).** The
  machine writes retirement/merge proposals to `memory/agent/proposals/`
  (new proposal kinds targeting existing records by path + content digest);
  a human ledger round ratifies and *the round executes* the deletion,
  recorded in ledger frontmatter the receipt audit honors.
  - Strengths: no change to the trust model; enforceable by path; reuses the
    promotion machinery that just processed 168 proposals; receipts stay
    coherent with one small extension.
  - Weaknesses: the human is the throughput bound — the corpus shrinks only
    as fast as the owner ratifies. "Living" degrades to "periodically
    gardened." The 168-proposal triage took a full session; a retirement
    backlog would behave the same way.
  - Wins when: trust in machine judgment is low, or ledger rounds become
    routine and cheap.

- **Option B — Machine auto-retires, human audits after.** The machine may
  directly delete promoted records whose bytes are unchanged since
  ratification (beyond recorded curation — the byte-pin itself proves no
  un-recorded human edit), with every retirement logged and reviewable as a
  git diff (C-4).
  - Strengths: genuinely living — the corpus shrinks at machine speed; git
    makes every retirement recoverable.
  - Weaknesses: inverts the gate. Promotion made those records
    human-curated; deleting them by machine breaks C-1's core sentence no
    matter how sound the predicate. A bad pass silently changes what every
    agent sees before any human looks. The receipt layers need a full
    redesign, not an extension.
  - Wins when: the corpus is large enough that human-in-the-loop retirement
    demonstrably cannot keep up — a condition we cannot claim at 237 records.

- **Option C — Machine soft-retires, human hard-deletes (two-phase).** The
  machine has unilateral authority to *deprecate*: move a record to a
  retired area (e.g. `knowledge/retired/`, bytes unchanged, a
  machine-written retirement manifest recording path, digest, reason, and
  evidence). Retired records leave the index and default retrieval
  immediately — the corpus agents *pay attention to* shrinks at machine
  speed. Destruction stays human: a periodic ledger round confirms (hard
  delete) or vetoes (restore). Content *edits* and *merges* remain
  propose-only as in Option A — soft-retire authority covers relocation
  out of the live set, never byte changes.
  - Strengths: delivers the living property where it matters (agent-facing
    attention) while preserving "no human-curated bytes destroyed without a
    human act." Reversible by construction. Receipt story is tractable: bytes
    stay pinned, location changes, and the audit follows the manifest
    (§2.4).
  - Weaknesses: two states to maintain; `retired/` can rot into a second
    junk drawer if confirm rounds don't happen; retrieval semantics need one
    decision (default excludes retired; an explicit flag can search it).
  - Wins when: you want machine-speed shrinkage and human-speed destruction
    — which is the owner's stated position read carefully.

**RULED 2026-09-01 (Decided-by: human): Option C for retirement, Option A's
proposal shape for edits and merges.** A machine may move a record out of
the live set with evidence; it may never alter or destroy curated bytes
without a ratified round. Recorded for later, deferred: the owner wants an
eventual age-based automatic removal of records that have sat in the retired
area for a while (a TTL on `knowledge/retired/`). Not designed here — it
converts Option C into Option B for aged records, so it gets its own ruling
once the confirm-round cadence is observed (see LM-D-001).

### 2.3 What is the target size?

"As small as possible" needs a bindable form. The sharp observation first:
**disk is not the scarce resource — attention is.** The always-injected index
and the combined per-turn budget (`COMBINED_CONTEXT_MAX_BYTES = 24_000`,
`INDEX_LIMIT = 50`) are what every agent pays on every turn; corpus bytes on
disk cost nothing until retrieved. Three candidate policies:

- **T-1 — Token/byte budgets per record class** (OM's
  `observationsPoolTargetTokens` lifted to corpus scope): the corpus-Dropper
  prunes toward, e.g., per-type budgets. Mechanical, tunable, but the number
  is arbitrary until retrieval data exists.
- **T-2 — Index-bound**: the live corpus must fit its whole index inside the
  combined injection budget with headroom; pruning pressure derives from
  index overflow. Binds exactly the scarce resource; lets disk hold more
  than attention does.
- **T-3 — Earn-your-place**: no global cap; every record must show retrieval
  evidence over a rolling window (the `knowledge-adoption` instrumentation)
  or become a retirement candidate. Most honest, but needs usage data we are
  only beginning to record.

**RULED 2026-09-01 (batch assent): T-2 now, T-3 as the refinement once
adoption data exists; T-1 numbers only as the Dropper's mechanical knob,
derived from T-2.**

### 2.4 The receipt story (before any code)

Extend the ledger/receipt contract in the same change that grants authority:

- Ledger rounds (kind `knowledge-surface-promotion`, or a sibling kind
  `knowledge-retirement`) gain `retiredRecords` — the analogue of
  `curatedRecords`. The B-003 seed audit forgives a seed record's *absence
  from the live set* only when its path appears there (Option A/C hard
  delete) — exactly how `curatedRecords` forgives body drift today.
- Under Option C, the machine-written retirement manifest (machine-side,
  e.g. `memory/agent/retirements/`) is what the audit consults to forgive
  *relocation*: a seed record found under `knowledge/retired/` with
  unchanged bytes and a manifest entry passes; moved without a manifest
  entry fails. Byte-pins keep applying in the retired area, so no pin is
  ever weakened — only the location contract is widened.
- Every manifest entry carries the evidence chain (§3.2): what supersedes
  the record, or which fixed cause obsoletes it, citing paths/ids/digests.

---

## 3. Q2 — The levels

The levels answer both halves of the thesis: **how knowledge is collected**
(L1–L3, the inlets) and **how it stays minimal** (L4, the regulator). §3.5
makes the collection contract explicit.

### 3.1 The four levels

| Level | Scope | Worker | Exists today? |
|---|---|---|---|
| **L1 — in-conversation** | one session | OM-shaped Observer/Reflector in-session; the only *new* signal is friction that never reaches an artifact — dead ends, rejected approaches, self-corrections | No. OM itself proven at 0.80.6 (spike §3), adoption explicitly deferred (D-7) pending the §5 A/B |
| **L2 — end-of-plan** | one plan's artifacts + transcripts | `coding/distiller` (reads transcripts, writes proposals) | **Yes** — shipped, coverage inconsistent |
| **L3 — post-plan / archive** | archived plan | `/skill:archive` distillation | **Yes** — routine |
| **L4 — continuous corpus re-consolidation** | the whole corpus | none | **No. This is the one that makes the corpus living, and the genuinely new build.** |

L2/L3 are the pump's *inlets* (they add); L4 is the *regulator* (it shrinks).
Today we have inlets and no regulator — which is the §1 gap restated.

### 3.2 L4 sketch — Observer→Reflector→Dropper at corpus scope

A scheduled batch pass (eventually the `autonomy-host`'s payload; until then,
invoked like the distiller), never a Pi session extension — L4 reads files,
not ledgers:

- **Corpus-Observer** — scans the live corpus plus change signals (new
  promotions, archived plans, resolved gotcha causes) and emits *observations
  about the corpus*: duplicate pair, superseded-by, stale reference,
  merge candidate, retire-condition met. Deterministic checks first (dead
  `resource` paths, retired-condition predicates), model judgment second.
- **Corpus-Reflector** — folds N records into fewer, tighter ones: emits
  *merge/edit proposals* (Option A path — never direct writes).
- **Corpus-Dropper** — works the live set toward the §2.3 target: emits
  *retirements* (soft, Option C) with coverage evidence per record.

**The evidence chain is non-negotiable.** OM's reflection → observation →
source-entry id chain plus `recall_evidence` is what makes a machine claim
reviewable; L4 keeps the same discipline — every proposal and every
retirement cites the records and bytes it consumed (path + digest), so a
ledger round can be ratified by sampling rather than re-derivation. This is
the main thing the distiller and review artifacts lack today.

**Restraint is the design constraint, not a nicety.** C-5 (lossy by design)
applies doubly at L4: the 168-proposal triage showed the promotion gate
collapses under volume, and improvements are *harder* to filter than
knowledge because every session has friction. L4 runs are bounded per round
(max proposals + max retirements per pass), lossy by default, and silence is
a valid outcome.

### 3.3 One pump, two outlets

Same extraction machinery, same evidence chain, same human gate — two
destinations by record character:

- **Descriptive** (what is true) → `memory/agent/proposals/` → human
  promotion into `knowledge/` under the ledger protocol. Unchanged.
- **Prescriptive** (what should change) → proposals with the owner's
  four-column schema (observed problem → what happened → suggested
  improvement → why it helps) and an `open → actioned|rejected → closed`
  lifecycle. **Promotion for a prescriptive record is conversion, not
  copying**: it becomes a ROADMAP item, task, or prompt/skill edit — and the
  proposal closes with a pointer to what it became. Prescriptive records
  never enter `knowledge/`, so INV-1 needs no new write path and the
  knowledge corpus never accumulates TODOs.

Pressure-test result on the "proposed shape from last session": it holds,
with one sharpening — the earlier framing left open where actioned
prescriptive records rest; answer: they *close and leave the working set*,
exactly like a retired gotcha, or the improvement backlog becomes the next
monotonic corpus.

### 3.4 Gotcha lifecycle

A `gotcha` is a bug report against the system. Give it (and only it, for
now) a retirement condition: optional frontmatter
`retire-when: <condition>` — free text plus, where possible, a checkable
predicate (a path that should exist/not exist, a version threshold, a test
name). The corpus-Observer evaluates checkable conditions each pass;
uncheckable ones surface for human eyes when adjacent work touches the
resource. A gotcha whose cause is fixed becomes a retirement candidate with
the fix as evidence. 47 gotchas is the pilot population.

### 3.5 Collection — the inlet contract and its coverage gaps

The living property is a loop — collect, compress, regulate — and pruning is
only the last arc. What each inlet reads and emits, and where coverage is
missing today:

| Inlet | Reads | Emits | Coverage today |
|---|---|---|---|
| **L1 conversation** | the live session — the only place friction that never reaches an artifact exists (dead ends, rejected approaches, self-corrections) | observations with evidence ids | **none** — deferred behind the spike-§5 A/B (LM-D-003) |
| **L2 end-of-plan / end-of-run** | plan artifacts + Tier-2 transcripts | descriptive proposals (OKF) *and* prescriptive proposals (four-column schema) | distiller shipped but coverage inconsistent; the prescriptive pass is not routine — the owner hand-wrote the only exemplar |
| **L3 archive** | the archived plan | distilled memory records + proposals | routine via `/skill:archive` |
| **External sessions** | work coordinated from Claude Code / Codex | *(undefined)* | **zero** — ROADMAP `external-session-capture`; a sibling source behind the same seam, not this design's build |

Three collection principles, carried from ratified ground and restated as
the inlet contract:

- **Sources are a pluggable input contract** (§7, ratified). The pump and L4
  accept artifacts, transcripts, episodes, OM reflections, and (later)
  external-session captures behind one seam; adding a source is an adapter,
  not a rewrite.
- **Density order stands** (artifacts > transcripts > episodes, §5 of
  `knowledge-and-memory.md`): collect from the cheapest dense source first;
  open transcripts only for the *why-not* material nothing else holds.
- **Lossy at the inlet, not only at the outlet** (C-5). The collector's job
  includes *not* collecting; a pass that emits nothing is a valid pass.
  Restraint is harder for prescriptive material than descriptive — every
  session has friction — so inlets are bounded per pass just like L4.

What this design actually *adds* to collection is deliberately small:
(a) making the end-of-run improvement pass routine (prescriptive L2 — §6
step 1), and (b) L1 in-session friction capture, deferred behind the A/B.
Everything else is coverage discipline on machinery that already exists —
per the handoff's warning not to build a second OM before exploiting the
three cheap sources.

---

## 4. Q3 — Fork or adapt?

What would we actually need OM's *code* for? The honest split:

- **L4 needs OM's idea, not its code.** A corpus pass reads OKF files and
  writes proposals/manifests — none of OM's ledger I/O, Pi hooks, or token
  clocks apply. Building L4 natively behind `consolidate()` is *less* work
  than adapting OM to a substrate it was never built for.
- **L1 needs OM's code entirely** — and there the fork case is real:
  - *Packaging*: OM ships raw `.ts` that fails our `noUncheckedIndexedAccess`
    (25 errors at 3.0.4); the trial's computed-import dodge is not shippable.
    A fork compiles under our flags. This lands squarely in
    `vendored-skills`' unresolved territory either way.
  - *Known defect*: the stale-ctx observer failure (spike §3.3a) loses work;
    upstream may or may not fix it on our timeline.
  - *Naming at source*: D-3's `recall`→`recall_evidence` rename works as a
    proxy but is cleaner in a fork (the proxy survives as fallback).
  - *Divergence is already real*: master differs from 3.0.4 in 7 files and
    the README documents master; we'd be choosing a frozen point regardless.
  - *Against forking*: upstream is active; a fork is permanent maintenance;
    and D-7 (unratified) says the central benefit claim is unmeasured — the
    §5 A/B experiment is scriptable in print mode and cheap relative to
    owning a fork. Licensing/redistribution needs checking before any
    vendoring (`package.json` "files" ships `domains/`, so a vendored fork
    ships in the npm tarball).

**RULED 2026-09-01 (batch assent): borrow the shape for L4 now (native, no
OM dependency); defer the fork decision to L1 adoption, which is itself gated
on the spike-§5 A/B.** If the A/B says adopt, fork at that point — the packaging, defect, and
naming reasons make the fork the right *adoption* vehicle even though it is
the wrong *investigation* vehicle. If the owner wants the fork now as a
strategic act (shaping it as ours), the cost is maintenance without measured
benefit yet — a legitimate call, but it should be made knowing D-7 is still
open.

---

## 5. Q4 — Amendments required, by ratified target

Each proposed explicitly; **ratified whole 2026-09-01 and executed on record** (§7.4).

| # | Target (ratified ground) | Amendment | Depends on |
|---|---|---|---|
| A-1 | `knowledge-and-memory.md` §7 trust-and-prune | Replace "never modifies or deletes human-curated records" with the ruled authority: machine may **soft-retire** live records with evidence (Option C); edits/merges are propose-only; **hard deletion is a human ledger act**. Extend the safe-prune predicate from episodes to corpus records: retire only bytes unchanged since ratification beyond recorded curation. | Q1 ruling |
| A-2 | C-1 invariant candidate (§9) | Reword: "never *destroys or alters* human-authored/curated bytes" — relocation out of the live set with a manifest is machine-permitted. | A-1 |
| A-3 | C-3 invariant candidate (§9) | Generalize from episodes to corpus: nothing leaves the live set unless durably represented (superseded/merged) **or** its retire-condition is met, with evidence. | A-1 |
| A-4 | Receipt/ledger contract (`docs/memory.md`, `tests/memory/interface.test.ts` B-003 audit) | Add `retiredRecords` to ledger rounds; audit consults the machine retirement manifest for relocations (§2.4). | A-1 |
| A-5 | §11 proposals-area ruling / INV-1 | Add proposal kinds: `retire`, `merge`, `improve` (prescriptive). Prescriptive promotion = conversion to backlog + close, never entry into `knowledge/`. | Q3.3 shape |
| A-6 | OKF `type` vocabulary (ratified 2026-07-02) | No new *knowledge* type. `gotcha` gains optional `retire-when`; prescriptive records are a *proposal* schema (the owner's four-column template), not a knowledge type. | §3.3/§3.4 |
| A-7 | §10.1 queue item ③ | `memory-consolidation` re-spec becomes **living-memory**: pluggable sources (unchanged), two outlets, L4 regulator, retirement authority per A-1. | this brief |
| A-8 | §10.1 item ② (working state) | Un-park as its own small item (spike D-4: wrong lifetime/cardinality/shape — not subsumed by an observation log). | spike D-4 |
| A-9 | ROADMAP `observational-memory` item | Mark investigation done; drop the false "requires Pi ≥0.81.0" premise (spike D-1); create the separate Pi-bump item (D-2). | spike D-1/D-2 |
| A-10 | Spike §6 D-1..D-7 | Ratify in the same pass — D-3 (rename), D-5 (OM as pluggable source), D-6 (persistence prerequisite for across-run only), D-7 (defer adoption pending A/B) are direct inputs here. | — |

---

## 6. Sequencing — cheapest evidence first

Three sources already exist and are unexploited; the genuinely new in-session
signal (L1) is the increment, not the whole. Ruled order (LM-D-006,
2026-09-01):

1. **Make the improvement-observations artifact routine** (no OM, no new
   machinery): a distiller-style pass at the end of each Drive run using the
   owner's four-column schema. Tests whether prescriptive extraction has
   value with machinery that exists, and produces the corpus needed to judge
   an in-session worker. The 31 existing `missions/reviews/` artifacts are
   the retroactive seed. *(Executed 2026-09-01 — policy landed in
   `/implement-plan` Phase 4 and the drive skill; first artifact due at the
   next Drive run.)*
2. **L4 prototype against a copy of the corpus** (never live; gate stays
   on): one Observer+Dropper pass over the 47 gotchas + obvious
   supersessions, output = proposals + a would-retire manifest. This is the
   evidence for ruling Q1 with real numbers instead of theory. *(Executed
   2026-09-01 — `missions/reviews/living-memory-l4-prototype.md`: 47 gotchas
   verified, 16 retire candidates, 5 stale-reference; 110-record rollup
   duplication found; one keep/retire conflict caught — the confirm-round
   case made concrete.)*
3. **Retirement machinery per the Q1 ruling** — receipts first (A-4), then
   authority.
4. **The spike-§5 A/B long-run experiment**, feeding `knowledge-adoption`'s
   open evidence bullets; **then** the fork/L1 decision.

Steps 1–2 need no amendment at all; they are runnable the moment the owner
nods. Step 3 is where ratification bites.

---

## 7. Detail pass — ratification slate, contracts, risks

### 7.1 The ratification slate — exact wording

Amendments to ratified ground execute only on an explicit human ruling;
assent to this brief's direction does not execute them. **Ratified whole by
the owner ("ratify all") and executed on record, 2026-09-01.**

**A-1 — `knowledge-and-memory.md` §7, trust-and-prune paragraph.** Replace:

> "Trust and prune authority. It never writes the profile. It never modifies
> or deletes human-authored or human-curated records. Name collisions surface
> as proposals, mirroring W2's confirm-update semantics. Deletion authority
> extends only to machine-written episodes it has consumed."

with:

> "Trust and prune authority (amended on record 2026-09-01, LM-D-001). It
> never writes the profile. It never alters or destroys the bytes of
> human-authored or human-curated records — content edits and merges are
> proposals only. It may **retire** a live record: relocate it, bytes
> unchanged, to `knowledge/retired/` with a manifest entry carrying evidence
> (superseded-by, merged-into, or retire-condition met), provided its bytes
> are unchanged since ratification beyond recorded curation. Hard deletion of
> curated material is a human ledger act. Unassisted deletion authority
> extends only to machine-written episodes it has consumed. Name collisions
> surface as proposals, mirroring W2's confirm-update semantics."

**A-2 — C-1 (§9), reworded:** "Human-authored and human-curated bytes are
never altered or destroyed by a machine. Machine authority covers what the
machine wrote, plus relocation of live records to the retired area under a
manifest (LM-D-001)."

**A-3 — C-3 (§9), generalized:** "Nothing leaves the live set unless durably
represented (superseded or merged) or its retire-condition is met, with
evidence — and only when its bytes are unchanged since the run read them
(episodes) or since ratification beyond recorded curation (corpus records)."

**A-4 — receipt contract** (`docs/memory.md` + the B-003 audit in
`tests/memory/interface.test.ts`): ledger rounds gain `retiredRecords`
(forgives hard deletion); the machine retirement manifest (§7.2) forgives
relocation when path + digest match. The test extension lands **before** any
code that moves a file.

**A-5 — proposal kinds:** `retire`, `merge`, `improve` join record-creation
proposals under `memory/agent/proposals/`. Prescriptive (`improve`) promotion
= conversion to a ROADMAP item / task / prompt edit + close; never enters
`knowledge/`.

**A-6 — gotcha `retire-when`:** optional frontmatter on `gotcha` records; no
new knowledge type.

**A-7 — §10.1 item ③:** the `memory-consolidation` re-spec becomes
**`living-memory`** per this brief: pluggable sources, two outlets, L4
regulator with Option C authority.

**A-8 — §10.1 item ②:** working state un-parked as its own small item
(spike D-4: wrong lifetime, cardinality, shape — not subsumed).

**A-9 — ROADMAP:** close the `observational-memory` item (investigation done
→ the spike), removing the false "requires Pi ≥0.81.0" premise (D-1); add a
separate `pi-lockstep-bump` item sized at the spike's three breaking clusters
(D-2).

**A-10 — spike dispositions D-1..D-7**, one line each (D-1/D-2 fold into
A-9; D-4 into A-8):

- **D-3** — `recall` disambiguation = adapter-side rename to
  `recall_evidence`; survives a fork, which renames at source instead.
- **D-5** — OM reflections are one pluggable source behind an adapter,
  writing only to `memory/agent/proposals/` (INV-1); ledger shape never
  enters the sources contract.
- **D-6** — session persistence is a prerequisite for across-run continuity
  and for D-5's source — not for within-run context extension, which needs
  nothing from us.
- **D-7** — no OM adoption in this repository yet; re-decide after the
  spike-§5 A/B.

### 7.2 Contracts

**Retired area.** `knowledge/retired/<original-relative-path>` — structure
preserved, bytes identical, so reversal is a `git mv` back. Excluded from the
injected index and from default retrieval; `recall` gains an opt-in
`includeRetired` flag.

**Retirement manifest.** Machine-written, append-only, machine-side:
`memory/agent/retirements/round-<n>.md` (OKF frontmatter, kind
`knowledge-retirement-round`); entries carry `path`, `digest`, `reason`
(`superseded | merged | obsolete | retire-when-met`), `evidence` (paths/ids),
`date`. A later human confirm round either hard-deletes (recorded in the
ledger's `retiredRecords`) or vetoes (`git mv` back + manifest annotation).

**Routine improvement pass (LM-D-008).** A distiller-style read-only agent
pass at the end of each Drive run: reads run events + task notes + (only if
needed) the Tier-2 transcript; writes
`missions/reviews/improvements/<run-id>.md` with frontmatter
`kind: drive-improvement-observations`, `status: open`, plan/run ids — body
per the owner's four-column schema plus ranked follow-ups and non-goals.
Bounded rows per run; an empty pass is valid. Invocation starts as a step in
`/implement-plan` and the drive skill (policy, not driver code); automation
rides `autonomy-host` later. Lifecycle `open → actioned|rejected → closed`;
closing records a pointer to what the item became.

**L4 at the `consolidate()` seam.** `MemoryConsolidateResult` grows beyond
`{kind: "noop"}` — sketch: `{kind: "ran", observations, proposalsWritten,
retirementsProposed | retirementsApplied, manifestPath}` plus a `dryRun`
option. The knowledge store's `consolidate()` becomes L4's entry point; the
markdown store keeps its episode-pruning meaning. Precise types are the
re-spec's job.

### 7.3 Risks, and the gates that hold them

- **A wrong retirement silently changes what agents see.** Bounded
  retirements per pass; every pass ends as a git-visible diff plus manifest;
  confirm rounds are the human check; `git mv` reverses.
- **Receipt/test drift.** A-4's test extension lands before any moving code —
  the handoff's warning made mechanical.
- **Prescriptive volume collapses the gate** (the 168-proposal lesson).
  Per-pass bounds at both inlets and L4; lossy by default; silence valid.
- **`retired/` rot.** The deferred TTL ruling (LM-D-001 extension) is the
  designed answer; until then, confirm rounds.
- **L4 judged on theory.** §6 step 2 (prototype on a *copy*, the 47 gotchas
  first) produces would-retire evidence before any authority is exercised.

### 7.4 Exit — what executes on ratification

1. **Done 2026-09-01** — A-1..A-10 applied on record
   (`knowledge-and-memory.md` §10.2, `ROADMAP.md`, spike §6, `docs/memory.md`
   note) — awaiting owner review + commit.
2. **Done 2026-09-01** — this brief is the input for the `living-memory`
   re-spec (§10.1 item ③) via `/skill:plan`.
3. §6 steps 1–2 are runnable immediately — they need no amendment.

---

## 8. Non-goals and guardrails

- Nothing implemented before the design is ratified; this brief is the
  dialogue artifact.
- No writes/moves/deletes under `knowledge/` outside the ledger protocol;
  `knowledgeSurface` stays on; L4 prototyping runs against a copy.
- No Pi bump (spike D-1/D-2); all four `pi-*` packages move lockstep when
  the separate bump item runs.
- The OM investigation's conclusions stand; nothing here re-derives them.

---

## 9. Decision Log

- **LM-D-001 — Pruning authority — RULED 2026-09-01**
  - Decision: Option C — machine soft-retires with evidence; hard deletion
    is a human ledger act; edits/merges stay propose-only (Option A shape).
  - Alternatives: A propose-only everything; B machine auto-delete with
    after-audit.
  - Why: machine-speed attention relief with human-speed destruction; keeps
    C-1's spirit enforceable by path.
  - Decided by: user-chose-among-options
  - Recorded extension (owner, 2026-09-01, deferred): age-based automatic
    removal of records that have sat in `knowledge/retired/` for a while —
    a TTL. Needs its own ruling when the confirm-round cadence is known,
    since it converts Option C into Option B for aged records.
- **LM-D-002 — Target-size policy — RULED 2026-09-01**
  - Decision: index-bound (T-2) now; earn-your-place (T-3) once adoption
    data exists; T-1 numbers only as the Dropper's derived knob.
  - Alternatives: fixed per-type token budgets (T-1) as primary.
  - Why: attention (injection budget), not disk, is the scarce resource.
  - Decided by: user-directed — batch assent to the proposed default
- **LM-D-003 — Fork vs adapt — RULED 2026-09-01**
  - Decision: L4 native (idea, not code); the fork decision is deferred to
    L1 adoption, gated on the spike-§5 A/B.
  - Alternatives: fork now as a strategic act; never fork, proxy-adapter
    forever.
  - Why: L4 doesn't need OM's code; the fork's real costs bind at L1, whose
    benefit is unmeasured (D-7).
  - Decided by: user-directed — batch assent to the proposed default
- **LM-D-004 — Prescriptive records' home and lifecycle — RULED 2026-09-01**
  - Decision: proposal-side (machine), four-column schema,
    `open→actioned|rejected→closed`; promotion = conversion to backlog,
    never into `knowledge/`.
  - Alternatives: new OKF knowledge type `improvement`; straight-to-ROADMAP
    with no record.
  - Why: keeps INV-1 untouched and the knowledge corpus free of TODOs while
    preserving the evidence chain.
  - Decided by: user-directed — batch assent to the proposed default
- **LM-D-005 — Gotcha lifecycle — RULED 2026-09-01**
  - Decision: optional `retire-when` frontmatter; corpus-Observer checks
    checkable conditions; retirement per LM-D-001.
  - Alternatives: reclassify gotchas as prescriptive; no lifecycle (status
    quo).
  - Why: makes "gotchas eliminated in the long run" mechanical instead of
    aspirational.
  - Decided by: user-directed — batch assent to the proposed default
- **LM-D-006 — Sequencing — RULED 2026-09-01**
  - Decision: §6 order (routine improvement artifact → L4 prototype on a
    copy → retirement machinery → A/B → fork/L1).
  - Alternatives: fork-first; retirement-machinery-first.
  - Why: two steps need zero amendments and produce the evidence the
    amendments should be judged on.
  - Decided by: user-directed — batch assent to the proposed default
- **LM-D-007 — Spike D-1..D-7 ride-along ratification — RULED 2026-09-01**
  - Decision: all seven dispositions ratified as part of the "ratify all"
    slate (A-8..A-10); recorded in the spike's §6 header.
  - Alternatives: rule only the direct inputs; defer all to the re-spec.
  - Why: they gate A-8..A-10 and the fork decision's framing.
  - Decided by: user-directed
- **LM-D-008 — Improvement-pass placement — RULED 2026-09-01**
  - Decision: Option A — a routine per-Drive-run pass emits the four-column
    improvement artifact; tiered folding (Option C) is the natural evolution
    once L4 exists.
  - Alternatives: B — archive-time only; C — tiered per-run + archive fold.
  - Why: cheapest test of whether prescriptive extraction has value, with
    machinery that exists; freshest friction; matches the exemplar's
    provenance.
  - Decided by: user-chose-among-options

- **LM-D-009 — Re-spec slug mechanics — RULED 2026-09-01**
  - Decision: `git mv missions/plans/memory-consolidation` →
    `missions/plans/living-memory`; live references updated in the same
    change; archived/historical references stand.
  - Alternatives: fresh directory + superseded stub; keep the directory,
    retitle only.
  - Why: A-7 says the re-spec *is* living-memory; one slug everywhere beats
    a ghost directory.
  - Decided by: user-chose-among-options
- **LM-D-010 — Rollup↔sub-record fold direction — RULED 2026-09-01**
  - Decision: sub-records win — typed sub-records stay the
    retrieval/retirement unit; parent rollups fold to thin overviews that
    link, not restate.
  - Alternatives: parents win (retire contained sub-records); defer to the
    first L4 round with per-cluster evidence.
  - Why: matches OKF typing, record-level `retire-when`, and retrieval
    granularity; addresses the 110-record duplication at its cause.
  - Decided by: user-chose-among-options
- **LM-D-011 — The 9608b54 keep/retire conflict — RULED 2026-09-01**
  - Decision: edit, not retire — an edit-narrow proposal keeps the
    across-run claim the OM spike cites and drops the fixed within-run
    half; it seeds the first ratified round.
  - Alternatives: retire on the code evidence; leave untouched.
  - Why: the prototype's flagship conflict — cause-fixed evidence vs
    inbound citations — resolves by narrowing; keeps the spike's citation
    valid and validates the inbound-reference-check requirement.
  - Decided by: user-chose-among-options

---

## Cross-links

- `missions/architecture/spikes/observational-memory.md` — every OM fact
  cited here; §5's A/B experiment; §6 dispositions; §8 trial reproduction.
- `missions/architecture/knowledge-and-memory.md` — §7 (the pump), §9
  (invariant candidates), §10.1 (queue), §11 (rulings) — the amendment
  targets.
- `missions/reviews/drive-improvement-observations-artifact-format-redesign.md`
  — the owner's prescriptive schema.
- `lib/memory/types.ts` · `knowledge-store.ts` · `markdown-store.ts` — the
  `consolidate()` seam L4 lands behind.
- `tests/memory/interface.test.ts` — the frozen-receipt audit A-4 extends.
- ROADMAP: `factory-evals` (harvest existing artifacts — same inlet),
  `external-session-capture` (sibling source), `vendored-skills` (fork
  packaging), `knowledge-adoption` (retrieval evidence for T-3).

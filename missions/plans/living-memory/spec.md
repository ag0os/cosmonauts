## Purpose

The knowledge corpus has a writer and a reader but no forgetter.
`MemoryStore.consolidate()` has been a deliberate no-op since W1; the corpus
(237 typed records at the 2026-09-01 count) only grows, and the sole
sanctioned mutation is a human ledger round. The L4 prototype
(`missions/reviews/living-memory-l4-prototype.md`) measured what that costs:
16 of 47 gotchas are retire-candidates — four of them actively wrong advice
today; five more cite paths that no longer resolve; and one migration
pattern (plan rollups restating their own sub-records) duplicates 110 of
the 237 records.

This plan makes the corpus a living system, per the ratified living-memory
design brief (`missions/architecture/living-memory.md` — amendment slate
A-1..A-10 and rulings LM-D-001..008, ratified 2026-09-01; authoritative
summary in `knowledge-and-memory.md` §10.2). Three parts, one machine:

- **The pump** — pluggable sources (episodes, artifacts, transcripts; later
  OM reflections and external-session captures) feed extraction behind one
  seam. Unchanged in shape from the original `memory-consolidation` spec
  this plan re-specs (amendment A-7).
- **Two outlets** — descriptive output (what is true) becomes knowledge
  proposals under the existing promotion gate; prescriptive output (what
  should change) becomes `improve` proposals that promote by *conversion*
  to the backlog and close — never entering `knowledge/`.
- **The regulator (L4)** — a corpus-scope Observer→Reflector→Dropper pass
  that proposes merges and edits, and soft-retires records whose time has
  come, under Option C authority: relocation with evidence at machine
  speed; destruction only by human ledger act.

The improvement inlet (a per-Drive-run four-column pass, LM-D-008) already
shipped as policy, and the L4 prototype already produced the would-retire
evidence. What remains — and what this plan builds — is the machinery:
receipts first, then proposal kinds, then the retirement authority and the
regulator that exercises it.

## Intent

Goal: the knowledge corpus stays minimal and current — sources feed one
pump, two outlets route what it learns, and a corpus-scope regulator
retires what no longer earns attention — while a machine can never alter
or destroy human-curated bytes.

Invariants — mechanism yields to these:

- INV-001 - The machine never alters or destroys the bytes of
  human-authored or human-curated records, and never writes the profile.
  Machine authority covers what the machine wrote, plus relocation of live
  records — bytes unchanged — to `knowledge/retired/` under a manifest
  entry. Content edits and merges are proposals only; hard deletion of
  curated material is a human ledger act. This outranks every size target:
  where shrink pressure and this boundary conflict, the boundary wins.
  (Amended C-1; LM-D-001.)
- INV-002 - Nothing leaves the live set unless durably represented
  (superseded or merged) or its retire-condition is met, with evidence —
  and only when its bytes are unchanged since ratification beyond recorded
  curation (corpus records) or since the run read them (episodes).
  (Amended C-3.)
- INV-003 - Receipts precede relocation: the ledger/receipt extension
  (`retiredRecords` on ledger rounds; manifest-forgiven relocation in the
  frozen-receipt byte-pin audit) is in force before any code exists that
  can move a file under `knowledge/`, and the receipt suite passes at
  every commit. (A-4.)
- INV-004 - Every machine claim carries a reviewable evidence chain — the
  records and bytes it consumed by path + digest, plus the reason — dense
  enough for a confirm round to spot-check without re-derivation.
  Retirement evidence includes an inbound-reference check (what still
  cites the record), not only cause-state.
- INV-005 - Output is lossy and bounded by design: hard per-pass caps at
  every inlet and at L4; an empty pass is a valid pass; one record per
  input is failure. (C-5.)
- INV-006 - Prescriptive records never enter `knowledge/`; an `improve`
  proposal promotes only by conversion (ROADMAP item, task, or
  prompt/skill edit) and then closes with a pointer to what it became —
  the improvement backlog must not become a second monotonic corpus.
  (LM-D-004; A-5.)
- INV-007 - Size pressure binds attention, not disk: pruning targets
  derive from the injected index fitting the combined per-turn budget with
  headroom; no disk quota drives retirement. (LM-D-002.)

## Users

- **The human (project owner)** — reads L4 reports, manifests, and git
  diffs; ratifies confirm rounds that hard-delete or veto retirements;
  converts or rejects `improve` proposals; can reverse any retirement with
  a `git mv`.
- **Every agent with knowledge retrieval** — benefits from a sharper
  injected index and a live set free of wrong advice; retrieval API is
  unchanged apart from an opt-in `includeRetired`.
- **Knowledge authors (agents and humans writing gotchas)** — may attach
  `retire-when` conditions so records self-flag when their cause is fixed.
- **Cosmo** — can invoke the pass on request and reads the same reports.
- **The autonomy host** (sibling plan) — later schedules the pass via a
  declarable payload contract; manual invocation works without it.

## User Experience

**Invocation.** An explicit cosmonauts CLI surface (planner decides the
exact shape) scoped to the project store. Explicit invocation is its own
consent — no config flag is needed to run it by hand. A dry-run mode
produces the full would-retire manifest and proposal previews while
leaving every store byte-identical. Automatic invocation only ever arrives
through the autonomy host, behind that plan's own off-by-default gate.

**A real L4 pass.** The Observer scans the live corpus plus change signals
— deterministic checks first (every cited path resolves; `retire-when`
predicates evaluate), model judgment second — and emits observations about
the corpus: duplicate pair, superseded-by, stale reference, merge
candidate, retire-condition met. The Reflector folds N records into fewer,
tighter ones as `merge` proposals (N=1 is an edit). The Dropper works the
live set toward the index-bound target and soft-retires up to the per-pass
cap: each retirement relocates the record, bytes unchanged, to
`knowledge/retired/<original-relative-path>` and appends a manifest entry
under `memory/agent/retirements/` carrying path, digest, reason
(`superseded | merged | obsolete | retire-when-met`), evidence, and date.
The pass ends with a human-readable report of exactly what it observed,
proposed, retired, and declined to act on; project-scope results are
reviewable as a git diff. A record that still has live inbound citations
is never auto-retired — the conflict is surfaced instead (the 9608b54
lesson).

**Retired area semantics.** Retired records leave the injected index and
default retrieval immediately; `recall` reaches them only via an explicit
`includeRetired` opt-in. Reversal is a `git mv` back plus a manifest
annotation. A later human confirm round either hard-deletes (recorded in
the ledger round's `retiredRecords`) or vetoes.

**The prescriptive outlet.** `improve` proposals follow the owner's
four-column schema (observed problem → what happened → suggested
improvement → why it helps) with lifecycle
`open → actioned|rejected → closed`. Promotion is conversion: the proposal
becomes a ROADMAP item, task, or prompt/skill edit, and closes with a
pointer. The per-Drive-run improvement pass (already shipped as policy)
emits the same schema to `missions/reviews/improvements/`; both homes
share one lifecycle so neither becomes a junk drawer.

**Nothing to do.** A pass over a healthy corpus (or with the gate closed)
reports honestly that there is nothing to do and writes nothing.

**Failure.** An interrupted or failing run leaves the store valid: a
relocation and its manifest entry land together or not at all; episode
distillation lands before its episodes are pruned. Re-running after a
failure is safe, and consecutive runs converge — a second immediate run
finds nothing new.

## Acceptance Criteria

Receipts and retirement authority:

- [ ] AC-001 - The frozen-receipt audit accepts a promoted seed record
  relocated to `knowledge/retired/<original-path>` with unchanged bytes
  and a manifest entry matching path + digest; rejects the same relocation
  without a manifest entry; and accepts a record's absence from the tree
  only when a ratified ledger round names it in `retiredRecords`. This
  extension ships and is green before any code that moves a file exists.
- [ ] AC-002 - An L4 run against a corpus containing a record with met
  retirement evidence relocates it bytes-unchanged to
  `knowledge/retired/<original-relative-path>` and appends a manifest
  entry under `memory/agent/retirements/` carrying path, digest, reason
  (`superseded | merged | obsolete | retire-when-met`), evidence, and date.
- [ ] AC-003 - A retired record leaves the injected index and default
  retrieval immediately; retrieval reaches it only via explicit
  `includeRetired` opt-in.
- [ ] AC-004 - Restoring a retired record is a `git mv` back plus a
  manifest annotation, after which index and retrieval include it again; a
  confirm round hard-deletes via `retiredRecords`.
- [ ] AC-005 - A record with live inbound citations (docs, specs, other
  records) is never auto-retired; the Dropper surfaces the conflict with
  both evidence sides instead.

Proposals and outlets:

- [ ] AC-006 - The Reflector emits `merge` proposals (N≥1 inputs; N=1 is
  an edit) into `memory/agent/proposals/`, each citing its input records
  by path + digest and carrying the proposed replacement content; the
  proposal itself changes no bytes under `knowledge/`.
- [ ] AC-007 - `improve` proposals follow the four-column schema with
  lifecycle `open → actioned|rejected → closed`; promotion converts
  (ROADMAP/task/prompt edit) and closes with a pointer; no prescriptive
  record ever appears under `knowledge/`.

Observation:

- [ ] AC-008 - A `gotcha` may carry optional `retire-when` frontmatter;
  the Observer evaluates checkable predicates each pass, and a met
  predicate yields a retirement candidate carrying the evaluation
  evidence. No new OKF knowledge type is introduced.
- [ ] AC-009 - Stale path citations (a cited path that no longer
  resolves) are detected deterministically, with no model call, and become
  edit proposals.

Bounds and honesty:

- [ ] AC-010 - Per-pass caps on observations, proposals, and retirements
  are enforced; a pass over a healthy corpus reports "nothing to do" and
  writes nothing.
- [ ] AC-011 - A dry run produces the would-retire manifest and proposal
  previews while every store remains byte-identical.

Seam and invocation:

- [ ] AC-012 - The knowledge store's `consolidate()` is the L4 entry
  point: its result reports what ran (observations, proposals written,
  retirements applied or proposed, manifest path) and remains an honest
  noop when there is nothing to do; the job is manually invokable via the
  CLI with no autonomy host present.
- [ ] AC-013 - The job is declarable as an autonomy-host payload — the
  payload contract exists and is documented; the end-to-end trigger firing
  is that sibling plan's demonstration, not this one's.

Safety and convergence:

- [ ] AC-014 - An interrupted run leaves every store valid — relocation
  and manifest entry land together or not at all; distillation lands
  before its episodes are pruned; a re-run completes cleanly and a second
  immediate run finds nothing new to do.
- [ ] AC-015 - The profile and every human-curated record are
  byte-identical across any run, apart from manifest-recorded relocations.

Sources:

- [ ] AC-016 - Adding a new source (e.g. OM reflections,
  external-session captures) requires only an adapter conforming to the
  sources contract — demonstrated by a contract test with a fake source;
  the corpus and the episodic log are the v1 sources.
- [ ] AC-017 - The episodic inlet distills episodes into note proposals
  and prunes consumed episodes only under the safe-prune predicate (bytes
  identical to what the run read), with distillation landing before any
  prune.

Documentation:

- [ ] AC-018 - The behavior, trust rules, retirement contract, proposal
  kinds, and CLI surface are documented in `docs/memory.md`, with the
  paired doc-pin assertions updated in the same change.

## Scope

Included:

- The receipt/ledger extension (A-4): `retiredRecords` on ledger rounds;
  manifest-aware relocation forgiveness in the frozen-receipt audit —
  sequenced first.
- Proposal kinds `retire`, `merge` (N≥1), `improve`: schemas, evidence
  chain, lifecycle.
- The retired area, the retirement manifest, soft-retire mechanics,
  retrieval/index exclusion, `includeRetired`.
- The L4 regulator: corpus-Observer (deterministic first, model second),
  corpus-Reflector (fold direction ruled: sub-records win — parents fold
  to thin overviews that link, not restate), corpus-Dropper (index-bound
  target; inbound-reference check).
- `gotcha` `retire-when` frontmatter support.
- The `consolidate()` seam made real: result types, dry-run, CLI
  invocation, the autonomy-host payload contract.
- The pluggable-sources contract with the corpus and episodic-log
  adapters; episode distillation → note proposals with safe-prune pruning
  (the original W4 arm — the planner may sequence it after the regulator,
  which is the priority slice).
- Documentation.

Excluded:

- A TTL on `knowledge/retired/` — recorded but DEFERRED (LM-D-001
  extension); it needs its own ruling once confirm-round cadence is
  observed. Do not design it here.
- L1 in-session capture, OM adoption, and the fork decision — deferred to
  the spike-§5 A/B (LM-D-003).
- Scheduling and triggers (`autonomy-host`); only the payload contract is
  here.
- The per-Drive-run improvement pass itself — shipped as policy
  (LM-D-008); its artifacts keep their home under
  `missions/reviews/improvements/`.
- Executing a live retirement round against `knowledge/`: the first live
  run is a separate owner-triggered act once the machinery ships (the
  prototype's high-confidence subset is the natural first payload).
- New OKF knowledge types (A-6), embeddings, governance tiers, and any
  change to explicit-save semantics (W2's contract stands).

## Assumptions

- Judgment-level observations need a model pass; deterministic checks
  catch a large share at zero model cost (prototype: 5/5 stale references,
  14/16 already-true predicates). The planner designs which agent/model
  and how output is constrained.
- An edit is represented as the N=1 `merge` case, staying inside A-5's
  ratified kind vocabulary; LM-D-001's ruled text ("edits and merges are
  proposals only") covers it.
- One prescriptive contract, two homes by emitter: the per-run pass writes
  `missions/reviews/improvements/<run-id>.md`; the pump and L4 write
  `memory/agent/proposals/` kind `improve`. Shared schema and lifecycle.
- Convergence rides the evidence chain: digests in manifests and proposals
  let a pass recognize what it (or a predecessor) already handled.
- Project scope first; the user-scope twin is out of v1 L4 scope unless
  the planner finds it free.
- The `knowledgeSurface` gate stays on throughout; until AC-001 lands, any
  L4 testing runs against copies or fixtures, never live `knowledge/`.
- Ratified ground consumed, not re-litigated: LM-D-001..008 and slate
  A-1..A-10 (`missions/architecture/living-memory.md` §7.1/§9), amended
  C-1/C-3 (`knowledge-and-memory.md` §9), the proposals-area ruling
  (`knowledge-and-memory.md` §11), and the 2026-09-01 rulings recorded in
  this plan's Decision Log (slug rename; sub-records win the rollup fold;
  9608b54 gets an edit-narrow proposal seeding the first ratified round).

## Open Questions

- Confirm-round cadence — owner call; its observed rhythm later informs
  the deferred TTL ruling.
- Does the Dropper's index-bound target need a configurable headroom knob,
  or is it derived from the existing combined-budget constants? (Planner.)
- Exact proposal file naming/format under `memory/agent/proposals/` for
  the new kinds — must carry the evidence chain and mesh with the format
  the 168-proposal round exercised. (Planner.)
- Does an L4 run record itself as an episode when `episodicLog` is
  enabled (the run leaving a trace in the log it consumes)?
- Retirement manifest round numbering: per-pass rounds, or aligned to
  confirm rounds? (Planner.)

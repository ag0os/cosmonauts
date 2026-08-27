# Knowledge-proposal backlog — analysis and consolidation plan

Date: 2026-08-27
**Ratified 2026-08-27 by the project owner** — the disposition table in
`knowledge-proposal-backlog-dispositions.md` (88 promote / 38 merge / 33 drop /
9 rulings) is approved as the plan of record.

**Executed 2026-08-27, same session, on the owner's explicit direction** —
all rounds complete; `memory/agent/proposals/` is empty. Final tallies (the 9
ruling files resolved per-ruling with owner approval: 2 more promotions, 6
merges, 1 superseded rejection): **90 promoted byte-identical · 44 merged by
recorded direct edit · 34 rejected on record.** Audit trail:
`knowledge-surface-promotion-{2..7}.md` + `knowledge-surface-backfill-amendment-1.md`.
The rejected-proposal exit path was ruled: rejections ride in promotion
ledgers (`rejections: [{path, sha256, reason}]`), test-enforced. Two further
mechanisms were added along the way, both amendment-pattern extensions the
execution surfaced as necessary: recorded config/inventory amendments
(`knowledge-surface-backfill-amendment` kind) and recorded post-migration
curation (`curatedRecords` in promotion ledgers — the migration audit pins
every migrated body byte-for-byte, so the sanctioned direct-edit path must be
ledger-recorded). Note for future curation: **promoted receipt records are
byte-pinned permanently** by the manifest/ledger digest checks — corrections
to promoted atomics must land as recorded edits to *editable* records or as
new promotion rounds, never as in-place edits.

Post-consolidation measurements: 236 knowledge records; index section 16,742
bytes (untruncated, inside the 24,000-byte envelope); 15 curated root
narratives remain among the 50 index slots; retrieval scan 236 files /
~553 KB / ~53 ms per turn. Full suite green: 2970/2970.
Scope: ROADMAP `knowledge-adoption` bullet 4 — "Revisit the 155 approved-but-unpromoted
proposals once index contents matter to a live consumer." The gate is now ON
(2026-08-26), so the precondition holds.
Companion: `knowledge-proposal-backlog-dispositions.md` (per-file staged review
material, all 168 proposals). Nothing under `knowledge/` or
`memory/agent/proposals/` was written, moved, or deleted by this analysis.

## TL;DR

1. The proposal backlog and the curated corpus are **complementary by
   construction** — the backfill deliberately targeted the 19 plans with no
   knowledge coverage. The feared mass duplication does not exist; measured
   content overlap is real but mostly additive.
2. A six-way parallel content survey of all 168 proposals against all 146
   curated records yields: **19 REDUNDANT · 71 OVERLAP · 68 NEW · 10 WEAK**,
   condensing to a recommended **88 promote · 38 merge-by-edit · 33 drop ·
   9 curator rulings**.
3. The binding constraint on promotion is **not the 24,000-byte budget** — it is
   the 50-slot, newest-first index and newest-first `recall` ordering.
   Selective promotion keeps the index healthy (22 promoted records enter,
   15 curated narratives survive); wholesale promotion floods it (only 7
   narratives survive).
4. **Two invariant tests are failing on current `main`**, broken by the
   2026-08-26 adoption commit itself. They are designed tripwires demanding an
   on-record human amendment — that amendment should ride with promotion
   round 2.

## 1. Corpus reconciliation

- `memory/agent/proposals/`: **168** proposals, 20 plan dirs
  (76 decision / 45 convention / 30 gotcha / 17 trade-off; ~175 KB).
- `knowledge/`: **147** files ≈ 37 root plan-narrative records + `index.md`
  (migration receipt — deliberately skipped by retrieval, so it costs no index
  slot) + 109 atomic records in 14 per-plan subdirs (~804 KB).
- **Slug-level overlap between the corpora is zero.** `backfill-review.json`
  records why: TASK-565 generated proposals for exactly its 19 `missingSlugs` —
  archived plans with no knowledge coverage. The 20th dir (`harness-adapters`,
  13 proposals) was written live by `coding/distiller` on 2026-08-26 and has no
  curated record either.
- The handoff's premise that proposals likely duplicate existing curated
  records (task-id-system, memory-interface, …) is **unfounded at the plan
  level** — those plans have curated records and no proposals. Real overlap is
  cross-plan and content-level (same subsystems described by different plans),
  measured in §3.
- The 9 "dead paths" in `backfill-review.json` are exactly the 9
  transcript-sourced proposals promoted in commit `c5ae12e`
  (`missions/reviews/knowledge-surface-promotion-1.md`). Nothing is lost.
  155 backfill + 13 harness-adapters = 168 on disk; +9 promoted = 164 indexed
  + 13 unindexed. All figures reconcile.

## 2. Index economics — measured 2026-08-27

Method: replayed the exact `combined-context.ts` render +
`allocateInjectionBudget` against the live corpus, then simulated promotions.

**Current state** (gate ON, this repo):
- 146 records retrieved, 0 warnings; scan cost 146 files / 436,868 bytes /
  ~43 ms per turn.
- Knowledge index section: **14,978 bytes**, untruncated (~300 bytes/entry).
  Whole injected message ≈ 15 KB for a knowledge-only agent — comfortable inside
  the 24,000-byte combined envelope (architecture-map and memory sections
  compete only for their authorized agents).
- **The binding constraint is `INDEX_LIMIT = 50`, newest-first — not bytes.**
  The 50 slots cut off at 2026-05-22; **~96 of 146 curated records are already
  index-invisible**, reachable only via `recall`.
- `recall` is substring match over title/description/tags/content, ordered
  newest-first (default limit 5, max 20). Recency beats relevance on both
  surfaces, so **timestamps are the de-facto curation lever**. Promotion is
  byte-identical, so promoted records keep their historical dates — index
  composition after promotion is determined, not chosen.

**Simulations** (historical dates kept):

| scenario | promoted records in the 50 slots | curated root narratives surviving | section bytes |
|---|---|---|---|
| today (no promotion) | 0 | 21 | 14,978 |
| wholesale — all 168 | 31 | 7 | 18,234 |
| selective — the 88 recommended | 22 | 15 | ~16.5 K |

Wholesale promotion is wrong even though the bytes fit: it evicts the curated
narratives in favor of backfill content. Selective promotion is the ratified
posture anyway — `knowledge-and-memory.md` §7: consolidation is *lossy
compression*; "deciding what is not worth remembering **is** the job."

Remaining evidence gap for `knowledge-adoption` bullet 3: this measures the
static index-cost half only. **Observed recall usage by live agents still has
no data** — nothing here substitutes for running internal agents and recording
what retrieval actually does.

## 3. Content-overlap survey — results

Six parallel surveyors read every proposal in full against the curated records
most likely to overlap (plus corpus-wide grep sweeps for the negatives). Full
per-file verdicts with citations: `knowledge-proposal-backlog-dispositions.md`.

**168 files → 19 REDUNDANT (11%) · 71 OVERLAP (42%) · 68 NEW (40%) · 10 WEAK (6%)**

Cluster patterns, most redundant → most novel:

- **quality-contracts (7)** — effectively obsolete: every survivor documents the
  QC-* criterion format that the artifact-format-redesign gate ladder
  superseded. Recommended: drop the dir; salvage one fragment (manual criteria
  are explicit human obligations) by edit.
- **analysis-capabilities (8), dialogic-planner (7), drive-smoke-fixes (7),
  driver-primitives (10)** — high redundancy with a shared cause: these are
  the *earliest* plan layers, and later plans (the four analysis-* narratives,
  spec-plan-quality-gates-a, drive-resilience, episodic-log-detached-hardening,
  memory-hardening, task-id-system) re-derived the same lessons with better
  evidence. The curated corpus should stay authoritative; survivors are deltas
  to merge.
- **roadmap-system (7)** — the headline is *staleness*, not duplication: five
  of seven describe the retired Now/Next/Later horizon model; one would install
  a procedure the shipped roadmap skill explicitly contradicts. 2 thin
  survivors.
- **orchestration-surface-consolidation (12), orchestration-hardening (10)** —
  mixed: half are deltas onto the durable-runtime records; the novel remainder
  forms two coherent new groups (a CLI-surface record; a review-and-verification
  lenses record).
- **external-backends-and-cli (11)** — 9 survivors form one uncovered subject:
  the detached-run *transport* (process lifecycle, two-lock scoping,
  PID-vs-completion, JSONL live-tailing, per-run compile cost).
- **coding-agnostic-framework (10), framework-extraction (8), package-system
  (9), main-domain-and-cosmo-rename (4)** — moderate overlap with the
  domain-config/domain-eject-and-tiers family plus novel groups: distribution/
  packaging failure modes, and corrections to stale curated guidance.
- **domain-authoring (11), external-agent-orchestration (7), harness-adapters
  (13), ruby-rails-skills (9), agent-thinking-levels (5), observability (6),
  fallow-temp-exceptions-cleanup (7)** — predominantly NEW. Five whole subject
  areas have **zero curated coverage**: role bindings/execution identity,
  domain visibility, agent packaging/export, skill-pack architecture, and
  thinking-level configuration (the last verified line-by-line against current
  source).

**Contradictions found (promotion must supersede, not accumulate):**
- name-vs-DSL resolution precedence proposal **reverses**
  `knowledge/chain-fanout.md` — the curated record is now wrong.
- cross-domain-qualification convention **corrects** the "qualified IDs
  exclusively" guidance in two `knowledge/domain-config/` atomics.
- cli-runnability predicate **supersedes** the curated
  infrastructure-domain-guard gotcha.
- QC-* survivors would **reintroduce a superseded contract** if promoted
  without a superseded marker.

The full rulings queue (9 items) is at the end of the dispositions file.

## 4. Consolidation plan (recommendation)

**Answer to the end-state question:** keep the atomic shape and the existing
convention — promote survivors byte-identical into `knowledge/<plan>/` subdirs,
exactly as promotion round 1 did. Do **not** author narrative records for the
20 backfilled plans (that would be new writing, not promotion, and the atomic
shape retrieves better under substring `recall`). Do not append proposals into
existing narratives verbatim; where the value is a delta on a curated record,
the human folds the delta in by direct edit (explicitly sanctioned by
`docs/memory.md`).

The established, test-enforced protocol (from round 1):
1. `git mv` each selected proposal to its `knowledge/<plan>/` destination —
   **bytes unchanged**.
2. Record the round in `missions/reviews/knowledge-surface-promotion-N.md`
   (`kind: knowledge-surface-promotion`, `promotions: [{from, to, sha256}]`).
3. `tests/scripts/knowledge-surface-backfill.test.ts` then enforces: byte
   identity via the ledger, and that every distiller-authored file under
   `knowledge/` has a ledger entry.

**Proposed rounds** (each one reviewed commit; ~88 promote, 38 merge, 33 drop):

- **Round 2 — harness-adapters (13) + repair the broken receipts.** The 13 are
  current, high quality, 0 redundant — and they are *outside* the pinned
  backfill manifest, which is one of the two reasons the invariant tests fail
  (§5). This round amends the manifest/approval artifacts on record and turns
  the suite green again.
- **Round 3 — the five zero-coverage subject areas** (~40 files): domain
  bindings + visibility (domain-authoring), agent packaging/export
  (external-agent-orchestration), detached-run transport
  (external-backends-and-cli), skill-pack architecture (ruby-rails-skills),
  thinking levels (agent-thinking-levels). Highest value density, minimal
  interaction with existing records.
- **Round 4 — corrections and conflicted items** (the 9 rulings): each needs a
  curator decision and possibly an edit to the contradicted curated record in
  the same commit.
- **Round 5 — merge-by-edit** (38 files): fold the stated deltas into the named
  curated records. This is authoring work, not moves; batch by target record.
- **Drops (33)**: see §6 — disposition of dropped files is an open policy
  question the current test makes concrete.

## 5. Broken invariant tests on `main` (pre-existing, found during analysis)

`tests/scripts/knowledge-surface-backfill.test.ts` has two failures on current
`main`, both introduced by commit `1e4567d` (2026-08-26, the knowledge-adoption
gate flip + harness-adapters distillation):

1. *"keeps the supervised machine GREEN artifact digest-complete and
   unpromoted"* — `beforeConfigDigest` is pinned to the pre-flip
   `.cosmonauts/config.json`; the enabled config now matches the manifest's
   `temporaryConfigDigest` instead (the backfill ran with the gate temporarily
   on). The completeness equality (`index.proposals == on-disk ∪ promoted`)
   also cannot hold with 13 unindexed harness-adapters files present.
2. *"derives the frozen current 19-slug batch…"* — `missions/archive/plans/`
   now contains `harness-adapters`, which fails the frozen-inventory check with
   the script's own designed error: "Backfill halted for an on-record inventory
   amendment."

These are tripwires working as designed — the world changed around a frozen,
human-approved receipt, and the tests demand the amendment happen on record.
The handoff's "2970 tests green" predates the flip. **Recommended:** treat the
amendment as part of promotion round 2 rather than a mechanical test fix — the
approval doc (`knowledge-surface-backfill-approval.md`) pins the manifest
digest, so any amendment is a human-gated change by construction.

## 6. Open decisions for the human

1. **Ratify the disposition table** (or amend it): 88 promote / 38 merge /
   33 drop / 9 rulings — `knowledge-proposal-backlog-dispositions.md`.
2. **What happens to dropped and merged proposals?** Current test semantics
   permit only byte-identical promotion as an exit; deletion of an indexed
   proposal turns the suite red. Options: (a) extend the ledger schema with a
   recorded `rejections`/`merged` list and amend the test — keeps the
   attributable audit trail; (b) leave dropped files in place indefinitely —
   zero risk, but the backlog never shrinks and `write` dedup keeps matching
   them. (a) is recommended.
3. **`backfill-review.json`**: retire or amend, don't blindly regenerate — it is
   a work receipt whose digest is pinned by the Stage-7B approval doc, and the
   tooling (`scripts/knowledge-surface-backfill.ts`) treats archive drift as
   halt-for-amendment by design. Round 2 must update manifest + approval + test
   expectations together, on record.
4. **Index-selection policy** (design question surfaced by the measurements,
   feeds `knowledge-adoption` bullet 3 / `memory-consolidation` re-spec):
   newest-first × 50 means every future promotion round reshapes the agent-visible
   index as a side effect. If curated narratives should stay visible, the
   selector needs a policy (pinning, type weighting, or relevance) — that is a
   post-adoption design decision that should wait for observed recall data.
5. **Timing**: rounds 3-5 could ride behind round 2 immediately, or wait for
   live recall observations (bullet 3 evidence) to validate that index slots
   are worth what this plan assumes. Round 2 should not wait — it also fixes
   the failing suite.

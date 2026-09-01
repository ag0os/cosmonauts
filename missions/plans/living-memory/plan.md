---
title: 'Living memory: sources, two outlets, and the corpus regulator'
status: active
createdAt: '2026-07-17T13:42:06.390Z'
updatedAt: '2026-09-01T19:12:43.264Z'
---

## Overview

Implement the ratified living-memory design as a configured `MemoryStore.consolidate()` pipeline: project corpus and episodic sources enter through one adapter contract; deterministic observation precedes one bounded model judgment; descriptive output becomes evidence-bound proposals; prescriptive output remains an `improve` proposal until a human converts it; and only receipt-authorized, citation-free, byte-stable project records may be soft-retired. Manual operation is `cosmonauts memory consolidate`; `--dry-run` returns the same previews without creating a lock, proposal, accepted-judgment receipt, manifest, journal, retired file, or episode deletion.

The implementation is architecture-linked planned work. It preserves the authoritative `missions/plans/living-memory/spec.md` invariants in rank order, especially: byte authority beats size pressure (INV-001), durable representation/evidence precedes removal (INV-002/INV-004), the receipt extension ships before relocation-capable code (INV-003), every inlet and outlet is lossy and bounded (INV-005), `improve` never enters `knowledge/` (INV-006), and target pressure is computed from the injected index rather than disk usage (INV-007).

Included: the receipt/ledger floor; proposal variants and lifecycle; project retired-area retrieval semantics; a native corpus Observer→Reflector→Dropper; conservative retirement authority and power-loss recovery; the configured `consolidate()` seam; manual consolidate/improve-resolution/restoration-annotation CLI surfaces; the autonomy payload adapter; corpus and episodic sources; documentation. Excluded: a retired-area TTL, a live run against this repository's `knowledge/`, scheduling/trigger execution, L1 or OM adoption/forking, user-scope L4 mutation, embeddings, new OKF knowledge types, and changes to explicit-save semantics.

This plan intentionally has 20 behaviors, above the normal 12-behavior guidance, because the authoritative spec has 18 ratified ACs and AC-012/AC-014 cross independent seams that need separate executable proof. `## Implementation Order` defines five mandatory task/release units with four hard dependency boundaries; no task may span two units, and shared contracts must land before later parallel work.

## Architecture Context

This plan implements `missions/architecture/living-memory.md` inside the trust boundary amended in `missions/architecture/knowledge-and-memory.md`.

Relevant ratified ground:

- `living-memory.md` LM-D-001/§7.2: Option C permits byte-identical soft retirement under a manifest; edits and merges remain proposals; hard deletion remains a human ledger act.
- LM-D-002: target size is derived from the injected index, never a disk quota.
- LM-D-003 and the OM spike D-5/D-7: L4 is native and accepts future OM output only through a source adapter; no OM dependency or fork enters this plan.
- LM-D-004/LM-D-008: prescriptive output uses the four-column schema, converts to product/backlog work, and closes rather than becoming knowledge.
- LM-D-005: only `gotcha` gains optional `retire-when`; the OKF type vocabulary does not grow.
- LM-D-009..LM-D-011: the existing slug stands; typed sub-records win the rollup fold; the 9608b54 record is an N=1 edit proposal, not a retirement.
- `knowledge-and-memory.md` §7/§9/§11: profile exclusion, safe-prune rules, lossy output, machine-side proposals, and human promotion remain authoritative.
- `missions/reviews/living-memory-l4-prototype.md`: stale path checks, inbound citations, and rollup duplication are measured seams, not hypothetical cases.

Current code evidence:

- `lib/memory/types.ts` exposes `MemoryStore.consolidate()` with no options and a noop-only `MemoryConsolidateResult`.
- `lib/memory/knowledge-store.ts` reads current project/user knowledge, writes only canonical record-creation proposals under `memory/agent/proposals/`, and returns the deliberate consolidation noop.
- `lib/memory/markdown-store.ts` owns authored records and episodes and also returns the W1 noop.
- `lib/memory/knowledge-records.ts` validates the four knowledge types but currently discards the ratified `retire-when` custom key.
- `lib/extensions/knowledge-surface/combined-context.ts` owns the current 24,000-byte combined budget and 50-row knowledge limit; `knowledge-tools.ts` owns `recall` and has no retired opt-in.
- `tests/memory/interface.test.ts` contains the frozen B-003 seed audit and recognizes only `curatedRecords`; it does not recognize relocation manifests or `retiredRecords`. Its existing field/body comparison is not an exact destination-byte receipt.
- The existing proposal path writer provides canonical identity, exclusive creation, symlink refusal, and retry convergence, but not file-and-directory sync durability. Living-memory must reuse its path checks while upgrading durable-before-remove writes.
- `lib/entity-file-lock.ts` is the reusable cross-process lock, but omitting `waitTimeoutMs` waits forever and release failures require `onReleaseUnconfirmed` ownership.
- `cli/main.ts` dispatches dedicated Commander subprograms; `cli/architecture/subcommand.ts` and `cli/architecture/narrative-provider.ts` are the local patterns for an injectable CLI operation and a no-tools in-memory Pi provider.

Boundary rules:

- `lib/memory/` owns data contracts, filesystem snapshots, proposal/receipt/retirement persistence, durable-write primitives, and pure pipeline decisions. It must not import CLI, agent definitions, orchestration, domains, tasks, or Pi.
- `lib/extensions/knowledge-surface/` owns the provider-visible index renderer/policy implementation. It depends on the policy contract in `lib/memory/`, never the reverse.
- `cli/memory/` owns Commander rendering, owner-invokable improve/restoration workflows, task/ROADMAP/prompt/skill pointer validation, and the Pi-backed judgment adapter. It composes the memory domain through injected interfaces; no model/runtime import enters `lib/memory/`.
- `consolidation-job.ts` exports a data-only autonomy payload adapter and imports no autonomy host. The sibling plan later schedules that contract.
- The existing `MemoryStore` remains the public entry seam. Only a knowledge store configured with a living-memory consolidator runs L4; markdown and architecture stores retain honest noops.

Capability evidence: runtime structural-analysis bindings for complexity, duplication, boundary conformance, and trace were inspected and invoked for `lib/memory`, `lib/extensions/knowledge-surface`, `cli`, and `tests/memory/interface.test.ts`; all returned `unbound` with `execution-not-consented`. The generated architecture map also reported no available modules. This is absence of structural evidence, not evidence of low complexity or clean boundaries, and remains a review risk below.

## Decision Log

- **D-001 - Ratified ground imported whole**
  - Decision: LM-D-001..008 and slate A-1..A-10 (`living-memory.md`
    §7.1/§9), amended C-1/C-3 (`knowledge-and-memory.md` §9), and the §11
    proposals-area ruling are consumed as ratified ground; the planner
    designs inside them.
  - Alternatives: re-derive or re-open during planning — forbidden;
    reopening is the owner's act alone.
  - Why: the design dialogue already ruled these with alternatives on
    record; re-litigation is drift.
  - Decided by: human, 2026-09-01 ("ratify all")
- **D-002 - Plan slug: rename, not fresh**
  - Decision: `git mv missions/plans/memory-consolidation` →
    `missions/plans/living-memory`; live references updated in the same
    change; archived/historical references stand.
  - Alternatives: fresh directory + superseded stub; keep dir, retitle
    only.
  - Why: A-7 says the re-spec *is* living-memory; one slug everywhere
    beats a ghost directory.
  - Decided by: human, 2026-09-01
- **D-003 - Rollup fold direction: sub-records win**
  - Decision: typed sub-records stay the retrieval/retirement unit; parent
    rollups fold to thin overviews that link, not restate.
  - Alternatives: parents win (retire contained sub-records); defer to the
    first L4 round with per-cluster evidence.
  - Why: matches OKF typing, record-level `retire-when`, and retrieval
    granularity; addresses the 110-record duplication at its cause.
  - Decided by: human, 2026-09-01
- **D-004 - The 9608b54 conflict: edit, not retire**
  - Decision: the ephemeral-session-compaction gotcha gets an edit-narrow
    proposal (keep the across-run claim the OM spike cites; drop the fixed
    within-run half), seeding the first ratified round.
  - Alternatives: retire on code evidence; leave untouched.
  - Why: cause-fixed evidence and inbound citations disagreed — exactly
    the case INV-004's inbound-reference check exists for; narrowing keeps
    the spike's citation valid.
  - Decided by: human, 2026-09-01
- **D-005 - Manual CLI composes a no-tools judgment provider**
  - Decision: expose `cosmonauts memory consolidate [--dry-run] [--no-model] [--model <provider/model>] [--json|--plain]`. Manual invocation is consent and needs no new feature gate. The default full pass uses one in-memory, no-tools Pi session with strict JSON output; `--no-model` runs deterministic checks only. Automatic invocation remains subject to the autonomy host's separate off-by-default gate.
  - Alternatives: reuse the full `coding/distiller` agent with project tools; add a second consolidation config gate; make model judgment mandatory for deterministic findings.
  - Why: Pi already supplies the model/session primitive, while no-tools composition preserves the path boundary, bounds cost, and lets AC-009 prove zero model calls (INV-001, INV-004, INV-005).
  - Decided by: planner-proposed, 2026-09-01
- **D-006 - Retirement commits manifest before live-path removal**
  - Decision: serialize mutating passes with the existing cross-process entity lock and use a durable journal plus `link live→retired`, atomic manifest creation, then `unlink live`. Before manifest commit, failures roll back the retired link; after manifest commit, durable commit intent rolls forward. A process can therefore never leave a live record absent without a matching durable manifest.
  - Alternatives: `rename` then append a manifest (unsafe crash gap); append then `rename` with no journal (manifest-only ambiguity); treat two filesystem writes as atomic.
  - Why: ordinary filesystems cannot atomically mutate `knowledge/` and `memory/` together; this ordering makes attention loss fail-safe and reconstructible after restart (INV-001, INV-003, AC-014).
  - Decided by: planner-proposed, 2026-09-01

  *(superseded by D-014, 2026-09-01)*
- **D-007 - Unknown ratification baselines block auto-retirement**
  - Decision: auto-retirement requires a reconstructible byte baseline: an unchanged frozen migration receipt or a promotion ledger digest with no later undigested `curatedRecords` entry. A record with unknown origin, later path-only curation, or changed current bytes yields a reviewable retire conflict/proposal and remains live.
  - Alternatives: trust current disk or git HEAD as ratification; treat writer metadata as authority; add invented digests to historical human ledgers.
  - Why: existing `curatedRecords` rows name paths but do not pin their resulting bytes. Conservative refusal is the only design that can prove “unchanged since ratification beyond recorded curation” without rewriting ratified history (INV-001, INV-002).
  - Decided by: planner-proposed, 2026-09-01

  *(superseded by D-013, 2026-09-01)*
- **D-008 - Index pressure uses guaranteed share plus one-row headroom**
  - Decision: extract the existing knowledge-row renderer and index constants into one policy. Pressure exists when the complete project+user index exceeds 50 rows or when its rendered bytes plus one current maximum-sized row and truncation framing exceed knowledge's guaranteed fair share when all three combined-context sections are present. Only project records are L4 mutation candidates.
  - Alternatives: disk quota; configurable arbitrary token target; current dynamic share with no headroom; user-scope pruning in v1.
  - Why: this derives the Dropper knob from the exact attention seam already paid each turn and reserves capacity for one new worst-case row without inventing a T-1 quota (INV-007).
  - Decided by: planner-proposed, 2026-09-01
- **D-009 - Manifest round numbers belong to mutating manifest events**
  - Decision: allocate `memory/agent/retirements/round-<n>.md` under the living-memory lock for each pass that commits at least one retirement or restoration event. Confirm-round numbers remain independent human ledger rounds. Manifest state is rebuilt by folding all round files; a later restoration event wins for its retirement id.
  - Alternatives: align machine and human round numbers; one mutable manifest; timestamps as filenames.
  - Why: per-event rounds preserve the ratified append-only sketch, allow reversal annotations without editing history, and avoid coupling machine cadence to an unresolved human confirm cadence (INV-004).
  - Decided by: planner-proposed, 2026-09-01
- **D-010 - Sources expose capped immutable snapshots, not store internals**
  - Decision: each source returns records with stable source id, scope-relative path, scope, kind, content, and SHA-256 of the bytes read. V1 scans all corpus metadata needed for target/citation safety but admits at most 50 corpus candidate bodies and 50 episodes; L4 emits at most 25 observations, 10 proposals, and 5 retirements, with at most one model request per pass.
  - Alternatives: pass `MemoryStore` implementations or OM ledger entries through the contract; one model call per record; unbounded full-corpus prompts.
  - Why: immutable snapshots make safe revalidation and future adapters possible without leaking substrate shape; explicit caps answer the per-pass cost question and enforce lossy behavior (INV-004, INV-005).
  - Decided by: planner-proposed, 2026-09-01
- **D-011 - Proposal kind is separate from knowledge type**
  - Decision: model machine output as `proposalKind: create | merge | retire | improve`. `create` may target a ratified knowledge type or an authored `note`; `merge.inputs` is non-empty and N=1 means edit; every variant carries evidence refs by scope+path+digest. `improve` closes only after a human supplies an existing ROADMAP/task/prompt/skill pointer or rejects it; no resolver moves it into `knowledge/`.
  - Alternatives: add `merge`/`improve` to OKF knowledge types; encode variants in filenames only; let consolidation perform product edits.
  - Why: variants are proposal lifecycle data, not durable knowledge vocabulary, and conversion must remain a human product act (INV-001, INV-004, INV-006).
  - Decided by: planner-proposed, 2026-09-01
- **D-012 - One plan retains all ratified ACs behind hard slices**
  - Decision: retain one behavior per acceptance seam, including split store/CLI and relocation/episode failure seams, and enforce the receipt floor, proposal/read path, retirement regulator, and episode/invocation layers as separate implementation slices.
  - Alternatives: compress several seams into assertion-ambiguous behaviors; create new slugs that split the authoritative spec.
  - Why: the user required this existing slug and authoritative spec to remain whole; explicit slice boundaries satisfy the size checkpoint without losing traceability.
  - Decided by: planner-proposed, 2026-09-01
- **D-013 - Exact destination bytes are the only corpus retirement baseline**
  - Decision: promotion ledger SHA-256 is an eligible baseline only while no later curation exists. The current frozen migration inventory's source digest and semantic metadata/body comparison do not establish exact destination bytes; those records remain baseline-unknown unless a separate human-ratified full-destination digest exists. The receipt audit still tests relocation using a synthetic exact pre-move byte snapshot and rejects serialization-only mutations.
  - Alternatives: treat field/body equivalence or `legacySourceSha256` as destination-byte identity; generate a new machine baseline and call it ratified.
  - Why: exact destination bytes are required by INV-002; semantic equality erases frontmatter serialization drift (`review.md` (round 1) PR-001).
  - Decided by: planner, amend-on-record, 2026-09-01
  - Supersedes: D-007's claim that the existing frozen migration receipt itself is a reconstructible exact-byte baseline.
- **D-014 - Removal authority requires synced evidence and bounded lock liveness**
  - Decision: add a memory-owned durable-file protocol that syncs file content and every affected parent directory entry. The manifest is committed only after its file and parent directory are synced; proposals are representation only after the same guarantee; journal removal and live/episode unlink are synced. Mutating passes call `withEntityFileLock` with 50 ms retry, a 10-second wait timeout, and `onReleaseUnconfirmed`; timeout returns `failed`, and release-unconfirmed returns a nonzero, committed-but-recovery-pending result. Never continue unlocked.
  - Alternatives: equate atomic visibility with power-loss durability; wait forever; hide release failure; remove source bytes after readable-but-unsynced evidence.
  - Why: visibility alone cannot support AC-014's durable-before-remove guarantee, and a live-PID lock must not hang CLI/autonomy forever (`review.md` (round 1) PR-002, PR-003).
  - Decided by: planner, amend-on-record, 2026-09-01
  - Supersedes: D-006's underspecified “durable” operations and unbounded direct-lock use.
- **D-015 - Owner lifecycle actions are explicit memory CLI commands**
  - Decision: extend D-005 with `cosmonauts memory improve action|reject` and `cosmonauts memory restore`. Improve commands validate and close one proposal; restore validates a human-performed `git mv` and appends the durable restoration round but never moves the record itself. All have human/plain/JSON output, conflict validation, idempotent retry, finite lock waits, and nonzero failure exits.
  - Alternatives: leave internal resolver functions as the only interface; let the machine move a restoration; require hand-editing machine state with no validation.
  - Why: every open improvement and retired state needs a reachable owner-controlled exit without widening machine authority (`review.md` (round 1) PR-006 and Missing Coverage restoration procedure).
  - Decided by: planner-proposed, 2026-09-01
- **D-016 - Accepted judgment is persisted before volatile output is used**
  - Decision: key a consolidation batch by schema/model mode plus sorted source scope+path+digest and deterministic observations. Before proposals or prune, durably persist the first validated normalized judgment under `memory/agent/consolidations/<batch-key>.json`; retries rehydrate it and do not call the model again. Proposal paths use batch key plus persisted output slot, never regenerated wording. Changed source evidence creates a new batch.
  - Alternatives: include model prose in the identity and assume byte-repeatability; call the model again after every restart; key only by title.
  - Why: a fresh in-memory model session cannot guarantee byte-identical wording, while episode pruning and immediate convergence depend on reusing the first durable output (`review.md` (round 1) PR-007).
  - Decided by: planner-proposed, 2026-09-01
- **D-017 - Citation authority uses a healthy canonical live inventory**
  - Decision: scan valid live project/user knowledge records excluding every reserved `index.md` and `retired/`; root `AGENTS.md`, `CLAUDE.md`, `README.md`, `ROADMAP.md` when present; `docs/**/*.md`; active `missions/plans/**/*.md`; and `missions/architecture/**/*.md`. Exclude archived missions, sessions, promotion/retirement receipts, and generated indexes. Normalize relative links against the citing file, strip anchors/query, and equate physical-relative and `knowledge/...` resource forms. Any unreadable, escaping, malformed, or incomplete relevant inventory blocks every auto-retirement for that pass.
  - Alternatives: scan every markdown receipt/history file; scan only knowledge/docs; ignore partial discovery; compare raw link strings.
  - Why: over-inclusion makes migrated records immortal while under-inclusion can miss a real citation and violate AC-005 (`review.md` (round 1) PR-005).
  - Decided by: planner-proposed, 2026-09-01
- **D-018 - One core factory owns all cross-worker contracts**
  - Decision: `createLivingMemoryConsolidator()` in `lib/memory/living-memory.ts` owns composition from exact source, judgment, proposal, accepted-receipt, retirement, durable-file, index-pressure, clock, lock, and limit interfaces. `consolidation-job.ts` and CLI receive that factory; the extension supplies only the injected index-pressure implementation.
  - Alternatives: let each CLI/job/store worker invent callback/detail shapes; import extension code from memory; let the store construct Pi.
  - Why: independent workers need one compile-time contract and inward dependency direction (`review.md` (round 1) PR-004).
  - Decided by: planner-proposed, 2026-09-01
- **D-019 - Slice boundaries are task boundaries**
  - Decision: task management must create at least one linked task for each of Slice 0..4, in that dependency order; no task spans slices. If a slice is decomposed further, its contract task precedes parallel implementation tasks and the total remains within the normal 5-12 task range.
  - Alternatives: one 20-behavior task; parallelize before shared types/persistence contracts exist.
  - Why: the authoritative spec remains whole while workers receive bounded ownership and explicit contracts (`review.md` (round 1) PR-010).
  - Decided by: planner-proposed, 2026-09-01

## Behaviors

### B-001 - Frozen receipts authorize only recorded relocation or deletion

- Source: AC-001
- Context: a seed fixture with an exact pre-move byte snapshot is (a) live, (b) present byte-identically at `knowledge/retired/<original-relative-path>`, or (c) absent from both locations
- Action: the B-003 migration audit folds healthy promotion ledgers, ordered `kind: knowledge-retirement-round` manifests, and ledger `retiredRecords`
- Expected: a matching active manifest accepts case (b), case (b) without it fails, and case (c) is accepted only when a human ledger names the original path in `retiredRecords`; metadata, body, full-byte serialization, path, digest, malformed/duplicate round, unknown restoration, invalid order, and malformed ledger mutations fail closed
- Seam: `tests/memory/interface.test.ts` frozen seed audit + `lib/memory/retirement-receipts.ts`
- Test: `tests/memory/interface.test.ts` > `accepts only manifest-backed relocation and ledger-backed hard deletion`
- Marker: `@cosmo-behavior plan:living-memory#B-001`

### B-002 - Eligible records soft-retire with byte and evidence receipts

- Source: AC-002
- Context: a promoted project record has a promotion SHA-256 baseline, unchanged current bytes, met retirement evidence, a healthy complete citation inventory with no inbound reference, and an available retirement slot
- Action: a non-dry configured knowledge store consolidates
- Expected: the live path is absent, the byte-identical file exists at the derived retired path, and one synced manifest round records original path, digest, allowed reason, consumed scope+path+digest evidence, reason text, and canonical date; the result names the applied retirement and manifest path
- Seam: `lib/memory/living-memory.ts` → `lib/memory/retirement-store.ts`
- Test: `tests/memory/living-memory.test.ts` > `soft-retires an eligible record with a complete durable manifest entry`
- Marker: `@cosmo-behavior plan:living-memory#B-002`

### B-003 - Retired knowledge is opt-in only

- Source: AC-003
- Context: live and retired project records coexist and the knowledge surface is assembled
- Action: combined-context injection, default `recall`, and `recall({ includeRetired: true })` read current disk
- Expected: injection and default recall expose only live records; opt-in recall also returns retired records with their original logical resource, physical retired path, and retired state; no user-scope mutation is implied
- Seam: `lib/memory/knowledge-store.ts`, `lib/extensions/knowledge-surface/combined-context.ts`, `lib/extensions/knowledge-surface/knowledge-tools.ts`
- Test: `tests/extensions/agent-memory.test.ts` > `excludes retired knowledge until recall explicitly opts in`
- Marker: `@cosmo-behavior plan:living-memory#B-003`

### B-004 - Restoration and human hard deletion have distinct receipts

- Source: AC-004
- Context: one record has an active retirement manifest event
- Action: a human `git mv`s it back and invokes `cosmonauts memory restore <original-path> --reason <text>`, then a separate fixture is hard-deleted under a human ledger `retiredRecords` entry
- Expected: restore validates live bytes against the active digest, refuses while the retired file still exists, appends a synced later restoration round under the finite lock, and re-enters default retrieval/injection; hard deletion remains absent and passes the frozen audit only through the human ledger
- Seam: `cli/memory/subcommand.ts` + `lib/memory/retirement-receipts.ts` manifest fold + knowledge retrieval
- Test: `tests/memory/living-memory.test.ts` > `annotates a human restoration and reserves hard deletion for the ledger`
- Marker: `@cosmo-behavior plan:living-memory#B-004`

### B-005 - Live inbound citations veto retirement and preserve the ruled 9608b54 claim

- Source: AC-005
- Context: cause-state favors retiring the 9608b54 fixture while the OM architecture fixture cites its across-run claim
- Action: the healthy canonical citation inventory and Dropper evaluate the candidate through a fake judgment matching the ratified disposition
- Expected: no live path moves; the result cites cause evidence and inbound source by scope+path+digest; an N=1 edit proposal keeps the across-run persistence warning and removes only the fixed within-run compaction claim
- Seam: `lib/memory/living-memory.ts` citation inventory, Dropper classification, and Reflector
- Test: `tests/memory/living-memory.test.ts` > `keeps cited 9608b54 live and emits the ruled edit-narrow proposal`
- Marker: `@cosmo-behavior plan:living-memory#B-005`

### B-006 - Reflector proposals preserve sub-record authority

- Source: AC-006
- Context: the corpus contains a true duplicate cluster and a parent rollup that restates typed sub-records
- Action: deterministic/model observations enter the Reflector
- Expected: it writes canonical `merge` proposals under `memory/agent/proposals/living-memory/` with non-empty replacement inputs by scope+path+digest and complete replacement metadata/body; the rollup case is an N=1 edit of the parent into a thin linked overview while sub-record bytes remain unchanged; no file under `knowledge/` changes
- Seam: `lib/memory/consolidation-proposals.ts` + `lib/memory/living-memory.ts` Reflector
- Test: `tests/memory/living-memory.test.ts` > `writes evidence-bound merge and parent-edit proposals without changing knowledge`
- Marker: `@cosmo-behavior plan:living-memory#B-006`

### B-007 - Improve proposals convert and close through owner commands

- Source: AC-007
- Context: the prescriptive outlet emits the four required columns under `memory/agent/proposals/living-memory/`
- Action: the owner invokes `cosmonauts memory improve action <proposal> --kind <roadmap|task|prompt|skill> --pointer <value>` or `... improve reject <proposal> --reason <text>`
- Expected: validated durable history follows `open → actioned → closed` with an existing conversion target, or `open → rejected → closed`; same-resolution retry is idempotent, conflicts/invalid pointers fail, and neither branch creates/moves any record under `knowledge/`
- Seam: `cli/memory/subcommand.ts` pointer validators → `lib/memory/consolidation-proposals.ts` lifecycle
- Test: `tests/cli/memory/subcommand.test.ts` > `actions or rejects improve proposals through a reachable closed lifecycle`
- Marker: `@cosmo-behavior plan:living-memory#B-007`

### B-008 - Gotcha retirement conditions are optional and checkable

- Source: AC-008
- Context: gotchas carry either no `retire-when`, free-text-only `retire-when`, or a supported path-exists/path-absent check with human-readable condition text
- Action: the corpus source parses records and the deterministic Observer evaluates safe scope-relative predicates
- Expected: the knowledge type remains `gotcha`; a met check emits a retirement candidate with predicate, checked path, observed result, and digest evidence; free text remains reviewable but cannot alone authorize relocation; unsafe/escaping paths are rejected
- Seam: `lib/memory/knowledge-records.ts` + `lib/memory/living-memory.ts` deterministic Observer
- Test: `tests/memory/living-memory.test.ts` > `evaluates supported gotcha retire-when checks without adding a knowledge type`
- Marker: `@cosmo-behavior plan:living-memory#B-008`

### B-009 - Stale path citations become deterministic edits

- Source: AC-009
- Context: a live record contains explicit `files` metadata, markdown links, or path-shaped backtick citations that no longer resolve inside the project
- Action: the deterministic Observer canonicalizes and scans citations
- Expected: it invokes no judgment provider, emits stale-reference evidence, and writes an N=1 edit proposal whose complete replacement metadata/body mechanically marks or removes only the unresolved citation while preserving surrounding content; live knowledge stays unchanged
- Seam: `lib/memory/living-memory.ts` citation resolver → `lib/memory/consolidation-proposals.ts`
- Test: `tests/memory/living-memory.test.ts` > `turns stale citations into deterministic N=1 edits without a model call`
- Marker: `@cosmo-behavior plan:living-memory#B-009`

### B-010 - Every pass is bounded, lossy, and honestly empty

- Source: AC-010
- Context: one fixture exceeds every inlet/outlet cap and another healthy fixture is within target with no observations
- Action: consolidation runs against each, including a source that over-returns and a duplicate source-local record id
- Expected: adapters over the advertised limit or globally duplicate `(sourceId,id)` fail before judgment; admitted bodies, episodes, observations, proposals, retirements, and model requests never exceed limits; a multi-input batch cannot emit one output per input; cap-deferred items are reported; the healthy pass returns `noop`, invokes no model, and writes nothing
- Seam: `lib/memory/living-memory.ts` validation, limits, and result assembly
- Test: `tests/memory/living-memory.test.ts` > `rejects source contract violations and enforces bounded lossy passes`
- Marker: `@cosmo-behavior plan:living-memory#B-010`

### B-011 - Dry run previews only a stable read-only snapshot

- Source: AC-011
- Context: corpus and episodes would produce proposals/retirements, or a journal/live mutation lock/concurrent byte change exists
- Action: `consolidate({ dryRun: true })` performs read-only pre/post lock, manifest-generation, and selected-byte checks before returning previews
- Expected: on a stable idle snapshot it returns proposal and would-retire previews while all stores stay byte-identical and creates no lock; an existing journal reports `failed` with `recovery: pending`, a live lock reports bounded `concurrent-mutation`, and any changed snapshot fails without model/write/recovery
- Seam: configured knowledge-store dry-run branch
- Test: `tests/memory/living-memory.test.ts` > `previews only a stable snapshot and observes pending recovery without mutating it`
- Marker: `@cosmo-behavior plan:living-memory#B-011`

### B-012 - Consolidate reports the work that actually ran

- Source: AC-012
- Context: a configured knowledge store has work, has no work, times out on a lock, is cancelled, or completes writes with lock release unconfirmed
- Action: callers invoke public `MemoryStore.consolidate(options?)`
- Expected: the discriminated result truthfully reports mode, sources, observations, proposal previews/paths, retirements proposed/applied, episode prunes, manifest path, accepted-judgment receipt, declines, warnings, committed writes, and recovery; no-work remains `noop`; timeout/cancel/pre-commit failure is `failed`; release-unconfirmed is failed/nonzero with committed writes explicit; markdown/architecture noops remain exact
- Seam: `lib/memory/types.ts` + `lib/memory/knowledge-store.ts`
- Test: `tests/memory/interface.test.ts` > `exposes exact living-memory outcomes through configured knowledge consolidate only`
- Marker: `@cosmo-behavior plan:living-memory#B-012`

### B-013 - Manual consolidation works without an autonomy host

- Source: AC-012
- Context: a project has no autonomy host and an injected CLI runtime exists
- Action: the user runs `cosmonauts memory consolidate` in full/no-model/dry-run and human/plain/JSON modes
- Expected: the command delegates exact options and AbortSignal, keeps JSON stdout clean, exits zero only for ran/noop with confirmed release, and exits nonzero for failed/pending/invalid/cancelled; `--json --plain` and `--no-model --model` are rejected before store/model access; no new config gate is required
- Seam: `cli/memory/subcommand.ts`, `cli/memory/judgment-provider.ts`, `cli/main.ts`
- Test: `tests/cli/memory/subcommand.test.ts` > `runs renders validates and cancels manual consolidation without autonomy`
- Marker: `@cosmo-behavior plan:living-memory#B-013`

### B-014 - Autonomy payload is declarable without scheduling code

- Source: AC-013
- Context: a future host needs a stable payload for this job
- Action: it validates and invokes `{ kind: "living-memory.consolidate", version: 1, scope: "project", dryRun, modelMode }` with execution project root and dependencies supplied by the host
- Expected: the adapter uses the same `createLivingMemoryConsolidator()` factory and public store seam; invalid versions/scopes fail before dependency/store access; no trigger, timer, host state, or absolute root is embedded in the payload
- Seam: `lib/memory/consolidation-job.ts`
- Test: `tests/memory/living-memory.test.ts` > `executes the versioned project payload through the shared factory and store seam`
- Marker: `@cosmo-behavior plan:living-memory#B-014`

### B-015 - Retirement transaction recovery survives power-loss boundaries

- Source: AC-014
- Context: subprocess failpoints hard-stop before retired-link sync, before manifest sync, after manifest commit, during live unlink, and before terminal journal removal
- Action: a fresh process starts the next mutating pass
- Expected: pre-commit states recover to live-only; post-commit states recover to synced manifest+retired-only; no live record is absent without synced evidence; terminal journal removal is synced; live-owner timeout and release-unconfirmed return bounded explicit failure rather than hanging/continuing unlocked
- Seam: `lib/memory/durable-files.ts` + `lib/memory/retirement-store.ts` + `lib/entity-file-lock.ts` options
- Test: `tests/memory/living-memory.test.ts` > `recovers hard-stopped retirement at every durable commit boundary`
- Marker: `@cosmo-behavior plan:living-memory#B-015`

### B-016 - Consecutive complete passes rehydrate and converge

- Source: AC-014
- Context: one pass accepted model judgment and committed proposals, retirements, and eligible episode pruning
- Action: a fresh configured store reruns immediately twice
- Expected: it reads the accepted-judgment receipt before model invocation, reuses recorded proposal paths/output, rebuilds manifest state, never rediscovers retired records or prunes episodes twice, completes pending durable recovery, and reaches an honest immediate noop
- Seam: `lib/memory/consolidation-receipts.ts` + `lib/memory/living-memory.ts`
- Test: `tests/memory/living-memory.test.ts` > `rehydrates accepted judgment and persisted evidence then converges to noop`
- Marker: `@cosmo-behavior plan:living-memory#B-016`

### B-017 - Consolidation cannot alter profile or curated bytes

- Source: AC-015
- Context: a pass contains model proposals, blocked retirements, one eligible retirement, authored memory, and a user profile
- Action: full consolidation completes
- Expected: profile/authored files and every non-retired curated file are byte-identical; the eligible record's destination bytes equal source exactly; no replacement content is directly written into `knowledge/`; synced evidence precedes every permitted source removal
- Seam: end-to-end living-memory filesystem boundary
- Test: `tests/memory/living-memory.test.ts` > `preserves profile authored memory and curated bytes across a full pass`
- Marker: `@cosmo-behavior plan:living-memory#B-017`

### B-018 - New sources require only the snapshot adapter contract

- Source: AC-016
- Context: a fake source implements the exported source interface without importing a store, Pi, OM, or pipeline internals
- Action: it is added beside corpus and episodic adapters and consolidation runs
- Expected: capped scope+path+digest snapshots enter the same flow and evidence; no concrete-source switch is needed; over-limit output, duplicate local ids, unsafe paths, and unsupported scopes fail at the boundary
- Seam: `lib/memory/consolidation-sources.ts`
- Test: `tests/memory/living-memory.test.ts` > `accepts valid fake source snapshots and rejects contract violations`
- Marker: `@cosmo-behavior plan:living-memory#B-018`

### B-019 - Episode proposals are durably accepted before safe pruning

- Source: AC-017
- Context: machine episodes are read into a bounded batch, one changes after read, and one model judgment folds several unchanged episodes into fewer note proposals
- Action: accepted judgment, proposal persistence, and source finalization run across a hard-stop/retry
- Expected: normalized judgment receipt and every representing proposal file/data+directory entry are synced before unchanged episodes are unlinked and their parent synced; changed episodes remain with digest conflict; write/sync failure prunes none; retry reuses accepted output without a model call then safely prunes; output stays lossy
- Seam: `lib/memory/consolidation-receipts.ts`, `lib/memory/consolidation-sources.ts`, durable proposal persistence
- Test: `tests/memory/living-memory.test.ts` > `syncs accepted folded note proposals before pruning unchanged episodes`
- Marker: `@cosmo-behavior plan:living-memory#B-019`

### B-020 - Memory documentation and pins describe the shipped contract

- Source: AC-018
- Context: users and sibling-plan implementers read the memory reference after implementation
- Action: documentation-pin tests inspect `docs/memory.md`
- Expected: it names source/judgment/index contracts, v1 sources, pass order/caps, proposal kinds/N=1 edits, owner improve/restore commands, exact-byte receipts, citation inventory, retired paths/manifests/restoration/hard deletion, durable recovery/lock timeout, default/opt-in retrieval, exact consolidate flags, dry-run/noop semantics, and versioned autonomy payload; stale configured-knowledge noop text is removed only for configured stores
- Seam: `docs/memory.md` paired with memory/CLI documentation pins
- Test: `tests/memory/interface.test.ts` > `documents living-memory trust outlets invocation durability and recovery`
- Marker: `@cosmo-behavior plan:living-memory#B-020`

## Design

### 1. Exact shared contracts

Extend the shared interface narrowly; existing callers remain source-compatible because inputs are optional and existing noop variants remain valid:

```ts
type ConsolidationModelMode = "full" | "deterministic-only";
type ConsolidationRecovery =
  | "none" | "pending" | "rolled-back" | "rolled-forward"
  | "release-unconfirmed" | "concurrent-mutation";

interface MemoryQuery {
  // existing fields...
  readonly includeRetired?: boolean;
}

interface MemoryConsolidateOptions {
  readonly dryRun?: boolean;
  readonly modelMode?: ConsolidationModelMode;
  readonly signal?: AbortSignal;
}

interface ConsolidationEvidenceRef {
  readonly id: string;
  readonly sourceId: string;
  readonly scope: "project" | "user";
  readonly path: string; // relative to the selected scope root
  readonly digest: string;
}

type ConsolidationObservationKind =
  | "duplicate" | "superseded" | "stale-reference" | "merge-candidate"
  | "retire-condition-met" | "obsolete-cause" | "improvement";

interface ConsolidationObservation {
  readonly id: string;
  readonly kind: ConsolidationObservationKind;
  readonly inputs: readonly ConsolidationEvidenceRef[];
  readonly reason: string;
}

interface ConsolidationProposalView {
  readonly proposalKind: "create" | "merge" | "retire" | "improve";
  readonly key: string;
  readonly path?: string; // absent for dry-run preview
  readonly inputs: readonly ConsolidationEvidenceRef[];
  readonly contentDigest: string;
  readonly status: "preview" | "written" | "existing";
}

interface MemoryConsolidateDetails {
  readonly dryRun: boolean;
  readonly modelMode: ConsolidationModelMode;
  readonly sources: readonly { sourceId: string; admitted: number; omitted: number }[];
  readonly observations: readonly ConsolidationObservation[];
  readonly proposals: readonly ConsolidationProposalView[];
  readonly retirements: readonly { path: string; digest: string; status: "preview" | "applied" | "blocked" | "deferred"; reason: string }[];
  readonly episodePrunes: readonly string[];
  readonly acceptedJudgmentReceiptPath?: string;
  readonly manifestPath?: string;
  readonly declines: readonly { code: string; path?: string; reason: string }[];
  readonly warnings: readonly MemoryWarning[];
  readonly recovery: ConsolidationRecovery;
  readonly writesCommitted: boolean;
}

type MemoryConsolidateResult =
  | { readonly kind: "noop"; readonly reason: string; readonly details: MemoryConsolidateDetails }
  | { readonly kind: "ran"; readonly details: MemoryConsolidateDetails }
  | { readonly kind: "failed"; readonly reason: string; readonly details: MemoryConsolidateDetails };

type KnowledgeConsolidator = (options?: MemoryConsolidateOptions) => Promise<MemoryConsolidateResult>;
```

`KnowledgeMemoryStoreOptions` gains `consolidator?: KnowledgeConsolidator`; its method delegates only when configured, otherwise returns an exact no-runtime noop. Markdown and architecture stores accept optional arguments and retain their current exact noops.

Judgment and target contracts are also exported from `lib/memory/`:

```ts
interface CorpusJudgmentInput {
  readonly schemaVersion: 1;
  readonly batchKey: string;
  readonly records: readonly ConsolidationSourceRecord[];
  readonly deterministicObservations: readonly ConsolidationObservation[];
  readonly limits: LivingMemoryLimits;
}

interface CorpusJudgmentOutput {
  readonly schemaVersion: 1;
  readonly observations: readonly {
    readonly kind: ConsolidationObservationKind;
    readonly inputIds: readonly string[];
    readonly reason: string;
    readonly proposal?: JudgedProposal; // closed create|merge|retire|improve union
  }[];
}

interface KnowledgeIndexPressureResult {
  readonly targetSatisfied: boolean;
  readonly recordCount: number;
  readonly maxRecords: number;
  readonly renderedBytes: number;
  readonly guaranteedBytes: number;
  readonly headroomBytes: number;
}

interface KnowledgeIndexPressurePolicy {
  measure(records: readonly RetrievedMemoryRecord[]): KnowledgeIndexPressureResult;
}
```

`JudgedProposal` is a closed discriminated union carrying all required replacement metadata/body or four improve columns; no path is model-supplied. `createLivingMemoryConsolidator(dependencies)` in `lib/memory/living-memory.ts` is the sole composition factory. Its dependency object explicitly requires sources, judgment provider (optional only in deterministic mode), proposal store, accepted-judgment receipt store, retirement receipt/store, durable files, index-pressure policy, clock, limits, and finite lock options. CLI and `consolidation-job.ts` call this factory; memory never imports the extension or Pi.

### 2. Source, judgment, and accepted-output contracts

`lib/memory/consolidation-sources.ts` defines:

```ts
interface ConsolidationSourceRecord {
  readonly id: string;
  readonly sourceId: string;
  readonly scope: "project" | "user";
  readonly path: string;
  readonly digest: string;
  readonly kind: "knowledge" | "episode" | "artifact" | "reflection";
  readonly content: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

interface ConsolidationSource {
  readonly id: string;
  collect(options: { readonly limit: number; readonly signal?: AbortSignal }): Promise<{
    readonly records: readonly ConsolidationSourceRecord[];
    readonly omitted: number;
  }>;
  finalize?(represented: readonly { id: string; digest: string; proposalPaths: readonly string[] }[]): Promise<readonly string[]>;
}
```

The pipeline rejects over-limit return arrays, duplicate `(sourceId,id)`, record/source-id mismatch, unsafe paths, unsupported scopes, and invalid digests. Corpus scans all live project/user metadata required for index/citation safety but admits at most 50 selected project bodies to content judgment. User records contribute to target/citation measurement but are never mutation candidates. Episodic input admits at most 50 project episodes.

For a full model batch, compute `batchKey` from schema version, model mode/model identity, sorted source scope+path+digest, and deterministic observations—never model wording. Before calling a model, read `memory/agent/consolidations/<batch-key>.json`. A healthy accepted receipt contains exact inputs, normalized output, stable output slots, and target proposal paths. If absent, make one bounded call, validate known ids/kinds/caps/lossiness, then durable-write the accepted receipt before materializing proposals. If present, rehydrate it and make no call. State is `accepted → materialized`; both are durable machine receipts and are never injected/indexed. Changed source digest yields a new key.

The CLI judgment provider uses `DefaultResourceLoader` with no extensions, skills, prompts, themes, context files, or tools; `SessionManager.inMemory()`; `FALLBACK_MODEL` unless overridden; and the caller AbortSignal. It makes at most one request only after deterministic checks. Invalid/cancelled output fails before mutation. Explicit manual invocation or autonomy-host consent is consent to send the bounded selected content to the configured provider; no project-controlled command is executed.

### 3. Index-bound target

`lib/extensions/knowledge-surface/index-policy.ts` extracts the current row renderer, 50-row limit, combined 24,000-byte constant, and exact framing measurement. It implements the core `KnowledgeIndexPressurePolicy`; combined injection and CLI/job composition use the same implementation.

The complete current project+user metadata set is measured. Guaranteed share is the fair allocator's share when memory, architecture, and knowledge are all non-empty. Headroom is the largest current row plus exact truncation/footer framing. Pressure is:

```text
records > 50 OR renderedIndexBytes + oneRowHeadroom > guaranteedKnowledgeShare
```

Pressure ranks already-authorized project candidates; it never grants authority. If safe candidates are exhausted, report `target-unmet`. Never mutate user records, lower headroom, or substitute disk bytes.

### 4. Healthy citation inventory and Observer

The deterministic Observer:

1. Parses current live records and exact raw-byte digests.
2. Parses gotcha `retire-when` as free text or `{ condition, check: { kind: "path-exists" | "path-absent", path } }`. Only contained scope-relative non-symlink-escaping paths execute; no tests/scripts/commands execute.
3. Extracts explicit `files` metadata, markdown link destinations, and path-shaped backticks. Relative links resolve from the citing file; URL query/anchor is removed; percent decoding is safe; physical-relative and `knowledge/...` resource forms canonicalize to one project-relative target.
4. Builds a healthy inventory from valid live project/user knowledge records excluding every `index.md` and `retired/`; root `AGENTS.md`, `CLAUDE.md`, `README.md`, `ROADMAP.md`; `docs/**/*.md`; active `missions/plans/**/*.md`; and `missions/architecture/**/*.md`. It excludes `missions/archive`, sessions, reviews/ledgers, generated indexes, and retirement/consolidation receipts. Missing optional roots are empty; any discovered unreadable/malformed/escaping entry makes the inventory incomplete and blocks every auto-retirement while still permitting a report.
5. Measures index pressure and selects bounded unresolved candidates.

Stale paths yield deterministic N=1 edit proposals that change only complete replacement metadata/body at the unresolved citation. The model may add duplicate/superseded/merge/obsolete/improvement observations but every output cites known inputs and never alone grants retirement authority.

The Reflector turns the ratified 9608b54 fixture into the exact edit-narrow output in B-005 through a fake-provider integration test—no production record id is hard-coded. Rollup/sub-record observations target only the parent as N=1 edit; N≥2 merge inputs identify records a human replacement would supersede.

### 5. Proposal store and owner exits

Extract existing containment/symlink/exclusive path checks into `proposal-files.ts`, but route all evidence and accepted-judgment writes through the durable protocol in §7. Living-memory proposal paths are `memory/agent/proposals/living-memory/<proposalKind>-<slot>-<batch-or-evidence-key>.md`. Model paths derive from persisted batch key/output slot; deterministic paths derive from exact input evidence/span. Changed evidence creates a new path; volatile wording does not.

- `create`: target is one ratified knowledge type or authored `note`; complete target metadata/body included.
- `merge`: non-empty replacement inputs plus support refs and complete replacement; N=1 is edit.
- `retire`: target, allowed reason, favorable and blocking evidence; used when semantic evidence exists but authority is blocked.
- `improve`: four columns and durable history.

`cosmonauts memory improve action` validates proposal containment/kind/status and delegates pointer checks at the CLI edge: ROADMAP heading exists; task resolves through existing task read APIs; prompt/skill path is contained and exists. The memory resolver receives the validated discriminated pointer and durably records `actioned`, then `closed`. Reject records `rejected`, then `closed`. Identical retry returns the existing closure; conflicting resolution fails. No command performs product edits or writes/moves into `knowledge/`.

Existing Drive improvement artifacts stay under `missions/reviews/improvements/`; docs/pins enforce the same four columns and lifecycle without moving them.

### 6. Receipt authority and manifest fold

`retirement-receipts.ts` lands read-only in Slice 0. It returns `healthy` or an explicit fail-closed inventory error and parses:

- `knowledge-surface-promotion` ledgers (`promotions`, `curatedRecords`, new `retiredRecords`);
- ordered `memory/agent/retirements/round-<n>.md` with frontmatter `kind: knowledge-retirement-round`;
- `retired` events carrying id, original path, digest, allowed reason, evidence refs/reason, and date;
- later `restored` events referencing a known retirement id/path/digest/date/reason.

Malformed rows, duplicate/nonpositive/noncontiguous round numbers, duplicate retirement ids, unknown restoration references, conflicting latest events, unsafe paths, or unreadable files make the fold unhealthy and block movement/audit acceptance. Persisted paths are evidence only. Retired destination is always derived from contained original `knowledge/<relative>.md`.

Exact baseline outcomes:

| Record history | Auto-retirement outcome |
|---|---|
| Promotion destination bytes equal recorded SHA-256; no later curation | eligible exact baseline |
| Current frozen migration inventory only | remain live; it proves semantic migration, not exact destination serialization |
| Separate human-ratified full-destination digest exists | eligible exact baseline |
| Later path-only `curatedRecords` | remain live; baseline unknown |
| Unknown origin or current/run digest mismatch | remain live; baseline/digest conflict |

The B-001 synthetic move begins from an exact raw byte snapshot, so relocation tests full bytes and a serialization-only mutation fails. The existing frozen audit's metadata/body/index checks remain; no machine-generated baseline is called ratified. Absence from both locations is forgiven only by healthy human `retiredRecords`.

### 7. Durable files, lock liveness, and retirement transaction

`lib/memory/durable-files.ts` owns the only removal-precondition protocol:

- exclusive/replace write: temp in destination directory → write all bytes → file-handle sync → link/rename into place → destination parent-directory sync → temp removal and parent sync;
- durable link: create destination hard link → destination parent sync;
- durable remove: unlink → affected parent sync;
- unsupported file or directory sync fails closed before any source removal.

Proposal/accepted-judgment data and parent entries must be synced before episode prune. Journal data/parent must be synced before transaction actions. Manifest data/parent sync is the retirement commit point. Live unlink and its parent sync happen only after that point. Terminal journal removal/parent sync closes recovery. Ordinary exception tests and subprocess hard-stop tests are separate.

Mutating passes call `withEntityFileLock(".cosmonauts/living-memory.lock", action, { retryDelayMs: 50, waitTimeoutMs: 10_000, onReleaseUnconfirmed })`. Timeout returns `failed` and CLI/payload nonzero; no unlocked fallback. Release-unconfirmed returns `failed` with `writesCommitted` and `recovery: release-unconfirmed`, so a long-lived host cannot mistake it for success.

Retirement batch sequence:

1. Under finite lock, recover prior journal and revalidate exact bytes, baseline, healthy citation inventory, paths, and round allocation.
2. Durable-replace `prepared` journal with canonical original/derived paths, digests, and prospective manifest bytes/path.
3. Durable-link live files to retired destinations while live remains authoritative.
4. Durable-exclusive-write immutable manifest round; after file+parent sync, commit intent exists.
5. Durable-remove live links. Any post-commit exception rolls forward.
6. Durable-remove terminal journal only after every committed entry is manifested-retired.

Pre-commit crash recovery removes uncommitted retired links and leaves live-only. Post-commit recovery completes removals. Dry run performs no lock/recovery: if a journal exists it reports pending; if a live lock exists it reports concurrent mutation; otherwise it fingerprints lock absence, manifest generation, and selected bytes before/after observation and fails if unstable.

Candidate outcomes:

| Representation / met condition | Exact unchanged baseline | Healthy inventory / inbound | Mode/cap | Outcome |
|---|---|---|---|---|
| no | any | any | any | observation only; never move |
| yes | no | any | any | retire conflict/proposal; remain live |
| yes | yes | unhealthy | any | inventory conflict; all records remain live |
| yes | yes | healthy + inbound | any | citation conflict + edit/retire proposal; remain live |
| yes | yes | healthy + none | dry run | would-retire preview |
| yes | yes | healthy + none | actual under cap | journaled synced soft retirement |
| yes | yes | healthy + none | cap full | cap-deferred; no candidate write |
| yes at observation, changed at commit | any | any | actual | digest conflict; remain live |

State exits:

- journal `prepared → rolled-back | committed → rolled-forward`, then durable removal;
- accepted judgment `absent → accepted → materialized`, rehydrated by batch key;
- manifest `live → retired → restored`; hard deletion is separate `retiredRecords`;
- improve `open → actioned|rejected → closed` through owner CLI;
- create/merge/retire proposals exit through existing human promotion/curation/rejection ledger process.

### 8. Retrieval and restoration

`knowledge-store.ts` skips any root `retired/` subtree unless `includeRetired === true`. Opt-in maps physical retired location to original logical resource for current frontmatter validation, adds `retired?: true`, and retains physical path. Combined injection never opts in. `recall` adds a closed-schema optional boolean only to its knowledge request.

Restoration remains two acts: human `git mv` first, then `cosmonauts memory restore`. The command acquires the finite lock, folds a healthy manifest, proves an active retirement and unchanged live bytes, proves retired destination absent, allocates the next round, and durable-writes a `restored` event. It never moves or edits curated bytes. Concurrent machine activity, mismatch, or malformed history fails nonzero.

### 9. Episode ordering and convergence

The episodic source reads project episodes only with exact digests. The first validated model fold is durably accepted by batch receipt, then each fewer `create`/`note` proposal is durably materialized. Only when all paths recorded for an episode are synced/readable does `finalize()` reopen no-follow, compare digest, unlink, and sync the episode parent. Changed episodes warn and remain. Any write/sync failure leaves associated episodes. Hard stop after acceptance/proposal but before prune rehydrates exact output without another model call.

Consolidation never reads/writes profile, note, or playbook records except machine-side note proposals. Explicit-save/profile authority remains unchanged.

### 10. CLI and autonomy adapters

`cli/memory/subcommand.ts` follows the injectable execute/render split used by architecture CLI and owns subcommands:

```text
cosmonauts memory consolidate [--dry-run] [--no-model] [--model <provider/model>] [--json|--plain]
cosmonauts memory improve action <proposal> --kind <roadmap|task|prompt|skill> --pointer <value> [--json|--plain]
cosmonauts memory improve reject <proposal> --reason <text> [--json|--plain]
cosmonauts memory restore <knowledge/path> --reason <text> [--json|--plain]
```

`--json` conflicts with `--plain`; `--no-model` conflicts with `--model`. JSON stdout has no progress. AbortSignal reaches source/model/pipeline; cancellation before commit rolls back/no-writes, while after commit recovery rolls forward and reports committed failure.

`consolidation-job.ts` defines closed `LivingMemoryPayloadV1` with kind, version 1, project scope, dryRun, and modelMode; project root/dependencies are execution context, not payload. It validates before dependency access, calls `createLivingMemoryConsolidator()`, injects it into the knowledge store, and returns the public result. `noop` is the future host's skip-empty signal; scheduling, retries, wakes, and gates remain in `autonomy-host`.

## Files to Change

- `tests/memory/interface.test.ts` ↔ `lib/memory/retirement-receipts.ts` (new): B-001 read-only receipt/ledger extension; lands alone before relocation-capable code.
- `tests/memory/interface.test.ts` ↔ `lib/memory/types.ts`, `lib/memory/index.ts`: B-012 exact public source/judgment/index/consolidator/result contracts and existing noop compatibility.
- `tests/memory/living-memory.test.ts` (new) ↔ `lib/memory/living-memory.ts` (new), `lib/memory/consolidation-sources.ts` (new): B-005, B-008..B-011, B-016, B-018 pipeline, healthy citation inventory, bounds, dry-run, and convergence.
- `tests/memory/living-memory.test.ts` (new) ↔ `lib/memory/consolidation-receipts.ts` (new): B-016/B-019 accepted model-output persistence and rehydration.
- `tests/memory/living-memory.test.ts` (new) ↔ `lib/memory/consolidation-proposals.ts` (new), `lib/memory/proposal-files.ts` (new), `lib/memory/knowledge-store.ts`, `lib/memory/knowledge-records.ts`: B-006..B-009 variants, evidence, owner lifecycle, existing path-safety reuse, and `retire-when`.
- `tests/memory/living-memory.test.ts` (new) ↔ `lib/memory/durable-files.ts` (new), `lib/memory/retirement-store.ts` (new), `lib/entity-file-lock.ts` options: B-002/B-004/B-015/B-017 synced manifest/transaction/recovery/byte authority and bounded liveness.
- `tests/extensions/agent-memory.test.ts` ↔ `lib/memory/knowledge-store.ts`, `lib/extensions/knowledge-surface/knowledge-tools.ts`: B-003 opt-in retired recall and default exclusion.
- `tests/extensions/architecture-memory.test.ts` ↔ `lib/extensions/knowledge-surface/index-policy.ts` (new), `lib/extensions/knowledge-surface/combined-context.ts`: B-010 shared renderer/budget policy implementing the core interface.
- `tests/memory/interface.test.ts` ↔ `lib/memory/markdown-store.ts` and existing architecture adapters: optional consolidate arguments compile while exact noops remain.
- `tests/memory/living-memory.test.ts` (new) ↔ `lib/memory/consolidation-job.ts` (new): B-014 closed autonomy payload and shared factory invocation.
- `tests/cli/memory/subcommand.test.ts` (new) ↔ `cli/memory/subcommand.ts` (new), `cli/memory/judgment-provider.ts` (new): B-004/B-007/B-013 owner commands, pointer validation, output modes, model isolation, conflicts, cancellation, and exit codes.
- `tests/cli/memory/main-dispatch.test.ts` (new) ↔ `cli/main.ts`: top-level `memory` dispatch without interactive fallthrough.
- `tests/memory/interface.test.ts` ↔ `docs/memory.md`: B-020 exact contract pins and scoped configured-store noop updates.

## Risks

- **Receipt weakening would authorize destructive absence.** Slice 0 preserves all current metadata/body/index checks and adds exact-byte/serialization and malformed-history negatives. If AC-001 cannot be expressed without weakening the audit, stop and escalate.
- **Power-loss durability varies by filesystem/runtime.** All file and parent sync failures fail closed before removal. If the target cannot support required same-filesystem hard links or directory sync, report unsupported and halt; rename-first/readable-only fallback is forbidden.
- **Historical curation lacks exact result digests.** D-013 intentionally reduces current corpus throughput. Size may remain above target; inventing a baseline or trusting semantic equality would violate INV-001/INV-002.
- **Citation discovery can be partial.** D-017 defines live sources and canonical forms; any incomplete relevant inventory blocks all retirement. New project layouts are handled by root-relative discovery, not this repo's directory names.
- **Accepted judgment receipts are additional machine correctness state.** They are not injected/indexed and are content-addressed by source evidence. Malformed/colliding receipts fail closed; they must not become an alternative knowledge corpus.
- **Model output can be unverifiable/high-volume.** Known-id, closed union, one-call, cap, and lossy validation reject it before acceptance. Do not loosen evidence to salvage output.
- **Finite lock release can still need operator recovery.** Timeout/release-unconfirmed are explicit nonzero outcomes with committed state visible; no same-process success is fabricated.
- **User records may consume index budget while v1 cannot prune them.** Report target unmet after safe project candidates; do not mutate the user twin.
- **Structural evidence is unavailable.** Complexity, duplication, boundaries, and trace are unbound; manual review must inspect new durable-state modules, extracted proposal logic, and imports.

Pivot/abort conditions: stop before Slice 2 unless receipt evidence is independently green; stop if exact baseline or synced-before-remove cannot be proven; stop rather than retire on unhealthy citation/receipt inventory, mismatch, lock uncertainty, or provider drift; amend before changing expected behavior; never expand into scheduling, live-corpus execution, TTL, user mutation, or OM to pass a gate.

## Quality Contract

Plan-specific assertions:

1. The frozen audit accepts exactly manifest-backed relocation and ledger-backed hard deletion; serialization-only, malformed round/ledger, path, digest, and body mutations fail.
2. Subprocess hard-stop evidence at every durable boundary proves no missing live/episode bytes without synced representation.
3. Inbound citations, incomplete inventory, unknown baselines, changed bytes, unsafe paths, lock timeout/release uncertainty, and caps keep records live with explicit evidence.
4. Dry-run/healthy noop leave all stores byte-identical and read-only observe pending recovery/concurrency instead of performing it.
5. Merge/edit/improve/note outputs stay in machine proposal/receipt areas; prescriptive content/replacement bodies never enter `knowledge/` automatically.
6. Target measurement uses the exact injection renderer/constants; source/cap/lossy validation rejects over-limit, duplicate-id, and one-output-per-input batches.
7. Fresh retries rehydrate accepted model output and manifest/proposal evidence, complete safe recovery/prune, and converge without another model call.
8. Consolidate, improve action/reject, restore, and payload adapters use the exact core contracts; `lib/memory` imports no Pi/CLI/task/domain/extension implementation.

Current plan-time artifact-conformance evidence is **not yet passing**: three named test files and all living-memory markers are RED-step deliverables. The binding exists, but completion is blocked until each referenced file resolves and carries its exact marker.

| Order | Gate kind | Tier | Binding state | Threshold | Protocol | Degradation / notes |
|---:|---|---|---|---|---|---|
| 1 | `correctness` | universal | bound | Project-native unit, integration, type, and lint evidence passes after every commit; Slice 0 receipt evidence stays green at every later commit | project-discovered | hard fail; no relocation-capable commit while receipt evidence is red |
| 2 | `artifact-conformance` | universal | bound | all B-001..B-020 fields, resolving root-relative test files, and exact test markers are present | artifact evidence | currently failing/pending RED homes; hard fail at completion |
| 3 | `mutation` | bindable | unbound | receipt, serialization, dry-run, citation inventory, baseline, proposal boundary, lock, sync, and crash-recovery mutations are killed | pending | unbound, not enforced; verifier runs named negatives and reviewer judgment is required |
| 4 | `duplication` | bindable | unbound | no second path-safety/durable writer or index renderer remains | pending | unbound (`execution-not-consented`); manual review required |
| 5 | `complexity` | bindable | unbound | durable and pipeline state transitions match the specified tables with no implementer-decided cells | pending | unbound; manual state-table review required |
| 6 | `boundary-conformance` | bindable | unbound | memory core has no outward imports; CLI/model/extension implementations depend inward through exact interfaces | pending | unbound; manual import inspection required |
| 7 | `dead-code` | bindable | unbound | superseded noop/renderer/private writer paths are removed only where replaced; every new export has a consumer | pending | unbound; manual review required |

## Implementation Order

Every behavior uses one-agent RED → GREEN → REFACTOR. Universal correctness evidence runs after each commit, and B-001 runs at every commit from Slice 0 onward. Task management must create 5-12 linked tasks with at least one task for each Slice 0..4, preserve the dependency chain, and forbid tasks spanning slices. If a slice is decomposed, its shared-contract task lands before parallel workers.

### Slice 0 - Receipt floor task/release unit (must ship first)

1. B-001 RED in `tests/memory/interface.test.ts`: exact raw pre-move bytes; missing/wrong manifest; serialization-only mutation; malformed/duplicate/noncontiguous rounds; unknown restore; malformed `retiredRecords`; hard deletion without ledger.
2. Implement only read-only `retirement-receipts.ts` and receipt-facing docs. No function in this slice may link, rename, unlink, or delete under `knowledge/`.
3. Preserve every existing frozen metadata/body/destination/index assertion. Create/commit exact B-001 marker. Commit this unit independently; every later commit reruns it.

### Slice 1 - Shared contracts, proposals, read semantics, policy task/release unit

4. RED/GREEN exact exported contracts and `createLivingMemoryConsolidator()` factory skeleton (B-012/B-014/B-018); configured store delegation; existing noops.
5. RED/GREEN retired default/opt-in retrieval and logical-resource parsing (B-003); no movement code.
6. RED/GREEN durable-file primitives with non-destructive temp fixtures only, proposal path extraction, accepted-judgment receipt/store, variants, N=1/sub-record rule, and improve state machine (B-006/B-007/B-016 contracts). No source removal.
7. RED/GREEN `retire-when`, canonical healthy citation inventory, deterministic stale edit, index policy, source validation, caps/lossiness (B-005/B-008..B-010/B-018). Include root/index/relative-link/anchor/incomplete-inventory negatives and exact 9608b54 temp fixture.

**Boundary:** contracts and all proposal/read-only behavior are independently green; no live knowledge/episode path can be removed.

### Slice 2 - L4 regulator and Option C authority task/release unit

8. RED B-002/B-011/B-015/B-017 with temp projects, finite lock timeout/release callbacks, data/parent sync spies, ordinary exception cases, and subprocess hard-stop failpoints before adding removal code.
9. Implement retirement store: finite fail-closed lock, durable journal/link/manifest/unlink protocol, healthy receipt/baseline/citation revalidation, round allocation/fold, dry-run stable snapshot, and committed-failure reporting.
10. Compose Observer→Reflector→Dropper with fake provider and index pressure only after authority predicates. Treat manifest sync as commit intent in normal and exception paths.
11. Complete accepted-judgment materialization and B-016 fresh-process convergence for corpus proposals/retirements. Do not execute a live repository retirement round.

### Slice 3 - Episodic inlet and invocation task/release unit

12. RED/GREEN B-019 with accepted-output receipt, proposal file+parent sync, episode digest recheck, episode parent sync, write/sync failure, hard-stop/retry, and no second model call.
13. RED/GREEN B-014 closed payload through the shared factory; no host import.
14. RED/GREEN B-004/B-007/B-013 CLI: consolidate conflicts/cancel/output/exit; improve action/reject pointer validation/idempotency; restore post-`git mv` annotation and race/lock failures; top-level dispatch.

### Slice 4 - Integrated contract and documentation task/release unit

15. Exercise B-010/B-012/B-016/B-017 end to end with corpus+episode sources, full/no-model/dry modes, cap/index pressure, byte snapshots, accepted receipt, finite lock/release outcomes, and fresh stores.
16. Complete B-020 docs/pins; remove only stale configured-knowledge noop claims while preserving defaults, explicit-save, and markdown/architecture noops.
17. Create every planned test file/marker, then run the ordered Quality Contract and all eight assertions. Perform the recorded degraded manual duplication/import/state review.
18. Verify no live `knowledge/` changed, tests left no real manifest/proposal/receipt, and scope did not grow into scheduling, TTL, user mutation, OM, or a new knowledge type.

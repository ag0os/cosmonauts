---
kind: living-memory-l4-prototype
date: 2026-09-01
plan: living-memory
status: evidence-only
---

# Living-Memory L4 Prototype — Would-Retire Evidence

**What this is:** the §6-step-2 prototype ruled in
`missions/architecture/living-memory.md` (LM-D-006): one corpus-scope
Observer+Dropper pass, run read-only against a scratchpad **copy** of the
237-record knowledge corpus, before any retirement authority is exercised.
**Nothing here executes.** Every row is a proposal; retirement machinery
(receipts first — brief §7.2/A-4) does not exist yet, and the live
`knowledge/` tree was not touched.

**Method:** four parallel verification agents checked all 47 `gotcha`
records against the live codebase (does the underlying cause still exist?
is there a checkable retire-when predicate?); a fifth swept all 237 records
for obvious duplication and supersession (title-level scan of all 237,
~170 bodies read). Every verdict carries file:line evidence.

## Headline numbers

| Population | Verdict | Count |
|---|---|---|
| 47 gotchas | KEEP (cause still live) | **26** |
| | RETIRE-CANDIDATE | **16** (34%) |
| | STALE-REFERENCE (edit, not retire) | **5** |
| retire-when expressible as a checkable predicate | | **46 / 47** |
| retire candidates whose predicate is **already true today** | | **14 / 16** |
| corpus sweep findings (duplicate / superseded / mergeable) | | **15** |
| records involved in the largest single finding (rollup↔sub-record duplication) | | **110 / 237** |

Rough shrink potential if all high-confidence proposals were ratified:
the live set drops from 237 to roughly **125–140 records** (16 gotcha
retirements ≈ 7%; resolving the rollup duplication contributes most of the
rest) — with zero information loss claimed only where a superseding record
or code fix is cited.

## Would-retire manifest — 16 gotchas

| Record (`knowledge/…`) | Reason | Conf. | Evidence (abridged) |
|---|---|---|---|
| domain-config/3a5c7e9b… | obsolete | high | one-time 2026-04 migration note; move completed; no root `extensions/` exists; its "not caught until runtime" claim is false |
| domain-config/5e7a9c1b… | superseded | med | self-superseded by its own 2026-08-27 correction; rule lives in main-domain-and-cosmo-rename/convention-qualify-cross-domain-…b3881bcd6a72 |
| domain-config/8f0d2b4e… | obsolete | med | prompt-path duplication eliminated; single-sourced at `lib/prompts/loader.ts:18-20` |
| framework-extraction/…8ffa9ae28867 | obsolete | med | fixed at the single resolution site (`lib/packages/catalog.ts:60-67`, no cwd); suggested guard test still absent |
| local-vs-shared/4c9f1e2d… | obsolete + redundant | high | test-fix anecdote, fix landed; duplicated verbatim in `knowledge/local-vs-shared.md:54` |
| local-vs-shared/9e2b4f7c… | obsolete | high | operationalizes a **reverted** decision — `.gitignore:10-14` tracks `missions/` again; its advice is now actively wrong |
| main-domain-and-cosmo-rename/…d6290944ea4b | obsolete (reversed) | high | prescription deliberately reversed by B-022 (`hasRunnableDefaultDomain` excludes only `shared`); following it would break a pinned behavior |
| observability/…9608b54dbb0d | obsolete | med | **⚠ see "the flagship conflict" below before ruling** |
| orchestration-hardening/…d79330e02510 | superseded | med | same rule now operational in `quality-manager.md:29,36,38,286` + 4 reviewer prompts |
| orchestration-refactor/…806 | redundant | med | verbatim duplicate of `knowledge/orchestration-refactor.md:59`; constraint unenforced, file has since grown 3 unaddressed registrations |
| orchestration-refactor/…807 | obsolete + redundant | high | historical narrative of completed TASK-097; `agent-spawner.ts` now only re-exports |
| orchestration-refactor/…810 | obsolete | high | `task_edit` gained `checkAc`/`uncheckAc` (`tasks/index.ts:335-345`); the workaround it prescribes is now wrong |
| runtime-consolidation/b2c3d4e5… | obsolete | high | `createDefaultRegistry`/`resolveRegistry` have zero live call sites; registry is a required parameter now |
| runtime-consolidation/b8c9d0e1… | obsolete | high | entire subsystem renamed away (workflows → named chains, TASK-379); nothing it names exists |
| spec-plan-quality-gates-a/23b45c67… | obsolete | med-high | prescribed fix in place; the test derives IDs dynamically; the triggering agent left the test's scope |
| spec-plan-quality-gates-a/c7d8e9f0… | obsolete | med-high | the prompt contract it protects (three-way planning router) no longer exists in any live prompt |

Four of the sixteen are not merely stale — they are **actively wrong advice
today** (9e2b4f7c, d6290944, …810, and 5e7a9c1b's pre-correction body):
the cost of a missing forgetter is not just bloat.

## Stale-reference manifest — 5 gotchas (edit proposals, not retires)

artifact-format-redesign/0a6f10ef… and …d5ae6c28… (doubled
`bundled/coding/coding/` segment, since flattened) ·
drive-resilience-state-model/6cb9cb01… and …73686149… (lock/finalization
logic moved to `lib/driver/drive-finalization.ts`) ·
parallel-agent-spawning/f6a7b8c9… (`domains/coding/prompts/coordinator.md`
→ `bundled/coding/prompts/coordinator.md`).

**Pattern:** all five share one mechanical cause — path migrations. A
deterministic Observer check ("every `files:`/path citation resolves")
would have caught all five with no model call.

## Corpus sweep — 15 findings (abridged; full detail in the sweep output)

1. **Rollup↔sub-record duplication (the structural one, high conf.):** all
   10 migrated plan-level distillations (`knowledge/<plan>.md`) restate
   every one of their own sub-records (`knowledge/<plan>/*.md`) — 110
   records involved; 4 pairs verified in full, 6 at 65–76% containment.
   Which direction to fold (typed, individually retrievable sub-records vs
   readable parent narratives) is the first real L4-Reflector decision.
2–5. **Superseded documents (high conf.):** `session-lineage.md` (pins the
   retired `.knowledge.jsonl` format), `forge-lifecycle.md` (pins `memory/`
   as the distilled-knowledge home), the `local-vs-shared` gitignore
   boundary (reversed in the live repo; 3 records + 1 stale line in
   `artifact-format-redesign.md`), `domain-config.md`'s qualified-ID rule
   (its own sub-records carry the correction; the parent does not).
6–8, 10, 12–13. **Near-verbatim duplicate pairs (high→med conf.):**
   saved-name-before-DSL precedence; plan-lock vs commit-lock scopes; the
   Cosmo-only memory-scope claim (superseded by the knowledge surface);
   subagent-allowlist qualification; serializable run specs; stale-reference
   sweep rule.
9, 11, 15. **Mergeable clusters:** "Drive excludes `missions/` from source
   commits — check `git status`" stated in **six** records; domain-ID
   collision/precedence across four records; the QM-stall/codex-review
   lesson across four rollups.
14. **Superseded budget numbers (med conf.):** the 12,000-byte independent
   memory-index budget in two records — arch §6 already declares the
   combined-budget reassessment.

## The flagship conflict — why the human gate earns its place

`observability/gotcha-do-not-assume-automatic-compaction-works-for-ephemeral-sessions-9608b54dbb0d.md`
was verdicted RETIRE (medium) on code evidence: the open question it hedges
was answered, and `session-factory.ts:106-141` now treats in-memory and
file-backed sessions identically. But the OM spike (§3.4, three days old)
cites this exact record as "now load-bearing rather than hypothetical" for
the *across-run persistence* half of its analysis. Cause-fixed evidence and
inbound citations disagree.

**Design lesson for the re-spec:** the Dropper's coverage evidence must
include an **inbound-reference check** (what still cites this record —
docs, specs, other records), not only cause-state. This is the concrete
failure mode Option C's confirm round exists to catch, observed in the
prototype's very first pass. The record most likely wants an *edit* (narrow
it to the surviving across-run claim), not a retire.

## What the prototype validates for the design

- **`retire-when` is real (LM-D-005):** 46/47 gotchas admit a checkable
  predicate, and 14 of the 16 retire candidates would have *self-flagged*
  had the field existed — the corpus has been silently retiring itself with
  no one watching.
- **The evidence chain makes machine claims reviewable:** every verdict
  above carries file:line citations a confirm round can spot-check without
  re-deriving.
- **Deterministic checks first, model judgment second (brief §3.2):** the
  5 stale-reference records and a large share of the "already true"
  predicates are catchable by path/grep checks at near-zero cost.
- **Bounded, lossy output is achievable:** five agents, hard row caps,
  rejected-and-omitted findings listed by the sweep — no proposal flood.
- **The duplication is structural, not incidental:** one migration pattern
  (rollup + sub-records) accounts for nearly half the corpus; L4 should
  target the pattern, not chase pairs.

## Next

This artifact is the evidence input for the `living-memory` re-spec
(knowledge-and-memory §10.2, item ③). Once the receipt machinery (A-4)
lands, the high-confidence subset above is the natural payload for the
first human-ratified retirement round. Until then: proposals only.

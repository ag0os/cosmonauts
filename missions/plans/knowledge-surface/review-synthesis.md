# Review synthesis — knowledge-surface (2026-08-19)

Merged, verified findings from two independent channels: the chain
plan-reviewer (`review.md` … `review-4.md`) and an external adversarial
workflow (4 blind finder lenses → refute-first verification; 16 raised, 13
survived, 3 refuted). Convergence between channels is a strength signal and is
noted per finding. **Every finding below is verified and must be applied or
carry an explicit disposition in the revised plan.** Human rulings D-015 and
D-016 (Decision Log) are already recorded; the spec amendments are in place.

## Blocking / high

- **F-01 (CONVERGED: adversarial CF-1 high CONFIRMED + CF-2 medium CONFIRMED;
  chain review-4 PR-001 high).** The `WeakMap`-keyed-by-`ExtensionAPI`
  session policy cannot work in Pi 0.80.6: each extension factory gets its
  own API object (no shared identity), and the jiti loader
  (`moduleCache:false`) means a module imported by two extensions is not a
  shared instance — a module-local WeakMap is not a cross-extension
  singleton (empirically reproduced). D-008's coordination mechanism and the
  B-007 combined-budget handoff must be redesigned against Pi's *actual*
  shared seams (verify the chosen seam against
  `node_modules/@earendil-works/pi-coding-agent` 0.80.6 — e.g., selection
  and configuration at session-assembly time via factory options / a single
  combined-context adapter, rather than runtime cross-extension state).
  Record the correction as a dated amendment to D-008.
- **F-02 (adversarial SF-1 high CONFIRMED).** Design §3 requires all OKF
  fields plus writer/source/date on EVERY knowledge record; B-001 excludes
  "malformed" records from retrieval. This contradicts the ratified OKF
  profile (`type` required; title/description/resource/tags/timestamp
  *recommended* — `knowledge-and-memory.md` §4) and INV-6's machine-only
  provenance scope, and would silently drop minimal human-authored records —
  the exact curation path the spec centers. Split the contract: human-curated
  records need the ratified minimum (graceful degradation for missing
  recommended fields, e.g. mtime fallback for recency); full provenance is
  required only for machine-written proposals (D-011 unchanged).
- **F-03 (CONVERGED: adversarial SEQ-2 high CONFIRMED + DA-3 low PARTIAL;
  chain review-4 PR-006 medium).** The backfill has no executable owner for
  config restoration or approval evidence, and B-010 places a human approval
  act inside a worker task's GREEN state — the correctness gate would
  hard-fail mid-backlog awaiting a human. Give the batch a callable seam
  whose failure/cancellation restore is test-inducible; define the approval
  artifact path/schema; restructure so the worker's GREEN is
  machine-verifiable (validated proposals + review index) and the human
  no-verbatim approval is a distinct recorded gate step outside
  RED→GREEN→REFACTOR. Name the residual hard-kill window on config restore
  honestly (no portable fix — accepted residual risk).

## Medium

- **F-04 (CONVERGED: adversarial DA-2 medium PARTIAL; chain review-4 PR-005
  medium).** Proposal identity is non-idempotent: the filename key hashes
  {planSlug,type,title,content,source} but the bytes include
  `date = sourceDate ?? now()`, and non-identical occupants are refused — so
  an identical retry without `sourceDate` is *rejected*. Align identity,
  date/timestamp derivation, and occupant semantics so a realistic retry has
  a defined, idempotent result (cf. the episode-write dedup precedent).
- **F-05 (chain review-4 PR-004 medium).** The migration matrix assigns
  reserved keys twice: legacy markdown `source` vs provenance `source`, and
  original JSONL `type` vs the mapped OKF `type`. Name exact non-colliding
  destination keys for the preserved legacy values.
- **F-06 (adversarial DA-5 low CONFIRMED — same matrix).** The 36-file corpus
  carries four incompatible `distilledAt` formats; no normalization rule is
  stated for the destination `timestamp`. Define the accepted format and the
  normalization mapping.
- **F-07 (chain review-4 PR-003 medium).** Gate edits do not take effect on
  resource reload or plain new-session as B-008/D-008 promise:
  `createSession` computes params once; only the `/agent` switch branch
  reruns `buildSessionParams`. Specify the actually-supported transitions
  (process restart / agent switch) or add a real reassembly seam — and test
  both OFF→ON and ON→OFF.
- **F-08 (chain review-4 PR-007 medium).** Post-archive distillation misses
  archived transcripts: `archivePlan` moves sessions to
  `missions/archive/sessions/<slug>/` but the distiller/archive guidance
  names only the active path. Add active-vs-archived discovery to a behavior
  and test (within the D-009 correction allowlist).
- **F-09 (adversarial SEQ-1 medium PARTIAL).** Stage 2 lists B-007 whose
  implementing seams (`lib/memory/injection-budget.ts`, the combined
  allocator) are stage 3–4 deliverables — B-007's test cannot pass at stage
  2. Move B-007 ownership to the stage that can satisfy it (or split the
  behavior's stage mapping explicitly).
- **F-10 (chain review-4 PR-002 — ruled by D-015).** Apply the package-host
  scoping ruling: B-005/B-006/B-012, Design, and Quality Contract wording
  adopt "every agent in a cosmonauts-assembled session"; the out-of-scope
  status of bare Pi package hosts becomes a documentation obligation
  (B-011/docs.memory.md).

## Low

- **F-11 (adversarial SEQ-3 low PARTIAL).** B-002's Expected includes
  registered-tool-schema properties whose seam (the proposal Pi adapter) is
  a stage-5 deliverable while B-002 sits at stage 3. Partition the
  store-level and adapter-level assertions between the owning stages.
- **F-12 (adversarial SEQ-5 low PARTIAL).** Duplication/complexity gate rows
  are owned only by checkpoint stage 9. Place the concrete reviewer-judgment
  obligations (one parser/store/combiner/allocator; focused modules) in the
  implementing stages (3–5) as well.
- **F-13 (adversarial SF-4 low CONFIRMED).** AC-001's and AC-004's
  "documented" clauses have no owner sourced to them: B-011's Source is
  AC-008 only. Add AC-001 and AC-004 to B-011's Source.
- **F-14 (adversarial DA-4 low PARTIAL).** Per-turn injection rebuilds scan
  the full corpus frontmatter (no-cache, disk-authoritative) — O(N) per turn
  while INV-4 bounds only injected bytes. Keep the design, but extend R-007's
  stop-and-amend trigger to measured per-turn scan cost (not only enabled
  starts) and keep `stats` visibility.
- **F-15 (chain review-4 missing-coverage).** Cross-plan collision: the
  active `coding-extraction` plan intends to move `bundled/` out of this
  repo while D-014 keeps the distiller at `bundled/coding/`. Add a
  sequencing note (Risk or Decision Log): this plan assumes `bundled/coding/`
  is present; if `coding-extraction` lands first, the distiller adaptation
  follows the moved location.
- **F-16 (verification retention).** Round-3's two revision defects (B-006
  must exercise the existing dedicated `remember` writer distinctly from
  proposal-only knowledge writes; B-008's identity assertions qualified to
  gated-surface effects) were applied at 2026-08-18T21:22 — the revision must
  not regress them.

## Ruled by the human this round (already recorded)

- **D-015** — "every agent" scopes to cosmonauts-assembled sessions
  (spec INV-2/AC-003 amended in place). → F-10.
- **D-016** — the supervised backfill's temporary gate enablement is
  ratified; D-013's mechanism stands with human authority. → closes
  adversarial SF-2.

## Refuted (do not apply)

- Adversarial SF-3 (user twin never created — recognized-not-created is the
  designed D-007 behavior), DA-1 (recall stranding — rested on a false
  auto-load premise), SEQ-4 (stage 6→5 dependency undeclared — the
  Implementation Order's numbered sequence is the declaration).

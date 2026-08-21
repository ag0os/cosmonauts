---
title: 'Knowledge surface: project knowledge for every agent'
status: active
createdAt: '2026-08-18T20:03:19.945Z'
updatedAt: '2026-08-19T14:29:14.838Z'
---

## Overview

This plan implements the authoritative spec in
`missions/plans/knowledge-surface/spec.md` and the first slice of the ratified
sequence in `missions/architecture/knowledge-and-memory.md` §10. It adds a
human-curated project knowledge store at `knowledge/`, recognizes the
user-scoped twin at `~/.cosmonauts/knowledge/`, adds the knowledge record class
to the shared `MemoryStore` substrate, migrates the existing 36 markdown
distillations plus every record in the 10 legacy bundles, and prepares
attributable proposal output and backfill coverage.

The runtime surface remains gated by `.cosmonauts/config.json` and defaults
OFF. Repo-content migration is ordinary reviewed source content and is not
gated. This plan does not implement consolidation, working state, episode or
explicit-save changes, embeddings, retention, or autonomy-host behavior.

**Findings-application revision complete 2026-08-19.** D-009, D-010, D-015,
and D-016 remain the governing human rulings. D-017 through D-025 amend only
derived implementation ground. Every synthesized finding F-01 through F-16 is
applied and mapped below; none is rejected. This revision creates no tasks and
performs no implementation. `review-5.md` is the independent review record for
this findings-application round and carries the post-revision verification.

## Architecture Context

This plan implements part of
`missions/architecture/knowledge-and-memory.md` and preserves the derived-map
boundary in `missions/architecture/code-structure-map.md`.

Relevant ratified rulings:

- `knowledge-and-memory.md` §11: knowledge is OKF markdown only, with
  `decision | trade-off | gotcha | convention` as its type vocabulary.
- `knowledge-and-memory.md` §11: machine output lands under `memory/` as
  proposals; promotion into `knowledge/` is a human act.
- `knowledge-and-memory.md` §11: agents receive a small knowledge index plus
  explicit `recall`, and memory, architecture, and knowledge injection share
  one reassessed per-turn bound.
- `code-structure-map.md`: architecture-map retrieval already implements
  `MemoryStore`; this plan coordinates its injection but does not merge the
  generated map into curated knowledge.
- The shared-memory invariants remain: sibling stores per scope, disk as the
  only correctness state, no cache, and no speculative registry/backend layer.

Boundary rules:

- `lib/memory/` owns domain-neutral record, path, store, retrieval-composition,
  and UTF-8 budget contracts. It must not import Pi, config, agents, domains,
  sessions, tasks, plans, or architecture-map infrastructure.
- `lib/architecture-map/` remains a separate `MemoryStore` adapter. Generated
  map files stay under `memory/architecture/` and are never treated as curated
  knowledge.
- Pi adapters depend inward on `lib/memory/`; stores never depend on extensions.
- Gate-selected Pi factories live under `lib/extensions/` and are supplied only
  by Cosmonauts session assembly. Thin package wrappers remain under
  `domains/shared/extensions/` solely to preserve the legacy package-host
  surface when the gate is OFF.
- Current disk is authoritative. Missing roots produce empty results and no
  read-time scaffolding; edits, promotions, and deletions are visible on the
  next retrieval.
- Per D-010 option B, INV-1/INV-2 govern dedicated knowledge/memory tools and
  framework knowledge pathways. Generic project tools and external backends
  remain trusted, human-supervised, git-reviewed project-file capabilities
  outside that boundary; documentation, not a sandbox, owns that trust seam.
- Per D-015, the enabled index, `recall`, and injection reach every agent whose
  session is assembled by Cosmonauts. Bare Pi package hosts are outside the
  enabled contract and are documented as such; while OFF they retain their
  frozen package-loaded surface.

## Decision Log

- **D-001 — Derived from the ratified architecture (2026-08-18).**
  This plan exists per `knowledge-and-memory.md` §10 (resequencing) and
  implements its §11 rulings: OKF-markdown-only records, proposals-area write
  authority, injected-index-plus-recall retrieval, and the track's
  infrastructure-first gate posture. Decided by: human (ratified 2026-08-18).
- **D-002 — Working state excluded (adjacent plan).** The ratified order
  allows item ② to ride with this plan or adjacent; it is scoped out to keep
  this plan within task bounds and ships as its own small plan reusing
  profile mechanics. Decided by: planner-proposed, 2026-08-18.
- **D-003 — Intent invariants INV-5 and INV-6 promoted from candidates C-6 and C-4** of `knowledge-and-memory.md` §9 into this spec's `## Intent`.
  Decided by: human (ratified 2026-08-18).
- **D-004 — Use `memory/agent/proposals/` as the plan-stage proposal path.**
  - Decision: machine-produced project proposals live under
    `memory/agent/proposals/`; curated records live only under project/user
    `knowledge/` roots.
  - Alternatives: a directory inside `knowledge/`; a new top-level proposals
    tree.
  - Why: this is the simplest exact path consistent with the human-ratified
    machine-side-under-`memory/` boundary. The architecture explicitly leaves
    the exact path to this plan; this entry corrects the earlier overstatement
    identified by `review.md PR-009`.
  - Decided by: planner-proposed, 2026-08-18.
- **D-005 — Fix one 24,000-byte combined injection ceiling.**
  - Decision: when enabled, memory, architecture-map, and knowledge sections are
    composed by one UTF-8 allocator with a total 24,000-byte cap, including
    headers and truncation notices. Non-empty sections receive a fair initial
    share and unused bytes are redistributed deterministically. Knowledge index
    content is uniform across roles; existing policy determines whether memory
    and architecture sections apply.
  - Alternatives: preserve the independent 12,000 + 24,000 bounds and add a
    third; use per-role knowledge indexes; make the cap configurable in v1.
  - Why: 24,000 bytes does not exceed the largest existing single-surface cap,
    proves INV-4 with one enforceable number, and avoids relevance policy before
    evidence warrants it.
  - Decided by: planner-proposed, 2026-08-18.
- **D-006 — Perform a one-to-one seed conversion, not consolidation.**
  - Decision: each `memory/*.md` distillation moves to one
    `knowledge/<slug>.md` decision record with its markdown body preserved; each
    JSONL record becomes one `knowledge/<plan-slug>/<record-id>.md` record.
    `rationale` maps to `decision`; `pattern` maps to `convention`; the four
    ratified values are unchanged. The complete field matrix is in Design §6.
  - Alternatives: deduplicate/merge the two corpora; leave pointer stubs under
    `memory/`; preserve JSONL as an import format.
  - Why: one-to-one conversion makes AC-002 auditable without implementing the
    excluded consolidation pass. `review.md PR-006` requires the explicit
    field-level preservation contract added below.
  - Decided by: planner-proposed, 2026-08-18.
- **D-007 — Start user knowledge empty.**
  - Decision: no project seed record is copied to
    `~/.cosmonauts/knowledge/`; the path is recognized by the store and tested
    with an injected temporary root, but reads do not create it.
  - Alternatives: copy selected project records to the user twin; scaffold the
    real home directory during project setup.
  - Why: the corpus is project history, while user knowledge must outlive a
    project by explicit human choice. This avoids changing explicit-save
    semantics or writing outside the project as a side effect.
  - Decided by: planner-proposed, 2026-08-18.
- **D-008 — Use explicit framework adapters and a frozen per-session policy.**
  - Decision: `buildSessionParams` resolves the project gate once per session
    assembly and explicitly loads exactly one framework knowledge-context mode.
    A per-`ExtensionAPI` `WeakMap` policy is initialized at extension factory
    load and read by existing agent-memory/architecture-memory handlers before
    their first turn; fresh and resumed processes reconstruct it by assembling
    the session from config. Gate edits take effect only after session
    recreation/reload. New adapters live outside Pi's package auto-load root.
  - Alternatives: edit every agent definition; reload config independently in
    three extensions; rely on context-handler ordering; put new child
    extensions under `domains/shared/extensions/`.
  - Why: one frozen authority prevents double injection and config races, while
    explicit placement prevents OFF package hosts from auto-registering new
    tools. Addresses `review.md PR-003` and `review.md PR-004`.
  - Decided by: planner-proposed, 2026-08-18.

  *(D-008's `ExtensionAPI`-keyed WeakMap and reload-transition mechanism is
  superseded by D-017, 2026-08-19; the original entry is preserved verbatim.)*

- **D-009 — RULED: amend AC-007; OFF-identity governs the gated runtime surface, not prompt-content corrections (option A).**
  - Decision: AC-007's letter is amended in `spec.md`. The OFF guarantee
    covers the gated surface — no knowledge injection, tools, retrieval, or
    gated extension discovery — pinned against frozen baselines. The distiller
    persona, archive guidance, and stale project-context/doc pointers are
    explicitly permitted content corrections even though they alter prompt
    bytes. INV-3 and AC-006 stand whole.
  - Alternatives: (B) preserve OFF prompt bytes — rejected: leaves an active
    distiller instructed to write JSONL, violating INV-3/AC-006 and keeping
    the written-and-never-read defect alive; (C) qualify INV-3/AC-006 to
    enabled mode — rejected: narrows the ratified format ruling.
  - Why: AC-007's intent was "the gate adds nothing when off," not "the
    repo's prompts are frozen"; the spec already treats migration as ungated
    repo content, and prompt corrections are the same class.
  - Supersedes: spec AC-007's original "byte-identical prompts" letter
    (marked in place in `spec.md`).
  - Decided by: human, 2026-08-18.
- **D-010 — RULED: amend INV-1/INV-2 and AC-003/AC-005 to govern the memory system's own surfaces (option B).**
  - Decision: the invariants' letters are amended in `spec.md`. INV-1 binds
    dedicated knowledge/memory tools and framework memory pathways — machine
    knowledge is proposals-only, promotion is human. INV-2 binds the
    knowledge retrieval feature (index, `recall`, injection) to the shared
    memory interface — no second framework retrieval path. Generic project
    tools (read/grep/find/ls/bash/edit/write) and external Codex/Claude Drive
    backends remain trusted, human-supervised, git-reviewed project-file
    capabilities outside the invariants' scope; the trust boundary is
    documented (AC-005), not sandboxed.
  - Alternatives: (A) literal enforcement via a portable filesystem sandbox —
    rejected: path-string guards cannot soundly constrain shell indirection
    or symlinks, a sound portable sandbox is major new architecture, and it
    would make `knowledge/` the only tracked content trusted tools cannot
    touch; (C) disable generic filesystem/shell tools when enabled —
    rejected: materially reduces enabled agent capability.
  - Why: the invariant's origin (C-1, consolidation context) targets
    autonomous memory machinery authoring curated knowledge — noise
    prevention — not general project editing. Git review is the actual
    enforcement for generic edits, exactly as for every other tracked file.
  - Supersedes: spec INV-1/INV-2 original letters and the AC-003/AC-005
    "no (registered) agent tool / no retrieval path" phrasings (marked in
    place in `spec.md`).
  - Decided by: human, 2026-08-18.
- **D-011 — Make proposal identity explicit at the shared draft seam.**
  - Decision: add optional `resource`, `writer`, and `date` to
    `MemoryRecordDraft`; the dedicated proposal tool accepts `planSlug` but no
    path, derives a canonical destination resource, and passes the complete
    draft to `MemoryStore.write`. The knowledge store requires and validates
    all four fields plus `source` for proposal writes.
  - Alternatives: encode plan identity in tags; let the store synthesize an
    unknown destination; bypass `MemoryStore.write` with a proposal-specific IO
    API.
  - Why: this aligns the tool schema, deterministic filename, promotion
    resource, and mutation tests without casts or an implicit second writer.
    Addresses `review.md PR-005`.
  - Decided by: planner-proposed, 2026-08-18.
- **D-012 — Reserve `recall` while the knowledge surface is enabled.**
  - Decision: `recall` is a framework-reserved tool name in enabled sessions.
    Agent-memory is the one recognized existing owner and composes through the
    shared retrieval helper; any other installed extension registering
    `recall` fails session assembly with an actionable collision diagnostic
    rather than being silently replaced or duplicated. Initial CLI, switched,
    and spawned loaders verify the final callable allowlist.
  - Alternatives: overwrite arbitrary installed tools; register
    `knowledge_recall`; infer compatibility from extension names.
  - Why: the ratified surface names `recall`, and loader-time registration is
    the first seam with actual tool maps. Addresses `review.md PR-007`.
  - Decided by: planner-proposed, 2026-08-18.
- **D-013 — Backfill is 3-15 proposals per slug with a human review stop.**
  - Decision: derive the missing-slug set from archived plan directories minus
    the frozen pre-migration distillation inventory; each distiller invocation
    yields 3-15 valid proposals. The batch temporarily enables the gate, restores
    `.cosmonauts/config.json` byte-for-byte in a `finally` path, and halts for
    human diff review before proposal artifacts are accepted. No promotion is
    part of the batch.
  - Alternatives: accept one record per slug; trust a hand-maintained list;
    defer no-verbatim review to final quality gates.
  - Why: this gives INV-5 an owner at the write slice and makes omissions or
    under-distillation fail locally. Addresses `review.md PR-008`.
  - Decided by: planner-proposed, 2026-08-18.
- **D-014 — Keep extraction in the existing coding distiller for this plan.**
  - Decision: `bundled/coding/agents/distiller.ts` remains the extraction agent;
    record/store/proposal contracts are framework-wide. Moving extraction to a
    shared/framework agent is not part of this slice.
  - Alternatives: create a second framework distiller; move the coding agent now.
  - Why: the authoritative spec says adapt the existing mechanism, not rewrite
    extraction; moving it would create a parallel path before a second domain
    proves the need.
  - Decided by: planner-proposed, 2026-08-18.
- **D-015 — RULED: "every agent" scopes to cosmonauts-assembled sessions.**
  - Decision: spec INV-2 and AC-003 are scope-amended in `spec.md` (marked in
    place). The enabled knowledge surface — index, `recall`, injection —
    reaches every agent in a cosmonauts-assembled session. A bare Pi package
    host that loads this npm package without cosmonauts session assembly is
    out of scope for the enabled surface and must remain inert while the gate
    is off (B-012 stands); this out-of-scope status is a documentation
    obligation.
  - Alternatives: design and test an enabled package-host loading path —
    rejected: it requires auto-loaded, config-reading adapters under the
    package root, exactly the uncontrolled-registration shape D-008 exists to
    avoid; supporting external harnesses is not this plan's goal.
  - Why: resolves `review-4.md PR-002` — the ratified "every agent" letter
    could not be satisfied for hosts that never call `buildSessionParams`.
  - Supersedes: the unscoped "every agent" letters of INV-2/AC-003.
  - Decided by: human, 2026-08-19.
- **D-016 — RULED: the supervised backfill's temporary gate enablement is ratified.**
  - Decision: D-013's mechanism — temporarily enabling the gate in this
    repository for the backfill batch, restoring `.cosmonauts/config.json`
    byte-for-byte in a `finally` path, and halting for human diff review —
    is blessed as compatible with the spec's "enabling the surface is a
    separate adoption decision" letter. D-013's authority upgrades from
    planner-proposed to human-ratified for this mechanism.
  - Alternatives: a gateless backfill writing proposals through trusted
    generic tools — rejected: it bypasses the dedicated proposal-tool seam
    the backfill exists to exercise and validate.
  - Why: resolves the adversarial-review finding SF-2 (PARTIAL) — temporary
    supervised enablement was decided on planner authority while touching a
    ratified default-state declaration.
  - Decided by: human, 2026-08-19.

- **D-017 — AMENDMENT to D-008: compose one configured Pi inline extension at session assembly (2026-08-19).**
  - Decision: `buildSessionParams` resolves the gate once, removes only the
    exact shared agent-memory/architecture-memory wrappers from the enabled
    path set, and supplies one named `InlineExtension` through Pi's
    `DefaultResourceLoader.extensionFactories`. Its closure captures immutable
    agent ID, eligible legacy surfaces, recall owner, and proposal authority;
    one handler retrieves and allocates all eligible context sections. OFF
    assembly returns the original extension paths and no knowledge factory.
    Gate edits take effect on process restart or explicit `/agent` switch,
    which rerun `buildSessionParams`; Pi resource reload and plain new-session
    reuse the frozen factory selection and do not change either direction.
  - Alternatives: the D-008 `ExtensionAPI`-keyed WeakMap (impossible because Pi
    creates a fresh API for each factory); a module-local singleton (not shared
    under jiti `moduleCache:false`); EventBus policy/section handoff (a real Pi
    seam, but unnecessary mutable runtime coordination when assembly can create
    one factory); a custom session runtime.
  - Why: this satisfies INV-2 and INV-4 through Pi 0.80.6's real public factory
    seam while preserving AC-007 OFF identity and avoiding hidden state.
  - Decided by: planner, amend-on-record, 2026-08-19.
  - Supersedes: D-008's WeakMap mechanism and its claim that resource reload or
    plain session recreation re-resolves the gate; D-008's frozen authority,
    explicit placement, and package-host intent stand.
- **D-018 — Split human OKF reads from machine proposal provenance (2026-08-19).**
  - Decision: a human-curated knowledge file requires only a valid ratified
    `type`; recommended OKF metadata degrades to deterministic read-time
    fallbacks and writer/source/date may be absent. Machine proposal writes
    remain strict: all normalized metadata plus writer/source/date are
    required, as D-011 intended.
  - Alternatives: require the expanded machine schema for every curated file
    (rejects valid minimal OKF and contradicts INV-6's machine scope); weaken
    machine proposal provenance (violates INV-6).
  - Why: this preserves AC-001's ratified OKF profile and the human curation
    path while keeping machine writes attributable.
  - Decided by: planner, amend-on-record, 2026-08-19.
  - Supersedes: Design §3's former statement that every knowledge record
    requires all recommended OKF and provenance fields.
- **D-019 — Make proposal retries semantic-idempotent (2026-08-19).**
  - Decision: proposal identity hashes every caller-controlled stable field and
    `sourceDate ?? null`. A typed proposal-identity envelope travels with the
    draft so the store recomputes the key. With no source date, the first
    successful write owns date/timestamp; a retry at the same key compares all
    stable fields, ignores only those first-write clocks, and returns the
    existing record. Different stable content or a nonconforming occupant is
    rejected without replacement.
  - Alternatives: include `now()` in identity (retries create duplicates);
    compare rendered bytes (identical retries without source date fail);
    fabricate a fixed date (false provenance).
  - Why: INV-6 provenance remains honest while retry, race, and resumed
    backfill behavior become defined and idempotent.
  - Decided by: planner, amend-on-record, 2026-08-19.
  - Supersedes: Design §4's byte-identical-only occupant rule for proposal
    retries and extends D-011's draft contract with typed proposal identity.
- **D-020 — Separate machine-verifiable backfill GREEN from human approval (2026-08-19).**
  - Decision: `scripts/knowledge-surface-backfill.ts` exposes a callable,
    dependency-injected batch seam whose failure and cancellation paths are
    testable. Machine GREEN means restored config, validated 3-15 proposals per
    derived slug, and a complete `memory/agent/proposals/backfill-review.json`.
    A separate human checkpoint records approve/reject in
    `missions/reviews/knowledge-surface-backfill-approval.md`, bound to the
    review-index and proposal-set digests; it is not a worker RED→GREEN step.
  - Alternatives: keep a human action inside B-010 GREEN; defer approval to the
    final generic gate; rely on an unnamed manual index.
  - Why: this gives D-013/D-016 and INV-5 executable lifecycle owners without
    hard-failing autonomous workers while they wait for a human.
  - Decided by: planner, amend-on-record, 2026-08-19.
  - Supersedes: B-010/Stage 7's combined worker-plus-human completion shape;
    the ratified temporary-enable, restore, halt, and no-promotion rules stand.
- **D-021 — Use non-colliding legacy keys and canonical migration timestamps (2026-08-19).**
  - Decision: preserved legacy values use the exact keys in Design §6
    (`legacySource`, `legacyType`, and companions), never reserved `source` or
    `type`. Destination timestamps are canonical UTC RFC3339 with millisecond
    precision; accepted legacy date-only and UTC second/millisecond forms are
    normalized while their original values remain under legacy keys.
  - Alternatives: duplicate YAML keys; discard original values; preserve
    incomparable timestamp forms as the retrieval timestamp.
  - Why: AC-002 requires lossless field preservation and deterministic recency.
  - Decided by: planner, amend-on-record, 2026-08-19.
  - Supersedes: Design §6's ambiguous custom-key labels and unnormalized
    `distilledAt` mapping.
- **D-022 — Sequence distiller adaptation against `coding-extraction` (2026-08-19).**
  - Decision: this plan assumes `bundled/coding/` is present when its distiller
    slice starts. If active plan `coding-extraction` lands first, stop before
    that slice and amend file/test ownership to the installed coding-domain
    location resolved by `DomainResolver`; do not create a second framework
    distiller. Framework record/store/session contracts remain here.
  - Alternatives: ignore the active collision; duplicate the distiller in the
    framework; block either whole plan today.
  - Why: this preserves D-014's single extraction mechanism without coupling
    framework contracts to a path another active plan removes.
  - Decided by: planner-proposed, 2026-08-19.
- **D-023 — Preserve legacy extension registration and authorization separately (2026-08-19).**
  - Decision: wrapper substitution carries separate booleans for registering
    agent-memory tools, authorizing authored-memory access/context, registering
    the architecture tool, and authorizing architecture access/context.
    Identity guards remain `main/cosmo` for authored memory and the existing
    five-agent set for architecture. An ineligible agent that requests an exact
    shared wrapper keeps the legacy registered-but-unauthorized tool surface;
    its framework `recall` can search knowledge but never authored memory.
  - Alternatives: equate wrapper presence with authority (privilege expansion);
    omit legacy tools for ineligible identities (OFF/ON surface regression);
    reject installed definitions that request a shared wrapper.
  - Why: this preserves read-wide knowledge under INV-2 without broadening the
    narrow existing authored-memory or architecture authority. Addresses
    `review-5.md PR-001`.
  - Decided by: planner, amend-on-record, 2026-08-19.
  - Supersedes: D-017/Design §2 wherever wrapper presence alone was described as
    sufficient to authorize a legacy store or context section.
- **D-024 — Include writer in canonical proposal identity (2026-08-19).**
  - Decision: normalized qualified `writer` is included in the stable proposal
    object and hash. Same-writer retries without source date remain idempotent;
    a writer-only change selects a different canonical key/path rather than
    colliding at the first writer's path.
  - Alternatives: narrow D-019's “every caller-controlled stable field” claim;
    keep writer outside identity and reject at occupant comparison.
  - Why: writer is required caller-controlled provenance under INV-6, so its
    identity effect must be explicit. Addresses `review-5.md PR-003` and closes
    the remaining F-04 deficiency.
  - Decided by: planner, amend-on-record, 2026-08-19.
  - Supersedes: Design §4's stable-object list that omitted writer.
- **D-025 — Measure recurring scan cost in the first post-migration slice (2026-08-19).**
  - Decision: Stage 6 cannot reach GREEN until 20 enabled turns run against the
    migrated corpus and write `missions/reviews/knowledge-surface-scan-cost.md`
    with corpus inputs, aggregate stats, p95 duration, threshold verdict, and
    amend/continue disposition. Breach stops before backfill; Stage 9 only
    rechecks the evidence instead of discovering the cost for the first time.
  - Alternatives: leave measurement to final integration; measure before the
    real corpus exists; add a cache speculatively.
  - Why: this gives F-14's accepted O(N) design and stop condition a task-local
    owner at the earliest stage with representative data. Addresses
    `review-5.md PR-002`.
  - Decided by: planner, amend-on-record, 2026-08-19.
  - Supersedes: Design §5/Stage 9's final-checkpoint-only measurement ownership.
- **D-026 — RULED: conditional config restore; a concurrent edit is never overwritten (2026-08-19).**
  - Decision: at restore time the batch compares `.cosmonauts/config.json` to
    the exact temporary-enabled bytes it wrote. Unchanged → restore the
    pre-run snapshot byte-for-byte as before. Changed → the batch never
    overwrites: it preserves the edited file, saves the pre-run snapshot to
    `.cosmonauts/config.json.backfill-prerun`, and fails with a conflict
    report naming both paths. B-010 gains this outcome as a tested case.
  - Alternatives: an advisory lock for the window — no sound portable
    primitive exists; unconditional restore with documented risk — silently
    destroys a concurrent edit, the exact data-loss class the protocol
    exists to prevent.
  - Why: strengthens D-016's intent — config ends correct and nothing is
    lost — while amending its unconditional-restoration letter. Resolves
    `review-6.md PR-003`.
  - Supersedes: the unconditional `finally` restoration letter in D-013/D-016
    and Design §7.
  - Decided by: human, 2026-08-19.
- **D-027 — Production spawner cancellation must actually abort (2026-08-19).**
  - Decision: `createPiSpawner` honors `SpawnConfig.signal` during a run, not
    only before session preparation — abort interrupts the running Pi
    session, awaits its termination, and makes `dispose()` effective.
    `lib/orchestration/agent-spawner.ts` joins Files to Change, and B-010's
    cancellation coverage includes a real-spawner case proving the session
    terminates before config restoration and batch return; an injected fake
    alone cannot satisfy it.
  - Alternatives: keep pre-session-only signal checks (a fake passes while
    the real distiller keeps running with the gate frozen ON); a batch-local
    kill contract outside the spawner (a second cancellation path).
  - Why: resolves `review-6.md PR-001` — the cancellation guarantee B-010
    states must hold on the production composition.
  - Decided by: coordinator, amend-on-record, 2026-08-19.
- **D-028 — The profile stays pinned outside the combined recall limit (2026-08-19).**
  - Decision: the combined retrieval combiner preserves the shipped profile
    rule — matching profiles are excluded from the visible limit and
    prepended; knowledge and other records compete under the limit. B-006's
    test set gains a negative with more matching newer knowledge records than
    the limit plus a matching profile, proving the profile is still returned.
  - Alternatives: let profiles compete under the limit — regresses the
    shipped full-profile recovery path exactly when the surface is enabled.
  - Why: resolves `review-6.md PR-002`; `docs/memory.md` documents the pin as
    required so recovery cannot be shadowed by newer records.
  - Decided by: coordinator, amend-on-record, 2026-08-19.
- **D-029 — Failed or cancelled batches leave no unindexed proposals (2026-08-19).**
  - Decision: proposals belong to a slug's set only when that slug completes
    validation and the review index binds them. On failure or cancellation,
    before exit — and again before any rerun distills a slug — the batch
    deletes proposals of slugs that never completed validation: same-batch
    machine-written files never bound by any review index; the deletion
    authority is exactly that narrow. A rerun starts unindexed slugs clean,
    so model-nondeterministic retries (new canonical keys under D-019/D-024)
    cannot accumulate orphans beside deduplicated identical ones.
  - Alternatives: a quarantine directory — a second unreviewed store to
    govern; resume-from-partial — binds approval to proposals no index
    describes.
  - Why: resolves `review-6.md PR-004`; the review index remains the single
    binding between proposals and human approval.
  - Decided by: coordinator, amend-on-record, 2026-08-19.

### Findings Application Ledger

All findings are applied; none is rejected.

- **F-01:** D-017/D-023, B-005/B-007, Design §2/§8, R-005.
- **F-02:** D-018, B-001/B-004, Design §3.
- **F-03:** D-020, B-010, Design §7, Stage 7A/7B, R-009.
- **F-04:** D-019/D-024, B-002/B-013, Design §4, mutation gate.
- **F-05/F-06:** D-021, B-003, Design §6.
- **F-07:** D-017, B-008, Design §2, Stage 2 transition tests.
- **F-08:** B-009 and Design §7 active/archive discovery.
- **F-09:** B-007 belongs to Stage 4, not Stage 2.
- **F-10:** D-015/D-023 are applied in B-005/B-006/B-011/B-012, Design
  §1/§2, and Quality Contract assertions 3/5.
- **F-11:** store assertions remain B-002/Stage 3; adapter assertions are new
  B-013/Stage 5.
- **F-12:** Stages 3-5 carry the concrete parser/store/combiner/allocator/session
  composer and focused-module review obligations.
- **F-13:** B-011 sources AC-001, AC-004, and AC-008.
- **F-14:** D-025, Design §5, Stage 6, and R-007 own the named per-turn scan
  evidence and threshold.
- **F-15:** D-022 and R-010 own cross-plan sequencing.
- **F-16:** B-006 still exercises `remember` distinctly; B-008 and assertion 3
  still qualify identity to gated-surface-attributable effects.

Review-6 findings (applied 2026-08-19):

- **review-6 PR-001:** D-027, B-010, Design §7, Files to Change spawner entry.
- **review-6 PR-002:** D-028, Design §5, B-006 profile-pin negative.
- **review-6 PR-003:** D-026 (human-ruled), B-010, Design §7.
- **review-6 PR-004:** D-029, B-010, Design §7.

## Behaviors

### B-001 - Project and user roots expose the ratified human OKF contract

- Source: AC-001
- Context: project or injected user roots contain a valid type-only human
  record, fully annotated records, reserved indexes, missing directories,
  malformed explicit fields, symlinks, or physically mis-scoped occupants
- Action: the knowledge `MemoryStore` retrieves requested durable scopes
- Expected: it returns direct/recursive regular markdown records with one of
  the four ratified types, including the minimal record via deterministic
  metadata fallbacks; excludes `index.md` and symlink traversal; warns and
  skips invalid explicit metadata or wrong-scope files; and treats missing
  roots as empty without creating files
- Seam: `lib/memory/knowledge-records.ts` and
  `lib/memory/knowledge-store.ts`
- Test: `tests/memory/markdown-store.test.ts` > `reads minimal and annotated project and user OKF knowledge without scaffolding scope leakage or symlink traversal`
- Marker: `@cosmo-behavior plan:knowledge-surface#B-001`

### B-002 - Store-level machine proposal writes are contained and retry-safe

- Source: AC-005
- Context: direct store callers submit a complete machine proposal draft and
  exercise missing provenance/identity, unknown type, user scope, traversal,
  absolute resource, symlinked proposal root, a same-writer semantic retry
  after time advances, a writer-only change, and a nonconforming occupant
- Action: the knowledge store validates the typed proposal identity and executes
  its shared `write` contract
- Expected: a valid first write exists only under the real, non-symlinked
  `memory/agent/proposals/<planSlug>/` root with full provenance; the realistic
  same-writer retry returns that first record without changing its clocks; the
  writer-only change selects a different canonical path; and every invalid or
  collision case creates neither a curated file nor a partial replacement
- Seam: `lib/memory/knowledge-store.ts`
- Test: `tests/memory/interface.test.ts` > `contains attributable proposal writes and keys writer while deduplicating same-writer retries without path escape`
- Marker: `@cosmo-behavior plan:knowledge-surface#B-002`

### B-003 - Frozen seed inventory is fully represented and JSONL is retired

- Source: AC-002
- Context: a pre-migration inventory freezes all 36 markdown paths/digests, all
  10 bundle headers, every JSONL record ID/field, and original timestamp values
- Action: the migrated corpus and the unconditionally corrected active
  source/prompt tree are audited
- Expected: each source maps one-to-one through Design §6, including
  byte-preserved body/content, `planTitle`, exact non-colliding legacy keys,
  preserved `createdAt`, and canonical timestamps; no root distillation or
  `.knowledge.jsonl` remains under `memory/`, and no active read/write API or
  instruction names the legacy path
- Seam: `knowledge/`, `memory/`, `lib/sessions/`, active distiller/archive text,
  and the frozen migration inventory
- Test: `tests/memory/interface.test.ts` > `maps every frozen seed field and body to canonical OKF and leaves no active knowledge JSONL path`
- Marker: `@cosmo-behavior plan:knowledge-surface#B-003`

### B-004 - Store retrieval applies scope, current disk, fallback recency, and query

- Source: AC-003
- Context: project and user roots contain matching/non-matching records with
  explicit timestamps or only file mtimes, plus a human edit, retime, or
  deletion after store construction
- Action: a caller retrieves through `MemoryStore` with scopes, query text,
  record types, and limit
- Expected: physical scope is filtered first, results reflect current disk,
  text matches normalized title/description/tags/resource/body, explicit
  timestamps or canonical mtime fallbacks order newest-first with path tie-break,
  and limit applies after filtering
- Seam: `lib/memory/knowledge-store.ts`
- Test: `tests/memory/markdown-store.test.ts` > `filters current knowledge by physical scope and query then applies explicit or mtime recency and limit`
- Marker: `@cosmo-behavior plan:knowledge-surface#B-004`

### B-005 - Every Cosmonauts-assembled enabled session receives one recall surface

- Source: AC-003
- Context: initial CLI, interactive switch, and spawned sessions assemble the
  complete built-in/installed `AgentDefinition` matrix, including extension-free
  agents, authorized and synthetic ineligible users of the exact shared
  agent-memory/architecture wrappers, and an arbitrary conflicting `recall`
- Action: session assembly supplies the configured inline factory, resource
  loaders register extensions, guarded tools run, and final callable allowlists
  are validated
- Expected: every Cosmonauts-assembled agent exposes exactly one functional
  framework `recall`; exact shared-wrapper tools remain registered, but authored
  memory/context is authorized only for `main/cosmo` and architecture access/
  context only for the existing five-agent set; synthetic ineligible agents get
  the existing unauthorized results and no legacy context while recall still
  reaches knowledge; unrelated tools remain callable; arbitrary recall owners
  fail with source paths at initial, switch, and spawn seams
- Seam: `lib/agents/session-assembly.ts`, `cli/session.ts`, and
  `lib/orchestration/session-factory.ts`
- Test: `tests/cli/session.test.ts` > `preserves legacy registration and authorization while enforcing one enabled recall across every session path`
- Marker: `@cosmo-behavior plan:knowledge-surface#B-005`

### B-006 - Dedicated knowledge and memory pathways use the shared boundary

- Source: AC-003, AC-005
- Context: enabled authorized and synthetic ineligible legacy-wrapper roles,
  extension-free agents, Cosmo, and the distiller run with injected
  `MemoryStore` spies while shipped documentation describes generic Pi tools
  and Codex/Claude Drive backends
- Action: framework index/recall paths and guarded legacy tools run; the existing
  authorized `remember` operation runs separately; the proposal operation runs;
  then the trust boundary is audited
- Expected: every knowledge read calls `MemoryStore.retrieve`; agent-memory
  recall uses the shared combiner and reads authored memory only for
  `main/cosmo`; ineligible wrapper users never call guarded legacy stores;
  authorized `remember` writes notes/profiles/playbooks through
  `MemoryStore.write` to ordinary memory, while the distinct machine knowledge
  operation creates only a proposal. Adapters perform no direct knowledge IO.
  Documentation states generic project tools/backends are human-supervised,
  git-reviewed, and unsandboxed
- Seam: `lib/extensions/knowledge-surface/`,
  `lib/extensions/agent-memory/`,
  `lib/extensions/architecture-memory/`, thin shared wrappers, and
  `docs/memory.md`
- Test: `tests/extensions/agent-memory.test.ts` > `routes authorized remember and all knowledge paths through MemoryStore without widening legacy authority`
- Marker: `@cosmo-behavior plan:knowledge-surface#B-006`

### B-007 - One provider-visible budget bounds populated and empty contexts

- Source: AC-004
- Context: the single enabled inline session extension has oversized authored
  memory, architecture, and knowledge sections in one case and all eligible
  stores empty in another
- Action: its one `before_agent_start` handler retrieves authorized sections,
  the allocator completes, and context transforms produce provider messages
- Expected: the final populated combined message is at most 24,000 UTF-8 bytes
  including framing/notices, keeps each non-empty surface discoverable, omits
  body-only sentinels, directs detail reads to the proper tool, and exposes
  per-section/aggregate scan stats in message details; the empty case adds no
  message, heading, or warning
- Seam: `lib/memory/injection-budget.ts` and
  `lib/extensions/knowledge-surface/combined-context.ts`
- Test: `tests/extensions/architecture-memory.test.ts` > `bounds the authorized single-factory three-surface context exposes scan stats and emits nothing when empty`
- Marker: `@cosmo-behavior plan:knowledge-surface#B-007`

### B-008 - The default OFF gated surface matches frozen baselines

- Source: AC-007
- Context: config is absent, false, malformed, or edited OFF→ON/ON→OFF during a
  live session for Cosmo, a map consumer, an extension-free agent, the
  distiller, and a bare Pi package host
- Action: initial/switch/spawn/package sessions assemble; Pi resource reload,
  plain new-session, process restart, and `/agent` switch transitions run
  against frozen baselines plus the D-009 correction allowlist
- Expected: while OFF, gated discovery, knowledge schemas, hidden/provider
  messages, visible results, and filesystem effects attributable to gated
  adapters equal baseline; prompt bytes outside the exact distiller/archive/
  project-context correction allowlist equal baseline; and no knowledge adapter
  or store is constructed. Reload/plain-new preserve the frozen prior gate in
  both directions; process restart and `/agent` switch reassemble and adopt the
  edited value in both directions
- Seam: config/session assembly, Pi inline factories and package discovery,
  existing memory wrappers, distiller prompt, archive guidance, and project
  context including `AGENTS.md`
- Test: `tests/episodic/pre-w3-disabled-baselines.test.ts` > `keeps gated effects inert off and freezes reload while restart and agent switch adopt both gate transitions`
- Marker: `@cosmo-behavior plan:knowledge-surface#B-008`

### B-009 - Distiller guidance discovers transcripts and requires distilled OKF proposals

- Source: AC-006
- Context: active and/or archived plan artifacts contain filtered Tier-2
  manifests/transcripts, or neither transcript root exists
- Action: the existing distiller follows its active persona and archive-skill
  contract, probing active and archived session roots
- Expected: the persona/skill text requires the union of existing active/archive
  manifest-referenced `.transcript.md` paths with path deduplication, fallback to
  plan/tasks only when neither root supplies transcripts, 3-15 one-concept
  proposals with four knowledge types/full provenance, no JSONL/embeddings/
  verbatim transcript-file-command excerpts, the sole output root
  `memory/agent/proposals/`, and the existing coding distiller
- Seam: `bundled/coding/prompts/distiller.md`,
  `bundled/coding/agents/distiller.ts`, and
  `domains/shared/skills/archive/SKILL.md`
- Test: `tests/prompts/archive-skill.test.ts` > `requires active and archived Tier-2 discovery and attributable distilled OKF proposals`
- Marker: `@cosmo-behavior plan:knowledge-surface#B-009`

### B-010 - Backfill machine batch is repository-derived, complete, and recoverable

- Source: AC-006
- Context: archived plan directories and the frozen pre-migration distillation
  inventory determine the missing set while injected batch dependencies can
  succeed, fail, or observe cancellation
- Action: the callable temporary-enabled batch invokes the adapted distiller
  once per missing slug, restores config, validates outputs, and writes its
  review index
- Expected: the derived set is exactly the current 19 slugs, each slug has 3-15
  valid attributable proposals, config bytes equal pre-run bytes on success,
  induced failure, and cancellation when no concurrent edit occurred, a
  concurrently edited config is never overwritten — the batch preserves it,
  saves the pre-run snapshot beside it, and fails with a conflict report
  (D-026) — cancellation through the production spawner terminates the Pi
  session before restoration and return (D-027), no unindexed proposal
  survives a failed or cancelled exit (D-029), the review index binds every
  proposal path and digest with `noPromotion: true`, and no proposal is
  promoted
- Seam: `scripts/knowledge-surface-backfill.ts`, archive inventory,
  `.cosmonauts/config.json`, `memory/agent/proposals/`, and
  `memory/agent/proposals/backfill-review.json`
- Test: `tests/scripts/knowledge-surface-backfill.test.ts` > `runs all repository-derived backfill slugs and restores config on success failure and cancellation before review`
- Marker: `@cosmo-behavior plan:knowledge-surface#B-010`

### B-011 - Shipped documentation states the bounded live contract

- Source: AC-001, AC-004, AC-008
- Context: a user reads memory documentation, archive guidance, config examples,
  and live non-prompt pointers after migration
- Action: documentation obligations are audited
- Expected: text names both roots, four types, minimal human OKF versus strict
  machine provenance, proposal/promotion flow, shared recall, 24,000-byte bound,
  scan stats, OFF default and supported gate transitions, migration,
  no-verbatim rules, all excluded features, and bare Pi package hosts as outside
  the enabled contract; examples remain stack-agnostic and no ratified prompt
  file is silently changed around D-009
- Seam: `docs/memory.md`, `README.md`, `ROADMAP.md`, archive guidance, and live
  architecture cross-links
- Test: `tests/prompts/archive-skill.test.ts` > `documents the stack-agnostic knowledge surface budget gate authority host scope and exclusions`
- Marker: `@cosmo-behavior plan:knowledge-surface#B-011`

### B-012 - Package auto-loading cannot expose gated adapters

- Source: AC-007
- Context: Pi loads this package's declared
  `./domains/shared/extensions` root without Cosmonauts session assembly while
  the gate is OFF
- Action: extension discovery and factory registration complete
- Expected: no knowledge-surface inline factory or proposal adapter is
  discovered, no new knowledge tool is registered, and the existing thin-wrapper
  shared extension/tool/context surface remains the frozen baseline
- Seam: `package.json`, thin shared-domain wrappers, and Pi package resource
  loading
- Test: `tests/domains/main-domain.test.ts` > `keeps gate-selected inline knowledge adapters outside package auto-discovery`
- Marker: `@cosmo-behavior plan:knowledge-surface#B-012`

### B-013 - Dedicated proposal adapter exposes only the safe machine contract

- Source: AC-005
- Context: an enabled distiller session and an ordinary enabled session load the
  configured inline factory, and the distiller submits a proposal without an
  explicit source date
- Action: registered tool schemas are inspected and the same qualified writer
  invokes the dedicated proposal tool twice after time advances
- Expected: only the distiller has the proposal tool; its schema accepts
  `planSlug`, type, title, description, content, tags, source, and optional
  `sourceDate` but no output path/resource; it supplies qualified writer and the
  complete typed draft through `MemoryStore.write`; and both calls resolve to
  the same first-written proposal
- Seam: `lib/extensions/knowledge-surface/knowledge-tools.ts` and the configured
  session extension
- Test: `tests/extensions/agent-memory.test.ts` > `registers proposal authority only for the distiller with no path input and same-writer idempotent writes`
- Marker: `@cosmo-behavior plan:knowledge-surface#B-013`

## Design

### 1. Ruled runtime, host, and trust boundaries

D-009 option A partitions OFF verification into two explicit sets. The gated
runtime surface—knowledge factory discovery, tool registration, retrieval,
index/context injection, store construction, and resulting runtime or
filesystem effects attributable to those adapters—must match frozen OFF
baselines. The only excluded content deltas are the ruled corrections to the
distiller persona, archive guidance, and stale project-context/doc pointers,
including `AGENTS.md`; tests pin those exact correction regions and fail any
additional prompt delta. B-008 intentionally retains the F-16 qualification:
generic-tool results or files caused by corrected distiller guidance are not
misclassified as gated-surface effects.

D-010 option B governs dedicated knowledge/memory tools and framework memory
pathways. Knowledge injection, `recall`, agent-memory composition, existing
`remember`, and the proposal operation depend inward on `MemoryStore`.
`remember` continues to write authored notes/profiles/playbooks under ordinary
memory; only machine knowledge output uses the proposal path. Generic Pi tools
and external Codex/Claude backends remain unchanged trusted project-file
capabilities. No path guard, sandbox, tool disablement, backend restriction, or
prompt-only enforcement claim is added.

D-015 fixes host scope. Every `AgentDefinition` routed through
`buildSessionParams` receives the enabled knowledge surface, regardless of
role, domain, existing extensions, tool preset, or project-context setting.
Bare Pi hosts loading this package do not call that seam and are explicitly out
of scope when enabled; B-012 proves their OFF package-loaded surface remains
unchanged and B-011 documents the boundary.

### 2. Gate, Pi factory composition, authorization, packaging, and transitions

Add a project-only config shape:

```ts
interface ProjectKnowledgeSurfaceConfig {
  readonly enabled?: boolean;
}
interface ResolvedKnowledgeSurfaceConfig {
  readonly enabled: boolean;
}
```

Only literal `true` enables it; absent/false/malformed resolve false. Storage is
config-free. `buildSessionParams` is the one config authority and receives an
injectable loader in tests.

Refactor extension resolution to retain provenance and model registration apart
from authorization:

```ts
interface ResolvedExtensionBinding {
  readonly name: string;
  readonly path: string;
  readonly providerDomain: string;
}

interface KnowledgeSurfaceSessionOptions {
  readonly agentId: string;
  readonly registerAgentMemoryTools: boolean;
  readonly authorizeAuthoredMemory: boolean;
  readonly registerArchitectureTool: boolean;
  readonly authorizeArchitecture: boolean;
  readonly recallOwner: "knowledge" | "agent-memory";
  readonly canPropose: boolean;
}

interface SessionParams {
  // existing fields unchanged
  readonly extensionPaths: string[];
  readonly extensionFactories: InlineExtension[];
  readonly knowledgeSurfaceEnabled: boolean;
}
```

When OFF, `extensionPaths` remain exactly the pre-feature resolved paths,
`extensionFactories` adds nothing, and no knowledge store/factory is
constructed. When ON, assembly removes only bindings proven to be the exact
shared `agent-memory` and `architecture-memory` providers, then supplies one
named `InlineExtension`. Unknown/overridden extensions remain path-loaded and
cannot be mistaken for the recognized recall owner.

The enabled registration/authorization matrix is complete:

| Exact shared wrapper requested | Effective identity | Registered surface | Authorized store/context outcome |
|---|---|---|---|
| neither | any | knowledge `recall` | knowledge read/index |
| agent-memory | `main/cosmo` | `remember`, agent-memory-owned `recall` | authored memory + knowledge; authored context |
| agent-memory | any other ID | `remember`, agent-memory-owned `recall` | `remember` returns legacy unauthorized result; `recall` searches knowledge only; no authored-store call/context |
| architecture-memory | one of the existing five consuming IDs | `architecture_map_read` | legacy architecture store/tool/context |
| architecture-memory | any other ID | `architecture_map_read` | legacy unauthorized result; no architecture-store call/context |
| arbitrary extension registering `recall` | any | collision | assembly fails with both owner paths |
| distiller identity | qualified coding distiller | knowledge `recall` + proposal tool | knowledge read; proposal write only |

Agent-memory and architecture authorization reset behavior remains inside their
configured installers just as in the legacy factories. Synthetic installed
fixtures cover both ineligible-wrapper rows. Knowledge recall is read-wide;
legacy authored-memory, `remember`, and architecture authority do not widen.

Move reusable Pi factory implementations to `lib/extensions/agent-memory/` and
`lib/extensions/architecture-memory/`; existing shared-domain `index.ts` files
become thin wrappers invoking default legacy modes. The enabled inline extension
configures these installers per the matrix and owns one combined
`before_agent_start` handler. There is no cross-factory mutable policy or
section handoff.

Both `cli/session.ts` and `lib/orchestration/session-factory.ts` pass
`params.extensionFactories` into `DefaultResourceLoader`. After reload, a
shared helper inspects Pi's registry and fails an enabled `recall` collision
before the final allowlist.

Pi `/reload`, resume/fork/plain new-session, and other same-runtime replacements
reuse the frozen factory selection. Process restart or explicit `/agent` switch
reruns `buildSessionParams` and adopts config. Tests cover OFF→ON and ON→OFF in
both frozen and reassembled cells; docs state this UX.

### 3. Human-read and machine-write record contracts

Add in `lib/memory/knowledge-records.ts`:

```ts
const KNOWLEDGE_RECORD_TYPES = [
  "decision", "trade-off", "gotcha", "convention",
] as const;
type KnowledgeRecordType = (typeof KNOWLEDGE_RECORD_TYPES)[number];

interface KnowledgeProvenance {
  readonly writer: string;
  readonly source: string;
  readonly date: string;
}
```

Human-curated files follow the ratified OKF minimum. `type` is the only required
frontmatter field. Missing recommended fields normalize as follows:

- `title`: explicit non-empty title, else first H1, else filename stem;
- `description`: explicit non-empty value, else first non-heading body paragraph,
  else normalized title;
- `resource`: explicit safe POSIX path, else physical path relative to the
  selected knowledge root;
- `tags`: explicit string array, else `[]`;
- `timestamp`: explicit valid value, else current file mtime in canonical UTC
  millisecond form;
- `scope`: physical root; explicit scope must agree;
- `kind`: `semantic`; explicit kind must agree;
- `writer`/`source`/`date`: optional and preserved when valid.

Explicit malformed fields are warned/skipped, not silently defaulted. Parsers
reject unsafe/mismatched resources, invalid dates/types/scopes/kinds, and
symlink traversal. `knowledge/index.md` is reserved human browse/migration
content and never runtime truth.

Extend shared types without invalidating existing stores:

```ts
interface KnowledgeProposalIdentity {
  readonly planSlug: string;
  readonly key: string;
  readonly sourceDate?: string;
}

interface MemoryRecordDraft {
  // existing fields unchanged
  readonly resource?: string;
  readonly writer?: string;
  readonly date?: string;
  readonly proposalIdentity?: KnowledgeProposalIdentity;
}
```

Retrieved records expose optional writer/date. Machine proposal writes require
all normalized fields, writer/source/date, safe resource, and typed identity.
Existing memory/map and minimal human knowledge remain valid without machine
provenance.

### 4. Read-wide/write-narrow store and proposal identity

`createKnowledgeMemoryStore({ projectRoot, userCosmonautsRoot?, now? })`
implements `MemoryStore`: retrieve scans current regular markdown without
following symlinks and returns stats; write accepts only complete project-scoped
semantic proposal drafts and writes under proposals, never `record.resource`;
consolidate remains an explicit no-op.

The proposal tool accepts `planSlug`, type, title, description, content, tags,
source, and optional `sourceDate`—never path/resource. Canonical identity is:

```text
stable = canonical JSON of {
  planSlug, type, title, description, content,
  sorted-deduplicated tags, source,
  writer: normalized qualified writer,
  sourceDate: normalizedSourceDate ?? null
}
key = sha256(stable)[0..11]
resource = knowledge/<planSlug>/<type>-<slug(title)>-<key>.md
proposal = memory/agent/proposals/<planSlug>/<basename(resource)>
date = timestamp = normalizedSourceDate ?? now().toISOString()
```

The store recomputes `key`, validates resource/path agreement, rejects
symlinked ancestors, proves realpath containment, and uses atomic exclusive
creation. At an occupied path, all stable identity/provenance fields must match;
only first-write date/timestamp are ignored when source date is absent, so a
same-writer retry/race/resume returns the existing record unchanged. A different
writer hashes to a different path. Any nonconforming occupant is refused. A
proposal exits only by human promotion or rejection/deletion; no pending status
is written.

### 5. Recall, one combined context, and scan-cost evidence

A domain-neutral retrieval combiner accepts explicit store/query pairs, merges
records/warnings/skipped scopes/stats, sorts once, and applies the visible
limit. Matching profiles keep the shipped pin: they are excluded from the
visible limit and prepended, so newer knowledge matches can never shadow
full-profile recovery (D-028). Normal recall queries knowledge; recognized
agent-memory recall always queries knowledge and adds authored memory only
when `authorizeAuthoredMemory` is true. Ineligible legacy tools do not
construct or call guarded stores.

A pure allocator uses one 24,000-byte ceiling for `memory | architecture |
knowledge` sections. The single inline extension builds only authorized legacy
sections plus knowledge, invokes the allocator once, counts all framing/notices,
redistributes unused shares, truncates at UTF-8 boundaries, and final-clamps.
Knowledge includes at most 50 metadata rows and no bodies. Empty sections emit
nothing. Message details carry per-section stats and aggregate stats where
files/bytes are sums and duration is measured wall time for the complete
handler; recall details preserve stats without provider text.

Disk-authoritative O(N) scans remain deliberate. Stage 6, immediately after the
real migrated corpus exists, runs 20 representative local enabled turns and
writes `missions/reviews/knowledge-surface-scan-cost.md`:

```yaml
kind: knowledge-surface-scan-cost
plan: knowledge-surface
capturedAt: <ISO>
turns: 20
corpusFiles: <count>
corpusBytes: <bytes>
p95DurationMs: <number>
maxBytesRead: <number>
maxFilesScanned: <number>
verdict: pass | amend
```

The body names the fixture/session policy and raw per-turn stats. `pass`
requires p95 ≤250ms, max bytes ≤10 MiB, and files/bytes not exceeding eligible
corpus counts. `amend` stops before Stage 7 and reopens the design; it is never a
degraded pass. Stage 9 verifies the artifact/digest but does not own first
measurement. Cache/embeddings remain excluded until measured evidence triggers
another design.

### 6. Complete seed field and timestamp matrix

Freeze each legacy path/SHA-256, bundle header, complete record/ordinal, and raw
timestamp. Canonical destination format is UTC RFC3339 milliseconds. Accept
`YYYY-MM-DD` (quoted or YAML date), UTC seconds, UTC milliseconds, and equivalent
parsed `Date`; normalize date-only to midnight UTC, seconds with `.000`, and
millisecond/Date values via `toISOString()`. Invalid or uninventoried offset
forms stop migration; raw values remain in legacy keys.

For every `memory/<slug>.md`:

| Destination field | Source/derivation |
|---|---|
| path/resource | `knowledge/<slug>.md` |
| type | `decision` |
| title | first H1 exactly |
| description | `Archived plan distillation for <slug>.` |
| tags | `plan:<slug>`, `source:legacy-distillation` |
| timestamp | canonicalized original `distilledAt` |
| scope/kind | `project` / `semantic` |
| writer/source/date | `knowledge-surface-migration` / original `memory/<slug>.md` / migration ISO time |
| custom keys | `legacySource`, `legacyPlan`, `legacyDistilledAt`, `legacySourceSha256` |
| body | original post-frontmatter markdown body byte-for-byte |

For every JSONL record:

| Destination field | Source/derivation |
|---|---|
| path/resource | `knowledge/<planSlug>/<id>.md` |
| type | identity for four ratified values; `rationale → decision`; `pattern → convention` |
| title | `<planTitle> — <mapped-type> <1-based bundle ordinal>` |
| description | `Migrated <legacy-type> record <id> from <planSlug>.` |
| tags | legacy `tags` exactly |
| timestamp | canonicalized record `createdAt` |
| scope/kind | `project` / `semantic` |
| writer/source/date | bundle `distilledBy` / `memory/<planSlug>.knowledge.jsonl#<id>` / canonicalized bundle `distilledAt` |
| custom keys | `id`, `planSlug`, `planTitle`, optional `taskId`, `sourceRole`, `files`, `legacyType`, `legacyCreatedAt`, `legacyBundleDistilledAt`, `legacyBundleDistilledBy`, `legacySourceSha256` |
| body | legacy `content` byte-for-byte |

`createdAt` remains verbatim under `legacyCreatedAt` and supplies normalized
`timestamp`. `knowledge/index.md` maps every source/ID. Validate all destinations
before deleting 46 legacy files. Delete `lib/sessions/knowledge.ts`, related
exports/types/tests, and leave no compatibility reader/writer.

### 7. Distiller discovery, callable backfill, and human gate

The extraction agent remains `bundled/coding/agents/distiller.ts` unless D-022
triggers. Persona/archive guidance requires probing active and archived
manifests, unioning/deduplicating referenced Tier-2 transcripts, and falling
back to plan/tasks only when neither root supplies transcripts. It requires
3-15 one-concept proposals and forbids raw excerpts, file/command content,
embeddings, and JSONL.

The missing set is repository-derived; the currently verified 19 slugs are:
`agent-thinking-levels`, `analysis-capabilities`, `coding-agnostic-framework`,
`dialogic-planner`, `domain-authoring`, `drive-smoke-fixes`,
`driver-primitives`, `external-agent-orchestration`,
`external-backends-and-cli`, `fallow-temp-exceptions-cleanup`,
`framework-extraction`, `main-domain-and-cosmo-rename`, `observability`,
`orchestration-hardening`, `orchestration-surface-consolidation`,
`package-system`, `quality-contracts`, `roadmap-system`, `ruby-rails-skills`.

`scripts/knowledge-surface-backfill.ts` exports
`runKnowledgeSurfaceBackfill(options)` with injected config IO, `distillSlug`,
clock, and `AbortSignal`. Production composition uses `CosmonautsRuntime` plus
`createPiSpawner` to run the qualified coding distiller after temporary enable.
Tests induce success, failure, and cancellation — cancellation including a
real `createPiSpawner` run proving the Pi session terminates before
restoration and return (D-027: `lib/orchestration/agent-spawner.ts` honors
`SpawnConfig.signal` mid-run and makes `dispose()` effective). The batch
records/hashes config, atomically enables, runs and validates 3-15 proposals
per slug, and on failure or cancellation deletes the proposals of every slug
that never completed validation before exiting (D-029). Restoration in
`finally` is conditional per D-026: byte-for-byte when the file still holds
exactly what the batch wrote; a concurrently edited config is never
overwritten — the batch preserves it, saves the pre-run snapshot to
`.cosmonauts/config.json.backfill-prerun`, and fails with a conflict report.
It then writes `memory/agent/proposals/backfill-review.json` only after
successful restoration. Its schema
contains version/plan/time, before/after config digests, missing slugs,
source inputs, proposal paths/digests, aggregate proposal-set digest, and
`noPromotion: true`.

Stage 7A ends at machine GREEN. A human then writes
`missions/reviews/knowledge-surface-backfill-approval.md` with kind/plan,
human reviewer/time, review-index and proposal-set digests,
`decision: approve | reject`, no-verbatim attestation, and rejected paths/reasons.
Missing/reject/mismatch blocks Stage 8 and returns to cleanup/rerun. Approval
never promotes.

`finally` cannot cover `SIGKILL`, power loss, or death between enable/restore;
that accepted hard-kill window has no portable fix. Before a subsequent run,
config must be compared to the saved pre-run digest/bytes and manually restored
if needed. The procedure executes project-controlled config only in this
reviewed repo after plan approval, never arbitrary targets.

### 8. Capability evidence and Pi-first verification

`analysis_status` reports complexity, duplication, boundary-conformance,
dead-code, changed-scope audit, trace, and fix-preview unbound with
`execution-not-consented` for `fallow`. No individual capability was retried.
This is absent evidence, not a clean baseline; structural gates remain degraded.

Installed Pi 0.80.6 source verifies the chosen seam:
`DefaultResourceLoaderOptions.extensionFactories?: InlineExtension[]` exists;
`loadExtensionFactories()` retains/loads named factories into the loader
runtime; `loadExtensionFromFactory` creates one extension/API for the one
closure; path loading creates fresh APIs and uses jiti `moduleCache:false`.
Thus one configured inline factory can own all handlers without cross-extension
identity/state. The two actual binding paths are `cli/session.ts` resource
options and `lib/orchestration/session-factory.ts`'s loader. Pi registry and
reload/runtime-replacement behavior support the collision and frozen-transition
contracts. No custom runtime, EventBus policy, singleton, registry, or sandbox
is added.

## Files to Change

- `tests/config/loader.test.ts` ↔ `lib/config/types.ts`,
  `lib/config/loader.ts`, `lib/config/index.ts` — literal-true/default-OFF gate.
- `tests/agents/session-assembly.test.ts`, `tests/cli/session.test.ts`,
  `tests/orchestration/session-factory.security.test.ts`,
  `tests/interactive/agent-switch.test.ts`, and
  `tests/pi-contract/pi-behavior-contract.test.ts` ↔
  `lib/agents/session-assembly.ts`, `lib/domains/resolver.ts`,
  `lib/orchestration/definition-resolution.ts`, `cli/session.ts`, and
  `lib/orchestration/session-factory.ts` — provenance-preserving bindings,
  inline factory, authorization matrix, collision checks, every definition,
  and gate transitions.
- `tests/extensions/agent-memory.test.ts` and
  `tests/extensions/architecture-memory.test.ts` ↔ new
  `lib/extensions/agent-memory/index.ts`, new
  `lib/extensions/architecture-memory/index.ts`, new
  `lib/extensions/knowledge-surface/session-extension.ts`, new
  `lib/extensions/knowledge-surface/combined-context.ts`, new
  `lib/extensions/knowledge-surface/knowledge-tools.ts`, and existing thin
  shared wrappers — preserve registered tools/identity guards and emit one
  authorized combined context.
- `tests/domains/main-domain.test.ts` ↔ `package.json`, thin wrappers, and inline
  factories — prove OFF package baseline and no enabled bare-host promise.
- `tests/memory/markdown-store.test.ts`, `tests/memory/interface.test.ts` ↔
  `lib/memory/types.ts`, `lib/memory/index.ts`, new
  `lib/memory/knowledge-records.ts`, new `lib/memory/knowledge-store.ts`, new
  `lib/memory/multi-store-retrieval.ts`, and new
  `lib/memory/injection-budget.ts` — split contracts, writer-keyed proposal
  identity, retrieval/stats, and allocator.
- `tests/episodic/pre-w3-disabled-baselines.test.ts` ↔ config/session/extension/
  distiller/project-context seams — exact OFF gated-attribution and D-009
  correction allowlist.
- New `tests/fixtures/knowledge-seed-inventory.json`, existing `memory/*.md`,
  existing `memory/*.knowledge.jsonl`, and new `knowledge/` — complete migration.
- `tests/sessions/knowledge.test.ts` ↔ delete `lib/sessions/knowledge.ts`; update
  `lib/sessions/index.ts` and `lib/sessions/types.ts` — retire JSONL.
- `tests/prompts/archive-skill.test.ts` ↔ `bundled/coding/prompts/distiller.md`,
  `bundled/coding/agents/distiller.ts`, and
  `domains/shared/skills/archive/SKILL.md` — active/archive Tier-2 discovery and
  proposal-only output. If D-022 triggers, ownership follows the extracted
  installed domain.
- `tests/scripts/knowledge-surface-backfill.test.ts` ↔ new
  `scripts/knowledge-surface-backfill.ts`, proposal/review-index records, and
  `missions/reviews/knowledge-surface-backfill-approval.md` — callable restore
  lifecycle (conditional restoration per D-026, partial-proposal cleanup per
  D-029) and separate human gate.
- `tests/orchestration/agent-spawner.test.ts` ↔
  `lib/orchestration/agent-spawner.ts` — `SpawnConfig.signal` honored mid-run:
  abort interrupts and awaits the Pi session, `dispose()` becomes effective;
  real-spawner cancellation case for B-010 (D-027).
- Stage-6 scan evidence ↔ new
  `missions/reviews/knowledge-surface-scan-cost.md` — 20-turn real-corpus stats
  and pass/amend verdict before backfill.
- `tests/tasks/file-system.test.ts`, `tests/cli/scaffold/subcommand.test.ts`, and
  `tests/plans/archive.test.ts` ↔ layout/scaffold/archive pointer seams.
- `tests/prompts/archive-skill.test.ts` ↔ `docs/memory.md`, `README.md`,
  `ROADMAP.md`, `AGENTS.md`, roadmap/archive guidance, ambient-assistant design,
  and permitted live architecture links — document the complete ruled surface.
- `fallow.toml` is verification-only unless static evidence requires change:
  new lib factories are statically imported; domain wrappers already match the
  dynamic pattern. Add no speculative suppression.

## Risks

- **R-001 — OFF-baseline scope drift (medium).** Exact correction regions and
  gated-attribution assertions must fail unapproved prompt deltas or unqualified
  generic effects; B-008 retains F-16.
- **R-002 — Governed/trusted boundary confusion (high).** Dedicated paths use
  `MemoryStore`; generic tools/backends are trusted and unsandboxed.
- **R-003 — Migration completeness/semantics (high).** Missing fields, key
  collisions, timestamp invention, or body changes fail B-003. Stop rather than
  add a fifth type/consolidate.
- **R-004 — Proposal path/identity corruption (high).** Realpath/symlink checks,
  writer-keyed identity, exclusive creation, retry comparison, and mutations are
  mandatory.
- **R-005 — Duplicate tools, widened authority, or double injection (high).**
  One inline factory and exact-provider substitution replace WeakMap state; the
  D-023 matrix prevents wrapper presence becoming authority. Stop on EventBus/
  singleton correctness state or legacy-store calls by ineligible identities.
- **R-006 — Distillation exfiltration (high).** Proposal-only output and
  digest-bound human approval own INV-5; workers cannot self-approve.
- **R-007 — Per-turn scan cost (medium).** Full scans are O(N). Stage 6 owns the
  named 20-turn artifact and stops on threshold breach before backfill; Stage 9
  only rechecks. Cache/embeddings are not an implicit fix.
- **R-008 — Structural evidence absent (medium).** Analysis bindings are
  unbound; reviewer judgment inspects one parser/store/combiner/allocator/
  composer and dependency direction.
- **R-009 — Backfill hard-kill window (high residual).** `finally` cannot cover
  hard kill/power/process death. Saved digest/bytes enable manual recovery; no
  portable guarantee is claimed.
- **R-010 — Coding-extraction collision (medium).** If extraction lands first,
  D-022 stops/amends ownership to the moved domain; no duplicate distiller.
- **R-011 — Thirteen-behavior size (low).** F-11 needs separate store/adapter
  seams. Two slices and eight worker slices contain scope; split only if either
  cannot remain independently green.

## Quality Contract

Plan-specific assertions:

1. Every frozen field/header/raw timestamp/body maps through Design §6;
   deleting `planTitle`, `legacyType`, `legacySource`, `legacyCreatedAt`, or a
   destination fails B-003.
2. Minimal human records remain retrievable; machine negatives include missing
   provenance/identity, traversal, wrong scope/type, symlinks, interruption,
   nonconforming occupants, time-advanced same-writer retry, and writer-only
   identity change (B-001/B-002).
3. Initial/switch/spawn/reload/plain-new/restart/package fixtures prove one
   recall for every Cosmonauts-assembled agent, both gate transitions, no
   legacy-authority widening for synthetic wrapper users, OFF gated-attribution,
   and exact D-009 prompt allowlist (B-005/B-008/B-012).
4. One inline extension stays within 24,000 bytes, preserves discoverability,
   emits nothing empty, exposes stats, and Stage 6's named 20-turn artifact
   passes before backfill (B-007/D-025).
5. Tests invoke authorized `remember` distinctly, deny ineligible legacy tools
   without store calls, and exercise all knowledge/proposal paths through
   `MemoryStore`; docs identify generic tools/backends/bare hosts accurately
   (B-006/B-011/B-013).
6. Backfill derives 19 slugs, yields 3-15 proposals each, restores config under
   success/failure/cancellation, and writes a digest-complete review index
   before machine GREEN (B-010).
7. Stage 8 requires a matching human `approve` artifact; reject/absence/mismatch
   forces cleanup/rerun and never promotes.
8. Static inspection finds no active JSONL, embeddings, consolidation, working
   state, episode/explicit-save/retention change, enabled bare-host promise,
   default ON, WeakMap, module singleton, or correctness cache.

| Order | Gate kind | Tier | Binding state | Threshold | Protocol | Degradation / notes |
|---:|---|---|---|---|---|---|
| 1 | `correctness` | universal | bound | All behavior tests plus project-native correctness evidence pass | project-discovered | hard fail |
| 2 | `artifact-conformance` | universal | bound | All 13 behavior entries resolve to test files with exact markers | artifact evidence | hard fail |
| 3 | `mutation` | bindable | unbound | Path authority, writer identity, semantic retry, migration, budget, authorization, OFF attribution, gate transitions, backfill failure/cancellation, and approval negatives survive faults | pending | unbound globally; named negatives mandatory, reviewer judgment required |
| 4 | `duplication` | bindable | unbound | One parser/store/retrieval combiner/budget allocator/session composer/proposal derivation | pending | execution not consented; stages 3-5 and reviewer judgment own it |
| 5 | `complexity` | bindable | unbound | Store, allocator, context adapter, proposal tool, and backfill lifecycle stay focused | pending | execution not consented; stages 3-5 and reviewer judgment own it |
| 6 | `boundary-conformance` | bindable | unbound | `lib/memory/` stays Pi/config/domain independent; adapters depend inward; wrappers add no policy; generic trust is documentation-only | pending | execution not consented; reviewer judgment required |
| 7 | `dead-code` | bindable | unbound | JSONL is removed; static factories/wrappers are reachable without duplicate entries | pending | execution not consented; reviewer judgment required |

## Implementation Order

**Precondition 0 — settled ground and review (satisfied 2026-08-19).** D-001
through D-016 and `createdAt` are preserved; D-017 through D-029 are recorded
amendments (D-026 human-ruled). The spec carries D-009/D-010/D-015.
`review-5.md` carries post-revision verification of F-01 through F-16;
`review-6.md`'s four findings are applied via D-026..D-029 (see the Findings
Application Ledger). The human ruled 2026-08-19 to proceed to task creation
without a further plan-review round; the task compliance review is the next
verification channel.

**Precondition 1 — coding location.** Confirm `bundled/coding/` still owns the
distiller before Stage 5; if extraction landed, apply D-022 first.

Two delivery slices contain the 13-behavior spine:

- **Slice A (Stages 1-4):** runtime/storage foundation, independently green
  without migrated content.
- **Slice B (Stages 5-9):** proposal/distiller, migration and scan evidence,
  supervised backfill, docs, and final gates.

1. **Characterize/freeze (B-003, B-008, B-012).** Capture prompts, package
   discovery, tools, wrapper registration/authorization, config transitions,
   seed records/timestamps, and backfill inputs.
2. **Gate/session/package composition (B-005, B-008, B-012).** RED every
   definition plus synthetic eligible/ineligible exact-wrapper fixtures; test
   registered/denied tools, absent unauthorized contexts/store calls, one recall,
   collisions, and both gate directions across frozen/reassembled paths. Move
   reusable factories behind thin wrappers and configure one inline extension.
   Do not claim B-007.
3. **Record/store core (B-001, B-002, B-004).** RED minimal human records,
   malformed/mtime/path/symlink cases, full machine provenance, same-writer
   retry/race, writer-only identity, and occupant collision. REFACTOR to one
   parser/store with separate human normalization/machine validation and no Pi.
4. **Recall/combined context (B-004-B-007).** Add one combiner, guarded authored
   composition, knowledge recall, pure legacy renderers, metadata index, one
   allocator/message, and stats. REFACTOR to one combiner/allocator; no
   unauthorized section scan or independent enabled handler. B-007 GREEN here.
5. **Proposal adapter/distiller (B-009, B-013).** RED distiller-only no-path
   schema, qualified writer, complete draft, same-writer adapter retry, and
   active/archive text obligations. REFACTOR to one proposal derivation/session
   composer; no second extractor/consolidation.
6. **Atomic migration, retirement, and recurring-cost gate (B-003).** Generate
   and validate canonical destinations; update only allowed pointers; remove 46
   legacy files and JSONL API/types/tests atomically. Then run the 20 enabled
   turns against the migrated corpus and write the named scan-cost artifact.
   `verdict: amend` or threshold breach blocks Stage 6 GREEN and all later work;
   `pass` is task acceptance evidence. No migration code survives except fixture.
7. **Supervised backfill.**
   - **7A worker RED→GREEN→REFACTOR (B-010):** callable lifecycle,
     success/failure/cancellation restore, 3-15 proposals/slug, review index.
     Worker ends at machine GREEN without approval.
   - **7B human gate:** inspect diff and write approve/reject artifact. Reject or
     digest mismatch cleans/reruns 7A; approve unlocks Stage 8. No promotion.
8. **Layout/docs (B-001, B-011).** Apply only D-009-allowed pointers; document
   minimal/machine contracts, authorization matrix, host scope, transitions,
   scan evidence, trust, and exclusions; keep gate OFF.
9. **Integrated refactor/gates (B-001-B-013).** Run correctness/artifact gates,
   recheck scan and approval artifacts, manually inspect unbound gates, and
   verify F-16/exclusions. Stop/amend rather than adding excluded architecture.

Candidate worker slices are Stages 1-2, 3, 4, 5, 6, 7A, 8, and 9 (eight); 7B is
human-only. Every worker runs RED → GREEN → REFACTOR per owned behavior. If a
slice cannot remain independently green or a module exceeds its stated single
responsibility, stop and split/amend rather than expanding silently.

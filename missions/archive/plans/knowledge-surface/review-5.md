# Plan Review: knowledge-surface

## Findings

- id: PR-001
  dimension: interface-fidelity
  severity: medium
  title: "Legacy-wrapper presence is not the same as legacy tool/context authority"
  plan_refs: D-017, B-005, B-006, Design §2, Quality Contract assertions 3 and 5
  code_refs: domains/shared/extensions/agent-memory/index.ts:25-27, domains/shared/extensions/agent-memory/index.ts:160-289, domains/shared/extensions/architecture-memory/index.ts:21-29, domains/shared/extensions/architecture-memory/index.ts:55-126, lib/orchestration/definition-resolution.ts:82-128
  description: |
    D-017's single inline factory is a valid Pi seam, but the options contract describes `includeAuthoredMemory` and `includeArchitectureMap` in terms of whether assembly found and removed the exact shared wrapper. The current wrappers do not equate wrapper presence with authority. Agent-memory always registers `remember`/`recall` when loaded, but authorizes reads, writes, and context only when the effective agent ID is `main/cosmo`. Architecture-memory likewise registers `architecture_map_read` when loaded but authorizes context/tool detail only for its fixed five-agent set.

    An installed `AgentDefinition` can name either exact shared wrapper through the existing fallback resolver while having an ID outside those authorization sets. If a worker maps wrapper presence directly to the two booleans, the configured inline factory broadens `remember`, authored-memory injection, or architecture-map access. If it simply omits those tools for an ineligible ID, it also changes the previously registered-but-unauthorized surface. The factory already captures `agentId`, so the seam can preserve this behavior, but B-005/B-006 do not state or test the registration-versus-authorization matrix. Define the booleans and inline guards against the current identity policies and add synthetic ineligible definitions that request the exact shared wrappers. This protects, rather than changes, the ratified read-wide/write-few ground in `knowledge-and-memory.md` §6.

- id: PR-002
  dimension: constraint-ownership
  severity: low
  title: "The per-turn scan stop condition is still owned only by the final checkpoint"
  plan_refs: Design §5, R-007, Quality Contract, Implementation Order Stages 4 and 9
  code_refs: lib/memory/markdown-store.ts:471-529, lib/memory/types.ts:43-64
  description: |
    Design §5 now gives F-14 a concrete 20-turn p95/bytes stop condition, and the existing store confirms why it matters: every retrieval enumerates scopes, reads records, and tallies the full scan. B-007 and Stage 4 own only stats visibility plus oversized/empty message cases. The actual 20-turn threshold is deferred to Stage 9's integrated final gate, after the implementing Stage 4 and corpus Stage 6 worker slices can already be closed.

    A final-checkpoint-only stop condition is too late for a load-bearing recurring-cost constraint; exceeding it would reopen completed runtime/storage work. Give the measurement a task-visible owner at the earliest post-migration slice and name its evidence artifact or acceptance result. The O(N), no-cache design itself remains an accepted derived choice.

- id: PR-003
  dimension: lifecycle-invariant
  severity: low
  title: "D-019 says every stable caller field is hashed, but the key omits writer"
  plan_refs: D-019, B-002, B-013, Design §3, Design §4
  code_refs: lib/memory/types.ts:12-23, lib/memory/markdown-store.ts:119-161
  description: |
    D-019 says proposal identity hashes every caller-controlled stable field. The revised draft makes `writer` caller-supplied, and Design §4 treats writer as required provenance whose mismatch rejects an occupied path. However, the canonical `stable` object hashes plan slug, type, title, description, content, tags, source, and source date only; it omits `writer`.

    Two otherwise identical drafts from different qualified writers therefore select the same canonical path and collide rather than receiving the identity D-019 promises. This does not regress the time-advanced same-writer retry fixed by F-04, but it leaves the amendment internally inconsistent and leaves the B-002 direct-store boundary without a writer-change mutation. Align the key definition or explicitly amend D-019's “every caller-controlled stable field” claim. D-019 is derived ground; INV-6 provenance must remain intact.

## Findings Application Verification

- **F-01 — applied.** D-017 supersedes only D-008's impossible WeakMap/reload mechanism. Pi 0.80.6 exposes `DefaultResourceLoaderOptions.extensionFactories?: InlineExtension[]` (`resource-loader.d.ts:58-72`), stores the array, loads named factories into the same `ExtensionRuntime`, and invokes each factory with its own fresh API (`resource-loader.js:372-388, 720-738`; `extensions/loader.js:345-358`). The plan uses one closure-captured factory and no cross-factory identity, WeakMap, EventBus policy, or module singleton. PR-001 is a separate legacy-authorization precision gap, not a return to F-01's invalid coordination model.
- **F-02 — applied.** D-018, B-001, and Design §3 require only a valid ratified `type` for human records, define deterministic fallbacks for every recommended field, and keep strict provenance/identity on machine proposals.
- **F-03 — applied.** D-020 and B-010 define a callable injected batch seam and machine evidence. Stage 7A ends at machine GREEN with restored config, validated proposals, and `memory/agent/proposals/backfill-review.json`; Stage 7B separately requires the named human artifact `missions/reviews/knowledge-surface-backfill-approval.md`. Quality assertion 7 blocks Stage 8 on approval and matching digests. The hard-kill window is explicitly accepted rather than falsely covered by `finally`.
- **F-04 — still deficient.** Same-semantic retries without `sourceDate` now preserve the first successful clocks, so the original retry failure is fixed. However, D-019's broader identity claim and Design §4 disagree on the stable `writer` field; see PR-003.
- **F-05 — applied.** D-021 and Design §6 preserve legacy values under exact non-colliding keys, including `legacySource` and `legacyType`.
- **F-06 — applied.** D-021 and Design §6 define canonical UTC RFC3339 millisecond timestamps and exact date-only/seconds/milliseconds/parsed-Date normalization while retaining original values.
- **F-07 — applied.** D-017 and B-008 now state the actual lifecycle: reload/plain-new preserve the frozen selection; process restart and `/agent` switch rerun assembly and adopt edits in both directions.
- **F-08 — applied.** B-009 and Design §7 require unioned active/archive manifest discovery with resolved-path deduplication and fallback only when neither root supplies transcripts.
- **F-09 — applied.** B-007 becomes GREEN in Stage 4, not Stage 2.
- **F-10 — applied.** D-015's Cosmonauts-assembled-session scope appears in B-005/B-006/B-011/B-012, Design §§1-2, and Quality assertions 3/5. Bare Pi hosts are documented as outside the enabled contract and tested only for OFF package identity.
- **F-11 — applied.** B-002/Stage 3 own direct store validation and retry behavior; B-013/Stage 5 independently own the distiller-only proposal schema and adapter bridge. Both stages are executable from their named seams. PR-003 is a remaining identity-field detail, not a store/adapter ownership collapse.
- **F-12 — applied.** Stages 3-5 carry explicit one-parser/store/combiner/allocator/composer and focused-module refactor obligations rather than leaving them solely to Stage 9.
- **F-13 — applied.** B-011 sources AC-001, AC-004, and AC-008.
- **F-14 — still deficient.** Stats visibility and measured thresholds are now concrete, but the 20-turn stop condition remains final-checkpoint-only; see PR-002.
- **F-15 — applied.** D-022, Precondition 1, and R-010 require a stop-and-amend if active `coding-extraction` moves the distiller before this slice; no second framework extractor is allowed.
- **F-16 — applied and retained.** B-006 explicitly invokes existing `remember` separately and preserves ordinary notes/profiles/playbooks while only machine knowledge writes proposals. B-008, Design §1, R-001, Quality assertion 3, and Stage 9 limit OFF identity to gated-adapter-attributable effects while preserving D-009's exact content-correction allowlist.

No synthesized finding was explicitly rejected or dispositioned as accepted debt. Fourteen are fully applied; F-04 and F-14 retain the limited deficiencies above.

## Decision and Frontmatter Preservation

- **D-001 through D-016 are all present in order.** D-008's original text remains on the record with a dated supersession pointer rather than being deleted. Human rulings D-009, D-010, D-015, and D-016 remain intact; D-017 through D-022 are separately identified as derived amendments.
- **`createdAt` is preserved** as `'2026-08-18T20:03:19.945Z'`. This is the same value directly recorded by the prior review round; only `updatedAt` advanced.
- The current artifact and `review-synthesis.md` agree on D-015/D-016 authority and on F-16's two retained corrections. Project-wide changed-scope audit remains unavailable because `analysis_status` reports `changed-scope-audit` unbound (`execution-not-consented`, provider `fallow`); preservation above is verified from the artifact and prior review records, not inferred from an unavailable clean audit.

## Pi 0.80.6 Seam Verdict

D-017 does use Pi 0.80.6's real public seam. `extensionFactories` accepts named `InlineExtension` objects; `DefaultResourceLoader` retains them and reloads them into the same loader runtime after path extensions. `loadExtensionFromFactory` creates one fresh extension/API for that one factory. A closure can therefore capture immutable session policy and register all knowledge, legacy-memory, and architecture handlers/tools into one extension without a WeakMap, singleton, or cross-module sharing assumption.

Both existing Cosmonauts loader paths are correctly named for binding: `cli/session.ts` builds `resourceLoaderOptions` for `createAgentSessionServices`, and `lib/orchestration/session-factory.ts` constructs `DefaultResourceLoader` directly. Reload and plain-new reuse the selected factory array; `/agent` rebuilds session params. The remaining PR-001 issue is not Pi-seam viability—it is the missing explicit rule for reproducing the current legacy authorization matrix inside that viable factory.

## Missing Coverage

- A synthetic installed agent that names the exact shared `agent-memory` or `architecture-memory` wrapper but is outside the current authorized identity set, proving registration, denial, and context behavior are preserved after substitution.
- A task-local, named result/artifact for the 20 representative post-migration turns before final integrated verification closes the runtime/storage slices.
- A proposal-identity mutation changing only `writer`, proving whether writer is intentionally part of the canonical key or intentionally collision-checked outside it.

## Coverage Ledger

- dimension: interface-fidelity
  status: checked
  checked: Compared D-017 against Pi 0.80.6 `InlineExtension`, resource-loader, factory loading, extension registry/precedence, both Cosmonauts loader paths, current wrapper tool/context authorization, and the MemoryStore proposal seam.
  findings: PR-001, PR-003
- dimension: duplication
  status: unchecked
  checked: `analysis_status` reports duplication unbound with reason `execution-not-consented` for provider `fallow`; manual reading confirmed the intended single-factory shape but cannot establish project-wide structural uniqueness.
  findings: none
- dimension: state-sync
  status: checked
  checked: Traced OFF/ON resolution through initial, spawn, switch, reload, plain-new, restart, proposal retry/race, backfill restoration, approval replacement, and proposal exits.
  findings: PR-003
- dimension: risk-blast-radius
  status: checked
  checked: Walked built-in and installed definitions, legacy wrapper substitution, package hosts, migration, distiller/backfill, human approval, hard-kill recovery, and recurring per-turn scans.
  findings: PR-001, PR-002
- dimension: user-experience
  status: checked
  checked: Walked enabled/OFF sessions, config edits, recall and legacy-tool access, empty knowledge, proposal retries, backfill failure/cancellation, approval/rejection, and package-host boundaries.
  findings: PR-001
- dimension: behavior-spec
  status: checked
  checked: Reviewed all 13 behaviors for AC sources, concrete inputs/results, seams, named tests, markers, edge/failure cases, and stage authorability, with special checks on B-002/B-013 and B-010/Stage 7A/7B.
  findings: PR-001, PR-003
- dimension: architecture-record
  status: unchecked
  checked: Manually compared the plan with `knowledge-and-memory.md` and `code-structure-map.md`, including write authority, MemoryStore direction, derived-map separation, and combined budget. `analysis_status` reports boundary-conformance unbound (`execution-not-consented`, provider `fallow`), so project-wide conformance was not established.
  findings: PR-001
- dimension: quality-contract
  status: checked
  checked: Reviewed all eight plan assertions and the ordered abstract gate ladder for correctness, artifact conformance, mutation negatives, degraded structural bindings, machine/human backfill separation, and F-16 retention.
  findings: PR-002, PR-003
- dimension: lifecycle-invariant
  status: checked
  checked: Attacked factory/reload state, authorization resets, proposal identity/clocks/occupants, migration timestamps, backfill restore and approval exits, prompt identity, and recurring scan costs.
  findings: PR-003
- dimension: constraint-ownership
  status: checked
  checked: Traced D-017-D-022 and every changed file group into behavior or stage owners, including wrapper preservation, store/adapter split, migration, backfill machine/human gates, scan evidence, and coding-extraction sequencing.
  findings: PR-001, PR-002
- dimension: scope-size
  status: checked
  checked: The plan has 13 behaviors, one above guidance, but R-011 records why B-002/B-013 must remain independent and the Implementation Order provides two delivery slices plus eight candidate worker slices. The explicit justification/slicing resolves a separate size finding.
  findings: none

## Assessment

The revision successfully replaces the invalid WeakMap design with Pi 0.80.6's real inline-factory seam and cleanly separates machine backfill GREEN from human approval. It is viable with limited revision, not fundamental redesign; first make the single factory's legacy authorization matrix explicit so installed definitions cannot gain `remember` or architecture access merely by naming a shared wrapper. F-04 and F-14 also need the small identity and task-local measurement corrections above before task creation.

## Post-revision Verification

**Verification date: 2026-08-19. Scope:** focused verification of the revisions made for this review's PR-001 through PR-003, plus preservation checks requested before task creation. The original findings above are retained as the pre-revision record; the verdicts below supersede their unresolved status.

### Review-5 findings

- **PR-001 — PASS, resolved by D-023.** Current agent-memory code registers both `remember` and `recall` before checking turn authorization, then authorizes only identity `main/cosmo` (`domains/shared/extensions/agent-memory/index.ts`). Current architecture-memory code likewise always registers `architecture_map_read` but authorizes only its fixed five-agent set (`domains/shared/extensions/architecture-memory/index.ts`). The fallback resolver permits installed definitions to request those exact shared wrappers (`lib/orchestration/definition-resolution.ts`), so registration and authorization must remain distinct. D-023 now says exactly that. Design §2 provides separate registration/authorization booleans and a complete matrix preserving registered-but-unauthorized results; B-005 covers the complete built-in/installed matrix plus synthetic ineligible users of each exact wrapper; B-006 requires spy proof that ineligible identities do not call legacy stores or receive legacy context. Files to Change, Stage 2, R-005, and Quality Contract assertions 3/5 carry the same constraint into implementation ownership. This matches current behavior without widening legacy authority.

- **PR-003 — PASS, resolved by D-024. F-04 is now fully applied.** Current `MemoryRecordDraft` is the shared optional-extension seam (`lib/memory/types.ts`), and the existing markdown store demonstrates the relevant exclusive-write/idempotency precedent (`lib/memory/markdown-store.ts`). D-024 now includes normalized qualified `writer` in the canonical proposal hash. Design §4's stable object includes `writer`; B-002 requires a writer-only mutation to select a different path while a time-advanced same-writer retry preserves first-write clocks; B-013 verifies the adapter supplies qualified writer and remains idempotent; Stage 3, R-004, and the mutation threshold own these negatives. D-019 and D-024 are now internally consistent and preserve spec INV-6 provenance.

- **PR-002 — PASS, resolved by D-025. F-14 is now fully applied.** The existing retrieval path performs a full disk scan on every call and reports `filesScanned`, `bytesRead`, and `durationMs` (`lib/memory/markdown-store.ts`; `lib/memory/types.ts`), confirming the recurring-cost risk is real. D-025 moves the stop condition to Stage 6, the first slice with the migrated corpus. Design §5 names `missions/reviews/knowledge-surface-scan-cost.md`, its schema, 20 enabled turns, corpus inputs/raw stats, p95 and scan thresholds, and a non-degraded `pass | amend` verdict. Stage 6 cannot reach GREEN or proceed to backfill on breach; R-007, Files to Change, Quality assertion 4, and Stage 9's recheck preserve that ownership. The accepted disk-authoritative O(N) design now has timely, task-local evidence rather than a final-checkpoint-only check.

### Preservation and ratified-ground checks

- **D-001 through D-016 — PASS.** All sixteen entries remain present and ordered. D-008's original text remains verbatim with an explicit D-017 supersession pointer. Human rulings D-009, D-010, D-015, and D-016 remain identified as human decisions. The authoritative spec still carries the D-009 AC-007 amendment, the D-010 INV-1/INV-2 and AC-003/AC-005 amendments, and the D-015 Cosmonauts-assembled-session scope amendment. D-016 continues to ratify only the supervised temporary enable/restore mechanism; the default-OFF declaration is unchanged. These remain consistent with `missions/architecture/knowledge-and-memory.md` and the separate derived-map boundary in `missions/architecture/code-structure-map.md`.
- **Plan frontmatter — PASS.** `createdAt` remains exactly `'2026-08-18T20:03:19.945Z'`; only `updatedAt` advanced.
- **F-16 — PASS, retained.** B-006 and Quality assertion 5 still exercise authorized `remember` separately from machine knowledge proposal writes and preserve ordinary notes/profiles/playbooks. B-008, Design §1, R-001, Quality assertion 3, and Stage 9 still qualify OFF identity to gated-adapter-attributable effects while pinning the exact D-009 content-correction allowlist.

### Pi seam regression check

**F-01 — PASS; no regression.** The project remains pinned to Pi 0.80.6 (`package.json`). Pi's public `DefaultResourceLoaderOptions` still exposes `extensionFactories?: InlineExtension[]`; the loader stores that array, loads named inline factories into the loader's extension runtime, and `loadExtensionFromFactory` creates one extension/API for each factory (`node_modules/@earendil-works/pi-coding-agent/dist/core/resource-loader.d.ts`, `dist/core/resource-loader.js`, and `dist/core/extensions/loader.js`). D-017 still selects one configured inline factory at `buildSessionParams`, and Design §2 requires both existing Cosmonauts loader paths (`cli/session.ts` and `lib/orchestration/session-factory.ts`) to pass it to Pi. D-023 adds immutable registration/authorization inputs inside that same factory; it does not reintroduce cross-factory WeakMap state, an EventBus handoff, a module singleton, or a custom runtime. OFF assembly still supplies no factory and preserves existing extension paths.

### Final readiness

**READY for task creation.** No focused deficiency remains. PR-001, PR-002, and PR-003 are resolved; F-04 and F-14 are fully applied; D-001 through D-016, `createdAt`, F-16, and F-01's Pi seam are preserved. **All F-01 through F-16 are applied/dispositioned, with none left unresolved.** Structural analysis capabilities remain unbound (`execution-not-consented`, provider `fallow`), as already recorded; this is unchanged degraded evidence, not a new readiness defect.

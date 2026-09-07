# Stage 1 Round 2 Fresh Structural Review: living-memory-fidelity

- Date: 2026-09-07
- Task: `TASK-643`
- Reviewed range: `0493e54..4ddb651` (the complete permitted Stage-1 implementation diff: original remediation `773bd29` plus SR-001 remediation `4ddb651`)
- Reviewer context: in the parent plan, round 6 stopped measuring what injection includes and round 7's attempted fix diverged in both directions while dropping retrieval warnings; six of seven parent rounds' fixes introduced a fresh defect. In this plan, the Stage-1 remediation that closed those divergences itself introduced SR-001, a vacuous-truth receipt materialization on the newly added unusable-pressure path. Fixes in this code have reliably introduced regressions, so this review looked for what the SR-001 fix broke, not only whether SR-001 closed.
- Verdict: **pass — zero unresolved high or medium findings; Stage 1 may close and Stage 2 may begin**

## Findings

No high or medium findings remain in the complete permitted Stage-1 diff.

## SR-001 Closure and Regression Inspection

- **Receipt lifecycle:** verified the full non-dry B-002 counterexample. When pressure is unusable, the bounded retirement candidate is recorded in `pressureDeferredRetirements`, the accepted receipt remains `accepted`, and `markMaterialized()` is not called. The pressure-deferred evidence remains in the accepted receipt instead of being hidden as represented evidence.
- **Retryability:** verified the same two-pass test supplies a measured exact render input on the later pass, reuses the accepted judgment, observes the still-live candidate, applies one retirement, and only then materializes the receipt. Captured call counts are candidate lengths `[0, 0, 1]`: two empty recovery applications followed by the retried retirement application.
- **Retirement gate:** verified unusable pressure still supplies an empty list to the retirement store's candidate-bearing application. The fix does not authorize retirement under unusable pressure and does not alter target-fit retirement authority.
- **Reported details:** verified the pressure-blocked candidate is reported once as `status: "deferred"` with its path, digest, and `retire-when-met` reason, accompanied by `index-pressure-unusable` and `retirement-pressure-deferred`; it is never reported as applied. Pressure-deferred and cap-deferred candidates partition the bounded and over-cap sets, so the fix neither drops nor duplicates an observed candidate within the reporting cap.
- **Adjacent completion conditions:** inspected retirement failure, applied-retirement, episode-finalization, observation-cap, proposal-cap, retirement-cap, model-only retirement, dry-run, and no-candidate branches around receipt materialization. The new guard changes only the pressure-deferred case and preserves the pre-existing requirements that every attempted retirement be applied and every represented episode be pruned before materialization.

## Required Structural Inspection

- **Canonical descriptor:** verified one frozen `KNOWLEDGE_INDEX_RETRIEVAL` owns the project/user scope set, `text: ""` plus `KNOWLEDGE_RECORD_TYPES` query, user-root resolution, and inventory-preferred admission-to-render projection. Combined-context injection and the project corpus source consume that descriptor directly.
- **Required render input and renderer:** verified one memory-owned `KnowledgeIndexRenderInput` requires both records and warnings. The sole `renderKnowledgeIndex(input)` entry point has one required argument, and the pressure policy renders that same input directly.
- **Production handoff:** verified `createProjectCorpusConsolidationSource()` performs one bounded retrieval, derives its sole `knowledgeIndex` contribution from the complete parsed metadata inventory plus retrieval warnings, and separately admits bodies under the existing judgment ceilings. The aggregate rejects a second render-input provider.
- **No private conversion or second retrieval:** verified `toIndexRecords` is absent, no superseded renderer or pressure call form remains in the scoped production code, and the corpus source performs no second retrieval or local metadata reconstruction.
- **No judgment-body-ceiling coupling:** verified render input comes from `retrieved.inventoryRecords` through the canonical projection while `maxCorpusRecordBytes` and `maxCorpusBytes` govern body admission only.
- **Dependency direction:** verified `lib/memory` owns the descriptor and input/result contracts and does not import `lib/extensions/knowledge-surface`; the extension depends inward and owns rendering and pressure calculation. No CLI measurement path was added.
- **Parent carriers:** verified all six exact parent B-012/B-016/B-021 marker/name carriers remain exact and parent-owned, including both B-021 tests. `lib/memory/types.ts` has full-source SHA-256 `d65ff19c00d28a5b8d03e697b235a19d7e6eca26cfa73bc3c97a0364ff103aea`, matching all three re-pinned seam assertions. The frozen receipt-floor, retirement/byte-authority, fail-closed output validation, and existing behavior-marker suites pass.
- **Scope and closed ground:** verified the implementation commits change only `lib/memory/`, `lib/extensions/knowledge-surface/`, and mirrored tests. They do not touch live `knowledge/`, `lib/memory/retirement-store.ts`, retirement pathname sequencing, D-026 tests, CLI code, documentation, configuration, architecture records, or the parent plan. D-026 was neither reopened nor given another verification layer.

## Structural Gate Status

No executable structural-analysis capability is registered in this reviewer session, so no executable structural evidence exists for any bindable gate below. The complete permitted diff was inspected by hand. Absence of tool findings is **not** a passing structural result.

| Gate | Status | Review evidence |
|---|---|---|
| `mutation` | **degraded/unbound** | B-001's two divergence directions, B-002's full non-dry two-pass lifecycle counterexample, and B-003's warning-byte counterexample were inspected manually and rerun. |
| `duplication` | **degraded/unbound** | Canonical descriptor consumers, renderer call sites, pressure call sites, retrieval count, and receipt/retirement deferral sets were inspected manually. |
| `complexity` | **degraded/unbound** | Pressure resolution, bounded/cap partitions, receipt-input filtering, retirement application, episode finalization, and receipt materialization conditions were traced by hand. |
| `boundary-conformance` | **degraded/unbound** | Implementation paths, public contract ownership, import direction, and the absence of CLI or forbidden-path changes were inspected manually. |
| `dead-code` | **degraded/unbound** | Scoped references for `toIndexRecords`, the canonical descriptor, render-input/result types, renderer, and pressure call forms were inspected manually; no repo-wide dead-code sweep was performed. |

## Verification

- Permanent measurement and parent-carrier pack: **pass**, 9 tests — B-001, B-002, B-003 and all six exact parent B-012/B-016/B-021 carriers.
- `bun run test`: **pass**, 262 files and 3,058 tests.
- `bun run lint`: **pass**, 579 files checked with no fixes.
- `bun run typecheck`: **pass**.
- `git diff --check`: **pass**.
- Live corpus guard before and after review: **pass**, 237 files and tree SHA-256 `adc3ef70a5e75cad8813db9a3ab954d4da84ebfeafbb75703529048007469932` both times.

## Assessment

The complete Stage-1 implementation now closes the round-6/round-7 query, scope, projection, renderer-input, and warning-byte divergences without coupling pressure to judgment body ceilings. The SR-001 fix closes the vacuous receipt transition, preserves the unusable-pressure retirement gate, reports blocked candidates truthfully, and allows a later measured pass to retry before materialization. No new high or medium defect was found in the receipt lifecycle, retirement gate, reported details, shared measurement structure, or preserved parent contracts. Stage 1 may close and Stage 2 may begin.

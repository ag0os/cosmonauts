# Stage 1 Fresh Structural Review: living-memory-fidelity

- Date: 2026-09-07
- Task: `TASK-632`
- Reviewed range: `0493e54..773bd29` (the complete Stage-1 implementation diff)
- Reviewer context: fresh review after round 6 stopped measuring what injection includes and round 7 diverged in both directions while dropping retrieval warnings
- Verdict: **blocked — one unresolved medium finding; Stage 1 may not hand off**

## Findings

- id: SR-001
  dimension: lifecycle-invariant
  severity: medium
  title: "Unusable pressure materializes a receipt for a retirement it blocked"
  plan_refs: D-002, Design section 1, B-002, Quality Contract assertions 2 and 8, Implementation Order step 8
  code_refs: lib/memory/living-memory.ts:577-608, lib/memory/living-memory.ts:804-824
  description: |
    In the full non-dry path, unusable pressure correctly replaces `observedRetirementCandidates` with an empty `retirementCandidates` list. The receipt input filter does not treat those pressure-blocked candidates as deferred, however, and the later completion check asks only whether every entry in the now-empty list was applied. `retirementCandidates.every(...)` is therefore vacuously true, so the pass calls `markMaterialized()` even though it applied no retirement.

    A temporary two-pass counterexample confirmed the consequence. Pass one reported `kind: "unusable"`, called retirement apply only with the empty recovery list, and nevertheless materialized the accepted receipt. Pass two supplied a measured exact render input but returned `noop` with no observation or retirement because the materialized receipt made the still-live input represented. The captured evidence was `retirementCandidateCounts: [0, 0]`, `markMaterializedCalls: 1`, and `receiptStates: ["materialized"]`.

    This does not delete source bytes, but it makes a pressure-blocked retirement non-retryable after measurement recovers. It violates the designed unusable-pressure lifecycle and is above the user-directed fresh-review threshold. Its remediation must be a new bounded Stage-1 round beginning with a full non-dry B-002 counterexample, followed by GREEN/refactor, the permanent pack, the full gates, and another fresh review. The finding is evidence; the precise fix remains for that remediation round to classify against ratified ground.

## Required Structural Inspection

- **Canonical descriptor:** verified one frozen `KNOWLEDGE_INDEX_RETRIEVAL` owns scopes, `text: ""` plus `KNOWLEDGE_RECORD_TYPES`, user-root resolution, and inventory-or-record projection with warnings in `lib/memory/knowledge-records.ts`. Injection and the project corpus source both consume it.
- **Required render input and renderer:** verified one `KnowledgeIndexRenderInput` requires both records and warnings; `renderKnowledgeIndex(input)` has one required argument; the pressure policy renders that same input directly.
- **Production handoff:** verified `createProjectCorpusConsolidationSource()` performs one bounded retrieval, derives its single `knowledgeIndex` contribution from `inventoryRecords` plus warnings, and keeps judgment records subject to the existing body ceilings. The collector rejects multiple render-input providers.
- **No private conversion or second retrieval:** verified `toIndexRecords` is removed and has no remaining use; no superseded renderer or pressure call form remains; the production corpus adapter has no second retrieval and no local reconstruction.
- **Dependency direction:** verified `lib/memory` does not import the knowledge-surface extension. The extension depends inward on memory-owned descriptor and input/result contracts.
- **Parent carriers:** verified all six exact parent B-012/B-016/B-021 marker/name carriers remain, including both B-021 tests. The `lib/memory/types.ts` full-source SHA-256 is re-pinned at `d65ff19c00d28a5b8d03e697b235a19d7e6eca26cfa73bc3c97a0364ff103aea`; the frozen receipt-floor, retirement/byte-authority, and fail-closed validation checks remain green.
- **Scope and closed ground:** verified the Stage-1 commit changes only permitted implementation directories and mirrored tests. It does not touch `knowledge/`, `lib/memory/retirement-store.ts`, D-026 tests, documentation, configuration, architecture records, or parent plan artifacts.

## Structural Gate Status

No executable structural-analysis capability is registered in this reviewer session, so no executable structural evidence exists for any bindable gate below. The complete permitted diff was inspected by hand. Absence of tool findings is **not** a passing structural result.

| Gate | Status | Review evidence |
|---|---|---|
| `mutation` | **degraded/unbound** | Counterexample strength inspected manually; SR-001 identifies a missing negative control. |
| `duplication` | **degraded/unbound** | Query, renderer, render-input construction, retrieval, and removed conversion call sites inspected manually. |
| `complexity` | **degraded/unbound** | Pressure resolution, retirement gating, receipt filtering, and receipt materialization branches inspected manually. |
| `boundary-conformance` | **degraded/unbound** | Diff paths and import direction inspected manually. |
| `dead-code` | **degraded/unbound** | Scoped references for `toIndexRecords`, descriptor, input/result types, renderer, and pressure call forms inspected manually; no repo-wide sweep was performed. |

## Verification

- Permanent measurement pack: **pass**, 5 tests — B-001, B-002, B-003, and both exact parent B-021 carriers.
- `bun run test`: **pass**, 262 files and 3,058 tests.
- `bun run lint`: **pass**, 579 files checked with no fixes.
- `bun run typecheck`: **pass**.
- `git diff --check`: **pass**.
- Live corpus guard before and after review: **pass**, 237 files and tree SHA-256 `adc3ef70a5e75cad8813db9a3ab954d4da84ebfeafbb75703529048007469932` both times.

## Assessment

The Stage-1 implementation closes the round-6/round-7 query, projection, renderer-input, and warning-byte divergences, and the required permanent pack and full project gates are green. It may not advance: SR-001 is an unresolved medium finding in the newly added unusable-pressure path. Per the ratified review threshold, a new bounded Stage-1 remediation round and another fresh review are required before Stage 2.

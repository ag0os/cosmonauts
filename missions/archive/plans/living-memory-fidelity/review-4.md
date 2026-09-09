# Stage 2 Fresh Structural Review: living-memory-fidelity

- Date: 2026-09-07
- Task: `TASK-634`
- Reviewed range: `df6d50f..7f726fa` (`7f726fa^..7f726fa`, the complete Stage-2 implementation diff)
- Reviewer context: Stage 1 replaced lossy reconstruction with the exact render input; the prior round-7 fix still treated warned omissions as absence
- Verdict: **blocked — one unresolved high finding and one unresolved medium finding; Stage 2 may not hand off**

## Findings

- id: SR-002
  dimension: lifecycle-invariant
  severity: high
  title: "An explicit incomplete inventory can claim completeness and authorize stale discharge"
  plan_refs: INV-002, D-003, B-005, Quality Contract assertions 3 and 8, Implementation Order step 12
  code_refs: lib/memory/consolidation-sources.ts:787-800, lib/memory/consolidation-sources.ts:868-873, lib/memory/living-memory.ts:211-235, tests/memory/living-memory.test.ts:4384-4397
  description: |
    The custom-source contract rejects `inventoryComplete: true` only when `omitted > 0` and the inventory is absent or too short. It never verifies that an explicitly supplied inventory contains the source's admitted current records, and it does not validate unique evidence coverage for the claimed omitted rows.

    A read-only counterexample supplied one valid current record, `inventory: []`, `inventoryComplete: true`, and `omitted: 0`. `collectConsolidationSources()` accepted it as `inventoryComplete: true` with one admitted record and zero inventory rows. The full consolidator then crossed the completeness barrier and called `dischargeStale({ currentKeys: [] })` for a materialized receipt whose live input was that admitted record. Captured output was `{"kind":"noop","dischargeCalls":[[]],"details":{"sources":[{"sourceId":"custom","admitted":1,"omitted":0}],"writesCommitted":true}}`.

    The length-only negative test covers `omitted: 1` with no inventory, but not an explicit inventory that fails to represent admitted/current evidence. This leaves the exact absence-as-absence failure open at the contract-invalid-custom-source seam and can remove a still-live materialized receipt. Remediation must remain a bounded Stage-2 RED/GREEN/refactor round and receive another fresh review.

- id: SR-003
  dimension: warning-reporting
  severity: medium
  title: "Later failure paths overwrite source warnings instead of preserving them"
  plan_refs: D-003, Design section 2, Quality Contract assertions 3 and 8, Implementation Order step 12
  code_refs: lib/memory/living-memory.ts:170-185, lib/memory/living-memory.ts:251-256, lib/memory/living-memory.ts:371-375
  description: |
    Stage 2 appends frozen source warnings to details after collection, but the dry-run retirement-recovery failure replaces that array with only retirement warnings, and the unhealthy citation-inventory path likewise replaces it with only citation warnings.

    A read-only custom-source counterexample declared a complete inventory with one source warning, then returned a pending retirement recovery during dry-run inspection. The failed result retained only the retirement warning: `{"kind":"failed","reason":"Dry-run observes retirement state but never acquires a lock or performs recovery.","warnings":[{"path":"memory/retirement.md","message":"retirement warning"}]}`. The source warning was lost. This contradicts the Stage-2 promise that source warnings are surfaced and leaves warning reporting non-monotonic on later failure paths. Remediation must begin with a counterexample and stay in Stage 2.

## Outcome and Barrier Inspection

- **Healthy:** the production corpus and episode adapters explicitly return `inventoryComplete: true` when every selected input is inventoried; warning arrays are frozen and the aggregate ANDs source declarations.
- **Byte-deferred but inventoried:** valid oversized corpus metadata remains in the exact render input and liveness inventory while body admission is deferred; `inventoryComplete` remains true. The parent oversized-metadata B-021 carrier passed.
- **Warned corpus omission:** B-004 retains the project warning in source details and exact render input, counts the omitted path once, and makes both source and aggregate incomplete.
- **Malformed episode:** B-006 retains the relative path and digest in minimal inventory, increments `omitted`, reports the parse warning, and makes source and aggregate incomplete.
- **Contract-invalid custom source:** missing completeness and the tested `omitted: 1`/no-inventory claim fail closed, but SR-002 shows that an explicit inventory with no evidence coverage is accepted.
- **Completeness barrier:** for a declared incomplete aggregate, pressure is resolved first and retained; the barrier then returns before stale discharge, retirement inspection/authorization, represented-evidence/no-work conclusion, judgment, proposal persistence, receipt materialization, or episode finalization. Only the pre-collection empty retirement recovery call is permitted. B-005's spies cover these seams.
- **Earlier recovery:** B-005 confirms pre-collection source recovery `episodePrunes` and `writesCommitted: true` survive the incomplete failure. Pressure warnings and `source-inventory-incomplete` are reported on that path. SR-003 records the separate later-path warning overwrite.

## Parent Ownership and Scope

- All six exact parent carriers remain in place with unchanged marker/name pairs: one B-012 owner, three B-016 carriers, and two B-021 carriers. The Stage-2 diff adds only B-004/B-005/B-006 markers to their exact plan-declared tests.
- `lib/memory/types.ts` did not change, so no hash re-pin was required. Frozen receipt-floor, retirement/byte-authority, fail-closed output-validation, and existing marker checks passed in the full suite.
- The implementation diff changes only `lib/memory/consolidation-sources.ts`, `lib/memory/living-memory.ts`, and mirrored tests. It does not touch `knowledge/`, `lib/memory/retirement-store.ts`, retirement pathname sequencing, D-026 tests, CLI code, documentation, configuration, architecture records, or parent plan/spec artifacts.

## Structural Gate Status

No executable structural-analysis capability is registered in this reviewer session, so no executable structural evidence exists for any bindable gate below. The complete permitted diff was inspected by hand. Absence of tool findings is **not** a passing structural result.

| Gate | Status | Review evidence |
|---|---|---|
| `mutation` | **degraded/unbound** | B-004/B-005/B-006 and the permanent measurement/parent pack were inspected and rerun; SR-002 and SR-003 identify missing negative controls. |
| `duplication` | **degraded/unbound** | Completeness declarations, aggregate folding, warning copies, pressure input, and barrier consumers were inspected manually; no executable duplication evidence exists. |
| `complexity` | **degraded/unbound** | Collection validation, pressure resolution, the early barrier, discharge, represented/no-work, judgment/materialization, retirement, and recovery-detail paths were traced by hand. |
| `boundary-conformance` | **degraded/unbound** | Exact diff paths, import direction, parent ownership, and forbidden-path exclusions were inspected manually. |
| `dead-code` | **degraded/unbound** | Scoped references for `inventoryComplete`, source warnings, aggregate warnings, and barrier consumers were inspected manually; no repo-wide sweep was performed. |

## Verification

- Stage-2 behaviors, permanent Stage-1 measurement pack, and all parent B-016/B-021 carriers: **pass**, 3 files and 11 tests. Command:

  ```sh
  bun x vitest run tests/memory/consolidation-sources.test.ts tests/memory/living-memory.test.ts tests/extensions/architecture-memory.test.ts -t 'marks corpus inventory incomplete when retrieval omits a warned record|counts malformed episodes as omitted incomplete inventory|keeps receipts and blocks dependent work when corpus inventory is incomplete|matches pressure to injection for both round-7 divergence directions|marks pressure unusable instead of reporting a false fit without an exact render input|counts injected knowledge warnings in measured index bytes|rehydrates accepted judgment and persisted evidence then converges to noop|retains a live receipt when a later pass exhausts its record limit|retains a live receipt when a later pass exhausts its byte allowance|measures index pressure with the exact injection renderer and budget|measures oversized corpus metadata exactly as combined-context injection'
  ```

- `bun run test`: **pass**, 262 files and 3,061 tests.
- `bun run lint`: **pass**, 579 files checked with no fixes.
- `bun run typecheck`: **pass**.
- `git diff --check` and `git diff --check df6d50f..7f726fa`: **pass**.
- Live corpus guard before and after review: **pass**, 237 files and tree SHA-256 `adc3ef70a5e75cad8813db9a3ab954d4da84ebfeafbb75703529048007469932` both times, using exactly:

  ```sh
  find knowledge -type f | sort | xargs shasum -a 256 | shasum -a 256
  find knowledge -type f | wc -l
  ```

## Assessment

The production healthy, byte-deferred, warned-omission, malformed-episode, incomplete-barrier, pressure, and earlier-recovery paths behave as intended, and all mandated executable gates are green. Stage 2 nevertheless remains blocked: SR-002 lets a structurally incomplete custom-source inventory cross the barrier and authorize discharge, while SR-003 loses source warnings on later failure paths. Per D-010 and the review threshold, both findings require a bounded Stage-2 remediation beginning with counterexamples and another fresh structural review before Stage 3 may begin.

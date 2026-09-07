# Stage 2 Round 2 Fresh Structural Review: living-memory-fidelity

- Date: `2026-09-07`
- Task: `TASK-645`
- Reviewed range: `df6d50f..cccab9c` (the complete permitted Stage-2 implementation diff: original completeness work `7f726fa` plus SR-002/SR-003 remediation `cccab9c`)
- Reviewer context: six of seven parent rounds' fixes introduced a fresh defect. In this plan, the Stage-1 remediation introduced SR-001, a vacuous-truth receipt materialization, and the Stage-2 completeness work introduced SR-002, where an explicitly empty inventory could claim completeness and discharge a live receipt. Fixes in this code have reliably introduced regressions, so this review looked for what the SR-002/SR-003 fixes broke, not only whether those findings closed.
- Verdict: **pass — zero unresolved high or medium findings; Stage 2 may close and Stage 3 may begin**

## Findings

No high or medium findings.

## SR-002 Closure and Regression Inspection

- The complete-inventory contract now validates after every returned record has been normalized. When an explicit inventory is present, every admitted record's `scope/path/digest` evidence key must appear in it, and the distinct inventory-key count must cover the admitted records plus the source's declared omissions (`lib/memory/consolidation-sources.ts:787-887`). The check is no longer conditional on `omitted > 0`.
- A custom source returning one admitted current record with `inventory: []`, `omitted: 0`, and `inventoryComplete: true` now throws `ConsolidationSourceContractError` before collection can return. The retained regression verifies the failed result, verifies `dischargeStale` was never called, and verifies the live materialized receipt remains present (`tests/memory/living-memory.test.ts:4850-4908`). No discharge, represented-evidence conclusion, judgment/proposal work, receipt materialization, episode finalization, or retirement authorization can proceed from the invalid claim.
- The opposite boundary remains open for healthy input: `records: []`, `inventory: []`, `omitted: 0`, and `inventoryComplete: true` aggregates as complete (`tests/memory/consolidation-sources.test.ts:488-514`). The dry-run warning regression uses the same empty-and-healthy shape and reaches retirement inspection, independently showing that the completeness barrier does not wedge it (`tests/memory/living-memory.test.ts:4910-4957`). The fix therefore distinguishes empty-and-healthy from empty-but-lying in both directions.
- Inventoried byte deferrals remain complete: parsed metadata stays in the liveness inventory and exact render input even when bodies are not admitted. The full production-source and parent oversized-metadata cases remain green. Warned unreadable/unparseable paths and malformed episodes remain incomplete instead of being mistaken for byte-deferred but inventoried inputs.

## SR-003 Closure and Warning-Monotonicity Inspection

After source warnings are frozen and appended at `lib/memory/living-memory.ts:170-185`, every downstream result seam preserves them:

- **Success and later retirement results:** deterministic and model result assembly append retirement warnings to `details.warnings` (`lib/memory/living-memory.ts:476-510`, `lib/memory/living-memory.ts:861-913`).
- **Completeness-barrier failure:** the barrier spreads the accumulated details and adds only a decline, so the propagated warning survives unchanged (`lib/memory/living-memory.ts:211-229`).
- **Dry-run retirement-recovery failure:** retirement warnings are appended rather than substituted (`lib/memory/living-memory.ts:247-265`); the retained regression observes source then retirement warning in that order.
- **Unhealthy citation inventory:** citation warnings are appended rather than substituted (`lib/memory/living-memory.ts:362-387`); the existing citation-inventory regression now carries a source warning through the successful blocked-retirement result.
- **Error wrap and details reconstruction:** the inner catch returns the current details, changing only `writesCommitted` when required (`lib/memory/living-memory.ts:922-930`), and outer lock-release reconstruction spreads the returned details before changing recovery (`lib/memory/living-memory.ts:950-964`). No post-propagation reconstruction assigns a fresh warning array without spreading the accumulated warnings.

SR-003 is closed across success, barrier failure, dry-run retirement-recovery failure, unhealthy citation inventory, error wrapping, and details reconstruction. The remediation introduced no new warning-loss branch.

## Complete Source and Barrier Review

- **Healthy production corpus:** returns a frozen complete inventory, no warnings, and the exact canonical knowledge-index render input; project mutation candidates and user index metadata remain separated as before.
- **Byte-deferred but inventoried corpus:** per-record, aggregate-byte, and record-count body deferrals preserve parsed metadata in inventory and remain complete; they do not collapse into warned corpus omission.
- **Warned corpus omission:** unreadable, unparseable, or otherwise uninventoried warned paths make the source and aggregate incomplete, retain the warning in source details and the render input, and count distinct omitted project paths once.
- **Malformed episode:** readable invalid bytes retain a minimal path/digest inventory row, increment `omitted`, emit the parser warning, and set completeness false.
- **Contract-invalid custom source:** missing completeness, omitted-without-inventory, explicit inventory missing admitted evidence, invalid warning/inventory data, over-limit output, duplicate ids, unsafe paths, invalid digests, and multiple knowledge-index providers fail closed.
- **Empty-and-healthy source:** zero records, zero omitted, and empty inventory remains explicitly complete and crosses the barrier.
- **Barrier seams:** pressure is still measured and reported first. An incomplete aggregate then returns before stale receipt discharge, represented-evidence filtering/no-work conclusion, retirement inspection/authorization, judgment, proposal persistence, receipt materialization, episode finalization, or any non-empty retirement application. Pre-collection recovery is the sole permitted earlier durable work, and its details remain reported on the failed barrier path.

## Parent Ownership and Scope

- All six exact parent carriers remain in place with unchanged marker/name pairs: one B-012 owner, three B-016 carriers, and two B-021 carriers. The full Stage-2 implementation changes only `lib/memory/consolidation-sources.ts`, `lib/memory/living-memory.ts`, and mirrored tests in `tests/memory/`, `tests/extensions/`, plus the earlier Stage-2 review record/state artifacts.
- `lib/memory/types.ts` did not change in Stage 2, and its current full-source SHA-256 `d65ff19c00d28a5b8d03e697b235a19d7e6eca26cfa73bc3c97a0364ff103aea` matches the profile-playbooks seam pin. Frozen receipt-floor, retirement/byte-authority, fail-closed model-output validation, and existing behavior-marker assertions remain green.
- The reviewed implementation does not touch live `knowledge/`, `lib/memory/retirement-store.ts`, retirement pathname sequencing, D-026 tests, CLI production code, documentation, configuration, architecture records, or either parent plan/spec. D-026 was neither reopened nor given another verification layer. This review task adds only this next-unused review record; Drive-owned task-state updates remain outside the reviewer-authored implementation scope.

## Structural Gate Status

No executable structural-analysis capability is registered in this reviewer session, so no executable structural evidence exists for any bindable gate below. The complete permitted diff was inspected by hand. Absence of tool findings is **not** a passing structural result.

| Gate | Status | Manual review evidence |
|---|---|---|
| `mutation` | **degraded/unbound** | Inspected the retained SR-002/SR-003 negative controls, both empty-inventory directions, Stage-1/Stage-2 behavior packs, and all parent carriers; no executable mutation evidence exists. |
| `duplication` | **degraded/unbound** | Inspected source completeness declarations, evidence-key coverage, aggregate folding, warning propagation, pressure input, and barrier consumers; no second query, renderer, local projection, completeness path, or warning accumulator was introduced. |
| `complexity` | **degraded/unbound** | Traced source validation, pressure, barrier, discharge, retirement inspection, represented/no-work, deterministic/model results, error wrapping, and lock reconstruction by hand; no executable complexity evidence exists. |
| `boundary-conformance` | **degraded/unbound** | Inspected the exact implementation paths, import direction, parent ownership, forbidden-path exclusions, and review-record numbering manually. |
| `dead-code` | **degraded/unbound** | Scoped references for `inventoryComplete`, source warnings, aggregate warnings, the barrier, canonical render input, and removed `toIndexRecords` were inspected; no repo-wide dead-code sweep was run. |

## Verification

- Focused Stage-1/Stage-2, SR-002/SR-003, source-outcome, barrier, and exact parent-carrier pack: **pass**, 4 files and 19 executed tests.
- `bun run test`: **pass**, 262 files and 3,064 tests.
- `bun run lint`: **pass**, 579 files checked with no fixes.
- `bun run typecheck`: **pass**.
- `git diff --check` and `git diff --check df6d50f..cccab9c`: **pass**.
- Live corpus guard before and after review: **pass**, 237 files and tree SHA-256 `adc3ef70a5e75cad8813db9a3ab954d4da84ebfeafbb75703529048007469932` both times, using exactly the repository-root commands required by the plan.

## Assessment

The complete Stage-2 diff now preserves the intended distinction between a genuinely empty healthy source and a source that lies about an empty inventory. SR-002 is closed before discharge can observe the invalid inventory, and SR-003 is closed across every post-propagation warning seam. The fixes preserve healthy and byte-deferred sources, keep warned omissions and malformed episodes fail-closed, and leave the aggregate barrier and parent contracts intact. No new high or medium defect was found. Stage 2 may close and Stage 3 may begin.

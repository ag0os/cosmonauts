# Closure review 2 — third channel: Kimi K2.5 via opencode (read-only Plan mode, light pass)

Shepherd ran this channel independently of the coordinator, as a third, extra-family data point beside the D-002/D-034 channels (Claude Opus attack execution; codex `gpt-5.6-sol` spec conformance). It is data to triage, not a gate. Source: `.shepherd/work/in-progress/qm-chain-safety/kimi/review.md` (copied verbatim below).

**Kimi verdict: SHIP. It finds all five INVs delivered.**

## Coordinator dispositions (2026-09-24)

| Kimi item | Disposition | Reason |
|---|---|---|
| HIGH-1: ABA race in the two-sample snapshot check | **Residual (D-027, hostile or timing only)** | An edit that changes the source and then restores it between samples leaves the reviewed bytes equal to the source. A same-digest collision is not an accidental event. Closure-review-1 executed the ordinary edit-between-samples attack, which refuses or converges as designed. |
| HIGH-2: temp workspace left behind after a process crash | **Liveness residual → execution-liveness (D-023)** | Crash-time cleanup of QM descendants and the private clone belongs to execution-liveness (TASK-712..719). D-023 requires it to register this plan's clone and processes. Both real e2e runs showed workspace disposition `removed` on normal exit. |
| MEDIUM-1: `leadingFindingId` may miss unusual IDs | **Not a finding** | `ISSUE-123` and `BUG-456` match `[A-Za-z]+-\d+`. An entry the host cannot map fails safe (carried over with a human item: D-031 floor 2, D-032). |
| MEDIUM-2: duplicate family aliases after the merge | **Not a finding** | A duplicate alias does not change membership tests. Cosmetic. |
| MEDIUM-3: hard-coded gate-owned paths could drift | **Accepted: cheap pin test** | A test asserts that every hard-coded gate-owned path in `isGateOwnedFile` exists in the repository, so a rename fails CI. Scheduled with the next remediation batch. |
| LOW-1: `package.json` parse without validation | **Not a finding** | `configuredPackageScriptsChanged` catches every parse error and returns `true`, which becomes a gate-owned human item. It fails safe. |
| LOW-2: misleading error reason on abort during capture | **Residual (cosmetic)** | The verdict and refusal are correct; only the message text can be less specific. |
| LOW-3: timed-out reviewer child not cancelled | **By design (D-011), execution-liveness** | Ratified: timed-out panel children are not cancelled here. Orphan cleanup is execution-liveness scope. |
| Over-engineering notes (calibration, material digests, three-phase sampling) | **Recorded; no action** | These are deliberate. D-031 and D-032 make calibration defense in depth with fail-safe floors. The material digests and sampling carry INV-001 and INV-002 evidence under D-027. |

## Kimi review (verbatim)

KIMI-REVIEW-START

## Invariant Delivery Assessment

**INV-001 - Review does not mutate: DELIVERED**
- Private local clone created in OS temp directory (quality-review-workspace.ts:104-150, `createPrivateReviewWorkspace`)
- Read-only Git operations with `GIT_OPTIONAL_LOCKS=0` (quality-review-workspace.ts:62, quality-review-run.ts:1503,1511)
- Restricted tool profile enforced via `qualityReviewProfileFor` (session-assembly.ts:92-111) and `enforceQualityReviewProfile` (quality-review-profile.ts:13-23)
- QM receives only: read, grep, find, ls, analysis tools, and spawn_agent limited to 4 lenses
- No bash, edit, write, chain_run, Drive, or task/plan mutation tools for quality sessions

**INV-002 - Records belong to their run: DELIVERED**
- Unique run ID per QM run: `qm-${randomUUID()}` (quality-review-run.ts:181)
- Artifacts isolated to `missions/sessions/chain/runs/<runId>/artifacts/qm/` (gitignored per .gitignore)
- Plan summary uses unique path with exclusive create: `missions/plans/<slug>/qm-runs/<runId>.md` (quality-review-run.ts:1686-1693 with `flag: "wx"`)
- No shared `missions/reviews/*-round-N.md` files written (B-003, B-012; confirmed by grep)

**INV-003 - Verdict outlives conversation: DELIVERED**
- Provisional complete report written before fallible work (quality-review-run.ts:237-259)
- Atomic replacement before return via `replacePlanSummary` (quality-review-run.ts:1697-1706)
- Lifecycle events persisted to both `lifecycle.jsonl` and run events (quality-review-run.ts:193-218)
- Complete final report including refusal, failure, and cancellation cases (closure-e2e.md confirms)

**INV-004 - Authority lists bind every path: DELIVERED**
- `isSubagentAllowed` central predicate (authorization.ts:9-28)
- `chain_run` authorizes every step via `chainDenial` (chain-tool.ts:79-96)
- `spawn_agent` propagates quality context and validates (spawn-tool.ts, agent-spawner.ts)
- `run_driver` requires `worker` authority (driver-tool.ts:96-126)
- QM subagents limited to exactly 4 lenses: reviewer, security-reviewer, performance-reviewer, ux-reviewer (quality-review-profile.ts)

**INV-005 - Gates judge the change and cannot be silenced: DELIVERED**
- Three baselines passed to changed-scope audit: `--dead-code-baseline`, `--health-baseline`, `--dupes-baseline` (D-008)
- Base-owned suppression registry loaded from base revision (suppression-policy.ts, check-new-suppressions.ts)
- Gate-owned file changes detected as human items (quality-review-run.ts:1522-1534, `isGateOwnedFile`)
- Same-change registry edits do not authorize (D-009)

---

## Findings (Correctness and Liveness Defects)

### HIGH-1: Race condition in workspace snapshot verification
**Location:** lib/orchestration/quality-review-workspace.ts:104-150 (`sample` function)
**Scenario:** The implementation samples the source, then materializes, then re-samples to verify. Between the initial sample and re-sample, a rapid edit could change the source. The re-sample compares digests, but if the file changed and then changed back (or changed to a collision), the verification could pass with stale data.
**Why tests miss it:** The test would require sub-millisecond timing or file system manipulation between two sample calls. The e2e test (closure-e2e.md) ran successfully but didn't test concurrent modification scenarios.

### HIGH-2: Missing cleanup on process crash during workspace removal
**Location:** lib/orchestration/quality-review-run.ts:288-316
**Scenario:** If the process crashes between `phase("workspace-reserved")` and successful workspace removal, the temp directory remains. While the OS temp cleaner may eventually remove it, sensitive review materials could persist longer than intended.
**Why tests miss it:** Requires simulating a SIGKILL or power loss during workspace removal, which unit tests don't typically do.

### MEDIUM-1: `calibrateReviewerFindings` regex may miss malformed finding IDs
**Location:** lib/orchestration/quality-review-models.ts:287-291 (`leadingFindingId`)
**Scenario:** The regex `/^(?:\[P[0-3]\]\s*)?(?:\*\*|`)?(?!(?:TASK|AC|D|INV|B)-)([A-Za-z]+-\d+)\b/` assumes finding IDs follow a specific pattern. If a reviewer creates a finding with an ID like `ISSUE-123` or `BUG-456`, it may not match expected patterns elsewhere, causing the finding to be silently omitted or mishandled.
**Why tests miss it:** Tests likely use canonical finding IDs; edge cases with unusual ID formats aren't exercised.

### MEDIUM-2: Potential double-resolution of model families
**Location:** lib/orchestration/quality-review-models.ts:36-58
**Scenario:** The `modelFamily` function merges shipped families with extensions, but the merge logic `...(shippedFamilies[family] ?? []), ...aliases` could cause duplicate entries. While not immediately harmful, this could lead to subtle matching issues.
**Why tests miss it:** Duplicate aliases don't cause visible failures in normal operation; it's a code smell not a functional bug.

### MEDIUM-3: `isGateOwnedFile` hardcoded paths may drift
**Location:** lib/orchestration/quality-review-run.ts:1522-1534
**Scenario:** The gate-owned file list includes hardcoded paths like `"scripts/check-new-suppressions.ts"` and `"lib/quality/suppression-policy.ts"`. If these files are renamed or moved, the gate-owned detection silently breaks.
**Why tests miss it:** Tests would need to verify the existence of these files at runtime; static analysis might not catch drift.

### LOW-1: `configuredPackageScriptsChanged` JSON parsing without schema validation
**Location:** lib/orchestration/quality-review-run.ts:1549-1564
**Scenario:** The function parses package.json without validating the structure. A malformed package.json could throw or return unexpected results, potentially misreporting gate-owned status.
**Why tests miss it:** Valid package.json is assumed; malformed inputs aren't part of normal test suites.

### LOW-2: Timeout race in `prepareSnapshot` error handling
**Location:** lib/orchestration/quality-review-run.ts:314-319
**Scenario:** The check `if (options.signal?.aborted) throw error;` re-throws the original error if aborted, but this happens after the snapshot attempt. If the abort happens during the capture, the error reason may be misleading.
**Why tests miss it:** Timing-dependent; requires precise signal delivery during capture.

### LOW-3: Reviewer timeout doesn't propagate cancellation to child
**Location:** lib/orchestration/agent-spawner.ts: timing-related code
**Scenario:** Per D-011, timed-out panel children are never cancelled. This is intentional per execution-liveness AC-015, but if a child hangs indefinitely, it could accumulate orphan processes.
**Why tests miss it:** The behavior is documented as intentional (D-011), so tests may not verify process cleanup.

---

## Over-Engineering Assessment

1. **Report calibration complexity (quality-review-report.ts:86-121, quality-review-models.ts:102-148):** The calibration system with regex-based finding ID extraction, priority capping, and cross-lens closure evidence checking is complex. For the accidental-damage threat model, simpler host-enforced rules (e.g., "any P0/P1 blocks ready, period") might suffice. The heuristic parsing of free-form reviewer text is inherently fragile.

2. **Material digest verification (quality-review-run.ts:1566-1609):** The digest-before/verify-after pattern for review materials is thorough but may be overkill. If the private workspace is truly isolated (INV-001), materials tampering would require host compromise, which is outside the threat model.

3. **Three-phase sampling (quality-review-workspace.ts:104-150):** The sample-materialize-verify pattern adds complexity. A single atomic snapshot (e.g., git bundle) might achieve similar assurance with less code.

---

## Verdict: SHIP

The implementation correctly delivers all five invariants (INV-001 through INV-005) as specified. The architecture is sound: private clones enforce isolation, restricted tool profiles prevent mutation, unique run IDs ensure record ownership, provisional reports guarantee durability, and authority checks bind every orchestration path.

The HIGH findings are edge cases in timing and crash recovery that don't compromise the core safety guarantees under the accidental-damage threat model. The MEDIUM and LOW findings are code quality issues that should be tracked for future improvement but don't block shipment.

The closure e2e evidence (closure-e2e.md) demonstrates real runs holding INV-001 (byte-identical checkout) and INV-003 (complete verdict on deadline failure). The branch is ready to merge.

KIMI-REVIEW-END

# Stage 8 review 2 — codex

The prompt is `stage8-review-2-prompt.md`. Reviewed HEAD `81fde23` (TASK-759 at `6240a21`). Final message verbatim:

## Stage 8 verdict: **SHIP**

**Findings:** No HIGH, MEDIUM, or LOW correctness or liveness finding in this focused re-review.

| Stage 8 review 1 finding | Disposition | Evidence |
|---|---|---|
| Claude MEDIUM-1 — spawning guidance | **RESOLVED** | [spawning.md](/Users/cosmos/Projects/cosmonauts/domains/shared/capabilities/spawning.md:16) routes QM findings through tasks, Drive, and independent review; [line 22](/Users/cosmos/Projects/cosmonauts/domains/shared/capabilities/spawning.md:22) tells callers to read the report, not look for QM code changes. |
| Claude MEDIUM/LOW-2 — Fallow guidance | **RESOLVED** | [fallow-workflow-integration.md](/Users/cosmos/Projects/cosmonauts/docs/fallow-workflow-integration.md:299) describes a review-only QM and caller-owned remediation. |
| Claude LOW-3 — review-base wording | **RESOLVED** | [implement-plan.md](/Users/cosmos/Projects/cosmonauts/external-commands/implement-plan.md:50) gives the correct ref priority and asks callers to check the reviewed range. [findReviewBase](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-workspace.ts:325) selects that ref; [the workspace code](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-workspace.ts:399) then takes its merge-base with captured HEAD. The prose is accurate, though it omits that last detail. |
| Claude LOW-4 — roadmap | **RESOLVED** | [ROADMAP.md](/Users/cosmos/Projects/cosmonauts/ROADMAP.md:271) now describes the viewer work without presenting shared-name overwrites as current behavior. |
| Codex MEDIUM — named-chain entry-point coverage | **RESOLVED** | [named-qm-entry.test.ts](/Users/cosmos/Projects/cosmonauts/tests/cli/run/named-qm-entry.test.ts:105) enters through `run chain` and shipped name resolution. `verify` reaches durable [runStart](/Users/cosmos/Projects/cosmonauts/lib/orchestration/durable-chain-runner.ts:144); the test checks its report artifact and file at [lines 122–151](/Users/cosmos/Projects/cosmonauts/tests/cli/run/named-qm-entry.test.ts:122). |

The broad search across the requested live surfaces found no affirmative claim that QM fixes code, re-verifies, runs a fixer, writes `qm.md`, completes a plan, or leaves a clean tree. Historical material was excluded under D-022.

**Mutation checks, in `/tmp` only:** the unmodified focused test passed 2/2. Appending `fixer` after `verify` failed its test with “Quality Manager must be a terminal sequential stage.” Replacing the durable review output with an empty report failed with “Missing required report section”; dropping its result artifact also failed the `qm/final.md` assertion. The production defaults still call the original executor at [subcommand.ts:60](/Users/cosmos/Projects/cosmonauts/cli/run/subcommand.ts:60), and `qualityReview` reaches both the inline and durable runners through [chain-execution.ts:62](/Users/cosmos/Projects/cosmonauts/cli/chain-execution.ts:62).

**Regressions and residuals:** TASK-759 leaves the archive and Stage 1–7 runtime work untouched. The coordinator reports a passing changed-scope audit at `81fde23`, typecheck, tracked lint, and 3408/3408 tests; I independently ran only the focused scratch test. It stubs the QM review and agent spawning, so it does not exercise external agents. The repository remains clean.

**Hostile-only routes under D-027:** deliberate Git or review-material tampering, detached-process escape, and crafted marker or path inputs.

# Stage 7 review 3 — codex

The prompt is `stage7-review-3-prompt.md`. Reviewed HEAD `50b53d6` (TASK-748 at `953d0f9`). Final message verbatim:

## Stage 7 verdict: **DO-NOT-SHIP-YET**

TASK-748 resolves the named single-entry parsing cases and makes a clean report with only out-of-range findings or evidenced dismissals able to reach `ready`. Two ordinary report shapes still permit a false `ready`, and one leaves an unsupported P0 visible without a human item.

### Findings

1. **HIGH — A prose finding can reach `ready`.** [qualityReviewSectionEntries](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-report.ts:208) extracts bullets only, while [hostResultsBlockReady](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:946) now checks only parsed open findings. I probed a valid report with `F-1 P2: null input crashes...` as a paragraph under `## Findings` and a reviewer reporting no findings: parsing returned no entries, calibration returned `openFindings: false`, and report assessment retained `ready`. With clean gates, checks and model evidence, the host permits that verdict. This breaks D-031’s no-false-`ready` floor. The pre-TASK-748 host checked whether Findings had *any* content.

2. **HIGH — An evidenced dismissal hides a second, open entry with the same ID.** [Calibration](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-models.ts:212) stores closure by ID; [readiness](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-models.ts:136) then treats every entry with that ID as closed. A scratch probe with `F-1 dismissed; closureEvidence: ...` followed by `F-1 open: empty input still crashes` returned no issues and `openFindings: false`. Clean host results therefore permit `ready` despite the explicit open entry. This breaks D-031’s no-false-`ready` floor.

3. **MEDIUM — A duplicate out-of-range P0 escapes the cap.** [Calibration](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-models.ts:164) selects the first entry for an ID and [caps Findings entries only](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-models.ts:128). With unsupported reviewer `PF-1 P0`, `PF-1 P2` in Findings, and `PF-1 P0` in Out-of-range observations, my probe left the observation at P0. The resulting `Performance ... capped at P2` issue is routed to Findings, [not to Human decisions](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:912). This breaks D-031’s P0/P1 cap.

### Stage 7 review 2 dispositions

| In-scope item | Status | Evidence and pre-TASK-748 check |
|---|---|---|
| Codex 1: multiline priority | **RESOLVED** | Entries retain continuation lines at [report.ts:215](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-report.ts:215). The new [test](/Users/cosmos/Projects/cosmonauts/tests/orchestration/quality-review-models.test.ts:203) fails against the old parser, which supplied only the first line. |
| Codex 4: ID mentioned inside another entry | **RESOLVED** | [Leading-ID matching](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-models.ts:164) carries `F-1` when only `F-2 ... F-1` appears. The [test](/Users/cosmos/Projects/cosmonauts/tests/orchestration/quality-review-models.test.ts:223) fails against the old substring match. |
| Claude MEDIUM: Out-of-range home and reachable `ready` | **PARTIAL** | Single entries and evidenced dismissals work end to end in the [ready cases](/Users/cosmos/Projects/cosmonauts/tests/orchestration/quality-review-run.test.ts:1297); the old code carries them as omitted or blocks Findings content. Duplicate dismissal/open entries still permit false `ready` (finding 2). |
| Claude MEDIUM: unsupported P0 | **PARTIAL** | The [prompt](/Users/cosmos/Projects/cosmonauts/bundled/coding/prompts/performance-reviewer.md:160) and [cap](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-models.ts:259) cover a single P0; the new P0 tests fail on the old P1-only code. A duplicate observation escapes (finding 3). |
| Claude LOW: leading non-finding token | **PARTIAL** | The [TASK test](/Users/cosmos/Projects/cosmonauts/tests/orchestration/quality-review-models.test.ts:234) fails on old code and now passes. [The matcher](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-models.ts:235) still accepts `AC-013` and `D-031`: an out-of-range `AC-013: P1 guidance note` creates a spurious human item and blocks an otherwise clean `ready`. |
| Claude LOW: multiline cap rewrite | **RESOLVED** | [Entry replacement](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-report.ts:54) retains the tested detail lines. Both indexed and unindexed [cases](/Users/cosmos/Projects/cosmonauts/tests/orchestration/quality-review-report.test.ts:84) fail with the pre-TASK-748 parser and rewrite. |
| Claude LOW: unconfigured-diversity test | **OPEN** | The non-failing test was deleted. The duplicate path remains reachable through [model configuration](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:508) and [diversity’s human item](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:737); TASK-748’s requested mutation-sensitive replacement or documented reason for deletion is absent. |

The new assertions I checked fail against the combined pre-TASK-748 modules. The multiline model assertion alone would pass if handed a complete entry; its pre-fix failure depends on the old report parser. I did not execute the full suite.

The changed-scope Fallow audit against `main` **passed** with zero introduced issues. Typecheck, changed-file Biome check, and `git diff --check` passed. In the inspected paths, D-025’s host gate and human-item blocks, D-026’s review-before-check ordering, D-019’s not-configured items, base-owned configuration/runtime, and B-011’s model-family check remain in place. The eight non-`missions/` changed files stay within TASK-748’s scope.

**Residual — text recognition:** Measurement-looking code and a QM quote repeating same-lens closure evidence remain the recorded D-031 heuristic limits.

**Residual — hostile-only routes (unranked):** Deliberate tampering through reviewed code run by host checks, altered materials or Git objects, and fabricated or colluding review evidence remain outside D-027’s accidental-damage threat model.

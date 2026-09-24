---
kind: independent-review
plan: qm-chain-safety
channel: codex exec -m gpt-6-sol -c model_reasoning_effort=high --sandbox read-only
scope: Stage 7 focused, bfff951..(TASK-747 fde1063)
date: 2026-09-24
---

# Stage 7 review 2 — codex

The prompt is `stage7-review-2-prompt.md`. Final message verbatim:

## Stage 7 verdict: **DO-NOT-SHIP-YET**

TASK-747 fixes the specific unindexed, renumbered-ID, collision, and wiring cases from review 1. B-010 still has ordinary report and evidence cases that leave an unsupported P1 visible or accept a dismissal without independent evidence.

### Findings, ranked

1. **HIGH — A multiline unindexed finding escapes P1 calibration.** [quality-review-report.ts:206](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-report.ts:206) extracts only bullet lines, and [quality-review-models.ts:155](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-models.ts:155) checks P1 on that extracted line. I reproduced a report containing `- PF-2` followed by `priority: P1`, with the reviewer rating PF-2 P2: calibration returned no issue and left P1 visible. The nonempty Findings section still blocks `ready`, but the unsupported severity remains. **Breaks B-010 / AC-013.**

2. **MEDIUM — Measurement-looking code is still accepted as measured cost.** [quality-review-models.ts:257](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-models.ts:257) accepts a cost unit and measurement word anywhere in the quoted diff text. I reproduced `const measured = "20 ms";` as `measuredCost`; PF-1 remained P1 with no issue, although the quote is code rather than an observed cost. **Breaks B-010 / AC-013 under D-026.**

3. **MEDIUM — A QM dismissal can reuse its originating lens’s evidence.** [quality-review-models.ts:199](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-models.ts:199) accepts a report’s `closureEvidence` whenever its text occurs in the diff, without establishing a different lens or host verification. I reproduced a reviewer’s own `closureEvidence: fixed in lib/a.ts` repeated in `F-1 dismissed closureEvidence: fixed in lib/a.ts`; calibration returned no issue. **Breaks B-010 / AC-013.**

4. **MEDIUM — Mentioning an ID inside another finding defeats carry-forward.** [quality-review-models.ts:155](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-models.ts:155) treats any matching line as that finding’s report entry. With reviewer finding F-1 and only `F-2 P2: similar to F-1` in the report, I reproduced no carry-forward and no issue. F-1 has neither its own finding nor an evidenced dismissal. **Breaks B-010 / AC-013.**

5. **LOW — Some added tests cannot fail on pre-TASK-747 code.** The direct same-family test at [quality-review-models.test.ts:52](/Users/cosmos/Projects/cosmonauts/tests/orchestration/quality-review-models.test.ts:52) exercises a guard already present at `bfff951`; the valid-measurement test at [line 158](/Users/cosmos/Projects/cosmonauts/tests/orchestration/quality-review-models.test.ts:158) also passes under the old numeric-quote rule. They are useful guard and positive-control tests, but do not meet TASK-747’s stated pre-fix-failure requirement. **Test qualification for B-011 / AC-014 and B-010 / AC-013.**

### Review 1 finding dispositions

| Review 1 finding | Status | Pre-TASK-747 test check |
|---|---|---|
| Codex: unindexed unsupported P1 | **RESOLVED** for the reported single-line case by [visible findings extraction](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:897); multiline case above remains | [Unindexed run case](/Users/cosmos/Projects/cosmonauts/tests/orchestration/quality-review-run.test.ts:1425) would fail: old code supplied no findings |
| Codex / Claude: numeric code quote | **PARTIAL**; the named loop and constant are rejected, but measurement-looking code passes | [Quote cases](/Users/cosmos/Projects/cosmonauts/tests/orchestration/quality-review-models.test.ts:141) would fail under the old digit-only rule |
| Codex: QM-only dismissal | **PARTIAL**; omission is carried forward, but repeated same-lens evidence passes | [Dismissal case](/Users/cosmos/Projects/cosmonauts/tests/orchestration/quality-review-models.test.ts:185) would fail under old code |
| Codex: PF-1 / PF-10 collision | **RESOLVED** by [bounded ID matching](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-models.ts:221) and [report correction](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-report.ts:54) | [Collision test](/Users/cosmos/Projects/cosmonauts/tests/orchestration/quality-review-models.test.ts:125) would fail under old substring matching |
| Codex: same-family test misses its branch | **RESOLVED** as mutation coverage: configured and observed models now match while sharing the implementer family | The new test **passes** pre-TASK-747, but would fail if the existing same-family guard were removed |
| Claude: renumbered or QM-raised P1 | **RESOLVED** for tested single-line entries by [unmapped-P1 handling](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-models.ts:118) and the P2 cap | [Run cases](/Users/cosmos/Projects/cosmonauts/tests/orchestration/quality-review-run.test.ts:1423) would fail under old code |
| Claude: generalist model wiring untested | **RESOLVED** by the [spawn configuration test](/Users/cosmos/Projects/cosmonauts/tests/extensions/orchestration-spawn-inline-compiler.test.ts:31) | Would fail: old wiring used `params.model` |
| Claude LOWs: missing implementer, family extension, duplicate not-configured item, missing-generalist label | **RESOLVED** by [diversity handling](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:720), [family wiring](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:736), and [deduplication](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:855) | Their targeted new assertions would fail under old code |
| Claude LOW: tamper fixture took a diversity failure path | **RESOLVED** by its [resolvable diverse fixture](/Users/cosmos/Projects/cosmonauts/tests/orchestration/quality-review-run.test.ts:4204) | Fixture correction is not itself a pre-fix-failing behavior test |

**B-011 and Stage 1–6:** I found no regression in the host-observed reviewer-model path, base-owned config/runtime, D-025 ready blocking, or D-026 review-before-check ordering. The generalist override remains limited to `coding/reviewer`; shipped agent definitions are unchanged. Local Pi 0.80.6 resolution returns `anthropic/claude-sonnet-5` and `openai-codex/gpt-5.6-sol` with different providers and shipped families. Current Context7 guidance describes provider/model resolution, while the installed pinned catalog supplied the exact-version check.

**Verification:** The changed-scope Fallow audit against `main` returned `pass`; `tsc --noEmit` and Biome on changed tracked files passed. I used read-only probes and inspected pre-TASK-747 source to assess test sensitivity. I did not run the test suite, QM, a chain, or drive. The working tree remained clean.

**Hostile-only residuals, unranked (D-027/D-028):** Deliberately hostile reviewed code can use host-run preparation or checks to tamper with host state, materials, workspace, or Git objects; fabricated citations and colluding lenses remain possible.

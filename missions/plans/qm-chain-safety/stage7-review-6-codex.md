# Stage 7 review 6 — codex

The prompt is `stage7-review-6-prompt.md`. Reviewed HEAD `2c11b17` (TASK-751 at `7ed6c05`).

**Coordinator note:** codex reports no code findings. It says DO-NOT-SHIP-YET only because its sandbox could not run the changed-scope audit. The coordinator ran `npx fallow audit --base main` with the three committed baselines at `2c11b17`, and it returned `verdict: pass`. The same run found typecheck 0, tracked lint 0, suppressions passing, and a suite of 3364/3365, where the one failure is the known `project-tools-fallow-fixtures` timeout flake, which passes 10/10 in isolation. With that condition met, the coordinator reads this review as SHIP.

Final message verbatim:

## Stage 7 verdict: **DO-NOT-SHIP-YET**

**Code findings:** none at HIGH, MEDIUM, or LOW. I found no ordinary report shape in the reviewed calibration that produces a false `ready` or silently loses a reviewer finding ID. The remaining sign-off gap is verification: this role has no `analysis_status` or `analysis_audit` tool, so I could not independently confirm the required changed-scope audit at HEAD. The project’s *analysis* skill says to proceed without a substitute invocation when that tool is unavailable. TASK-751 records a passing audit, and the three committed baselines are unchanged by this diff, but that is not an independent audit result.

### Review-5 dispositions

| Review-5 item | Disposition | Evidence and test sensitivity |
|---|---|---|
| Codex 1 / Claude LOW-1: repeated sections | **RESOLVED** | A second defined heading blocks `ready` at [report.ts:254](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-report.ts:254) and [run.ts:956](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:956). Calibration preserves its content when the index is unavailable. The [report test](/Users/cosmos/Projects/cosmonauts/tests/orchestration/quality-review-report.test.ts:69) and [lifecycle cases](/Users/cosmos/Projects/cosmonauts/tests/orchestration/quality-review-run.test.ts:1327) fail on the pre-TASK-751 behavior; an in-memory comparison confirmed the old indexed rewrite dropped the second section. |
| Codex 2: non-performance-lens P0 | **RECORDED LIMIT under amended D-032** | The host cap remains keyed to the performance lens at [models.ts:252](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-models.ts:252), as D-032 now specifies. The generalist prompt adds P0 to its cost rule at [reviewer.md:162](/Users/cosmos/Projects/cosmonauts/bundled/coding/prompts/reviewer.md:162). This is a prompt change, not a new host test. |
| Claude LOW-2: unpinned closure guards | **RESOLVED** | The [no-raiser test](/Users/cosmos/Projects/cosmonauts/tests/orchestration/quality-review-models.test.ts:453) kills removal of the raising-lens guard; the [citation test](/Users/cosmos/Projects/cosmonauts/tests/orchestration/quality-review-models.test.ts:470) kills acceptance of a different citation. Both named mutations failed in-memory assertions. |
| Claude LOW-3: Human decisions sentinel and closing advice | **RESOLVED** | The [QM prompt](/Users/cosmos/Projects/cosmonauts/bundled/coding/prompts/quality-manager.md:35) now names `None recorded.` and places advice under Reviewed. The [host sentinel check](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-report.ts:237) already accepted that text before TASK-751; this was a prompt-only correction. |
| Claude LOW-4: generalist P1-only wording | **RESOLVED** | [reviewer.md:162](/Users/cosmos/Projects/cosmonauts/bundled/coding/prompts/reviewer.md:162) now says P0 **or** P1. The pre-TASK-751 text said P1 only. |
| Claude LOW-5: observation cap note appears in Findings | **RESOLVED** | The cap note is added to observations at [models.ts:268](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-models.ts:268), and [run.ts:912](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:912) excludes it from Findings. The [observation-only lifecycle case](/Users/cosmos/Projects/cosmonauts/tests/orchestration/quality-review-run.test.ts:1626) reaches `ready` with sentinel Findings; its placement assertions fail on pre-TASK-751 code. |

D-032’s Findings rule is enforced on the whole visible body: content beyond the case-insensitive `None recorded.` sentinel blocks `ready`, including prose and multiline entries ([report.ts:237](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-report.ts:237), [run.ts:954](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:954)). Reviewer IDs mentioned inside another entry are carried forward, and observation dismissals require matching evidence from a lens other than every raising lens ([models.ts:169](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-models.ts:169), [models.ts:192](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-models.ts:192)). The earlier **Findings-to-`false`** and **first-raising-lens-only** mutations still fail in-memory assertions; the corresponding lifecycle and model tests passed unchanged.

The focused suite passed **194/194** with stubbed assessments in temporary fixture repositories; no live QM model, chain, or drive was launched. Typecheck, changed-file Biome, and `git diff --check` passed. Those tests cover clean `ready` reports, observation-only and evidenced-dismissal `ready` paths, the performance cap, B-011 diversity, host-verified gates, D-019 not-configured items, D-026 ordering, and base-owned config/runtime. The repository state was unchanged; it still has the pre-existing untracked review prompt.

### Residuals

- **D-031 heuristics:** a measurement-looking code quote or a QM repetition of same-lens evidence can be misread; these are the recorded limits, not new findings.
- **D-032 placement:** an in-range finding placed under Out-of-range observations remains a QM judgment; non-performance-lens cost claims remain under the amended prompt-guidance limit.
- **Fail-safe formatting:** `None.` under Human decisions or a contentful new `## Next steps` section blocks `ready`; the revised QM prompt directs the ordinary clean format.
- **Hostile-only routes:** fabricated or colluding evidence, deliberate materials or Git tampering, steered completion order, and reviewed code executed by host checks remain outside D-027’s accidental-damage threat model.
- **Audit evidence:** TASK-751 reports a pass, but the changed-scope audit at HEAD remains independently unverified in this role.

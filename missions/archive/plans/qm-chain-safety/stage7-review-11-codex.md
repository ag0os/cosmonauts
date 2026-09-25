# Stage 7 review 11 — codex

The prompt is `stage7-review-11-prompt.md`. Reviewed HEAD `296db49` (TASK-756 at `9f3340c`). Final message verbatim:

## Stage 7 verdict: DO-NOT-SHIP-YET

### Findings

- **HIGH — A same-line index suffix can disappear while the host returns `ready`.** The new whole-line match does not recognize `<!-- COSMO_QM_REPORT {...} --> F-9 crash` ([report.ts:177](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-report.ts:177)). With an otherwise clean `ready` report, `Findings` remains empty and the after-index check also misses `F-9 crash` ([report.ts:312](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-report.ts:312), [run.ts:957](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:957)). On the unindexed host path, replacing `Reviewer models` can discard that suffix ([run.ts:1030](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:1030), [report.ts:365](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-report.ts:365)). A pure parser and amendment probe reproduced `indexAvailable: false`, no `ready` blocker, and loss of `F-9 crash`. At `2d1f305`, the after-index check sees the suffix and blocks `ready`. This regresses D-031 floor 1, D-025’s host-verified `ready`, and INV-003. It does not depend on a hostile change.

### Review-10 confirmation

The **codex MEDIUM** is resolved for normal host notices: the preamble lines are extracted into the summary ([run.ts:1667](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:1667)); the live-work summary assertion fails on `2d1f305`. The **codex LOW** about `Index unavailable.` after the index is resolved by insertion before the first section or index ([report.ts:55](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-report.ts:55), [report.ts:372](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-report.ts:372)); its placement assertions fail on `2d1f305`.

The **Claude MEDIUM** inline-marker truncation is resolved for inline mentions inside findings ([report.ts:41](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-report.ts:41)); both new inline-finding tests fail on `2d1f305`. The **Claude no-fallback residual** is resolved for an anchored index and for no index: the helper retains the notice with no heading in either case ([report.ts:59](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-report.ts:59)). Its new unit tests cannot run against `2d1f305` because that revision has no helper export.

The rebuilt **CRLF-duplicate test** addresses both reviewers’ coverage LOW against the older `5ddfd96` behavior, but **passes on `2d1f305`**: that revision already normalizes line endings and detects the duplicate heading. The new summary `Index unavailable.` assertion fails on `2d1f305` ([run.test.ts:3665](/Users/cosmos/Projects/cosmonauts/tests/orchestration/quality-review-run.test.ts:3665)).

### Index, preamble, and residuals

The host renderer emits its index on a separate line. `JSON.stringify` escapes embedded newlines, and a `-->` inside a JSON string does not break the current greedy line match; pure probes kept those indexes available ([report.ts:82](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-report.ts:82)). A QM-written multiline or same-line index becomes unindexed. A whole-line copy of the marker inside a multiline finding can also make a host-rendered report unindexed and truncate later findings from section-derived summaries; my probe reproduced this. That collision predates TASK-756.

The helper puts notices before the first recognized heading, or before a recognized index when there is no heading; with neither, it appends them. In the normal ready, not-ready, failed, refused, and cancellation paths, host disclosures reach the preamble before summary extraction ([run.ts:1154](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:1154), [run.ts:1667](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:1667)). D-026’s review-before-check ordering and D-028’s operator-authority disclosure are unchanged. The public run port without host checks remains the review-10 residual.

Hostile-only routes under D-027: deliberate materials or Git-object tampering, detached writers or process-group escape, and crafted path, note, or duplicate-marker inputs.

I ran only pure parser probes from `/tmp`; I did not run QM, a chain, Drive, or the suite. The coordinator reports the audit, typecheck, tracked lint, and 3385/3385 tests passing. The repository remains unchanged, apart from its pre-existing untracked review prompt.

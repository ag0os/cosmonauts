# Stage 7 review 3 — Claude subagent

Prompt: `stage7-review-3-prompt.md`. Reviewed `371e167..50b53d6` (TASK-748). Final message, condensed only by removing the probe-directory note at the end; findings verbatim.

**Verdict: DO-NOT-SHIP-YET.** TASK-748 resolves every in-scope review-2 item, and all 12 new tests fail on `371e167`. It also swapped the "any Findings content blocks `ready`" rule for a `- `-bullet-only entry parse, so ordinary non-bullet QM markdown now reaches `ready` with a real finding. That breaks hard floor 1.

## Findings

### HIGH

**H-1 — A Findings section not written as `- ` bullets no longer blocks `ready`.**
- **Where:** `lib/orchestration/quality-review-run.ts:946-948` replaced `hasQualityReviewSectionContent(markdown, "Findings")` (`git show 371e167:…quality-review-run.ts:939`) with `openFindings`. That value (`quality-review-models.ts:136-139`) sees only entries parsed by `qualityReviewSectionEntries` (`quality-review-report.ts:212-219`). The parser keeps only lines starting with `- ` and drops any text before the first `- ` bullet.
- **Consequences:**
  - A numbered list (`1. …`), a `*` or `+` bullet, or prose under `## Findings` yields zero entries, so `openFindings` is false. Leading prose before the first `- ` bullet is also dropped.
  - Any trailing paragraph or indented sub-bullet after an entry becomes a continuation line of that entry. If that entry is a dismissal closed by other-lens `closureEvidence`, the trailing text is carried along with it.
- **Accidental scenario, reproduced end to end in a scratch copy:**
  - Setup: TASK-748's own "reaches ready" run test, with F-1 in Out-of-range observations, clean checks and gate, and attested diversity.
  - Findings section: `1. lib/a.ts:1 QM-found null deref when list is empty (P1)`.
  - Result: final `qm/final.md` says `Verdict: ready`, with the P1 still in Findings and no human decisions.
  - `* QM-1 P1 …` and a prose paragraph also reach `ready`.
  - Written as `- QM-1 P1 …`, the same report gives `not-ready`.
  - Old code blocked all of these.
- **Breaks:** D-031 floor 1 (no false `ready`), the Design §5 terminal matrix ("findings … → `not-ready`") and the D-025 host-verified ready guarantee.
- **Fix direction:** any Findings content not accounted for by ID-keyed closed entries must block `ready`. For example, `openFindings || (hasQualityReviewSectionContent(markdown, "Findings") && parsed entries don't cover the body)`. Alternatively, keep the old rule and exempt only a body made entirely of closed leading-ID dismissal entries.
- **Test gap that let this through:** mutating `openFindings ||` to `false ||` at `quality-review-run.ts:948`, so Findings can never block `ready`, leaves the **full suite green (260 files, 3305 tests).** Mutation M12, removing the `!id ||` branch at `quality-review-models.ts:138` so ID-less entries never block, also survives. The floor has no test.

### MEDIUM

None.

### LOW

- **L-1 — A leading `AC-`/`D-` token, a bold or backticked ID, or a `[P2]` prefix is not recognised as an entry's ID.**
  - Where: `leadingFindingId` (`quality-review-models.ts:235-237`) skips only `TASK-`.
  - Scenario: observations such as `- AC-013 context: F-001 P2 …`, `- **F-001** P2 …` or `- [P2] F-001 …` treat F-001 as omitted. The host carries it over, raises a human item, and `ready` becomes unreachable.
  - This is fail-safe for both floors. The prompt never says the ID must lead the bullet, and before TASK-748 bold mapped, because matching was anywhere in the line.
  - Affects: TASK-748 AC #2 (reachable `ready`) and liveness.
  - Fix: tolerate leading markdown decoration and a `[Pn]` prefix, or tell the QM prompt to start each entry with the ID.
- **L-2 — The unindexed rewrite of a capped entry interprets `$` in the entry text.**
  - Where: `quality-review-report.ts:59` passes the entry as a `String.replace` replacement string, so `$$`, `$&`, `` $` `` and `$'` are expanded.
  - Reproduced: `PF-2 P1 costs $$ per call $& here` became `PF-2 P2 costs $ per call - PF-2 P1 costs $$ per call $& here here`, with the original P1 duplicated into the capped entry.
  - Affects: TASK-748 AC #1 ("preserves all its lines") and B-005.
  - Fix: `replace(search, () => replacement)`.
- **L-3 — AC #4 only partly met.**
  - The "unconfigured diversity appears once" test was deleted, with no reason recorded in the task or the commit.
  - A duplicate path is reachable: when `implementerModel` is present and `diverseReviewerModel` is unset, `modelConfigMissing` (`quality-review-run.ts:989-993`) and `diversityHumanItem` (`quality-review-models.ts:76-83`) produce the same string. Only the `Set` at `quality-review-run.ts:857` dedupes it.
  - The old test lacked an implementer model; a rewrite with one would have been genuine.
  - D-019 deduplication is now untested.
- **L-4 — Surviving mutations besides H-1.** Affects B-010 test qualification.
  - M6: the reviewer-section `priority: P0` check when the reported entry does not say P0 (`models.ts:264`).
  - M11: unmapped **P0** detection (`models.ts:124`).
  - M11b: the unmapped check over observations (`models.ts:122`).
  - M17: `independentlySupported` other-lens closure (`models.ts:215`). The in-range test supplies both kinds of evidence, so either passes.

## Dispositions of review-2 findings kept in scope

| Finding | Status | Evidence | Test fails on `371e167`? |
|---|---|---|---|
| Codex 1: multiline P1 escapes | **RESOLVED** | continuation-line entries at `report.ts:212-219`; cap by leading ID at `models.ts:127-133` | yes (`models.test.ts:203`, `report.test.ts:87` both variants) |
| Codex 4: mention inside another entry defeats carry-over | **RESOLVED** | leading-ID matching at `models.ts:164-166`, `235-237` | yes (`models.test.ts:223`) |
| Claude MEDIUM: out-of-range findings treated as omitted, `ready` unreachable | **RESOLVED as specified, but introduced H-1** | `models.ts:114`, `run.ts:910`, closures at `models.ts:212-224`, `openFindings` at `models.ts:136` | yes (`models.test.ts:243`, `run.test.ts:1310` ×3) |
| Claude MEDIUM: unsupported P0 not capped | **RESOLVED** (gaps in L-4) | `models.ts:122-133`, `187-201`, `259-268`; both prompts say "P0 or P1" | yes (`models.test.ts:260`, `:271`, `run.test.ts:1472`) |
| Claude LOW: diversity-once test cannot fail | **PARTIAL** (L-3) | deleted with no reason recorded; the duplicate path is reachable | n/a |
| Claude LOW: leading `TASK-` read as an ID | **RESOLVED** for `TASK-`; **PARTIAL** for `AC-`/`D-` (L-1, fail-safe) | `models.ts:236` | yes (`models.test.ts:234`) |
| Claude LOW: capped rewrite keeps only the first line | **RESOLVED** (`$` issue is L-2) | `report.ts:54-60` | yes (`report.test.ts:87`) |

All 12 new tests fail against the `371e167` `lib/` and `bundled/` files. The new tests catch mutations M1, M2, M3, M5, M7, M8, M13, M14, M16 and M18.

## What holds

- **D-031 floor 2:** no ordinary shape found that loses a reviewer finding ID. Unparseable or misplaced IDs are carried over and raise a human item.
- **P0/P1 cap:** applies in Findings, indexed and unindexed. An unsupported performance P0/P1 in observations becomes a human item. Both prompts state the rule.
- **Stages 1–6 and B-011:** no regression in D-025 (host human items block `ready`; QM-written Human decisions still block), D-026 ordering, D-019 in code, base-owned runtime and config, or B-011.
- **Gates:** the changed-scope Fallow audit against the merge-base with `main`, using the committed baselines, gave `pass` with 0 issues. `tsc --noEmit` passes. Biome passes on changed tracked files. The 3 QM test files pass (134 tests).
- **Scope:** no creep beyond TASK-748.

## Residuals (one line each)

- D-031 recorded limits: measurement-looking code accepted as `measuredCost`; the QM repeating same-lens `closureEvidence`.
- A QM finding that reuses a reviewer's ID makes the reviewer's finding look reported (the old code behaved the same).
- Reviewer findings not in the `- id:` format are invisible to the host (unchanged).
- The cap rewrites every P0/P1 token in the entry, including passing mentions.
- An evidenced dismissal of a performance finding can reach `ready` while the host's "capped at P2" note still sits in Findings.
- Hostile-only (D-027/D-028): fabricated measurement or closure quotes, colluding lenses, QM text crafted to game ID matching, `full.diff` re-read without re-checking its digest, and host-run checks executing reviewed code.

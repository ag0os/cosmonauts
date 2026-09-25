# Stage 7 review 4 — Claude subagent

Prompt: `stage7-review-4-prompt.md`. Reviewed `f919594..acda9d1` (TASK-749). Final message condensed: the probe-path note is removed, and all findings, dispositions and residuals are kept.

**Verdict: DO-NOT-SHIP-YET.** TASK-749 resolves every item it was given, and all named mutations are killed. Replacing the Findings condition in the host ready check with `false` fails a test (mutations A1 and A3). But TASK-749 opens a new false-`ready` path that did not exist at `f919594`, reproduced end to end in real runs. It breaks hard floor 1.

## Findings

### HIGH

**H-1 — Under other-lens closure evidence, the closure test is keyword-only and consults only the first reviewer section. An open entry reaches `ready`, and the verdict depends on reviewer completion order.**
- **Where:**
  - `quality-review-models.ts:288-308` (`entryClosed`) treats an entry as closed if it contains `resolved`, `dismissed` or `closed` anywhere (line 296) and some lens other than one listing the ID has cited `closureEvidence`.
  - `quality-review-models.ts:181-195` (the `closureChecked` set) checks entries only against the first reviewer section for an ID.
  - At `f919594`, every section re-checked, so a non-self-citing entry always raised a human item.
- **Scenarios.** Real `runQualityReview` runs with clean checks and gate and attested diversity. The generalist raises `F-1 P2`. Security gives cited `closureEvidence` for F-1 and completes after the generalist. Each of these Findings bodies gives `ready` at HEAD and `not-ready` at `f919594`:
  - `- F-1 P2 still open: security dismissed it, but the empty-list case still crashes at lib/a.ts:1`
  - `- F-1 P2 not resolved: …`
  - `- F-1 P2 was closed prematurely; …`
  - `- F-1 P2 partially resolved; …`
  - `- F-1 dismissed per security review`, followed by an indented `  - lib/b.ts:3 null deref when list is empty (P1)` or an indented paragraph. The QM's own finding rides as a continuation of the closed entry.
- **Order dependence:**
  - The same legitimate `- F-1 dismissed after security review` gives `ready` when the generalist finishes first and `not-ready` when security finishes first. `sink.references()` keeps write order (`quality-review-artifacts.ts:216`).
  - Self-closure is accepted when another lens merely echoes the ID and finishes first.
- **Not a recorded limit:** the host closes a finding whose QM text says it is open. That is the opposite of the fail-safe direction.
- **Fix direction:** recognize a dismissal only when it is stated positively right after the leading ID. Treat a closed entry's non-`closureEvidence:` continuations as unaccounted. Check against the raising lens regardless of order. Test both reviewer orders.
- **Breaks:** D-031 floor 1, the D-025 host-verified `ready`, and AC-013.

### MEDIUM

None.

### LOW

- **L-1 — A cap that cannot be applied in place is neither applied nor raised as a human item.**
  - `report.ts:54-60`: an unindexed `-  PF-1 P1 slow path` (two spaces, or a tab) keeps P1 visible beside a "capped at P2" Findings note, with no human item. The verdict is `not-ready` anyway while the entry is open.
  - Breaks TASK-749 AC #3 clause 2.
- **L-2 — Surviving mutations:**
  - B2: the keyword guard at `models.ts:296`.
  - B13: unindented continuation lines at `report.ts:212`. The trailing-paragraph case is not isolated.
  - B14: the check on the first entry's closure only.
  - B16: the reviewer `includes` guard at `models.ts:300`.
  - C6: capping only the first Findings copy.
- **L-3 — Liveness costs, all fail-safe:**
  - A multiline dismissal whose `closureEvidence:` is not on the last line never counts as cited (`models.ts:311`, no `m` flag).
  - A blank line inside an entry, or a `###` subheading, blocks `ready`.
  - `None.` or `- None.` in Findings blocks `ready`, and the prompt never gives a no-findings sentinel.
- **L-4 —** the new run case "calibrates dismissal with a trailing paragraph" also passes at `f919594`, for a different reason. It is mutation-sensitive at HEAD.

## Dispositions of stage7-review-3 findings

| Finding | Status | Evidence / mutation |
|---|---|---|
| Codex 1: prose finding reaches `ready` | RESOLVED | `report.ts:205-215`, `run.ts:950`; fails at `f919594`; A2 killed |
| Codex 2: dismissal hides a same-ID open entry | PARTIAL | per-entry `openFindings` and `recordOpenObservation`; B3 killed; B2 survives; keyword and order holes (H-1) |
| Codex 3: duplicate out-of-range P0 | RESOLVED for the observation copy; in-place failure is L-1 | `models.ts:243-248`; B4 killed; C6 survives |
| Claude H-1: non-bullet Findings | RESOLVED for the listed shapes; OPEN for indented continuations under a closed entry | A1, A2, A3, M12/B1 killed; B13 survives |
| Claude L-1: leading tokens, decoration | RESOLVED | `models.ts:282-286`; prompt `quality-manager.md:35`; B5, B6 killed |
| Claude L-2: `$` expansion | RESOLVED | `report.ts:59`; B11 killed |
| Claude L-3: D-019 dedupe | RESOLVED | removing the `Set` at `run.ts:858` is killed |
| Claude L-4: surviving mutations | RESOLVED | M6/B7, M11/B8, M11b/B9, M17/B10 killed |

## Other checks

- **Floor 2:** no ordinary shape loses a reviewer ID.
- **Clean paths still reach `ready`:** clean, `- None recorded.`, all-out-of-range, single-line cited dismissal, and bold-ID dismissal reports.
- **Stages 1–6 and B-011:** no regression.
- **Gates:**
  - Changed-scope audit against the merge-base with `main`, using the committed baselines: pass, 0 issues.
  - `tsc` passes, Biome on changed files passes, `git diff --check` is clean.
  - QM files: 157/157.
  - Under load, the full suite gave 3326/3328. The 2 failures (`run-step`, `validate-harness-exports`) pass in isolation.
- **Scope:** nothing beyond TASK-749.

## Residuals

- D-031 recorded limits: measurement-looking code accepted as `measuredCost`; the QM repeating same-lens `closureEvidence`.
- Content under an extra `##` heading outside the seven sections is never inspected and can reach `ready` (pre-existing since before TASK-748).
- By design, a reviewer's in-range P1 moved to Out-of-range observations, or a QM P1 observation with no ID, reaches `ready`.
- The security and UX reviewer prompts mention only performance P1, not P0.
- `reviewer.text.includes("- id: F-1")` also matches `F-10`.
- Hostile-only (D-027/D-028): fabricated quotes, colluding lenses, QM text crafted to game matching, steered completion order, and host checks running reviewed code.

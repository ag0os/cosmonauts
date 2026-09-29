# Quality Manager run 1 — driver-hardening (not-ready, 22 findings)

Run `qm-0abafc64-dedd-44f1-adef-626832984fa7`, launched 2026-09-29 ~22:53Z by the review-phase coordinator from a fresh plain clone of `feature/driver-hardening` at `00d1ff5d` (the QM refuses this linked worktree, `Unsupported linked worktree layout`; two earlier clone attempts on 2026-09-29 failed with `Missing reviewer evidence`), reviewed against local `main` `e55040de`. Verdict: **not-ready**. Panel completed (all four lenses ran once, all on `openai-codex/gpt-5.6-sol`); host checks suppressions/test/lint/typecheck/reachability all exit 0 in the private snapshot; `analysis_audit` and every Fallow capability **unbound** (`execution-not-consented` in the private clone — unavailable evidence, a human item as on every prior plan). Files here are verbatim copies of the run's `artifacts/qm/` directory. The tip has since moved (TASK-808 and later); dispositions below are against `00d1ff5d`.

## Coordinator dispositions (2026-09-29, review-phase coordinator 2)

| ID | Disposition | Ground truth | Route |
|---|---|---|---|
| F-001, SR-003 | Rejected (D-019 recorded residual) | The probe has no cross-process ownership or process identity by decision (D-019 superseded D-013's supervisor); Drive's journal check is a pre/postflight guard, not a lock. Same class as codex round-2 finding 3, rejected on record. | improvement pass |
| F-002, SR-005 | Rejected (not reproducible) | Cleanup runs plumbing `git diff-tree -r --name-status -z` with no `-M`/`-C`; `diff.renames` affects porcelain only, so the output never contains `R`/`C` records and the fixed two-field parse is exact. | none |
| F-003 | Accepted (P2, B-003, INV-001) | The parser's section regex is unanchored, so an indented heading (up to three spaces is still Markdown) is read as the notes section; the editor anchors at column zero and would treat those notes as body. Same class as codex round-4 finding 2 (K2). | TASK-809 M1 |
| F-004 | Accepted (P2, B-011) | `git commit-tree` for the snapshot inherits identity from config; a host with no `user.name`/`user.email` fails the snapshot and therefore the attempt before spawn. Set a deterministic framework author/committer through env for snapshot commits. | TASK-809 M2 |
| F-005, SR-006 | Accepted (P2, B-011, INV-006) | Containment compares blob ids only; a reverted mode change (executable bit, symlink/type) is invisible, so its ref can be deleted. Compare `mode` with the id. | TASK-809 M3 |
| SR-001 | Accepted (P2, B-009) | The guard treats only `switch --discard-changes` as destructive; `-f`/`--force` are its aliases. | TASK-809 M4 |
| QM-001 | Rejected (D-020 scope; listed as a human item) | D-020 snapshots "tracked modifications and non-ignored untracked files" of the worktree; index-only content (staged bytes that differ from the worktree) is outside that ratified-by-non-veto scope. Recording it as a residual in the README; the human may widen D-020. | human item |
| UR-001 | Accepted (P2, B-008, AC-012/H-001) | The probe restores worktree bytes but not the index; a command that runs `git add <instrumented>` leaves probe code staged, and the probe still reports `restored: true` / `usableZero: true`. Compare each instrumented path's index entry before and after; a changed entry is a side effect that invalidates the zero and is restored. | TASK-810 N1 |
| SR-002 | Accepted (P2, B-008) | Probe command output is captured unbounded. Cap aggregate stdout/stderr, terminate on overflow, restore. | TASK-810 N2 |
| SR-004 | Accepted (P2, B-008, AC-012) | In-place instrumentation write can leave a partial file on ENOSPC/interrupt; write to a temp file and rename so the digest-verified sidecar always matches a whole file. | TASK-810 N3 |
| UR-002 | Accepted (P2, docs) | The capability doc promises automatic recovery; a `termination-error` marker blocks every later probe. Document the manual verification + recovery steps (the marker is the D-019 design). | TASK-810 N4 |
| UR-003 | Accepted (P2, B-008) | Failed probe results carry only a stderr tail; include a bounded stdout tail. | TASK-810 N5 |
| PF-002, PF-003, PF-004, PF-005, PF-006 | Rejected for this plan (performance follow-ups, no correctness or liveness failure at the sizes this project runs) | PF-003's per-path `hash-object` runs over the snapshot delta only since D-036; PF-004's retention is D-034 by design. | improvement pass |
| QM-002 | Rejected (no Windows support claimed anywhere in the framework) | Recorded as a follow-up candidate. | improvement pass |
| PF-001 | Dismissed by the QM itself with cited evidence | — | none |

Human items reported by the QM: analysis audit unbound in the private clone; `domains/shared/extensions/project-tools/fallow-provider.ts` changed (planned by slice 6, B-005/B-007; "pending sign-off"); QM-001 as above.

# Lean coding domain — realization record

Companion to `missions/architecture/lean-coding-domain-brief.md` (the north star) and
`missions/architecture/spikes/lean-coding-domain/` (phase-0 spikes and the decision table).
Built out of band, 2026-09-30 → 2026-10-01, on `feature/lean-domain`, merged to local `main`
at `c74eb20f` (4942 tests, five gates green).

| File | What it is |
|---|---|
| `coordination-record.md` | The coordinators' running record: every package, its gates, review rounds, and every open decision with the ruling applied (OD-1..5, W2-OD-1..7, W3-OD-1..6). Rulings marked "Shepherd" were made under the owner's delegation of 2026-10-01; OD-1/OD-2 and the decision table were ruled by the owner. |
| `brief-wave1.md`, `brief-wave2.md`, `brief-wave3a.md` | The coordinator briefs that drove each wave (the brief as plan; no `missions/` plans or tasks were created). |
| `reviews/branch-{1,2,3}.md` | Fresh-context whole-branch reviews: fix first → ship → ship. `branch-1` carries the first contract inventory (11, 4 sanctioned); `../lean-contracts.md` the full count. |
| `reviews/live-{1,2,3}.md` | The first live runs: Claude Code direct tier (9¾ min, loop correct, blocked by an unrelated flake), Claude Code plan tier (12 min, `done`, mergeable), Pi + DeepSeek V3 smoke (path proven, envelope not followed). |
| `reviews/od5-check.md`, `reviews/w37-1.md` | Independent checks behind two rulings (role rename; re-entry narrowing). |

Deviations from the brief, all on record in `coordination-record.md`: §4.2 role names
(`code-reviewer`, `checker`); §4.3 chains removed in favour of the runner (`lean_build`,
`lean_review`); §4.7B.5 mutation re-entry scoped to changed hunks; §4.7B.6 "once" kept, with a
second re-entry only for a signal that did not run in the previous pass.

Still open: WP0 baseline and WP6 evaluation (need the coding domain's Codex provider);
framework follow-ups and npm packaging items listed at the top of `coordination-record.md`.

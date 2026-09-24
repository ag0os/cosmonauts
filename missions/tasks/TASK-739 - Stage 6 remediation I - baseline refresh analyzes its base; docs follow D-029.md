---
id: TASK-739
title: Stage 6 remediation I - baseline refresh analyzes its base; docs follow D-029
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:qm-chain-safety'
  - remediation
dependencies:
  - TASK-738
createdAt: '2026-09-24T13:27:18.030Z'
updatedAt: '2026-09-24T13:27:18.030Z'
---

## Description

Two coordinator findings from applying human ruling N-001 (plan D-029).

First, `scripts/update-fallow-baselines.ts` runs Fallow against `--root`, which is the current working tree, and only records `--base` in its provenance. Run on a feature branch, it would silently absorb the branch's own new findings. INV-005's ranking forbids that: "re-saving a baseline is an explicit, recorded act, never a side effect … never absorbs a new finding silently". B-007 says "The explicit refresh script requires a base".

Second, `docs/fallow-exceptions.md`, the `ROADMAP.md` `analysis-debt-paydown` item and `.fallow-baselines/manifest.json` must describe the same baseline and debt state (B-009). The manifest now records the D-029 re-anchoring at `main` `29fc0ce`, but the docs still say the files were "adopted as-is".

This work is governed by D-008 (as amended by D-029), D-027 and B-007/B-009. Run the full suite as `env -u COSMONAUTS_DRIVER_CODEX_ARGS bun run test`.


<!-- AC:BEGIN -->
- [ ] #1 The refresh script analyzes the requested base revision, not the working tree: it materializes `--base` in a private temporary checkout (with the project dependencies available for analysis, e.g. by linking the root `node_modules` read-only or running the analyzer with the root install), saves the requested baselines there, and writes them plus manifest provenance into `--root`; a dirty or ahead working tree cannot influence the saved floors; tested with a working tree that adds a new finding not present at base, asserting the refreshed floor does not contain it.
- [ ] #2 B-009: `docs/fallow-exceptions.md` and the ROADMAP `analysis-debt-paydown` item describe the same state as `.fallow-baselines/manifest.json`: adopted as-is at their last-writer commits, then re-anchored once at `main` `29fc0ce` under human ruling N-001 (plan D-029), with the recorded reason; plus the current debt counts, the suppression registry and the explicit reasoned refresh process (now base-analyzing).
<!-- AC:END -->

## Implementation Notes

Coordinator note, 2026-09-24: `bun run lint` currently reports one error, in `.shepherd/backups/cosmonauts-packages-coding-2026-09-23/.cosmonauts-meta.json`. That is Shepherd's gitignored backup of a stray package, not project code. Do not edit or delete anything under `.shepherd/`, and do not change the Biome config to hide it. Judge lint as passing when that is its only error.

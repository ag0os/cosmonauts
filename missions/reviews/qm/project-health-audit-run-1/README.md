# Quality Manager run 1 — project-health-audit (failed: panel timeout)

Run `qm-a509325b-14f3-42d6-a7bf-aa2acb0de59e`, launched 2026-09-29 08:20Z at
snapshot `3209fa00`, reviewed against local `main` `64dca3c`. Verdict:
**failed — "Panel completion timed out after 300000ms"**. Three of four
reviewer lenses sealed (performance, security, ux — each "Overall: correct",
no findings); the `coding/reviewer` correctness lens was still reading at 147
tool calls when the 300 s panel budget expired, so no assessment, host checks,
or human-decision items were produced. The panel budget comes from
`qualityReview.panelTimeoutMs` in the **base revision's** config (local
`main` sets none; default 300 000 ms) and cannot be raised from this branch.
Files here are verbatim copies of the run's `artifacts/qm/` directory.

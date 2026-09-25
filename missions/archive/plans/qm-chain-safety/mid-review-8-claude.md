---
kind: independent-review
plan: qm-chain-safety
channel: Claude subagent reviewer (general-purpose, read-only)
scope: 6fadad0..(TASK-743 5c9ee93) + resolution of mid-review-7, under the D-027 threat model
date: 2026-09-24
---

# Mid-branch review 8 — Claude reviewer (coordinator condensation of the final report)

**Verdict: SHIP for Stages 1–6.** The reviewer ran 101/101 tests, re-ran both mid-7 probes against the new code, and ran three mutation checks on a scratch copy. Each test it checked fails when the mechanism behind it is removed.

## Resolution of round-7 findings

RESOLVED:
- codex MEDIUM: prep lines kept on failure;
- codex LOW: the seal test now fails if sealing is removed;
- Claude MEDIUM-1: the setup settle-grace probe is clean;
- Claude MEDIUM-2: `analysisPrepare` failure now gives assessed and not-ready (probe);
- Claude MEDIUM-3: the D-028 disclosure is on every exit and in the plan summary;
- Claude LOW-1: the flip test fails.

Carry-overs:
- LOW-2: unchanged and benign.
- PARTIAL as recorded: project-configured check inputs, detached grandchild, L4 model (Stage 7), L5 port (fails closed), NEW-L2, NEW-L4.
- JSX: OPEN, fails closed.

## New finding

- **LOW: an unindexed report keeps the QM's own gate claim after an `analysisPrepare` failure.**
  - Where: `run.ts:898`, `quality-review-report.ts:205-209`.
  - Probe: `## Gates` shows both "completed-bound; audit passed" and "failed-to-run (analysis preparation failed)".
  - The verdict is still `not-ready`.

No conflicts with ratified ground or with execution-liveness AC-015, AC-016 or AC-018. The end-to-end checks from round 7 still hold, since callers and launcher are unchanged. Newly confirmed:
- all real callers use `hostChecks:true`;
- `analysisPrepare` is limited to `--ignore-scripts`.

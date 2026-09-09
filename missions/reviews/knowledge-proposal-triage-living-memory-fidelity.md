---
kind: knowledge-proposal-triage
plan: living-memory-fidelity
date: '2026-09-09'
proposals: 10
status: awaiting-human-decision
---

# Knowledge proposal triage — `living-memory-fidelity`

Ten OKF proposals were written by `coding/distiller` on 2026-09-09 into
`memory/agent/proposals/living-memory-fidelity/`. Promotion into `knowledge/` is
a human act; this note exists so that act is a short review rather than a
re-reading.

Precedent for what promotion looks like: `harness-adapters` promoted 13 records
byte-identical into `knowledge/harness-adapters/`. The same shape applies here —
`knowledge/living-memory-fidelity/`.

## Checks already run

- **No curated overlap.** Grepped all 237 files under `knowledge/` for each
  proposal's central term (`path parity`, `sibling path`, `test double`,
  `producer`/`consumer`, `defect class`, `coverage statement`, `unbound gate`).
  The only hit is one incidental use of "sibling path" in
  `knowledge/spec-plan-intent.md`, in an unrelated sense. **All ten are novel** —
  none is a merge candidate against an existing record.
- **Provenance complete.** All ten carry `writer: coding/distiller`, a specific
  `source`, and a `date`. Nine cite an archived plan artifact, a review round, or
  the improvements record.
- **Stack-agnostic.** None names TypeScript, Bun, Vitest, or a cosmonauts-only
  API. They read as engineering conventions, which is what makes them worth
  keeping and also what makes them worth scrutinising — see the caution below.
- **Nothing entered `knowledge/`.** The live corpus digest is unchanged at
  `adc3ef70a5e75cad8813db9a3ab954d4da84ebfeafbb75703529048007469932`, 237 files.

## Recommended dispositions

| # | Type | Title | Recommendation |
|---|---|---|---|
| 1 | decision | Mutation facts belong to the durable primitive | **Promote.** The load-bearing decision of the whole track: an operation's result must distinguish domain success from mutation by *this* invocation. Sourced from the archived plan. |
| 2 | gotcha | Commit-reporting defects have multiple independently discoverable axes | **Promote.** The single most transferable finding — three axes, each found only after the previous was declared closed. |
| 3 | gotcha | Diff-scoped review misses unchanged sibling paths | **Promote.** Ten rounds passed over it; one round scoped for path parity resolved twelve behaviours. |
| 4 | gotcha | Producer regressions do not pin consumer propagation | **Promote.** Confirmed by execution, not opinion: three consumer sites reverted one at a time, eight producer tests stayed green. |
| 5 | gotcha | A local correctness fix can invalidate distant caller assumptions | **Promote.** Occurred three times across the track. |
| 6 | convention | Closing reviews require a positive coverage statement | **Promote.** Already applied in `review-16`/`17`/`18`. |
| 7 | convention | Remediation scopes close a defect class, not named instances | **Promote.** Rounds scoped at the class consistently closed sites nobody had named. |
| 8 | gotcha | Blended test doubles can mask the value under test | **Promote.** Narrow but sharp, and the failure is silent — the test passes for the wrong reason. |
| 9 | trade-off | Independent review diversity finds different defect axes | **Promote with a caveat in the body.** True and well-evidenced, but it reads as unconditional; the honest version bounds it — three of four independent rounds found defects, the fourth confirmed closure, and each round cost ~130-190k tokens. Worth one editing pass before promotion. |
| 10 | trade-off | Declared but unbound structural gates remain conventional controls | **Hold, or promote only after re-sourcing.** See below. |

## The one caution

Proposal 10 cites `missions/plans/living-memory-structural-hardening/spec.md` as
its source. **That spec was written by an agent in the same session, is
`status: active` with zero tasks, and has not been ratified by anyone.** The
other nine derive from archived plan artifacts, recorded review verdicts, or the
improvements record — evidence of what happened. This one derives durable
knowledge from a proposal about what *should* happen next.

The claim itself is true and independently supported: all five bindable gates in
the `living-memory-fidelity` Quality Contract shipped `unbound`, and every review
round from 15 to 18 recorded them as degraded. Re-sourcing it to
`missions/archive/plans/living-memory-fidelity/plan.md` (the Quality Contract
ladder) or to `review-18.md` would give it the same provenance class as the rest.

Flagged rather than silently fixed: editing a machine proposal's provenance is a
curation act, and curation is yours.

## What promotion does not settle

These ten are *descriptive* knowledge. The *prescriptive* output of the same run
— the fourteen improvement observations — went to the backlog instead, and is
closed with pointers in `missions/reviews/improvements/living-memory-fidelity.md`
(LM-D-004/LM-D-008, INV-006: `improve` never enters `knowledge/`).

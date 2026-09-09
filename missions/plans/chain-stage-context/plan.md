---
title: Later chain stages know what came before them
status: active
createdAt: '2026-09-09T18:36:28.733Z'
updatedAt: '2026-09-09T18:36:28.733Z'
---

## Summary

Only `steps[0]` receives the user prompt, so a stage that repeats a role gets the
same one-line default the first occurrence got. In
`planner -> plan-reviewer -> planner` the terminal planner is told to design a
plan, finds a finished one, and correctly does nothing — leaving the review round
unaddressed while `task-manager` proceeds behind it.

Two shipped chains carry that shape (`plan-and-build`, `spec-and-build`), so a
chain can decompose a plan whose final review was never applied, silently.

The fix is a prompt-mode problem rather than a context-plumbing one: stages
already share the plan directory, so the terminal planner can *read* the review —
it just is not told it is revising. The planner persona already carries the
revision contract and honours it when it runs first.

This plan is spec-ready and awaits planner design. `spec.md` is authoritative; it
carries the acceptance criteria, the recorded assumptions, and three open
questions the design must take a position on — including whether this revision
mode is the first instance of the `factory-modes` mode layer or a narrow fix that
would be superseded by it.

Picked up from ROADMAP `chain-stage-context` (thread) on 2026-09-09.

## Scope

Stage-prompt resolution for repeated roles in `lib/orchestration/stage-prompts.ts`
and `chain-steps.ts`, both call sites (`chain-runner.ts:661`,
`durable-chain-compiler.ts:278`), the unaddressed-review-round signal, and the
recorded decision on how much prior-stage context a stage receives.

Out: any general prior-stage-output passing mechanism, `drive-envelope`'s
`runStart` seam, the `factory-evals` scoreboard, and the planner persona itself.


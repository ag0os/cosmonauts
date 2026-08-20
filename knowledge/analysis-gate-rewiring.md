---
type: decision
title: Analysis gate rewiring
description: Archived plan distillation for analysis-gate-rewiring.
resource: knowledge/analysis-gate-rewiring.md
tags:
  - 'plan:analysis-gate-rewiring'
  - 'source:legacy-distillation'
timestamp: '2026-07-30T00:00:00.000Z'
scope: project
kind: semantic
writer: knowledge-surface-migration
source: memory/analysis-gate-rewiring.md
date: '2026-08-20T17:05:15.000Z'
legacySource: archive
legacyPlan: analysis-gate-rewiring
legacyDistilledAt: '2026-07-30T00:00:00.000Z'
legacySourceSha256: 404dbbf05b98d688380c8c507d8adb556eb364e276f5c547a66164d8ac75a1d3
---

# Analysis gate rewiring

## What Was Built

Slice 2 of 3 of the ratified `analysis-capabilities` design. It moved the gating
and remediation roles off the legacy prose "Detected Analysis Tools" injection
onto the capability surface slice 1 delivered, distributed that surface to
exactly seven v1 consumer roles, and deleted the legacy bridge in the same stage
that rewired its consumers. Quality Manager now resolves the abstract gate ladder
against runtime bindings and calls capabilities directly; Verifier validates
capability claims without being the transport; Fixer reruns the routed request
before editing. A provider-neutral `domains/shared/skills/analysis/SKILL.md`
replaced the deleted concrete provider skill tree (−3260 lines).

**It shipped functionally incomplete, by recorded decision.** Bound-gate
resolution is inert until `analysis-gate-coverage` lands — see D-029 below. It
degrades safely rather than passing silently, which is the correct failure
direction but not a working gate.

## Key Decisions

- **D-029 (human, 2026-07-30) — the delivered contract cannot express gate
  coverage.** A completed `changed-scope-audit` result carries one aggregate
  `verdict` plus `findings[]` whose `category` is a gate capability, but nothing
  declaring *which* categories were evaluated, and `docs/analysis-capabilities.md`
  promises only "audit changes from an explicit base". The Fallow adapter happens
  to run all three, but that is an adapter detail, not a provider-neutral
  guarantee. Chosen fix: a separate corrective plan (`analysis-gate-coverage`),
  not reopening the archived slice from inside slice 2, not softening the
  consumer. Rejected alternatives are the instructive part: inferring coverage
  from absent findings makes an unevaluated gate read as passed (INV-2), and
  reading the native payload puts provider coupling in a generic consumer
  (INV-1/INV-4).
- **D-021 — seven roles, and the availability check is load-bearing.** Shared
  skills merge into effective project skills for wildcard agents regardless of a
  project's filter, so agents without the tools receive the skill anyway. The
  skill must open with "call `analysis_status` first; if absent, say so and
  proceed" or it ships a broken affordance.
- **The bridge deletion is ordered last by task dependency, not by convention.**
  Deleting early opens a silent gate window (a prompt with no analysis surface);
  deleting late leaves a double surface. A double surface is recoverable, a
  stranded prompt is not — so the deletion task depended on every consumer
  rewiring task.

## Patterns Established

- **Characterize before rewiring, as its own task with its own gate.** TASK-537
  pinned the Quality Manager's ledger, local-base logic, legacy `QC-*` parsing,
  migration sweep, minimal-change constraint, and round budget against the
  *unmodified* prompt, and explicitly forbade touching the prompt. The rewiring
  task then had to keep those green. Without it, "did the rewiring drop
  something?" is unanswerable.
- **Runtime resolution must be exclusive.** Classifying a row into a bucket from
  its declared state and then *adding* the runtime outcome lets a row be both
  completed and degraded. Remove from every other bucket; keep the declared state
  only as provenance.
- **Make a negative regression guard non-vacuous.** Asserting the capability
  block is present does not prove the deleted block is gone. The guard asserts
  absence of the legacy heading across the *whole* injected prompt, under
  fixtures that write a provider signal — the exact condition that used to emit
  it. Same lesson as slice 1's consent sentinel.
- **A test that asserts a bare token proves almost nothing.** B-017 originally
  checked that `` `completed` ``/`` `unbound` ``/… appear; that passes on any
  prompt merely mentioning them. Pin each outcome's operative sentence.

## Files Changed

- `bundled/coding/prompts/{quality-manager,verifier,fixer,worker}.md` — gate
  resolution, capability-claim protocol, rerun-before-edit, migration sweep.
- `bundled/coding/agents/{verifier,fixer,planner,plan-reviewer,worker,refactorer}.ts`
  — `project-tools` added (quality-manager already had it) = seven consumers.
- `domains/shared/skills/analysis/SKILL.md` (new); `bundled/coding/skills/fallow/` (deleted).
- `domains/shared/extensions/project-tools/index.ts` — legacy injection deleted.
- `domains/shared/skills/work-artifacts/references/gate-contracts.md` — the
  bound/unbound/failed/unsupported-metric resolution vocabulary.
- `tests/prompts/analysis-procedures.test.ts` (new), `tests/prompts/quality-manager.test.ts`,
  `tests/domains/coding-agents.test.ts`, `tests/extensions/project-tools.test.ts`.
- `biome.json` — see the first gotcha.

## Gotchas & Lessons

- **The task-config writer fights Biome and blocks every Drive task.**
  `lib/tasks/file-system.ts:105` writes `missions/tasks/config.json` with
  `JSON.stringify(…, null, 2)` (spaces) while Biome formats JSON with tabs, and
  `task-id-system` removed the `!missions` Biome exclusion. Drive rewrites that
  file at every task start, so the worktree is lint-dirty during every worker's
  own verification and each task self-reports `partial` on a file it is forbidden
  to touch. The first run aborted on task 1 this way. Worked around by excluding
  the generated file in `biome.json`; **the writer bug is still live** — it
  rewrites a file whose content never changes.
- **After a fast-forward merge, `main..HEAD` is empty — and an empty diff reads
  as "nothing to review", not "wrong range".** Reviewing post-merge requires
  pinning the literal pre-slice SHA (`51ef662..HEAD`) for both codex and the QM,
  and overriding the QM's topology-based base resolution explicitly. The subtler
  trap: `git show main:<file>` for a before/after comparison now returns the
  *rewritten* file, so a reviewer told to diff against `main` compares the file to
  itself and reports no change.
- **A consumer can be perfectly correct and still deadlock the system.** The
  Quality Manager's refusal to read native fields (INV-1) and its rule that an
  unclassifiable gate is `failed-to-run` (INV-3) are both right, and together they
  make every bound gate unreachable given an insufficient contract. Consumer
  correctness is not system correctness. The plan's standing rule — a contract gap
  is an amend-on-record against the runtime slice, never a prompt workaround —
  is what kept this from being papered over.
- **The QM blocked on a flake its own verifier had already dismissed.** Its
  reviewer spawn prompt said the failure was "unrelated… passed immediately in
  targeted rerun", yet step 7's checks-pass requirement still produced Blocked.
  The file (`tests/extensions/orchestration-driver-tool.test.ts`) was
  byte-identical to the pre-slice commit and green in isolation — the known
  concurrency flake, here triggered by the QM's *own* parallel subagents, not
  Drive.
- **The ~200-char stage-summary truncation loses the QM's report.** The chain
  result truncated the verdict mid-sentence, no `qm.md` is written on a block, and
  the reviewer's `review-round-N.md` was cleaned up — so zero `F-###` findings
  were recoverable. Budget a rerun if you need that panel's signal. (Improvement
  worth noting: this QM wrote to `review-round-4.md` specifically to avoid
  clobbering tracked `round-1..3` artifacts from another plan — the documented
  clobbering trap did not recur.)
- **`cosmonauts check-artifacts <slug>` is not a command.** The correct form is
  `cosmonauts plan check-artifacts <slug>`. The wrong form falls through to
  *interactive agent mode* and silently launches a live TUI session; two of them
  burned ~$31 before being caught. Nothing errors — it just starts an agent.
- **`check-artifacts` validates decision citations, and the test suite enforces
  it.** Writing `D-029` in a plan whose own Decision Log lacks that entry produces
  `unresolved-decision-citation` *and* fails
  `tests/artifacts/behavior-conformance.test.ts`. Either carry the entry into that
  plan's log or avoid the `D-###` token. Cross-plan citations do not resolve.
- **Test-count delta is a cheap, high-yield signal.** +5 net tests for 8
  behaviors plus characterization was the thread that surfaced 8 deletions in
  `project-tools.test.ts`. Six were detection tests that asserted *through* the
  deleted block, so they could not survive it; equivalent coverage existed in
  slice 1's B-004. Both reviewers independently agreed the residual dual-signal
  precedence case was an artifact of the deleted block's rendering, not a real
  loss.
- **Independent review earns its cost.** Codex returned DO-NOT-SHIP with 6
  findings on work that had passed all gates, `check-artifacts` 0/0, and my own
  floor-preservation diff. The one I would never have found: `boundary-conformance`
  was omitted from runtime resolution, so a *failed* boundary binding could reach
  merge-readiness labelled protocol-pending — an INV-3 violation the plan's own
  Quality Contract row 6 ("introspection failure blocks") contradicted.

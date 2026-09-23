# Test Health Audit

> **Superseded by `framework-health`** (`missions/plans/framework-health/plan.md`).
> This spec was rewritten on 2026-09-23 to the sampled mutation-probe method,
> under framework-health D-002 (human, 2026-09-20: "replace the per-declaration
> agent-assessment method with reachability plus real mutation probes … `spec.md`
> of that plan is no longer frozen"). The previous spec, with its eight
> invariants, sixteen acceptance criteria and per-test evidence profiles, is in
> git at `4a6300f`. Its assessment epochs and profiles are forfeit as evidence
> (D-002). Execution now lives in framework-health Stage 2 (TASK-711). TASK-710
> will mark this plan completed and archive it.

## Purpose

A green suite has to mean that shipped behavior is protected. The previous
method had agents grade each test against the plan statement that ordered it,
and it reasoned about fault sensitivity instead of probing it. It reproduced the
defect it was built to find: roughly 3,100 profiles, none of which could fail.
The replacement answers "can this test fail?" the only way that counts, by
making it fail.

## Intent

Goal: a maintainer can read, for a reproducible sample of the suite, which test
declarations go red when the production behavior they cover is broken, and see
that every one that did not was strengthened until it does or was deleted.

Invariants. These are quoted from framework-health's ratified Intent, which
governs this method. This spec adds none of its own:

- INV-001 - "Can this test fail" is answered by making it fail, never by
  reasoning about it. A judgment that cannot itself fail is not evidence.
  (framework-health INV-005)
- INV-002 - Tests exercise logic with synthetic data and are not coupled to
  particular agent definitions or authored prose: if the logic is unchanged,
  the test stays green. (framework-health INV-003, with its human-ratified
  provider/toolchain/language/framework-absence exception)
- INV-003 - Prefer deleting a constraint to adding one. New mechanism must name
  what it replaces. (framework-health INV-007)

The previous INV-001 through INV-008 are retired by framework-health D-002
(human, 2026-09-20). They remain readable in git at `4a6300f`.

## Users

- Maintainers deciding whether a green suite makes a change safer.
- Workers strengthening a test that survived a probe.
- Future auditors repeating the probe on a later commit.

## Method

1. **Population.** Every committed `tests/**/*.test.ts` outside
   `tests/fixtures/` whose module graph reaches shipped code. Shipped code is
   `lib/`, `cli/`, `domains/`, `scripts/` or `bundled/`, reached directly,
   through `tests/helpers/`, or through a dynamic import in a helper. A file
   that runs `bin/cosmonauts` as a subprocess is also admitted. A file that
   exercises only test code or tooling is out. The census records the rule that
   admitted each file (framework-health D-032, D-037).
2. **Sample.** Strata are the first directory level under `tests/`, plus
   `(root)` for files directly under it. Each stratum contributes the larger of
   three files and ten percent (rounded up), capped at its size, taken at an
   even stride over the path-sorted list. Within each file the unit is the
   median `it`/`test` declaration by line order, ties to the earlier, found by
   syntax rather than by line pattern (D-021, D-024, D-030, D-034, D-038).
3. **Tool.** `bun run probe:census` prints the population, the excluded files,
   each stratum's size, sample and stride, and the sampled declarations, for the
   tree at the given root (default: the current directory). It replaces the former `scripts/test-health-audit/`
   suite, which served only the forfeit epoch method.
4. **Probe.** In a throwaway git worktree of the committed tree, never in the
   working checkout, for each sampled declaration: confirm that it passes
   alone, apply one realistic defect to the production unit it covers, run it
   alone, and record `killed` (red) or `survived` (green). Restore from `cp`
   backups, never `git checkout`. The mutation target is always shipped code or
   shipped content, never test code (D-038). A declaration that reaches production through a helper or a subprocess
   is probed at the production function its behavior depends on, by hand where
   a tool cannot route it (D-036).
5. **Survivors.** A survivor is strengthened or replaced and then probed again
   until it is recorded `killed`, or it is deleted. An edit alone never closes a
   survivor (framework-health B-008, D-033).
6. **Record.** `missions/plans/framework-health/stage2-probes.md` names the
   commit, the population, each stratum with its size and stride, and one row
   per sampled declaration: target, mutant, result, and any survivor's re-probe.

## Acceptance Criteria

- [ ] AC-001 - Tracked as framework-health B-008 and TASK-711. The probe record
  carries the census and a killed/survived row per sampled declaration, and
  every survivor is re-probed to killed or deleted.
- [ ] AC-002 - A later auditor who runs `bun scripts/probe-census.ts <root>`
  against a worktree of the recorded commit reproduces the recorded sample
  exactly.

(AC-001 of this rewrite is checked by the framework-health record, not
separately. The previous AC-001 through AC-016 are retired with their method by
D-002.)

## Scope

In scope: the sampled probe of the committed suite, and strengthening or
deleting survivors.

Out of scope: per-test evidence profiles, assessment epochs, calibration
corpora, behavior-portfolio grading, a composite health verdict, and any gate
that fails CI on a heuristic. Reachability of production code is framework-health
Stage 3. Whole-project static health is the later `project-health-audit`.

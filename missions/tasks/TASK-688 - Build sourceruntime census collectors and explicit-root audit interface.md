---
id: TASK-688
title: Build source/runtime census collectors and explicit-root audit interface
status: To Do
priority: high
labels:
  - backend
  - testing
  - devops
  - 'plan:test-health-audit'
dependencies:
  - TASK-687
createdAt: '2026-09-16T18:34:28.459Z'
updatedAt: '2026-09-17T15:20:29.808Z'
---

## Description

Stage 2 — Census collectors.

Owned behavior: **B-002** (sole owner).

Implement the bounded TypeScript declaration collector, observation-only Vitest 3.2.4 reporter, reconciliation logic, and explicit-root CLI at the B-002 seams. Publish `docs/test-health-audit.md` v1 before the assessing-agent stages and exclude generated audit JSON from Biome as D-024 requires. INV-003/INV-005/INV-006, AC-002/AC-003/AC-014, and D-006/D-011/D-018/D-024/D-025 are settled ground for this task: missing evidence never becomes clean, lifecycle phases are never guessed, and heuristic candidates remain separate from objective facts. Halt and escalate on collision rather than narrowing those promises.

<!-- AC:BEGIN -->
- [ ] #1 B-002 is proved at `scripts/test-health-audit/source-census.ts`, `runtime-reporter.ts`, `census.ts`, and `cli.ts` by `tests/scripts/test-health-audit/census.test.ts` > `reconciles all command surfaces and keeps unsupported or phase-unknown failures blocking`, carrying exact marker `@cosmo-behavior plan:test-health-audit#B-002` near the executable test.
- [ ] #2 Quality Contract assertion 2 is satisfied: fixtures cover source-only/runtime-only cases, aliases/nesting, parameter counts, skip/todo/filter/conditional states, collection/test/hook failures, unknown lifecycle phase, unsupported syntax, and command mismatch, and none can render clean evidence.
- [ ] #3 Reporter evidence preserves public payloads and labels a lifecycle phase objective only when Vitest establishes it; otherwise `phase: unknown`, basis `blocked`, and the limitation remain visible without heuristic overwrite.
- [ ] #4 The census/CLI distinguishes successful observation of a failing run or `incomplete`/`blocked` state from audit-tool failure, and records a reporter-clean non-zero post-run policy exit as command evidence/residual uncertainty rather than fabricating a collection or execution failure.
- [ ] #5 `docs/test-health-audit.md` documents the archive-safe command `bun scripts/test-health-audit/cli.ts --audit-root <path> <command>`, command exit contract, assessment rubric, trust/consent boundary, rerun triggers, and explicit probe confirmation; no package script is added and `package.json` remains unchanged. `cli.ts` exposes the `census`, `prepare-units`, `validate`, `probe --confirm-probe <id>`, and `baseline` subcommands under `--audit-root <path>`, each documented with what it produces; per #4 an observed failing run, an `incomplete`/`blocked` census, a calibration miss, and `not established` all exit 0 with the state recorded, while a non-zero exit means the tooling could not produce trustworthy evidence (unreadable root, invalid manifest, reporter incompatibility, stale or missing census digest, unproven probe restoration or containment).
- [ ] #6 `biome.json` excludes `!missions/plans/*/audit` (no trailing `/**`, which Biome >=2.2.0 rejects via `lint/suspicious/useBiomeIgnoreFolder`), preserving immutable digest-pinned generated evidence while leaving project-native lint applicable to maintained code and tests.
- [ ] #7 Dependency direction remains `cli/reporter/probe/census/artifacts/source-census -> schema`; census logic imports no product modules, and mechanical collectors cannot populate the agent-assessed role, authority, chain, criticality, disposition, or portfolio-sufficiency values.
- [ ] #8 The epoch/index IO half of `scripts/test-health-audit/artifacts.ts` exists and is exercised: immutable `audit/epochs/<id>/manifest.json` writing (evaluated HEAD, material-input digests, command definitions, method/schema version, census digest), and the `census` command's documented non-zero exit on an unreadable audit root or an invalid manifest.
- [ ] #9 `<audit-root>/index.json` is created and rewritten only by atomic replace, names `currentEpochId` plus every prior epoch ID in order, and is the sole resolver of the current epoch — the CLI never infers it by scanning `audit/epochs/`; opening a successor epoch appends the new ID and advances `currentEpochId` without touching any existing `manifest.json`.
- [ ] #10 Reconciliation is scoped to each command's own selection: a filtered command (the isolation runs, or any `--testNamePattern`/path-filtered surface) reconciles only against the declarations its filter selects, reporting unselected declarations as `not-selected` rather than `source-only`; only unfiltered full-suite surfaces reconcile against the whole universe. Regression evidence: the first live run produced ~6,150 spurious findings per isolation run against 1 for the unfiltered `normal` run.
- [ ] #11 D-011's blocked-phase rule governs **errors** only: a passing declaration that emitted no hook events is not a `blocked` record and does not raise `hook-lifecycle-incomplete`. A fully green suite must be able to reach a clean census. Regression evidence: the first live run raised ~1,504 blocked hook-lifecycle findings per command run over passing tests.
- [ ] #12 Exit classification and census state are independent: a command's exit is classified from its reporter payload alone, so a non-zero exit with no module/suite/case error is `post-run-policy-exit` regardless of any declaration-to-runtime mismatch. A test proves `bun run test:coverage`'s threshold exit stays `post-run-policy-exit` while mismatches exist elsewhere in the same census.
- [ ] #13 `suite-integrity.md` is written alongside `suite-integrity.json` (bundle 2 is both), and the `census` command persists per-command timing and watcher-start evidence.
- [ ] #14 AST conditional/unreachable candidates are heuristic-lane records at basis `reasoned`, never `blocked`, and never block a census on their own (D-031). Regression evidence: the second live run recorded 245 `conditional-observation` findings as blocked — 96% of everything blocking that census.
- [ ] #15 A statically-analysable `.each` parameter set is counted even when the literal array spans multiple lines, contains nested array/object elements, or is wrapped in a type assertion — `satisfies T`, `as const`, `as T`, or parentheses must be unwrapped before the array-literal check, singly or nested. `it.each([["a","b"],["c","d"]] satisfies readonly [string,string][])` counts as 2. Only a genuinely non-literal set — `test.each(<identifier>)`, a spread, or a call expression — is recorded as `unsupported-syntax`. A fixture covers each wrapper form. Regression evidence: `tests/agent-packages/claude-cli.test.ts:100` is a multi-line literal that the first implementation could not count, while `tests/driver/report-parser.test.ts:33` is a genuine variable case that must stay visible.
- [ ] #16 The collector reads `<epoch>/dispositions.json` when computing census state: a finding carrying a disposition is accounted-for, so `incomplete` and `blocked` have a reachable exit, while a finding with no disposition never becomes clean (D-031, INV-005).
- [ ] #17 Digest validation compares like with like per D-032: the manifest's frozen source-census digest against the source census, and the command-census digest against its own recorded value. Validation never requires a post-seal runtime digest to equal a digest sealed at C1.
- [ ] #18 Dispositions carry `repair-required-tooling` and `repair-required-suite` as distinct values, plus the sources the assessing agent opened; validation rejects a `limitation-accepted` entry whose consulted-source list is empty (D-031 as amended).
<!-- AC:END -->

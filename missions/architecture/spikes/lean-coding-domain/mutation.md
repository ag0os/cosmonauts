> Checked 2026-09-30 by an independent pass; corrections and omissions are in `check.md` and folded into `README.md`.

# Spike WP4a: scoped mutation (D-2)

Date: 2026-09-30. Isolated worktree at `5b774b7c`, each sample checked out at its own commit. Machine: darwin, 14 cores, Node 25.9, Vitest 3.2.4.

## Setup and obstacles

- **Compatible.** `bun add -d @stryker-mutator/core @stryker-mutator/vitest-runner` installs 10.0.0 in 5 s. Its peer range is `vitest >=2`. Stryker reuses `vitest.config.ts` and the vite transform, so ESM and TypeScript need no config. It runs under Node, as `bun run test` already does. Line-range `--mutate` and `--testFiles` (new in v10) both scope as documented.
- **Blocker, fixed with a 2-line patch.** The vitest runner hard-codes `pool: 'threads'`, so any test that calls `process.chdir()` fails the dry run ("not supported in workers"). Ten test files do this. I patched `dist/src/vitest-test-runner.js` locally to use `pool: 'forks', singleFork`. Forks and threads ran at the same speed (S3: 100 s vs 101 s). Keeping it needs `bun patch`, or an upstream option.
- **Sandbox leaves out `.git`.** A test that `git clone`s the checkout fails (`tests/scripts/validate-harness-exports.test.ts`). `--inPlace` keeps `.git` but breaks framework-root resolution (`pre-w3-disabled-baselines` hit ENOENT under `.stryker-tmp/backup-*`). The fix is a small deny-list of tests kept out of mutation runs.
- **Sandbox sits in the repo.** A failed run leaves `.stryker-tmp/` behind, and vitest's default include then runs it: a baseline ran 101 files instead of 51. Needs a vitest `exclude`, a `.gitignore` entry and `rm -rf` before each run.
- **Dry run is serial.** It is forced to one worker. The wide S2 set took 64 s in the dry run vs 37.5 s in parallel vitest.
- **Subprocess code is invisible.** Code that only runs in spawned processes (Drive binaries, CLIs) never has its mutants activated. Those mutants show up as NoCoverage, not as survivors.
- **Results wobble.** Across three S3 runs, survivors were 54/51/47 and timeouts 40/44/47; mutants move between the two buckets. Count timeouts as killed and gate on trend, not on an exact number.
- **Exclude `StringLiteral`.** On S1 it added 37 mutants and 9 survivors, all message text.
- **Changed-function finder** (~70 LOC, TypeScript compiler API, prototyped). It must count arrow functions held in object properties. Without that, S3's range was a whole 220-line factory.
- **Flakes.** Only in the accidental 101-file run: `cross-plan-commit-lock` and `driver/driver-detached` (the latter is not on the known list). Every real run passed, including the wide set that contains `cross-plan-commit-lock` and `plans/archive.test.ts`.

## Samples (all measured)

Config (`.spike/stryker.config.mjs`): `testRunner: "vitest"`, `vitest: {related: false}`, `coverageAnalysis: "perTest"`, `mutator.excludedMutations: ["StringLiteral"]`, `ignorePatterns: ["missions/sessions"]`, json reporter, default concurrency (13 runners). Command shape:
`STRYKER_VITEST_POOL=forks npx stryker run .spike/stryker.config.mjs --mutate '<ranges>' --testFiles '<tests>' --timeoutMS 3000`

| Sample | Mutate ranges | Tests | Vitest alone | Stryker wall | Active mutants | Killed / timeout / survived / no-cov |
|---|---|---|---|---|---|---|
| S1 fix `f2d6242c` (snapshotWorktree) | `lib/driver/runtime-helpers.ts:276-342` | `tests/driver/worktree-snapshot.test.ts` | 1.4 s | **6.0 s** | 39 | 21 / 0 / 8 / 10 |
| S2 feature `d1e53585`, narrow | 9 functions, 4 files* | 4 files: the 3 the commit changed + `tests/tasks/task-manager.test.ts` | 3.0 s | **33 s** | 233 | 187 / 4 / 35 / 7 |
| S2 feature, wide | same | 51 direct-importer test files, 742 tests | 37.5 s | **190 s** (202 s at timeoutMS 10000) | 233 | 178 / 28 / 22 / 5 |
| S3 refactor `ac8dbc11` | 21 functions, 8 files* | 11 direct-importer files (git-clone test dropped) | 5.7 s | **100 s** (123 s at 10000) | 398 | 271 / 44 / 51 / 32 |
| extra: small feature `e649e356` | 3 functions | 4 files | — | 4.1 s | 10 | 10 / 0 / 0 / 0 |

\*Ranges come from `node .spike/changed-fns.mjs <commit>`, the innermost named function around each new-side diff line. S2: `cli/tasks/commands/edit.ts:215-252,555-579`, `lib/tasks/lock.ts:19-25`, `lib/tasks/task-manager.ts:203-319`, `lib/tasks/task-note-editor.ts:8-85`. S3 is spread across `lib/harness-adapters/{sync,render,durable-file,path-safety}.ts` and `lib/extensions/{context-values,agent-memory,knowledge-surface/*}.ts`.

**Survivor quality.** I classified these by reading each survivor; that split is a judgement, not a measurement.

- **S1, 8 survivors: 5 real, 3 noise.** One real survivor goes to the heart of the fix: emptying the `missions/sessions` ignore list survives, so the regression test does not pin the fix. Dropping `GIT_INDEX_FILE` also survives, which means the snapshot can dirty the user's index unnoticed. Noise: `stdio: []` and `force: false`.
- **S2 wide, 22 survivors: ~12 real, ~10 noise.** Real: the empty-append guard (3 mutants), the CLI change record for notes (3), note-editor boundary cases, `trimEnd` changed to `trimStart`. Noise: equivalent regex quantifiers, and `?.[0]` changed to `[0]` where the match always succeeds.
- **S3, ~51 survivors: ~35 real, ~15 noise.** Real: the path-escape throws at `sync.ts:892` and `render.ts:610` are never asserted, plus recovery branches and `recall-limit` validation. Noise: defensive type guards in `context-values.ts` and `mkdir({recursive})`.

## Custom alternative (estimated, not built)

- **Per-mutant cost.** A single-file vitest run costs 1.3 to 3.5 s wall, about 1 s of it startup. Without per-test coverage, every mutant reruns every selected file.
- **S3:** 398 × 5.7 s ≈ **38 min serial**, about 5 min across 8 throwaway worktrees.
- **S2 wide:** 233 × 37 s ≈ **2.4 h serial**.
- **Size:** about 400 to 600 LOC (operators, the TypeScript compiler API rewrite, worktree pool, result parsing).

Stryker instruments once, switches mutants at runtime and uses per-test coverage, which makes it roughly 10 to 40 times cheaper here.

## Recommendation for D-2: Stryker

All three samples fit the 5-minute budget: 6 s, 33 s narrow / 190 s wide, and 100 s. The survivor lists read like real review input.

Cost to wire in (WP4c), about 1 to 2 days:

1. Two dev dependencies, plus a `bun patch` for the forks pool (or an upstream PR adding a `pool` option).
2. `stryker.config.mjs`. `.stryker-tmp/**` goes into the vitest `exclude` and `.gitignore`.
3. The changed-function range finder (prototype exists).
4. Test selection from the WP3 blast radius, run in tiers: tests the task touched plus direct unit tests first (~30 s), the full importer set only if the budget allows. Plus a deny-list for tests that are unsafe in the sandbox.
5. JSON report → per-changed-function survivors, with timeouts counted as killed and NoCoverage reported separately.
6. `--incremental` for the one builder re-entry. Untested here.

Total effort was about 45 minutes. Scratch work is in the worktree's `.spike/` (untracked), and the worktree is back on its original branch.

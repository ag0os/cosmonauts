# Branch review 3: `feature/lean-domain` @ `bba6611b` vs `main` @ `5b774b7c`

**Verdict: ship.** Every earlier high and medium is still closed on the real surfaces, apart from branch-1 M-4, which was deferred by ruling. W3-6 and its remediation hold together end to end. Every probed run ended with the right status. No run hung. Lock, base-sha marker, hook log, `.stryker-tmp` and review workspace were all cleared on every path.

There is no new high. There is one new medium (M-1): when verify fails in pass 1, mutation is skipped. Verify then uses up the single re-entry, and pass 2's in-diff survivors block the run, although no builder ever saw them. The run ends `blocked`, which is the conservative direction, but it reaches the human early. It is a small fix.

Read-only review in an isolated worktree reset to `bba6611b`, with a fresh `bun install --frozen-lockfile`. The probes were Bun scripts in the scratchpad that call the real `runBuild`/`runReview` on temp git fixtures. They used:
- stub backends;
- the real verify, health, dupes, blast-radius, plan-vs-actual and mutation providers;
- a stand-in Stryker binary that writes canned reports and probes the sandbox's git.

All probe dirs were removed afterwards, and the worktree is clean.

## Gates

| Gate | Result |
|---|---|
| `bun run typecheck` | 0 |
| `bun run lint` | 0 (760 files) |
| `bun run check:reachability` | 0 (257/257) |
| `bun run check:suppressions -- --base main` | 0 |
| `bun run test`, run 1 | **exit 1**: 3 failed, 4933 passed, 1 skipped. Failures: `extensions/project-tools-fallow-fixtures.test.ts` (15 s timeout), `orchestration/run-start-chain-characterization.test.ts` (15 s timeout), `lean-run/run-build.test.ts` "fails when a stage outlives the time budget…" (L-5). All three files pass in isolation (128/128). |
| `bun run test`, run 2 | **exit 0**: 334 files passed, 1 skipped; 4936 tests passed, 1 skipped |

The two timeouts are outside the branch's diff and are load flakes of the known kind. The lean one is new to this branch (L-5).

## Earlier findings

| id | status | evidence at `bba6611b` |
|---|---|---|
| branch-1 H-1 token budget | **closed** | Pi's `getSessionStats()` total is `input + output + cacheRead + cacheWrite` (`node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js:3092`). `recordStats` adds only `input + output` (`run-build.ts:1136-1139`). The probe ran a full loop of 6 sessions (builder-1, its repair, builder-2, builder-3, reviewer, reviewer-2), each at input 50k, output 5k, cacheRead 600k, cacheWrite 10k: `tokensUsed: 330000`, where Pi's total would be 3.99M. |
| branch-1 H-2 unverified paths | **closed** | `bundled/lean/chains.ts` ships `[]`. The `lean/lead` subagents are `lean/code-reviewer` and `lean/checker` (no builder). `lean_build` and `lean_review` both go through the host. `runReview` now runs `[createVerifyProvider()]` before the reviewer by default (`run-build.ts:258-264, 290`), and a missing or failing verify is `blocked` "unverified: …" (`reviewGap`, `:302-307`). Probe E: verify failing twice gives `blocked: unverified: verification did not pass (fail)`. A flake (fail, then pass) gives `done`. The reviewer saw `## Pass 1` both times. `runBuild` with `providers: []` still ends `blocked: unverified: no providers configured`. |
| branch-1 H-3 context pack | **closed** | Production builds the pack, since `lean_build` passes no `contextPack`. Probe S1 used the real `refreshFileGraph`: `contextPack: "built"`, and the request's backticked paths were seeded as `[touch]` in the repo map (ruling 4). `graph[]` shows start plus pass-1/2/3 refreshes. |
| branch-1 M-1 envelope repair | **closed** | Probe S1: builder-1's `kind: "tests"` reply was rejected. One read-only repair turn followed (`readonly: true`), and the repaired reply with `"reason": null` and `"note": null` parsed (ruling 10). `manifest.repairs[0].repaired: true`. |
| branch-1 M-2 lenses | **closed** | `lean_build` and `lean_review` take `lenses`, and the reviewer prompt carries `# Lenses` (`prompts.ts` `reviewSubject`). |
| branch-1 M-3 dupes | **closed** | The dupes provider runs in the default set and reads the floor from `<base>:.fallow-baselines/dupes.json`. Probe S1's fixture has no floor and reports that as `info`. |
| branch-1 M-4 npm packaging | **not closed (deferred by ruling)** | `stryker.config.mjs` is still outside `package.json` `files`, and Stryker and fallow are still devDependencies. Shepherd ruled this follow-up only. Mutation stays `info` outside this checkout. |
| branch-1 M-5 unbounded diff | **closed** | The inline diff is capped at 60 KB, with the full diff in the workspace. The signal facts are bounded too: on this repo's real graph, blast radius truncates (`lib/config/loader.ts`: 58 dependents, 154 tests "(truncated)", 11 KB rendered). |
| branch-1 M-6 two runs per worktree | **closed** | Probe B: while one run held the lock, a second `runBuild` and a `runReview` both ended `blocked: another lean run (<id>) is active in this worktree`. The first run then ended `done`, and `.git/lean-run/` was empty afterwards. |
| branch-2 M-1 `lean_review` unverified | **closed** | See H-2 above (W3-6 ruling 7). |
| w36-1 M-1 untestable never fires | **closed** | `untestableFiles` now uses only the mirrored test and direct test importers (`mutation-tests.ts:202-225`). Probe S1/G: `lib/gitty.ts`, whose own test runs `git worktree add` without a cwd, is left out of `--mutate`. A change to only that file gives `info` "untestable under mutation…" and Stryker is not started. |
| w36-1 M-2 sandbox git | **closed** | There are two guards: a four-condition text exemption, and `GIT_CEILING_DIRECTORIES=<worktree>/.stryker-tmp` in Stryker's env (`mutation.ts:562-576`). Probe S1: `git worktree add` run from `.stryker-tmp/sandbox-1` inside the stand-in Stryker exited 128 ("not a git repository"), and `git worktree list` still showed one worktree. Side effect: L-2. |
| w36-1 M-3 PR body all unplanned | **closed** | Without a plan-vs-actual signal, `writeRunPrBody` computes `planVersusActual` from the plan (`run-pr-body.ts:50-58`). Probe E (`lean_review` with a plan) gives Planned 1 (`lib/calc.ts`), Unplanned 0, Untouched 1 (`lib/missing.ts`). |
| w36-1 L-1..L-4 | **closed** | `requestPaths` drops `://` and `:line`. The warning now reads "plan path not found (new file?)". Both git reads use `--no-renames`. `release()` sits in a nested `finally`, `clearRunBaseSha` sits in a nested `finally`, and the pre-stage hook-log drop only warns. |
| carried lows (branch-2 L-1, L-2, L-3; contract 11; real-Stryker test adding a linked worktree to the live repo) | unchanged | `lead.ts:14` still lists `lean/code-reviewer`. `lead.md:11` still says "conduct a chain". These are lows and were not re-ruled. |
| w30-1 F-10 (Bun hang on a missing executable, pre-existing) | **still reproduces** | `createVerifyProvider` with `executable: "definitely-missing-xyz"`: still pending after 15 s under Bun, `info` "unverified … (spawn-error)" in 9 ms under Node. The run deadline bounds it, so the run ends `failed: time budget exceeded` after up to 60 min. The cause is in `domains/shared/extensions/project-tools/process-runner.ts`, not in branch code. Verify (and so every `lean_review`) now depends on it. |

## The completion loop after W3-6, end to end

**Probe S1** (direct request, real providers):
1. Leftover hook-log line → builder-1 edits `lib/calc.ts` and the untestable `lib/gitty.ts`, and its stub appends a hook finding.
2. Invalid envelope → read-only repair, accepted.
3. Pass 1:
   - verify: a command fails once and passes on the retry, so `pass`, both attempts recorded;
   - health, dupes, blast radius, plan-vs-actual ("direct tier: no plan") all `info`;
   - mutation: gitty untestable; on `calc.ts`, one survivor on a changed line and one on an unchanged line of `double`, so `fail` + re-enter.
4. builder-2 (prompt carries the mutation signal) → pass 2: the only survivor is on the unchanged line, so mutation is `info` with `survivorsOutsideDiff`.
5. Reviewer (medium F-1) → builder-3 (prompt carries F-1) → pass 3: mutation `pass`.
6. Reviewer-2 clean → **`done`**, with `reentries: 1` and `findingsReentries: 1`.

Afterwards:
- `.git/lean-run/` is empty (no lock, marker or hook log).
- `.stryker-tmp` is absent.
- The run's `health-hook.jsonl` holds exactly the builder-1 line, tagged `"stage":"builder-1"`; the leftover was dropped.
- `pr-body.md` was written, with `prBodyPath` set.
- The reviewer's private workspace was removed.

**Probe S2** edge paths:
- (A) Plan tier, verify failing twice, then a persistent in-diff survivor: `blocked: re-entry signals still failing after one re-entry: mutation`.
- (B) Lock: as above.
- (C) Abort while the builder ignores the signal: `failed: aborted at builder-1`, returned in 2.04 s, state cleared.
- (D) Verify command `sleep 61.25` against a 6 s budget: `failed: time budget exceeded at verify provider (pass 1)` at 6.06 s, the `sleep` was gone, state cleared.
- (E) Review with a plan: as above.
- (F) Builder `done` with no diff: L-1.
- (G) Untestable file only: `done`, mutation `info`, no Stryker.

No path ended `done` without a passing verify signal. No signal that should be `info` blocked a run: untestable, outside-diff survivors, Stryker failure and the non-verify providers are all `info`.

## New findings

| id | severity | file:line | what + probe | fix |
|---|---|---|---|---|
| M-1 | medium | `lib/lean-run/run-build.ts:614-637` (`executeRun`, `buildAndVerify`); `lib/lean-run/providers/mutation.ts:132-139` | **Verify uses up the only re-entry while mutation is skipped, so pass-2 survivors block the run unseen.** When pass 1's verify fails, mutation is skipped (branch-1 L-3), and builder-2 gets only the verify failure. If pass 2's verify passes, mutation runs for the first time. A survivor in a changed hunk becomes `remaining`. With a clean review the run ends `blocked: re-entry signals still failing after one re-entry: mutation`, and no builder ever saw that result. Brief §4.7B.6 asks for one re-entry *with the structured results*. Only the findings path (`findingsPrompt` with `failing`) would show them, and only when the reviewer has a high or medium finding. **Probe S3**: a lint-like command fails twice in pass 1, then passes; the stand-in Stryker reports one survivor on a changed line. Result: `blocked … mutation`, 2 builder turns, builder-2's prompt has `### verify` and no `### mutation`. A failing check in pass 1 is common: all three live runs re-entered or repaired on pass 1. | Narrow fix: when pass 1's mutation signal was skipped (`data.skipped`) and pass 2's mutation is a `fail`, allow that mutation result its own re-entry (builder turn plus pass) before the reviewer. Alternative: when the review has no blocking finding but `verified.remaining` is non-empty, use the one remediation (`remediate` already passes `failing` to builder-3). That also changes the ruled verify-twice case (`run-build.test.ts:812`), so it is the human's call. |
| L-1 | low | `lib/lean-run/run-build.ts:614-623` vs `:284-289` | **A builder that changes nothing can end `done`.** `runReview` blocks an empty change ("nothing to review"). `runBuild` does not: verify passes on the untouched tree, and the reviewer gets `# Changed files (none)` and an empty diff fence. Probe F: a clean stub review gives `done: … 0 finding(s)`. The outcome then rests on the reviewer noticing, although the host knows it deterministically (principles 1 and 7). "Already done" can be legitimate, but the lead should be told. | After builder-1's pass, if `changedFiles` is empty, end `blocked: builder returned done with no change`. Or keep `done` and put "no change" in the manifest reason and the summary. |
| L-2 | low | `lib/lean-run/providers/mutation.ts:562-576`; e.g. `tests/scripts/suppression-policy.test.ts:161` | **The git ceiling turns read-only repo tests into a Stryker abort.** Tests that read the checkout through git with an implicit or root cwd (`git ls-files --cached`) used to pass in the sandbox against the live repo. Now they fail, Stryker's dry run fails, and the whole pass is `info` "Stryker did not finish" for every changed file whose selection includes such a test. The signal is lost silently, though never wrongly. Probe: a git-less copy of this tree under a ceiling, running 14 candidate files. `suppression-policy.test.ts` fails with "fatal: not a git repository", and `quality-review-run.test.ts` has 2 failures; the rest pass. | On a dry-run failure, re-run Stryker once without the failing test files and list them as denied. Or detect `ls-files`/`check-ignore` in `MUTATES_REPOSITORY`'s neighbourhood and deny those tests up front. |
| L-3 | low | `lib/lean-run/run-build.ts:858-874` (`runProvider` via `untilAborted`); `mutation.ts:264-275` | **An abort returns before the mutation provider's cleanup finishes.** Probe S5 (Stryker stand-in ignoring SIGTERM, abort at 4 s): `runBuild` returned `failed: aborted at mutation provider (pass 1)` with `.stryker-tmp` still present and the lock already released. Cleanup finished about 3 s later, in-process. Inside the lead's long-lived Pi process this is benign. In a host that exits on return, the sandbox, and possibly the SIGTERM-ignoring Stryker group, can be left behind. | On abort, await the provider's own settle for a bounded grace (the reap takes about 3 s) before `finish`. Or remove `<worktree>/.stryker-tmp` in `underRunLock`'s `finally` as well. |
| L-4 | low | `lib/lean-run/context-pack.ts:80-82, 99-109` vs `providers/verify.ts:125-132` | **The pack lists different verification commands from the ones the host runs.** The pack reads `package.json` scripts (`bun run test/lint/typecheck`). The verify provider runs `.cosmonauts/config.json` `qualityReview.checks` first. On this repo that is 5 commands, adding `check-new-suppressions` and `check:reachability`. A builder that adds an unreachable module learns about the extra check only through a re-entry. `builder.md:7` promises "the verification commands". | Render the pack's list from the same resolution `defaultCommands` uses. |
| L-5 | low | `tests/lean-run/run-build.test.ts:925-937` | **A load-sensitive lean test.** A 100 ms run budget has to cover `prepareBuilder`: graph refresh, pack, snapshot, the hook-log drop W3-6 added, and the marker write. In gate run 1, the deadline fired before the builder was called (`builder.calls[0]` undefined). It passed in isolation and in run 2. | Have the builder stub resolve a "started" promise and assert after it, or give a larger budget with a builder that ignores the signal. |

## Other checks

**Do-not-touch** (`git diff main --name-only`):
- Nothing under `bundled/coding/`, `lib/orchestration/`, `lib/driver/`, `lib/agents/`, `lib/domains/`, `lib/chains/`, `domains/`, `memory/`, `knowledge/`, `.fallow-baselines/` or `biome.json`.
- `missions/` holds only the spikes dir, `missions/reviews/lean-contracts.md`, the ratified `knowledge-surface-backfill-amendment-5.md` and `staged-code.toml`, the same set branch-1 and branch-2 accepted.
- `.cosmonauts/config.json` adds `contract` and `git-workflow` (OD-2).
- `lib/envelope/` is unchanged since `8d7927e0`.
- The Pi packages are unchanged at 0.87.1. The `package.json` additions are the Stryker, jsdom and mermaid devDependencies plus the patch, as before.

**Prompts.**
- Word counts: lead 396, builder 259, code-reviewer 285, checker 202. All are ≤400, none has a rules section, and the new enumerations live in host code (`prompts.ts`), with checker.md naming the kinds.
- Text that is stale against host behaviour (both low): `lead.md:11` "conduct a chain" (lean ships none), and L-4's verification-command mismatch.

**Workers and state.**
- Workers write no task state.
- The builder's `touched` feeds only plan-vs-actual and the PR body. Changed files come from git with a throwaway index.
- The hook log is written by the host's own extension and moved into the record by the runner.
- Drive-style snapshot refs (`refs/cosmonauts/drive/<run>/lean-<run>/attempt-N`) stay after each run, three for a remediated run. This is Drive's recovery convention, but nothing prunes them. Observation only.

**Seams.**
- The lock, marker and hook log live under each worktree's own `git rev-parse --git-dir`.
- The private review clone is removed in `finally`, and the in-place fallback is taken for linked worktrees.
- Abort: `untilAborted` on every backend, provider and refresh; the verify child is killed (probe D); Stryker's group is reaped.
- The lock uses a `wx` fallback without hard links; acquisition is inside the `try`.

**Tests.**
- No source-byte pins in the files changed since branch-2.
- New filesystem tests (`run-build-cleanup`, `run-lock-no-hard-links`) use `mkdtemp`, removed in `afterEach`.
- Assertions are present.
- One load-sensitive test (L-5).

## Not checked

- Live model runs after W3-6: whether Claude Code or DeepSeek now emit valid envelopes on the first reply.
- A real Stryker run with the ceiling. Only the stand-in, and a vitest run in a git-less copy, were exercised.
- `lean_build` and `lean_review` through a live Pi tool call, and the external (claude-cli, codex-cli) backends.
- Wall time of a full default-provider run on this repo against the 60-minute budget.
- npm install, Windows, network file systems.
- branch-2 L-4 (the empty "Available:" list) was not re-run.

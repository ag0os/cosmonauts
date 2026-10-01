# Branch review 2: `feature/lean-domain` @ `8d7927e0` vs `main` @ `5b774b7c`

**Verdict: ship.** H-1 and H-2 are closed on the real surfaces, and there are no new high findings. There is one new medium: `lean_review` gives the reviewer no host checks, and still reports `done` with no "unverified" marker (M-1). It is a small fix. Make it before WP6 measures reviews with this tool.

Gates at `8d7927e0` (fresh `bun install --frozen-lockfile`):
- typecheck 0, lint 0, `check:reachability` 0 (255/255), `check:suppressions --base main` 0.
- `bun run test` exit 0: 331 files passed, 1 skipped; 4849 tests passed, 1 skipped. No flakes, no re-runs.
- The tree was clean afterwards.

## H-1 re-check: token budget against the real Pi stats shape

**The real shape.**
- `pi-coding-agent/dist/core/agent-session.js:3043-3093`: `getSessionStats()` sums usage into `tokens: {input, output, cacheRead, cacheWrite, total}`, where `total = input + output + cacheRead + cacheWrite` (line 3092).
- `lib/orchestration/agent-spawner.ts:458-471`: `captureSpawnStats` copies `sessionStats.tokens` verbatim.
- `lib/orchestration/types.ts:169-175`: `TokenStats` has the same five fields.

**What the runner counts.**
- `run-build.ts:962-986` `recordStats` adds only `spawn.tokens.input + spawn.tokens.output` to `manifest.tokensUsed`. Repair turns count too.
- A backend with no stats (claude-cli, codex-cli) adds nothing, and the manifest warns once.
- `tokenOverrun` (`:1006-1010`) compares that sum to `budget.tokens` before each stage (`stopBeforeStage`, `:1012-1018`).

**Configuration.**
- `resolveBudget` (`:383-396`) takes, field by field: the `lean_build` parameter, then `lean.budget` from config, then `DEFAULT_RUN_BUDGET` (1,000,000 tokens, 60 min). Time is clamped to 2^31-1 ms.
- `lib/config/loader.ts` `parseLeanBudget` accepts only positive integers, and `timeMs` up to the timer maximum. Malformed values are skipped with a warning.
- `lean_build` exposes `budgetTokens` and `budgetTimeMs` (`bundled/lean/extensions/lean-run/index.ts:71-78`) in an object-root `Type.Object` schema. `lean_review` takes no budget parameters, so it uses config or the defaults.

**Probe.** A scratchpad script runs the real `runBuild`. Its stub backends return the requested stats per session: input 120k, output 8k, cacheRead 700k, cacheWrite 20k, total 848k. It uses a real temp git repo and a stub verify provider. The five-session path is builder-1, verify fail with re-entry, builder-2, pass, reviewer with a medium, builder-3, pass, reviewer-2 clean.
- Result: `status: done` and `tokensUsed: 640000`, i.e. 5 × 128k. Counting Pi's `total` would have been 4.24M.
- On disk before each stage, `tokensUsed` read 0, 128k, 256k, 384k, 512k, then 640k at the end.
- The manifest records `budget: {"tokens":1000000,"timeMs":3600000}`.

**Are the defaults sane?** I computed per-session input+output from 51 Pi session records in `missions/sessions/**` of the main checkout. This worktree has none: the directory is gitignored.

| Model / role | n | input+output p50 | p90 | max |
|---|---|---|---|---|
| gpt-5.4 workers | 32 | 79k | 116k | 176k |
| gpt-5.6-sol QM review sessions | 15 | 256k | 898k | 1.04M |
| claude-sonnet-4-6 | 4 | 21k | 33k | 33k |
| all sessions | 51 | 89k | 355k | 1.04M |

- **Tokens.** Three median builders and two median reviewers come to about 740k, under 1M with about 25% headroom. One p90 reviewer session (about 900k) plus about 230k of builders exceeds 1M before `reviewer-2`, and the run ends `failed: token budget exceeded at reviewer-2`. The QM sessions review whole-plan diffs, so they overstate a lean reviewer. The default is sane for the median and configurable for the tail (L-3).
- **Time.** The 60-minute default sits inside the runner's own estimate of 29–63 min for a run that reaches the re-review (`run-build.ts:96`, from w30-1 F-7). The slowest estimated runs end `failed: time budget exceeded` at `builder-3` or `reviewer-2` (L-3).

**H-1: closed.**

## H-2 re-check: host verification on every path

**The surfaces.**
- `bundled/lean/chains.ts` ships `chains = []`.
- `lead.ts:13-14`: extensions `["orchestration", "lean-run"]`; subagents `["lean/code-reviewer", "lean/checker"]`. `lean/builder` is not in the list.
- `lead.md:23` routes every build to `lean_build` (plan path or request text) and existing changes to `lean_review`, and says to spawn `lean/checker` for claims.
- Both tools use object-root `Type.Object` schemas.
  - `lean_build`: `planPath` or `request` (exactly one, checked in `planSource`), plus `specPath`, `backend`, `lenses`, `budgetTokens` and `budgetTimeMs`.
  - `lean_review`: `base`, plus `planPath` or `request` or neither, `backend` and `lenses`.

**Loaded through the framework.** `tests/domains/lean-domain.test.ts` passes in the full run. It loads the real bundled domains and uses `authorizeAgentStart`, the same check `spawn_agent` (`spawn-tool.ts:699`), `chain_run` (`chain-tool.ts` `chainDenial`) and `run_driver` (target `worker`) use.
- `lean/lead` cannot start `lean/builder` or `builder`.
- `lean/lead` can start `lean/code-reviewer` and `lean/checker`.
- `run_driver` is also denied for the lead, because `worker` is not in its subagents.
- No other agent can start lean roles: cosmo's subagents are all `coding/*`.

**Zero chains.** There is no `--list-chains` flag; the listing is `cosmonauts run chain list`.
- `cosmonauts -d lean run chain list` prints `[]` and exits 0.
- `-d lean run chain --name build x` exits 1 with `Unknown named chain "build". Available: ` (empty list, cosmetic).
- `-d lean run chain build x` exits 1 with an unknown-role error.
- Without `-d`, the coding chains list normally. `--list-domains` and `--list-agents -d lean` work.

**Direct request through `runBuild`**, stub backends, record read from disk before each stage:

1. builder-1 → pass 1 → reviewer (medium F-1) → builder-3 (prompt carries F-1) → pass 2 → reviewer-2 clean.
   - Ends `done`, `tier: direct`, `findingsReentries: 1`.
   - Envelopes on disk grow `[builder-1]` → `[builder-1, reviewer]` → `[…, builder-3]` → `[…, reviewer-2]`. Passes grow 1 → 2.
   - Both reviewer sessions ran as `lean/code-reviewer` in a private clone. Each got the inline diff and the verify facts. The second also got the earlier review.
2. The same run, but reviewer-2 still reports a medium (F-9).
   - Ends `blocked: reviewer-2 still reports 1 high or medium finding(s): F-9`.
3. Extra variant: verify fails after builder-3 and reviewer-2 is clean.
   - Ends `blocked: re-entry signals still failing after the findings re-entry: verify`. No fourth builder turn runs.
4. `runReview` on an uncommitted change (a modified tracked file and an untracked file, on `main`).
   - The private checkout's diff carried both. Ends `done`, `tier: review`, 0 passes.
   - The reviewer prompt says "The host's verification facts are below" and then "(no checks ran)". See M-1.

**Remaining paths where a lean role sees a change without host verification or without the diff.**
- **`lean_review`** (the sanctioned path for existing changes): the reviewer gets the diff but no host checks, and the run reads `done`. This is M-1.
- **The lead spawning `lean/code-reviewer` directly on a change.**
  - Still permitted, because the role stays in `subagents` for plan reviews. Only the prompt sends change reviews to `lean_review`.
  - The reviewer gets only the lead's prompt and has `readonly` tools, so no git. `code-reviewer.md:21` keeps a fallback for "when you were started without one".
  - This is the residue of branch-1's H-2 failure mode, reachable only if the lead ignores `lead.md:23`. Low (L-1).
- **`lean/checker`**: it runs commands itself; producing evidence is its job.
- **The lead's own edits** while pairing (`tools: coding`, `lead.md:11` "pair on small concrete work"): no host verification. This is by design for the interactive lead, as with cody, so it is not a finding.
- **A human** running `cosmonauts -a lean/builder` or `run chain "lean/builder -> …"` from the CLI: the CLI does not apply subagent authorization. This is a human act, not a finding.
- **Builds**: every one now goes through `runBuild`. There is no lean chain, the lead cannot start `lean/builder` by any tool, and `runBuild` with no providers ends `blocked: unverified: no providers configured` (`run-build.ts:833-834`).

**H-2: closed for builds and remediation.** One medium gap remains for reviews of existing changes (M-1).

## New findings

| id | severity | file:line | what + probe | fix |
|---|---|---|---|---|
| M-1 | medium | `lib/lean-run/run-build.ts:244-250, 264-273`; `lib/lean-run/summary.ts:9-15`; `bundled/lean/extensions/lean-run/index.ts:172`; `bundled/lean/prompts/code-reviewer.md:7` | **`lean_review` runs the LLM reviewer with no host checks and reports `done` regardless.**<br>`runReview` passes `providers: []` and finishes `done` whenever the reviewer finishes. So verify, health, dupes, blast radius, plan-vs-actual and mutation never run on an existing change. The read-only reviewer cannot run tests itself.<br>The reviewer's opening line says "The host's verification facts are below" over "(no checks ran)". `code-reviewer.md:7` promises "the facts the host verified". The tool result's summary reads `done: …; N finding(s)`, with nothing saying no check ran, while `runBuild` in the same state ends `blocked: unverified`.<br>Probe E above. Brief §4.2 (the reviewer receives "the blast radius and the verification facts") and principle 7 (deterministic first). | Run the default providers once in `runReview` before the reviewer, with a synthetic envelope (`touched` = changed files) and no re-entry. Or, at minimum: add `unverified: no checks ran` to the manifest reason and summary, say so in the `lean_review` description, and drop "facts are below" when `facts.passes` is empty. If Shepherd rules the review tier verification-free by design (brief §4.3 lists `review: reviewer`), keep only the labelling fix. |
| L-1 | low | `bundled/lean/agents/lead.ts:14`; `bundled/lean/prompts/lead.md:23`; `code-reviewer.md:21` | **Change review by direct spawn is routed by prompt only.**<br>`lean/code-reviewer` stays startable for plan reviews. A lead that spawns it on a code change gives a readonly reviewer no diff and no facts: branch-1's H-2 failure mode, behind one prompt sentence (enforcement-ladder smell). | Give `lean_review` (or a `lean_plan_review` mode) the plan-review job and drop `lean/code-reviewer` from `subagents`. Or accept and record it as a prompt-level contract. |
| L-2 | low | `bundled/lean/prompts/lead.md:11` | "conduct a chain when the work is bigger than a session": lean ships no chains, and the lead can chain only the reviewer and the checker. Stale after W3-OD-1. | Say "run a build through `lean_build`", or drop the clause. |
| L-3 | low | `lib/lean-run/run-build.ts:93-101` | **Defaults fit the median, not the tail.**<br>The 60-min default is below the 63-min upper estimate in its own comment. 1M tokens fits a median 5-session run (about 740k) but not one p90 review session (about 900k input+output in QM records).<br>Both end `failed` after builder-3's work, with a clear reason. Separately, for Anthropic models the new input is in `cacheWrite` (sonnet sessions: input p50 72, cacheWrite p50 44k), so input+output undercounts there by about 3x. Lean roles default to openai-codex today. | Record per-stage elapsed time in the summary so the lead sees where the budget went. Note the Anthropic caveat beside `DEFAULT_RUN_BUDGET`, or count `cacheWrite` (the ruling says input+output, so this is the human's call). |
| L-4 | low | CLI `run chain --name` error | `Unknown named chain "build". Available: ` prints an empty list under `-d lean`. | Print "(none)". |

Carried from branch-1 and not re-ruled:
- `tests/lean-run/providers/mutation.test.ts:1050-1075` still adds a linked worktree to the live repo. Gated on `f2d6242c` being present, and removed in `afterEach`.
- Contract 11: the checker can still write through `bash`. The `role-guard` header records this as accepted gap P-2.

## Other checks

- **Do-not-touch list:** `git diff main --name-only` shows nothing under `bundled/coding/`, `lib/orchestration/`, `lib/driver/`, `lib/agents/`, `lib/domains/`, `lib/chains/`, `domains/`, `memory/`, `knowledge/`, `.fallow-baselines/` or `biome.json`. The Pi packages are unchanged at 0.87.1. Lean only imports `quality-review-workspace.ts` and does not modify it.
  - `missions/` changes: the spikes dir, `missions/reviews/lean-contracts.md`, `missions/reviews/knowledge-surface-backfill-amendment-5.md` (ratified OD-2), and `missions/architecture/staged-code.toml` (+`lib/envelope/index.ts` as a public entry, mirrored in `fallow.toml`). Branch-1 accepted the same set.
  - `.cosmonauts/config.json` adds `contract` and `git-workflow` to `skills`, ratified as OD-2 with amendment 5.
- **Prompts:** lead 396, builder 259, code-reviewer 285, checker 197 words; all ≤400. No rules sections. Commit-policy, qualified-id and remediation sentences are gone from the prompts.
- **Workers and state:** the builder's envelope `touched` feeds only plan-vs-actual. Changed files come from git (`readWorktreeChange`, using a throwaway index so untracked files count). No task state is written anywhere.
- **Seams:**
  - The attempt-1 snapshot becomes `diffBase`, so a dirty tree's earlier work is not the builder's (`run-build.ts:625-642`).
  - Review uses a private clone, falling back to in-place with a warning; the full diff goes to `full.diff` or `<run>/<stage>.diff` (`:775-786`).
  - The lock and the base-sha marker both live under `git rev-parse --git-dir`/`lean-run/`, so each linked worktree has its own. The lock is created with `link()` from a temp file; a stale lock is reclaimed under a claim file, and only the owner releases it.
  - Abort: `untilAborted` wraps every backend, provider and graph refresh. The Pi spawn receives the signal. External children are spawned with `signal`. Verify skips on abort or budget. Stryker's process group is reaped. `lean_build` forwards the tool signal.
- **Tests:** none of the 42 changed or added test files pins source bytes. All filesystem tests use temp dirs cleaned in `afterEach`. Assertions are present. The token tests now use realistic Pi-shaped stats (`run-build.test.ts:76-92`, `:944`).
- **Gates:** see the top of this report.

## Not checked

- Live model runs: no real Pi, Claude or Codex session ran a lean role. gpt-6-sol builder token usage is unknown; no records exist.
- `lean_review` and `lean_build` through a live Pi tool call. The extension tests stub `runBuild` and `runReview`. I called `runBuild` and `runReview` directly.
- The real default providers end to end on a direct request. The probe used a stub verify provider.
- Wall time of a real five-session run against the 60-minute default.
- An npm install, and Windows.

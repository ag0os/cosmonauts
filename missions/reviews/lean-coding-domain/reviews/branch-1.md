# Branch review 1: `feature/lean-domain` @ `793ee564` vs `main` @ `5b774b7c`

**Verdict: fix first.** The packages are sound: typecheck is clean, 414 tests in the 31 lean-related files pass, and the tree was unchanged afterwards. The assembled system misses the brief in three places. Pi runs (the D-3 default) cannot reach the reviewer. Two of three tiers, and remediation, skip host verification. The builder gets no context pack.

## Findings

**H-1 (high): the token budget counts cache reads, so Pi runs never reach the reviewer.**
`run-build.ts:53` sets a 200k budget and `:433-434, :458-468` enforce it. The total comes from Pi's `getSessionStats()` (`agent-spawner.ts:462-465`), which sums input + output + cacheRead + cacheWrite (`pi-coding-agent/dist/core/agent-session.js:3092`). Across 36 session records in `missions/sessions`, p10 is 451k and the median 917k.
Failure: the builder returns `done` and pass 1 runs, then the run ends `failed: token budget exceeded at reviewer`. A re-entry fails the same way at `builder-2`. The tests use totals of 3 (`run-build.test.ts:619`), and `lean_build` exposes no budget.
Fix: count input + output only, and make the limit configurable.

**H-2 (high): direct fixes and the review remediation get no host verification.**
`lead.md:23` sends direct fixes through the `build` chain (`chains.ts:9`), and `lean_build` requires `planPath` (`extensions/lean-run/index.ts:22`). The chain runner runs no checks and passes `lean/code-reviewer` no diff. That role's tools are `readonly` with no bash (`code-reviewer.ts:11`), so it cannot get the diff itself.
Failure: on a one-line fix the reviewer reads files without knowing what changed and returns `done`. The host never runs a test.
The remediation step ("findings back once", principle 6) exists only as a sentence in `lead.md:23`, and a re-spawned builder gets no checks and no re-review.

**H-3 (high, tracked as W3-1): no context pack in production.**
`index.ts:68-76` never passes `contextPack`, so the builder gets the raw plan plus the envelope line (`prompts.ts:13-18`). With `projectContext: false` (`builder.ts:15`) it also gets no AGENTS.md, no repo map and no verification commands, although `builder.md:7` promises all three.

**M-1: the strict envelope ends the run with no repair turn.**
`schema.ts:8` rejects unknown fields at every level, and `envelope.ts:12-19` rejects pretty-printed JSON. A probe rejected an extra `notes` field, `"result":"passed"`, a finding without `fix`, and a fenced pretty-printed envelope.
Failure: the run ends `failed` (`run-build.ts:417-419`) and the builder's whole diff is left unverified. Fix: allow one turn that re-emits only the envelope.

**M-2: the lens list is never supplied.** `code-reviewer.md:9` says the reviewer receives lenses and must review "through each lens you are given and no other". `prompts.ts:43-61` sends none, and `lean_build` has no lens parameter.

**M-3: no duplicate detection (§4.7B.2).** `"dupes"` is declared (`types.ts:7`) but `default.ts:14-21` has no provider for it, and nothing compares against `.fallow-baselines/`.

**M-4: mutation and health are silently `info` outside this checkout.**
`stryker.config.mjs` is not in `files`. Stryker, the runner patch and fallow are devDependencies, and `patchedDependencies` applies only to a root install. `mutation.ts:52-55` resolves `../../../stryker.config.mjs`.
Failure: an npm install never produces the mutation re-entry signal, one of the two signals D-4 relies on. The run does not die, because every provider failure becomes `info`.

**M-5: the reviewer prompt inlines an unbounded diff** (`prompts.ts:58`; `git.ts:34` allows a 64 MB buffer). Lockfile churn overflows the reviewer's context, the backend errors, and the run ends `failed`.

**M-6: nothing stops two runs in one worktree.** There is one base-sha marker per git dir (`base-sha.ts:9`). With parallel `lean_build` calls, the first run to finish clears the other's marker (`run-build.ts:188`) and both diffs mix.

**Low:**
- L-1: blast-radius freshness hashes the whole tree (`file-graph-store.ts:97-113`), so it reports "stale" after every build and the prefix tells the reviewer nothing.
- L-2: `blast-radius.ts:53` tells the user to run `architecture generate`, but `graph.json` needs `--file-graph`.
- L-3: mutation still runs after verify fails, wasting up to 300 s (`mutation.ts:46`).
- L-4: the `verify.ts:20` comment contradicts `:93` (full budget).
- L-5: the envelope instruction is duplicated (`prompts.ts:3-7` and the personas).

## Contract inventory: 11 contracts, 4 sanctioned by the brief

1. The envelope: last `{` line, strict schema. *Sanctioned.*
2. The OD-4 decorated-line rejection (`lean-run/envelope.ts:8-19`), never stated to agents.
3. `plan.md`/`spec.md` headings. *Sanctioned.*
4. `plan.md` body grammar: Touches paths are the first backticked path or the first word with `/` or an extension, and behaviors take the form `B-n observer / entry / outcome`. Two parsers read it (`plan.ts:82-108`, `plan-vs-actual.ts:51-57`). The brief says only headings are read.
5. The `missions/lean/<slug>/` location (`lead.md:19`, `SKILL.md:10`).
6. The tier rule (`lead.md:17`). *Sanctioned.*
7. The lens list (`code-reviewer.md:9`). *Sanctioned* but never sent.
8. "Always use these qualified ids" (`lead.md:23`), which the host could enforce.
9. One remediation, then the human (`lead.md:23`): a prompt rule.
10. Commit policy in prompts: `lead.md:13` and `builder.md:17`.
11. "Checker never edits" (`checker.md:3,11`), enforced by the prompt alone because the `verification` tool set includes bash.

## Other checks

- **Do-not-touch list:** clean. Nothing changed under `bundled/coding/`, `quality-review-*.ts` or the parsers. The only `missions/` paths are the spikes dir and the three ruling files. `check:suppressions --base main` passes.
- **Prompts:** 393, 300, 279 and 206 words, all ≤400. None has a "rules" section, but the lead's prose still carries contracts 8–10.
- **Workers and state:** workers never touch state, and changed files come from git, not from `touched`.
- **Seams:** correct for the snapshot diff base on a dirty tree, snapshot objects in the private clone, and the in-place read-only review fallback. Stryker's process group is reaped, fallow calls have timeouts, and the Pi spawner honors abort.
- **Tests:** none lacks an assertion. Three gaps:
  - The token tests use toy totals, which is how H-1 got through.
  - The tool tests stub `runBuild`, so none sees H-3.
  - The real-Stryker test adds a linked worktree to the live repo (`mutation.test.ts:1002-1012`), which leaks if the test is killed.

## Not checked

- Live model runs (real output shapes are unseen).
- The private-clone path end to end (this worktree is linked).
- Health-hook latency per write. Not run, because it writes `.git/worktrees`.
- Whether verify plus two mutation passes fit in 30 minutes.
- An npm install, or Windows.

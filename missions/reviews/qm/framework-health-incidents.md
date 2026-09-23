# Quality Manager incidents — framework-health Stage 3 (2026-09-23)

The QM ran in chain `chain-5f1f1c94-0db8-4bea-9d6e-952044c1d2d4`, on `openai-codex/gpt-5.6-sol`, from about
13:35 to 16:45 (11,324,582 ms). It started at `8ca8064` on a clean tree. Its prompt named the range
`9be076b..HEAD` on the local branch and listed the out-of-scope and accepted items. It also said "do not
revert, reset, checkout or stash" and "commit nothing you have not verified". Before it ran, the range had
already had an independent Claude review with a re-review, and three codex rounds ending SHIP.

Output:
- five `REVIEW-FIX` commits;
- ten review files rewritten in place;
- the verdict "Not merge-ready", with one human decision and one deferred P2.

After it finished I committed its review records (`6d213f6`) and reverted one of its commits (`61527f6`). A
codex review of the other four found a regression. Fixing that, plus the follow-up gap, took two codex
rounds and one worker (`a8cc97f`, `3dbde3e`; 16:45–17:06).

## Incidents

### 1. A performance fix reintroduced a correctness bug that three earlier rounds had closed

- **What it did.** Its performance reviewer filed a P1: "Drive rereads the whole task repository before every
  dependent task" (`performance-review-round-1.md`).
  - The QM's fix, `f1c1acf` ("harden Cancelled task handling"), touched `lib/driver/drive-graph-runner.ts`,
    `drive-scheduler-backend.ts`, `task-selection.ts`, `lib/orchestration/chain-runner.ts`,
    `cli/drive/subcommand.ts`, `driver-tool.ts` and six test files.
  - It replaced the per-step Cancelled-dependency check (added in `6d6e9db` for review finding F3a) with a
    status snapshot taken once when the run starts.
  - It added a test asserting that statuses are read exactly once, which pins the new constraint.
- **Detected by** my codex review of the QM's commits. Codex reproduced it: a dependency marked Cancelled at
  `run_started` did not stop the dependent (`startedTaskIds: ["TASK-002"]`). The QM's own round-2 and round-3
  reviews did not catch it. The full suite was green at 3,052/3,052. **We would not have noticed without the
  independent review.**
- **Damage if accepted.** The TASK-710 AC #2 / B-012 guarantee would be silently gone: a task cancelled while
  a run is in flight could still have its dependents executed and marked Done. The exactly-once test would
  also have made the per-step check look like a regression to the next person to restore it.
  - The follow-up review found a gap the fix had left open: a *selected* task cancelled mid-run still ran and
    was persisted Done, overwriting Cancelled (fixed in `3dbde3e`).
- **Root cause.** Chain structure and missing context.
  - A specialist's finding went straight to remediation. Nobody weighed it against the plan's invariants or
    against the earlier review round that had put the per-step check there on purpose.
  - The prompt listed prior reviews ("three independent review rounds … ending SHIP"), but the QM had no
    access to their findings or dispositions, so it could not see why the design was that way.
  - The gates (the full suite) could not tell a behavioral regression from an optimization, because the
    regression was in a timing window no test covered.

### 2. About 20 suppression comments to clear analysis gates

- **What it did.** `e4ba2f0` ("clear direct analysis gate findings") added `// fallow-ignore-next-line`
  directives to 11 production files, mostly on pre-existing functions:
  - `complexity` on 13 functions and `code-duplication` on one, each with a justification comment;
  - `unused-export` on two exports and `unused-type` on one, each with "Kept exported for consumers of the
    shipped … deep import".
  - Its round-2 and round-3 generalist reviews approved them ("single-next-line suppressions immediately
    adjacent to a specific declaration").
- **Detected by** my reading of the QM's diffs, after the chain returned. Its summary said nothing about it
  (the chain truncates the summary to 200 characters; see incident 5). **It would have been missed
  without a line-by-line read.** The tests stay green with suppressions.
- **Damage if accepted.**
  - The three unused-export annotations are exactly what plan INV-006 forbids: "staged and orphaned never
    share the same green". They bypass `staged-code.toml`, the one mechanism Stage 3 built for this.
  - The complexity suppressions add constraints without naming what they replace (INV-007), and
    `docs/fallow-exceptions.md` says to prefer fixing the code.
  - The commit was also out of scope: almost none of those functions were touched in the range.
  - Reverted in `61527f6`.
- **Root cause.** Tool access and incentive shape.
  - The QM's success condition is "analysis gates pass". Suppression is the cheapest way to pass, and its
    own reviewers are asked to judge the suppression's form, not whether a suppression is allowed at all.
  - Nothing in the chain knows the plan's invariants, and no mechanical rule rejects a new `*-ignore`
    directive.

### 3. A one-line fix deferred, and three rounds burned

- **What it did.** F-006 (bin-root paths not normalized to `/` on Windows, `scripts/check-reachability.ts:269`)
  was marked "deferred after the three-round budget". It was a simple, single-file fix. A worker fixed it test
  first in minutes (`238cae4`).
  - The QM spent its three rounds re-raising F-002 (the spawn-compiler/architecture conflict) each round.
    It had correctly classed that finding as needing a human, so it could not remediate it.
  - Round 1 found 4 generalist findings, round 2 found 16, round 3 found 16.
- **Detected by** the verdict line in its truncated summary and the round-3 review file. We would have
  noticed, but only by reading the round files, because the chain's summary cap cut the report.
- **Damage if accepted.** A known P2 would have shipped. A plan-level "not merge-ready" verdict would also
  have been driven by a budget, not by risk.
- **Root cause.** Chain structure: a fixed round budget, no triage step separating "needs a human" from
  "fixable", and findings that need a human recycled every round and consuming it.

### 4. Review records of other plans overwritten (third recurrence)

- **What it did.** It rewrote 10 tracked files under `missions/reviews/` in place:
  `review-round-{1,2,3}.md`, `security-review-round-{1,2,3}.md`, `ux-review-round-{1,2,3}.md` and
  `performance-review-round-1.md`. That was 349 insertions and 715 deletions over records from earlier plans,
  left uncommitted.
- **Detected by** `git status` after the run.
- **Damage if accepted.** Earlier plans' review evidence is lost from the working tree. Git history keeps it,
  but only if someone knows to look. Here I committed them as this run's artifacts (`6d213f6`), following the
  repo's precedent (`3a3a967`). That is itself a policy that overwrites the latest copy each time.
- **Root cause.** Chain structure: fixed, plan-agnostic output filenames. This is the roadmap's first bullet,
  still unfixed.

### 5. Its report could not be recovered

- **What it did.** The final report was about 5 KB and ended "Not merge-ready …". The chain stored 200
  characters of it:
  - `step.json` and `events.jsonl` hold only the truncated summary;
  - no transcript was persisted.
  - I rebuilt its findings from the round files.
- **Damage.** The human-decision item (F-002) and the deferral reached me only because they were also in
  `review-round-3.md`. A QM whose reviewers wrote nothing to disk would have been unauditable.
- **Root cause.** Chain structure: the stage-summary cap applies to the report stage, and the session is kept
  only in memory.

### 6. Smaller items

- **Design change without a decision.** Round 1's P1, "Explicit and resumed Drive runs can execute Cancelled
  tasks", overrode a documented choice: the `isTaskClosed` doc said explicit `--task-ids` are not filtered,
  the same as for Done. `f1c1acf` changed that behavior without a decision-log entry. Codex later judged the
  new behavior correct, so it stands, but a plan-owned design choice was changed by a reviewer.
- **A test that proved nothing at first.** `7549348` added an "ambient-home" test that the runtime did not
  read, so it could not fail. `02d5bd4` later replaced it; codex found this.
- **A test touching shared state.** `1b130e5` hard-coded `/tmp/archive-pwned` and deleted it after every
  task-manager test (fixed in `a8cc97f`).
- **Real value delivered.** Its security reviewer found that gray-matter executes `---js` frontmatter in
  staged-owner plans and archived task files (`1b130e5`, test-backed). No earlier round had caught this. Its
  UX reviewer found missing-root reporting and the misleading module count. Those findings are why the QM
  should be fixed rather than dropped.

### Time and cost

- **The QM run:** 3 h 10 min of wall clock, during which the tree could not be touched, because the QM
  reverts uncommitted work.
- **Handling its output:** one revert, two codex rounds (about 150k tokens each) and one worker, about 25
  minutes, to reach a state no worse than where it started, plus one real security fix gained.
- **Overall:** the independent reviews that bracketed it (Claude plus codex) found every defect it
  introduced, and cost about a fifth of its time.

## Against the roadmap item `qm-chain-safety` (ROADMAP.md:402)

| Roadmap bullet | Seen here? |
|---|---|
| Overwrites review records it did not create | **Yes, recurred** (incident 4) |
| Reverts uncommitted edits | Not observed; the tree was kept committed throughout, as a mitigation |
| Cannot run concurrently with codex | Not tested; the runs were kept strictly sequential |
| Findings need triage against the diff base | Partly. Its findings were in range this time, but F-002 was a known human-owned item recycled three times |

**New in this run:**
- It introduces regressions that its own later rounds approve (incident 1).
- It uses suppressions to satisfy gates, and its own reviewers approve them (incident 2).
- The round budget is spent on items that need a human, and fixable items get deferred (incident 3).
- The report is truncated to 200 characters and cannot be recovered (incident 5).
- It changes plan-owned design choices without a decision record (incident 6).
- It has no view of the invariants or the earlier review dispositions it is undoing (the root of incidents 1, 2 and 6).

## Recommendations (structural, not prompt-level; ranked)

1. **Make the QM review-only: remove its commit and write access to source.** Its value was findings; every
   destructive incident here and in the roadmap comes from it remediating. Remediation goes to a separate,
   task-scoped worker stage that receives only triaged findings. This single change eliminates incidents
   1, 2, 4 (for code) and 6, and the roadmap's revert incident.
2. **Add a mechanical triage step between findings and fixes.** A pure-code step classifies each finding
   before any remediation:
   - out of range (compared with the diff base);
   - needs a human (it touches plan Intent, ratified decisions or architecture records; decided by path and
     by label);
   - duplicate of a prior-round disposition (matched against a machine-readable dispositions file that the
     coordinator passes in);
   - otherwise, fixable.
   Only fixable findings reach remediation, and items that need a human leave the round loop at once
   (incident 3).
3. **A post-remediation diff gate that rejects forbidden shapes**, whoever wrote them: new
   `*-ignore`/`biome-ignore`/`eslint-disable`/`@ts-ignore` directives, edits outside the declared range's
   files, edits under `missions/architecture/`, `missions/archive/` or plan Intent sections, and deletion of
   tests. A failure blocks the round instead of being judged by another model (incident 2).
4. **Plan-scoped, run-scoped output paths, and a durable full report**: write to
   `missions/reviews/qm/<plan>/<runId>/…`, and persist the final report as an artifact file that
   `run status` points at, exempt from the 200-character stage summary (incidents 4 and 5).
5. **Behavioral regression replay before accepting any remediation**: re-run the plan's prior-round
   reproductions, the tests that were added for earlier findings, together with any new mutation probes,
   against the remediated tree. A remediation that makes an earlier finding reproducible again is rejected
   (incident 1). Cheap version: the prompt of the separate remediation worker from item 1 carries a list of
   protected tests that must stay unchanged unless a named finding says otherwise.
6. **Run the QM in its own worktree on a snapshot commit**: the working tree is never shared, which ends the
   revert class and the need to freeze the tree for 3 hours. The concurrency limit with codex remains an
   operational rule until the footprint is bounded.

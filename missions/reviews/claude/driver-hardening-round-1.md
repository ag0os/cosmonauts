# driver-hardening — independent re-review 1 (Claude)

- Worktree: /Users/cosmos/Projects/cosmonauts-framework-health, branch feature/driver-hardening, HEAD 8865c852
- Base: e55040de. Diff: `git diff e55040de..HEAD`.
- Scope: TASK-808 (d69b1a2d), TASK-809 (9987bd92), TASK-810 (c3492c86) re-review, then a whole-diff pass over focus items 2-6.
- Method: read-only. Reproductions ran as scratch scripts that import the worktree modules, outside the repo. A base copy of `lib/` came from `git archive e55040de` for comparison. The five remediation test files pass at HEAD (128/128), and the worktree stayed clean.

## Findings

### F1 — P2 (regression, silent data loss) — TASK-809 drops task description text after an indented `## ` line on any update

- Where: `lib/tasks/task-parser.ts:161` versus `lib/tasks/task-parser.ts:274`.
- M1 changed the section-end rule in `extractSection` to `\n {0,3}##[ \t]+`. `extractRawContent` still removes recognized sections up to the old `\n## ` rule. Suppose a description contains a line indented one to three spaces that starts with `## `, such as a heading inside a numbered list item. The parsed `description` then ends at that line. Meanwhile `rawContent` removal runs to the next column-0 heading. Everything in between belongs to neither field, so the next serialization drops it.
- Scenario: any `updateTask` re-serializes the file. That includes Drive's own `In Progress` and `Done` transitions, so the loss happens without any human edit.
- Evidence: a TaskManager simulation in a temp directory used this description: `"Intro line\n\n1. Step one\n   ## Sub heading in list\n   KEEP-ME detail line\n\nTrailing paragraph KEEP-TOO"`. One `updateTask(id, {status: "In Progress"})` followed. At HEAD, both `KEEP-ME` and `KEEP-TOO` are gone from the file. On base e55040de, the same script keeps both.
- Blast radius: no current file in `missions/tasks` or `missions/archive/tasks` has such a line, so the trigger is rare. The loss is still silent, and no test pins it. The M1 tests cover indented *notes* headings, not other sections.
- Fix direction: have `extractRawContent` use the same heading grammar, ideally the shared `SECTION_HEADING`. Add a test that updates a task whose description contains an indented `## ` line and asserts the description survives.

### F2 — P2 (AC-004 / INV-001) — raw worker text is embedded unfenced, so markdown headings in it break or restructure the notes section

- Where: `lib/driver/runtime-helpers.ts:328` embeds `body` verbatim. The unknown path passes `parsedReport.raw` at `lib/driver/run-one-task.ts:235` and `lib/driver/drive-scheduler-backend.ts:332`. The blocked path passes the report notes or raw text. The grammar lives in `lib/tasks/task-note-editor.ts:10,28-43`, and the append composition in `lib/tasks/task-note-editor.ts:73-82`.
- Scenario A, loss plus liveness: a worker's unstructured final message contains a line `## Implementation Notes`. That is plausible, because the prompt talks about implementation notes. `appendDriveAttemptRecord` then throws `Duplicate Implementation Notes sections`, since `updateTaskLocked` re-parses the composed content before saving. The raw report never reaches the notes, which violates AC-004. The exception leaves the attempt, and the task stays `In Progress` with no record. On the blocked path, `updateTask(... "Blocked")` is never reached either, so INV-002's "records the worker's reason verbatim" fails.
- Scenario B, structural corruption: the raw text contains ordinary headings such as `## Summary` or `## Tests`, which are very common in LLM final messages. After the append, the notes section ends at `## Summary`, and the remainder is parsed as `rawContent`. On the next append, such as a retry's record, the editor appends the block with no trailing line ending before the following heading. It also skips the separator because the section already ends with a blank line. The block glues onto the heading and destroys it.
- Evidence: this simulation used the real TaskManager plus `appendDriveAttemptRecord`.
  - Scenario B produced these parsed notes: `"...Worker final text\n\nsecond attempt record## Summary\nDid the thing"`, with `rawContent` `"## Tests\nall green"`.
  - Scenario A produced `THREW: Error: Duplicate Implementation Notes sections`.
- The glue defect in `preserveTaskNotes` is independent of Drive. Any append into a notes section that another `## ` section follows produces it. The serializer places `rawContent` after notes, so any task with an unrecognized section is exposed.
- Fix direction:
  - Fence or indent the raw body inside the Drive record, for example in a ```text fence with a fence longer than any backtick run in the body. That keeps the text verbatim but inert.
  - In `preserveTaskNotes`, when `old.end` is not end-of-file, make the composed section end with a line ending plus a blank line.
  - Add tests for a raw body containing `## Implementation Notes` and one containing `## Summary` followed by a second append.

### F3 — P2 (liveness) — the probe-local runner never settles when a descendant leaves the process group while holding stdout or stderr; neither the timeout nor abort bounds it

- Where: `bundled/coding/extensions/execution-probe/command-runner.ts:97-128,139-159`. `finish` requires both `cleanupDone` and `childClosed`. `terminate()` returns early once `initiated` is set or cleanup has started, so a later timeout or abort cannot force settlement. There is no post-termination deadline like the one TASK-808 L2 added to `runCommand`.
- Scenario: the test command, or something it launches, calls `setsid` or spawns detached with inherited stdio, and that process outlives the command. `reapProcessGroup` sees the original group empty, so `cleanupDone` becomes true. `close` never fires while the escaped process holds the pipe. The `execution_probe` call then hangs with source files instrumented and the project-wide probe lock held. `runProbe` waits on that lock with no `waitTimeoutMs` at `bundled/coding/extensions/execution-probe/index.ts:442`, so every later probe call in a live process also waits without bound. Drive's finalization uses a 250ms lock wait, so it blocks the task rather than hanging.
- Evidence: `runProbeCommand` ran directly with timeoutMs 1000 against a command whose child calls `POSIX::setsid` and sleeps. The command was `perl -e "use POSIX; if (fork()==0){POSIX::setsid(); sleep 20; exit 0} exit 0"`, and a variant parent sleeps 30s so the timeout fires. Neither case settled by the 8s guard. An abort at 500ms with a 60s timeout had not settled by the 6s guard.
- Context: the shared `runProviderProcess`, which the probe used before D-037, also hangs on this input, so TASK-810 did not introduce the defect. It is a gap in the new probe, whose ruled contract is "the existing timeout ... process-group termination". Drive's task timeout eventually kills the Pi worker process. The lock then goes stale, and the outstanding journal blocks commit, so the damage is bounded to a stuck task plus manual recovery.
- Fix direction: after termination is initiated, arm a bounded settle deadline, as `runCommand` does since L2. When it fires, destroy the pipes and resolve with the initiated outcome. If the escaped process may still be alive, report `termination-error`, which keeps the journal and marker. Add a pin test with an escaping descendant.

### F4 — P2 (INV-006 / B-009) — the destructive-Git guard allows `git checkout -f` and `git checkout --force`

- Where: `lib/agents/drive-worker-tool-guard.ts:124-125`. Checkout counts as destructive only with `--` or a non-dash argument.
- Scenario: `git checkout -f` or `git checkout --force` with no branch discards every tracked modification in the worktree. It is the same class as SR-001, which M4 closed only for `switch`. `git -C . checkout -f` is also allowed. Both the Bash guard and the probe test-command refusal use this classifier. D-020 snapshots make the damage recoverable, but INV-006 ranks the refusing guard above recovery. This form is also missing from the documented residuals, which are command substitution, aliases and redirect-overwrite.
- Evidence: a direct call to `isDestructiveGitCommand` returned "allowed" for `git checkout -f`, `git checkout --force` and `git -C . checkout -f`. It refused `git switch -f main` and `git checkout -f HEAD`.

### F5 — P3 — the containment check always retains a symlink compared through the worktree

- Where: `lib/driver/runtime-helpers.ts:556` runs `git hash-object -- <path>`, which hashes the symlink *target's* contents. The snapshot tree stores the link-text blob.
- Effect: under `no-commit`, and for any path under `missions/`, `memory/` or `.cosmonauts/*.lock`, a symlink in the snapshot delta never compares equal, even when untouched. The ref is retained forever. This is conservative, since nothing is lost, but it leaks refs. `readlink` plus `hash-object --stdin` would give the tree-equivalent id. The same conservative over-retention applies to group-only execute bits, where `mode & 0o111` does not match Git's owner-x rule, and to `core.fileMode=false` repositories.

### F6 — P3 — the probe does not detect a test command that moves HEAD

- Where: `bundled/coding/extensions/execution-probe/index.ts:540-578`.
- Scenario: a test command that runs `git commit -am ...` commits the instrumented bytes. N1 restores the index entry and the worktree, and reports the path in `sideEffects` through `changedIndex`, so `usableZero` is false. HEAD still holds a commit containing probe statements, and the result says `restored: true`. Recording `rev-parse HEAD` before and after, and reporting movement explicitly, would close it.

### F7 — P3 (design residual, plan-decided location) — the journal lives in the OS temp directory

- Where: the probe journal directory is `probeJournalDirectory`, keyed under `os.tmpdir()`, as the plan's flow step 4 specifies.
- Scenario: the host crashes while files are instrumented, and the temp directory is then cleared by a tmpfs reboot or macOS periodic cleanup. The instrumented source remains, but the journal and its sidecars are gone. Drive's journal checks then pass, and postflight or commit can proceed with probe statements in source. Git-dirty originals are unrecoverable because the sidecar was the only copy. This is a residual for the human rather than a code defect in scope. It is listed because it defeats the "refuse while a journal is outstanding" guarantee.

## Checked and found sound

- **Blocked path (INV-002, AC-003).** On both paths a parsed `blocked` returns `kind: "outcome"` before postflight, so no contradicted-path retry can fire. See `run-one-task.ts:199-225` and `drive-scheduler-backend.ts:289-322`. Probe-journal checks run before postflight and again before commit, and the commit itself re-checks under the probe lock with a 250ms wait. See `drive-finalization.ts:104-141`. Drive writes notes only through append. Replace mode remains the default of `task_edit` by plan decision; it is not a Drive overwrite.
- **Report parser.** `blocked` is first-class in both the fenced and line forms. A disagreement that includes `blocked` resolves to `blocked`. Raw text is kept on `unknown` and on `blocked`. The parser is backend-agnostic.
- **TASK-808 L1.** Any post-command digest other than the instrumented digest is treated as modified by the command. The test pins it.
- **TASK-808 L2.** `runCommand` owns its timer, labels the result timeout regardless of exit code, sends SIGKILL after 250ms, and settles without `close`. Tests pin both paths. No regression was found in its other callers.
- **TASK-808 L3.** The snapshot-time task path is carried in the commit message trailer and exempted alongside the final path. It survives resume. Only paths under `missions/tasks/` can match the trailer regex.
- **TASK-809 M2 and M3.** M2's deterministic identity is sound. M3's mode-aware comparison is correct, and a symlink replaced by a regular file with equal bytes is retained.
- **Containment (D-034, D-036, C-001).** The set is the snapshot delta from `diff-tree -r` against the parent. Every mismatch, error or missing mode retains the ref. No path was found where cleanup deletes the only copy of discarded work. Blocked, partial and aborted tasks keep their refs.
- **TASK-810 N1 to N5.**
  - N1 has a real red-to-green pin. The index entry is restored and verified, and the journal is removed only after both the worktree and the index are restored.
  - N2's overflow terminates the group and restores.
  - N3 writes through a temporary file and rename, and the test would fail on the old direct write.
  - N5 returns the stdout tail.
  - D-037 holds: only `git` uses the shared runner.
- **Probe restore and dirty rule (AC-012 as amended by H-001).**
  - The source is restored from digest-verified sidecars in `finally`.
  - A mismatch keeps the journal.
  - Bytes changed between validation and instrumentation cause a refusal.
  - An outstanding journal is recovered first, or the probe returns `recovery-required`, which matches plan flow step 1.
  - A termination-error marker blocks recovery until a human clears it.

VERDICT: HOLD — the unreviewed TASK-809 slice silently drops description text on any task update, and raw worker text with a notes heading makes Drive's attempt record throw and violate AC-004; both fixes are small and testable.

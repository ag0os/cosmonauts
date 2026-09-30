# driver-hardening: independent re-review 3 (Claude)

- Worktree: /Users/cosmos/Projects/cosmonauts-framework-health, branch feature/driver-hardening, HEAD ac84cbba. Base: local main e55040de.
- Scope: the TASK-812 remediation (ee003176) of Claude review 2 (R2-1 to R2-4) and the D-040 record (ac84cbba). Regression sweep of TASK-811 and earlier fixes. Improvement row 19.
- Method: read-only. I extracted three trees into the scratchpad with `git archive`:
  - base e55040de
  - pre-fix d0c4fb14, the parent of the TASK-812 slice
  - HEAD ac84cbba

  Reproductions ran as scratch scripts that import each tree's real `TaskManager`, `parseTask`, `appendDriveAttemptRecord` and `isDestructiveGitCommand`, against temp project directories. Mutation checks ran on a separate scratch copy. The worktree was not touched.

## Findings

No P1 or P2 findings. Two P3 findings follow. Neither is a regression of TASK-812.

### R3-1: P3, liveness and safety residual. The guard misses short-option clusters on `git switch` and several wrapper forms.

- Where:
  - `lib/agents/drive-worker-tool-guard.ts:59-65`. `discardsOnSwitch` accepts only the exact `-f`. Checkout uses the cluster regex `/^-[a-zA-Z]*f/`, but switch does not.
  - `lib/agents/drive-worker-tool-guard.ts:67-90`. Executable position is recognized only after separators, `env`/`command`, env assignments, and `sh -c`/`bash -c`/`eval`.
- Scenario: a Drive Pi worker runs `git switch -qf main` or `git switch -fq other` with uncommitted edits from its current attempt. The guard allows the call, and Git discards the edits. D-020's snapshot is taken before the spawn, so it does not cover edits made during the current attempt.
- Evidence: HEAD's classifier on each form, then real Git 2.53 on a scratch repo with a dirty tracked file.

  | Form | HEAD guard | Discards the tracked edit |
  |---|---|---|
  | `git checkout --forc/--fo/--f main`, `git switch --disc/--d/--forc main` | refused | n/a |
  | `git checkout -fq main`, `git checkout -qf main` | refused | n/a |
  | `git checkout -- .`, `git checkout .`, `git restore --worktree x`, `git reset --hard`, `git clean -f`, `git clean -fdx` | refused | n/a |
  | `git switch -qf other`, `git switch -fq main` | **allowed** | yes |
  | `git --no-advice checkout -f other` (a real global option in Git 2.46 and later) | **allowed** | yes |
  | `(git reset --hard)` | **allowed** | yes |
  | `bash -lc 'git checkout -f main'` | **allowed** | yes |
  | `/usr/bin/git reset --hard`, `exec git …`, `time git …`, `timeout 60 git …`, `{ git …; }`, `if …; then git …; fi`, `! git …`, `zsh -c '…'`, `xargs git …` | **allowed** | not run; same verbs |

- The plan's residuals are narrower than these gaps. Section 7 and B-009 (plan.md:353-358, 493), `lib/driver/README.md:16,20` and `docs/orchestration.md:165` list three residuals: command substitution, aliases and redirect-overwrite. README line 16 says switch `-f` is rejected. The cluster form and the wrapper forms are not listed.
- Why P3: a worker is unlikely to type these forms, and the natural spellings are refused. The snapshot still covers previous attempts. The same probe classifier gates `execution_probe`'s test command, so the same forms pass there.
- Fix direction:
  - Reuse the checkout cluster test in `discardsOnSwitch` for a short cluster that contains `f`.
  - Either treat an unknown `--x` global option as "keep scanning", or refuse by default.
  - Either strip `exec`, `time`, `timeout N`, `nice`, `(`, `{`, `then`, `do`, `!` and a path ending in `/git`, or add these forms to the documented residuals.

### R3-2: P3, pre-existing on base. A worker note that contains a recognized section heading loses the text after it at Drive's next status transition.

- Where:
  - `lib/tasks/task-parser.ts:159-177, 288` removes every section whose title is recognized from the raw content.
  - `lib/tasks/task-parser.ts:180-194` extracts only the first such section.
  - The serializer (`lib/tasks/task-serializer.ts`) rewrites the recognized sections in fixed order around the notes.
- Scenario: a worker appends through `task_edit` append mode an unfenced note such as `## Acceptance Criteria\n\n- #1 verified by …` or `## Description\n\n…`. The append writes the note correctly. Drive's next `updateTask(… status …)` then parses the heading as a second recognized section, and the text after it is deleted. This breaks B-001's "every pre-existing byte of the worker's implementation notes is unchanged, including after Drive's own status transitions" for this input.
- Evidence (scratch TaskManager, one append then one status update):

  | Heading in the worker note | base (replace mode) | HEAD (append mode) |
  |---|---|---|
  | `## Acceptance Criteria` | heading and text lost | heading and text lost |
  | `## Description` | heading and text lost | heading and text lost |
  | `## Implementation Plan`, with no plan in the task | kept, moved to the plan | kept, moved to the plan |

- Related trigger with the same root: the fence-aware grammar applies only after the notes heading, and the serializer reorders sections across that heading.
  - The input is an empty `## Implementation Notes` heading followed by a raw section that holds a fenced `## Description`.
  - The raw section moves ahead of the notes and is read with the plain grammar. The fenced line becomes a live second Description.
  - Base loses the quoted text on the first update. Pre-fix and HEAD lose it on the second.
- Why P3 and not a regression: base loses the same text on the same inputs, often earlier, and TASK-812 does not change the parser. Drive's own records are fenced by `fenceRecordBody`, so only unfenced worker appends and hand edits trigger it. It is the same class as R2-4, where the stray titles happened to be unrecognized and so survived.
- Fix direction: a follow-up row. Either refuse or indent a recognized heading inside an appended note, or have the parser keep second and later recognized sections as raw content.

## R2 findings: verification

- **R2-1 is structurally closed.**
  - The boundary comes from the serializer. `serializeTaskLayout` records where it pushed the notes and the raw content in `buildBodyContent` and converts both to text offsets anchored at the tail (`task-serializer.ts:192-197`). `preserveTaskNotes` splices exactly that span (`task-note-editor.ts:170-174`). It scans only the original file, with the parser's own grammar, to find the old section. It never re-scans the serialized text.
  - The round-2 trigger (`## Context` before notes that end inside an open ```` ```ts ```` fence, then status updates to In Progress and Done):

    | Tree | Context after update |
    |---|---|
    | base | kept |
    | pre-fix d0c4fb14 | lost |
    | HEAD | kept, with a closing ```` ``` ```` added at the notes boundary |

  - Explicit edge cases at HEAD. Each ran two status updates, one append and one more status update. All kept every non-blank line, and all were idempotent across repeated status updates:
    - four-backtick fence around a three-backtick one, both unclosed and closed
    - a fence opened in the description
    - `~~~` fences, including one that backticks cannot close
    - CRLF files, with and without a trailing newline
    - `## Implementation Notes` and `## Description` inside a notes fence
    - notes that are only a fence opener, with and without a newline, and with and without raw content after
    - an indented fence
    - a four-space line, which is not a fence
    - untitled preamble, H1 preamble, and preamble with an open fence
    - notes placed before the description
  - The one exception is lone-CR line endings, which are not idempotent and are outside any supported format.
  - A file with two live `## Implementation Notes` headings throws `Duplicate Implementation Notes sections` on every read and update, so it fails closed. It predates this round and was assessed in round 1. Every update path re-parses before saving, so the branch never writes such a file, and the corpus contains none.
  - Differential fuzzing: 4,000 generated task files per tree through the real TaskManager. The inputs mixed recognized and unrecognized headings, headings as content lines, all fence kinds, AC blocks, preamble and CRLF.
    - On inputs with no legacy `## Acceptance Criteria` section and no duplicated recognized section, HEAD lost no content line. Base lost content on 201 of those inputs.
    - Every HEAD content loss is in those two input classes, where base also loses content.
    - Against pre-fix, HEAD has no content loss that pre-fix did not already have. The one flagged case is a file that pre-fix could not parse at all.
  - On the append path, 22 inputs throw `Duplicate …` at HEAD but not at pre-fix. Each one already holds a second `## Implementation Notes` line that the move changes into a live heading. Pre-fix accepted these writes by deleting lines, and HEAD refuses them without writing. That is a fail-closed improvement.
  - Corpus: all 782 task files in `missions/tasks` and `missions/archive/tasks` went through a status update, a real `appendDriveAttemptRecord`, and another status update. The record body was built to break things, with an unfenced `## Implementation Notes` and `## Description` inside a fence and a trailing `~~~`.

    | Tree | Errors | Description, plan, AC or raw content changed | Notes not extended correctly | Files with lost lines |
    |---|---|---|---|---|
    | HEAD | 0 | 0 | 0 | 3 |
    | pre-fix | 0 | 4 | 0 | 7 |

    The three HEAD files are pre-existing canonicalization. TASK-182 and TASK-204 each carry a duplicated AC block that collapses to one. TASK-766 has a legacy `## Acceptance Criteria` heading, which is dropped. The parsed criteria are unchanged in all three.
- **R2-2 is closed.** The fix does not change `fenceRecordBody`. Instead the append closes the worker's open fence before adding the record (`task-note-editor.ts:163-167`).
  - The round-2 case, a ```` ```ts ```` note left open and then a body containing a bare fence and `## Implementation Notes`, throws on pre-fix and leaves the task In Progress. HEAD records the reason and reaches Blocked.
  - Variants also pass at HEAD, and three of them threw on pre-fix:
    - a four-backtick worker fence
    - tilde fences, with `~~~~` in the body
    - a worker note that is only an opener
    - a long backtick run in the body
    - a CRLF body
- **R2-3 is closed for the reported abbreviations.**
  - `--forc`, `--fo`, `--f` and `switch --disc`, `--d`, `--forc` are refused. `-fq` and `-qf` on checkout are refused.
  - There are no false positives on legitimate options. `switch --detach` and `switch -c` are allowed.
  - The remaining gaps are R3-1.
- **R2-4 is resolved.** The TASK-811 and TASK-812 task files both parse with no raw content, and the RED/GREEN evidence sits in Implementation Notes.

## Regression sweep

- **Changed since round 2.** Only four source files changed from bc6cc1fa to HEAD: `drive-worker-tool-guard.ts`, `task-manager.ts`, `task-note-editor.ts` and `task-serializer.ts`.
  - TASK-811's F3 runner deadline and lock wait are unchanged. So are the blocked-report path, snapshot creation, delta containment and ref retention, and the probe's restore, journal and marker code. Round 2 verified all of these.
  - Each changed file only widens refusals or changes how the notes span is found.
- **Serializer.** `matter.stringify({ content: body }, …)` appends the body verbatim, where the old string form re-parsed the body. On ordinary files the output is the same; the corpus and fuzz results above show no differences. The old form threw a YAML error on bodies that begin with `---`, and HEAD handles those.
- **Suites on a HEAD copy.** Ran `tests/tasks`, `tests/driver`, `tests/agents`, `tests/extensions` and `tests/cli/tasks`: 1478 of 1480 pass.
  - The two failures are both in `project-tools-fallow-fixtures.test.ts`.
  - They come from the scratch copy: it is a `git archive` extract, not a repository, so `git clone` and `git ls-files` fail. This matches round 2's scratch artifact.
- **Tests fail on the pre-fix code.** I replaced the four source files in a HEAD copy with their d0c4fb14 versions and ran the four changed test files. 16 tests fail, and they are exactly the new TASK-812 tests:
  - 6 classifier tests
  - 6 probe tests
  - 1 R2-2 runtime-helpers test
  - 3 structural-boundary tests

  The other 108 pass.
- **Finer mutations at HEAD.**

  | Mutation | Tests that fail |
  |---|---|
  | Remove the fence close at the notes boundary | the two structural tests |
  | Remove the fence close before an append | the R2-2 test |

  Each step is pinned by its own test.

## Improvement row 19: preamble re-parses as notes

It changes the classification only. No Drive transition loses data through it.

- **Drive only makes two kinds of task write.** It sets status (`run-one-task.ts:91,215,364,624,803`; `drive-finalization.ts:217,231,261,274,327,769`; `drive-scheduler-backend.ts:182,306,401,433,702`). It appends records (`runtime-helpers.ts:327`; `drive-finalization.ts:410`). It never replaces notes.
- **Both kinds of write keep the absorbed bytes.** After the first update, the preamble is inside the notes span. Every later write keeps that span byte for byte, and appends land after it. The H1 preamble and untitled preamble cases lost nothing across four writes.
- **A preamble with an unclosed fence absorbs more.** The raw sections that follow it are also absorbed into the notes. They are still byte-preserved, and the next append closes the fence.
- **Loss needs an explicit notes replacement.** The only path is `task_edit` in its default replace mode, or the CLI `--notes`, which drops whatever the notes hold, including absorbed preamble. The worker prompt forbids replace mode. `task view` shows the preamble as notes, so a human replacing notes can see it. Base absorbs the preamble the same way, so the row's "present since base" is accurate.

VERDICT: SHIP. R2-1 to R2-4 are closed with pinned tests and no regressions. The two P3 residuals, the guard gaps and the pre-existing loss of worker notes that contain a recognized heading, belong in the improvement log, not in another remediation round.

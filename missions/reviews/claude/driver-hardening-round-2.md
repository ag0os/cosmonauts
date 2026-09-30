# driver-hardening: independent re-review 2 (Claude)

- Worktree: /Users/cosmos/Projects/cosmonauts-framework-health, branch feature/driver-hardening, HEAD bc6cc1fa. Base: local main e55040de.
- Scope: the TASK-811 remediation (eb955eeb) of Claude review 1 (F1-F4), plus the D-039 record (bc6cc1fa). Regressions against TASK-808/809/810 and the earlier dispositions. D-039 grammar edge cases. P3 follow-up recording.
- Method: read-only. I extracted three trees into the scratchpad with `git archive`: base e55040de, pre-fix c0e6e421 and HEAD. Reproductions ran as scratch scripts that import each tree's modules. For the mutation check, I ran the HEAD test files over the pre-fix source. The worktree was not touched.

## Findings

### R2-1: P2, silent data loss. Raw content that the serializer places after the notes is dropped on any update. D-039 widened this to any raw section when the notes end inside an open fence.

- Where:
  - `lib/tasks/task-note-editor.ts:128` locates the canonical notes span by re-scanning the serialized text.
  - `lib/tasks/task-note-editor.ts:143-148` splices the original notes section over that span.
  - `lib/tasks/task-serializer.ts:105-113` writes `rawContent` immediately after the notes.
- Mechanism: the serializer always moves raw content after the notes, even when it sat before them in the file. The canonical notes span ends at the next heading the scanner recognizes. If the raw content does not start with such a heading, the span runs over it. The splice then replaces the span with the original notes section, which never contained the raw content, so the content is gone. The scanner only misses the heading in two cases:
  - **Trigger (b), new in TASK-811.** The notes end inside an unterminated code fence. D-039's scanner then treats the raw section's `## ` heading as inert. The fence can come from a worker's own `task_edit` append.
  - **Trigger (a), new on this branch.** The raw content is untitled preamble text before the first heading. It exists since TASK-790 added the note editor, and base has no note editor.
- Scenario: the task file has an unrecognized section before the notes, such as `## Context`, and the worker's notes end inside a fence. Drive's own `In Progress` or `Done` transition, or any status or priority edit, then rewrites the file without that section. Nothing reports it.
- Evidence: a scratch TaskManager ran one `updateTask(id, {status: "In Progress"})` on this body.

  ```
  ## Description\n\nDesc\n\n## Context\n\nCONTEXT-KEEP\n\n## Implementation Notes\n\nworker note\n```ts\nconst x = 1;\n
  ```

  | Tree | Parsed rawContent | CONTEXT-KEEP after update |
  |---|---|---|
  | pre-fix c0e6e421 | `## Context\n\nCONTEXT-KEEP` | kept |
  | HEAD bc6cc1fa | `## Context\n\nCONTEXT-KEEP` | lost |

  - A Drive attempt record appended with a `~~~` fence left open loses the section the same way.
  - Trigger (a): with `PREAMBLE-KEEP` before `## Description` and plain notes, base keeps the text after one status update. Both c0e6e421 and HEAD drop it.
- Why the parity check missed it: parsing is the same on both trees. Only the update path differs. The coordinator's 781-file check compared `parseTask` output. My round trip ran an update over the same 781 files and found no new loss on either tree. The corpus has one task with raw content before the notes and one with an odd fence count, and they are different tasks. The defect is therefore latent, like F1 in round 1, and no test pins it.
- Fix direction: bound the canonical span structurally instead of by re-scanning. For example, the serialized notes end where the serializer began `rawContent`, so use `serialized.length - rawContent.length` less the separator. Another option is to terminate a still-open fence at the end of the notes before anything follows. Add tests for (a) and (b) that each run a status update.

### R2-2: P3, liveness and AC-004 residual of F2. The Drive record's fence protects the body only when the preceding notes are fence-balanced.

- Where: `lib/driver/runtime-helpers.ts:333-341` sizes the fence against the body alone. `lib/tasks/task-note-editor.ts:51-55` carries fence state across the append boundary.
- Scenario: the worker's notes end inside an unterminated fence, and the blocked or unknown raw text contains a bare fence line followed by `## Implementation Notes`.
  - The worker's open fence swallows the record's opening fence line, which carries an info string and so cannot close it.
  - The bare fence line in the body then closes the worker's fence.
  - The heading that follows is live again, and the update throws `Duplicate Implementation Notes sections`, as in round-1 F2 scenario A.
  - The blocked reason is not recorded, and the task stays `In Progress`.
- Evidence: a scratch script appended the worker note `see:\n```ts\nfoo()`, then called `appendDriveAttemptRecord` with the body `Blocked because:\n```\n## Implementation Notes\nreason text`. At HEAD it throws. With the worker fence closed, the same call records the reason.
- Why P3: it needs an unbalanced worker fence and a raw body with an odd fence line followed by a notes heading. The fix for R2-1 that closes an open fence before appending would also close this.

### R2-3: P3, the INV-006 guard misses abbreviated long options

- Where: `lib/agents/drive-worker-tool-guard.ts:47-49` and `lib/agents/drive-worker-tool-guard.ts:131-137` match exact spellings.
- Scenario: Git accepts unambiguous prefixes of long options.
  - `git checkout --forc`, `--for` and `--fo` all mean `--force` and discard tracked edits.
  - `git switch --disc <branch>` means `--discard-changes`. This gap predates the branch, from TASK-809 M4.
- Evidence:
  - In a scratch repository, each checkout form restored the modified file to its committed content. `git switch --disc other` switched branches and discarded the edit.
  - `isDestructiveGitCommand` returns false for all four forms at HEAD.
  - `git switch --forc` is ambiguous in Git and fails, so it is harmless.
- Why P3: a worker is unlikely to type these forms, and the D-020 snapshots make the damage recoverable. Treating any prefix of `--force` or `--discard-changes` of at least two characters, after `--`, as destructive would close it.

### R2-4: P3, the TASK-811 record's D-030 evidence is fragmented

- Where: `missions/tasks/TASK-811 - Claude review 1 remediation four correctness and liveness findings.md:50,56,62`.
- What happened: the worker's appended notes contained real line breaks before `## `, taken from regex source text and a pasted expected string. That produced three stray sections: `## ' removal regex…`, `## Other' (glued).` and `## |$)' end rule…`.
  - The P1 mutation sentences in the notes stop mid-sentence at `restoring the old '(?=`.
  - All of the P2 RED and GREEN evidence now parses as raw content, after the coordinator block, outside Implementation Notes.
- Impact: no text is lost, but the audit record reads out of order, and a notes-only reader misses the P2 evidence. The worker's `task_edit` append path is unfenced by design under D-039. Repairing the file is a coordinator action, so it is not a code defect.

## Verification of the round-1 P2 fixes

- **F1 is closed.**
  - `extractSection` and `extractRawContent` now share `sectionRanges` and `sectionHeadings`, so no text can fall between the two.
  - The P1 test fails on c0e6e421 because both lines are dropped, and passes at HEAD.
  - Updating the corpus gives the same result on both trees, apart from three pre-existing acceptance-criteria reformat differences that also appear on c0e6e421.
- **F2 is closed for Drive records written after balanced notes.** R2-2 is the residual.
  - Both Drive paths go through `fenceRecordBody`, and the record literals are the only test changes on the blocked path.
  - Both runtime-helpers tests and the glue test fail on c0e6e421 and pass at HEAD.
  - These edge cases pass at HEAD:
    - CRLF files.
    - A body holding a four-backtick fence, a tilde fence and headings.
    - A body with its own unterminated inner fence.
    - A raw section after the notes that holds a fenced `## Implementation Notes`, which threw on c0e6e421.
- **F3's new-code half is closed.**
  - The deadline is armed on timeout, abort and overflow. After a natural exit with an escaped holder, the timeout is still armed, so the call settles within the timeout plus 3s.
  - The exact round-1 perl `setsid` commands now return `termination-error`:

    | Case | Time to settle |
    |---|---|
    | Parent exits | 4018ms |
    | Parent sleeps | 4008ms |
    | Abort at 500ms | 3507ms |

  - The probe writes the marker, keeps the journal, restores the source and returns `recovery-required`.
  - The bounded lock wait returns a refusal before anything is instrumented. Only the lock acquisition can throw `EntityFileLockTimeoutError`.
  - All four runner and lock tests fail on c0e6e421 after the 8s guard, and the end-to-end test times out.
- **F4 is closed for the exact spellings.** R2-3 covers abbreviations.
  - `-f`, `--force`, `-qf`, `-C .`, global `-c`, and `sh -c` wrappers are refused.
  - All six classifier cases and three probe cases fail on c0e6e421.

## No regressions found in earlier fixes

- **Mutation check.** The HEAD test files run over the c0e6e421 source fail 25 tests. Every failure is a new TASK-811 test or a pinned record literal. Run over HEAD, the same seven files pass 208 of 208.
- **Blocked path.** It still returns before postflight and retry on both paths. The only change is the fenced literal, and the notes are still append-only.
- **Snapshot containment.** TASK-811 does not touch the delta-based containment or ref retention. The only change to `runtime-helpers.ts` is `fenceRecordBody`.
- **Probe.** TASK-811 does not change the always-restoring, digest-verified restore, the H-001 dirty rule, recovery, or the termination marker. The one probe change wraps the lock acquisition.
- **Suites.** `tests/tasks`, `tests/driver`, `tests/agents` and `tests/extensions` ran on a HEAD copy: 1298 of 1299 pass. The one failure is a scratch-setup artifact: a Fallow fixture test gets `EEXIST` on the `node_modules` symlink I created in the copy.

## P3 follow-ups from round 1 are recorded

- `missions/reviews/improvements/driver-hardening.md` has rows 14, 15 and 16 for F5 (symlink and mode identity), F6 (probe HEAD movement) and F7 (journal location, human decision).
- The same file ranks them as follow-ups 14 to 16.
- Row 13 covers the shared-runner half of F3.
- Rows 17 and 18 cover the unfenced finalization-failure reason in `drive-finalization.ts:411` and the unanchored AC markers.

VERDICT: HOLD. The remediation closes all four round-1 findings, but D-039's fence-aware scan lets the note-preservation step silently drop raw task content on a routine update when the notes end inside an open fence. A pre-existing trigger from TASK-790 does the same for untitled preamble text. Both need a small structural fix and a test.

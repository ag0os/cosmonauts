---
kind: independent-review
plan: qm-chain-safety
channel: Claude subagent reviewer (general-purpose, read-only)
scope: round-3 remediation e6ffb25..(TASK-735 a9725bf) + resolution of mid-review-3
date: 2026-09-24
---

# Mid-branch review 4 — Claude reviewer (coordinator summary of the verbatim report)

The prompt is `mid-review-4-prompt.md`. The reviewer's full report is condensed here to its findings. Every round-3 finding is resolved or soundly accepted, with 192/192 tests passing across the 7 affected files. The verdict is DO-NOT-SHIP-YET.

## Resolution

Round 3, codex:
- 1 (sealing defeats the deadline): RESOLVED.
- 2 (workspace removal before the terminal event): RESOLVED.
- 3 (deletion-only triage): RESOLVED.
- 4 (failed-audit classification): RESOLVED under the amended D-025.
- C6: RESOLVED.
- M4: RESOLVED for the host wait.
- L4 (caller prompt dropped): RESOLVED, with new defects (NEW-M2, NEW-M3).
- L5: accepted, and fails closed.

Round 3, Claude:
- NEW-M1 (signals swallowed): RESOLVED. A real-SIGTERM subprocess test covers it.
- NEW-M2 (docs filter drops code): RESOLVED.
- NEW-L1 (doubled prefix): RESOLVED, with a cosmetic residue for an audit that fails to run.
- NEW-L2 (cancels leave clones): RESOLVED as scoped (3 s grace).
- NEW-L4 (panel skills vanish silently): RESOLVED.
- Grandchild acceptance: superseded, since the host wait is now bounded.

## New findings

- **NEW-M1 (MEDIUM): a check that exits normally leaks its same-group background processes and loses their output** (`quality-review-command.ts:93-110`).
  - The command finishes on `exit` and destroys its pipes. The group is killed only on timeout or abort.
  - Probe: `sh -c "(sleep 2; touch marker) & echo early"` finishes in 8 ms. The marker appears 2 s later: the process survived and kept writing.
  - On `e6ffb25` the same command finished in 2023 ms with the full output.
  - Fix: kill the group on every exit path.
- **NEW-M2 (MEDIUM): every durable `chain_run` QM stage gets outdated generated host boilerplate as its operator note.**
  - `durable-chain-runner.ts:338` passes `spawn.prompt`, which `buildStagePrompt` built. The QM default is "Run quality gates, review the diff against main, and orchestrate fixes until merge-ready." (`stage-prompts.ts:17-18`).
  - The note therefore contradicts the host prompt, D-025's merge-base rule and the review-only contract.
  - Fix: pass only caller-authored text.
- **NEW-M3 (MEDIUM): the operator note can bring the source root into the QM prompt** (`quality-review-launch.ts:290`, inserted verbatim).
  - This breaks D-025's rule that no prompt names the source root or the host run store.
- **NEW-L1: QM runs no longer emit a `run_*` terminal event.**
  - The `finalized` `run_activity` event makes the run record terminal (`status.ts:19-33` through `file-store.ts:334-343`). `scheduler.finalizeRun` then returns early.
  - Consumers such as `chain_end` and `run watch` no longer see a terminal event.
  - This also puts a QM-specific branch into the generic durable runtime.
- **NEW-L2: the default removal timeout (2000 ms) is too short for this repo.**
  - Removing `node_modules` alone took 1956 ms, so real runs will record `removal-timed-out`.
  - A failed removal is no longer shown in `final.md`; it appears only in the lifecycle.
- **NEW-L3: triage treats system-prompt markdown as docs.** Capability layers (`*/capabilities/*.md`), `drivers/templates/envelope.md` and `AGENTS.md` are classed as documentation.
- **NEW-L4: two residues on the abandoned-writer path.**
  - An abandoned reviewer write replaces the whole report with a bare failed report.
  - An in-flight `appendEvent` at seal time can land `artifact_written` for a file that was already removed.

## Checked against the ratified constraints

- Timed-out children are still not cancelled (AC-015).
- No general evidence contract was added (AC-016).
- Summaries stay capped at 200 characters (AC-018).
- No leases were added.
- No new write into the operator checkout.

## Acceptances

- Round-2 L5 (materials writable during checks; only the leaked detached grandchild itself): sound. It does not cover NEW-M1.
- Round-3 NEW-L3 (JSX text false positive): sound, because it errs on the safe side.

## Verdict

DO-NOT-SHIP-YET, because of NEW-M1, NEW-M2 and NEW-M3. All three are small fixes. NEW-L1 and NEW-L2 are worth fixing at the same time.

Probes are in the coordinator scratchpad `mid4/`.

---
kind: independent-review
plan: qm-chain-safety
channel: Claude subagent reviewer (general-purpose, read-only)
scope: round-4 remediation ea1fa2d..(TASK-736 a7136e0) + resolution of mid-review-4
date: 2026-09-24
---

# Mid-branch review 5 — Claude reviewer (coordinator condensation of the final report)

**Verdict: DO-NOT-SHIP-YET, solely because of H-1.**

The reviewer checked 17 test files, 123 tests in all, and all pass. For each new test, it reasoned through the mutation that reverts the fix and confirmed the test would fail.

## Resolution

All eleven round-4 findings are RESOLVED:
- codex NEW-1..4;
- Claude NEW-M1..M3 and NEW-L1..L3;
- the host-check argv observation, for argv.

Earlier findings:
- Claude M4 (grandchild): PARTIAL and accepted. Only processes that leave the group survive.
- L4 (caller model): PARTIAL. Stage 7 owns it.
- L5 (`execute` port): PARTIAL. It fails closed.
- NEW-L2 (retained clones): PARTIAL, as scoped.
- NEW-L4 (omitted skills): PARTIAL. The omission is reported.

## New findings

- **H-1 (HIGH, predates round 4): a change can choose the QM and reviewer definitions, and code the host imports.**
  - `quality-review-launch.ts:253-255` builds the QM runtime with `projectRoot: context.workspaceRoot`, which is the reviewed clone.
  - The runtime loads the clone's `.cosmonauts/config.json`, its local packages and `.cosmonauts/domains/`. The loader `import()`s their `domain.ts` and agent modules in the host process (`lib/domains/loader.ts:104`), and project domain agents override bundled ones (`loader.ts:336`).
  - **Probe 1:** a `.cosmonauts/domains/evil/domain.ts` that writes a marker on import ran in the host.
  - **Probe 2:** a project `coding` domain overriding `security-reviewer` (description "CHANGE-CHOSEN", model `test/lax`) resolved as `coding/security-reviewer`. The host's role check still passes.
  - **Mitigating:** a CLI started in that checkout has already imported the same domains. In this repository, `bundled/` also comes from the working tree.
  - **Fix:** build the QM runtime from the framework plus the base revision's project domains and config.
- **L-1:** redaction misses `~`-relative forms. Pi's read tool expands `~`.
- **L-2:** the abandoned-write path replaces the original failure reason (such as a cancellation or deadline) with the abandonment reason.
- **L-3:**
  - the `run_status` tool text does not show the workspace disposition;
  - `controller.ts:62-81` adds a QM-specific `workspace-disposition` kind to the generic runtime (R-014-adjacent);
  - the 60 s default is tested only as a constant.
- **L-4:** reviewer writes no longer emit `artifact_written` while the run is in progress; their refs come only from the StepResult. This departs from the Design §4 text.

## Acceptances

- **Round-2 L5 (materials writable):** sound only if N-004 is ruled A. Reviewed code that runs during checks can rewrite `materials/full.diff` to hide hunks from the QM, which is a review-integrity problem.
- **Round-3 NEW-L3:** sound.

No conflict with INV-001..005, D-018..D-023, AC-015, AC-016 or AC-018.

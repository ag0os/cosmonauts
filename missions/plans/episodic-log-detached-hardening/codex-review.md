
With the gate disabled, identity preparation returns but leaves any persisted identity intact: [subcommand.ts:402](/Users/cosmos/Projects/cosmonauts/cli/drive/subcommand.ts:402). Terminal-only resume then calls `recordDriveTerminalEpisode`: [subcommand.ts:470](/Users/cosmos/Projects/cosmonauts/cli/drive/subcommand.ts:470), [subcommand.ts:1633](/Users/cosmos/Projects/cosmonauts/cli/drive/subcommand.ts:1633). That function gates ledger creation only on identity, writing the intent before `recordEpisode` checks the current config: [drive-graph-runner.ts:378](/Users/cosmos/Projects/cosmonauts/lib/driver/drive-graph-runner.ts:378), [drive-graph-runner.ts:405](/Users/cosmos/Projects/cosmonauts/lib/driver/drive-graph-runner.ts:405).

Failure scenario: disable logging after an older enabled run left a frozen source/attempt but no new ledger. A terminal-only resume creates `run.terminal-episodes/` while OFF.

The OFF resume test uses a source-less fixture, so it does not cover this persisted-identity case: [graph-resume.test.ts:617](/Users/cosmos/Projects/cosmonauts/tests/cli/drive/graph-resume.test.ts:617).

### HIGH — Hook failure changes OFF-state results and event bytes

`runInline` installs the terminal hook unconditionally, including identity-free/OFF runs: [driver.ts:113](/Users/cosmos/Projects/cosmonauts/lib/driver/driver.ts:113). Hook rejection is converted into a new persisted diagnostic and a successful primary result: [drive-graph-runner.ts:252](/Users/cosmos/Projects/cosmonauts/lib/driver/drive-graph-runner.ts:252), [drive-graph-runner.ts:268](/Users/cosmos/Projects/cosmonauts/lib/driver/drive-graph-runner.ts:268).

Failure scenario: with the gate OFF, plan-lock release rejects after completion. On local `main`, `.finally(lock.release)` rejects the handle without adding a diagnostic. This branch instead resolves the handle and appends `terminal_persisted_hook_failed`, violating OFF-state byte and result identity.

The B-023 test actually exercises an identity-free fixture and accepts this OFF drift: [drive-on-graph-acceptance.test.ts:450](/Users/cosmos/Projects/cosmonauts/tests/driver/drive-on-graph-acceptance.test.ts:450).

### MEDIUM — Fail-soft transition-lock degradation can still stall updates

Both acquisition-timeout and acquisition-error paths await warning delivery before running unlocked: [episode-transition-lock.ts:117](/Users/cosmos/Projects/cosmonauts/lib/memory/episode-transition-lock.ts:117). Warning delivery awaits an unrestricted caller callback with no deadline: [episode-transition-lock.ts:135](/Users/cosmos/Projects/cosmonauts/lib/memory/episode-transition-lock.ts:135).

Failure scenario: lock acquisition times out and the warning reporter blocks on a stuck sink or never-resolving promise. The plan/task action never starts, contrary to D-008’s requirement that lock failure cannot stall the primary update. Tests use immediately resolving mocks only: [episode-transition-lock.test.ts:235](/Users/cosmos/Projects/cosmonauts/tests/memory/episode-transition-lock.test.ts:235).

## Test assessment

The ordering, hook timing, byte-identical replay, concurrent manager, and bridge reject/deadline tests generally assert real filesystem/event effects rather than merely mock calls. In particular, B-005/B-016, B-014/B-015, B-026, and B-027 are meaningful proofs.

However, the gaps above prevent the suite from proving the full behaviors. B-022 explicitly blesses a D-002 violation; B-001 omits persisted OFF identities and OFF hook failure; B-020 omits empty-queue graph execution; B-011/B-012 omit unstamped and concurrent reconciliation; and the D-008 tests assume prompt warning completion. Preservation tests such as B-001, B-005, and B-018 are also expected to pass against portions of pre-fix code—they are regression guards, not proof that the defects were fixed.

VERDICT: DO-NOT-SHIP
tokens used
242,057
## Findings

### HIGH — Terminal capture can occur without a persisted intent

Ledger read or intent-write failures are reported, but execution still proceeds to `recordEpisode`: [drive-graph-runner.ts:381](/Users/cosmos/Projects/cosmonauts/lib/driver/drive-graph-runner.ts:381), [drive-graph-runner.ts:405](/Users/cosmos/Projects/cosmonauts/lib/driver/drive-graph-runner.ts:405), [drive-graph-runner.ts:420](/Users/cosmos/Projects/cosmonauts/lib/driver/drive-graph-runner.ts:420).

Failure scenario: the ledger path is temporarily unreadable/unwritable, the `failed` episode write succeeds, then settle/resume finds no intent and records a fresh `aborted` episode with another timestamp. This recreates the exact divergent pair D-002 forbids.

The test explicitly codifies the wrong behavior by expecting capture to succeed with a broken ledger: [run-state.test.ts:196](/Users/cosmos/Projects/cosmonauts/tests/driver/run-state.test.ts:196).

The claim also remains non-atomic. Two concurrent off-then-enabled resumes can both read an unstamped completion before either writes it [run-state.ts:111](/Users/cosmos/Projects/cosmonauts/lib/driver/run-state.ts:111), then both read “no intent,” write different timestamps, and capture distinct episodes. The B-011/B-012 fixture starts with an already-stamped completion and runs resumes sequentially, so it cannot expose this: [graph-resume.test.ts:491](/Users/cosmos/Projects/cosmonauts/tests/cli/drive/graph-resume.test.ts:491), [graph-resume.test.ts:968](/Users/cosmos/Projects/cosmonauts/tests/cli/drive/graph-resume.test.ts:968).

### HIGH — Graph-backed execution can be mistaken for reconciliation

`prepareResume` correctly continues when `remainingTaskIds` is empty but graph state exists: [subcommand.ts:483](/Users/cosmos/Projects/cosmonauts/cli/drive/subcommand.ts:483). Later, however, `reconcilePriorAttempt` considers only the empty legacy queue: [subcommand.ts:301](/Users/cosmos/Projects/cosmonauts/cli/drive/subcommand.ts:301). That causes the identity branch to preserve the frozen source untouched: [subcommand.ts:345](/Users/cosmos/Projects/cosmonauts/cli/drive/subcommand.ts:345).

Failure scenario: an interrupted graph has no legacy remaining tasks, no completion, and a frozen `project-coding/planner` identity. Resume executes the actual worker but records the episode under the planner identity, violating D-003.

B-020 tests execution only with a non-empty remaining-task list and reconciliation without graph execution: [run.test.ts:896](/Users/cosmos/Projects/cosmonauts/tests/cli/drive/run.test.ts:896).

### HIGH — A stale frozen identity penetrates the OFF gate

With the gate disabled, identity preparation returns but leaves any persisted identity intact: [subcommand.ts:402](/Users/cosmos/Projects/cosmonauts/cli/drive/subcommand.ts:402). Terminal-only resume then calls `recordDriveTerminalEpisode`: [subcommand.ts:470](/Users/cosmos/Projects/cosmonauts/cli/drive/subcommand.ts:470), [subcommand.ts:1633](/Users/cosmos/Projects/cosmonauts/cli/drive/subcommand.ts:1633). That function gates ledger creation only on identity, writing the intent before `recordEpisode` checks the current config: [drive-graph-runner.ts:378](/Users/cosmos/Projects/cosmonauts/lib/driver/drive-graph-runner.ts:378), [drive-graph-runner.ts:405](/Users/cosmos/Projects/cosmonauts/lib/driver/drive-graph-runner.ts:405).

Failure scenario: disable logging after an older enabled run left a frozen source/attempt but no new ledger. A terminal-only resume creates `run.terminal-episodes/` while OFF.

The OFF resume test uses a source-less fixture, so it does not cover this persisted-identity case: [graph-resume.test.ts:617](/Users/cosmos/Projects/cosmonauts/tests/cli/drive/graph-resume.test.ts:617).

### HIGH — Hook failure changes OFF-state results and event bytes

`runInline` installs the terminal hook unconditionally, including identity-free/OFF runs: [driver.ts:113](/Users/cosmos/Projects/cosmonauts/lib/driver/driver.ts:113). Hook rejection is converted into a new persisted diagnostic and a successful primary result: [drive-graph-runner.ts:252](/Users/cosmos/Projects/cosmonauts/lib/driver/drive-graph-runner.ts:252), [drive-graph-runner.ts:268](/Users/cosmos/Projects/cosmonauts/lib/driver/drive-graph-runner.ts:268).

Failure scenario: with the gate OFF, plan-lock release rejects after completion. On local `main`, `.finally(lock.release)` rejects the handle without adding a diagnostic. This branch instead resolves the handle and appends `terminal_persisted_hook_failed`, violating OFF-state byte and result identity.

The B-023 test actually exercises an identity-free fixture and accepts this OFF drift: [drive-on-graph-acceptance.test.ts:450](/Users/cosmos/Projects/cosmonauts/tests/driver/drive-on-graph-acceptance.test.ts:450).

### MEDIUM — Fail-soft transition-lock degradation can still stall updates

Both acquisition-timeout and acquisition-error paths await warning delivery before running unlocked: [episode-transition-lock.ts:117](/Users/cosmos/Projects/cosmonauts/lib/memory/episode-transition-lock.ts:117). Warning delivery awaits an unrestricted caller callback with no deadline: [episode-transition-lock.ts:135](/Users/cosmos/Projects/cosmonauts/lib/memory/episode-transition-lock.ts:135).

Failure scenario: lock acquisition times out and the warning reporter blocks on a stuck sink or never-resolving promise. The plan/task action never starts, contrary to D-008’s requirement that lock failure cannot stall the primary update. Tests use immediately resolving mocks only: [episode-transition-lock.test.ts:235](/Users/cosmos/Projects/cosmonauts/tests/memory/episode-transition-lock.test.ts:235).

## Test assessment

The ordering, hook timing, byte-identical replay, concurrent manager, and bridge reject/deadline tests generally assert real filesystem/event effects rather than merely mock calls. In particular, B-005/B-016, B-014/B-015, B-026, and B-027 are meaningful proofs.

However, the gaps above prevent the suite from proving the full behaviors. B-022 explicitly blesses a D-002 violation; B-001 omits persisted OFF identities and OFF hook failure; B-020 omits empty-queue graph execution; B-011/B-012 omit unstamped and concurrent reconciliation; and the D-008 tests assume prompt warning completion. Preservation tests such as B-001, B-005, and B-018 are also expected to pass against portions of pre-fix code—they are regression guards, not proof that the defects were fixed.

VERDICT: DO-NOT-SHIP
EXIT=0

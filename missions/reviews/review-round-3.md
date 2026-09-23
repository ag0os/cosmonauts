# Review Report

base: local main at 9be076b1ca06b2e9a1131e8c2da5bc8ac3463356
range: 9be076b1ca06b2e9a1131e8c2da5bc8ac3463356..HEAD
overall: incorrect

## Overall Assessment

The latest remediation closes the executable-frontmatter and runtime-HOME regressions, and all earlier code, performance, security, and UX fixes remain intact. The patch remains incorrect because the spawn compiler deletion still contradicts human-ratified architecture and the new reachability gate misidentifies bin-root reachability on Windows; the 3,051-test suite, lint, typecheck, and reachability checks otherwise pass. Commit `05b021e`, the D-007 amendment, and execution-liveness plan/task work were excluded as requested.

## Prior Findings

- id: F-001
  status: resolved
  evidence: CLI and `run_driver` reject selected Cancelled IDs before launch (`cli/drive/subcommand.ts:295-298`, `domains/shared/extensions/orchestration/driver-tool.ts:241`), and direct or resumed graph execution validates the authoritative selected tasks before scheduler construction (`lib/driver/drive-graph-runner.ts:93-109,595-607`). Regressions cover direct selection and a persisted pending graph (`tests/driver/drive-cancelled-dependency.test.ts:20-61`).
- id: F-002
  status: unresolved
  evidence: `lib/orchestration/spawn-compiler.ts` and `tests/orchestration/spawn-compiler.test.ts` remain deleted, while ratified D-012 still names `compileSpawnToGraph` as spawn's modeled one-node shape, D-014 still says it produces that graph, and Group D still requires the compiler and its test (`missions/architecture/durable-orchestration-runtime.md:160-208,1085-1094`).
- id: F-003
  status: resolved
  evidence: The enabled TaskManager lifecycle performs a real transition to Cancelled and asserts outcome `cancelled` plus the prior/current status details (`tests/tasks/task-manager.test.ts:149-198`), exercising the exhaustive mapping at `lib/tasks/task-manager.ts:50-56`.
- id: F-004
  status: resolved
  evidence: Runtime export declarations retain value/type discrimination (`scripts/check-reachability.ts:163-172`), with export-all, named-value, and type-only regression cases at `tests/scripts/check-reachability.test.ts:345-380`.
- id: F-005
  status: resolved
  evidence: Every runtime test sets and restores the actual per-test synthetic HOME (`tests/runtime.test.ts:16-27`); the regression seeds a user package under that HOME and proves global precedence (`tests/runtime.test.ts:866-896`), while a separate empty-HOME case proves shared-only discovery (`tests/runtime.test.ts:911-923`). The fix changes tests only, so production precedence is unchanged.
- id: SR-001
  status: resolved
  evidence: The staged-owner parser now requires an LF/CRLF/EOS-terminated opening marker, permits only YAML labels, removes any accepted label, and invokes `gray-matter` with YAML forced (`scripts/check-reachability.ts:25-35`). Regressions accept ordinary/explicit YAML and CRLF, and reject LF-tagged, CRLF-tagged, and bare-CR executable payloads without creating markers (`tests/scripts/check-reachability.test.ts:211-260`), so alternate spellings cannot select a gray-matter executable engine.
- id: SR-002
  status: resolved
  evidence: Shared task parsing rejects non-YAML matter languages before `gray-matter` (`lib/tasks/task-parser.ts:41-45,320`), and the archived-dependency caller regression proves an executable payload is rejected without creating its marker (`tests/tasks/task-manager.test.ts:1091-1112`). Existing CRLF task parsing remains covered at `tests/tasks/task-parser.test.ts:521-552`.
- id: PRF-001
  status: resolved
  evidence: `runDriveOnGraph` creates one run-scoped dependency-status snapshot and injects it into the scheduler (`lib/driver/drive-graph-runner.ts:93-109`); task and archived status discovery occurs once (`lib/tasks/task-manager.ts:591-644`), while each task uses map lookup (`lib/driver/drive-scheduler-backend.ts:205-215,686-700`). The multi-task call-count and malformed-archive controls remain at `tests/driver/drive-cancelled-dependency.test.ts:167-223`.
- id: UX-001
  status: resolved
  evidence: Missing compile and bin roots produce path-specific errors (`scripts/check-reachability.ts:253-272`), with both diagnostics and nonzero exit covered at `tests/scripts/check-reachability.test.ts:321-343`.
- id: UX-002
  status: resolved
  evidence: No-actionable diagnostics enumerate stranded dependency statuses and Blocked IDs (`lib/orchestration/chain-runner.ts:152-208`), with concrete Cancelled-dependency and Blocked-ID assertions at `tests/orchestration/chain-runner.test.ts:806-868`.
- id: UX-003
  status: resolved
  evidence: Staged-owner parse failures include both owner and plan path (`scripts/check-reachability.ts:75-83`), and malformed YAML verifies both contexts at `tests/scripts/check-reachability.test.ts:262-275`.
- id: UX-004
  status: resolved
  evidence: The summary separately reports reached runtime modules and type-only exemptions (`scripts/check-reachability.ts:293-305`), covered at `tests/scripts/check-reachability.test.ts:467-478`.
- id: CHECK-RUNTIME
  status: resolved
  evidence: The corrected tests assert the active synthetic HOME, discover a package from it with `global:coding` precedence, and separately cover an empty synthetic HOME (`tests/runtime.test.ts:866-923`); no production package-discovery code changed.
- id: DIRECT-GATES
  status: resolved
  evidence: The introduced analysis directives remain single-next-line suppressions immediately adjacent to a specific declaration, branch, or scenario and to a rationale (representative sites: `cli/drive/subcommand.ts:265-266`, `lib/driver/drive-scheduler-backend.ts:259-260`, `scripts/check-reachability.ts:69-70,143-144`). No file-wide or baseline suppression was added, and the current lint and reachability gates pass.

## Findings

- id: F-002
  priority: P2
  severity: medium
  confidence: 1.0
  complexity: complex
  title: "[P2] Spawn compiler deletion still contradicts ratified architecture"
  files: lib/orchestration/spawn-compiler.ts, tests/orchestration/spawn-compiler.test.ts, missions/architecture/durable-orchestration-runtime.md, docs/fallow-exceptions.md
  lineRange: missions/architecture/durable-orchestration-runtime.md:160-208
  summary: Reproduction: `await import("./lib/orchestration/spawn-compiler.ts")` fails with module-not-found because the compiler remains deleted, while human-ratified D-012/D-014 and Group D still require `compileSpawnToGraph` and its exercised one-node graph shape. The shipped state therefore contradicts governing architecture, leaving future orchestration work unable to follow both; the orphan rationale does not amend ratified ground.
  suggestedFix: Escalate for a human decision. Restore and wire or owner-stage the compiler under the current decisions, or have the human ratify revised architecture; do not apply an automatic architecture edit.
  task:
    title: Resolve spawn compiler state against ratified architecture
    labels: architecture, orchestration
    acceptanceCriteria:
      1. A human chooses whether D-012/D-014 remain or are revised.
      2. The shipped compiler surface and behavioral evidence agree with the resulting ratified record.

- id: F-006
  priority: P2
  severity: medium
  confidence: 1.0
  complexity: simple
  title: "[P2] Normalize bin roots before matching discovered modules"
  files: scripts/check-reachability.ts, tests/scripts/check-reachability.test.ts
  lineRange: scripts/check-reachability.ts:269-272
  summary: On Windows, run the gate on the existing synthetic shape where `bin/fixture` imports `../cli/main.ts` and that CLI module imports `../lib/cli-dep.ts`: `path.relative` returns `cli\\main.ts`, but `files("cli")` records `cli/main.ts`, so the traversal drops the bin root and falsely reports `lib/cli-dep.ts` unreachable. `resolveImport` already normalizes separators, but this new bin-root path does not, making the shipped health gate fail for valid projects specifically on Windows.
  suggestedFix: Normalize each relative bin import path to `/` before adding it to `roots`, and add a regression around the normalization boundary.
  task:
    title: "-"
    labels: "-"
    acceptanceCriteria:
      1. Bin-import roots match discovered module paths on Windows and POSIX.
      2. A bin-only runtime dependency remains reachable under Windows-style separators.

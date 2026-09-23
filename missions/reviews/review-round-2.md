# Review Report

base: local main at 9be076b1ca06b2e9a1131e8c2da5bc8ac3463356
range: 9be076b1ca06b2e9a1131e8c2da5bc8ac3463356..HEAD
overall: incorrect
Overall: incorrect

## Overall Assessment

The remediation resolves the Cancelled launch/resume, episodic outcome, re-export coverage, archived-task execution, performance, and UX findings, and the full 3,048-test suite plus lint, typecheck, and reachability checks pass. The patch remains incorrect because the staged-owner parser still has an executable-frontmatter bypass and the spawn compiler deletion still contradicts human-ratified active architecture; the new runtime-isolation regression also does not exercise the HOME boundary it claims to protect. Commit `05b021e`, the D-007 amendment in `missions/architecture/orchestration-future.md`, and execution-liveness plan/task work were excluded as requested.

## Prior Findings

- id: F-001
  status: resolved
  evidence: CLI and `run_driver` now validate selected persisted statuses before launch (`cli/drive/subcommand.ts:295-299`, `domains/shared/extensions/orchestration/driver-tool.ts:241`), while direct/resumed graph execution takes the same pre-scheduler status snapshot (`lib/driver/drive-graph-runner.ts:93-109,595-611`). Caller and graph regressions cover explicit CLI, tool, direct graph, and persisted-graph resume paths (`tests/cli/drive/run.test.ts:281-314`, `tests/extensions/orchestration-driver-tool.test.ts:145-156`, `tests/driver/drive-cancelled-dependency.test.ts:20-61`).
- id: F-002
  status: unresolved
  evidence: `lib/orchestration/spawn-compiler.ts` and its test remain deleted, while human-reviewed D-012 still says `compileSpawnToGraph` defines spawn's modeled compiler and D-014 still says it produces the one-node graph (`missions/architecture/durable-orchestration-runtime.md:160-208`); Group D still requires the compiler and test (`missions/architecture/durable-orchestration-runtime.md:1085-1094`).
- id: F-003
  status: resolved
  evidence: The enabled TaskManager lifecycle now performs a real transition to Cancelled and asserts `outcome: "cancelled"` plus the previous/current status details (`tests/tasks/task-manager.test.ts:149-197`), directly covering the shared mapping at `lib/tasks/task-manager.ts:50-56`.
- id: F-004
  status: resolved
  evidence: Runtime export declarations are traversed with value/type discrimination (`scripts/check-reachability.ts:163-172`), and export-all, named-value, and type-only negative controls are present (`tests/scripts/check-reachability.test.ts:327-363`).
- id: SR-001
  status: unresolved
  evidence: The guard at `scripts/check-reachability.ts:25-28` stops ordinary `---js` but treats `---\rjs` as an empty language; `gray-matter` trims that bare CR and selects its JavaScript engine. A local reproduction returned `{"language":"","status":"active","executed":true}`, while the regression covers only the ordinary `---js` form (`tests/scripts/check-reachability.test.ts:229-242`).
- id: SR-002
  status: resolved
  evidence: All task parsing now rejects a non-YAML matter language before calling `gray-matter` (`lib/tasks/task-parser.ts:41-45,320`), and the archived-dependency caller test proves the `---js` payload does not create its marker (`tests/tasks/task-manager.test.ts:1091-1107`).
- id: PRF-001
  status: resolved
  evidence: `runDriveOnGraph` creates one run-scoped dependency-status snapshot and injects it into the scheduler (`lib/driver/drive-graph-runner.ts:93-109`); status and dependency lookup is then map-based per task (`lib/driver/drive-scheduler-backend.ts:202-209,686-702`). The multi-task regression asserts `getTaskDependencyStatusSnapshot` is called once (`tests/driver/drive-cancelled-dependency.test.ts:167-189`) and malformed matched archives still fail closed (`tests/driver/drive-cancelled-dependency.test.ts:192-223`).
- id: UX-001
  status: resolved
  evidence: Missing compile and bin roots now produce path-specific errors (`scripts/check-reachability.ts:252-265`), with both configured-root failures covered at `tests/scripts/check-reachability.test.ts:303-325`.
- id: UX-002
  status: resolved
  evidence: No-actionable diagnostics now enumerate stranded task/dependency statuses and Blocked IDs (`lib/orchestration/chain-runner.ts:173-208`), with exact Cancelled dependency and Blocked-ID assertions at `tests/orchestration/chain-runner.test.ts:834-867`.
- id: UX-003
  status: resolved
  evidence: Staged-owner parse failures are wrapped with both owner and plan path (`scripts/check-reachability.ts:73-79`), and malformed YAML asserts both contexts at `tests/scripts/check-reachability.test.ts:244-257`.
- id: UX-004
  status: resolved
  evidence: The summary now reports reached runtime-bearing modules separately from type-only exemptions (`scripts/check-reachability.ts:291-303`), covered by `tests/scripts/check-reachability.test.ts:449-460`.
- id: CHECK-RUNTIME
  status: resolved
  evidence: Every runtime test now replaces HOME with the per-test temporary home and restores it afterward (`tests/runtime.test.ts:14-27`); commit `7549348` changes test code only, so production package precedence is unchanged. The isolated runtime suite and the full suite pass, including on the machine whose real HOME has an installed coding package.
- id: DIRECT-GATES
  status: resolved
  evidence: Commit `e4ba2f0` uses only line-scoped `fallow-ignore-next-line` directives adjacent to the reported declaration or branch (for example `cli/drive/subcommand.ts:266`, `lib/driver/drive-scheduler-backend.ts:260`, and `scripts/check-reachability.ts:65,141`); no file-wide suppression or baseline was added. The supplied QM audit is clean at the exact base, and current lint, typecheck, reachability, and full tests pass.

## Findings

- id: SR-001
  priority: P1
  severity: high
  confidence: 1.0
  complexity: simple
  title: "[P1] Bare-CR language syntax still executes staged-owner JavaScript"
  files: scripts/check-reachability.ts, tests/scripts/check-reachability.test.ts
  lineRange: scripts/check-reachability.ts:25-28
  summary: Reproduction: make an active staged owner plan start with `---\rjs\n({status:(require("fs").writeFileSync("/tmp/reachability-bare-cr-pwned","1"),"active")})\n---` and run the reachability command. The guard captures an empty language because it stops at `\r`, but `gray-matter` treats the same prefix as JavaScript and executes the payload; this was reproduced with `language: ""`, `status: "active"`, and the marker present. Impact: a repository-controlled plan can still execute arbitrary code with developer or CI privileges, so the claimed SR-001 remediation is bypassable.
  suggestedFix: Stop inferring safety with a separate delimiter regex; extract and parse frontmatter through a YAML-only, non-evaluating path whose delimiter handling is identical to parsing. Add bare-CR and CRLF non-execution regressions.
  task:
    title: "-"
    labels: "-"
    acceptanceCriteria:
      1. No staged-owner frontmatter spelling can select a JavaScript engine.
      2. Ordinary, CRLF, and bare-CR executable-language payloads are rejected without side effects.

- id: F-002
  priority: P2
  severity: medium
  confidence: 1.0
  complexity: complex
  title: "[P2] Spawn compiler deletion still contradicts ratified architecture"
  files: lib/orchestration/spawn-compiler.ts, tests/orchestration/spawn-compiler.test.ts, missions/architecture/durable-orchestration-runtime.md, docs/fallow-exceptions.md
  lineRange: missions/architecture/durable-orchestration-runtime.md:160-208
  summary: Reproduction: `await import("./lib/orchestration/spawn-compiler.ts")` fails with module-not-found because the module remains deleted, while active D-012/D-014 and Group D still require `compileSpawnToGraph` and its exercised one-node shape. Impact: shipped state contradicts human-ratified architecture, so future orchestration work cannot follow both the implementation and its governing record; the deletion rationale in `docs/fallow-exceptions.md:87-90` does not amend that ground.
  suggestedFix: Escalate for a human decision. Either restore and wire or owner-stage the compiler and test under the current decisions, or have the human ratify revised architecture; do not apply an automatic architecture amendment.
  task:
    title: "Resolve spawn compiler state against ratified architecture"
    labels: "architecture, orchestration"
    acceptanceCriteria:
      1. A human chooses whether D-012/D-014 remain or are revised.
      2. The shipped compiler surface and its behavioral evidence agree with the resulting ratified record.

- id: F-005
  priority: P2
  severity: medium
  confidence: 0.99
  complexity: simple
  title: "[P2] Runtime isolation regression seeds a package outside every scanned HOME"
  files: tests/runtime.test.ts
  lineRange: tests/runtime.test.ts:866-884
  summary: Reproduction: the test writes the package under `tmp.path/ambient-home`, but the suite hook sets HOME to `tmp.path/home`; setting HOME to `ambientHome` before `CosmonautsRuntime.create` makes that same package discoverable, confirming that the committed assertion passes only because it seeds an unrelated directory. Deleting the HOME hooks and running on a clean machine with no real user package also leaves this test green. Impact: the added regression cannot catch loss of the isolation fix or prove that global-package precedence still works under the synthetic HOME, so the original environment-dependent failure can return unnoticed.
  suggestedFix: Make the test assert the per-test synthetic HOME, seed the package under that HOME, and assert it is discovered; keep a separate empty-synthetic-HOME shared-only case. This fails if isolation disappears and preserves production precedence coverage.
  task:
    title: "-"
    labels: "-"
    acceptanceCriteria:
      1. Removing per-test HOME isolation makes the runtime regression fail on a clean machine.
      2. A package under the synthetic HOME is still discovered with normal global precedence.

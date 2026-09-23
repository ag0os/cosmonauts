# Security Review: round 2

## Overall

correct

## Assessment

Both prior injection findings are resolved: executable frontmatter is rejected before `gray-matter` at both changed trust boundaries, and caller-level marker-file regressions pass without side effects. I found no additional reachable security defect in the scoped Stage 3 diff; it adds no third-party dependency or secret-handling change.

## Prior Findings

- id: SR-001
  status: resolved
  evidence: |
    `scripts/check-reachability.ts:25-29` rejects every explicit frontmatter language except `yaml`/`yml`, and `ownerLive` invokes that guard before `matter(source)` at `scripts/check-reachability.ts:66-80`. The concrete prior payload `---js\n({status:(require("fs").writeFileSync("/tmp/reachability-pwned","1"),"active")})\n---` is exercised through the shipped `bun run check:reachability` entry point at `tests/scripts/check-reachability.test.ts:229-242`; the test requires exit status 1, the unsupported-language diagnostic, and absence of the marker file. The targeted run `bun run test -- tests/scripts/check-reachability.test.ts tests/tasks/task-manager.test.ts tests/tasks/task-parser.test.ts` passed all 128 tests, including this regression.

- id: SR-002
  status: resolved
  evidence: |
    `lib/tasks/task-parser.ts:41-45,316-323` now rejects non-YAML language tags before any call to `gray-matter`. The archived dependency consumer still reaches this shared parser at `lib/tasks/task-manager.ts:637-642`, so the guard covers `task list --ready`, coordinator status resolution, and Drive dependency snapshots. `tests/tasks/task-manager.test.ts:1091-1106` supplies the prior `---js` archived-task payload through `TaskManager.listTasks({ ready: true })`, asserts rejection, and proves `/tmp/archive-pwned` was not created. The targeted 128-test run above passed.

## Findings

(none)

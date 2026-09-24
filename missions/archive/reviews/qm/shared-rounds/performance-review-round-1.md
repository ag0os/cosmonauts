# Performance Review: round 1

## Overall

incorrect

## Assessment

The reachability walk is linear in discovered modules and import edges; on the current tree (291 discovered modules, including 199 under `lib/`) it completes in about 0.45 seconds. The new Drive cancellation guard, however, rebuilds repository-wide active/archive task status state before every selected task, creating super-linear filesystem work as task and archive counts grow.

## Findings

- id: PRF-001
  dimension: io-hot-path
  priority: P1
  severity: high
  confidence: 0.99
  complexity: complex
  title: "Drive rereads the whole task repository before every dependent task"
  files: lib/driver/drive-scheduler-backend.ts, lib/tasks/task-manager.ts, lib/tasks/file-system.ts
  lineRange: lib/driver/drive-scheduler-backend.ts:194-201,657-672; lib/tasks/task-manager.ts:578-606; lib/tasks/file-system.ts:148-151,167-182
  location: `runDriveTaskStep` calls `cancelledDependencyReason` for every selected task; that helper calls `getTaskStatuses`, which reloads and parses every active task and, for unresolved IDs, relists and sorts the complete archive.
  reproduction: |
    Create 1,000 active task files and select 1,000 dependent tasks for a Drive run (for example, a chain where each task depends on the preceding task) using a no-op backend. Each step reaches line 665 and `getTaskStatuses()` performs another 1,000 active-file reads, yielding roughly 1,000,000 task-body reads plus the `access()` call that precedes every read. If each task instead references one archived dependency and the archive contains 10,000 files, every step also rereads and sorts those 10,000 names: 10,000,000 archive-name visits and 1,000 repeated sorts during the run.
  impact: |
    The cancellation check is O(R × N) active task reads for R selected tasks and N active tasks, plus O(R × A log A) archive work when dependencies are archived. Because the reads are awaited sequentially, launch latency grows quadratically when a large plan accounts for much of the active task set and can delay or effectively stall Drive before backend work starts.
  suggestedFix: Resolve the selected tasks' dependency statuses in one repository scan per run (or maintain a run-scoped indexed snapshot with explicit refresh points) instead of rebuilding active and archive status maps in every task step.
  task:
    title: "Eliminate per-task repository scans from Drive dependency cancellation checks"
    labels: [review-fix]
    acceptanceCriteria:
      - "A Drive run with R selected tasks performs only O(N + A + dependency-edges) task/archive discovery work, not O(R × N) active reads or O(R × A log A) archive scans."
      - "Active and archived Cancelled dependencies still block execution, archived Done dependencies still permit execution, and malformed matched archived dependency frontmatter still fails closed."
      - "A regression test counts filesystem/status-resolution calls across a multi-task run and fails if repository-wide resolution occurs once per task."

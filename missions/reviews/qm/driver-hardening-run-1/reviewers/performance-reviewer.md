# Reviewer performance-reviewer

Run: qm-0abafc64-dedd-44f1-adef-626832984fa7
Lens: performance-reviewer
Spawn: 9843e1dc-8948-42db-b52c-9a5df41a08b8
Session: 01a0ef61-008a-7116-8dd2-9d2717e92841
Role: coding/performance-reviewer
Model: openai-codex/gpt-5.6-sol
Final-text SHA-256: b808512bde8b057eb2a410a38541fb4f1a076f275f3d4c39c5f31e906e2d44f0

## Full final text

# Performance Review

## Overall

incorrect

## Assessment

The diff introduces several scaling regressions in path-scoped analysis, Drive snapshot management, and execution-probe processing. All findings arise from changed code in the captured scope; pre-existing subprocess buffering was not reported.

## Findings

- id: PF-001
  dimension: scaling
  priority: P2
  severity: medium
  confidence: 0.98
  complexity: complex
  title: "Path-scoped analysis still runs full-project Fallow scans"
  files: domains/shared/extensions/project-tools/fallow-provider.ts
  lineRange: 2338-2342
  summary: |
    `capabilityArgs` ignores `request.scope.paths` for both duplication and
    complexity, invoking unscoped `fallow dupes` or `fallow health --complexity`.
    A request for one file therefore costs O(project files/bytes), including
    generation and parsing of the complete result. One hundred task-specific
    requests against a large monorepo produce one hundred full-project analyses
    rather than work proportional to the requested files.
  suggestedFix: Bound path-scoped execution through native provider scoping or reuse a content-versioned full-project result across equivalent requests.
  task:
    title: "Bound path-scoped Fallow execution cost"
    labels: [review-fix]
    acceptanceCriteria:
      - "Path-scoped duplication and complexity requests either analyze only their requested paths or reuse one valid full-project analysis."
      - "A test with repeated disjoint path requests proves provider execution is bounded and stale results are invalidated after project content changes."

- id: PF-002
  dimension: complexity
  priority: P2
  severity: high
  confidence: 0.99
  complexity: simple
  title: "Analysis scope filtering multiplies every finding by every requested path"
  files: domains/shared/extensions/project-tools/fallow-provider.ts
  lineRange: 2512-2532
  summary: |
    `scopedFindings` loops over every finding, every finding location, and then
    calls `requestedPaths.some`, making filtering O(findings × locations ×
    requested paths). With 10,000 findings, two locations per finding, and
    10,000 requested files, this performs up to 200 million prefix comparisons
    after the full-project analysis has already completed.
  suggestedFix: Pre-index canonical requested paths with an exact/prefix-aware structure so each location lookup is independent of the number of requested paths.

- id: PF-003
  dimension: io-hot-path
  priority: P2
  severity: high
  confidence: 0.99
  complexity: simple
  title: "Snapshot cleanup starts one Git subprocess per dirty path"
  files: lib/driver/runtime-helpers.ts
  lineRange: 505-542
  summary: |
    `removeDoneTaskSnapshots` walks every changed path in every snapshot and,
    under `no-commit`, invokes `git hash-object` separately for every path. In a
    sequential T-task run where each task adds one file and HEAD remains fixed,
    each later snapshot contains all prior files, producing O(T²) Git process
    launches: about 4,950 for 100 tasks and 499,500 for 1,000 tasks. Growing
    `missions/` or `memory/` deltas cause similar behavior under other policies.
  suggestedFix: Hash all relevant paths for a snapshot in one batched Git invocation and compare the returned hashes in memory.

- id: PF-004
  dimension: scaling
  priority: P2
  severity: medium
  confidence: 0.96
  complexity: complex
  title: "Retained snapshot refs grow without a lifecycle and are synchronously scanned"
  files: lib/driver/runtime-helpers.ts, lib/driver/drive-finalization.ts, lib/agents/drive-worker-tool-guard.ts
  lineRange: runtime-helpers.ts:411-466; drive-finalization.ts:220-245; drive-worker-tool-guard.ts:155-184
  summary: |
    Every dirty attempt creates a permanent `refs/cosmonauts/drive/...` ref,
    while cleanup is reached only for successful Done transitions. Blocked and
    failed attempts have no expiry or cleanup path. `latestDriveSnapshot` then
    synchronously runs and sorts `git for-each-ref` over the entire accumulated
    namespace and materializes all output to locate one task. Cost and storage
    grow with historical attempts; at 100,000 retained attempts each blocked
    Git tool call scans multi-megabyte ref output and blocks the agent event
    loop.
  suggestedFix: Define bounded retention for completed recovery refs and maintain a directly addressable latest-snapshot reference per task.
  task:
    title: "Bound Drive snapshot retention and lookup"
    labels: [review-fix]
    acceptanceCriteria:
      - "Snapshot refs have an explicit cleanup or retention policy that preserves refs still required for recovery."
      - "Looking up one task's latest snapshot has cost independent of unrelated historical refs, verified with thousands of unrelated refs."

- id: PF-005
  dimension: io-hot-path
  priority: P2
  severity: medium
  confidence: 0.98
  complexity: complex
  title: "Each execution probe reads every tracked file twice"
  files: bundled/coding/extensions/execution-probe/index.ts
  lineRange: 97-116, 395-396, 496-497
  summary: |
    `trackedSnapshot` enumerates every tracked path and sequentially reads and
    hashes every regular file. `runProbe` does this before and after the command,
    so a probe targeting one line performs O(total repository bytes) reads and
    O(tracked files) allocations twice. A repository with 100,000 tracked files
    totaling 20 GB causes roughly 40 GB of content hashing per probe, excluding
    Git status and the test command itself.
  suggestedFix: Base side-effect detection on Git status/index metadata and content-hash only instrumented or pre-existing dirty candidates while still detecting newly modified clean files.
  task:
    title: "Avoid full-content repository scans in execution probes"
    labels: [review-fix]
    acceptanceCriteria:
      - "A probe targeting one file does not read the contents of every unchanged tracked file before and after execution."
      - "Tests prove modifications to clean tracked files and mutations of already-dirty tracked files are still reported."

- id: PF-006
  dimension: memory
  priority: P2
  severity: high
  confidence: 0.99
  complexity: simple
  title: "Probe hit counting repeatedly expands an unbounded hit journal"
  files: bundled/coding/extensions/execution-probe/index.ts
  lineRange: 509-517
  summary: |
    The probe reads the entire `hits` file into memory and, for each of M
    markers, calls `hitText.split("\n").filter(...)` across all H hit records.
    Counting is therefore O(M × H) and repeatedly allocates an H-element array.
    Instrumenting 100 locations that collectively execute one million times
    performs about 100 million comparisons over a roughly 33 MB journal, with
    substantial transient allocation; hotter loops can grow the journal without
    a ceiling.
  suggestedFix: Stream or split the hit journal once into a marker-count map and enforce an explicit maximum journal size or overflow result.
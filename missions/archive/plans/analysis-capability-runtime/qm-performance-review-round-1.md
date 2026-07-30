# Performance Review: round 1

## Overall

incorrect

## Assessment

The diff preserves the ratified lossless native-evidence contract, uses one real provider audit for dirty tracked/staged/untracked scope, and caches normal discovery once per session/cwd. It is not performance-safe yet: termination does not contain descendant processes, cold discovery is outside cancellation ownership, and lossless payload handling has no non-lossy memory/concurrency posture. The findings do not recommend truncating native evidence or adding a stale cross-session cache.

## Findings

- id: PR-001
  dimension: memory
  priority: P1
  severity: high
  confidence: 0.99
  complexity: complex
  title: "Timeout and cancellation can orphan provider descendants and remain unresolved"
  files: domains/shared/extensions/project-tools/process-runner.ts, tests/extensions/project-tools-process.test.ts, tests/extensions/project-tools.test.ts
  lineRange: domains/shared/extensions/project-tools/process-runner.ts:124-128,150-173,195-198; tests/extensions/project-tools-process.test.ts:21-26,82-130; tests/extensions/project-tools.test.ts:397-455
  summary: |
    `runProviderProcess` sends signals only to the direct `ChildProcess`, then waits for its `close` event. A provider or configured wrapper that spawns a descendant can therefore leave that descendant running after timeout/abort. If the descendant inherited stdout/stderr, it also keeps the pipes open, delaying `close`; there is no terminal timer after the SIGKILL attempt. A failed/false `child.kill` similarly has no guaranteed settlement path, and the force-kill exception branch settles without ensuring the child is gone. Each affected call can retain a process, pipe listeners, captured-output closures, and a pending promise indefinitely, so resource use grows with cancelled/timed-out calls.
  evidence: |
    The committed tests only create a single process that ignores SIGTERM and assert that direct PID disappears. A local probe against this diff used a parent that spawned an interval-running grandchild with inherited stdio, with `timeoutMs: 100` and `terminationGraceMs: 50`. At 505 ms the grandchild was still alive and the runner had not settled; the runner settled at 508 ms only after the probe manually SIGKILLed that grandchild. This disproves the intended bounded-termination property for process trees.
  suggestedFix: Terminate the complete provider process tree with a final bounded settlement/pipe-cleanup path while preserving all output captured through termination and the original timeout/abort classification.
  task:
    title: "Make provider termination bounded for complete process trees"
    labels: [review-fix]
    acceptanceCriteria:
      - "Timeout and abort terminate a provider that spawns a signal-ignoring descendant with inherited stdout/stderr; neither PID nor open provider pipe remains after the outcome."
      - "The outcome resolves within a fixed bound after the grace period and preserves the initiating reason plus complete output captured before termination."
      - "Signal, spawn-error, direct-child, and cross-platform behavior remain distinctly classified under INV-3."

- id: PR-002
  dimension: io-hot-path
  priority: P1
  severity: medium
  confidence: 0.98
  complexity: complex
  title: "Cold discovery subprocesses ignore tool cancellation and session shutdown"
  files: domains/shared/extensions/project-tools/index.ts, domains/shared/extensions/project-tools/fallow-provider.ts
  lineRange: domains/shared/extensions/project-tools/index.ts:439-455,470-519,615-624; domains/shared/extensions/project-tools/fallow-provider.ts:388-414,469-514
  summary: |
    A capability call awaits `getSnapshot` before forwarding Pi's `AbortSignal` to capability execution. Cold discovery runs `--version` and `config` sequentially without any signal, while `session_shutdown` merely drops the cached promise. Cancelling the first capability call or shutting down during discovery therefore leaves the current introspection child running; with the 30-second per-invocation default, cancellation can wait through roughly 60 seconds of sequential introspection before the already-aborted capability stage is reached. Repeated short-lived sessions can accumulate one uncancelled discovery process each until their independent timeouts.
  evidence: |
    At `index.ts:441` the tool blocks on the shared snapshot, and only at line 455 does the signal reach `runtime.execute`. Both `executeProcess` calls at `fallow-provider.ts:394-398` and `410-414` omit the signal. The lifecycle handlers at `index.ts:615-620` clear references but own no abort controller, and the cancellation test deliberately waits until all discovery subprocesses have completed before aborting the capability child.
  suggestedFix: Give each in-flight session/cwd discovery explicit cancellation ownership, abort it on session reset/shutdown, and let a cancelled cold tool stop waiting without corrupting concurrent snapshot users.
  task:
    title: "Propagate lifecycle cancellation through cold provider discovery"
    labels: [review-fix]
    acceptanceCriteria:
      - "Cancelling a first-use capability while version or config introspection is running terminates that subprocess within the bounded grace period."
      - "Session shutdown/reset cancels obsolete in-flight discovery and leaves no child, timer, or stale snapshot completion behind."
      - "Concurrent callers still share one valid discovery execution; one caller's cancellation does not incorrectly abort work still required by another active caller."

- id: PR-003
  dimension: memory
  priority: P1
  severity: medium
  confidence: 0.96
  complexity: complex
  title: "Parallel full-project analyses multiply unbounded lossless payload memory"
  files: domains/shared/extensions/project-tools/process-runner.ts, domains/shared/extensions/project-tools/fallow-provider.ts, domains/shared/extensions/project-tools/index.ts
  lineRange: domains/shared/extensions/project-tools/process-runner.ts:105-148; domains/shared/extensions/project-tools/fallow-provider.ts:1170-1192,1241-1279; domains/shared/extensions/project-tools/index.ts:193-200,433-455
  summary: |
    Provider output grows with project size and finding count. Each call accumulates all stdout/stderr in strings, parses the complete stdout into the required native payload, creates normalized findings, and pretty-serializes the complete result into tool text while retaining the object in `details`. Every capability is also marked `executionMode: "parallel"`, with no per-provider concurrency bound. Peak memory is therefore O(P × B), where B is provider-output bytes and P is concurrent full-project calls, with multiple simultaneous representations of B. At 100 MB of provider JSON and four concurrent gates, raw strings alone can occupy hundreds of MB before parsed objects, normalized findings, and complete serialized tool text are counted; this can OOM a long-running agent session.
  evidence: |
    `process-runner.ts:106-147` has no byte-aware storage posture. `fallow-provider.ts:1191` parses the accumulated string and lines 1241-1279 retain the entire parsed payload alongside normalized data. `textResult` creates another complete pretty JSON string at `index.ts:198`, and line 438 permits concurrent execution. This review treats complete native payload preservation as ratified and does not propose truncation; the defect is that avoidable copies and parallel scanner fan-out are both unbounded.
  suggestedFix: Preserve native evidence losslessly while bounding concurrent provider scans and reducing peak copies via non-lossy spooling/streaming; if a defined resource ceiling cannot be met, return an explicit failed-to-run resource outcome rather than truncating or claiming a clean result.
  task:
    title: "Bound analysis memory without truncating native evidence"
    labels: [review-fix]
    acceptanceCriteria:
      - "Concurrent full-project capability calls cannot launch an unbounded number of provider processes for one session/provider."
      - "A large-payload regression preserves the complete native payload and stderr byte-for-byte while demonstrating a bounded peak-memory strategy or an explicit failed-to-run resource outcome."
      - "No remediation introduces lossy truncation of successful native evidence, preserving INV-3 and the ratified lossless contract."

- id: PR-004
  dimension: io-hot-path
  priority: P3
  severity: low
  confidence: 0.99
  complexity: simple
  title: "Every agent turn repeats provider-signal discovery"
  files: domains/shared/extensions/project-tools/index.ts, domains/shared/extensions/project-tools/fallow-provider.ts
  lineRange: domains/shared/extensions/project-tools/index.ts:128-146,475-519,621-625; domains/shared/extensions/project-tools/fallow-provider.ts:152-184,469-473
  summary: |
    `before_agent_start` is a per-turn hot path. It always runs `detectTools`, which scans the three config paths and may read/parse `package.json`, even when the session snapshot is already cached. On the first turn, the parallel `getSnapshot` path calls `discoverFallowProvider`, which performs the same signal scan a second time. Cost is fixed per turn but scales linearly with turns and agents: T starts incur up to roughly 3T stats plus T package reads, and the first start duplicates those operations.
  evidence: |
    `detectTools` reaches `detectFallowSignal` through `index.ts:128-138`; `before_agent_start` invokes it unconditionally at lines 621-625. Independently, snapshot discovery reaches `discoverFallowProvider`, whose first operation is another `detectFallowSignal` at `fallow-provider.ts:472`. The accepted per-session provider introspection cache is otherwise present; this finding is only the redundant legacy-block discovery I/O around that cache.
  suggestedFix: Carry the detected signal in the session snapshot and render the retained legacy tools block from that shared result instead of rescanning on each turn.

- id: PR-005
  dimension: scaling
  priority: P3
  severity: low
  confidence: 0.95
  complexity: simple
  title: "Path-scoped requests can build an unbounded argv"
  files: domains/shared/extensions/project-tools/index.ts, domains/shared/extensions/project-tools/fallow-provider.ts
  lineRange: domains/shared/extensions/project-tools/index.ts:64-70,244-258; domains/shared/extensions/project-tools/fallow-provider.ts:895-917
  summary: |
    The public path-array schema has `minItems` but no item or aggregate-byte bound. Runtime validation maps every entry, and the adapter expands N paths into 2N argv entries before spawning. Time and memory are O(total path bytes), and sufficiently large valid requests cross the platform's `ARG_MAX`, turning an otherwise supported analysis into a spawn failure after allocating and copying the full list.
  evidence: |
    `ProjectPathsSchema` at `index.ts:64-70` accepts arbitrary cardinality and string length; lines 244-258 copy the complete array. `scopePathArgs` at `fallow-provider.ts:895-897` doubles its entry count, and dead-code/boundary calls spread the result into another operation array at lines 903-917.
  suggestedFix: Enforce a documented aggregate path/argv budget with an explicit validation failure, or batch requests with lossless, semantically valid result composition; never silently drop paths or widen scope.

- id: PR-006
  dimension: measurement
  priority: P3
  severity: low
  confidence: 0.99
  complexity: simple
  title: "Provider runtime exposes no duration, output-size, or termination metrics"
  files: domains/shared/extensions/project-tools/process-runner.ts
  lineRange: 88-235
  summary: |
    The new subprocess boundary reports outcome evidence but records no invocation duration, stdout/stderr byte counts, timeout count, forced-kill count, or active-process gauge. Operators therefore cannot tell whether the 30-second timeout is appropriate, whether payload growth is approaching the memory failure in PR-003, or whether termination failures from PR-001 occur in real sessions.
  evidence: |
    `runProviderProcess` owns spawn, output accumulation, timeout, abort, and escalation across lines 88-235, but its outcome and side effects contain none of these performance measurements and emit no structured runtime observation.
  suggestedFix: Add low-cardinality provider-operation timing, output-byte, timeout/abort/escalation, and active-process observations without logging native payload contents.

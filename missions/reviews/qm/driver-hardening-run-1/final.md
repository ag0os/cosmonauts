Verdict: not-ready

Reason: Checks, findings, or human decisions require attention.

Index unavailable.

Panel completion timeout: 1200000 ms.

Caller-owned remediation: address findings through tasks, Drive and independent review.

Operator note (non-authoritative): "User request: Review the branch feature/driver-hardening for plan driver-hardening. Reconcile against LOCAL main (e55040de), not origin/main; every commit in main..HEAD belongs to this plan. Gate-owned paths (.fallow-baselines/, .cosmonauts/suppression-exceptions.json) are pending sign-off, not findings. Produce your durable findings report."

## Checks

- Host-configured checks: **pending**. The host will append each check’s argv, exit code, duration, and output excerpt.
- No commands or remediation were run during this assessment.
- Analysis preparation analysis-dependencies: passed in 369 ms (lifecycle scripts disabled).
- suppressions: argv ["bun","scripts/check-new-suppressions.ts","--base","e55040de840b888ed16f204e987f20bc7d465c84"], exit 0, duration 10350 ms, output "suppression check passed\n"
- test: argv ["bun","run","test"], exit 0, duration 120402 ms, output "$ node ./scripts/vitest-runner.mjs\n\n RUN  v3.2.4 /private/var/folders/kq/1jrmsh1141b4x5cfd79qyq200000gn/T/cosmonauts-qm-qm-0abafc64-dedd-44f1-adef-626832984fa7/checkout\n\n ✓ tests/memory/living-memory-commit-interleavings.test.ts (31 tests) 1744ms\n ✓ tests/memory/interface.test.ts (21 tests) 1730ms\n   ✓ memory interface > exposes exact living-memory outcomes through configured knowledge consolidate only  390ms\n ✓ tests/memory/markdown-store.test.ts (23 tests) 2523ms\n   ✓ markdown memory store > creates a freed canonical playbook name across a dense suffix range  691ms\n   ✓ markdown memory store > binds default and overridden episode thresholds into fresh-store stats and warnings  482ms\n ✓ tests/extensions/project-tools.test.ts (26 tests) 3510ms\n   ✓ project-tools extension > withholds all provider execution until consent is recorded  416ms\n   ✓ project-tools extension > aborting a capability tool terminates the provider child  951ms\n   ✓ project-tools extension > aborting first-use during version discovery terminates introspection and reports failure  362ms\n   ✓ project-tools extension > aborting first-use during config discovery terminates introspection and reports failure  350ms\n   ✓ project-tools extension > session_start aborts obsolete discovery and a later call discovers afresh  354ms\n   ✓ project-tools extension > session_shutdown aborts obsolete discovery and a later call discovers afresh  339ms\n ✓ tests/extensions/agent-memory.test.ts (39 tests) 3993ms\n   ✓ agent-memory extension > indexes playbooks and recalls their full steps in a later session  661ms\n   ✓ agent-memory extension > injects recalls and protects oversized human profiles honestly  577ms\n   ✓ agent-memory extension > recall searches notes over project and user scopes with default and capped limits  426ms\n   ✓ agent-memory extension > recalls enabled episodes through the existing bounded recall tool  394ms\n   ✓ agent-memory extension > memory index injection uses list mode capped to the 50 most "
- lint: argv ["bun","run","lint"], exit 0, duration 2159 ms, output "$ biome check .\nChecked 653 files in 308ms. No fixes applied.\n"
- typecheck: argv ["bun","run","typecheck"], exit 0, duration 6762 ms, output "$ tsc --noEmit\n"
- reachability: argv ["bun","run","check:reachability"], exit 0, duration 883 ms, output "$ bun scripts/check-reachability.ts\nreachability: 214/214 runtime lib modules reached; 13 type-only lib modules exempt; 0 staged\n"

## Gates

- Reviewer panel: **completed**. `reviewer`, `security-reviewer`, `performance-reviewer`, and `ux-reviewer` each ran exactly once.
- Changed-scope audit: **unbound**. `analysis_audit` was called once with base `e55040de840b888ed16f204e987f20bc7d465c84`; provider `fallow` reported `execution-not-consented`, scope `not-executed`.
- Analysis capabilities: **unbound**. All seven Fallow capabilities reported `execution-not-consented`; this is unavailable evidence, not a clean result.
- Boundary conformance: **automated gate unbound**. Manual inspection found no new reverse dependency from `lib/` into domain code; `fallow.toml` defines no boundary zones/rules. This does not substitute for provider evidence.
- Gate-owned paths: **pass for captured scope**. Neither `.fallow-baselines/` nor `.cosmonauts/suppression-exceptions.json` appears in the captured changed-file list.
- Findings gate: **failed**. Open P1/P2 findings below block readiness.

## Findings

- F-001 P1/high — `lib/driver/run-one-task.ts:595-596`, `lib/driver/drive-scheduler-backend.ts`, `bundled/coding/extensions/execution-probe/index.ts`: journal existence checks do not synchronize Drive with a probe started immediately afterward, allowing temporary instrumentation or stale restoration to race worker edits/postflight. Fix with shared cross-process ownership around worktree-sensitive phases, with reentrant support for the active worker’s own probe; test both Drive paths using barriers.
- F-002 P1/high — `lib/driver/runtime-helpers.ts:507-519`: snapshot cleanup parses fixed status/path pairs although rename/copy records can contain `status, oldPath, newPath`; deleting the captured destination can therefore delete the only recovery ref. Disable rename detection or parse variable-width records and test a discarded rename destination.
- F-003 P1/high — `lib/tasks/task-note-editor.ts:19-35`: the task parser accepts an indented `## Implementation Notes` heading while preservation requires column zero, so a status-only edit can erase those notes. Share one heading grammar and test parser-supported indentation.
- F-004 P2/medium — `lib/driver/runtime-helpers.ts:451-463`: `git commit-tree` inherits user identity requirements. A dirty `no-commit` run in CI without `user.name`/`user.email` fails before spawn. Supply deterministic framework author/committer identity and test with all Git identity configuration disabled.
- F-005 P2/medium — `lib/driver/runtime-helpers.ts:550-557`: containment compares object IDs but drops Git mode/type, so reverting an executable-bit or symlink/type change can still delete its recovery ref. Compare complete tree identity and test `chmod +x` preservation.
- SR-001 P1/medium — `lib/agents/drive-worker-tool-guard.ts:124-126`: `git switch -f main` and `git switch --force main` bypass the guard and can discard post-snapshot changes. Classify both force forms and add Bash-guard and probe tests.
- SR-002 P1/medium — `bundled/coding/extensions/execution-probe/index.ts:439-449`: arbitrary probe commands have a timeout but no output limit; `yes` can fill temporary storage and then exhaust memory while source is instrumented. Enforce aggregate stdout/stderr limits, terminate the process tree on overflow, and verify restoration.
- SR-003 P1/medium — `bundled/coding/extensions/execution-probe/index.ts:431-435`: the final digest read and instrumentation write are not atomic. A source replacement between them is overwritten and later restored to stale bytes. Introduce a shared mutation protocol or isolated worktree and add a deterministic race test.
- SR-004 P2/medium — `bundled/coding/extensions/execution-probe/index.ts:315-435`: in-place instrumentation can leave a partial file after ENOSPC/interruption; recovery rejects that digest even though a verified sidecar exists. Use atomic, durably phased replacement and test short writes/interruption.
- SR-005 P1/medium — `lib/driver/runtime-helpers.ts:507-521`: independently corroborates F-002; rename/copy output can cause cleanup to skip the destination and remove the only recovery ref. Disable rename detection or parse all fields correctly.
- SR-006 P2/low — `lib/driver/runtime-helpers.ts:521-565`: independently corroborates F-005; executable and object-mode changes are absent from containment identity. Preserve and compare mode/type with object ID.
- UR-001 P1/high — `bundled/coding/extensions/execution-probe/index.ts:148-151,499-529`: instrumented paths are excluded from final status comparison. A command such as `git add entry.js` stages injected probe code; the worktree is restored, but the tool can report `restored: true`, `usableZero: true`, and delete the journal. Preserve/verify target index state and never report usable evidence while instrumentation remains staged.
- UR-002 P2/medium — `bundled/coding/capabilities/execution-probe.md:5`, `bundled/coding/extensions/execution-probe/index.ts:348-356`: documentation promises later automatic recovery, but a `termination-error` marker blocks every subsequent call permanently without a documented safe recovery procedure. Document the manual process-tree verification and recovery steps or implement safe recovery.
- UR-003 P2/medium — `bundled/coding/extensions/execution-probe/index.ts:519-523`: failed probe commands omit stdout, so test runners that report failures there return only an exit code. Include a bounded stdout tail.
- PF-002 P2/high — `domains/shared/extensions/project-tools/fallow-provider.ts:2512-2532`: scope filtering is O(findings × locations × requested paths); 10,000 findings and 10,000 paths can cause roughly 200 million comparisons. Index exact/prefix paths before filtering.
- PF-003 P2/high — `lib/driver/runtime-helpers.ts:505-542`: `no-commit` snapshot cleanup launches `git hash-object` once per dirty path, producing quadratic process counts across long task runs. Batch relevant paths into one Git invocation.
- PF-004 P2/medium — `lib/driver/runtime-helpers.ts:411-466`, `lib/agents/drive-worker-tool-guard.ts:155-184`: retained recovery refs have no lifecycle, while every lookup synchronously scans and sorts the entire namespace. Define safe retention and maintain a directly addressable latest ref per task.
- PF-005 P2/medium — `bundled/coding/extensions/execution-probe/index.ts:97-116,395-396,496-497`: every probe sequentially hashes every tracked file twice; a 20 GB repository reads about 40 GB per probe. Use Git state to narrow hashing while preserving dirty-file mutation detection.
- PF-006 P2/high — `bundled/coding/extensions/execution-probe/index.ts:509-517`: each marker repeatedly splits and scans the entire unbounded hit journal, yielding O(markers × hits) work and large transient allocations. Stream once into a count map and enforce a hit-journal limit.
- QM-001 P1/high — `lib/driver/runtime-helpers.ts:417-454`: snapshot creation starts its temporary index from `HEAD` and stages worktree bytes, losing index-only content. Example: stage version B of a file, restore only its worktree bytes to HEAD version A, then let a backend run `git reset --hard`; the snapshot contains A and cannot recover staged B. Preserve both index and worktree states in reachable snapshot objects and add staged-only/index-worktree divergence tests.
- QM-002 P2/medium — `domains/shared/extensions/project-tools/fallow-provider.ts:2251-2253`: trace containment hardcodes `/`. On Windows, `C:\repo\src\a.ts` never starts with `C:\repo/`, so confirmed non-exported symbols bypass the new `unsupported-target` classification and reach Fallow. Use `path.relative`/platform-aware containment and add a Windows-path test.

## Human decisions

- Analysis audit binding state: unbound; human decision required.
- Gate-owned file changed: domains/shared/extensions/project-tools/fallow-provider.ts; human decision required.
- Finding PF-001 was closed or dismissed without independent cited evidence.
- Finding QM-001 has an unmapped P1; human decision required.

## Out-of-range observations

- PF-001 dismissed — Path-scoped complexity/duplication intentionally perform one complete project run because Fallow exposes no native path filter; this is the documented contract rather than an accidental widening. closureEvidence: `docs/analysis-provider-validation.md:66-75` and `docs/fallow.md:80-95` explicitly require full-result reconciliation followed by adapter filtering, with the native envelope retained.

## Reviewed

Reviewed the captured diff and changed-file inventory against base `e55040de840b888ed16f204e987f20bc7d465c84`, including task-note mutation callers, both Drive execution paths, report/event projection, snapshot creation and cleanup, execution-probe recovery, Fallow scoping/presentation, CLI/tool contracts, tests, prompts, and documentation. All reviewer finding IDs are accounted for above.

Route remediation through tasks and Drive, then obtain an independent fresh-context re-review before merge.
- Host configured checks and captured changed-file list in the private snapshot.
- Host-run preparation and checks execute the reviewed change's code with the operator's authority, unsandboxed.

## Reviewer models

- reviewer: openai-codex/gpt-5.6-sol
- security-reviewer: openai-codex/gpt-5.6-sol
- performance-reviewer: openai-codex/gpt-5.6-sol
- ux-reviewer: openai-codex/gpt-5.6-sol


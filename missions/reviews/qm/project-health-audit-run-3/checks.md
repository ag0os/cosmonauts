Analysis preparation analysis-dependencies: passed in 639 ms (lifecycle scripts disabled).
# Preparation

- dependencies: passed in 112 ms

# Configured checks

## suppressions

- argv: ["bun","scripts/check-new-suppressions.ts","--base","64dca3c91439241b805f51b37fb38527ba23cc10"]
- exit code: 0
- duration: 8621 ms
- timed out: false

```text
suppression check passed

```

## test

- argv: ["bun","run","test"]
- exit code: 0
- duration: 81599 ms
- timed out: false

```text
$ node ./scripts/vitest-runner.mjs

 RUN  v3.2.4 /private/var/folders/kq/1jrmsh1141b4x5cfd79qyq200000gn/T/cosmonauts-qm-qm-2b15747f-3889-4b29-9618-ab0d37268090/checkout

 ✓ tests/memory/living-memory-commit-interleavings.test.ts (31 tests) 1558ms
 ✓ tests/memory/interface.test.ts (21 tests) 1558ms
   ✓ memory interface > exposes exact living-memory outcomes through configured knowledge consolidate only  447ms
 ✓ tests/memory/markdown-store.test.ts (23 tests) 2269ms
   ✓ markdown memory store > creates a freed canonical playbook name across a dense suffix range  537ms
   ✓ markdown memory store > binds default and overridden episode thresholds into fresh-store stats and warnings  420ms
 ✓ tests/extensions/architecture-memory.test.ts (13 tests) 506ms
 ✓ tests/extensions/project-tools.test.ts (26 tests) 3398ms
   ✓ project-tools extension > withholds all provider execution until consent is recorded  393ms
   ✓ project-tools extension > aborting a capability tool terminates the provider child  875ms
   ✓ project-tools extension > aborting first-use during version discovery terminates introspection and reports failure  335ms
   ✓ project-tools extension > aborting first-use during config discovery terminates introspection and reports failure  350ms
   ✓ project-tools extension > session_start aborts obsolete discovery and a later call discovers afresh  346ms
   ✓ project-tools extension > session_shutdown aborts obsolete discovery and a later call discovers afresh  362ms
 ✓ tests/extensions/agent-memory.test.ts (39 tests) 3666ms
   ✓ agent-memory extension > indexes playbooks and recalls their full steps in a later session  663ms
   ✓ agent-memory extension > injects recalls and protects oversized human profiles honestly  438ms
   ✓ agent-memory extension > recall searches notes over project and user scopes with default and capped limits  386ms
   ✓ agent-memory extension > recalls enabled episodes through the existing bounded recall tool  320ms
   ✓ agent-memory extension > memory index injection uses list mode capped to the 50 most recent records before truncation  708ms
 ✓ tests/tasks/task-manager.test.ts (67 tests) 4035ms
   ✓ TaskManager > adds gated fail-soft episodes only for task creation and real status transitions  530ms
   ✓ TaskManager > preserves unlocked task update bytes for every transition-lock bypass  379ms
   ✓ TaskManager > warns and runs task updates unlocked on lock errors and bounded waits  1140ms
 ✓ tests/harness-adapters/provenance.test.ts (2 tests) 2006ms
   ✓ harness provenance > classifies the complete owner source target mode and concurrent-read grid without writing  783ms
   ✓ harness provenance > preserves edited foreign and untraceable targets and permits only safe lineage or owner transfer  1222ms
 ✓ tests/harness-adapters/sync.test.ts (8 tests) 7011ms
   ✓ harness sync planning > bootstraps and migrates both commands as one nonhistorical recoverable transaction  1304ms
   ✓ harness sync planning > recovers every phase vector through one sibling lock while retaining evidence holds  3007ms
   ✓ harness sync planning > fresh recovery converges removal transactions with absent new targets across phases  691ms
   ✓ harness sync planning > fresh recovery restores manifest-only forget transfer and absent-target removal intent  1475ms
   ✓ harness sync planning > fresh recovery preserves equal old and new target relations for cross-project regeneration  307ms
 ✓ tests/extensions/project-tools-fallow.test.ts (32 tests) 7306ms
   ✓ Fallow provider discovery > resolves supported POSIX and Windows native platform packages without PATH or package-manager shims  390ms
   ✓ Fallow provider discovery > installed native provider preserves crash evidence and cleans descendants on abort and timeout  1468ms
   ✓ Fallow capability execution > analysis_audit passes inherited findings and fails introduced findings in each category  1430ms
   ✓ Fallow capability execution > audits tracked staged and untracked dirty base changes from HEAD  1172ms
   ✓ Fallow capability execution > leaves the entire worktree unchanged across status and every capability  1147ms
stderr | tests/runtime.test.ts > CosmonautsRuntime > chain selection > includes chains from matching domain context
[warning] [coding chain:build] Named chain stage "worker" does not resolve to any known agent

stderr | tests/runtime.test.ts > CosmonautsRuntime > chain selection > includes all domain chains when no domain context
[warning] [coding chain:build] Named chain stage "worker" does not resolve to any known agent

stderr | tests/runtime.test.ts > CosmonautsRuntime > chain selection > filters out non-matching domain chains
[warning] [coding chain:build] Named chain stage "worker" does not resolve to any known agent
[warning] [other chain:other-flow] Named chain stage "x" does not resolve to any known agent

 ✓ tests/cli/drive/run.test.ts (33 tests) 6128ms
   ✓ cosmonauts run drive compat run > resume finalizes pending commit failure before invoking backend work  329ms
   ✓ cosmonauts run drive compat run > resume refuses state commit external acceptance when pending tasks are missing or not done  889ms
   ✓ cosmonauts run drive compat run > resume accepts a Cancelled pending task as closed state-commit evidence  483ms
   ✓ cosmonauts run drive compat run > resume retries pending state commit without invoking backend work  322ms
   ✓ cosmonauts run drive compat run > resume records source task-status and state-commit finalizer retry failures as attempts  1538ms
   ✓ cosmonauts run drive compat run > resume uses legacy driver events while dual-writing normalized resume events  389ms
 ✓ tests/skills/exporter.test.ts (18 tests) 4010ms
   ✓ exportSkill > removes stale files from previous export  475ms
   ✓ exportSkill > overwrites existing export  520ms
   ✓ runHarnessSync selection > refuses malformed manifest path authority without changing any owner bytes  911ms
   ✓ runHarnessSync selection > accepts and upgrades a legacy manifest entry whose output identity differs from its source directory  344ms
   ✓ runHarnessSync selection > forgets only after a still-declared source root is completely observed  412ms
 ✓ tests/runtime.test.ts (27 tests) 1866ms
 ✓ tests/plans/plan-manager.test.ts (44 tests) 1731ms
   ✓ PlanManager > serializes enabled same-plan status transition decisions across manager instances  330ms
 ✓ tests/cli/drive/graph-resume.test.ts (13 tests) 8599ms
   ✓ cosmonauts run drive compat graph resume > resumes graph runs without rewriting original selected task ids  820ms
   ✓ cosmonauts run drive compat graph resume > drops an unavailable frozen worker before execution and never attributes the fallback to it  723ms
   ✓ cosmonauts run drive compat graph resume > treats empty-legacy-queue graph continuation as worker execution  469ms
   ✓ cosmonauts run drive compat graph resume > resumes pending task-status finalization with one terminal result  618ms
   ✓ cosmonauts run drive compat graph resume > resumes already completed graph runs with one terminal result  1141ms
   ✓ cosmonauts run drive compat graph resume > rehydrates the attempt ledger and skips a second terminal after thrown-exit resume  806ms
   ✓ cosmonauts run drive compat graph resume > records one run-id-derived terminal for an off-then-enabled completed resume  537ms
   ✓ cosmonauts run drive compat graph resume > records one run-id-derived terminal for a completed graph-backed resume  618ms
   ✓ cosmonauts run drive compat graph resume > repeats deterministic terminal-only resume without changing bytes or episode count  615ms
   ✓ cosmonauts run drive compat graph resume > warns and skips terminal capture when off-era resume source cannot resolve  497ms
   ✓ cosmonauts run drive compat graph resume > leaves graph resume inputs byte-identical when dirty or unsupported resume is refused  522ms
   ✓ cosmonauts run drive compat graph resume > keeps persisted terminal identity artifact-free while episodic capture is off  482ms
   ✓ cosmonauts run drive compat graph resume > keeps a failing pending finalization artifact-free while episodic capture is off  751ms
error: unknown option '--workflow'
error: unknown option '-w'
error: unknown option '--list-workflows'
Refusing to start an interactive session: no terminal is attached to stdin. This usually means a subcommand was mistyped or a global flag was placed before it — the root command takes free prompt text, so anything the subcommand table does not match becomes a prompt (for example `cosmonauts --json plan ...` instead of `cosmonauts plan ... --json`). Run `cosmonauts --help` for the subcommand list, or use `--print` for non-interactive output.
 ✓ tests/cli/main.test.ts (82 tests) 95ms
 ✓ tests/packages/scanner.test.ts (34 tests) 79ms
 ✓ tests/extensions/orchestration.test.ts (39 tests) 10789ms
   ✓ orchestration extension > a scripted QM and panel refuse mutation tools and a forbidden spawn without changing the checkout  1009ms
   ✓ orchestration extension > a reviewer ending in a text-less provider error after retries is a failed review, not evidence  1196ms
   ✓ orchestration extension > a reviewer ending in a provider error after partial text is a failed review, not evidence  1028ms
   ✓ orchestration extension > a reviewer ending in an aborted final message is a failed review, not evidence  1801ms
   ✓ orchestration extension > a reviewer ending in a final message with no text of its own is a failed review, not evidence  1421ms
   ✓ orchestration extension > a reviewer ending in a final message stopped at the token limit is a failed review, not evidence  1247ms
   ✓ orchestration extension > a reviewer ending in no assistant message at all is a failed review, not evidence  1237ms
   ✓ orchestration extension > a reviewer whose final message has its own text is recorded as evidence  1007ms
 ✓ tests/orchestration/agent-spawner.spawn.test.ts (26 tests) 143ms
 ✓ tests/memory/living-memory.test.ts (83 tests) 11676ms
   ✓ living memory > preserves live bytes when a retirement source changes after manifest commit  579ms
   ✓ living memory > recovery proves manifest durability and linked live identity before unlink  398ms
   ✓ living memory > annotates a human restoration and reserves hard deletion for the ledger  1324ms
   ✓ living memory > recovers hard-stopped retirement at every durable commit boundary  1744ms
   ✓ living memory > preserves profile authored memory and curated bytes across a full pass  397ms
   ✓ living memory > revalidates exact baselines citations digests and manifest-state guards under the lock  868ms
   ✓ living memory > persists closed proposal variants and accepted receipts through one safe durable writer  330ms
   ✓ living memory > rehydrates accepted judgment and persisted evidence then converges to noop  688ms
   ✓ living memory > syncs accepted folded note proposals before pruning unchanged episodes  561ms
stdout | tests/cli/session.test.ts > session flag handling > --resume with no sessions throws GracefulExitError
No sessions found.

stderr | tests/cli/session.test.ts > session flag handling > --session with cross-project match and declined fork throws GracefulExitError
Session found in different project: /other/project

stdout | tests/cli/session.test.ts > session flag handling > --resume cancel throws GracefulExitError
Available sessions:
  1. [sess-1] hello

stdout | tests/cli/session.test.ts > session flag handling > --resume cancel throws GracefulExitError
No session selected.

 ✓ tests/cli/session.test.ts (22 tests) 13ms
 ✓ tests/orchestration/run-start-chain-characterization.test.ts (6 tests) 9057ms
   ✓ runStart durable chain characterization > preserves durable chain run files and ChainResult through runStart  320ms
   ✓ runStart durable chain characterization > resolves a reviewer-established target at durable step start after prompt compilation  483ms
   ✓ runStart durable chain characterization > gates durable task decomposition on earlier reviewer-bound addressed activity  7277ms
   ✓ runStart durable chain characterization > records durable chain episodes with the persisted run id and unchanged reconstruction  535ms
   ✓ runStart durable chain characterization > keeps disabled inline and durable chain outputs events and files unchanged  437ms
[warning] Plan lock release backstop failed: EISDIR: illegal operation on a directory, read
 ✓ tests/cli/memory/subcommand.test.ts (8 tests) 2566ms
   ✓ memory owner CLI > a successful non-dry pass ignores its own lock and exits zero  567ms
   ✓ memory owner CLI > runs the production corpus source before episodes in a deterministic dry run  554ms
   ✓ memory owner CLI > matches real-corpus injection pressure through the CLI composition root on a copy  1119ms
   ✓ memory owner CLI > actions or rejects improve proposals through a reachable closed lifecycle  308ms
 ✓ tests/episodic/pre-w3-disabled-baselines.test.ts (5 tests) 530ms
 ✓ tests/harness-adapters/render.test.ts (1 test) 1175ms
   ✓ harness asset rendering > materializes sticky copy direct-link flat and generated-wrapper shapes safely  1175ms
 ✓ tests/orchestration/chain-runner.test.ts (111 tests) 12981ms
   ✓ runChain > 'plan-and-build' named chain reaches a durable QM findings report  1016ms
   ✓ runChain > 'implement' named chain reaches a durable QM findings report  965ms
   ✓ runChain > 'verify' named chain reaches a durable QM findings report  1074ms
   ✓ runChain > 'spec-and-build' named chain reaches a durable QM findings report  1739ms
   ✓ runChain > 'adapt' named chain reaches a durable QM findings report  1494ms
   ✓ runChain > leaves plans byte-identical when QM plan context is ambiguous  356ms
   ✓ runChain > reports an unconfigured ready QM assessment through an inline chain  1069ms
   ✓ runChain > reports an unconfigured not-ready QM assessment through an inline chain  1036ms
   ✓ runChain > persists integrity-failure through an inline QM chain  641ms
   ✓ runChain > persists cancellation through an inline QM chain  695ms
   ✓ runChain > binds plan review to the expected or reviewer-established active target  328ms
 ✓ tests/orchestration/chain-profiler.test.ts (33 tests) 68ms
 ✓ tests/durable-runtime/scheduler-recovery.test.ts (9 tests) 585ms
 ✓ tests/domains/validator.test.ts (32 tests) 6ms
 ✓ tests/cli/packages/subcommand.test.ts (44 tests) 21ms
 ✓ tests/cli/tasks/commands/create.test.ts (48 tests) 487ms
 ✓ tests/extensions/orchestration-driver-tool.test.ts (16 tests) 10173ms
   ✓ driver e2e run_driver integration > driver e2e happy path completes two tasks and tails JSONL events  699ms
   ✓ driver e2e run_driver integration > driver preflight failure aborts without task status updates  617ms
   ✓ driver e2e run_driver integration > does not rewrite successful completion when the driver handle settles  701ms
   ✓ driver e2e run_driver integration > driver branch mismatch emits structured preflight failure before transitions  683ms
   ✓ driver e2e run_driver integration > run_driver uses the framework default envelope when envelopePath is omitted  511ms
   ✓ driver e2e run_driver integration > freezes the execution-resolved worker for enabled default main project-bound and live-bound launches  1887ms
   ✓ driver e2e run_driver integration > keeps absent and false-config inline specs completions layout and result exact  981ms
   ✓ driver e2e run_driver integration > run_driver honors an explicit legacy bundled envelopePath  380ms
   ✓ driver e2e run_driver integration > run_driver uses the project root for repository commit locking  1399ms
   ✓ driver e2e run_driver integration > run_driver propagates state commit policy defaults and overrides  1203ms
   ✓ driver e2e run_driver integration > driver postverify failure blocks task and does not commit  486ms
 ✓ tests/orchestration/agent-spawner.test.ts (53 tests) 180ms
 ✓ tests/driver/run-one-task.test.ts (17 tests) 5820ms
   ✓ run-one-task > run-one-task branch mismatch aborts before any status transition  372ms
   ✓ run-one-task > driver commit exclusion uses repo lock excludes missions and memory and emits sha  909ms
   ✓ run-one-task > emits commit and task-status finalization phase events on successful driver commit  570ms
   ✓ run-one-task > uses task title as driver commit subject when report summary is generic  447ms
   ✓ run-one-task > records finalization_failed instead of blocked when driver commit fails after passing postflight  1194ms
   ✓ run-one-task > records finalization_failed with commit sha when task status update fails after commit  310ms
   ✓ run-one-task > does not write pending finalization for backend or postflight failures  402ms
   ✓ run-one-task > driver partial outcome commits and leaves task In Progress with progress notes  320ms
   ✓ run-one-task > run-one-task infers success for unknown reports when postverify passes and changes exist  389ms
 ✓ tests/orchestration/chain-steps.test.ts (51 tests) 9ms
 ✓ tests/orchestration/session-factory.security.test.ts (11 tests) 88ms
 ✓ tests/scripts/knowledge-surface-backfill.test.ts (11 tests) 1523ms
   ✓ knowledge surface recoverable backfill > leaves enough on-disk evidence for manual recovery after a real hard kill  607ms
stderr | tests/config/loader.test.ts > loadProjectConfig > enables the knowledge surface only for literal true
[warning] Skipping malformed knowledgeSurface.enabled: expected a boolean, got "true".

stderr | tests/config/loader.test.ts > loadProjectConfig > enables the knowledge surface only for literal true
[warning] Skipping malformed knowledgeSurface.enabled: expected a boolean, got 1.

stderr | tests/config/loader.test.ts > loadProjectConfig > enables the knowledge surface only for literal true
[warning] Skipping malformed knowledgeSurface.enabled: expected a boolean, got null.

 ✓ tests/agents/session-assembly.test.ts (33 tests) 602ms
 ✓ tests/cli/sessions/subcommand.test.ts (39 tests) 275ms
 ✓ tests/extensions/plans.test.ts (27 tests) 821ms
 ✓ tests/config/loader.test.ts (32 tests) 346ms
 ✓ tests/harness-adapters/sync.characterization.test.ts (7 tests) 1523ms
   ✓ Claude command preparation and evidence identity characterization > creates both native sources and completes one durable command-pair transaction  336ms
   ✓ Claude command preparation and evidence identity characterization > rejects every reachable command-evidence identity predicate before locking  407ms
 ✓ tests/harness-adapters/inventory.test.ts (3 tests) 837ms
   ✓ live harness inventory characterization > renders the stable-authority external bundle with exact live inventory bytes and fallbacks  819ms
 ✓ tests/driver/drive-on-graph-recovery.test.ts (3 tests) 1485ms
   ✓ Drive-on-graph recovery > persists episode capture failure as a non-fatal Drive diagnostic  892ms
   ✓ Drive-on-graph recovery > applies committed-work block and leave-running recovery paths to selected drive backends  542ms
 ✓ tests/entity-file-lock.test.ts (14 tests) 638ms
 ✓ tests/extensions/agent-switch.test.ts (22 tests) 14ms
 ✓ tests/driver/driver-durable-steps.test.ts (4 tests) 2473ms
   ✓ driver durable step projection > writes Drive task step records with configured backend identity and resume-safe dependencies  998ms
   ✓ driver durable step projection > records malformed reports inferred by postflight as completed success in step records and normalized events  525ms
   ✓ driver durable step projection > keeps legacy observation outputs unchanged when step records exist  402ms
   ✓ driver durable step projection > continues Drive run when durable step persistence fails  547ms
 ✓ tests/memory/retirement-store-characterization.test.ts (28 tests) 2191ms
 ✓ tests/plans/file-system.test.ts (23 tests) 297ms
 ✓ tests/architecture-map/generator.test.ts (9 tests) 2221ms
   ✓ generateArchitectureMap > writes OKF index and module shards for a TypeScript fixture  317ms
   ✓ generateArchitectureMap > returns unchanged without touching generated files when sources are unchanged  348ms
   ✓ generateArchitectureMap > writes pending narratives for disabled budget-exhausted and failed generation  474ms
 ✓ tests/plans/archive.test.ts (21 tests) 576ms
 ✓ tests/driver/drive-on-graph-acceptance.test.ts (7 tests) 11553ms
   ✓ Drive-on-graph acceptance > emits the terminal legacy event before completion and captures afterward  3268ms
   ✓ Drive-on-graph acceptance > invokes terminal-persisted hook after completion and before capture on every completion-backed outcome  2460ms
   ✓ Drive-on-graph acceptance > preserves the persisted terminal when onTerminalPersisted rejects  679ms
   ✓ Drive-on-graph acceptance > survives scheduler host death and resumes a large sequential drive graph  3909ms
   ✓ Drive-on-graph acceptance > continues an in-flight run from the envelope snapshot after the live file moves  492ms
   ✓ Drive-on-graph acceptance > resumes from the persisted envelope snapshot after the live file moves  647ms
 ✓ tests/memory/consolidation-sources.test.ts (10 tests) 289ms
 ✓ tests/domains/loader.test.ts (23 tests) 546ms
 ✓ tests/driver/drive-scheduler-backend.test.ts (5 tests) 489ms
   ✓ Drive scheduler backend > runs preflight backend postflight and report inference before returning StepResult  372ms
 ✓ tests/durable-runtime/graph-scheduler.test.ts (4 tests) 422ms
 ✓ tests/episodic/w3-contract.test.ts (3 tests) 117ms
 ✓ tests/driver/event-stream.test.ts (12 tests) 168ms
 ✓ tests/driver/durable-events.test.ts (4 tests) 4ms
 ✓ tests/extensions/orchestration-driver-detached.test.ts (9 tests) 397ms
 ✓ tests/cli/export/subcommand.test.ts (11 tests) 66ms
 ✓ tests/memory/accepted-episode-finalization-characterization.test.ts (23 tests) 16ms
 ✓ tests/driver/run-state.test.ts (10 tests) 149ms
 ✓ tests/cli/drive/run-drive-characterization.test.ts (31 tests) 758ms
 ✓ tests/domains/prompt-assembly.test.ts (17 tests) 193ms
 ✓ tests/orchestration/agent-spawner.completion-loop.test.ts (11 tests) 209ms
 ✓ tests/cli/run/subcommand.test.ts (11 tests) 358ms
 ✓ tests/orchestration/spawn-tracker.test.ts (42 tests) 6ms
 ✓ tests/agents/resolver.test.ts (35 tests) 5ms
 ✓ tests/orchestration/chain-parser.test.ts (52 tests) 6ms
 ✓ tests/packages/installer.test.ts (25 tests) 1102ms
   ✓ install metadata — git > installedAt is a valid ISO 8601 timestamp  312ms
 ✓ tests/memory/episode-transition-lock.test.ts (15 tests) 202ms
error: option '--copy' cannot be used with option '--link'
 ✓ tests/orchestration/chain-event-adapter-characterization.test.ts (41 tests) 6ms
 ✓ tests/extensions/task-tools.test.ts (18 tests) 677ms
 ✓ tests/cli/harness/subcommand.test.ts (9 tests) 529ms
   ✓ cosmonauts harness sync > complete sync preserves an edited removed source and explicit forget changes only provenance  305ms
 ✓ tests/tasks/file-system.test.ts (41 tests) 482ms
 ✓ tests/orchestration/quality-review-launch.test.ts (21 tests) 8936ms
   ✓ quality review launch policy > requires an observed audit state even with an injected ready assessment  902ms
   ✓ quality review launch policy > runs configured checks only after the QM and reviewer evidence complete  842ms
   ✓ quality review launch policy > marks checks not run and not-ready when preparation fails after assessment  814ms
   ✓ quality review launch policy > installs analysis dependencies before assessment without running lifecycle scripts  1306ms
   ✓ quality review launch policy > blocks ready when analysis preparation is the only blocker (indexed: true)  1114ms
   ✓ quality review launch policy > blocks ready when analysis preparation is the only blocker (indexed: false)  819ms
   ✓ quality review launch policy > aborts a slow base export on deadline  719ms
   ✓ quality review launch policy > aborts a slow base export on caller  646ms
   ✓ quality review launch policy > delegates a durable terminal QM into a child run with a complete report  1401ms
 ✓ tests/orchestration/quality-review-models.test.ts (42 tests) 6ms
 ✓ tests/extensions/project-tools-fallow-introspection-characterization.test.ts (25 tests) 561ms
 ✓ tests/skills/exporter-sync-characterization.test.ts (25 tests) 7153ms
   ✓ runHarnessSync write mode > replaces a source-ahead target and keeps a locally edited one  391ms
   ✓ runHarnessSync write mode > reports lock contention on each row with the holder pid  2012ms
   ✓ runHarnessSync write mode > emits an owner-root lock-contended row for an empty group  2017ms
   ✓ runHarnessSync catalogue grouping > forgetting a removed asset spans every default target and scope  699ms
 ✓ tests/skills/discovery.test.ts (15 tests) 336ms
 ✓ tests/cli/tasks/commands/edit.test.ts (21 tests) 496ms
Switched to branch 'main'
Switched to branch 'feature'
 ✓ tests/memory/knowledge-store-retrieval-characterization.test.ts (15 tests) 114ms
 ✓ tests/packages/eject.test.ts (16 tests) 279ms
 ✓ tests/cli/drive/status.test.ts (8 tests) 158ms
 ✓ tests/extensions/domain-bindings.test.ts (4 tests) 299ms
 ✓ tests/sessions/session-store.test.ts (31 tests) 60ms
 ✓ tests/driver/lock-primitives.characterization.test.ts (15 tests) 228ms
 ✓ tests/agent-packages/binary-runners.characterization.test.ts (12 tests) 112ms
 ✓ tests/extensions/project-tools-fallow-fixtures.test.ts (10 tests) 6396ms
   ✓ pinned Fallow capture fixtures > fails closed for incomplete or contradictory zero-change summary evidence  353ms
   ✓ pinned Fallow capture fixtures > captures through the local pin without changing the repository worktree  5779ms
 ✓ tests/domains/resolver.test.ts (27 tests) 3ms
 ✓ tests/driver/run-step.test.ts (7 tests) 8102ms
   ✓ run-step binary > runs from outside the source directory and writes completion, events, task status, and lock effects  1496ms
   ✓ run-step binary > does not parse stale Codex env for claude-cli specs  880ms
   ✓ run-step binary > uses frozen episode actor and attempt identity in the detached runner  2351ms
   ✓ run-step binary > releases the detached plan lock after completion and before episode capture  572ms
   ✓ run-step binary > contains terminal-hook and backstop release failures in the detached child  928ms
   ✓ run-step binary > reaps its backend process group when the runner is signalled  1588ms
 ✓ tests/memory/run-pass-characterization.test.ts (10 tests) 24ms
 ✓ tests/orchestration/chain-compiler.test.ts (6 tests) 4ms
 ✓ tests/agent-packages/build.test.ts (12 tests) 82ms
 ✓ tests/driver/drive-run-start-characterization.test.ts (5 tests) 1006ms
   ✓ runStart Drive graph characterization > uses driveTaskIds instead of remainingTaskIds across resume and partial-init repair  630ms
 ✓ tests/cli/update/subcommand.test.ts (14 tests) 8ms
 ✓ tests/driver/driver.test.ts (6 tests) 3103ms
   ✓ driver > terminates a detached child published during the pre-spawn abort window  3059ms
 ✓ tests/analysis/binding-resolver.test.ts (7 tests) 10ms
 ✓ tests/durable-runtime/file-store.test.ts (6 tests) 133ms
 ✓ tests/agent-packages/claude-binary-runner.test.ts (14 tests) 35ms
 ✓ tests/driver/durable-finalizers.test.ts (2 tests) 1663ms
   ✓ Drive durable finalizer projection > records finalization_failed as a retryable finalizer step without failing the task step  1579ms
 ✓ tests/driver/drive-on-graph-routing.test.ts (4 tests) 4221ms
   ✓ Drive-on-graph routing > runs detached Drive by executing runDriveOnGraph inside the frozen runner  3613ms
 ✓ tests/driver/driver-durable-dual-write.test.ts (4 tests) 387ms
 ✓ tests/driver/drive-cancelled-dependency.test.ts (9 tests) 512ms
 ✓ tests/extensions/orchestration-lineage.test.ts (14 tests) 72ms
 ✓ tests/domains/main-domain.test.ts (8 tests) 2106ms
   ✓ main domain built-in discovery > keeps gate-selected inline knowledge adapters outside package auto-discovery  1802ms
 ✓ tests/agent-packages/definition.test.ts (26 tests) 37ms
 ✓ tests/domains/coding-agents.test.ts (13 tests) 1147ms
   ✓ coding domain agent invariants > gives analysis consumers generic tools and shared skill under project filtering  499ms
   ✓ coding domain agent invariants > registers architecture_map_read at extension factory load for architecture-consuming agents  623ms
stderr | tests/extensions/orchestration-watch-events-normalized-compat.test.ts > watch_events normalized compatibility > preserves legacy watch_events cursor semantics over graph normalized events with fallback diagnostics
{"type":"drive_durable_event_diagnostic","code":"drive_durable_run_setup_failed","message":"Drive normalized run record setup failed; disabling normalized event writes for this sink.","details":{"legacyEventType":"task_done","runId":"run-setup-failure","error":"ENOTDIR: not a directory, open '/var/folders/kq/1jrmsh1141b4x5cfd79qyq200000gn/T/orchestration-watch-events-normalized-a1Nm6Z/missions/sessions/normalized-watch-events/runs/run-setup-failure/not-a-directory/normalized-watch-events/runs/run-setup-failure/run.json'"}}

 ✓ tests/extensions/orchestration-watch-events-normalized-compat.test.ts (2 tests) 59ms
 ✓ tests/tasks/task-serializer.test.ts (23 tests) 9ms
 ✓ tests/driver/prompt-template.test.ts (10 tests) 85ms
 ✓ tests/scripts/check-reachability.test.ts (35 tests) 6440ms
 ✓ tests/artifacts/plan-conformance.test.ts (12 tests) 5ms
 ✓ tests/durable-runtime/scheduler-retry.test.ts (2 tests) 216ms
 ✓ tests/memory/consolidation-proposals-materializations-characterization.test.ts (23 tests) 178ms
 ✓ tests/cli/plans/commands/edit.test.ts (22 tests) 68ms
 ✓ tests/orchestration/quality-review-report.test.ts (29 tests) 6ms
 ✓ tests/orchestration/agent-spawner.lineage.test.ts (16 tests) 7ms
 ✓ tests/extensions/orchestration-chain-tool-durable.test.ts (7 tests) 413ms
   ✓ chain_run durable tool routing > routes loop-free chain_run through the durable graph and loop chains inline  367ms
 ✓ tests/cli/scaffold/subcommand.test.ts (21 tests) 82ms
 ✓ tests/tasks/task-parser.test.ts (30 tests) 11ms
 ✓ tests/orchestration/chain-event-adapter.test.ts (2 tests) 4ms
 ✓ tests/chains/named-chain-loader.test.ts (18 tests) 43ms
 ✓ tests/cli/drive/graph-run.test.ts (1 test) 55ms
 ✓ tests/driver/shell-command-finalizer.test.ts (2 tests) 2618ms
   ✓ Drive shell-command finalizer > records retryable finalizer failures from persisted attempt evidence as finalization_failed  2398ms
 ✓ tests/cli/drive/list.test.ts (4 tests) 48ms
 ✓ tests/driver/event-stream-bridge.test.ts (9 tests) 3384ms
   ✓ bridgeJsonlToActivityBus > stops automatically after a terminal event  329ms
   ✓ bridgeJsonlToActivityBus > settles finish() even when the final read never returns  2061ms
 ✓ tests/packages/store.test.ts (25 tests) 78ms
 ✓ tests/cli/skills/subcommand.test.ts (13 tests) 139ms
 ✓ tests/todo/todo-extension.test.ts (19 tests) 74ms
 ✓ tests/packages/manifest.test.ts (30 tests) 11ms
 ✓ tests/driver/backends/cosmonauts-subagent-resolution.test.ts (3 tests) 158ms
 ✓ tests/cli/chain-event-logger.test.ts (27 tests) 4ms
 ✓ tests/tasks/id-generator.test.ts (39 tests) 4ms
 ✓ tests/agents/skills.test.ts (16 tests) 54ms
 ✓ tests/prompts/loader.test.ts (24 tests) 327ms
 ✓ tests/durable-runtime/scheduler-parallelism.test.ts (2 tests) 326ms
 ✓ tests/extensions/orchestration-watch-events-characterization.test.ts (35 tests) 125ms
 ✓ tests/durable-runtime/runtime-criticals-characterization.test.ts (49 tests) 6ms
 ✓ tests/pi-contract/pi-behavior-contract.test.ts (5 tests) 613ms
   ✓ pi contract: same-message tool batch dispatch > one sequential tool serializes the entire batch  304ms
 ✓ tests/cli/workflow-resolution.test.ts (9 tests) 12ms
 ✓ tests/harness-adapters/registry.test.ts (3 tests) 8ms
 ✓ tests/scripts/validate-harness-exports.test.ts (12 tests) 20351ms
   ✓ repository harness export validation > validates evidence-held recovery for four repo exports before the personal bundle  11387ms
   ✓ repository harness export validation > authorizes exactly the four ratified rows from named git bytes and rejects a changed target before locking  424ms
   ✓ repository harness export validation > persists installed evidence, resumes with its receipt, checks four rows, and cleans exact backups  868ms
   ✓ repository harness export validation > a prepared-phase failure rolls back before retry installs the whole set  1395ms
   ✓ repository harness export validation > release uncertainty halts with committed bytes retained and a clean retry completes  735ms
   ✓ repository harness export validation > resumes after pending clear and after exact backup cleanup  954ms
   ✓ repository harness export validation > resumes project cleanup after a crash immediately after the first backup deletion  630ms
   ✓ repository harness export validation > resumes personal bundle cleanup after a crash immediately after its backup deletion  1232ms
   ✓ repository harness export validation > rejects an absent project backup without a matching cleanup intent  543ms
   ✓ repository harness export validation > preserves a changed project backup and reports it as ambiguous  515ms
   ✓ repository harness export validation > never removes an evidence-nominated same-user path  482ms
   ✓ repository harness export validation > never removes a personal path nominated by external-bundle evidence  1185ms
 ✓ tests/cli/plans/commands/list.test.ts (20 tests) 99ms
 ✓ tests/cli/tasks/commands/search.test.ts (21 tests) 62ms
 ✓ tests/extensions/task-plan-linkage.test.ts (18 tests) 99ms
 ✓ tests/extensions/agent-memory-remember-params-characterization.test.ts (26 tests) 103ms
 ✓ tests/extensions/orchestration-watch-events.test.ts (6 tests) 39ms
 ✓ tests/durable-runtime/scheduler-cancellation.test.ts (1 test) 139ms
 ✓ tests/extensions/orchestration-driver-tool-graph.test.ts (1 test) 98ms
 ✓ tests/driver/backends/codex.test.ts (8 tests) 13ms
 ✓ tests/domains/registry.test.ts (20 tests) 4ms
 ✓ tests/extensions/orchestration-rendering.test.ts (26 tests) 3ms
 ✓ tests/extensions/project-tools-process.test.ts (4 tests) 1425ms
   ✓ project-tools provider process runner > spools large output losslessly and removes the private copies  339ms
   ✓ project-tools provider process runner > distinguishes signal abort timeout and spawn failure from clean exit  796ms
 ✓ tests/driver/contradicted-block-retry.test.ts (5 tests) 163ms
 ✓ tests/sessions/manifest.test.ts (17 tests) 108ms
 ✓ tests/artifact-viewer/loaders.test.ts (7 tests) 106ms
 ✓ tests/durable-runtime/run-start-resume.test.ts (4 tests) 206ms
 ✓ tests/driver/drive-graph-finalization-result.test.ts (3 tests) 2394ms
   ✓ Drive graph finalization results > emits a completion candidate with a Done task and a Cancelled plan task  383ms
   ✓ Drive graph finalization results > reports completed task-status count and emits one run_finalization_failed for state-commit failure  1421ms
   ✓ Drive graph finalization results > continues after a driver-committed partial task without marking it Done or all tasks passed  590ms
 ✓ tests/tasks/task-manager-concurrency.test.ts (4 tests) 1667ms
   ✓ TaskManager concurrency > allocates distinct IDs for concurrent creates across separate TaskManager instances  1101ms
 ✓ tests/driver/backends/claude-cli.test.ts (7 tests) 37ms
 ✓ tests/driver/cross-plan-commit-lock.test.ts (1 test) 7984ms
   ✓ cross-plan detached commit serialization > serializes driver-owned commits across detached runs in one repo  7983ms
 ✓ tests/durable-runtime/scheduler-contracts.test.ts (2 tests) 5ms
 ✓ tests/skills/exporter-sync-failure-characterization.test.ts (8 tests) 529ms
 ✓ tests/pi-contract/pi-session-contract.test.ts (6 tests) 76ms
 ✓ tests/agent-packages/skills.test.ts (8 tests) 74ms
 ✓ tests/cli/eject/subcommand.test.ts (14 tests) 6ms
 ✓ tests/extensions/orchestration-activity.test.ts (6 tests) 8ms
 ✓ tests/orchestration/quality-review-artifacts.test.ts (3 tests) 95ms
 ✓ tests/cli/plans/commands/check-artifacts.test.ts (5 tests) 61ms
 ✓ tests/memory/episode-prune-journal-characterization.test.ts (36 tests) 293ms
 ✓ tests/extensions/orchestration-chain-tool-observation.test.ts (3 tests) 7ms
 ✓ tests/extensions/orchestration-run-control-surface.test.ts (1 test) 274ms
 ✓ tests/orchestration/message-bus.test.ts (14 tests) 4ms
 ✓ tests/driver/lock.test.ts (6 tests) 83ms
 ✓ tests/agent-packages/codex-binary-runner.test.ts (5 tests) 14ms
 ✓ tests/driver/backends/cosmonauts-subagent.test.ts (5 tests) 15ms
 ✓ tests/extensions/orchestration-spawn-inline-compiler.test.ts (2 tests) 178ms
 ✓ tests/architecture-map/freshness.test.ts (3 tests) 56ms
 ✓ tests/agent-packages/codex-cli.test.ts (10 tests) 23ms
 ✓ tests/cli/tasks/commands/view.test.ts (8 tests) 19ms
 ✓ tests/driver/parity.test.ts (1 test) 5355ms
   ✓ driver inline vs detached parity > keeps behavioral output equivalent while detached commits differ by metadata  5355ms
 ✓ tests/durable-runtime/scheduler-store.test.ts (1 test) 37ms
 ✓ tests/driver/drive-graph-compiler.test.ts (2 tests) 90ms
 ✓ tests/cli/tasks/commands/list.test.ts (16 tests) 60ms
 ✓ tests/durable-runtime/scheduler-heartbeats.test.ts (1 test) 132ms
 ✓ tests/extensions/orchestration-driver-session-scoping.test.ts (1 test) 13ms
 ✓ tests/driver/durable-steps.test.ts (2 tests) 143ms
 ✓ tests/cli/architecture/subcommand.test.ts (8 tests) 33ms
 ✓ tests/extensions/orchestration-run-control.test.ts (2 tests) 236ms
 ✓ tests/harness-adapters/provenance.characterization.test.ts (2 tests) 256ms
 ✓ tests/driver/backends/orchestration-adapter.test.ts (1 test) 6ms
 ✓ tests/agent-packages/claude-cli.test.ts (11 tests) 71ms
 ✓ tests/orchestration/quality-review-one-pass.test.ts (1 test) 899ms
   ✓ assesses one triaged panel before running one configured check  898ms
 ✓ tests/helpers/project-health-record.test.ts (7 tests) 6ms
 ✓ tests/memory/transition-capture-release-unconfirmed.test.ts (3 tests) 212ms
 ✓ tests/cli/tasks/commands/create-batch-row-characterization.test.ts (27 tests) 12ms
 ✓ tests/durable-runtime/run-start.test.ts (3 tests) 98ms
 ✓ tests/cli/plans/commands/create.test.ts (8 tests) 51ms
 ✓ tests/cli/plans/commands/delete.test.ts (17 tests) 69ms
 ✓ tests/artifact-viewer/server.test.ts (3 tests) 576ms
   ✓ artifact-viewer server > serves architecture map pages and missing map empty state  544ms
 ✓ tests/orchestration/activity-bus.test.ts (10 tests) 3ms
 ✓ tests/cli/tasks/commands/delete.test.ts (17 tests) 142ms
 ✓ tests/durable-runtime/backend-contracts.test.ts (1 test) 5ms
 ✓ tests/architecture-map/analyzer.test.ts (2 tests) 317ms
   ✓ typescriptSourceAnalyzer > records public interfaces internal dependencies and external imports  304ms
 ✓ tests/durable-runtime/controller.test.ts (3 tests) 53ms
 ✓ tests/orchestration/chain-routing.test.ts (2 tests) 6ms
 ✓ tests/extensions/observability.test.ts (6 tests) 3ms
 ✓ tests/config/scaffold.test.ts (11 tests) 48ms
 ✓ tests/cli/architecture/narrative-provider.test.ts (3 tests) 5ms
 ✓ tests/analysis/contracts.test.ts (4 tests) 4ms
 ✓ tests/cli/resolve-default-lead.test.ts (6 tests) 3ms
 ✓ tests/domains/shared-main-leakage.test.ts (2 tests) 7ms
 ✓ tests/extensions/orchestration-driver-bus-isolation.test.ts (3 tests) 6ms
 ✓ tests/cli/session-per-domain-leads.test.ts (1 test) 2ms
 ✓ tests/driver/backends/process-reaping.test.ts (6 tests) 9165ms
   ✓ backend process reaping > leaves no live descendant when the backend settles (codex)  1546ms
   ✓ backend process reaping > leaves no live descendant when the backend settles (claude-cli)  2284ms
   ✓ backend process reaping > settles when a descendant holds the output pipes open (codex)  883ms
   ✓ backend process reaping > settles when a descendant holds the output pipes open (claude-cli)  848ms
   ✓ backend process reaping > escalates an ignored SIGTERM to SIGKILL on a bounded deadline  3588ms
 ✓ tests/helpers/domain-package-fixture.test.ts (1 test) 41ms
 ✓ tests/agents/qualified-role.test.ts (23 tests) 4ms
 ✓ tests/harness-runtime-inventory.test.ts (1 test) 23ms
 ✓ tests/scripts/suppression-policy.test.ts (16 tests) 2119ms
   ✓ suppression policy > tracked source directives exactly match the exception registry  2107ms
 ✓ tests/scripts/update-fallow-baselines.test.ts (3 tests) 1277ms
   ✓ reasoned refresh saves a requested baseline and appends provenance  486ms
   ✓ refresh analyzes the base commit despite ahead and dirty findings  614ms
 ✓ tests/cli/create/subcommand.test.ts (8 tests) 42ms
 ✓ tests/cli/run/named-qm-entry.test.ts (2 tests) 1195ms
   ✓ runs the shipped verify named chain through the CLI to a terminal QM report  602ms
   ✓ runs the shipped implement named chain through the CLI to a terminal QM report  592ms
Preparing worktree (detached HEAD 80482c2)
 ✓ tests/memory/consolidation-source-contract-characterization.test.ts (4 tests) 3ms
 ✓ tests/durable-runtime/scheduler-capacity-characterization.test.ts (2 tests) 58ms
 ✓ tests/orchestration/quality-review-session-prompt.test.ts (1 test) 56ms
 ✓ tests/helpers/packages.test.ts (1 test) 36ms
Switched to branch 'main'
 ✓ tests/extensions/orchestration-authority.test.ts (3 tests) 8ms
Switched to branch 'feature'
 ✓ tests/orchestration/quality-review-profile.test.ts (8 tests) 3ms
 ✓ tests/agent-packages/export.test.ts (2 tests) 17ms
 ✓ tests/orchestration/quality-review-checks.test.ts (4 tests) 398ms
 ✓ tests/cli/serve/subcommand.test.ts (3 tests) 39ms
 ✓ tests/orchestration/quality-review-workspace.test.ts (4 tests) 1744ms
   ✓ private review workspace capture > refuses three changing samples before any clone I/O  351ms
   ✓ private review workspace capture > refuses sparse, gitlink, nested and linked-worktree layouts  563ms
   ✓ private review workspace capture > uses the fork merge-base when the base branch advances  575ms
 ✓ tests/agents/runtime-identity.test.ts (11 tests) 2ms
 ✓ tests/architecture-map/config.test.ts (2 tests) 23ms
 ✓ tests/coding-domain-rename.test.ts (3 tests) 34ms
 ✓ tests/cli/pi-flags.test.ts (7 tests) 3ms
 ✓ tests/domains/coding-chains.test.ts (6 tests) 5ms
 ✓ tests/agent-packages/compatibility.test.ts (4 tests) 3ms
 ✓ tests/cli/shared/output.test.ts (8 tests) 3ms
 ✓ tests/skills/shipped-frontmatter.test.ts (3 tests) 59ms
 ✓ tests/driver/report-parser.test.ts (9 tests) 2ms
 ✓ tests/orchestration/semaphore.test.ts (6 tests) 2ms
 ✓ tests/domains/default-domain.test.ts (4 tests) 2ms
 ✓ tests/cli/plans/commands/archive.test.ts (4 tests) 147ms
 ✓ tests/helpers/fixtures.test.ts (4 tests) 52ms
 ✓ tests/orchestration/spawn-limits.test.ts (12 tests) 2ms
 ✓ tests/cli/quality-review-cli.test.ts (2 tests) 1432ms
   ✓ standalone Quality Manager CLI > leaves 1 existing plan directories byte-identical without explicit context  640ms
   ✓ standalone Quality Manager CLI > leaves 2 existing plan directories byte-identical without explicit context  792ms
 ✓ tests/extensions/analysis-consent-snapshot.test.ts (1 test) 25ms
 ✓ tests/orchestration/quality-review-pi-settings.test.ts (1 test) 1255ms
   ✓ launches a quality session without clone Pi settings or appended prompt  1254ms
 ✓ tests/orchestration/assistant-text.test.ts (6 tests) 3ms
 ✓ tests/orchestration/quality-review-repository-pins.test.ts (2 tests) 230ms
 ✓ tests/driver/driver-detached.test.ts (12 tests) 33275ms
   ✓ startDetached > copies a prebuilt runner binary into the run workdir when available  868ms
   ✓ startDetached > driver detached codex e2e prepares the workdir, launches the compiled runner, bridges events, and leaves locking to the child  2608ms
   ✓ startDetached > bridges a post-terminal episode capture failure to the detached parent bus  2204ms
   ✓ startDetached > bounds post-terminal bridge drain when the child does not exit  4042ms
   ✓ startDetached > stops a draining bridge when the detached result rejects  4110ms
   ✓ startDetached > reconciles one terminal episode when the parent aborts after detached start  3600ms
   ✓ startDetached > keeps abort capture and reporter failures non-fatal with one established warning  3741ms
   ✓ startDetached > escalates an ignored SIGTERM to SIGKILL so abort settles on a bounded deadline  5572ms
   ✓ startDetached > keeps one completion-backed aborted terminal when abort escalates to SIGKILL  6230ms
 ✓ tests/orchestration/quality-review-command.test.ts (4 tests) 3273ms
   ✓ quality review host commands > reaps same-group children after a successful leader exit and keeps output  2223ms
   ✓ quality review host commands > finishes on leader exit while a detached grandchild holds stdout  1006ms
 ✓ tests/orchestration/chain-runner-cosmo-migration.test.ts (1 test) 7ms
 ✓ tests/packages/catalog.test.ts (8 tests) 3ms
 ✓ tests/scripts/check-reachability-visit.test.ts (27 tests) 5975ms
   ✓ reachability verdict for the shipped repository > reaches every runtime lib module under the committed staged-code registry  1413ms
 ✓ tests/driver/backends/registry.test.ts (4 tests) 2ms
 ✓ tests/cli/plans/subcommand.test.ts (4 tests) 3ms
 ✓ tests/cli/architecture/main-dispatch.test.ts (2 tests) 1830ms
   ✓ cli/main architecture dispatch > routes cosmonauts architecture generate to createArchitectureProgram  1522ms
   ✓ cli/main architecture dispatch > routes cosmonauts arch generate through the same top-level command  308ms
 ✓ tests/coding-agnostic-framework.test.ts (1 test) 263ms
 ✓ tests/domains/public-surface.test.ts (1 test) 2ms
 ✓ tests/cli/shared/errors.test.ts (4 tests) 9ms
 ✓ tests/domains/bindings.test.ts (1 test) 5ms
 ✓ tests/cli/plans/commands/view.test.ts (3 tests) 70ms
 ✓ tests/cli/dump-prompt.test.ts (3 tests) 1946ms
   ✓ --dump-prompt > default routing main installed defaults to main/cosmo when no agent is provided  671ms
   ✓ --dump-prompt > default routing coding domain uses coding/cody when no agent is provided  637ms
   ✓ --dump-prompt > uses the explicit cody agent when provided  637ms
 ✓ tests/driver/driver-script.test.ts (2 tests) 24ms
 ✓ tests/config/biome.test.ts (1 test) 41ms
 ✓ tests/memory/proposal-disappeared-characterization.test.ts (1 test) 20ms
 ✓ tests/orchestration/surface-non-goals.test.ts (1 test) 5ms
 ✓ tests/driver/default-envelope.test.ts (2 tests) 2ms
 ✓ tests/cli/serve/main-dispatch.test.ts (2 tests) 1841ms
   ✓ cli/main serve dispatch > routes cosmonauts serve to createServeProgram with host port open options  1520ms
   ✓ cli/main serve dispatch > does not fall through to normal prompt runtime parsing  321ms
 ✓ tests/cli/export/main-dispatch.test.ts (2 tests) 1814ms
   ✓ cli/main export dispatch > routes cosmonauts export to createExportProgram  1561ms
 ✓ tests/domains/agent-models.test.ts (1 test) 44ms
 ✓ tests/artifact-viewer/render.test.ts (3 tests) 5ms
 ✓ tests/extensions/init.test.ts (3 tests) 2ms
 ✓ tests/interactive/agent-switch.test.ts (5 tests) 3ms
 ✓ tests/prompts/provider-neutrality.test.ts (9 tests) 14ms
 ✓ tests/init/prompt.test.ts (4 tests) 2ms
 ✓ tests/skills/agent-packaging.test.ts (1 test) 5ms
 ✓ tests/helpers/extension-api-mock.test.ts (1 test) 1ms
 ✓ tests/cli/tasks/subcommand.test.ts (3 tests) 3ms
 ✓ tests/cli/no-domain-guard.test.ts (3 tests) 1ms
 ✓ tests/cli/memory/main-dispatch.test.ts (1 test) 914ms
   ✓ cli/main memory dispatch > routes top-level memory commands without interactive fallthrough  913ms
 ✓ tests/scripts/check-new-suppressions.test.ts (19 tests) 9672ms
   ✓ script requires base registration for a triple-slash TypeScript directive  618ms
   ✓ script requires base registration for a JSDoc TypeScript directive  604ms
   ✓ script requires base registration for a block TypeScript directive  655ms
   ✓ script requires base registration for a JSX Biome directive  613ms
   ✓ script requires base registration for a block ESLint directive  551ms
   ✓ script rejects a same-change exception because the base registry owns authorization  321ms
   ✓ script accepts an added directive only when registered in the base revision  347ms
   ✓ script rejects a changed target despite a base registered directive  406ms
   ✓ script requires base registration for a line @ts-nocheck directive  703ms
   ✓ script requires base registration for a triple-slash @ts-nocheck directive  628ms
   ✓ script requires base registration for a block @ts-nocheck directive  622ms
   ✓ script requires base registration for a file-level Biome directive  556ms
   ✓ script requires base registration for a multi-line block ending in @ts-ignore directive  616ms
   ✓ script requires base registration for a JSDoc block ending in @ts-expect-error directive  495ms
   ✓ script requires base registration for a JSONC Biome directive  534ms
   ✓ script requires base registration for a JSON Biome directive  494ms
   ✓ script accepts an existing directive moved by a pure rename  349ms
   ✓ script rejects a directive added to a renamed file  307ms
 ✓ tests/cli/tasks/cancelled-status.test.ts (1 test) 4198ms
   ✓ a Cancelled task through the CLI > persists, keeps its dependent blocked, and lets its plan archive  4197ms
 ✓ tests/orchestration/quality-review-run.test.ts (158 tests) 76054ms
   ✓ quality review durable lifecycle > uses the configured workspace removal timeout on a stalled remover  1180ms
   ✓ quality review durable lifecycle > runs host checks in the snapshot, persists output and blocks a failed check  976ms
   ✓ quality review durable lifecycle > runs base-owned check argv even when the reviewed config rewrites it  1788ms
   ✓ quality review durable lifecycle > excludes its own plan summary from the captured change  1268ms
   ✓ quality review durable lifecycle > blocks a ready claim when the host observed an unbound audit  1173ms
   ✓ quality review durable lifecycle > never reports ready with a host human item from checks not configured  1314ms
   ✓ quality review durable lifecycle > never reports ready with a host human item from gate-owned change  1313ms
   ✓ quality review durable lifecycle > never reports ready with a host human item from unbound audit  950ms
   ✓ quality review durable lifecycle > never reports ready with a host human item from unobserved audit  796ms
   ✓ quality review durable lifecycle > never reports ready with a host human item from failed-to-run audit  944ms
   ✓ quality review durable lifecycle > never reports ready with a host human item from missing gate evidence  932ms
   ✓ quality review durable lifecycle > never reports ready with a host human item from check preparation failure  1163ms
   ✓ quality review durable lifecycle > never reports ready with a host human item from analysis preparation failure  1193ms
   ✓ quality review durable lifecycle > reports a bound failing audit under gates and findings without a human item  949ms
   ✓ quality review durable lifecycle > reports each finding from a bound failing audit envelope  629ms
   ✓ quality review durable lifecycle > uses one prefix for real unbound validator state  671ms
   ✓ quality review durable lifecycle > uses one prefix for real unconsented validator state  572ms
   ✓ quality review durable lifecycle > uses one prefix for real missing validator state  572ms
   ✓ quality review durable lifecycle > does not call an unrelated config edit gate-owned  1097ms
   ✓ quality review durable lifecycle > ignores a gate-owned change made only on the advanced base branch  968ms
   ✓ quality review durable lifecycle > keeps a completed not-ready verdict when workspace removal fails  616ms
   ✓ quality review durable lifecycle > persists the terminal report and status before a stalled remover  516ms
   ✓ quality review durable lifecycle > finalizes with a named integrity failure when a reviewer store write never settles  482ms
   ✓ quality review durable lifecycle > waits several seconds by default for an aborting QM tool to settle  800ms
   ✓ quality review durable lifecycle > uses the configured QM settle grace  512ms
   ✓ quality review durable lifecycle > reports empty checks and gate-owned changes as human decisions  406ms
   ✓ quality review durable lifecycle > includes passing host check details even when the model omits them  532ms
   ✓ quality review durable lifecycle > reports reviewer models from run-owned evidence  378ms
   ✓ quality review durable lifecycle > calibrates Findings shape numbered  590ms
   ✓ quality review durable lifecycle > calibrates Findings shape star  590ms
   ✓ quality review durable lifecycle > calibrates Findings shape plus  502ms
   ✓ quality review durable lifecycle > calibrates Findings shape prose  556ms
   ✓ quality review durable lifecycle > calibrates Findings shape before bullet  704ms
   ✓ quality review durable lifecycle > calibrates Findings shape after dismissal  702ms
   ✓ quality review durable lifecycle > calibrates Findings shape after blank line  717ms
   ✓ quality review durable lifecycle > calibrates Findings shape ID-less bullet  718ms
   ✓ quality review durable lifecycle > calibrates Findings shape dismissal  676ms
   ✓ quality review durable lifecycle > calibrates Findings shape sub-finding  658ms
   ✓ quality review durable lifecycle > calibrates Findings shape still open  723ms
   ✓ quality review durable lifecycle > calibrates Findings shape not resolved  934ms
   ✓ quality review durable lifecycle > calibrates Findings shape closed prematurely  822ms
   ✓ quality review durable lifecycle > calibrates Findings shape blank line  827ms
   ✓ quality review durable lifecycle > calibrates Findings shape subheading  477ms
   ✓ quality review durable lifecycle > calibrates Findings shape extra heading  428ms
   ✓ quality review durable lifecycle > calibrates Findings shape repeated Findings  431ms
   ✓ quality review durable lifecycle > calibrates Findings shape repeated Human decisions  413ms
   ✓ quality review durable lifecycle > calibrates Findings shape Checks line ending in Findings  422ms
   ✓ quality review durable lifecycle > calibrates Findings shape Gates Findings subheading  420ms
   ✓ quality review durable lifecycle > calibrates Findings shape Checks Human decisions subheading  447ms
   ✓ quality review durable lifecycle > calibrates Findings shape empty  396ms
   ✓ quality review durable lifecycle > calibrates Findings shape plain sentinel  329ms
   ✓ quality review durable lifecycle > calibrates Findings shape case-insensitive bullet sentinel  302ms
   ✓ quality review durable lifecycle > calibrates out-of-range finding  315ms
   ✓ quality review durable lifecycle > calibrates out-of-range dismissal  315ms
   ✓ quality review durable lifecycle > calibrates in-range dismissal  315ms
   ✓ quality review durable lifecycle > calibrates dismissal with a trailing paragraph  309ms
   ✓ quality review durable lifecycle > reaches ready with an unset reviewer model and records the model only  302ms
   ✓ quality review durable lifecycle > reaches ready with a reviewer model on the QM's provider and records the model only  301ms
   ✓ quality review durable lifecycle > reaches ready with a reviewer model on any other provider and records the model only  305ms
   ✓ quality review durable lifecycle > reaches ready with a configured reviewer model the session did not use and records the model only  308ms
   ✓ quality review durable lifecycle > calibrates observation-only P2 performance findings in the final report  306ms
   ✓ quality review durable lifecycle > fails the configured suppression check for an unregistered directive  437ms
   ✓ quality review durable lifecycle > keeps a clean report ready with trailing whitespace on a defined heading  306ms
   ✓ quality review durable lifecycle > keeps a duplicate defined heading at EOF and blocks ready with host checks  302ms
   ✓ quality review durable lifecycle > preserves CRLF duplicate and blocks ready with host checks  314ms
   ✓ quality review durable lifecycle > preserves empty title in report and blocks ready with host checks  303ms
   ✓ quality review durable lifecycle > preserves empty title after index and blocks ready with host checks  306ms
   ✓ quality review durable lifecycle > preserves same-line index suffix and blocks ready with host checks  305ms
   ✓ quality review durable lifecycle > preserves index trailing whitespace and blocks ready with host checks  306ms
   ✓ quality review durable lifecycle > preserves unclosed index marker and blocks ready with host checks  302ms
   ✓ quality review durable lifecycle > keeps an empty Reason's same-line suffix and host checks  302ms
   ✓ quality review durable lifecycle > keeps an empty Reason's trailing whitespace and host checks  303ms
   ✓ quality review durable lifecycle > keeps an empty Reason's unclosed marker and host checks  309ms
   ✓ quality review durable lifecycle > keeps a clean LF report ready  309ms
   ✓ quality review durable lifecycle > keeps a clean CRLF report ready  307ms
   ✓ quality review durable lifecycle > keeps a clean CR report ready  314ms
   ✓ quality review durable lifecycle > carries an omitted reviewer finding through a non-breaking-space Findings heading  303ms
   ✓ quality review durable lifecycle > persists a preparation timeout and removes its private workspace  339ms
   ✓ quality review durable lifecycle > cancels promptly during prepare  312ms
   ✓ quality review durable lifecycle > cancels promptly during checks  304ms
   ✓ quality review durable lifecycle > cancels promptly during assessment  3300ms
   ✓ quality review durable lifecycle > ends a stalled assessment at its configured deadline and retains live child workspace  3450ms
   ✓ quality review durable lifecycle > retains the workspace when the QM itself ignores abort without a panel child  3311ms
   ✓ quality review durable lifecycle > records a grandchild check timeout in checks.md  471ms
   ✓ quality review durable lifecycle > preserves an unindexed report when host checks are configured  305ms
   ✓ quality review durable lifecycle > makes a new pretest script a human decision item  383ms
   ✓ quality review durable lifecycle > uses the base gateOwnedPaths when the reviewed change edits a runner  317ms
   ✓ quality review durable lifecycle > flags a removed Biome rule from this repository's base-owned gate paths  309ms
   ✓ quality review durable lifecycle > lists an executable package script change once even when package.json is gate-owned  332ms
   ✓ quality review durable lifecycle > does not let a later check rewrite change sealed review evidence  324ms
   ✓ quality review durable lifecycle > records earlier analysis preparation successes before a later failure  309ms
   ✓ quality review durable lifecycle > retains the deadline reason when a reviewer write is abandoned  301ms
   ✓ quality review durable lifecycle > loads base project domains without importing reviewed domains  835ms
   ✓ quality review durable lifecycle > writes no legacy review-round file on a completed or failed QM run  538ms

 Test Files  288 passed (288)
      Tests  3923 passed (3923)
   Start at  06:05:30
   Duration  78.79s (transform 6.13s, setup 1.54s, collect 49.84s, tests 426.94s, environment 22ms, prepare 9.53s)


```

## lint

- argv: ["bun","run","lint"]
- exit code: 0
- duration: 1952 ms
- timed out: false

```text
$ biome check .
Checked 644 files in 290ms. No fixes applied.

```

## typecheck

- argv: ["bun","run","typecheck"]
- exit code: 0
- duration: 6150 ms
- timed out: false

```text
$ tsc --noEmit

```

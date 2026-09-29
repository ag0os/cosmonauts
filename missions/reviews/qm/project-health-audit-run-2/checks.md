Analysis preparation analysis-dependencies: passed in 445 ms (lifecycle scripts disabled).
# Preparation

- dependencies: passed in 54 ms

# Configured checks

## suppressions

- argv: ["bun","scripts/check-new-suppressions.ts","--base","64dca3c91439241b805f51b37fb38527ba23cc10"]
- exit code: 0
- duration: 8614 ms
- timed out: false

```text
suppression check passed

```

## test

- argv: ["bun","run","test"]
- exit code: 0
- duration: 81173 ms
- timed out: false

```text
$ node ./scripts/vitest-runner.mjs

 RUN  v3.2.4 /private/var/folders/kq/1jrmsh1141b4x5cfd79qyq200000gn/T/cosmonauts-qm-qm-d213250a-0613-43cc-bcf6-d0c7218b963b/checkout

 ✓ tests/memory/living-memory-commit-interleavings.test.ts (31 tests) 1523ms
 ✓ tests/memory/interface.test.ts (21 tests) 1574ms
   ✓ memory interface > exposes exact living-memory outcomes through configured knowledge consolidate only  403ms
 ✓ tests/memory/markdown-store.test.ts (23 tests) 2232ms
   ✓ markdown memory store > creates a freed canonical playbook name across a dense suffix range  487ms
   ✓ markdown memory store > binds default and overridden episode thresholds into fresh-store stats and warnings  398ms
 ✓ tests/extensions/architecture-memory.test.ts (13 tests) 600ms
 ✓ tests/extensions/project-tools.test.ts (26 tests) 3411ms
   ✓ project-tools extension > withholds all provider execution until consent is recorded  399ms
   ✓ project-tools extension > aborting a capability tool terminates the provider child  855ms
   ✓ project-tools extension > aborting first-use during version discovery terminates introspection and reports failure  343ms
   ✓ project-tools extension > aborting first-use during config discovery terminates introspection and reports failure  370ms
   ✓ project-tools extension > session_start aborts obsolete discovery and a later call discovers afresh  358ms
   ✓ project-tools extension > session_shutdown aborts obsolete discovery and a later call discovers afresh  363ms
 ✓ tests/extensions/agent-memory.test.ts (39 tests) 3664ms
   ✓ agent-memory extension > indexes playbooks and recalls their full steps in a later session  606ms
   ✓ agent-memory extension > injects recalls and protects oversized human profiles honestly  480ms
   ✓ agent-memory extension > recall searches notes over project and user scopes with default and capped limits  376ms
   ✓ agent-memory extension > recalls enabled episodes through the existing bounded recall tool  353ms
   ✓ agent-memory extension > memory index injection uses list mode capped to the 50 most recent records before truncation  746ms
 ✓ tests/tasks/task-manager.test.ts (67 tests) 4051ms
   ✓ TaskManager > adds gated fail-soft episodes only for task creation and real status transitions  489ms
   ✓ TaskManager > preserves unlocked task update bytes for every transition-lock bypass  363ms
   ✓ TaskManager > warns and runs task updates unlocked on lock errors and bounded waits  1151ms
 ✓ tests/harness-adapters/provenance.test.ts (2 tests) 1818ms
   ✓ harness provenance > classifies the complete owner source target mode and concurrent-read grid without writing  755ms
   ✓ harness provenance > preserves edited foreign and untraceable targets and permits only safe lineage or owner transfer  1062ms
 ✓ tests/harness-adapters/sync.test.ts (8 tests) 6842ms
   ✓ harness sync planning > bootstraps and migrates both commands as one nonhistorical recoverable transaction  1303ms
   ✓ harness sync planning > recovers every phase vector through one sibling lock while retaining evidence holds  3032ms
   ✓ harness sync planning > fresh recovery converges removal transactions with absent new targets across phases  641ms
   ✓ harness sync planning > fresh recovery restores manifest-only forget transfer and absent-target removal intent  1306ms
   ✓ harness sync planning > fresh recovery preserves equal old and new target relations for cross-project regeneration  315ms
 ✓ tests/extensions/project-tools-fallow.test.ts (32 tests) 7162ms
   ✓ Fallow provider discovery > resolves supported POSIX and Windows native platform packages without PATH or package-manager shims  402ms
   ✓ Fallow provider discovery > installed native provider preserves crash evidence and cleans descendants on abort and timeout  1484ms
   ✓ Fallow capability execution > analysis_audit passes inherited findings and fails introduced findings in each category  1404ms
   ✓ Fallow capability execution > audits tracked staged and untracked dirty base changes from HEAD  1126ms
   ✓ Fallow capability execution > leaves the entire worktree unchanged across status and every capability  1042ms
stderr | tests/runtime.test.ts > CosmonautsRuntime > chain selection > includes chains from matching domain context
[warning] [coding chain:build] Named chain stage "worker" does not resolve to any known agent

 ✓ tests/cli/drive/run.test.ts (33 tests) 5933ms
   ✓ cosmonauts run drive compat run > resume finalizes pending commit failure before invoking backend work  309ms
   ✓ cosmonauts run drive compat run > resume refuses state commit external acceptance when pending tasks are missing or not done  661ms
   ✓ cosmonauts run drive compat run > resume accepts a Cancelled pending task as closed state-commit evidence  361ms
   ✓ cosmonauts run drive compat run > resume retries pending state commit without invoking backend work  367ms
   ✓ cosmonauts run drive compat run > resume records source task-status and state-commit finalizer retry failures as attempts  1532ms
   ✓ cosmonauts run drive compat run > resume uses legacy driver events while dual-writing normalized resume events  380ms
stderr | tests/runtime.test.ts > CosmonautsRuntime > chain selection > includes all domain chains when no domain context
[warning] [coding chain:build] Named chain stage "worker" does not resolve to any known agent

stderr | tests/runtime.test.ts > CosmonautsRuntime > chain selection > filters out non-matching domain chains
[warning] [coding chain:build] Named chain stage "worker" does not resolve to any known agent
[warning] [other chain:other-flow] Named chain stage "x" does not resolve to any known agent

 ✓ tests/skills/exporter.test.ts (18 tests) 3825ms
   ✓ exportSkill > removes stale files from previous export  456ms
   ✓ exportSkill > overwrites existing export  477ms
   ✓ runHarnessSync selection > refuses malformed manifest path authority without changing any owner bytes  829ms
   ✓ runHarnessSync selection > accepts and upgrades a legacy manifest entry whose output identity differs from its source directory  332ms
   ✓ runHarnessSync selection > forgets only after a still-declared source root is completely observed  446ms
 ✓ tests/runtime.test.ts (27 tests) 1826ms
 ✓ tests/plans/plan-manager.test.ts (44 tests) 1575ms
   ✓ PlanManager > serializes enabled same-plan status transition decisions across manager instances  353ms
 ✓ tests/cli/drive/graph-resume.test.ts (13 tests) 8417ms
   ✓ cosmonauts run drive compat graph resume > resumes graph runs without rewriting original selected task ids  843ms
   ✓ cosmonauts run drive compat graph resume > drops an unavailable frozen worker before execution and never attributes the fallback to it  725ms
   ✓ cosmonauts run drive compat graph resume > treats empty-legacy-queue graph continuation as worker execution  474ms
   ✓ cosmonauts run drive compat graph resume > resumes pending task-status finalization with one terminal result  769ms
   ✓ cosmonauts run drive compat graph resume > resumes already completed graph runs with one terminal result  1077ms
   ✓ cosmonauts run drive compat graph resume > rehydrates the attempt ledger and skips a second terminal after thrown-exit resume  686ms
   ✓ cosmonauts run drive compat graph resume > records one run-id-derived terminal for an off-then-enabled completed resume  414ms
   ✓ cosmonauts run drive compat graph resume > records one run-id-derived terminal for a completed graph-backed resume  690ms
   ✓ cosmonauts run drive compat graph resume > repeats deterministic terminal-only resume without changing bytes or episode count  558ms
   ✓ cosmonauts run drive compat graph resume > warns and skips terminal capture when off-era resume source cannot resolve  462ms
   ✓ cosmonauts run drive compat graph resume > leaves graph resume inputs byte-identical when dirty or unsupported resume is refused  610ms
   ✓ cosmonauts run drive compat graph resume > keeps persisted terminal identity artifact-free while episodic capture is off  364ms
   ✓ cosmonauts run drive compat graph resume > keeps a failing pending finalization artifact-free while episodic capture is off  745ms
error: unknown option '--workflow'
error: unknown option '-w'
error: unknown option '--list-workflows'
Refusing to start an interactive session: no terminal is attached to stdin. This usually means a subcommand was mistyped or a global flag was placed before it — the root command takes free prompt text, so anything the subcommand table does not match becomes a prompt (for example `cosmonauts --json plan ...` instead of `cosmonauts plan ... --json`). Run `cosmonauts --help` for the subcommand list, or use `--print` for non-interactive output.
 ✓ tests/packages/scanner.test.ts (34 tests) 83ms
 ✓ tests/cli/main.test.ts (82 tests) 142ms
 ✓ tests/extensions/orchestration.test.ts (39 tests) 10447ms
   ✓ orchestration extension > spawn_agent routes the resolved canonical QM through a durable refusal without a session  302ms
   ✓ orchestration extension > a scripted QM and panel refuse mutation tools and a forbidden spawn without changing the checkout  1040ms
   ✓ orchestration extension > a reviewer ending in a text-less provider error after retries is a failed review, not evidence  1160ms
   ✓ orchestration extension > a reviewer ending in a provider error after partial text is a failed review, not evidence  983ms
   ✓ orchestration extension > a reviewer ending in an aborted final message is a failed review, not evidence  1574ms
   ✓ orchestration extension > a reviewer ending in a final message with no text of its own is a failed review, not evidence  1369ms
   ✓ orchestration extension > a reviewer ending in a final message stopped at the token limit is a failed review, not evidence  1367ms
   ✓ orchestration extension > a reviewer ending in no assistant message at all is a failed review, not evidence  1085ms
   ✓ orchestration extension > a reviewer whose final message has its own text is recorded as evidence  1022ms
 ✓ tests/orchestration/agent-spawner.spawn.test.ts (26 tests) 129ms
 ✓ tests/memory/living-memory.test.ts (83 tests) 11468ms
   ✓ living memory > preserves live bytes when a retirement source changes after manifest commit  533ms
   ✓ living memory > recovery proves manifest durability and linked live identity before unlink  412ms
   ✓ living memory > annotates a human restoration and reserves hard deletion for the ledger  1372ms
   ✓ living memory > recovers hard-stopped retirement at every durable commit boundary  1766ms
   ✓ living memory > revalidates exact baselines citations digests and manifest-state guards under the lock  849ms
   ✓ living memory > rehydrates accepted judgment and persisted evidence then converges to noop  657ms
   ✓ living memory > syncs accepted folded note proposals before pruning unchanged episodes  515ms
   ✓ living memory > reports committed empty-prune finalization while recovering accepted episodes  305ms
stdout | tests/cli/session.test.ts > session flag handling > --resume with no sessions throws GracefulExitError
No sessions found.

stderr | tests/cli/session.test.ts > session flag handling > --session with cross-project match and declined fork throws GracefulExitError
Session found in different project: /other/project

stdout | tests/cli/session.test.ts > session flag handling > --resume cancel throws GracefulExitError
Available sessions:
  1. [sess-1] hello

stdout | tests/cli/session.test.ts > session flag handling > --resume cancel throws GracefulExitError
No session selected.

 ✓ tests/cli/session.test.ts (22 tests) 12ms
 ✓ tests/cli/memory/subcommand.test.ts (8 tests) 2720ms
   ✓ memory owner CLI > a successful non-dry pass ignores its own lock and exits zero  576ms
   ✓ memory owner CLI > runs the production corpus source before episodes in a deterministic dry run  555ms
   ✓ memory owner CLI > matches real-corpus injection pressure through the CLI composition root on a copy  1317ms
 ✓ tests/orchestration/run-start-chain-characterization.test.ts (6 tests) 9029ms
   ✓ runStart durable chain characterization > resolves a reviewer-established target at durable step start after prompt compilation  509ms
   ✓ runStart durable chain characterization > gates durable task decomposition on earlier reviewer-bound addressed activity  6968ms
   ✓ runStart durable chain characterization > records durable chain episodes with the persisted run id and unchanged reconstruction  719ms
   ✓ runStart durable chain characterization > keeps disabled inline and durable chain outputs events and files unchanged  508ms
[warning] Plan lock release backstop failed: EISDIR: illegal operation on a directory, read
 ✓ tests/episodic/pre-w3-disabled-baselines.test.ts (5 tests) 559ms
 ✓ tests/harness-adapters/render.test.ts (1 test) 1092ms
   ✓ harness asset rendering > materializes sticky copy direct-link flat and generated-wrapper shapes safely  1092ms
 ✓ tests/orchestration/chain-runner.test.ts (111 tests) 12591ms
   ✓ runChain > 'plan-and-build' named chain reaches a durable QM findings report  1028ms
   ✓ runChain > 'implement' named chain reaches a durable QM findings report  997ms
   ✓ runChain > 'verify' named chain reaches a durable QM findings report  1009ms
   ✓ runChain > 'spec-and-build' named chain reaches a durable QM findings report  1591ms
   ✓ runChain > 'adapt' named chain reaches a durable QM findings report  1231ms
   ✓ runChain > delegates a terminal QM to its own durable run before any QM session  378ms
   ✓ runChain > leaves plans byte-identical when QM plan context is ambiguous  304ms
   ✓ runChain > reports an unconfigured ready QM assessment through an inline chain  980ms
   ✓ runChain > reports an unconfigured not-ready QM assessment through an inline chain  1118ms
   ✓ runChain > persists integrity-failure through an inline QM chain  718ms
   ✓ runChain > persists cancellation through an inline QM chain  639ms
   ✓ runChain > records a typed review block as an unsuccessful inline chain result  364ms
 ✓ tests/orchestration/chain-profiler.test.ts (33 tests) 42ms
 ✓ tests/cli/packages/subcommand.test.ts (44 tests) 22ms
 ✓ tests/durable-runtime/scheduler-recovery.test.ts (9 tests) 387ms
 ✓ tests/cli/tasks/commands/create.test.ts (48 tests) 313ms
 ✓ tests/extensions/orchestration-driver-tool.test.ts (16 tests) 9575ms
   ✓ driver e2e run_driver integration > driver e2e happy path completes two tasks and tails JSONL events  568ms
   ✓ driver e2e run_driver integration > driver preflight failure aborts without task status updates  609ms
   ✓ driver e2e run_driver integration > does not rewrite successful completion when the driver handle settles  699ms
   ✓ driver e2e run_driver integration > driver branch mismatch emits structured preflight failure before transitions  656ms
   ✓ driver e2e run_driver integration > run_driver uses the framework default envelope when envelopePath is omitted  571ms
   ✓ driver e2e run_driver integration > freezes the execution-resolved worker for enabled default main project-bound and live-bound launches  1947ms
   ✓ driver e2e run_driver integration > keeps absent and false-config inline specs completions layout and result exact  902ms
   ✓ driver e2e run_driver integration > run_driver honors an explicit legacy bundled envelopePath  443ms
   ✓ driver e2e run_driver integration > run_driver uses the project root for repository commit locking  1235ms
   ✓ driver e2e run_driver integration > run_driver propagates state commit policy defaults and overrides  1076ms
   ✓ driver e2e run_driver integration > driver postverify failure blocks task and does not commit  350ms
 ✓ tests/domains/validator.test.ts (32 tests) 7ms
 ✓ tests/driver/run-one-task.test.ts (17 tests) 5213ms
   ✓ run-one-task > run-one-task branch mismatch aborts before any status transition  323ms
   ✓ run-one-task > driver commit exclusion uses repo lock excludes missions and memory and emits sha  887ms
   ✓ run-one-task > emits commit and task-status finalization phase events on successful driver commit  474ms
   ✓ run-one-task > uses task title as driver commit subject when report summary is generic  536ms
   ✓ run-one-task > records finalization_failed instead of blocked when driver commit fails after passing postflight  779ms
   ✓ run-one-task > does not write pending finalization for backend or postflight failures  365ms
   ✓ run-one-task > driver partial outcome commits and leaves task In Progress with progress notes  441ms
   ✓ run-one-task > run-one-task infers success for unknown reports when postverify passes and changes exist  319ms
 ✓ tests/orchestration/agent-spawner.test.ts (53 tests) 164ms
 ✓ tests/orchestration/session-factory.security.test.ts (11 tests) 116ms
 ✓ tests/orchestration/chain-steps.test.ts (51 tests) 6ms
 ✓ tests/extensions/plans.test.ts (27 tests) 848ms
 ✓ tests/agents/session-assembly.test.ts (33 tests) 750ms
 ✓ tests/scripts/knowledge-surface-backfill.test.ts (11 tests) 1619ms
   ✓ knowledge surface recoverable backfill > leaves enough on-disk evidence for manual recovery after a real hard kill  543ms
 ✓ tests/cli/sessions/subcommand.test.ts (39 tests) 285ms
stderr | tests/config/loader.test.ts > loadProjectConfig > enables the knowledge surface only for literal true
[warning] Skipping malformed knowledgeSurface.enabled: expected a boolean, got "true".

stderr | tests/config/loader.test.ts > loadProjectConfig > enables the knowledge surface only for literal true
[warning] Skipping malformed knowledgeSurface.enabled: expected a boolean, got 1.

stderr | tests/config/loader.test.ts > loadProjectConfig > enables the knowledge surface only for literal true
[warning] Skipping malformed knowledgeSurface.enabled: expected a boolean, got null.

 ✓ tests/config/loader.test.ts (32 tests) 459ms
 ✓ tests/harness-adapters/sync.characterization.test.ts (7 tests) 1348ms
 ✓ tests/harness-adapters/inventory.test.ts (3 tests) 877ms
   ✓ live harness inventory characterization > renders the stable-authority external bundle with exact live inventory bytes and fallbacks  858ms
 ✓ tests/entity-file-lock.test.ts (14 tests) 664ms
 ✓ tests/extensions/agent-switch.test.ts (22 tests) 11ms
 ✓ tests/driver/drive-on-graph-recovery.test.ts (3 tests) 1665ms
   ✓ Drive-on-graph recovery > persists episode capture failure as a non-fatal Drive diagnostic  941ms
   ✓ Drive-on-graph recovery > applies committed-work block and leave-running recovery paths to selected drive backends  656ms
 ✓ tests/memory/retirement-store-characterization.test.ts (28 tests) 2345ms
 ✓ tests/driver/driver-durable-steps.test.ts (4 tests) 2731ms
   ✓ driver durable step projection > writes Drive task step records with configured backend identity and resume-safe dependencies  1060ms
   ✓ driver durable step projection > records malformed reports inferred by postflight as completed success in step records and normalized events  629ms
   ✓ driver durable step projection > keeps legacy observation outputs unchanged when step records exist  475ms
   ✓ driver durable step projection > continues Drive run when durable step persistence fails  567ms
 ✓ tests/plans/file-system.test.ts (23 tests) 467ms
 ✓ tests/architecture-map/generator.test.ts (9 tests) 2273ms
   ✓ generateArchitectureMap > returns unchanged without touching generated files when sources are unchanged  326ms
   ✓ generateArchitectureMap > reuses narrative for body-only edits without provider calls  350ms
   ✓ generateArchitectureMap > regenerates only the affected public-interface module narrative  327ms
   ✓ generateArchitectureMap > writes pending narratives for disabled budget-exhausted and failed generation  454ms
   ✓ generateArchitectureMap > completes pending narratives later without touching unaffected module files  312ms
 ✓ tests/plans/archive.test.ts (21 tests) 723ms
 ✓ tests/memory/consolidation-sources.test.ts (10 tests) 235ms
 ✓ tests/domains/loader.test.ts (23 tests) 521ms
 ✓ tests/driver/drive-scheduler-backend.test.ts (5 tests) 560ms
   ✓ Drive scheduler backend > runs preflight backend postflight and report inference before returning StepResult  380ms
 ✓ tests/driver/drive-on-graph-acceptance.test.ts (7 tests) 11624ms
   ✓ Drive-on-graph acceptance > emits the terminal legacy event before completion and captures afterward  3422ms
   ✓ Drive-on-graph acceptance > invokes terminal-persisted hook after completion and before capture on every completion-backed outcome  2352ms
   ✓ Drive-on-graph acceptance > preserves the persisted terminal when onTerminalPersisted rejects  626ms
   ✓ Drive-on-graph acceptance > survives scheduler host death and resumes a large sequential drive graph  4074ms
   ✓ Drive-on-graph acceptance > continues an in-flight run from the envelope snapshot after the live file moves  414ms
   ✓ Drive-on-graph acceptance > resumes from the persisted envelope snapshot after the live file moves  691ms
 ✓ tests/durable-runtime/graph-scheduler.test.ts (4 tests) 562ms
 ✓ tests/driver/event-stream.test.ts (12 tests) 168ms
 ✓ tests/extensions/orchestration-driver-detached.test.ts (9 tests) 382ms
 ✓ tests/episodic/w3-contract.test.ts (3 tests) 193ms
 ✓ tests/cli/export/subcommand.test.ts (11 tests) 44ms
 ✓ tests/driver/durable-events.test.ts (4 tests) 4ms
 ✓ tests/memory/accepted-episode-finalization-characterization.test.ts (23 tests) 17ms
 ✓ tests/driver/run-state.test.ts (10 tests) 164ms
 ✓ tests/cli/drive/run-drive-characterization.test.ts (31 tests) 774ms
 ✓ tests/domains/prompt-assembly.test.ts (17 tests) 180ms
 ✓ tests/orchestration/agent-spawner.completion-loop.test.ts (11 tests) 197ms
 ✓ tests/cli/run/subcommand.test.ts (11 tests) 275ms
 ✓ tests/orchestration/spawn-tracker.test.ts (42 tests) 5ms
 ✓ tests/agents/resolver.test.ts (35 tests) 5ms
 ✓ tests/orchestration/chain-parser.test.ts (52 tests) 7ms
 ✓ tests/packages/installer.test.ts (25 tests) 1151ms
   ✓ install metadata — git > branch is null when not specified  329ms
 ✓ tests/memory/episode-transition-lock.test.ts (15 tests) 176ms
error: option '--copy' cannot be used with option '--link'
 ✓ tests/orchestration/chain-event-adapter-characterization.test.ts (41 tests) 6ms
 ✓ tests/extensions/task-tools.test.ts (18 tests) 879ms
 ✓ tests/tasks/file-system.test.ts (41 tests) 477ms
 ✓ tests/cli/harness/subcommand.test.ts (9 tests) 568ms
 ✓ tests/orchestration/quality-review-models.test.ts (42 tests) 7ms
 ✓ tests/extensions/project-tools-fallow-introspection-characterization.test.ts (25 tests) 516ms
 ✓ tests/orchestration/quality-review-launch.test.ts (21 tests) 9275ms
   ✓ quality review launch policy > requires an observed audit state even with an injected ready assessment  817ms
   ✓ quality review launch policy > runs configured checks only after the QM and reviewer evidence complete  888ms
   ✓ quality review launch policy > marks checks not run and not-ready when preparation fails after assessment  1047ms
   ✓ quality review launch policy > installs analysis dependencies before assessment without running lifecycle scripts  1204ms
   ✓ quality review launch policy > blocks ready when analysis preparation is the only blocker (indexed: true)  1095ms
   ✓ quality review launch policy > blocks ready when analysis preparation is the only blocker (indexed: false)  930ms
   ✓ quality review launch policy > aborts a slow base export on deadline  719ms
   ✓ quality review launch policy > aborts a slow base export on caller  558ms
   ✓ quality review launch policy > delegates a durable terminal QM into a child run with a complete report  1567ms
 ✓ tests/skills/exporter-sync-characterization.test.ts (25 tests) 7565ms
   ✓ runHarnessSync write mode > replaces a source-ahead target and keeps a locally edited one  304ms
   ✓ runHarnessSync write mode > writes both default targets as separate owner groups  336ms
   ✓ runHarnessSync write mode > reports lock contention on each row with the holder pid  2027ms
   ✓ runHarnessSync write mode > emits an owner-root lock-contended row for an empty group  2012ms
   ✓ runHarnessSync catalogue grouping > forgetting a removed asset spans every default target and scope  698ms
 ✓ tests/cli/tasks/commands/edit.test.ts (21 tests) 518ms
 ✓ tests/skills/discovery.test.ts (15 tests) 225ms
Switched to branch 'main'
Switched to branch 'feature'
 ✓ tests/memory/knowledge-store-retrieval-characterization.test.ts (15 tests) 88ms
 ✓ tests/cli/drive/status.test.ts (8 tests) 60ms
 ✓ tests/packages/eject.test.ts (16 tests) 150ms
 ✓ tests/sessions/session-store.test.ts (31 tests) 122ms
 ✓ tests/extensions/domain-bindings.test.ts (4 tests) 346ms
 ✓ tests/driver/lock-primitives.characterization.test.ts (15 tests) 261ms
 ✓ tests/agent-packages/binary-runners.characterization.test.ts (12 tests) 111ms
 ✓ tests/domains/resolver.test.ts (27 tests) 3ms
 ✓ tests/memory/run-pass-characterization.test.ts (10 tests) 32ms
 ✓ tests/extensions/project-tools-fallow-fixtures.test.ts (10 tests) 6763ms
   ✓ pinned Fallow capture fixtures > fails closed for incomplete or contradictory zero-change summary evidence  399ms
   ✓ pinned Fallow capture fixtures > captures through the local pin without changing the repository worktree  6015ms
 ✓ tests/driver/run-step.test.ts (7 tests) 8896ms
   ✓ run-step binary > runs from outside the source directory and writes completion, events, task status, and lock effects  1590ms
   ✓ run-step binary > does not parse stale Codex env for claude-cli specs  772ms
   ✓ run-step binary > uses frozen episode actor and attempt identity in the detached runner  2744ms
   ✓ run-step binary > releases the detached plan lock after completion and before episode capture  799ms
   ✓ run-step binary > contains terminal-hook and backstop release failures in the detached child  1064ms
   ✓ run-step binary > reaps its backend process group when the runner is signalled  1658ms
 ✓ tests/orchestration/chain-compiler.test.ts (6 tests) 5ms
 ✓ tests/driver/drive-run-start-characterization.test.ts (5 tests) 1029ms
   ✓ runStart Drive graph characterization > uses driveTaskIds instead of remainingTaskIds across resume and partial-init repair  788ms
 ✓ tests/agent-packages/build.test.ts (12 tests) 28ms
 ✓ tests/cli/update/subcommand.test.ts (14 tests) 8ms
 ✓ tests/driver/driver.test.ts (6 tests) 3068ms
   ✓ driver > terminates a detached child published during the pre-spawn abort window  3048ms
 ✓ tests/durable-runtime/file-store.test.ts (6 tests) 79ms
 ✓ tests/analysis/binding-resolver.test.ts (7 tests) 15ms
 ✓ tests/agent-packages/claude-binary-runner.test.ts (14 tests) 32ms
 ✓ tests/driver/durable-finalizers.test.ts (2 tests) 1889ms
   ✓ Drive durable finalizer projection > records finalization_failed as a retryable finalizer step without failing the task step  1846ms
 ✓ tests/driver/drive-on-graph-routing.test.ts (4 tests) 4522ms
   ✓ Drive-on-graph routing > runs inline Drive through runDriveOnGraph in the host process  383ms
   ✓ Drive-on-graph routing > runs detached Drive by executing runDriveOnGraph inside the frozen runner  3759ms
 ✓ tests/driver/driver-durable-dual-write.test.ts (4 tests) 409ms
 ✓ tests/domains/main-domain.test.ts (8 tests) 2190ms
   ✓ main domain built-in discovery > keeps gate-selected inline knowledge adapters outside package auto-discovery  1869ms
 ✓ tests/driver/drive-cancelled-dependency.test.ts (9 tests) 527ms
 ✓ tests/extensions/orchestration-lineage.test.ts (14 tests) 69ms
 ✓ tests/scripts/check-reachability.test.ts (35 tests) 6251ms
 ✓ tests/agent-packages/definition.test.ts (26 tests) 43ms
 ✓ tests/domains/coding-agents.test.ts (13 tests) 1190ms
   ✓ coding domain agent invariants > gives analysis consumers generic tools and shared skill under project filtering  506ms
   ✓ coding domain agent invariants > registers architecture_map_read at extension factory load for architecture-consuming agents  649ms
stderr | tests/extensions/orchestration-watch-events-normalized-compat.test.ts > watch_events normalized compatibility > preserves legacy watch_events cursor semantics over graph normalized events with fallback diagnostics
{"type":"drive_durable_event_diagnostic","code":"drive_durable_run_setup_failed","message":"Drive normalized run record setup failed; disabling normalized event writes for this sink.","details":{"legacyEventType":"task_done","runId":"run-setup-failure","error":"ENOTDIR: not a directory, open '/var/folders/kq/1jrmsh1141b4x5cfd79qyq200000gn/T/orchestration-watch-events-normalized-IxAtWC/missions/sessions/normalized-watch-events/runs/run-setup-failure/not-a-directory/normalized-watch-events/runs/run-setup-failure/run.json'"}}

 ✓ tests/tasks/task-serializer.test.ts (23 tests) 9ms
 ✓ tests/extensions/orchestration-watch-events-normalized-compat.test.ts (2 tests) 60ms
 ✓ tests/driver/prompt-template.test.ts (10 tests) 89ms
 ✓ tests/durable-runtime/scheduler-retry.test.ts (2 tests) 138ms
 ✓ tests/artifacts/plan-conformance.test.ts (12 tests) 4ms
 ✓ tests/memory/consolidation-proposals-materializations-characterization.test.ts (23 tests) 193ms
 ✓ tests/cli/plans/commands/edit.test.ts (22 tests) 86ms
 ✓ tests/orchestration/quality-review-report.test.ts (29 tests) 6ms
 ✓ tests/orchestration/agent-spawner.lineage.test.ts (16 tests) 7ms
 ✓ tests/extensions/orchestration-chain-tool-durable.test.ts (7 tests) 396ms
   ✓ chain_run durable tool routing > routes loop-free chain_run through the durable graph and loop chains inline  349ms
 ✓ tests/tasks/task-parser.test.ts (30 tests) 10ms
 ✓ tests/cli/scaffold/subcommand.test.ts (21 tests) 90ms
 ✓ tests/chains/named-chain-loader.test.ts (18 tests) 26ms
 ✓ tests/orchestration/chain-event-adapter.test.ts (2 tests) 3ms
 ✓ tests/cli/drive/graph-run.test.ts (1 test) 36ms
 ✓ tests/cli/drive/list.test.ts (4 tests) 50ms
 ✓ tests/driver/shell-command-finalizer.test.ts (2 tests) 2485ms
   ✓ Drive shell-command finalizer > records retryable finalizer failures from persisted attempt evidence as finalization_failed  2218ms
 ✓ tests/cli/skills/subcommand.test.ts (13 tests) 147ms
 ✓ tests/packages/store.test.ts (25 tests) 141ms
 ✓ tests/todo/todo-extension.test.ts (19 tests) 76ms
 ✓ tests/driver/backends/cosmonauts-subagent-resolution.test.ts (3 tests) 158ms
 ✓ tests/packages/manifest.test.ts (30 tests) 10ms
 ✓ tests/driver/event-stream-bridge.test.ts (9 tests) 3338ms
   ✓ bridgeJsonlToActivityBus > stops automatically after a terminal event  332ms
   ✓ bridgeJsonlToActivityBus > settles finish() even when the final read never returns  2054ms
 ✓ tests/cli/chain-event-logger.test.ts (27 tests) 4ms
 ✓ tests/tasks/id-generator.test.ts (39 tests) 4ms
 ✓ tests/agents/skills.test.ts (16 tests) 59ms
 ✓ tests/prompts/loader.test.ts (24 tests) 329ms
 ✓ tests/durable-runtime/scheduler-parallelism.test.ts (2 tests) 293ms
 ✓ tests/extensions/orchestration-watch-events-characterization.test.ts (35 tests) 120ms
 ✓ tests/durable-runtime/runtime-criticals-characterization.test.ts (49 tests) 6ms
 ✓ tests/pi-contract/pi-behavior-contract.test.ts (5 tests) 614ms
   ✓ pi contract: same-message tool batch dispatch > one sequential tool serializes the entire batch  303ms
 ✓ tests/cli/workflow-resolution.test.ts (9 tests) 20ms
 ✓ tests/harness-adapters/registry.test.ts (3 tests) 7ms
 ✓ tests/cli/plans/commands/list.test.ts (20 tests) 70ms
 ✓ tests/scripts/validate-harness-exports.test.ts (12 tests) 20503ms
   ✓ repository harness export validation > validates evidence-held recovery for four repo exports before the personal bundle  11338ms
   ✓ repository harness export validation > authorizes exactly the four ratified rows from named git bytes and rejects a changed target before locking  455ms
   ✓ repository harness export validation > persists installed evidence, resumes with its receipt, checks four rows, and cleans exact backups  932ms
   ✓ repository harness export validation > a prepared-phase failure rolls back before retry installs the whole set  1467ms
   ✓ repository harness export validation > release uncertainty halts with committed bytes retained and a clean retry completes  740ms
   ✓ repository harness export validation > resumes after pending clear and after exact backup cleanup  946ms
   ✓ repository harness export validation > resumes project cleanup after a crash immediately after the first backup deletion  638ms
   ✓ repository harness export validation > resumes personal bundle cleanup after a crash immediately after its backup deletion  1258ms
   ✓ repository harness export validation > rejects an absent project backup without a matching cleanup intent  562ms
   ✓ repository harness export validation > preserves a changed project backup and reports it as ambiguous  533ms
   ✓ repository harness export validation > never removes an evidence-nominated same-user path  503ms
   ✓ repository harness export validation > never removes a personal path nominated by external-bundle evidence  1129ms
 ✓ tests/cli/tasks/commands/search.test.ts (21 tests) 71ms
 ✓ tests/extensions/task-plan-linkage.test.ts (18 tests) 131ms
 ✓ tests/extensions/agent-memory-remember-params-characterization.test.ts (26 tests) 116ms
 ✓ tests/extensions/orchestration-watch-events.test.ts (6 tests) 38ms
 ✓ tests/extensions/orchestration-driver-tool-graph.test.ts (1 test) 115ms
 ✓ tests/durable-runtime/scheduler-cancellation.test.ts (1 test) 148ms
 ✓ tests/domains/registry.test.ts (20 tests) 3ms
 ✓ tests/driver/backends/codex.test.ts (8 tests) 13ms
 ✓ tests/extensions/project-tools-process.test.ts (4 tests) 1409ms
   ✓ project-tools provider process runner > spools large output losslessly and removes the private copies  336ms
   ✓ project-tools provider process runner > distinguishes signal abort timeout and spawn failure from clean exit  794ms
 ✓ tests/extensions/orchestration-rendering.test.ts (26 tests) 3ms
 ✓ tests/driver/drive-graph-finalization-result.test.ts (3 tests) 2088ms
   ✓ Drive graph finalization results > emits a completion candidate with a Done task and a Cancelled plan task  379ms
   ✓ Drive graph finalization results > reports completed task-status count and emits one run_finalization_failed for state-commit failure  1267ms
   ✓ Drive graph finalization results > continues after a driver-committed partial task without marking it Done or all tasks passed  441ms
 ✓ tests/sessions/manifest.test.ts (17 tests) 113ms
 ✓ tests/driver/contradicted-block-retry.test.ts (5 tests) 163ms
 ✓ tests/durable-runtime/run-start-resume.test.ts (4 tests) 183ms
 ✓ tests/artifact-viewer/loaders.test.ts (7 tests) 82ms
 ✓ tests/tasks/task-manager-concurrency.test.ts (4 tests) 1605ms
   ✓ TaskManager concurrency > allocates distinct IDs for concurrent creates across separate TaskManager instances  1096ms
 ✓ tests/extensions/orchestration-activity.test.ts (6 tests) 11ms
 ✓ tests/driver/backends/claude-cli.test.ts (7 tests) 15ms
 ✓ tests/durable-runtime/scheduler-contracts.test.ts (2 tests) 6ms
 ✓ tests/driver/cross-plan-commit-lock.test.ts (1 test) 8167ms
   ✓ cross-plan detached commit serialization > serializes driver-owned commits across detached runs in one repo  8166ms
 ✓ tests/skills/exporter-sync-failure-characterization.test.ts (8 tests) 526ms
 ✓ tests/agent-packages/skills.test.ts (8 tests) 83ms
 ✓ tests/cli/eject/subcommand.test.ts (14 tests) 6ms
 ✓ tests/pi-contract/pi-session-contract.test.ts (6 tests) 82ms
 ✓ tests/orchestration/quality-review-artifacts.test.ts (3 tests) 81ms
 ✓ tests/memory/episode-prune-journal-characterization.test.ts (36 tests) 249ms
 ✓ tests/cli/plans/commands/check-artifacts.test.ts (5 tests) 53ms
 ✓ tests/extensions/orchestration-chain-tool-observation.test.ts (3 tests) 9ms
 ✓ tests/orchestration/message-bus.test.ts (14 tests) 4ms
 ✓ tests/extensions/orchestration-run-control-surface.test.ts (1 test) 314ms
   ✓ orchestration run control surface > observes returned chain and Drive run ids through normalized status and watch  313ms
 ✓ tests/driver/lock.test.ts (6 tests) 62ms
 ✓ tests/agent-packages/codex-binary-runner.test.ts (5 tests) 19ms
 ✓ tests/driver/backends/cosmonauts-subagent.test.ts (5 tests) 12ms
 ✓ tests/architecture-map/freshness.test.ts (3 tests) 59ms
 ✓ tests/extensions/orchestration-spawn-inline-compiler.test.ts (2 tests) 150ms
 ✓ tests/cli/tasks/commands/view.test.ts (8 tests) 20ms
 ✓ tests/agent-packages/codex-cli.test.ts (10 tests) 59ms
 ✓ tests/driver/drive-graph-compiler.test.ts (2 tests) 67ms
 ✓ tests/driver/parity.test.ts (1 test) 5370ms
   ✓ driver inline vs detached parity > keeps behavioral output equivalent while detached commits differ by metadata  5369ms
 ✓ tests/durable-runtime/scheduler-heartbeats.test.ts (1 test) 120ms
 ✓ tests/extensions/orchestration-driver-session-scoping.test.ts (1 test) 15ms
 ✓ tests/cli/tasks/commands/list.test.ts (16 tests) 85ms
 ✓ tests/durable-runtime/scheduler-store.test.ts (1 test) 48ms
 ✓ tests/driver/durable-steps.test.ts (2 tests) 89ms
 ✓ tests/extensions/orchestration-run-control.test.ts (2 tests) 193ms
 ✓ tests/cli/architecture/subcommand.test.ts (8 tests) 17ms
 ✓ tests/driver/backends/orchestration-adapter.test.ts (1 test) 5ms
 ✓ tests/helpers/project-health-record.test.ts (7 tests) 4ms
 ✓ tests/agent-packages/claude-cli.test.ts (11 tests) 103ms
 ✓ tests/orchestration/quality-review-one-pass.test.ts (1 test) 863ms
   ✓ assesses one triaged panel before running one configured check  863ms
 ✓ tests/harness-adapters/provenance.characterization.test.ts (2 tests) 254ms
 ✓ tests/memory/transition-capture-release-unconfirmed.test.ts (3 tests) 301ms
 ✓ tests/cli/tasks/commands/create-batch-row-characterization.test.ts (27 tests) 6ms
 ✓ tests/artifact-viewer/server.test.ts (3 tests) 541ms
   ✓ artifact-viewer server > serves architecture map pages and missing map empty state  519ms
 ✓ tests/cli/plans/commands/create.test.ts (8 tests) 78ms
 ✓ tests/durable-runtime/run-start.test.ts (3 tests) 115ms
 ✓ tests/orchestration/activity-bus.test.ts (10 tests) 3ms
 ✓ tests/cli/tasks/commands/delete.test.ts (17 tests) 159ms
 ✓ tests/cli/plans/commands/delete.test.ts (17 tests) 94ms
 ✓ tests/durable-runtime/backend-contracts.test.ts (1 test) 4ms
 ✓ tests/durable-runtime/controller.test.ts (3 tests) 46ms
 ✓ tests/architecture-map/analyzer.test.ts (2 tests) 299ms
 ✓ tests/extensions/observability.test.ts (6 tests) 2ms
 ✓ tests/orchestration/chain-routing.test.ts (2 tests) 5ms
 ✓ tests/config/scaffold.test.ts (11 tests) 60ms
 ✓ tests/analysis/contracts.test.ts (4 tests) 4ms
 ✓ tests/cli/resolve-default-lead.test.ts (6 tests) 3ms
 ✓ tests/domains/shared-main-leakage.test.ts (2 tests) 3ms
 ✓ tests/extensions/orchestration-driver-bus-isolation.test.ts (3 tests) 7ms
 ✓ tests/cli/session-per-domain-leads.test.ts (1 test) 2ms
 ✓ tests/helpers/domain-package-fixture.test.ts (1 test) 39ms
 ✓ tests/agents/qualified-role.test.ts (23 tests) 3ms
 ✓ tests/driver/backends/process-reaping.test.ts (6 tests) 9295ms
   ✓ backend process reaping > leaves no live descendant when the backend settles (codex)  1802ms
   ✓ backend process reaping > leaves no live descendant when the backend settles (claude-cli)  1967ms
   ✓ backend process reaping > settles when a descendant holds the output pipes open (codex)  863ms
   ✓ backend process reaping > settles when a descendant holds the output pipes open (claude-cli)  927ms
   ✓ backend process reaping > escalates an ignored SIGTERM to SIGKILL on a bounded deadline  3721ms
 ✓ tests/harness-runtime-inventory.test.ts (1 test) 28ms
Preparing worktree (detached HEAD 70a5e7a)
 ✓ tests/scripts/update-fallow-baselines.test.ts (3 tests) 1257ms
   ✓ reasoned refresh saves a requested baseline and appends provenance  517ms
   ✓ refresh analyzes the base commit despite ahead and dirty findings  565ms
 ✓ tests/scripts/suppression-policy.test.ts (16 tests) 2060ms
   ✓ suppression policy > tracked source directives exactly match the exception registry  2048ms
 ✓ tests/cli/run/named-qm-entry.test.ts (2 tests) 1165ms
   ✓ runs the shipped verify named chain through the CLI to a terminal QM report  595ms
   ✓ runs the shipped implement named chain through the CLI to a terminal QM report  569ms
Switched to branch 'main'
 ✓ tests/cli/create/subcommand.test.ts (8 tests) 36ms
Switched to branch 'feature'
 ✓ tests/orchestration/quality-review-session-prompt.test.ts (1 test) 62ms
 ✓ tests/extensions/orchestration-authority.test.ts (3 tests) 13ms
 ✓ tests/durable-runtime/scheduler-capacity-characterization.test.ts (2 tests) 66ms
 ✓ tests/memory/consolidation-source-contract-characterization.test.ts (4 tests) 3ms
 ✓ tests/helpers/packages.test.ts (1 test) 58ms
 ✓ tests/orchestration/quality-review-profile.test.ts (8 tests) 3ms
 ✓ tests/orchestration/quality-review-workspace.test.ts (4 tests) 1572ms
   ✓ private review workspace capture > refuses sparse, gitlink, nested and linked-worktree layouts  518ms
   ✓ private review workspace capture > uses the fork merge-base when the base branch advances  553ms
 ✓ tests/agent-packages/export.test.ts (2 tests) 26ms
 ✓ tests/agents/runtime-identity.test.ts (11 tests) 2ms
 ✓ tests/orchestration/quality-review-checks.test.ts (4 tests) 433ms
 ✓ tests/cli/serve/subcommand.test.ts (3 tests) 60ms
 ✓ tests/cli/pi-flags.test.ts (7 tests) 2ms
 ✓ tests/coding-domain-rename.test.ts (3 tests) 93ms
 ✓ tests/architecture-map/config.test.ts (2 tests) 80ms
 ✓ tests/domains/coding-chains.test.ts (6 tests) 7ms
 ✓ tests/agent-packages/compatibility.test.ts (4 tests) 2ms
 ✓ tests/cli/shared/output.test.ts (8 tests) 3ms
 ✓ tests/skills/shipped-frontmatter.test.ts (3 tests) 69ms
 ✓ tests/driver/report-parser.test.ts (9 tests) 3ms
 ✓ tests/domains/default-domain.test.ts (4 tests) 5ms
 ✓ tests/orchestration/semaphore.test.ts (6 tests) 4ms
 ✓ tests/cli/plans/commands/archive.test.ts (4 tests) 154ms
 ✓ tests/helpers/fixtures.test.ts (4 tests) 60ms
 ✓ tests/orchestration/spawn-limits.test.ts (12 tests) 2ms
 ✓ tests/cli/quality-review-cli.test.ts (2 tests) 1485ms
   ✓ standalone Quality Manager CLI > leaves 1 existing plan directories byte-identical without explicit context  634ms
   ✓ standalone Quality Manager CLI > leaves 2 existing plan directories byte-identical without explicit context  851ms
 ✓ tests/extensions/analysis-consent-snapshot.test.ts (1 test) 29ms
 ✓ tests/orchestration/quality-review-pi-settings.test.ts (1 test) 1226ms
   ✓ launches a quality session without clone Pi settings or appended prompt  1225ms
 ✓ tests/orchestration/assistant-text.test.ts (6 tests) 2ms
 ✓ tests/orchestration/quality-review-repository-pins.test.ts (2 tests) 235ms
 ✓ tests/orchestration/quality-review-command.test.ts (4 tests) 3272ms
   ✓ quality review host commands > reaps same-group children after a successful leader exit and keeps output  2223ms
   ✓ quality review host commands > finishes on leader exit while a detached grandchild holds stdout  1007ms
 ✓ tests/scripts/check-reachability-visit.test.ts (27 tests) 5715ms
   ✓ reachability verdict for the shipped repository > reaches every runtime lib module under the committed staged-code registry  1345ms
 ✓ tests/orchestration/chain-runner-cosmo-migration.test.ts (1 test) 7ms
 ✓ tests/driver/driver-detached.test.ts (12 tests) 33389ms
   ✓ startDetached > copies a prebuilt runner binary into the run workdir when available  870ms
   ✓ startDetached > driver detached codex e2e prepares the workdir, launches the compiled runner, bridges events, and leaves locking to the child  2612ms
   ✓ startDetached > bridges a post-terminal episode capture failure to the detached parent bus  2296ms
   ✓ startDetached > bounds post-terminal bridge drain when the child does not exit  4021ms
   ✓ startDetached > stops a draining bridge when the detached result rejects  4104ms
   ✓ startDetached > reconciles one terminal episode when the parent aborts after detached start  3489ms
   ✓ startDetached > keeps abort capture and reporter failures non-fatal with one established warning  3547ms
   ✓ startDetached > escalates an ignored SIGTERM to SIGKILL so abort settles on a bounded deadline  5736ms
   ✓ startDetached > keeps one completion-backed aborted terminal when abort escalates to SIGKILL  6426ms
 ✓ tests/packages/catalog.test.ts (8 tests) 3ms
 ✓ tests/driver/backends/registry.test.ts (4 tests) 2ms
 ✓ tests/cli/plans/subcommand.test.ts (4 tests) 4ms
 ✓ tests/cli/architecture/main-dispatch.test.ts (2 tests) 1803ms
   ✓ cli/main architecture dispatch > routes cosmonauts architecture generate to createArchitectureProgram  1528ms
 ✓ tests/coding-agnostic-framework.test.ts (1 test) 206ms
 ✓ tests/domains/public-surface.test.ts (1 test) 2ms
 ✓ tests/cli/dump-prompt.test.ts (3 tests) 1944ms
   ✓ --dump-prompt > default routing main installed defaults to main/cosmo when no agent is provided  744ms
   ✓ --dump-prompt > default routing coding domain uses coding/cody when no agent is provided  623ms
   ✓ --dump-prompt > uses the explicit cody agent when provided  576ms
 ✓ tests/cli/plans/commands/view.test.ts (3 tests) 50ms
 ✓ tests/cli/shared/errors.test.ts (4 tests) 4ms
 ✓ tests/domains/bindings.test.ts (1 test) 2ms
 ✓ tests/orchestration/surface-non-goals.test.ts (1 test) 8ms
 ✓ tests/cli/export/main-dispatch.test.ts (2 tests) 1610ms
   ✓ cli/main export dispatch > routes cosmonauts export to createExportProgram  1421ms
 ✓ tests/driver/driver-script.test.ts (2 tests) 54ms
 ✓ tests/cli/serve/main-dispatch.test.ts (2 tests) 1671ms
   ✓ cli/main serve dispatch > routes cosmonauts serve to createServeProgram with host port open options  1458ms
 ✓ tests/memory/proposal-disappeared-characterization.test.ts (1 test) 10ms
 ✓ tests/config/biome.test.ts (1 test) 36ms
 ✓ tests/driver/default-envelope.test.ts (2 tests) 2ms
 ✓ tests/extensions/init.test.ts (3 tests) 2ms
 ✓ tests/interactive/agent-switch.test.ts (5 tests) 2ms
 ✓ tests/prompts/provider-neutrality.test.ts (9 tests) 16ms
 ✓ tests/domains/agent-models.test.ts (1 test) 50ms
 ✓ tests/artifact-viewer/render.test.ts (3 tests) 2ms
 ✓ tests/init/prompt.test.ts (4 tests) 2ms
 ✓ tests/skills/agent-packaging.test.ts (1 test) 3ms
 ✓ tests/cli/tasks/subcommand.test.ts (3 tests) 4ms
 ✓ tests/helpers/extension-api-mock.test.ts (1 test) 1ms
 ✓ tests/cli/no-domain-guard.test.ts (3 tests) 2ms
 ✓ tests/cli/memory/main-dispatch.test.ts (1 test) 978ms
   ✓ cli/main memory dispatch > routes top-level memory commands without interactive fallthrough  978ms
 ✓ tests/scripts/check-new-suppressions.test.ts (19 tests) 9621ms
   ✓ script requires base registration for a triple-slash TypeScript directive  585ms
   ✓ script requires base registration for a JSDoc TypeScript directive  665ms
   ✓ script requires base registration for a block TypeScript directive  624ms
   ✓ script requires base registration for a JSX Biome directive  578ms
   ✓ script requires base registration for a block ESLint directive  517ms
   ✓ script rejects a same-change exception because the base registry owns authorization  313ms
   ✓ script accepts an added directive only when registered in the base revision  365ms
   ✓ script rejects a changed target despite a base registered directive  386ms
   ✓ script requires base registration for a line @ts-nocheck directive  682ms
   ✓ script requires base registration for a triple-slash @ts-nocheck directive  674ms
   ✓ script requires base registration for a block @ts-nocheck directive  669ms
   ✓ script requires base registration for a file-level Biome directive  637ms
   ✓ script requires base registration for a multi-line block ending in @ts-ignore directive  545ms
   ✓ script requires base registration for a JSDoc block ending in @ts-expect-error directive  477ms
   ✓ script requires base registration for a JSONC Biome directive  487ms
   ✓ script requires base registration for a JSON Biome directive  578ms
   ✓ script rejects a directive added to a renamed file  313ms
 ✓ tests/cli/tasks/cancelled-status.test.ts (1 test) 4200ms
   ✓ a Cancelled task through the CLI > persists, keeps its dependent blocked, and lets its plan archive  4199ms
 ✓ tests/orchestration/quality-review-run.test.ts (158 tests) 75789ms
   ✓ quality review durable lifecycle > uses the configured workspace removal timeout on a stalled remover  1150ms
   ✓ quality review durable lifecycle > runs host checks in the snapshot, persists output and blocks a failed check  1005ms
   ✓ quality review durable lifecycle > runs base-owned check argv even when the reviewed config rewrites it  1391ms
   ✓ quality review durable lifecycle > excludes its own plan summary from the captured change  1349ms
   ✓ quality review durable lifecycle > blocks a ready claim when the host observed an unbound audit  1274ms
   ✓ quality review durable lifecycle > never reports ready with a host human item from checks not configured  1244ms
   ✓ quality review durable lifecycle > never reports ready with a host human item from gate-owned change  1298ms
   ✓ quality review durable lifecycle > never reports ready with a host human item from unbound audit  1039ms
   ✓ quality review durable lifecycle > never reports ready with a host human item from unobserved audit  869ms
   ✓ quality review durable lifecycle > never reports ready with a host human item from failed-to-run audit  865ms
   ✓ quality review durable lifecycle > never reports ready with a host human item from missing gate evidence  979ms
   ✓ quality review durable lifecycle > never reports ready with a host human item from check preparation failure  1138ms
   ✓ quality review durable lifecycle > never reports ready with a host human item from analysis preparation failure  1268ms
   ✓ quality review durable lifecycle > reports a bound failing audit under gates and findings without a human item  977ms
   ✓ quality review durable lifecycle > reports each finding from a bound failing audit envelope  708ms
   ✓ quality review durable lifecycle > uses one prefix for real unbound validator state  717ms
   ✓ quality review durable lifecycle > uses one prefix for real unconsented validator state  613ms
   ✓ quality review durable lifecycle > uses one prefix for real missing validator state  738ms
   ✓ quality review durable lifecycle > does not call an unrelated config edit gate-owned  985ms
   ✓ quality review durable lifecycle > ignores a gate-owned change made only on the advanced base branch  950ms
   ✓ quality review durable lifecycle > keeps a completed not-ready verdict when workspace removal fails  388ms
   ✓ quality review durable lifecycle > persists the terminal report and status before a stalled remover  682ms
   ✓ quality review durable lifecycle > finalizes with a named integrity failure when a reviewer store write never settles  455ms
   ✓ quality review durable lifecycle > waits several seconds by default for an aborting QM tool to settle  822ms
   ✓ quality review durable lifecycle > uses the configured QM settle grace  545ms
   ✓ quality review durable lifecycle > reports empty checks and gate-owned changes as human decisions  457ms
   ✓ quality review durable lifecycle > includes passing host check details even when the model omits them  549ms
   ✓ quality review durable lifecycle > reports reviewer models from run-owned evidence  383ms
   ✓ quality review durable lifecycle > calibrates Findings shape numbered  641ms
   ✓ quality review durable lifecycle > calibrates Findings shape star  578ms
   ✓ quality review durable lifecycle > calibrates Findings shape plus  554ms
   ✓ quality review durable lifecycle > calibrates Findings shape prose  613ms
   ✓ quality review durable lifecycle > calibrates Findings shape before bullet  665ms
   ✓ quality review durable lifecycle > calibrates Findings shape after dismissal  673ms
   ✓ quality review durable lifecycle > calibrates Findings shape after blank line  757ms
   ✓ quality review durable lifecycle > calibrates Findings shape ID-less bullet  630ms
   ✓ quality review durable lifecycle > calibrates Findings shape dismissal  560ms
   ✓ quality review durable lifecycle > calibrates Findings shape sub-finding  651ms
   ✓ quality review durable lifecycle > calibrates Findings shape still open  752ms
   ✓ quality review durable lifecycle > calibrates Findings shape not resolved  943ms
   ✓ quality review durable lifecycle > calibrates Findings shape closed prematurely  887ms
   ✓ quality review durable lifecycle > calibrates Findings shape blank line  743ms
   ✓ quality review durable lifecycle > calibrates Findings shape subheading  481ms
   ✓ quality review durable lifecycle > calibrates Findings shape extra heading  422ms
   ✓ quality review durable lifecycle > calibrates Findings shape repeated Findings  417ms
   ✓ quality review durable lifecycle > calibrates Findings shape repeated Human decisions  424ms
   ✓ quality review durable lifecycle > calibrates Findings shape Checks line ending in Findings  414ms
   ✓ quality review durable lifecycle > calibrates Findings shape Gates Findings subheading  412ms
   ✓ quality review durable lifecycle > calibrates Findings shape Checks Human decisions subheading  390ms
   ✓ quality review durable lifecycle > calibrates Findings shape empty  400ms
   ✓ quality review durable lifecycle > calibrates Findings shape plain sentinel  335ms
   ✓ quality review durable lifecycle > calibrates Findings shape case-insensitive bullet sentinel  313ms
   ✓ quality review durable lifecycle > calibrates out-of-range finding  315ms
   ✓ quality review durable lifecycle > calibrates out-of-range dismissal  314ms
   ✓ quality review durable lifecycle > calibrates in-range dismissal  312ms
   ✓ quality review durable lifecycle > calibrates dismissal with a trailing paragraph  311ms
   ✓ quality review durable lifecycle > reaches ready with an unset reviewer model and records the model only  303ms
   ✓ quality review durable lifecycle > reaches ready with a reviewer model on the QM's provider and records the model only  312ms
   ✓ quality review durable lifecycle > reaches ready with a reviewer model on any other provider and records the model only  306ms
   ✓ quality review durable lifecycle > reaches ready with a configured reviewer model the session did not use and records the model only  305ms
   ✓ quality review durable lifecycle > calibrates observation-only P2 performance findings in the final report  305ms
   ✓ quality review durable lifecycle > caps unsupported performance P1 and blocks lens-only closure in the completed report  303ms
   ✓ quality review durable lifecycle > fails the configured suppression check for an unregistered directive  450ms
   ✓ quality review durable lifecycle > keeps a clean report ready with trailing whitespace on a defined heading  305ms
   ✓ quality review durable lifecycle > keeps a duplicate defined heading at EOF and blocks ready with host checks  305ms
   ✓ quality review durable lifecycle > preserves CRLF duplicate and blocks ready with host checks  313ms
   ✓ quality review durable lifecycle > preserves empty title in report and blocks ready with host checks  303ms
   ✓ quality review durable lifecycle > preserves empty title after index and blocks ready with host checks  306ms
   ✓ quality review durable lifecycle > preserves tab title and blocks ready with host checks  304ms
   ✓ quality review durable lifecycle > preserves text after index and blocks ready with host checks  314ms
   ✓ quality review durable lifecycle > preserves same-line index suffix and blocks ready with host checks  307ms
   ✓ quality review durable lifecycle > preserves index trailing whitespace and blocks ready with host checks  308ms
   ✓ quality review durable lifecycle > preserves unclosed index marker and blocks ready with host checks  303ms
   ✓ quality review durable lifecycle > preserves indented index suffix and blocks ready with host checks  301ms
   ✓ quality review durable lifecycle > keeps an empty Reason's same-line suffix and host checks  306ms
   ✓ quality review durable lifecycle > keeps an empty Reason's trailing whitespace and host checks  304ms
   ✓ quality review durable lifecycle > keeps an empty Reason's unclosed marker and host checks  306ms
   ✓ quality review durable lifecycle > keeps a clean LF report ready  324ms
   ✓ quality review durable lifecycle > keeps a clean CRLF report ready  314ms
   ✓ quality review durable lifecycle > keeps a clean CR report ready  306ms
   ✓ quality review durable lifecycle > carries an omitted reviewer finding through a non-breaking-space Findings heading  310ms
   ✓ quality review durable lifecycle > does not accept a ready verdict with reported findings  304ms
   ✓ quality review durable lifecycle > persists a preparation timeout and removes its private workspace  344ms
   ✓ quality review durable lifecycle > cancels promptly during prepare  308ms
   ✓ quality review durable lifecycle > cancels promptly during checks  308ms
   ✓ quality review durable lifecycle > cancels promptly during assessment  3284ms
   ✓ quality review durable lifecycle > ends a stalled assessment at its configured deadline and retains live child workspace  3389ms
   ✓ quality review durable lifecycle > retains the workspace when the QM itself ignores abort without a panel child  3308ms
   ✓ quality review durable lifecycle > records a grandchild check timeout in checks.md  458ms
   ✓ quality review durable lifecycle > makes a new pretest script a human decision item  374ms
   ✓ quality review durable lifecycle > uses the base gateOwnedPaths when the reviewed change edits a runner  321ms
   ✓ quality review durable lifecycle > lists an executable package script change once even when package.json is gate-owned  323ms
   ✓ quality review durable lifecycle > does not let a later check rewrite change sealed review evidence  309ms
   ✓ quality review durable lifecycle > loads base project domains without importing reviewed domains  816ms
   ✓ quality review durable lifecycle > writes no legacy review-round file on a completed or failed QM run  517ms

 Test Files  287 passed (287)
      Tests  3920 passed (3920)
   Start at  05:45:27
   Duration  78.34s (transform 6.34s, setup 1.40s, collect 48.91s, tests 426.03s, environment 22ms, prepare 9.53s)


```

## lint

- argv: ["bun","run","lint"]
- exit code: 0
- duration: 1970 ms
- timed out: false

```text
$ biome check .
Checked 643 files in 288ms. No fixes applied.

```

## typecheck

- argv: ["bun","run","typecheck"]
- exit code: 0
- duration: 6139 ms
- timed out: false

```text
$ tsc --noEmit

```

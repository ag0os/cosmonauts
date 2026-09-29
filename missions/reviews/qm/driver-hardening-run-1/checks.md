Analysis preparation analysis-dependencies: passed in 369 ms (lifecycle scripts disabled).
# Preparation

- dependencies: passed in 121 ms

# Configured checks

## suppressions

- argv: ["bun","scripts/check-new-suppressions.ts","--base","e55040de840b888ed16f204e987f20bc7d465c84"]
- exit code: 0
- duration: 10350 ms
- timed out: false

```text
suppression check passed

```

## test

- argv: ["bun","run","test"]
- exit code: 0
- duration: 120402 ms
- timed out: false

```text
$ node ./scripts/vitest-runner.mjs

 RUN  v3.2.4 /private/var/folders/kq/1jrmsh1141b4x5cfd79qyq200000gn/T/cosmonauts-qm-qm-0abafc64-dedd-44f1-adef-626832984fa7/checkout

 ✓ tests/memory/living-memory-commit-interleavings.test.ts (31 tests) 1744ms
 ✓ tests/memory/interface.test.ts (21 tests) 1730ms
   ✓ memory interface > exposes exact living-memory outcomes through configured knowledge consolidate only  390ms
 ✓ tests/memory/markdown-store.test.ts (23 tests) 2523ms
   ✓ markdown memory store > creates a freed canonical playbook name across a dense suffix range  691ms
   ✓ markdown memory store > binds default and overridden episode thresholds into fresh-store stats and warnings  482ms
 ✓ tests/extensions/project-tools.test.ts (26 tests) 3510ms
   ✓ project-tools extension > withholds all provider execution until consent is recorded  416ms
   ✓ project-tools extension > aborting a capability tool terminates the provider child  951ms
   ✓ project-tools extension > aborting first-use during version discovery terminates introspection and reports failure  362ms
   ✓ project-tools extension > aborting first-use during config discovery terminates introspection and reports failure  350ms
   ✓ project-tools extension > session_start aborts obsolete discovery and a later call discovers afresh  354ms
   ✓ project-tools extension > session_shutdown aborts obsolete discovery and a later call discovers afresh  339ms
 ✓ tests/extensions/agent-memory.test.ts (39 tests) 3993ms
   ✓ agent-memory extension > indexes playbooks and recalls their full steps in a later session  661ms
   ✓ agent-memory extension > injects recalls and protects oversized human profiles honestly  577ms
   ✓ agent-memory extension > recall searches notes over project and user scopes with default and capped limits  426ms
   ✓ agent-memory extension > recalls enabled episodes through the existing bounded recall tool  394ms
   ✓ agent-memory extension > memory index injection uses list mode capped to the 50 most recent records before truncation  592ms
 ✓ tests/harness-adapters/sync.test.ts (8 tests) 6745ms
   ✓ harness sync planning > bootstraps and migrates both commands as one nonhistorical recoverable transaction  1421ms
   ✓ harness sync planning > recovers every phase vector through one sibling lock while retaining evidence holds  3144ms
   ✓ harness sync planning > fresh recovery converges removal transactions with absent new targets across phases  433ms
   ✓ harness sync planning > fresh recovery restores manifest-only forget transfer and absent-target removal intent  1172ms
 ✓ tests/tasks/task-manager.test.ts (67 tests) 4527ms
   ✓ TaskManager > adds gated fail-soft episodes only for task creation and real status transitions  521ms
   ✓ TaskManager > warns and runs task updates unlocked on lock errors and bounded waits  1083ms
 ✓ tests/cli/drive/run.test.ts (33 tests) 5381ms
   ✓ cosmonauts run drive compat run > resume finalizes pending commit failure before invoking backend work  411ms
   ✓ cosmonauts run drive compat run > resume refuses state commit external acceptance when pending tasks are missing or not done  546ms
   ✓ cosmonauts run drive compat run > resume records source task-status and state-commit finalizer retry failures as attempts  1248ms
 ✓ tests/extensions/architecture-memory.test.ts (13 tests) 407ms
 ✓ tests/extensions/project-tools-fallow.test.ts (70 tests) 9259ms
   ✓ Fallow provider discovery > uses the exact pinned project local provider engine  598ms
   ✓ Fallow provider discovery > installed native provider preserves crash evidence and cleans descendants on abort and timeout  1492ms
   ✓ Fallow capability execution > analysis_audit passes inherited findings and fails introduced findings in each category  1461ms
   ✓ Fallow capability execution > audits tracked staged and untracked dirty base changes from HEAD  814ms
   ✓ Fallow capability execution > leaves the entire worktree unchanged across status and every capability  1031ms
fatal: Needed a single revision
 ✓ tests/harness-adapters/provenance.test.ts (2 tests) 1666ms
   ✓ harness provenance > classifies the complete owner source target mode and concurrent-read grid without writing  602ms
   ✓ harness provenance > preserves edited foreign and untraceable targets and permits only safe lineage or owner transfer  1061ms
 ✓ tests/skills/exporter.test.ts (18 tests) 3752ms
   ✓ exportSkill > removes stale files from previous export  348ms
   ✓ exportSkill > overwrites existing export  343ms
   ✓ runHarnessSync selection > refuses malformed manifest path authority without changing any owner bytes  961ms
   ✓ runHarnessSync selection > accepts and upgrades a legacy manifest entry whose output identity differs from its source directory  360ms
   ✓ runHarnessSync selection > forgets only after a still-declared source root is completely observed  482ms
 ✓ tests/extensions/orchestration.test.ts (39 tests) 10760ms
   ✓ orchestration extension > spawn_agent routes the resolved canonical QM through a durable refusal without a session  412ms
   ✓ orchestration extension > a scripted QM and panel refuse mutation tools and a forbidden spawn without changing the checkout  1157ms
   ✓ orchestration extension > a reviewer ending in a text-less provider error after retries is a failed review, not evidence  1062ms
   ✓ orchestration extension > a reviewer ending in a provider error after partial text is a failed review, not evidence  901ms
   ✓ orchestration extension > a reviewer ending in an aborted final message is a failed review, not evidence  1194ms
   ✓ orchestration extension > a reviewer ending in a final message with no text of its own is a failed review, not evidence  1150ms
   ✓ orchestration extension > a reviewer ending in a final message stopped at the token limit is a failed review, not evidence  1192ms
   ✓ orchestration extension > a reviewer ending in no assistant message at all is a failed review, not evidence  1368ms
   ✓ orchestration extension > a reviewer whose final message has its own text is recorded as evidence  1738ms
 ✓ tests/cli/drive/graph-resume.test.ts (13 tests) 8743ms
   ✓ cosmonauts run drive compat graph resume > resumes graph runs without rewriting original selected task ids  816ms
   ✓ cosmonauts run drive compat graph resume > drops an unavailable frozen worker before execution and never attributes the fallback to it  682ms
   ✓ cosmonauts run drive compat graph resume > treats empty-legacy-queue graph continuation as worker execution  1041ms
   ✓ cosmonauts run drive compat graph resume > resumes pending task-status finalization with one terminal result  578ms
   ✓ cosmonauts run drive compat graph resume > resumes already completed graph runs with one terminal result  702ms
   ✓ cosmonauts run drive compat graph resume > rehydrates the attempt ledger and skips a second terminal after thrown-exit resume  506ms
   ✓ cosmonauts run drive compat graph resume > records one run-id-derived terminal for an off-then-enabled completed resume  369ms
   ✓ cosmonauts run drive compat graph resume > records one run-id-derived terminal for a completed graph-backed resume  756ms
   ✓ cosmonauts run drive compat graph resume > repeats deterministic terminal-only resume without changing bytes or episode count  522ms
   ✓ cosmonauts run drive compat graph resume > warns and skips terminal capture when off-era resume source cannot resolve  555ms
   ✓ cosmonauts run drive compat graph resume > leaves graph resume inputs byte-identical when dirty or unsupported resume is refused  885ms
   ✓ cosmonauts run drive compat graph resume > keeps persisted terminal identity artifact-free while episodic capture is off  611ms
   ✓ cosmonauts run drive compat graph resume > keeps a failing pending finalization artifact-free while episodic capture is off  719ms
stderr | tests/runtime.test.ts > CosmonautsRuntime > chain selection > includes chains from matching domain context
[warning] [coding chain:build] Named chain stage "worker" does not resolve to any known agent

stderr | tests/runtime.test.ts > CosmonautsRuntime > chain selection > includes all domain chains when no domain context
[warning] [coding chain:build] Named chain stage "worker" does not resolve to any known agent

stderr | tests/runtime.test.ts > CosmonautsRuntime > chain selection > filters out non-matching domain chains
[warning] [coding chain:build] Named chain stage "worker" does not resolve to any known agent
[warning] [other chain:other-flow] Named chain stage "x" does not resolve to any known agent

 ✓ tests/memory/living-memory.test.ts (83 tests) 11826ms
   ✓ living memory > preserves live bytes when a retirement source changes after manifest commit  557ms
   ✓ living memory > recovery proves manifest durability and linked live identity before unlink  496ms
   ✓ living memory > annotates a human restoration and reserves hard deletion for the ledger  1388ms
   ✓ living memory > recovers hard-stopped retirement at every durable commit boundary  1626ms
   ✓ living memory > revalidates exact baselines citations digests and manifest-state guards under the lock  660ms
   ✓ living memory > rehydrates accepted judgment and persisted evidence then converges to noop  724ms
   ✓ living memory > syncs accepted folded note proposals before pruning unchanged episodes  581ms
 ✓ tests/runtime.test.ts (27 tests) 881ms
 ✓ tests/plans/plan-manager.test.ts (44 tests) 790ms
 ✓ tests/packages/scanner.test.ts (34 tests) 82ms
 ✓ tests/orchestration/chain-runner.test.ts (111 tests) 12740ms
   ✓ runChain > 'plan-and-build' named chain reaches a durable QM findings report  1153ms
   ✓ runChain > 'implement' named chain reaches a durable QM findings report  897ms
   ✓ runChain > 'verify' named chain reaches a durable QM findings report  979ms
   ✓ runChain > 'spec-and-build' named chain reaches a durable QM findings report  1099ms
   ✓ runChain > 'adapt' named chain reaches a durable QM findings report  1028ms
   ✓ runChain > refuses a forged stage reference that would redirect a non-QM stage to QM  335ms
   ✓ runChain > reports an unconfigured ready QM assessment through an inline chain  1223ms
   ✓ runChain > reports an unconfigured not-ready QM assessment through an inline chain  1590ms
   ✓ runChain > persists integrity-failure through an inline QM chain  889ms
   ✓ runChain > persists cancellation through an inline QM chain  615ms
error: unknown option '--workflow'
error: unknown option '-w'
error: unknown option '--list-workflows'
Refusing to start an interactive session: no terminal is attached to stdin. This usually means a subcommand was mistyped or a global flag was placed before it — the root command takes free prompt text, so anything the subcommand table does not match becomes a prompt (for example `cosmonauts --json plan ...` instead of `cosmonauts plan ... --json`). Run `cosmonauts --help` for the subcommand list, or use `--print` for non-interactive output.
 ✓ tests/orchestration/agent-spawner.spawn.test.ts (26 tests) 220ms
 ✓ tests/cli/main.test.ts (82 tests) 69ms
stdout | tests/cli/session.test.ts > session flag handling > --resume with no sessions throws GracefulExitError
No sessions found.

stderr | tests/cli/session.test.ts > session flag handling > --session with cross-project match and declined fork throws GracefulExitError
Session found in different project: /other/project

stdout | tests/cli/session.test.ts > session flag handling > --resume cancel throws GracefulExitError
Available sessions:
  1. [sess-1] hello

stdout | tests/cli/session.test.ts > session flag handling > --resume cancel throws GracefulExitError
No session selected.

 ✓ tests/cli/session.test.ts (22 tests) 11ms
 ✓ tests/harness-adapters/render.test.ts (1 test) 1055ms
   ✓ harness asset rendering > materializes sticky copy direct-link flat and generated-wrapper shapes safely  1055ms
 ✓ tests/orchestration/run-start-chain-characterization.test.ts (6 tests) 7835ms
   ✓ runStart durable chain characterization > preserves durable chain run files and ChainResult through runStart  417ms
   ✓ runStart durable chain characterization > resolves a reviewer-established target at durable step start after prompt compilation  612ms
   ✓ runStart durable chain characterization > gates durable task decomposition on earlier reviewer-bound addressed activity  5654ms
   ✓ runStart durable chain characterization > records durable chain episodes with the persisted run id and unchanged reconstruction  648ms
   ✓ runStart durable chain characterization > keeps disabled inline and durable chain outputs events and files unchanged  497ms
 ✓ tests/episodic/pre-w3-disabled-baselines.test.ts (5 tests) 523ms
 ✓ tests/cli/memory/subcommand.test.ts (8 tests) 3083ms
   ✓ memory owner CLI > a successful non-dry pass ignores its own lock and exits zero  585ms
   ✓ memory owner CLI > runs the production corpus source before episodes in a deterministic dry run  611ms
   ✓ memory owner CLI > matches real-corpus injection pressure through the CLI composition root on a copy  1500ms
   ✓ memory owner CLI > actions or rejects improve proposals through a reachable closed lifecycle  369ms
 ✓ tests/cli/tasks/commands/create.test.ts (48 tests) 769ms
 ✓ tests/durable-runtime/scheduler-recovery.test.ts (9 tests) 868ms
 ✓ tests/orchestration/chain-profiler.test.ts (33 tests) 46ms
 ✓ tests/driver/drive-scheduler-backend.test.ts (33 tests) 11598ms
   ✓ Drive scheduler backend > blocks a source commit when a probe owns the project lock  622ms
   ✓ Drive scheduler backend > uses safe prose or task title for graph commit subject: Implemented the requested change  396ms
   ✓ Drive scheduler backend > uses safe prose or task title for graph commit subject: ```json
{"outcome":"success"}
```  360ms
   ✓ Drive scheduler backend > uses safe prose or task title for graph commit subject: {"outcome":"success","files":[]}  426ms
   ✓ Drive scheduler backend > uses safe prose or task title for graph commit subject: {"outcome":"success"}
Changed behavior  328ms
   ✓ Drive scheduler backend > uses safe prose or task title for graph commit subject: outcome: success  346ms
   ✓ Drive scheduler backend > uses safe prose or task title for graph commit subject: summary: outcome: success  300ms
   ✓ Drive scheduler backend > uses safe prose or task title for graph commit subject: summary: {"outcome":"success"}  412ms
   ✓ Drive scheduler backend > uses safe prose or task title for graph commit subject: Outcome inferred from passing postflight.  516ms
   ✓ Drive scheduler backend > snapshots dirty tracked and untracked bytes for external backend and blocked cleanup  740ms
   ✓ Drive scheduler backend > snapshots dirty tracked and untracked bytes for external backend and success cleanup  842ms
   ✓ Drive scheduler backend > removes a Done snapshot when the final worktree contains its bytes  758ms
   ✓ Drive scheduler backend > writes one blocked attempt record with a snapshot line only for dirty trees  968ms
   ✓ Drive scheduler backend > writes one failure attempt record with a snapshot line only for dirty trees  480ms
   ✓ Drive scheduler backend > writes one partial attempt record with a snapshot line only for dirty trees  565ms
   ✓ Drive scheduler backend > writes one unknown attempt record with a snapshot line only for dirty trees  434ms
   ✓ Drive scheduler backend > writes one spawn failure attempt record with a snapshot line only for dirty trees  489ms
   ✓ Drive scheduler backend > records moved HEAD as unverified on a graph blocked stop  344ms
   ✓ Drive scheduler backend > runs preflight backend postflight and report inference before returning StepResult  680ms
 ✓ tests/cli/packages/subcommand.test.ts (44 tests) 23ms
 ✓ tests/domains/validator.test.ts (32 tests) 6ms
 ✓ tests/scripts/knowledge-surface-backfill.test.ts (11 tests) 1593ms
   ✓ knowledge surface recoverable backfill > restores config and writes a digest-complete no-promotion review index  316ms
   ✓ knowledge surface recoverable backfill > leaves enough on-disk evidence for manual recovery after a real hard kill  562ms
 ✓ tests/orchestration/agent-spawner.test.ts (53 tests) 92ms
 ✓ tests/agents/session-assembly.test.ts (35 tests) 860ms
 ✓ tests/orchestration/chain-steps.test.ts (51 tests) 9ms
 ✓ tests/orchestration/session-factory.security.test.ts (11 tests) 170ms
 ✓ tests/extensions/orchestration-driver-tool.test.ts (16 tests) 9828ms
   ✓ driver e2e run_driver integration > driver e2e happy path completes two tasks and tails JSONL events  1046ms
   ✓ driver e2e run_driver integration > driver preflight failure aborts without task status updates  451ms
   ✓ driver e2e run_driver integration > does not rewrite successful completion when the driver handle settles  691ms
   ✓ driver e2e run_driver integration > driver branch mismatch emits structured preflight failure before transitions  808ms
   ✓ driver e2e run_driver integration > run_driver uses the framework default envelope when envelopePath is omitted  548ms
   ✓ driver e2e run_driver integration > freezes the execution-resolved worker for enabled default main project-bound and live-bound launches  1069ms
   ✓ driver e2e run_driver integration > keeps absent and false-config inline specs completions layout and result exact  542ms
   ✓ driver e2e run_driver integration > run_driver honors an explicit legacy bundled envelopePath  314ms
   ✓ driver e2e run_driver integration > run_driver uses the project root for repository commit locking  1531ms
   ✓ driver e2e run_driver integration > run_driver propagates state commit policy defaults and overrides  1735ms
   ✓ driver e2e run_driver integration > driver postverify failure blocks task and does not commit  657ms
 ✓ tests/cli/sessions/subcommand.test.ts (39 tests) 247ms
stderr | tests/config/loader.test.ts > loadProjectConfig > enables the knowledge surface only for literal true
[warning] Skipping malformed knowledgeSurface.enabled: expected a boolean, got "true".

stderr | tests/config/loader.test.ts > loadProjectConfig > enables the knowledge surface only for literal true
[warning] Skipping malformed knowledgeSurface.enabled: expected a boolean, got 1.

stderr | tests/config/loader.test.ts > loadProjectConfig > enables the knowledge surface only for literal true
[warning] Skipping malformed knowledgeSurface.enabled: expected a boolean, got null.

 ✓ tests/extensions/plans.test.ts (27 tests) 1113ms
 ✓ tests/config/loader.test.ts (32 tests) 573ms
 ✓ tests/harness-adapters/sync.characterization.test.ts (7 tests) 1379ms
   ✓ Claude command preparation and evidence identity characterization > creates both native sources and completes one durable command-pair transaction  377ms
 ✓ tests/harness-adapters/inventory.test.ts (3 tests) 1170ms
   ✓ live harness inventory characterization > renders the stable-authority external bundle with exact live inventory bytes and fallbacks  1111ms
 ✓ tests/memory/retirement-store-characterization.test.ts (28 tests) 2625ms
   ✓ applyUnderLock (via retirement apply) > rolls forward a failure after the manifest committed  375ms
 ✓ tests/driver/drive-on-graph-recovery.test.ts (3 tests) 2121ms
   ✓ Drive-on-graph recovery > persists episode capture failure as a non-fatal Drive diagnostic  1324ms
   ✓ Drive-on-graph recovery > applies committed-work block and leave-running recovery paths to selected drive backends  737ms
 ✓ tests/entity-file-lock.test.ts (14 tests) 576ms
 ✓ tests/driver/driver-durable-steps.test.ts (4 tests) 3341ms
   ✓ driver durable step projection > writes Drive task step records with configured backend identity and resume-safe dependencies  1264ms
   ✓ driver durable step projection > records malformed reports inferred by postflight as completed success in step records and normalized events  460ms
   ✓ driver durable step projection > keeps legacy observation outputs unchanged when step records exist  920ms
   ✓ driver durable step projection > continues Drive run when durable step persistence fails  697ms
 ✓ tests/extensions/agent-switch.test.ts (22 tests) 18ms
 ✓ tests/plans/file-system.test.ts (23 tests) 281ms
 ✓ tests/architecture-map/generator.test.ts (9 tests) 2964ms
   ✓ generateArchitectureMap > writes OKF index and module shards for a TypeScript fixture  304ms
   ✓ generateArchitectureMap > reuses narrative for body-only edits without provider calls  575ms
   ✓ generateArchitectureMap > regenerates only the affected public-interface module narrative  562ms
   ✓ generateArchitectureMap > writes pending narratives for disabled budget-exhausted and failed generation  624ms
   ✓ generateArchitectureMap > completes pending narratives later without touching unaffected module files  336ms
 ✓ tests/plans/archive.test.ts (21 tests) 741ms
 ✓ tests/extensions/orchestration-driver-detached.test.ts (10 tests) 467ms
 ✓ tests/domains/loader.test.ts (23 tests) 599ms
Switched to branch 'main'
Switched to branch 'feature'
 ✓ tests/driver/durable-events.test.ts (5 tests) 5ms
 ✓ tests/driver/event-stream.test.ts (13 tests) 213ms
 ✓ tests/memory/consolidation-sources.test.ts (10 tests) 495ms
 ✓ tests/orchestration/quality-review-launch.test.ts (21 tests) 10038ms
   ✓ quality review launch policy > requires an observed audit state even with an injected ready assessment  899ms
   ✓ quality review launch policy > runs configured checks only after the QM and reviewer evidence complete  1031ms
   ✓ quality review launch policy > marks checks not run and not-ready when preparation fails after assessment  702ms
   ✓ quality review launch policy > installs analysis dependencies before assessment without running lifecycle scripts  1170ms
   ✓ quality review launch policy > blocks ready when analysis preparation is the only blocker (indexed: true)  1104ms
   ✓ quality review launch policy > blocks ready when analysis preparation is the only blocker (indexed: false)  1438ms
   ✓ quality review launch policy > aborts a slow base export on deadline  722ms
   ✓ quality review launch policy > aborts a slow base export on caller  780ms
   ✓ quality review launch policy > delegates a durable terminal QM into a child run with a complete report  1827ms
 ✓ tests/extensions/task-tools.test.ts (20 tests) 1780ms
 ✓ tests/durable-runtime/graph-scheduler.test.ts (4 tests) 1247ms
   ✓ durable graph scheduler > acquires renews and releases step leases only for the matching holder  566ms
   ✓ durable graph scheduler > finalizes run from terminal step outcomes without nonterminal demotion  367ms
 ✓ tests/cli/drive/run-drive-characterization.test.ts (31 tests) 1851ms
 ✓ tests/memory/accepted-episode-finalization-characterization.test.ts (23 tests) 18ms
 ✓ tests/cli/export/subcommand.test.ts (11 tests) 57ms
 ✓ tests/episodic/w3-contract.test.ts (3 tests) 322ms
 ✓ tests/skills/exporter-sync-characterization.test.ts (25 tests) 7673ms
   ✓ runHarnessSync write mode > replaces a source-ahead target and keeps a locally edited one  427ms
   ✓ runHarnessSync write mode > reports lock contention on each row with the holder pid  2023ms
   ✓ runHarnessSync write mode > emits an owner-root lock-contended row for an empty group  2009ms
   ✓ runHarnessSync catalogue grouping > forgetting a removed asset spans every default target and scope  994ms
 ✓ tests/driver/run-state.test.ts (10 tests) 183ms
 ✓ tests/orchestration/spawn-tracker.test.ts (42 tests) 9ms
 ✓ tests/cli/run/subcommand.test.ts (11 tests) 427ms
 ✓ tests/domains/prompt-assembly.test.ts (17 tests) 360ms
 ✓ tests/agents/resolver.test.ts (35 tests) 5ms
 ✓ tests/driver/run-step.test.ts (7 tests) 7802ms
   ✓ run-step binary > runs from outside the source directory and writes completion, events, task status, and lock effects  1603ms
   ✓ run-step binary > does not parse stale Codex env for claude-cli specs  927ms
   ✓ run-step binary > uses frozen episode actor and attempt identity in the detached runner  3104ms
   ✓ run-step binary > releases the detached plan lock after completion and before episode capture  764ms
   ✓ run-step binary > contains terminal-hook and backstop release failures in the detached child  666ms
   ✓ run-step binary > reaps its backend process group when the runner is signalled  553ms
 ✓ tests/orchestration/chain-parser.test.ts (52 tests) 8ms
 ✓ tests/orchestration/agent-spawner.completion-loop.test.ts (11 tests) 245ms
 ✓ tests/packages/installer.test.ts (25 tests) 1277ms
   ✓ install metadata — git > installedAt is a valid ISO 8601 timestamp  338ms
 ✓ tests/memory/episode-transition-lock.test.ts (15 tests) 287ms
error: option '--copy' cannot be used with option '--link'
 ✓ tests/cli/tasks/commands/edit.test.ts (22 tests) 528ms
 ✓ tests/orchestration/chain-event-adapter-characterization.test.ts (41 tests) 8ms
 ✓ tests/tasks/file-system.test.ts (41 tests) 355ms
 ✓ tests/cli/harness/subcommand.test.ts (9 tests) 549ms
 ✓ tests/orchestration/quality-review-models.test.ts (42 tests) 8ms
 ✓ tests/extensions/project-tools-fallow-introspection-characterization.test.ts (25 tests) 534ms
 ✓ tests/skills/discovery.test.ts (15 tests) 196ms
 ✓ tests/memory/knowledge-store-retrieval-characterization.test.ts (15 tests) 117ms
 ✓ tests/packages/eject.test.ts (16 tests) 251ms
 ✓ tests/extensions/domain-bindings.test.ts (4 tests) 269ms
 ✓ tests/cli/drive/status.test.ts (8 tests) 132ms
 ✓ tests/sessions/session-store.test.ts (31 tests) 80ms
 ✓ tests/driver/lock-primitives.characterization.test.ts (15 tests) 249ms
 ✓ tests/agent-packages/binary-runners.characterization.test.ts (12 tests) 114ms
 ✓ tests/extensions/project-tools-fallow-fixtures.test.ts (10 tests) 7990ms
   ✓ pinned Fallow capture fixtures > fails closed for incomplete or contradictory zero-change summary evidence  300ms
   ✓ pinned Fallow capture fixtures > captures through the local pin without changing the repository worktree  7410ms
 ✓ tests/domains/resolver.test.ts (27 tests) 4ms
 ✓ tests/driver/driver.test.ts (6 tests) 3084ms
   ✓ driver > terminates a detached child published during the pre-spawn abort window  3055ms
 ✓ tests/memory/run-pass-characterization.test.ts (10 tests) 30ms
 ✓ tests/driver/drive-run-start-characterization.test.ts (5 tests) 1627ms
   ✓ runStart Drive graph characterization > uses driveTaskIds instead of remainingTaskIds across resume and partial-init repair  1096ms
 ✓ tests/driver/prompt-template.test.ts (17 tests) 245ms
 ✓ tests/orchestration/chain-compiler.test.ts (6 tests) 5ms
 ✓ tests/agent-packages/build.test.ts (12 tests) 83ms
 ✓ tests/driver/drive-on-graph-routing.test.ts (4 tests) 4983ms
   ✓ Drive-on-graph routing > runs inline Drive through runDriveOnGraph in the host process  429ms
   ✓ Drive-on-graph routing > runs detached Drive by executing runDriveOnGraph inside the frozen runner  4178ms
 ✓ tests/domains/main-domain.test.ts (8 tests) 2374ms
   ✓ main domain built-in discovery > keeps gate-selected inline knowledge adapters outside package auto-discovery  2010ms
 ✓ tests/driver/durable-finalizers.test.ts (2 tests) 2350ms
   ✓ Drive durable finalizer projection > records finalization_failed as a retryable finalizer step without failing the task step  2184ms
 ✓ tests/cli/update/subcommand.test.ts (14 tests) 8ms
 ✓ tests/scripts/check-reachability.test.ts (35 tests) 6539ms
 ✓ tests/durable-runtime/file-store.test.ts (6 tests) 95ms
 ✓ tests/analysis/binding-resolver.test.ts (7 tests) 21ms
 ✓ tests/agent-packages/claude-binary-runner.test.ts (14 tests) 46ms
 ✓ tests/driver/driver-durable-dual-write.test.ts (4 tests) 519ms
 ✓ tests/driver/drive-cancelled-dependency.test.ts (9 tests) 752ms
 ✓ tests/domains/coding-agents.test.ts (13 tests) 1388ms
   ✓ coding domain agent invariants > gives analysis consumers generic tools and shared skill under project filtering  596ms
   ✓ coding domain agent invariants > registers architecture_map_read at extension factory load for architecture-consuming agents  750ms
 ✓ tests/extensions/orchestration-lineage.test.ts (14 tests) 76ms
 ✓ tests/driver/shell-command-finalizer.test.ts (3 tests) 2988ms
   ✓ Drive shell-command finalizer > keeps one finalization-failure record across retries  1852ms
   ✓ Drive shell-command finalizer > commits source changes and marks task status through shell finalizer steps  353ms
   ✓ Drive shell-command finalizer > records retryable finalizer failures from persisted attempt evidence as finalization_failed  783ms
 ✓ tests/driver/cross-plan-commit-lock.test.ts (1 test) 7181ms
   ✓ cross-plan detached commit serialization > serializes driver-owned commits across detached runs in one repo  7181ms
 ✓ tests/agent-packages/definition.test.ts (26 tests) 62ms
 ✓ tests/tasks/task-serializer.test.ts (23 tests) 9ms
 ✓ tests/artifacts/plan-conformance.test.ts (12 tests) 5ms
stderr | tests/extensions/orchestration-watch-events-normalized-compat.test.ts > watch_events normalized compatibility > preserves legacy watch_events cursor semantics over graph normalized events with fallback diagnostics
{"type":"drive_durable_event_diagnostic","code":"drive_durable_run_setup_failed","message":"Drive normalized run record setup failed; disabling normalized event writes for this sink.","details":{"legacyEventType":"task_done","runId":"run-setup-failure","error":"ENOTDIR: not a directory, open '/var/folders/kq/1jrmsh1141b4x5cfd79qyq200000gn/T/orchestration-watch-events-normalized-sv08hB/missions/sessions/normalized-watch-events/runs/run-setup-failure/not-a-directory/normalized-watch-events/runs/run-setup-failure/run.json'"}}

 ✓ tests/extensions/orchestration-watch-events-normalized-compat.test.ts (2 tests) 176ms
 ✓ tests/durable-runtime/scheduler-retry.test.ts (2 tests) 386ms
 ✓ tests/driver/driver-detached.test.ts (12 tests) 31490ms
   ✓ startDetached > copies a prebuilt runner binary into the run workdir when available  902ms
   ✓ startDetached > driver detached codex e2e prepares the workdir, launches the compiled runner, bridges events, and leaves locking to the child  2344ms
   ✓ startDetached > bridges a post-terminal episode capture failure to the detached parent bus  2227ms
   ✓ startDetached > bounds post-terminal bridge drain when the child does not exit  4008ms
   ✓ startDetached > stops a draining bridge when the detached result rejects  4072ms
   ✓ startDetached > reconciles one terminal episode when the parent aborts after detached start  3850ms
   ✓ startDetached > keeps abort capture and reporter failures non-fatal with one established warning  2201ms
   ✓ startDetached > escalates an ignored SIGTERM to SIGKILL so abort settles on a bounded deadline  4653ms
   ✓ startDetached > keeps one completion-backed aborted terminal when abort escalates to SIGKILL  6743ms
 ✓ tests/memory/consolidation-proposals-materializations-characterization.test.ts (23 tests) 244ms
 ✓ tests/driver/event-stream-bridge.test.ts (9 tests) 3315ms
   ✓ bridgeJsonlToActivityBus > stops automatically after a terminal event  330ms
   ✓ bridgeJsonlToActivityBus > settles finish() even when the final read never returns  2057ms
 ✓ tests/orchestration/quality-review-report.test.ts (29 tests) 6ms
 ✓ tests/cli/plans/commands/edit.test.ts (22 tests) 127ms
 ✓ tests/orchestration/agent-spawner.lineage.test.ts (16 tests) 7ms
 ✓ tests/scripts/validate-harness-exports.test.ts (12 tests) 22223ms
   ✓ repository harness export validation > validates evidence-held recovery for four repo exports before the personal bundle  12171ms
   ✓ repository harness export validation > authorizes exactly the four ratified rows from named git bytes and rejects a changed target before locking  608ms
   ✓ repository harness export validation > persists installed evidence, resumes with its receipt, checks four rows, and cleans exact backups  1131ms
   ✓ repository harness export validation > a prepared-phase failure rolls back before retry installs the whole set  1263ms
   ✓ repository harness export validation > release uncertainty halts with committed bytes retained and a clean retry completes  880ms
   ✓ repository harness export validation > resumes after pending clear and after exact backup cleanup  1080ms
   ✓ repository harness export validation > resumes project cleanup after a crash immediately after the first backup deletion  738ms
   ✓ repository harness export validation > resumes personal bundle cleanup after a crash immediately after its backup deletion  1290ms
   ✓ repository harness export validation > rejects an absent project backup without a matching cleanup intent  578ms
   ✓ repository harness export validation > preserves a changed project backup and reports it as ambiguous  558ms
   ✓ repository harness export validation > never removes an evidence-nominated same-user path  575ms
   ✓ repository harness export validation > never removes a personal path nominated by external-bundle evidence  1350ms
 ✓ tests/cli/scaffold/subcommand.test.ts (21 tests) 80ms
 ✓ tests/tasks/task-parser.test.ts (30 tests) 11ms
[warning] Plan lock release backstop failed: EISDIR: illegal operation on a directory, read
 ✓ tests/chains/named-chain-loader.test.ts (18 tests) 59ms
 ✓ tests/orchestration/chain-event-adapter.test.ts (2 tests) 3ms
 ✓ tests/extensions/orchestration-chain-tool-durable.test.ts (7 tests) 835ms
   ✓ chain_run durable tool routing > routes loop-free chain_run through the durable graph and loop chains inline  711ms
 ✓ tests/cli/drive/graph-run.test.ts (1 test) 62ms
 ✓ tests/cli/skills/subcommand.test.ts (13 tests) 157ms
 ✓ tests/packages/store.test.ts (25 tests) 140ms
 ✓ tests/cli/drive/list.test.ts (4 tests) 62ms
 ✓ tests/driver/worktree-snapshot-timeout.test.ts (12 tests) 3486ms
   ✓ legacy refuses warning-producing timed-out snapshot preflight before spawn  376ms
   ✓ graph refuses warning-producing timed-out snapshot preflight before spawn  460ms
   ✓ identifies timed-out snapshot and cleanup git commands  375ms
   ✓ settles a timeout snapshot git despite inherited pipes  587ms
   ✓ settles a abort snapshot git despite inherited pipes  492ms
 ✓ tests/todo/todo-extension.test.ts (19 tests) 81ms
 ✓ tests/packages/manifest.test.ts (30 tests) 18ms
 ✓ tests/driver/backends/cosmonauts-subagent-resolution.test.ts (3 tests) 330ms
 ✓ tests/cli/chain-event-logger.test.ts (27 tests) 4ms
 ✓ tests/driver/contradicted-block-retry.test.ts (6 tests) 406ms
 ✓ tests/cli/plans/commands/list.test.ts (22 tests) 125ms
 ✓ tests/tasks/id-generator.test.ts (39 tests) 4ms
 ✓ tests/prompts/loader.test.ts (24 tests) 235ms
 ✓ tests/agents/skills.test.ts (16 tests) 18ms
 ✓ tests/pi-contract/pi-behavior-contract.test.ts (5 tests) 616ms
   ✓ pi contract: same-message tool batch dispatch > one sequential tool serializes the entire batch  304ms
 ✓ tests/durable-runtime/scheduler-parallelism.test.ts (2 tests) 347ms
 ✓ tests/durable-runtime/runtime-criticals-characterization.test.ts (49 tests) 6ms
 ✓ tests/driver/backends/process-reaping.test.ts (6 tests) 6815ms
   ✓ backend process reaping > leaves no live descendant when the backend settles (codex)  1794ms
   ✓ backend process reaping > leaves no live descendant when the backend settles (claude-cli)  835ms
   ✓ backend process reaping > settles when a descendant holds the output pipes open (codex)  613ms
   ✓ backend process reaping > settles when a descendant holds the output pipes open (claude-cli)  592ms
   ✓ backend process reaping > escalates an ignored SIGTERM to SIGKILL on a bounded deadline  2966ms
 ✓ tests/extensions/orchestration-watch-events-characterization.test.ts (35 tests) 285ms
 ✓ tests/cli/workflow-resolution.test.ts (9 tests) 32ms
 ✓ tests/harness-adapters/registry.test.ts (3 tests) 19ms
 ✓ tests/driver/parity.test.ts (1 test) 4102ms
   ✓ driver inline vs detached parity > keeps behavioral output equivalent while detached commits differ by metadata  4101ms
 ✓ tests/cli/tasks/commands/search.test.ts (21 tests) 178ms
 ✓ tests/extensions/project-tools-process.test.ts (4 tests) 1426ms
   ✓ project-tools provider process runner > spools large output losslessly and removes the private copies  341ms
   ✓ project-tools provider process runner > distinguishes signal abort timeout and spawn failure from clean exit  807ms
 ✓ tests/extensions/agent-memory-remember-params-characterization.test.ts (26 tests) 228ms
 ✓ tests/extensions/orchestration-watch-events.test.ts (6 tests) 74ms
 ✓ tests/extensions/task-plan-linkage.test.ts (18 tests) 166ms
 ✓ tests/driver/backends/codex.test.ts (8 tests) 36ms
 ✓ tests/durable-runtime/scheduler-cancellation.test.ts (1 test) 180ms
 ✓ tests/domains/registry.test.ts (20 tests) 4ms
 ✓ tests/extensions/orchestration-rendering.test.ts (26 tests) 3ms
 ✓ tests/driver/durable-steps.test.ts (4 tests) 156ms
 ✓ tests/extensions/orchestration-driver-tool-graph.test.ts (1 test) 315ms
   ✓ run_driver graph compatibility > preserves run_driver watch_events and avoids duplicate graph lifecycle events  315ms
 ✓ tests/tasks/task-manager-concurrency.test.ts (4 tests) 1654ms
   ✓ TaskManager concurrency > allocates distinct IDs for concurrent creates across separate TaskManager instances  1127ms
 ✓ tests/extensions/execution-probe.test.ts (17 tests) 3031ms
   ✓ restores after failure  343ms
   ✓ restores after timeout  300ms
 ✓ tests/driver/drive-graph-finalization-result.test.ts (3 tests) 3242ms
   ✓ Drive graph finalization results > emits a completion candidate with a Done task and a Cancelled plan task  764ms
   ✓ Drive graph finalization results > reports completed task-status count and emits one run_finalization_failed for state-commit failure  1154ms
   ✓ Drive graph finalization results > continues after a driver-committed partial task without marking it Done or all tasks passed  1323ms
 ✓ tests/sessions/manifest.test.ts (17 tests) 153ms
 ✓ tests/artifact-viewer/loaders.test.ts (7 tests) 150ms
 ✓ tests/driver/backends/claude-cli.test.ts (7 tests) 27ms
 ✓ tests/durable-runtime/run-start-resume.test.ts (4 tests) 272ms
 ✓ tests/durable-runtime/scheduler-contracts.test.ts (2 tests) 6ms
 ✓ tests/extensions/orchestration-activity.test.ts (6 tests) 8ms
 ✓ tests/cli/eject/subcommand.test.ts (14 tests) 6ms
 ✓ tests/pi-contract/pi-session-contract.test.ts (6 tests) 111ms
 ✓ tests/agent-packages/skills.test.ts (8 tests) 129ms
 ✓ tests/skills/exporter-sync-failure-characterization.test.ts (8 tests) 633ms
 ✓ tests/orchestration/quality-review-artifacts.test.ts (3 tests) 120ms
 ✓ tests/cli/plans/commands/check-artifacts.test.ts (5 tests) 58ms
 ✓ tests/memory/episode-prune-journal-characterization.test.ts (36 tests) 278ms
 ✓ tests/extensions/orchestration-chain-tool-observation.test.ts (3 tests) 6ms
 ✓ tests/orchestration/message-bus.test.ts (14 tests) 4ms
 ✓ tests/driver/lock.test.ts (6 tests) 63ms
 ✓ tests/extensions/orchestration-run-control-surface.test.ts (1 test) 443ms
   ✓ orchestration run control surface > observes returned chain and Drive run ids through normalized status and watch  442ms
 ✓ tests/cli/tasks/commands/list.test.ts (18 tests) 91ms
 ✓ tests/agent-packages/codex-binary-runner.test.ts (5 tests) 37ms
 ✓ tests/driver/backends/cosmonauts-subagent.test.ts (5 tests) 33ms
 ✓ tests/architecture-map/freshness.test.ts (3 tests) 72ms
 ✓ tests/extensions/orchestration-spawn-inline-compiler.test.ts (2 tests) 151ms
 ✓ tests/cli/tasks/commands/view.test.ts (8 tests) 42ms
 ✓ tests/agent-packages/codex-cli.test.ts (10 tests) 52ms
 ✓ tests/driver/run-one-task.test.ts (62 tests) 38878ms
   ✓ run-one-task > driver-commits cleans only contained Done refs with tracked task state  2787ms
   ✓ run-one-task > backend-commits cleans only contained Done refs with tracked task state  2238ms
   ✓ run-one-task > no-commit cleans only contained Done refs with tracked task state  1933ms
   ✓ run-one-task > driver-commits deletes a task-only snapshot after worker source edits  779ms
   ✓ run-one-task > backend-commits deletes a task-only snapshot after worker source edits  948ms
   ✓ run-one-task > no-commit deletes a task-only snapshot after worker source edits  710ms
   ✓ run-one-task > driver-commits deletes a preserved dirty snapshot despite later source edits  1264ms
   ✓ run-one-task > backend-commits deletes a preserved dirty snapshot despite later source edits  835ms
   ✓ run-one-task > no-commit deletes a preserved dirty snapshot despite later source edits  474ms
   ✓ run-one-task > driver-commits removes a snapshot whose only non-task delta is a preserved deletion  591ms
   ✓ run-one-task > backend-commits removes a snapshot whose only non-task delta is a preserved deletion  424ms
   ✓ run-one-task > no-commit removes a snapshot whose only non-task delta is a preserved deletion  447ms
   ✓ run-one-task > driver-commits retains a ref when dirty X is reverted or Y is deleted  1212ms
   ✓ run-one-task > backend-commits retains a ref when dirty X is reverted or Y is deleted  1032ms
   ✓ run-one-task > no-commit retains a ref when dirty X is reverted or Y is deleted  831ms
   ✓ run-one-task > records the last of two blocked fenced reasons  305ms
   ✓ run-one-task > retains a deleted backup with the same task ID in terminal outcome  559ms
   ✓ run-one-task > snapshots tracked and untracked bytes before spawn and blocked retains only unfinished refs  752ms
   ✓ run-one-task > snapshots tracked and untracked bytes before spawn and success retains only unfinished refs  613ms
   ✓ run-one-task > writes one blocked attempt record with a snapshot line only for dirty trees  1338ms
   ✓ run-one-task > writes one failure attempt record with a snapshot line only for dirty trees  693ms
   ✓ run-one-task > writes one partial attempt record with a snapshot line only for dirty trees  676ms
   ✓ run-one-task > writes one unknown attempt record with a snapshot line only for dirty trees  659ms
   ✓ run-one-task > writes one spawn failure attempt record with a snapshot line only for dirty trees  755ms
   ✓ run-one-task > blocks a preflight probe journal before verification or commit  346ms
   ✓ run-one-task > blocks a postflight probe journal before verification or commit  520ms
   ✓ run-one-task > blocks a during-postflight probe journal before verification or commit  412ms
   ✓ run-one-task > cleans a Done snapshot when every captured byte is in the final worktree  537ms
   ✓ run-one-task > stops a blocked report before postflight or retry with driver-commits  347ms
   ✓ run-one-task > stops a blocked report before postflight or retry with no-commit  366ms
   ✓ run-one-task > uses a final blocked outcome line instead of an earlier success line  407ms
   ✓ run-one-task > blocks conflicting fenced success and final human stop before postflight or retry  311ms
   ✓ run-one-task > records a backend commit as unverified when its report blocks  327ms
   ✓ run-one-task > driver commit exclusion uses repo lock excludes missions and memory and emits sha  2745ms
   ✓ run-one-task > emits commit and task-status finalization phase events on successful driver commit  405ms
   ✓ run-one-task > uses safe prose or task title for legacy commit subject: Implemented the requested change  424ms
   ✓ run-one-task > uses safe prose or task title for legacy commit subject: ```json
{"outcome":"success"}
```  422ms
   ✓ run-one-task > uses safe prose or task title for legacy commit subject: {"outcome":"success","files":[]}  398ms
   ✓ run-one-task > uses safe prose or task title for legacy commit subject: {"outcome":"success"}
Changed behavior  450ms
   ✓ run-one-task > uses safe prose or task title for legacy commit subject: outcome: success  450ms
   ✓ run-one-task > uses safe prose or task title for legacy commit subject: summary: outcome: success  464ms
   ✓ run-one-task > uses safe prose or task title for legacy commit subject: summary: {"outcome":"success"}  461ms
   ✓ run-one-task > uses task title as driver commit subject when report summary is generic  559ms
   ✓ run-one-task > emits explicit no-change commit finalization evidence for verification-only tasks  437ms
   ✓ run-one-task > records finalization_failed instead of blocked when driver commit fails after passing postflight  1140ms
   ✓ run-one-task > retains the partial attempt record when commit finalization fails  610ms
   ✓ run-one-task > does not write pending finalization for backend or postflight failures  712ms
   ✓ run-one-task > driver partial outcome commits and leaves task In Progress with progress notes  513ms
   ✓ run-one-task > run-one-task infers success for unknown reports when postverify passes and changes exist  550ms
   ✓ run-one-task > run-one-task still blocks unknown reports when postverify passes without changes  381ms
 ✓ tests/driver/drive-graph-compiler.test.ts (2 tests) 145ms
 ✓ tests/tasks/task-note-preservation.test.ts (8 tests) 295ms
 ✓ tests/durable-runtime/scheduler-store.test.ts (1 test) 52ms
 ✓ tests/driver/report-parser.test.ts (20 tests) 4ms
 ✓ tests/extensions/orchestration-driver-session-scoping.test.ts (1 test) 18ms
 ✓ tests/durable-runtime/scheduler-heartbeats.test.ts (1 test) 231ms
 ✓ tests/cli/architecture/subcommand.test.ts (8 tests) 28ms
 ✓ tests/extensions/orchestration-run-control.test.ts (2 tests) 220ms
 ✓ tests/driver/backends/orchestration-adapter.test.ts (1 test) 6ms
 ✓ tests/agent-packages/claude-cli.test.ts (11 tests) 97ms
 ✓ tests/helpers/project-health-record.test.ts (7 tests) 4ms
 ✓ tests/harness-adapters/provenance.characterization.test.ts (2 tests) 266ms
 ✓ tests/orchestration/quality-review-one-pass.test.ts (1 test) 925ms
   ✓ assesses one triaged panel before running one configured check  924ms
 ✓ tests/memory/transition-capture-release-unconfirmed.test.ts (3 tests) 211ms
 ✓ tests/cli/tasks/commands/create-batch-row-characterization.test.ts (27 tests) 7ms
 ✓ tests/durable-runtime/run-start.test.ts (3 tests) 99ms
 ✓ tests/cli/plans/commands/create.test.ts (8 tests) 77ms
 ✓ tests/artifact-viewer/server.test.ts (3 tests) 625ms
   ✓ artifact-viewer server > serves architecture map pages and missing map empty state  598ms
 ✓ tests/driver/drive-on-graph-acceptance.test.ts (28 tests) 36225ms
   ✓ Drive-on-graph acceptance > driver-commits deletes a task-only snapshot after two worker source edits  1137ms
   ✓ Drive-on-graph acceptance > backend-commits deletes a task-only snapshot after two worker source edits  1038ms
   ✓ Drive-on-graph acceptance > no-commit deletes a task-only snapshot after two worker source edits  946ms
   ✓ Drive-on-graph acceptance > driver-commits deletes a preserved dirty snapshot despite later worker edits  1110ms
   ✓ Drive-on-graph acceptance > backend-commits deletes a preserved dirty snapshot despite later worker edits  1178ms
   ✓ Drive-on-graph acceptance > no-commit deletes a preserved dirty snapshot despite later worker edits  1390ms
   ✓ Drive-on-graph acceptance > driver-commits removes a snapshot whose only non-task delta is a preserved deletion  1279ms
   ✓ Drive-on-graph acceptance > backend-commits removes a snapshot whose only non-task delta is a preserved deletion  590ms
   ✓ Drive-on-graph acceptance > no-commit removes a snapshot whose only non-task delta is a preserved deletion  609ms
   ✓ Drive-on-graph acceptance > driver-commits records a retained ref when dirty X is reverted or Y is deleted  1665ms
   ✓ Drive-on-graph acceptance > backend-commits records a retained ref when dirty X is reverted or Y is deleted  1259ms
   ✓ Drive-on-graph acceptance > no-commit records a retained ref when dirty X is reverted or Y is deleted  1098ms
   ✓ Drive-on-graph acceptance > records the last of two blocked fenced reasons  866ms
   ✓ Drive-on-graph acceptance > retains a deleted backup with the same task ID in terminal record  770ms
   ✓ Drive-on-graph acceptance > driver-commits compares Done snapshots with worker work, not Drive task state  3266ms
   ✓ Drive-on-graph acceptance > backend-commits compares Done snapshots with worker work, not Drive task state  2490ms
   ✓ Drive-on-graph acceptance > no-commit compares Done snapshots with worker work, not Drive task state  1701ms
   ✓ Drive-on-graph acceptance > records retained snapshot refs in terminal state only when bytes are missing: true  531ms
   ✓ Drive-on-graph acceptance > records retained snapshot refs in terminal state only when bytes are missing: false  477ms
   ✓ Drive-on-graph acceptance > carries an earlier Done task's retained ref into finalization_failed completion  3383ms
   ✓ Drive-on-graph acceptance > carries an earlier Done task's retained ref into aborted completion  469ms
   ✓ Drive-on-graph acceptance > emits the terminal legacy event before completion and captures afterward  1366ms
   ✓ Drive-on-graph acceptance > invokes terminal-persisted hook after completion and before capture on every completion-backed outcome  1420ms
   ✓ Drive-on-graph acceptance > preserves the persisted terminal when onTerminalPersisted rejects  358ms
   ✓ Drive-on-graph acceptance > survives scheduler host death and resumes a large sequential drive graph  4399ms
   ✓ Drive-on-graph acceptance > continues an in-flight run from the envelope snapshot after the live file moves  479ms
   ✓ Drive-on-graph acceptance > resumes from the persisted envelope snapshot after the live file moves  925ms
 ✓ tests/cli/plans/commands/delete.test.ts (17 tests) 98ms
 ✓ tests/cli/architecture/narrative-provider.test.ts (3 tests) 6ms
 ✓ tests/cli/tasks/commands/delete.test.ts (17 tests) 248ms
 ✓ tests/orchestration/activity-bus.test.ts (10 tests) 3ms
 ✓ tests/durable-runtime/backend-contracts.test.ts (1 test) 7ms
 ✓ tests/extensions/observability.test.ts (6 tests) 2ms
 ✓ tests/durable-runtime/controller.test.ts (3 tests) 76ms
 ✓ tests/driver/worktree-snapshot.test.ts (15 tests) 5608ms
   ✓ snapshotWorktree > driver-commits protects worker bytes but exempts Drive's own task status  891ms
   ✓ snapshotWorktree > backend-commits protects worker bytes but exempts Drive's own task status  1043ms
   ✓ snapshotWorktree > no-commit protects worker bytes but exempts Drive's own task status  766ms
   ✓ snapshotWorktree > retains snapshot bytes missing from the final worktree  322ms
   ✓ snapshotWorktree > compares driver-commits snapshots with committed bytes, not the worktree  441ms
   ✓ snapshotWorktree > compares backend-commits snapshots with committed bytes, not the worktree  544ms
   ✓ snapshotWorktree > retains a snapshot when the final commit drops a captured gitlink  565ms
 ✓ tests/architecture-map/analyzer.test.ts (2 tests) 486ms
   ✓ typescriptSourceAnalyzer > records public interfaces internal dependencies and external imports  438ms
 ✓ tests/orchestration/chain-routing.test.ts (2 tests) 6ms
 ✓ tests/config/scaffold.test.ts (11 tests) 64ms
 ✓ tests/analysis/contracts.test.ts (4 tests) 4ms
 ✓ tests/cli/resolve-default-lead.test.ts (6 tests) 3ms
 ✓ tests/domains/shared-main-leakage.test.ts (2 tests) 4ms
 ✓ tests/cli/session-per-domain-leads.test.ts (1 test) 3ms
 ✓ tests/extensions/orchestration-driver-bus-isolation.test.ts (3 tests) 5ms
 ✓ tests/agents/qualified-role.test.ts (23 tests) 3ms
 ✓ tests/helpers/domain-package-fixture.test.ts (1 test) 45ms
 ✓ tests/cli/shared/output.test.ts (12 tests) 6ms
 ✓ tests/harness-runtime-inventory.test.ts (1 test) 28ms
 ✓ tests/cli/create/subcommand.test.ts (8 tests) 42ms
 ✓ tests/durable-runtime/scheduler-capacity-characterization.test.ts (2 tests) 46ms
 ✓ tests/memory/consolidation-source-contract-characterization.test.ts (4 tests) 4ms
 ✓ tests/scripts/update-fallow-baselines.test.ts (3 tests) 1321ms
   ✓ reasoned refresh saves a requested baseline and appends provenance  478ms
   ✓ refresh analyzes the base commit despite ahead and dirty findings  648ms
 ✓ tests/helpers/packages.test.ts (1 test) 59ms
Preparing worktree (detached HEAD 45330f0)
 ✓ tests/orchestration/quality-review-session-prompt.test.ts (1 test) 89ms
 ✓ tests/extensions/orchestration-authority.test.ts (3 tests) 18ms
Switched to branch 'main'
Switched to branch 'feature'
 ✓ tests/cli/run/named-qm-entry.test.ts (2 tests) 1584ms
   ✓ runs the shipped verify named chain through the CLI to a terminal QM report  884ms
   ✓ runs the shipped implement named chain through the CLI to a terminal QM report  698ms
 ✓ tests/orchestration/quality-review-profile.test.ts (8 tests) 4ms
 ✓ tests/scripts/suppression-policy.test.ts (16 tests) 2606ms
   ✓ suppression policy > tracked source directives exactly match the exception registry  2595ms
 ✓ tests/cli/serve/subcommand.test.ts (3 tests) 31ms
 ✓ tests/agent-packages/export.test.ts (2 tests) 10ms
 ✓ tests/agents/runtime-identity.test.ts (11 tests) 3ms
 ✓ tests/orchestration/quality-review-checks.test.ts (4 tests) 451ms
 ✓ tests/coding-domain-rename.test.ts (3 tests) 30ms
 ✓ tests/cli/pi-flags.test.ts (7 tests) 2ms
 ✓ tests/domains/coding-chains.test.ts (6 tests) 4ms
 ✓ tests/orchestration/quality-review-workspace.test.ts (4 tests) 2025ms
   ✓ private review workspace capture > refuses three changing samples before any clone I/O  387ms
   ✓ private review workspace capture > refuses a source edited after a stable capture while the clone runs  329ms
   ✓ private review workspace capture > refuses sparse, gitlink, nested and linked-worktree layouts  606ms
   ✓ private review workspace capture > uses the fork merge-base when the base branch advances  702ms
 ✓ tests/architecture-map/config.test.ts (2 tests) 31ms
 ✓ tests/agent-packages/compatibility.test.ts (4 tests) 2ms
 ✓ tests/domains/default-domain.test.ts (4 tests) 2ms
 ✓ tests/orchestration/semaphore.test.ts (6 tests) 2ms
 ✓ tests/skills/shipped-frontmatter.test.ts (3 tests) 116ms
 ✓ tests/cli/plans/commands/archive.test.ts (4 tests) 137ms
 ✓ tests/orchestration/spawn-limits.test.ts (12 tests) 2ms
 ✓ tests/helpers/fixtures.test.ts (4 tests) 55ms
 ✓ tests/extensions/analysis-consent-snapshot.test.ts (1 test) 30ms
 ✓ tests/orchestration/quality-review-pi-settings.test.ts (1 test) 1335ms
   ✓ launches a quality session without clone Pi settings or appended prompt  1335ms
 ✓ tests/orchestration/quality-review-repository-pins.test.ts (2 tests) 359ms
 ✓ tests/orchestration/chain-runner-cosmo-migration.test.ts (1 test) 9ms
 ✓ tests/orchestration/assistant-text.test.ts (6 tests) 2ms
 ✓ tests/cli/quality-review-cli.test.ts (2 tests) 1982ms
   ✓ standalone Quality Manager CLI > leaves 1 existing plan directories byte-identical without explicit context  987ms
   ✓ standalone Quality Manager CLI > leaves 2 existing plan directories byte-identical without explicit context  994ms
 ✓ tests/orchestration/quality-review-command.test.ts (4 tests) 3274ms
   ✓ quality review host commands > reaps same-group children after a successful leader exit and keeps output  2227ms
   ✓ quality review host commands > finishes on leader exit while a detached grandchild holds stdout  1004ms
 ✓ tests/packages/catalog.test.ts (8 tests) 4ms
 ✓ tests/agents/drive-worker-tool-guard.test.ts (53 tests) 8ms
 ✓ tests/coding-agnostic-framework.test.ts (1 test) 155ms
 ✓ tests/cli/plans/subcommand.test.ts (4 tests) 4ms
 ✓ tests/driver/backends/registry.test.ts (4 tests) 3ms
 ✓ tests/cli/architecture/main-dispatch.test.ts (2 tests) 1714ms
   ✓ cli/main architecture dispatch > routes cosmonauts architecture generate to createArchitectureProgram  1496ms
 ✓ tests/domains/public-surface.test.ts (1 test) 2ms
 ✓ tests/domains/bindings.test.ts (1 test) 2ms
 ✓ tests/cli/shared/errors.test.ts (4 tests) 5ms
 ✓ tests/cli/plans/commands/view.test.ts (3 tests) 97ms
 ✓ tests/driver/driver-script.test.ts (2 tests) 55ms
 ✓ tests/cli/serve/main-dispatch.test.ts (2 tests) 2065ms
   ✓ cli/main serve dispatch > routes cosmonauts serve to createServeProgram with host port open options  1821ms
 ✓ tests/memory/proposal-disappeared-characterization.test.ts (1 test) 43ms
 ✓ tests/scripts/check-reachability-visit.test.ts (27 tests) 6918ms
   ✓ reachability verdict for the shipped repository > reaches every runtime lib module under the committed staged-code registry  1865ms
 ✓ tests/config/biome.test.ts (1 test) 70ms
 ✓ tests/orchestration/surface-non-goals.test.ts (1 test) 9ms
 ✓ tests/cli/export/main-dispatch.test.ts (2 tests) 2188ms
   ✓ cli/main export dispatch > routes cosmonauts export to createExportProgram  1839ms
   ✓ cli/main export dispatch > does not fall through to normal prompt runtime parsing  349ms
 ✓ tests/cli/dump-prompt.test.ts (3 tests) 2438ms
   ✓ --dump-prompt > default routing main installed defaults to main/cosmo when no agent is provided  791ms
   ✓ --dump-prompt > default routing coding domain uses coding/cody when no agent is provided  815ms
   ✓ --dump-prompt > uses the explicit cody agent when provided  830ms
 ✓ tests/driver/default-envelope.test.ts (2 tests) 2ms
 ✓ tests/extensions/init.test.ts (3 tests) 2ms
 ✓ tests/interactive/agent-switch.test.ts (5 tests) 11ms
 ✓ tests/domains/agent-models.test.ts (1 test) 48ms
 ✓ tests/prompts/provider-neutrality.test.ts (9 tests) 20ms
 ✓ tests/init/prompt.test.ts (4 tests) 1ms
 ✓ tests/skills/agent-packaging.test.ts (1 test) 8ms
 ✓ tests/artifact-viewer/render.test.ts (3 tests) 13ms
 ✓ tests/cli/tasks/subcommand.test.ts (3 tests) 4ms
 ✓ tests/helpers/extension-api-mock.test.ts (1 test) 1ms
 ✓ tests/cli/no-domain-guard.test.ts (3 tests) 2ms
 ✓ tests/cli/memory/main-dispatch.test.ts (1 test) 1051ms
   ✓ cli/main memory dispatch > routes top-level memory commands without interactive fallthrough  1051ms
 ✓ tests/scripts/check-new-suppressions.test.ts (19 tests) 11128ms
   ✓ script requires base registration for a triple-slash TypeScript directive  682ms
   ✓ script requires base registration for a JSDoc TypeScript directive  588ms
   ✓ script requires base registration for a block TypeScript directive  665ms
   ✓ script requires base registration for a JSX Biome directive  675ms
   ✓ script requires base registration for a block ESLint directive  624ms
   ✓ script rejects a same-change exception because the base registry owns authorization  338ms
   ✓ script accepts an added directive only when registered in the base revision  408ms
   ✓ script rejects a changed target despite a base registered directive  454ms
   ✓ script requires base registration for a line @ts-nocheck directive  658ms
   ✓ script requires base registration for a triple-slash @ts-nocheck directive  744ms
   ✓ script requires base registration for a block @ts-nocheck directive  663ms
   ✓ script requires base registration for a file-level Biome directive  705ms
   ✓ script requires base registration for a multi-line block ending in @ts-ignore directive  528ms
   ✓ script requires base registration for a JSDoc block ending in @ts-expect-error directive  498ms
   ✓ script requires base registration for a JSONC Biome directive  728ms
   ✓ script requires base registration for a JSON Biome directive  621ms
   ✓ script ignores a directive-shaped string in a JSON file  441ms
   ✓ script accepts an existing directive moved by a pure rename  591ms
   ✓ script rejects a directive added to a renamed file  516ms
 ✓ tests/cli/tasks/cancelled-status.test.ts (1 test) 5251ms
   ✓ a Cancelled task through the CLI > persists, keeps its dependent blocked, and lets its plan archive  5251ms
 ✓ tests/orchestration/quality-review-run.test.ts (158 tests) 115143ms
   ✓ quality review durable lifecycle > uses the configured workspace removal timeout on a stalled remover  1174ms
   ✓ quality review durable lifecycle > runs host checks in the snapshot, persists output and blocks a failed check  1024ms
   ✓ quality review durable lifecycle > runs base-owned check argv even when the reviewed config rewrites it  1211ms
   ✓ quality review durable lifecycle > excludes its own plan summary from the captured change  1084ms
   ✓ quality review durable lifecycle > blocks a ready claim when the host observed an unbound audit  1169ms
   ✓ quality review durable lifecycle > never reports ready with a host human item from checks not configured  1475ms
   ✓ quality review durable lifecycle > never reports ready with a host human item from gate-owned change  1677ms
   ✓ quality review durable lifecycle > never reports ready with a host human item from unbound audit  1276ms
   ✓ quality review durable lifecycle > never reports ready with a host human item from unobserved audit  858ms
   ✓ quality review durable lifecycle > never reports ready with a host human item from failed-to-run audit  754ms
   ✓ quality review durable lifecycle > never reports ready with a host human item from missing gate evidence  902ms
   ✓ quality review durable lifecycle > never reports ready with a host human item from check preparation failure  1017ms
   ✓ quality review durable lifecycle > never reports ready with a host human item from analysis preparation failure  870ms
   ✓ quality review durable lifecycle > reports a bound failing audit under gates and findings without a human item  805ms
   ✓ quality review durable lifecycle > reports each finding from a bound failing audit envelope  1068ms
   ✓ quality review durable lifecycle > uses one prefix for real unbound validator state  933ms
   ✓ quality review durable lifecycle > uses one prefix for real unconsented validator state  1254ms
   ✓ quality review durable lifecycle > uses one prefix for real missing validator state  719ms
   ✓ quality review durable lifecycle > does not call an unrelated config edit gate-owned  1063ms
   ✓ quality review durable lifecycle > ignores a gate-owned change made only on the advanced base branch  1276ms
   ✓ quality review durable lifecycle > keeps a completed not-ready verdict when workspace removal fails  974ms
   ✓ quality review durable lifecycle > persists the terminal report and status before a stalled remover  826ms
   ✓ quality review durable lifecycle > finalizes with a named integrity failure when a reviewer store write never settles  677ms
   ✓ quality review durable lifecycle > waits several seconds by default for an aborting QM tool to settle  1188ms
   ✓ quality review durable lifecycle > uses the configured QM settle grace  697ms
   ✓ quality review durable lifecycle > reports empty checks and gate-owned changes as human decisions  566ms
   ✓ quality review durable lifecycle > includes passing host check details even when the model omits them  759ms
   ✓ quality review durable lifecycle > reports reviewer models from run-owned evidence  479ms
   ✓ quality review durable lifecycle > calibrates Findings shape numbered  559ms
   ✓ quality review durable lifecycle > calibrates Findings shape star  539ms
   ✓ quality review durable lifecycle > calibrates Findings shape plus  508ms
   ✓ quality review durable lifecycle > calibrates Findings shape prose  593ms
   ✓ quality review durable lifecycle > calibrates Findings shape before bullet  574ms
   ✓ quality review durable lifecycle > calibrates Findings shape after dismissal  588ms
   ✓ quality review durable lifecycle > calibrates Findings shape after blank line  687ms
   ✓ quality review durable lifecycle > calibrates Findings shape ID-less bullet  741ms
   ✓ quality review durable lifecycle > calibrates Findings shape dismissal  727ms
   ✓ quality review durable lifecycle > calibrates Findings shape sub-finding  611ms
   ✓ quality review durable lifecycle > calibrates Findings shape still open  651ms
   ✓ quality review durable lifecycle > calibrates Findings shape not resolved  804ms
   ✓ quality review durable lifecycle > calibrates Findings shape closed prematurely  753ms
   ✓ quality review durable lifecycle > calibrates Findings shape blank line  757ms
   ✓ quality review durable lifecycle > calibrates Findings shape subheading  659ms
   ✓ quality review durable lifecycle > calibrates Findings shape extra heading  885ms
   ✓ quality review durable lifecycle > calibrates Findings shape repeated Findings  660ms
   ✓ quality review durable lifecycle > calibrates Findings shape repeated Human decisions  721ms
   ✓ quality review durable lifecycle > calibrates Findings shape Checks line ending in Findings  830ms
   ✓ quality review durable lifecycle > calibrates Findings shape Gates Findings subheading  959ms
   ✓ quality review durable lifecycle > calibrates Findings shape Checks Human decisions subheading  833ms
   ✓ quality review durable lifecycle > calibrates Findings shape empty  910ms
   ✓ quality review durable lifecycle > calibrates Findings shape plain sentinel  625ms
   ✓ quality review durable lifecycle > calibrates Findings shape case-insensitive bullet sentinel  435ms
   ✓ quality review durable lifecycle > calibrates out-of-range finding  652ms
   ✓ quality review durable lifecycle > calibrates out-of-range dismissal  491ms
   ✓ quality review durable lifecycle > calibrates in-range dismissal  984ms
   ✓ quality review durable lifecycle > calibrates dismissal with a trailing paragraph  1118ms
   ✓ quality review durable lifecycle > reaches ready with an unset reviewer model and records the model only  1312ms
   ✓ quality review durable lifecycle > reaches ready with a reviewer model on the QM's provider and records the model only  905ms
   ✓ quality review durable lifecycle > reaches ready with a reviewer model on any other provider and records the model only  1076ms
   ✓ quality review durable lifecycle > reaches ready with a configured reviewer model the session did not use and records the model only  1101ms
   ✓ quality review durable lifecycle > calibrates renumbered performance findings in the final report  1126ms
   ✓ quality review durable lifecycle > calibrates raised performance findings in the final report  1120ms
   ✓ quality review durable lifecycle > calibrates P0 performance findings in the final report  1004ms
   ✓ quality review durable lifecycle > calibrates observation-only P2 performance findings in the final report  1089ms
   ✓ quality review durable lifecycle > calibrates unindexed performance findings in the final report  932ms
   ✓ quality review durable lifecycle > calibrates omitted performance findings in the final report  905ms
   ✓ quality review durable lifecycle > calibrates irregular bullet performance findings in the final report  775ms
   ✓ quality review durable lifecycle > calibrates duplicate observation performance findings in the final report  830ms
   ✓ quality review durable lifecycle > caps unsupported performance P1 and blocks lens-only closure in the completed report  750ms
   ✓ quality review durable lifecycle > fails the configured suppression check for an unregistered directive  939ms
   ✓ quality review durable lifecycle > retains the private workspace while a timed-out reviewer is still live  701ms
   ✓ quality review durable lifecycle > does not substitute a reviewer artifact that settles after the failed assessment  1091ms
   ✓ quality review durable lifecycle > fails the assessment for missing reviewer evidence  849ms
   ✓ quality review durable lifecycle > fails the assessment for empty reviewer evidence  831ms
   ✓ quality review durable lifecycle > fails the assessment for duplicate reviewer evidence  852ms
   ✓ quality review durable lifecycle > fails the assessment for foreign reviewer evidence  739ms
   ✓ quality review durable lifecycle > fails a report returned while a panel child is still live  658ms
   ✓ quality review durable lifecycle > does not run host checks after a failed assessment  902ms
   ✓ quality review durable lifecycle > keeps visible findings when reviewer correlation fails after assessment  666ms
   ✓ quality review durable lifecycle > keeps actionable report sections in both the full report and plan summary  766ms
   ✓ quality review durable lifecycle > keeps a real finding in the plan summary after a Checks heading lookalike  596ms
   ✓ quality review durable lifecycle > keeps findings after an inline index marker in the report and plan summary  807ms
   ✓ quality review durable lifecycle > keeps a clean report ready with trailing whitespace on a defined heading  1214ms
   ✓ quality review durable lifecycle > keeps a duplicate defined heading at EOF and blocks ready with host checks  602ms
   ✓ quality review durable lifecycle > preserves CRLF duplicate and blocks ready with host checks  617ms
   ✓ quality review durable lifecycle > preserves empty title in report and blocks ready with host checks  779ms
   ✓ quality review durable lifecycle > preserves empty title after index and blocks ready with host checks  1017ms
   ✓ quality review durable lifecycle > preserves tab title and blocks ready with host checks  1448ms
   ✓ quality review durable lifecycle > preserves text after index and blocks ready with host checks  1399ms
   ✓ quality review durable lifecycle > preserves same-line index suffix and blocks ready with host checks  886ms
   ✓ quality review durable lifecycle > preserves index trailing whitespace and blocks ready with host checks  928ms
   ✓ quality review durable lifecycle > preserves unclosed index marker and blocks ready with host checks  988ms
   ✓ quality review durable lifecycle > preserves indented index suffix and blocks ready with host checks  799ms
   ✓ quality review durable lifecycle > keeps an empty Reason's same-line suffix and host checks  709ms
   ✓ quality review durable lifecycle > keeps an empty Reason's trailing whitespace and host checks  835ms
   ✓ quality review durable lifecycle > keeps an empty Reason's unclosed marker and host checks  711ms
   ✓ quality review durable lifecycle > keeps a clean LF report ready  769ms
   ✓ quality review durable lifecycle > keeps a clean CRLF report ready  811ms
   ✓ quality review durable lifecycle > keeps a clean CR report ready  714ms
   ✓ quality review durable lifecycle > carries an omitted reviewer finding through a non-breaking-space Findings heading  776ms
   ✓ quality review durable lifecycle > does not accept a ready verdict with reported findings  717ms
   ✓ quality review durable lifecycle > launches assessment from a private snapshot containing untracked work  763ms
   ✓ quality review durable lifecycle > preserves staged deletion and source index while building review materials  694ms
   ✓ quality review durable lifecycle > captures a same-size edit with a stale Git stat cache without refreshing the source index  767ms
   ✓ quality review durable lifecycle > persists a preparation exit and removes its private workspace  820ms
   ✓ quality review durable lifecycle > persists a preparation timeout and removes its private workspace  501ms
   ✓ quality review durable lifecycle > cancels promptly during prepare  348ms
   ✓ quality review durable lifecycle > cancels promptly during checks  347ms
   ✓ quality review durable lifecycle > cancels promptly during assessment  3323ms
   ✓ quality review durable lifecycle > ends a stalled assessment at its configured deadline and retains live child workspace  3500ms
   ✓ quality review durable lifecycle > retains the workspace when the QM itself ignores abort without a panel child  3300ms
   ✓ quality review durable lifecycle > records a grandchild check timeout in checks.md  485ms
   ✓ quality review durable lifecycle > preserves an unindexed report when host checks are configured  354ms
   ✓ quality review durable lifecycle > isolates concurrent run IDs, reports and plan summaries  310ms
   ✓ quality review durable lifecycle > makes a new pretest script a human decision item  427ms
   ✓ quality review durable lifecycle > uses the base gateOwnedPaths when the reviewed change edits a runner  359ms
   ✓ quality review durable lifecycle > flags a removed Biome rule from this repository's base-owned gate paths  351ms
   ✓ quality review durable lifecycle > lists an executable package script change once even when package.json is gate-owned  375ms
   ✓ quality review durable lifecycle > does not let a later check rewrite change sealed review evidence  353ms
   ✓ quality review durable lifecycle > records successful analysis preparation when the assessment fails  319ms
   ✓ quality review durable lifecycle > records earlier analysis preparation successes before a later failure  343ms
   ✓ quality review durable lifecycle > keeps an observed failing audit after analysis preparation fails (indexed: false)  323ms
   ✓ quality review durable lifecycle > removes a base runtime whose setup settles after deadline  305ms
   ✓ quality review durable lifecycle > retains the deadline reason when a reviewer write is abandoned  307ms
   ✓ quality review durable lifecycle > uses the bundled quality manager when a user package overrides coding  306ms
   ✓ quality review durable lifecycle > loads base project domains without importing reviewed domains  843ms
   ✓ quality review durable lifecycle > fails the assessment when the QM final message ends in a provider error  317ms
   ✓ quality review durable lifecycle > writes no legacy review-round file on a completed or failed QM run  565ms

 Test Files  293 passed (293)
      Tests  4198 passed (4198)
   Start at  20:09:16
   Duration  118.03s (transform 7.26s, setup 1.73s, collect 57.39s, tests 567.28s, environment 24ms, prepare 10.22s)


```

## lint

- argv: ["bun","run","lint"]
- exit code: 0
- duration: 2159 ms
- timed out: false

```text
$ biome check .
Checked 653 files in 308ms. No fixes applied.

```

## typecheck

- argv: ["bun","run","typecheck"]
- exit code: 0
- duration: 6762 ms
- timed out: false

```text
$ tsc --noEmit

```

## reachability

- argv: ["bun","run","check:reachability"]
- exit code: 0
- duration: 883 ms
- timed out: false

```text
$ bun scripts/check-reachability.ts
reachability: 214/214 runtime lib modules reached; 13 type-only lib modules exempt; 0 staged

```
